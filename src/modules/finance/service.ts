import type { Prisma } from "@/generated/prisma/client";
import { assertFinance, canFinance } from "@/modules/finance/access";
import type { InvoiceStatus } from "@/generated/prisma/enums";
import { formatEuroFromCents, startOfBerlinDate, todayCalendarDate } from "@/lib/dates";
import { allowedAccessLevels, invoiceDto, type DocumentInvoice } from "@/modules/documents/service";
import { recordAudit } from "@/server/audit/audit";
import { notFound, validationFailed } from "@/server/errors";
import { lockUntilCommit } from "@/server/db/tenant";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import { entryNumber } from "./ledger-format";

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
  assertFinance(ctx, "finance:read");
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
    canManage: canFinance(ctx, "finance:manage"),
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
  assertFinance(ctx, "finance:manage");
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
    // Gleiche Sperre wie „Ins Kassenbuch“: Wird die Rechnung gerade gebucht, wartet „wieder offen“ und scheitert dann klar.
    await lockUntilCommit(tx, ctx.clubId, `invoice:${id}`);
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

export type InvoiceFilter = "offen" | "bezahlt" | "alle";

export interface InvoiceListItem extends OpenInvoice {
  createdAt: Date;
  /** Geltende Buchung im Kassenbuch, die diese Rechnung bezahlt („im Kassenbuch Nr. 2026-0042“). */
  booking: { id: string; label: string } | null;
}

/** Geltende (nicht stornierte) Buchungen zu Rechnungen: Rechnung → Buchung. */
async function invoiceBookings(
  ctx: TenantContext,
  invoiceIds: string[],
): Promise<Map<string, { id: string; label: string }>> {
  if (invoiceIds.length === 0) return new Map();
  const lines = await ctx.db.ledgerLine.findMany({
    where: {
      invoiceId: { in: invoiceIds },
      entry: { kind: "STANDARD", reversedBy: { is: null } },
    },
    select: { invoiceId: true, entry: { select: { id: true, year: true, number: true } } },
  });
  return new Map(
    lines.map((line) => [
      line.invoiceId!,
      { id: line.entry.id, label: entryNumber(line.entry.year, line.entry.number) },
    ]),
  );
}

/**
 * Bezahlte Rechnungen, die noch ins Kassenbuch gehören (Übersicht „Das steht an“): bezahlt ab `since` (erster offener Tag,
 * Kalendertag) – ohne Zahlungsdatum („beim Hochladen schon bezahlt“) zählt das Rechnungsdatum. Dieselbe Regel wie der Knopf
 * „Ins Kassenbuch“ auf der Rechnungsseite.
 */
export async function unbookedPaidInvoiceCount(ctx: TenantContext, since: Date): Promise<number> {
  assertFinance(ctx, "finance:read");
  const sinceInstant = startOfBerlinDate(
    since.getUTCFullYear(),
    since.getUTCMonth() + 1,
    since.getUTCDate(),
  );
  return ctx.db.invoice.count({
    where: {
      status: "PAID",
      OR: [{ paidAt: { gte: sinceInstant } }, { paidAt: null, invoiceDate: { gte: since } }],
      document: { is: { deletedAt: null, archivedAt: null } },
      ledgerLines: { none: { entry: { kind: "STANDARD", reversedBy: { is: null } } } },
    },
  });
}

/** Rechnungen für „Finanzen › Rechnungen“: offen (fällige zuerst), bezahlt (zuletzt bezahlte zuerst) oder alle. */
export async function listInvoices(
  ctx: TenantContext,
  query: { stand?: InvoiceFilter; q?: string; page?: number; pageSize?: number } = {},
): Promise<{
  items: InvoiceListItem[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  openTotalCents: number;
  /** Überfällige offene Rechnungen insgesamt (nicht nur auf dieser Seite). */
  overdueCount: number;
  canManage: boolean;
}> {
  assertFinance(ctx, "finance:read");
  const stand = query.stand ?? "offen";
  const pageSize = Math.min(Math.max(query.pageSize ?? 20, 1), 100);
  const q = query.q?.trim();
  const where: Prisma.InvoiceWhereInput = {
    document: {
      is: {
        deletedAt: null,
        archivedAt: null,
        ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
      },
    },
    ...(stand === "offen" ? { status: "OPEN" } : stand === "bezahlt" ? { status: "PAID" } : {}),
  };
  const [total, open, overdueCount] = await Promise.all([
    ctx.db.invoice.count({ where }),
    ctx.db.invoice.aggregate({ where: openWhere, _sum: { amountCents: true } }),
    ctx.db.invoice.count({ where: { AND: [openWhere, { dueDate: { lt: todayCalendarDate() } }] } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(query.page ?? 1, 1), pageCount);
  const rows = await ctx.db.invoice.findMany({
    where,
    include: { document: { select: { id: true, name: true, access: true } } },
    orderBy:
      stand === "offen"
        ? [{ dueDate: { sort: "asc", nulls: "last" } }, { invoiceDate: "asc" }, { id: "asc" }]
        : [{ paidAt: { sort: "desc", nulls: "last" } }, { invoiceDate: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const today = todayCalendarDate();
  const visible = allowedAccessLevels(ctx);
  const bookings = await invoiceBookings(
    ctx,
    rows.map((row) => row.id),
  );
  return {
    items: rows.map((row) => ({
      ...invoiceDto(row, today),
      documentId: row.document.id,
      name: row.document.name,
      canOpen: visible.includes(row.document.access),
      createdAt: row.createdAt,
      booking: bookings.get(row.id) ?? null,
    })),
    total,
    page,
    pageCount,
    pageSize,
    openTotalCents: open._sum.amountCents ?? 0,
    overdueCount,
    canManage: canFinance(ctx, "finance:manage"),
  };
}
