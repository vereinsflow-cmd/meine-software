import type { Prisma } from "@/generated/prisma/client";
import type { InvoiceStatus } from "@/generated/prisma/enums";
import { formatEuroFromCents, todayCalendarDate } from "@/lib/dates";
import { allowedAccessLevels, invoiceDto, type DocumentInvoice } from "@/modules/documents/service";
import { recordAudit } from "@/server/audit/audit";
import { notFound, validationFailed } from "@/server/errors";
import { assertCan, can } from "@/server/permissions/policy";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";

/**
 * Finanzen – erster Baustein: Rechnungen, die der Verein bezahlen muss, und die offenen Zahlungen.
 *
 * Wer sieht was: Offene Zahlungen sieht, wer `finance:read` hat (Standard: Vereinsadministrator und Vorstand); als bezahlt
 * markieren darf, wer `finance:manage` hat. Beträge zählen unabhängig von der Zugriffsstufe des Belegs – den Beleg
 * öffnen kann trotzdem nur, wer das Dokument sehen darf. Rechnungen gelöschter oder archivierter Dokumente zählen nicht.
 */
const openWhere: Prisma.InvoiceWhereInput = {
  status: "OPEN",
  document: { is: { deletedAt: null, archivedAt: null } },
};

export interface OpenInvoice extends DocumentInvoice {
  documentId: string;
  name: string;
  /** Darf ich den Beleg öffnen (Zugriffsstufe des Dokuments)? */
  canOpen: boolean;
}

export interface OpenPayments {
  totalCents: number;
  count: number;
  overdueCount: number;
  /** Die nächsten offenen Rechnungen – überfällige und bald fällige zuerst, ohne Fälligkeit zuletzt. */
  items: OpenInvoice[];
  canManage: boolean;
}

export async function getOpenPayments(
  ctx: TenantContext,
  { limit = 5 }: { limit?: number } = {},
): Promise<OpenPayments> {
  assertCan(ctx, "finance:read");
  const today = todayCalendarDate();
  const [sum, overdueCount, rows] = await Promise.all([
    ctx.db.invoice.aggregate({
      where: openWhere,
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
    ctx.db.invoice.count({ where: { AND: [openWhere, { dueDate: { lt: today } }] } }),
    ctx.db.invoice.findMany({
      where: openWhere,
      include: { document: { select: { id: true, name: true, access: true } } },
      orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { invoiceDate: "asc" }, { id: "asc" }],
      take: limit,
    }),
  ]);
  const visible = allowedAccessLevels(ctx);
  return {
    totalCents: sum._sum.amountCents ?? 0,
    count: sum._count._all,
    overdueCount,
    canManage: can(ctx, "finance:manage"),
    items: rows.map((row) => ({
      ...invoiceDto(row, today),
      documentId: row.document.id,
      name: row.document.name,
      canOpen: visible.includes(row.document.access),
    })),
  };
}

/** „Als bezahlt markieren“ bzw. „wieder offen“ (z. B. über „Rückgängig“). */
export async function setInvoiceStatus(
  ctx: TenantContext,
  id: string,
  status: InvoiceStatus,
): Promise<void> {
  assertCan(ctx, "finance:manage");
  const invoice = await ctx.db.invoice.findFirst({
    where: { id, document: { is: { deletedAt: null } } },
    include: { document: { select: { name: true } } },
  });
  if (!invoice) throw notFound("Die Rechnung");
  if (invoice.status === status) return; // doppelt geklickt oder schon erledigt – nichts zu tun
  if (status === "OPEN" && invoice.amountCents === null)
    throw validationFailed(
      { amount: ["Bitte gib zuerst den Betrag an (Dokument bearbeiten)."] },
      "Ohne Betrag lässt sich die Rechnung nicht wieder öffnen.",
    );

  await ctx.db.$transaction(async (tx) => {
    await tx.invoice.update({
      where: { id },
      data:
        status === "PAID"
          ? { status, paidAt: new Date(), paidById: ctx.userId }
          : { status, paidAt: null, paidById: null },
    });
    const amount =
      invoice.amountCents === null ? "" : ` (${formatEuroFromCents(invoice.amountCents)})`;
    await recordAudit(tx, auditActor(ctx), {
      action: status === "PAID" ? "finance.invoice_paid" : "finance.invoice_reopened",
      entityType: "Invoice",
      entityId: id,
      summary:
        status === "PAID"
          ? `Rechnung „${invoice.document.name}“${amount} als bezahlt markiert`
          : `Rechnung „${invoice.document.name}“${amount} wieder als offen markiert`,
    });
  });
}
