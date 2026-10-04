import { parseInput } from "@/server/action";
import { recordAudit } from "@/server/audit/audit";
import { conflict, notFound } from "@/server/errors";
import { openFile } from "@/server/storage/files";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import { uploadDocument } from "@/modules/documents/service";
import { assertFinance } from "./access";
import { entryNumber } from "./ledger-format";
import { attachmentIdSchema, receiptNoteSchema } from "./ledger-schemas";

/**
 * Belege im Kassenbuch: Dateien (Quittung, Rechnung, Kontoauszug) oder ein Eigenbeleg als Text hängen an einer Buchung.
 * Angehängte Dateien bewahrt die Datenbank bis zum Ende der Frist auf (8 Jahre nach dem Buchungsjahr, Trigger
 * `ledger_attachment_retention` und `document_retention_guard`). Entfernen geht nur, solange der Zeitraum offen ist.
 */

/** Kategorie, unter der hochgeladene Belege in „Dokumente“ stehen (sichtbar nur mit Finanzrecht). */
export const RECEIPT_CATEGORY = "Belege";

async function loadEntry(ctx: TenantContext, entryId: string) {
  const entry = await ctx.db.ledgerEntry.findFirst({
    where: { id: entryId },
    select: { id: true, year: true, number: true, kind: true },
  });
  if (!entry) throw notFound("Die Buchung");
  return entry;
}

/** Datei hochladen und an die Buchung hängen (eine Transaktion: ohne Anhang kein Dokument). */
export async function attachReceiptFile(
  ctx: TenantContext,
  input: { entryId: string; fileName: string; bytes: Uint8Array },
): Promise<{ id: string }> {
  assertFinance(ctx, "finance:manage");
  const entry = await loadEntry(ctx, input.entryId);
  const label = entryNumber(entry.year, entry.number);
  return uploadDocument(
    ctx,
    { fileName: input.fileName, bytes: input.bytes, access: "FINANCE", category: RECEIPT_CATEGORY },
    {
      receipt: async (tx, document) => {
        await tx.ledgerAttachment.create({
          data: {
            clubId: ctx.clubId,
            entryId: entry.id,
            documentId: document.id,
            attachedById: ctx.userId,
          },
        });
        await recordAudit(tx, auditActor(ctx), {
          action: "finance.receipt_attached",
          entityType: "LedgerEntry",
          entityId: entry.id,
          summary: `Beleg „${document.name}“ an Buchung ${label} angehängt`,
        });
      },
    },
  );
}

/** Eigenbeleg: Es gibt keinen Beleg (Parkautomat, verloren) – kurz festhalten, was bezahlt wurde und warum ohne Beleg. */
export async function attachReceiptNote(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(receiptNoteSchema, input);
  const entry = await loadEntry(ctx, data.entryId);
  const label = entryNumber(entry.year, entry.number);
  await ctx.db.$transaction(async (tx) => {
    const existing = await tx.ledgerAttachment.findFirst({
      where: { entryId: entry.id, documentId: null },
      select: { id: true },
    });
    if (existing) throw conflict("Diese Buchung hat schon einen Eigenbeleg.");
    await tx.ledgerAttachment.create({
      data: { clubId: ctx.clubId, entryId: entry.id, note: data.note, attachedById: ctx.userId },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.receipt_attached",
      entityType: "LedgerEntry",
      entityId: entry.id,
      summary: `Eigenbeleg zu Buchung ${label}: ${data.note}`,
    });
  });
}

/**
 * Beleg herunterladen. Wer die Finanzen ansehen darf, sieht alle Belege des Kassenbuchs – unabhängig von der Zugriffsstufe
 * des Dokuments (eine Rechnung „Nur Verwaltung“ ist trotzdem Beleg der Buchung). Fremde Belege ergeben 404.
 */
export async function openReceipt(ctx: TenantContext, attachmentId: string) {
  assertFinance(ctx, "finance:read");
  const attachment = await ctx.db.ledgerAttachment.findFirst({
    where: { id: attachmentId, document: { is: { deletedAt: null } } },
    include: { document: { select: { name: true, mimeType: true, storageKey: true } } },
  });
  if (!attachment?.document) throw notFound("Der Beleg");
  try {
    return {
      document: attachment.document,
      ...(await openFile(ctx.clubId, attachment.document.storageKey)),
    };
  } catch {
    throw notFound("Die Datei");
  }
}

/**
 * Beleg entfernen (falsche Datei erwischt) – nur im offenen Zeitraum, das prüft die Datenbank. Eine eigens hochgeladene
 * Belegdatei, die sonst nirgends hängt, wandert in den Papierkorb; Rechnungen und andere Dokumente bleiben, wo sie sind.
 * Die Rechnung, die die Buchung bezahlt, bleibt angehängt (sonst fehlte der Beleg, obwohl die Rechnung als gebucht gilt).
 */
export async function removeAttachment(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const { id } = parseInput(attachmentIdSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const attachment = await tx.ledgerAttachment.findFirst({
      where: { id },
      include: {
        entry: { select: { id: true, year: true, number: true } },
        document: {
          select: {
            id: true,
            name: true,
            access: true,
            category: true,
            invoice: { select: { id: true } },
          },
        },
      },
    });
    if (!attachment) throw notFound("Der Beleg");
    if (
      attachment.document?.invoice &&
      (await tx.ledgerLine.count({
        where: { entryId: attachment.entry.id, invoiceId: attachment.document.invoice.id },
      })) > 0
    )
      throw conflict(
        "Das ist die Rechnung, die diese Buchung bezahlt – sie bleibt angehängt. Falsch gebucht? Dann storniere die Buchung.",
      );
    await tx.ledgerAttachment.delete({ where: { id } });
    const document = attachment.document;
    if (
      document &&
      document.access === "FINANCE" &&
      document.category === RECEIPT_CATEGORY &&
      !document.invoice
    ) {
      const elsewhere = await tx.ledgerAttachment.count({ where: { documentId: document.id } });
      if (elsewhere === 0)
        await tx.document.update({ where: { id: document.id }, data: { deletedAt: new Date() } });
    }
    const label = entryNumber(attachment.entry.year, attachment.entry.number);
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.receipt_removed",
      entityType: "LedgerEntry",
      entityId: attachment.entry.id,
      summary: document
        ? `Beleg „${document.name}“ von Buchung ${label} entfernt`
        : `Eigenbeleg von Buchung ${label} entfernt`,
    });
  });
}
