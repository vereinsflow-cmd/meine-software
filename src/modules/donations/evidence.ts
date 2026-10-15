import { formatEuroFromCents } from "@/lib/dates";
import { parseInput } from "@/server/action";
import { recordAudit } from "@/server/audit/audit";
import type { TenantTx } from "@/server/db/tenant";
import { conflict, notFound } from "@/server/errors";
import { openFile } from "@/server/storage/files";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import { uploadDocument } from "@/modules/documents/service";
import { assertFinance } from "@/modules/finance/access";
import { DONATION_KIND_LABEL } from "./format";
import { donationAttachmentIdSchema, donationNoteSchema } from "./schemas";

/**
 * Nachweise einer Spende (vor allem Sach- und Aufwandsspenden): Rechnung oder Gutachten zur Bewertung, Abrechnung und
 * Verzichtserklärung, Beschluss – als Datei (Dokument „Nur Finanzen“) oder kurzer Vermerk. Die Datenbank bewahrt Dateien
 * 10 Jahre auf (Trigger `ledger_attachment_retention` über `document_finance_retain_until`); hängt dasselbe Dokument
 * auch an einer Buchung, gilt die längere Frist. Belege einer Geldspende hängen weiter an ihrer Buchung.
 */

/** Kategorie, unter der hochgeladene Nachweise in „Dokumente“ stehen (sichtbar nur mit Finanzrecht). */
export const DONATION_EVIDENCE_CATEGORY = "Spendennachweise";

async function loadDonation(ctx: TenantContext, donationId: string) {
  const donation = await ctx.db.donation.findFirst({
    where: { id: donationId },
    select: { id: true, kind: true, amountCents: true, voidedAt: true },
  });
  if (!donation) throw notFound("Die Spende");
  if (donation.voidedAt)
    throw conflict("Diese Spende ist storniert – Nachweise lassen sich nicht mehr anhängen.");
  return donation;
}

const what = (donation: { kind: keyof typeof DONATION_KIND_LABEL; amountCents: number }) =>
  `${DONATION_KIND_LABEL[donation.kind]} (${formatEuroFromCents(donation.amountCents)})`;

/** Datei hochladen und an die Spende hängen (eine Transaktion: ohne Anhang kein Dokument). Liefert das Dokument. */
export async function attachDonationFile(
  ctx: TenantContext,
  input: { donationId: string; fileName: string; bytes: Uint8Array },
): Promise<{ id: string }> {
  assertFinance(ctx, "finance:manage");
  const donation = await loadDonation(ctx, input.donationId);
  return uploadDocument(
    ctx,
    {
      fileName: input.fileName,
      bytes: input.bytes,
      access: "FINANCE",
      category: DONATION_EVIDENCE_CATEGORY,
    },
    {
      receipt: async (tx, document) => {
        await tx.donationAttachment.create({
          data: {
            clubId: ctx.clubId,
            donationId: donation.id,
            documentId: document.id,
            attachedById: ctx.userId,
          },
        });
        await recordAudit(tx, auditActor(ctx), {
          action: "finance.donation_evidence_attached",
          entityType: "Donation",
          entityId: donation.id,
          summary: `Nachweis „${document.name}“ an ${what(donation)} angehängt`,
        });
      },
    },
  );
}

/** Vermerk statt Datei („Fahrtenbuch liegt beim Kassenwart“). */
export async function attachDonationNote(
  ctx: TenantContext,
  input: unknown,
): Promise<{ id: string }> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(donationNoteSchema, input);
  const donation = await loadDonation(ctx, data.donationId);
  return ctx.db.$transaction(async (tx) => {
    const created = await tx.donationAttachment.create({
      data: {
        clubId: ctx.clubId,
        donationId: donation.id,
        note: data.note,
        attachedById: ctx.userId,
      },
      select: { id: true },
    });
    // Der Vermerk selbst bleibt aus dem Protokoll (kann Namen enthalten; finance.* bleibt 10 Jahre).
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.donation_evidence_attached",
      entityType: "Donation",
      entityId: donation.id,
      summary: `Vermerk als Nachweis an ${what(donation)} angehängt`,
    });
    return created;
  });
}

/**
 * Nachweis entfernen (in der Transaktion des Aufrufers). Eine eigens hochgeladene Nachweisdatei, die sonst nirgends hängt,
 * wandert in den Papierkorb; andere Dokumente bleiben, wo sie sind.
 */
export async function removeDonationEvidenceInTx(
  tx: TenantTx,
  ctx: TenantContext,
  attachmentId: string,
  options: { audit: boolean },
): Promise<void> {
  const attachment = await tx.donationAttachment.findFirst({
    where: { id: attachmentId },
    select: {
      id: true,
      donation: { select: { id: true, kind: true, amountCents: true } },
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
  if (!attachment) throw notFound("Der Nachweis");
  await tx.donationAttachment.delete({ where: { id: attachment.id } });
  const document = attachment.document;
  if (
    document &&
    document.access === "FINANCE" &&
    document.category === DONATION_EVIDENCE_CATEGORY &&
    !document.invoice
  ) {
    const [donations, entries] = await Promise.all([
      tx.donationAttachment.count({ where: { documentId: document.id } }),
      tx.ledgerAttachment.count({ where: { documentId: document.id } }),
    ]);
    if (donations + entries === 0)
      await tx.document.update({ where: { id: document.id }, data: { deletedAt: new Date() } });
  }
  if (options.audit)
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.donation_evidence_removed",
      entityType: "Donation",
      entityId: attachment.donation.id,
      summary: document
        ? `Nachweis „${document.name}“ von ${what(attachment.donation)} entfernt`
        : `Vermerk von ${what(attachment.donation)} entfernt`,
    });
}

export async function removeDonationAttachment(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const { id } = parseInput(donationAttachmentIdSchema, input);
  await ctx.db.$transaction((tx) => removeDonationEvidenceInTx(tx, ctx, id, { audit: true }));
}

export interface DonationEvidenceDto {
  id: string;
  documentId: string | null;
  name: string | null;
  note: string | null;
  attachedAt: Date;
}

/** Nachweise einer Spende (älteste zuerst). */
export async function listDonationEvidence(
  ctx: TenantContext,
  donationId: string,
): Promise<DonationEvidenceDto[]> {
  assertFinance(ctx, "finance:read");
  const rows = await ctx.db.donationAttachment.findMany({
    where: { donationId },
    orderBy: { attachedAt: "asc" },
    select: {
      id: true,
      note: true,
      attachedAt: true,
      document: { select: { id: true, name: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    documentId: row.document?.id ?? null,
    name: row.document?.name ?? null,
    note: row.note,
    attachedAt: row.attachedAt,
  }));
}

/**
 * Nachweis herunterladen. Wer die Finanzen ansehen darf, sieht alle Nachweise – unabhängig von der Zugriffsstufe des
 * Dokuments. Fremde Nachweise ergeben 404.
 */
export async function openDonationEvidence(ctx: TenantContext, attachmentId: string) {
  assertFinance(ctx, "finance:read");
  const attachment = await ctx.db.donationAttachment.findFirst({
    where: { id: attachmentId, document: { is: { deletedAt: null } } },
    select: { document: { select: { name: true, mimeType: true, storageKey: true } } },
  });
  if (!attachment?.document) throw notFound("Der Nachweis");
  try {
    return {
      document: attachment.document,
      ...(await openFile(ctx.clubId, attachment.document.storageKey)),
    };
  } catch {
    throw notFound("Die Datei");
  }
}
