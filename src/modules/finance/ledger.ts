import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type {
  CounterKind,
  FinanceAccountKind,
  LedgerEntryKind,
  Sphere,
} from "@/generated/prisma/enums";
import {
  formatCalendarDate,
  formatEuroFromCents,
  parseCalendarDate,
  todayCalendarDate,
} from "@/lib/dates";
import { parseEuroToCents, parseSignedEuroToCents } from "@/lib/money";
import { parseInput } from "@/server/action";
import { recordAudit } from "@/server/audit/audit";
import { lockUntilCommit, type TenantTx } from "@/server/db/tenant";
import { env } from "@/server/env";
import { badRequest, conflict, notFound, validationFailed } from "@/server/errors";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import { assertFinance, canFinance } from "./access";
import {
  DEFAULT_CATEGORIES,
  HIDDEN_SYSTEM_KEYS,
  type SystemCategoryKey,
} from "./default-categories";
import { entryNumber } from "./ledger-format";
import {
  entrySchema,
  ledgerSetupSchema,
  openingSchema,
  parseTarget,
  reverseSchema,
  transferSchema,
  type EntryData,
} from "./ledger-schemas";

/**
 * Kassenbuch: Konten, Kategorien, Buchungen, Storno, Umbuchung, Kontostände und Jahreszahlen.
 *
 * Grundregeln (docs/adr/0010-finanzen-kassenbuch.md): Buchungen werden nie geändert, sondern storniert; die Datenbank sichert
 * das unabhängig von diesem Code ab (Trigger der Migration `finance_ledger`). Beträge sind ganze Cent mit Vorzeichen
 * (+ Einnahme, − Ausgabe). Lesen braucht `finance:read`, Buchen `finance:manage` – beides nur vereinsweit.
 */

export const LONG_TX = { timeout: 30_000 } as const;

// ---------------------------------------------------------------------------------------------
// Nummernkreise
// ---------------------------------------------------------------------------------------------

/**
 * Reserviert `count` fortlaufende Nummern eines Nummernkreises. Die Zeile des Zählers bleibt bis zum Ende der Transaktion
 * gesperrt – gleichzeitige Buchungen warten, ein Abbruch hinterlässt keine Lücke.
 */
export async function nextNumbers(
  tx: TenantTx,
  clubId: string,
  kind: CounterKind,
  year: number,
  count = 1,
): Promise<number[]> {
  const counter = await tx.financeCounter.upsert({
    where: { clubId_kind_year: { clubId, kind, year } },
    create: { clubId, kind, year, lastValue: count },
    update: { lastValue: { increment: count } },
  });
  return Array.from({ length: count }, (_, i) => counter.lastValue - count + 1 + i);
}

/**
 * Sperrt den Nummernkreis bis zum Ende der Transaktion, ohne eine Nummer zu verbrauchen. Für Abläufe, die erst danach
 * entscheiden, ob sie buchen (Kassensturz): So nehmen sie ihre Sperren in derselben Reihenfolge wie jede Buchung
 * (erst Nummernkreis, dann Barkasse) – sonst könnten sich beide gegenseitig blockieren.
 */
export async function lockNumbers(
  tx: TenantTx,
  clubId: string,
  kind: CounterKind,
  year: number,
): Promise<void> {
  await tx.financeCounter.upsert({
    where: { clubId_kind_year: { clubId, kind, year } },
    create: { clubId, kind, year, lastValue: 0 },
    update: { lastValue: { increment: 0 } },
  });
}

// ---------------------------------------------------------------------------------------------
// Einrichten
// ---------------------------------------------------------------------------------------------

export interface FinanceAccountDto {
  id: string;
  kind: FinanceAccountKind;
  name: string;
  bankName: string | null;
  isDefault: boolean;
  archived: boolean;
  balanceCents: number;
}

export interface FinanceCategoryDto {
  id: string;
  name: string;
  direction: "INCOME" | "EXPENSE" | "BOTH";
  sphere: Sphere;
  systemKey: string | null;
  hint: string | null;
  archived: boolean;
  /** Im Fenster „Neue Buchung“ wählbar (nicht archiviert, keine reine Programm-Kategorie). */
  selectable: boolean;
}

export interface LedgerSetup {
  ledgerStartDate: Date;
  closedThrough: Date | null;
}

/** `null`, solange das Kassenbuch nicht eingerichtet ist. */
export async function getLedgerSetup(ctx: TenantContext): Promise<LedgerSetup | null> {
  assertFinance(ctx, "finance:read");
  const settings = await ctx.db.financeSettings.findUnique({ where: { clubId: ctx.clubId } });
  return (
    settings && { ledgerStartDate: settings.ledgerStartDate, closedThrough: settings.closedThrough }
  );
}

/** Legt die Standard-Kategorien an, soweit sie fehlen (idempotent). */
async function ensureDefaultCategories(tx: TenantTx, clubId: string): Promise<void> {
  const existing = await tx.financeCategory.findMany({ select: { name: true, systemKey: true } });
  const names = new Set(existing.map((c) => c.name));
  const keys = new Set(existing.map((c) => c.systemKey).filter(Boolean));
  const missing = DEFAULT_CATEGORIES.filter(
    (c) => !names.has(c.name) && !(c.systemKey && keys.has(c.systemKey)),
  );
  if (missing.length === 0) return;
  await tx.financeCategory.createMany({
    data: missing.map((c) => ({
      clubId,
      name: c.name,
      direction: c.direction,
      sphere: c.sphere,
      systemKey: c.systemKey ?? null,
      hint: c.hint ?? null,
      sortOrder: DEFAULT_CATEGORIES.indexOf(c),
    })),
  });
}

export async function systemCategoryId(tx: TenantTx, key: SystemCategoryKey): Promise<string> {
  const category = await tx.financeCategory.findFirst({
    where: { systemKey: key },
    select: { id: true },
  });
  if (!category)
    throw badRequest("Die Kategorien des Kassenbuchs fehlen – bitte richte es neu ein.");
  return category.id;
}

/**
 * „Konten einrichten“: Einstellungen, Girokonto, auf Wunsch Barkasse, Kategorien und die Anfangsbestände – alles in einer
 * Transaktion. Ein zweiter Aufruf ändert nichts (schon eingerichtet).
 */
export async function setupLedger(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(ledgerSetupSchema, input);
  const start = parseCalendarDate(data.ledgerStartDate)!;
  if (start.getTime() > todayCalendarDate().getTime())
    throw validationFailed({ ledgerStartDate: ["Der Beginn darf nicht in der Zukunft liegen."] });
  const bankOpening = data.bankOpening ? parseSignedEuroToCents(data.bankOpening)! : 0;
  const cashOpening =
    data.withCash && data.cashOpening ? parseSignedEuroToCents(data.cashOpening)! : 0;

  await ctx.db.$transaction(async (tx) => {
    if (await tx.financeSettings.findUnique({ where: { clubId: ctx.clubId } }))
      throw conflict("Das Kassenbuch ist schon eingerichtet.");
    await tx.financeSettings.create({
      data: { clubId: ctx.clubId, ledgerStartDate: start, updatedById: ctx.userId },
    });
    await ensureDefaultCategories(tx, ctx.clubId);
    const bank = await tx.financeAccount.create({
      data: {
        clubId: ctx.clubId,
        kind: "BANK",
        name: data.bankName,
        bankName: data.bankInstitute || null,
        isDefault: true,
        sortOrder: 0,
        createdById: ctx.userId,
      },
    });
    const accounts = [{ account: bank, opening: bankOpening }];
    if (data.withCash) {
      const cash = await tx.financeAccount.create({
        data: {
          clubId: ctx.clubId,
          kind: "CASH",
          name: data.cashName!.trim(),
          sortOrder: 1,
          createdById: ctx.userId,
        },
      });
      accounts.push({ account: cash, opening: cashOpening });
    }
    const openingCategory = await systemCategoryId(tx, "OPENING");
    for (const { account, opening } of accounts) {
      if (opening === 0) continue;
      await insertEntry(tx, ctx, {
        accountId: account.id,
        bookingDate: start,
        kind: "OPENING",
        description: `Anfangsbestand ${account.name}`,
        lines: [{ categoryId: openingCategory, amountCents: opening }],
      });
    }
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.setup_completed",
      entityType: "FinanceSettings",
      entityId: ctx.clubId,
      summary: `Kassenbuch eingerichtet ab ${formatCalendarDate(start)}: ${accounts
        .map(({ account, opening }) => `${account.name} ${formatEuroFromCents(opening)}`)
        .join(", ")}`,
    });
  }, LONG_TX);
}

// ---------------------------------------------------------------------------------------------
// Konten und Kategorien lesen
// ---------------------------------------------------------------------------------------------

/** Kontostände je Konto bis einschließlich `asOf` (ohne Angabe: alle Buchungen). */
export async function accountBalances(
  ctx: TenantContext,
  asOf?: Date,
): Promise<Map<string, number>> {
  assertFinance(ctx, "finance:read");
  const groups = await ctx.db.ledgerEntry.groupBy({
    by: ["accountId"],
    where: asOf ? { bookingDate: { lte: asOf } } : {},
    _sum: { amountCents: true },
  });
  return new Map(groups.map((g) => [g.accountId, Number(g._sum.amountCents ?? 0)]));
}

export async function listAccounts(
  ctx: TenantContext,
  { includeArchived = false }: { includeArchived?: boolean } = {},
): Promise<FinanceAccountDto[]> {
  assertFinance(ctx, "finance:read");
  const [rows, balances] = await Promise.all([
    ctx.db.financeAccount.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    accountBalances(ctx),
  ]);
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    bankName: row.bankName,
    isDefault: row.isDefault,
    archived: row.archivedAt !== null,
    balanceCents: balances.get(row.id) ?? 0,
  }));
}

export async function listCategories(ctx: TenantContext): Promise<FinanceCategoryDto[]> {
  assertFinance(ctx, "finance:read");
  const rows = await ctx.db.financeCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    direction: row.direction,
    sphere: row.sphere,
    systemKey: row.systemKey,
    hint: row.hint,
    archived: row.archivedAt !== null,
    selectable:
      row.archivedAt === null &&
      !HIDDEN_SYSTEM_KEYS.includes((row.systemKey ?? "") as SystemCategoryKey),
  }));
}

// ---------------------------------------------------------------------------------------------
// Buchen
// ---------------------------------------------------------------------------------------------

interface NewLine {
  categoryId: string;
  amountCents: number;
  departmentId?: string | null;
  eventId?: string | null;
  note?: string | null;
  invoiceId?: string | null;
}

interface NewEntry {
  accountId: string;
  bookingDate: Date;
  kind: LedgerEntryKind;
  description: string;
  counterpartyName?: string | null;
  counterpartyMemberId?: string | null;
  reversalOfId?: string | null;
  transferGroupId?: string | null;
  lines: NewLine[];
}

/** Schreibt eine Buchung mit Nummer und Zeilen (die Datenbank prüft Zeitraum, Summen, Barkasse, Storno). */
export async function insertEntry(
  tx: TenantTx,
  ctx: TenantContext,
  entry: NewEntry,
): Promise<{ id: string; year: number; number: number; amountCents: number }> {
  const amountCents = entry.lines.reduce((sum, line) => sum + line.amountCents, 0);
  const year = entry.bookingDate.getUTCFullYear();
  const [number] = await nextNumbers(tx, ctx.clubId, "LEDGER", year);
  const created = await tx.ledgerEntry.create({
    data: {
      clubId: ctx.clubId,
      year,
      number: number!,
      accountId: entry.accountId,
      bookingDate: entry.bookingDate,
      kind: entry.kind,
      amountCents,
      description: entry.description,
      counterpartyName: entry.counterpartyName || null,
      counterpartyMemberId: entry.counterpartyMemberId || null,
      reversalOfId: entry.reversalOfId ?? null,
      transferGroupId: entry.transferGroupId ?? null,
      createdById: ctx.userId,
    },
  });
  await tx.ledgerLine.createMany({
    data: entry.lines.map((line, index) => ({
      clubId: ctx.clubId,
      entryId: created.id,
      position: index + 1,
      amountCents: line.amountCents,
      categoryId: line.categoryId,
      // Momentaufnahmen: die Datenbank überschreibt sie mit den gültigen Werten (Trigger ledger_line_before_insert).
      sphere: "NEUTRAL",
      categoryName: "",
      bookingDate: entry.bookingDate,
      accountId: entry.accountId,
      departmentId: line.departmentId ?? null,
      eventId: line.eventId ?? null,
      note: line.note || null,
      invoiceId: line.invoiceId ?? null,
    })),
  });
  return { id: created.id, year, number: number!, amountCents };
}

/** Prüft Konto und Kategorien einer neuen Einnahme/Ausgabe und baut die Zeilen (Betrag mit Vorzeichen). */
async function prepareEntry(tx: TenantTx, data: EntryData): Promise<NewEntry> {
  const account = await tx.financeAccount.findFirst({
    where: { id: data.accountId, archivedAt: null },
  });
  if (!account) throw validationFailed({ accountId: ["Bitte wähle ein Konto."] });
  const categoryIds = [...new Set(data.lines.map((line) => line.categoryId))];
  const categories = await tx.financeCategory.findMany({ where: { id: { in: categoryIds } } });
  const byId = new Map(categories.map((c) => [c.id, c]));
  const sign = data.kind === "INCOME" ? 1 : -1;
  const lines: NewLine[] = data.lines.map((line, index) => {
    const category = byId.get(line.categoryId);
    const wrongDirection =
      category &&
      category.direction !== "BOTH" &&
      category.direction !== (data.kind === "INCOME" ? "INCOME" : "EXPENSE");
    if (
      !category ||
      category.archivedAt ||
      HIDDEN_SYSTEM_KEYS.includes((category.systemKey ?? "") as SystemCategoryKey) ||
      wrongDirection
    )
      throw validationFailed({
        [`lines.${index}.categoryId`]: [
          data.kind === "INCOME"
            ? "Bitte wähle eine Kategorie für Einnahmen."
            : "Bitte wähle eine Kategorie für Ausgaben.",
        ],
      });
    const { departmentId, eventId } = parseTarget(line.target);
    return {
      categoryId: category.id,
      amountCents: sign * parseEuroToCents(line.amount!)!,
      departmentId,
      eventId,
      note: line.note,
      invoiceId: data.invoiceId ?? null,
    };
  });
  return {
    accountId: account.id,
    bookingDate: parseCalendarDate(data.bookingDate)!,
    kind: "STANDARD",
    description: data.description,
    counterpartyName: data.counterparty,
    counterpartyMemberId: data.counterpartyMemberId,
    lines,
  };
}

export interface CreatedEntry {
  id: string;
  label: string;
}

/**
 * Rechnung zur neuen Buchung („Ins Kassenbuch“): gesperrt bis zum Ende der Transaktion, damit sie nicht zweimal gleichzeitig
 * gebucht wird (die Datenbank prüft es zusätzlich). Eine Eingangsrechnung ist immer eine Ausgabe.
 */
async function invoiceForEntry(tx: TenantTx, ctx: TenantContext, data: EntryData) {
  if (!data.invoiceId) return null;
  if (data.kind !== "EXPENSE")
    throw validationFailed({ kind: ["Eine Rechnung, die der Verein bezahlt, ist eine Ausgabe."] });
  await lockUntilCommit(tx, ctx.clubId, `invoice:${data.invoiceId}`);
  const invoice = await tx.invoice.findFirst({
    where: { id: data.invoiceId, document: { is: { deletedAt: null } } },
    include: { document: { select: { id: true, name: true } } },
  });
  if (!invoice) throw notFound("Die Rechnung");
  return invoice;
}

type BookedInvoice = NonNullable<Awaited<ReturnType<typeof invoiceForEntry>>>;

/**
 * Vor dem Buchen einer Rechnung: als bezahlt vermerken (falls noch offen) und – fehlt ihr Betrag (beim Hochladen „schon
 * bezahlt“) – den gebuchten Betrag eintragen. Danach hält die Datenbank beides fest, solange die Buchung gilt.
 */
async function settleInvoice(
  tx: TenantTx,
  ctx: TenantContext,
  invoice: BookedInvoice,
  entry: NewEntry,
): Promise<void> {
  const totalCents = Math.abs(entry.lines.reduce((sum, line) => sum + line.amountCents, 0));
  if (invoice.status === "PAID" && invoice.amountCents !== null) return;
  await tx.invoice.update({
    where: { id: invoice.id },
    data: {
      ...(invoice.status !== "PAID"
        ? { status: "PAID", paidAt: new Date(), paidById: ctx.userId }
        : {}),
      ...(invoice.amountCents === null ? { amountCents: totalCents } : {}),
    },
  });
}

/** Nach dem Buchen einer Rechnung: als Beleg anhängen. */
async function linkInvoice(
  tx: TenantTx,
  ctx: TenantContext,
  invoice: BookedInvoice,
  entry: { id: string; label: string },
): Promise<void> {
  await tx.ledgerAttachment.createMany({
    data: [
      {
        clubId: ctx.clubId,
        entryId: entry.id,
        documentId: invoice.document.id,
        attachedById: ctx.userId,
      },
    ],
    skipDuplicates: true,
  });
  await recordAudit(tx, auditActor(ctx), {
    action: "finance.invoice_booked",
    entityType: "Invoice",
    entityId: invoice.id,
    summary: `Rechnung „${invoice.document.name}“ im Kassenbuch gebucht (Nr. ${entry.label})`,
  });
}

/** Neue Einnahme oder Ausgabe (auf Wunsch zu einer bezahlten Rechnung). */
export async function createEntry(ctx: TenantContext, input: unknown): Promise<CreatedEntry> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(entrySchema, input);
  return ctx.db.$transaction(async (tx) => {
    const invoice = await invoiceForEntry(tx, ctx, data);
    const entry = await prepareEntry(tx, data);
    if (invoice) await settleInvoice(tx, ctx, invoice, entry);
    const created = await insertEntry(tx, ctx, entry);
    const label = entryNumber(created.year, created.number);
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.entry_created",
      entityType: "LedgerEntry",
      entityId: created.id,
      summary: `Buchung ${label}: ${entry.description} (${formatEuroFromCents(created.amountCents)})`,
    });
    if (invoice) await linkInvoice(tx, ctx, invoice, { id: created.id, label });
    return { id: created.id, label };
  }, LONG_TX);
}

/**
 * Datum eines Stornos: das der ursprünglichen Buchung, solange ihr Zeitraum offen ist – so stimmen Monats- und Jahreszahlen
 * (ein Fehler im September wird im September korrigiert). Liegt sie in einem abgeschlossenen Zeitraum, bucht das Storno am
 * ersten offenen Tag danach (GoBD: Korrektur im offenen Zeitraum mit Verweis auf das Original).
 */
export async function reversalDate(tx: TenantTx, clubId: string, original: Date): Promise<Date> {
  const settings = await tx.financeSettings.findUnique({ where: { clubId } });
  const closed = settings?.closedThrough;
  if (!closed || original.getTime() > closed.getTime()) return original;
  const firstOpen = new Date(closed.getTime() + 86_400_000);
  const today = todayCalendarDate();
  return firstOpen.getTime() > today.getTime() ? today : firstOpen;
}

/** Storno einer Buchung in einer offenen Transaktion (gemeinsam für „Stornieren“ und „Korrigieren“). */
async function reverseInTx(
  tx: TenantTx,
  ctx: TenantContext,
  id: string,
  reason: string,
): Promise<{ label: string; original: string }> {
  const original = await tx.ledgerEntry.findFirst({
    where: { id },
    include: { lines: { orderBy: { position: "asc" } }, reversedBy: { select: { id: true } } },
  });
  if (!original) throw notFound("Die Buchung");
  if (original.kind === "REVERSAL")
    throw conflict("Ein Storno lässt sich nicht stornieren – bitte buche den Betrag neu.");
  if (original.reversedBy) throw conflict("Diese Buchung ist bereits storniert.");
  if (original.kind === "OPENING")
    throw conflict("Den Anfangsbestand änderst du über „Anfangsbestand korrigieren“.");

  // Umbuchung: beide Hälften gehören zusammen.
  const group =
    original.kind === "TRANSFER"
      ? await tx.ledgerEntry.findMany({
          where: { transferGroupId: original.transferGroupId!, kind: "TRANSFER" },
          include: {
            lines: { orderBy: { position: "asc" } },
            reversedBy: { select: { id: true } },
          },
          orderBy: { number: "asc" },
        })
      : [original];
  const bookingDate = await reversalDate(tx, ctx.clubId, original.bookingDate);
  const originalLabel = entryNumber(original.year, original.number);
  const labels: string[] = [];
  for (const entry of group) {
    if (entry.reversedBy) continue;
    const created = await insertEntry(tx, ctx, {
      accountId: entry.accountId,
      bookingDate,
      kind: "REVERSAL",
      description: `Storno zu Nr. ${entryNumber(entry.year, entry.number)}: ${reason}`.slice(
        0,
        200,
      ),
      counterpartyName: entry.counterpartyName,
      counterpartyMemberId: entry.counterpartyMemberId,
      reversalOfId: entry.id,
      lines: entry.lines.map((line) => ({
        categoryId: line.categoryId,
        amountCents: -line.amountCents,
        departmentId: line.departmentId,
        eventId: line.eventId,
        note: line.note,
        invoiceId: line.invoiceId,
      })),
    });
    labels.push(entryNumber(created.year, created.number));
  }
  await recordAudit(tx, auditActor(ctx), {
    action: "finance.entry_reversed",
    entityType: "LedgerEntry",
    entityId: original.id,
    summary: `Buchung ${originalLabel} storniert (${labels.join(", ")}): ${reason}`,
  });
  return { label: labels.join(", "), original: originalLabel };
}

/** „Stornieren“: Gegenbuchung mit Verweis auf das Original (bei einer Umbuchung beide Hälften). */
export async function reverseEntry(ctx: TenantContext, input: unknown): Promise<{ label: string }> {
  assertFinance(ctx, "finance:manage");
  const { id, reason } = parseInput(reverseSchema, input);
  return ctx.db.$transaction(async (tx) => reverseInTx(tx, ctx, id, reason), LONG_TX);
}

/** „Korrigieren“: Storno und neue Buchung in einem Schritt – beides oder keins. */
export async function correctEntry(
  ctx: TenantContext,
  input: { id: string; reason: string; entry: unknown },
): Promise<CreatedEntry> {
  assertFinance(ctx, "finance:manage");
  const { id, reason } = parseInput(reverseSchema, { id: input.id, reason: input.reason });
  const data = parseInput(entrySchema, input.entry);
  return ctx.db.$transaction(async (tx) => {
    const reversed = await reverseInTx(tx, ctx, id, reason);
    const invoice = await invoiceForEntry(tx, ctx, data);
    const entry = await prepareEntry(tx, data);
    if (invoice) await settleInvoice(tx, ctx, invoice, entry);
    const created = await insertEntry(tx, ctx, entry);
    const label = entryNumber(created.year, created.number);
    // Die Belege der alten Buchung gehören zur korrigierten.
    const attachments = await tx.ledgerAttachment.findMany({
      where: { entryId: id },
      select: { documentId: true, note: true },
    });
    if (attachments.length > 0)
      await tx.ledgerAttachment.createMany({
        data: attachments.map((attachment) => ({
          clubId: ctx.clubId,
          entryId: created.id,
          documentId: attachment.documentId,
          note: attachment.note,
          attachedById: ctx.userId,
        })),
        skipDuplicates: true,
      });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.entry_corrected",
      entityType: "LedgerEntry",
      entityId: created.id,
      summary: `Buchung ${reversed.original} korrigiert: neu ${label} (${formatEuroFromCents(created.amountCents)})`,
    });
    if (invoice) await linkInvoice(tx, ctx, invoice, { id: created.id, label });
    return { id: created.id, label };
  }, LONG_TX);
}

/** Umbuchung (z. B. Bargeld zur Bank gebracht): zwei gleich große Buchungen mit gemeinsamer Kennung. */
export async function createTransfer(
  ctx: TenantContext,
  input: unknown,
): Promise<{ label: string }> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(transferSchema, input);
  const amount = parseEuroToCents(data.amount!)!;
  const bookingDate = parseCalendarDate(data.bookingDate)!;
  return ctx.db.$transaction(async (tx) => {
    const accounts = await tx.financeAccount.findMany({
      where: { id: { in: [data.fromAccountId, data.toAccountId] }, archivedAt: null },
    });
    const from = accounts.find((a) => a.id === data.fromAccountId);
    const to = accounts.find((a) => a.id === data.toAccountId);
    if (!from) throw validationFailed({ fromAccountId: ["Bitte wähle ein Konto."] });
    if (!to) throw validationFailed({ toAccountId: ["Bitte wähle ein Konto."] });
    const categoryId = await systemCategoryId(tx, "TRANSFER");
    const description = data.description || `Umbuchung ${from.name} → ${to.name}`;
    const transferGroupId = randomUUID();
    const out = await insertEntry(tx, ctx, {
      accountId: from.id,
      bookingDate,
      kind: "TRANSFER",
      description,
      transferGroupId,
      lines: [{ categoryId, amountCents: -amount }],
    });
    const into = await insertEntry(tx, ctx, {
      accountId: to.id,
      bookingDate,
      kind: "TRANSFER",
      description,
      transferGroupId,
      lines: [{ categoryId, amountCents: amount }],
    });
    const label = `${entryNumber(out.year, out.number)} und ${entryNumber(into.year, into.number)}`;
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.transfer_created",
      entityType: "LedgerEntry",
      entityId: out.id,
      summary: `Umbuchung ${formatEuroFromCents(amount)} von ${from.name} nach ${to.name} (${label})`,
    });
    return { label };
  }, LONG_TX);
}

/**
 * „Anfangsbestand korrigieren“ (vertippt, vergessen, überzogenes Konto): hebt den bisherigen Anfangsbestand per Storno auf
 * und trägt den neuen ein – beides am Beginn des Kassenbuchs, also nicht als Einnahme oder Ausgabe. Geht nur, solange der
 * Beginn nicht abgeschlossen ist.
 */
export async function correctOpening(
  ctx: TenantContext,
  input: unknown,
): Promise<{ amountCents: number }> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(openingSchema, input);
  const amount = parseSignedEuroToCents(data.amount!)!;
  return ctx.db.$transaction(async (tx) => {
    const settings = await tx.financeSettings.findUnique({ where: { clubId: ctx.clubId } });
    if (!settings) throw badRequest("Das Kassenbuch ist noch nicht eingerichtet.");
    if (
      settings.closedThrough &&
      settings.closedThrough.getTime() >= settings.ledgerStartDate.getTime()
    )
      throw conflict(
        "Der Beginn des Kassenbuchs ist abgeschlossen – der Anfangsbestand lässt sich nicht mehr ändern.",
      );
    const account = await tx.financeAccount.findFirst({
      where: { id: data.accountId, archivedAt: null },
    });
    if (!account) throw validationFailed({ accountId: ["Bitte wähle ein Konto."] });
    if (account.kind === "CASH" && amount < 0)
      throw validationFailed({ amount: ["Eine Barkasse kann nicht im Minus sein."] });
    // Zwei gleichzeitige Korrekturen sähen beide denselben Anfangsbestand – die zweite wartet und liest danach neu.
    await lockUntilCommit(tx, ctx.clubId, `opening:${account.id}`);
    const current = await tx.ledgerEntry.findFirst({
      where: { accountId: account.id, kind: "OPENING", reversedBy: null },
      include: { lines: { orderBy: { position: "asc" } } },
    });
    const before = current?.amountCents ?? 0;
    if (before === amount) return { amountCents: amount };
    const categoryId = await systemCategoryId(tx, "OPENING");
    if (current) {
      await insertEntry(tx, ctx, {
        accountId: account.id,
        bookingDate: current.bookingDate,
        kind: "REVERSAL",
        description: `Storno zu Nr. ${entryNumber(current.year, current.number)}: Anfangsbestand korrigiert`,
        reversalOfId: current.id,
        lines: current.lines.map((line) => ({
          categoryId: line.categoryId,
          amountCents: -line.amountCents,
        })),
      });
    }
    if (amount !== 0) {
      await insertEntry(tx, ctx, {
        accountId: account.id,
        bookingDate: settings.ledgerStartDate,
        kind: "OPENING",
        description: `Anfangsbestand ${account.name}`,
        lines: [{ categoryId, amountCents: amount }],
      });
    }
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.opening_corrected",
      entityType: "FinanceAccount",
      entityId: account.id,
      summary: `Anfangsbestand ${account.name}: ${formatEuroFromCents(before)} → ${formatEuroFromCents(amount)}`,
    });
    return { amountCents: amount };
  }, LONG_TX);
}

// ---------------------------------------------------------------------------------------------
// Kassenbuch lesen
// ---------------------------------------------------------------------------------------------

export interface LedgerLineDto {
  id: string;
  amountCents: number;
  categoryId: string;
  categoryName: string;
  sphere: Sphere;
  department: { id: string; name: string } | null;
  event: { id: string; title: string } | null;
  note: string | null;
  invoiceId: string | null;
}

/** Beleg einer Buchung: Datei (`documentId`, `name`) oder Eigenbeleg (`note`). */
export interface LedgerAttachmentDto {
  id: string;
  documentId: string | null;
  name: string | null;
  note: string | null;
  /** Die Rechnung, die diese Buchung bezahlt – bleibt angehängt (kein „Entfernen“). */
  locked: boolean;
}

export interface LedgerEntryDto {
  id: string;
  label: string;
  year: number;
  number: number;
  kind: LedgerEntryKind;
  bookingDate: Date;
  account: { id: string; name: string; kind: FinanceAccountKind };
  amountCents: number;
  description: string;
  counterpartyName: string | null;
  counterpartyMember: { id: string; name: string } | null;
  lines: LedgerLineDto[];
  /** Diese Buchung wurde storniert durch … */
  reversedBy: { id: string; label: string } | null;
  /** Diese Buchung ist das Storno zu … */
  reversalOf: { id: string; label: string } | null;
  recordedAt: Date;
  /** Darf storniert/korrigiert werden (Rechte, kein Storno, nicht schon storniert, kein Anfangsbestand). */
  canReverse: boolean;
  attachments: LedgerAttachmentDto[];
  /** Geltende Einnahme oder Ausgabe ohne Beleg (Umbuchungen, Stornos und Anfangsbestände brauchen keinen). */
  needsReceipt: boolean;
}

export interface LedgerFilter {
  accountId?: string;
  /** „JJJJ-MM“ */
  month?: string;
  categoryId?: string;
  departmentId?: string;
  eventId?: string;
  /** „missing“: nur geltende Einnahmen und Ausgaben ohne Beleg. */
  receipt?: "missing";
  q?: string;
  page?: number;
  pageSize?: number;
}

const entryInclude = {
  account: { select: { id: true, name: true, kind: true } },
  counterpartyMember: { select: { id: true, firstName: true, lastName: true } },
  lines: {
    orderBy: { position: "asc" },
    include: {
      department: { select: { id: true, name: true } },
      event: { select: { id: true, title: true } },
    },
  },
  reversedBy: { select: { id: true, year: true, number: true } },
  reversalOf: { select: { id: true, year: true, number: true } },
  attachments: {
    orderBy: { attachedAt: "asc" },
    include: {
      document: { select: { id: true, name: true, invoice: { select: { id: true } } } },
    },
  },
} satisfies Prisma.LedgerEntryInclude;

type EntryRow = Prisma.LedgerEntryGetPayload<{ include: typeof entryInclude }>;

function entryDto(row: EntryRow, canManage: boolean): LedgerEntryDto {
  return {
    id: row.id,
    label: entryNumber(row.year, row.number),
    year: row.year,
    number: row.number,
    kind: row.kind,
    bookingDate: row.bookingDate,
    account: row.account,
    amountCents: row.amountCents,
    description: row.description,
    counterpartyName: row.counterpartyName,
    counterpartyMember: row.counterpartyMember && {
      id: row.counterpartyMember.id,
      name: `${row.counterpartyMember.firstName} ${row.counterpartyMember.lastName}`,
    },
    lines: row.lines.map((line) => ({
      id: line.id,
      amountCents: line.amountCents,
      categoryId: line.categoryId,
      categoryName: line.categoryName,
      sphere: line.sphere,
      department: line.department,
      event: line.event,
      note: line.note,
      invoiceId: line.invoiceId,
    })),
    reversedBy: row.reversedBy && {
      id: row.reversedBy.id,
      label: entryNumber(row.reversedBy.year, row.reversedBy.number),
    },
    reversalOf: row.reversalOf && {
      id: row.reversalOf.id,
      label: entryNumber(row.reversalOf.year, row.reversalOf.number),
    },
    recordedAt: row.recordedAt,
    canReverse: canManage && row.kind !== "REVERSAL" && row.kind !== "OPENING" && !row.reversedBy,
    attachments: row.attachments.map((attachment) => ({
      id: attachment.id,
      documentId: attachment.document?.id ?? null,
      name: attachment.document?.name ?? null,
      note: attachment.note,
      locked: Boolean(
        attachment.document?.invoice &&
        row.lines.some((line) => line.invoiceId === attachment.document!.invoice!.id),
      ),
    })),
    needsReceipt: row.kind === "STANDARD" && !row.reversedBy && row.attachments.length === 0,
  };
}

function monthRange(month: string | undefined): { gte: Date; lt: Date } | undefined {
  const match = month ? /^(\d{4})-(\d{2})$/.exec(month) : null;
  if (!match) return undefined;
  const year = Number(match[1]);
  const m = Number(match[2]);
  if (m < 1 || m > 12) return undefined;
  return { gte: new Date(Date.UTC(year, m - 1, 1)), lt: new Date(Date.UTC(year, m, 1)) };
}

/** Geltende Einnahmen und Ausgaben ohne Beleg. */
const MISSING_RECEIPT = {
  kind: "STANDARD",
  reversedBy: { is: null },
  attachments: { none: {} },
} satisfies Prisma.LedgerEntryWhereInput;

/** Wie viele Buchungen noch keinen Beleg haben (Übersicht „Das steht an“). */
export async function missingReceiptCount(ctx: TenantContext): Promise<number> {
  assertFinance(ctx, "finance:read");
  return ctx.db.ledgerEntry.count({ where: MISSING_RECEIPT });
}

export interface LedgerPage {
  entries: LedgerEntryDto[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  /** Summe der gefilterten Buchungen (Einnahmen minus Ausgaben). */
  sumCents: number;
}

export async function listEntries(
  ctx: TenantContext,
  filter: LedgerFilter = {},
): Promise<LedgerPage> {
  assertFinance(ctx, "finance:read");
  const pageSize = Math.min(Math.max(filter.pageSize ?? 25, 1), 100);
  const q = filter.q?.trim();
  const lineWhere: Prisma.LedgerLineWhereInput = {
    ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
    ...(filter.departmentId ? { departmentId: filter.departmentId } : {}),
    ...(filter.eventId ? { eventId: filter.eventId } : {}),
  };
  const where: Prisma.LedgerEntryWhereInput = {
    ...(filter.accountId ? { accountId: filter.accountId } : {}),
    ...(monthRange(filter.month) ? { bookingDate: monthRange(filter.month) } : {}),
    ...(Object.keys(lineWhere).length > 0 ? { lines: { some: lineWhere } } : {}),
    ...(filter.receipt === "missing" ? MISSING_RECEIPT : {}),
    ...(q
      ? {
          OR: [
            { description: { contains: q, mode: "insensitive" } },
            { counterpartyName: { contains: q, mode: "insensitive" } },
            ...(/^\d{4}-\d{1,4}$/.test(q)
              ? [{ year: Number(q.split("-")[0]), number: Number(q.split("-")[1]) }]
              : []),
          ],
        }
      : {}),
  };
  // Mit Kategorie-, Abteilungs- oder Veranstaltungsfilter zählt nur der passende Teil aufgeteilter Buchungen.
  const lineFiltered = Object.keys(lineWhere).length > 0;
  const entryWhere: Prisma.LedgerEntryWhereInput = { ...where };
  delete entryWhere.lines;
  const [total, sum] = await Promise.all([
    ctx.db.ledgerEntry.count({ where }),
    lineFiltered
      ? ctx.db.ledgerLine.aggregate({
          where: { ...lineWhere, entry: entryWhere },
          _sum: { amountCents: true },
        })
      : ctx.db.ledgerEntry.aggregate({ where, _sum: { amountCents: true } }),
  ]);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(filter.page ?? 1, 1), pageCount);
  const rows = await ctx.db.ledgerEntry.findMany({
    where,
    include: entryInclude,
    orderBy: [{ bookingDate: "desc" }, { year: "desc" }, { number: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
  });
  const canManage = canFinance(ctx, "finance:manage");
  return {
    entries: rows.map((row) => entryDto(row, canManage)),
    total,
    page,
    pageCount,
    pageSize,
    sumCents: Number(sum._sum.amountCents ?? 0),
  };
}

export async function getEntry(ctx: TenantContext, id: string): Promise<LedgerEntryDto> {
  assertFinance(ctx, "finance:read");
  const row = await ctx.db.ledgerEntry.findFirst({ where: { id }, include: entryInclude });
  if (!row) throw notFound("Die Buchung");
  return entryDto(row, canFinance(ctx, "finance:manage"));
}

// ---------------------------------------------------------------------------------------------
// Jahreszahlen (Übersicht, Berichte)
// ---------------------------------------------------------------------------------------------

export interface YearSummary {
  year: number;
  /** Zeitraum: 01.01. bis heute (laufendes Jahr) bzw. 31.12. */
  from: Date;
  to: Date;
  incomeCents: number;
  expenseCents: number;
  surplusCents: number;
  /** Je Monat (Index 0 = Januar) – nur bis zum letzten Monat mit Buchungen bzw. bis heute. */
  months: { incomeCents: number; expenseCents: number }[];
  bySphere: { sphere: Sphere; incomeCents: number; expenseCents: number }[];
}

/**
 * Einnahmen und Ausgaben eines Jahres (ohne Umbuchungen und Anfangsbestände). Ein Storno zählt dorthin, wohin das Original
 * gehörte: Ein stornierter Einkauf senkt die Ausgaben, statt als Einnahme aufzutauchen.
 */
export async function yearSummary(ctx: TenantContext, year: number): Promise<YearSummary> {
  assertFinance(ctx, "finance:read");
  const from = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 11, 31));
  const today = todayCalendarDate();
  const to = today.getTime() < end.getTime() && today.getUTCFullYear() === year ? today : end;
  const lines = await ctx.db.ledgerLine.findMany({
    where: { bookingDate: { gte: from, lte: end }, sphere: { not: "NEUTRAL" } },
    select: {
      amountCents: true,
      bookingDate: true,
      sphere: true,
      entry: { select: { kind: true } },
    },
  });
  const months = Array.from({ length: 12 }, () => ({ incomeCents: 0, expenseCents: 0 }));
  const spheres = new Map<Sphere, { incomeCents: number; expenseCents: number }>();
  let income = 0;
  let expense = 0;
  for (const line of lines) {
    // Richtung: bei einem Storno die des Originals (umgekehrtes Vorzeichen).
    const direction = line.entry.kind === "REVERSAL" ? -line.amountCents : line.amountCents;
    const bucket = months[line.bookingDate.getUTCMonth()]!;
    const sphere = spheres.get(line.sphere) ?? { incomeCents: 0, expenseCents: 0 };
    if (direction > 0) {
      income += line.amountCents;
      bucket.incomeCents += line.amountCents;
      sphere.incomeCents += line.amountCents;
    } else {
      expense -= line.amountCents;
      bucket.expenseCents -= line.amountCents;
      sphere.expenseCents -= line.amountCents;
    }
    spheres.set(line.sphere, sphere);
  }
  const lastMonth = to.getUTCFullYear() === year ? to.getUTCMonth() : 11;
  return {
    year,
    from,
    to,
    incomeCents: income,
    expenseCents: expense,
    surplusCents: income - expense,
    months: months.slice(0, lastMonth + 1),
    bySphere: [...spheres.entries()].map(([sphere, values]) => ({ sphere, ...values })),
  };
}

/**
 * Verlauf des Gesamtkontostands (alle Konten) am Ende jedes der letzten `months` Monate – für die Kennzahl „Kontostand“.
 * Monate vor Beginn des Kassenbuchs fehlen.
 */
export async function balanceHistory(
  ctx: TenantContext,
  months = 12,
): Promise<{ month: string; balanceCents: number }[]> {
  assertFinance(ctx, "finance:read");
  const settings = await ctx.db.financeSettings.findUnique({ where: { clubId: ctx.clubId } });
  if (!settings) return [];
  const today = todayCalendarDate();
  const groups = await ctx.db.ledgerEntry.groupBy({
    by: ["bookingDate"],
    _sum: { amountCents: true },
    orderBy: { bookingDate: "asc" },
  });
  const points: { month: string; balanceCents: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i + 1, 0));
    const cutoff = monthEnd.getTime() > today.getTime() ? today : monthEnd;
    if (cutoff.getTime() < settings.ledgerStartDate.getTime()) continue;
    const balance = groups
      .filter((g) => g.bookingDate.getTime() <= cutoff.getTime())
      .reduce((sum, g) => sum + Number(g._sum.amountCents ?? 0), 0);
    points.push({
      month: `${cutoff.getUTCFullYear()}-${String(cutoff.getUTCMonth() + 1).padStart(2, "0")}`,
      balanceCents: balance,
    });
  }
  return points;
}

// ---------------------------------------------------------------------------------------------
// Auswahllisten für die Fenster „Neue Buchung“ und „Umbuchung“
// ---------------------------------------------------------------------------------------------

export interface EntryFormOptions {
  accounts: { value: string; label: string; kind: FinanceAccountKind }[];
  categories: {
    value: string;
    label: string;
    direction: "INCOME" | "EXPENSE" | "BOTH";
    hint: string | null;
  }[];
  /** Abteilungen („a:<id>“) und Veranstaltungen der letzten und nächsten zwölf Monate („v:<id>“). */
  targets: { value: string; label: string; group: "Abteilung" | "Veranstaltung" }[];
  today: string;
  /** Frühestes Buchungsdatum (Beginn bzw. Tag nach dem letzten Abschluss), „JJJJ-MM-TT“. */
  minDate: string;
  /** Größte erlaubte Belegdatei in MB (Vorprüfung im Browser). */
  maxUploadMb: number;
  /** Beginn des Kassenbuchs, „JJJJ-MM-TT“. */
  ledgerStart: string;
}

export async function entryFormOptions(ctx: TenantContext): Promise<EntryFormOptions | null> {
  assertFinance(ctx, "finance:read");
  const setup = await getLedgerSetup(ctx);
  if (!setup) return null;
  const today = todayCalendarDate();
  const [accounts, categories, departments, events] = await Promise.all([
    listAccounts(ctx),
    listCategories(ctx),
    ctx.db.department.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    ctx.db.event.findMany({
      where: {
        deletedAt: null,
        startsAt: {
          gte: new Date(today.getTime() - 366 * 86_400_000),
          lte: new Date(today.getTime() + 366 * 86_400_000),
        },
      },
      orderBy: { startsAt: "desc" },
      take: 150,
      select: { id: true, title: true, startsAt: true },
    }),
  ]);
  const minDate = setup.closedThrough
    ? new Date(setup.closedThrough.getTime() + 86_400_000)
    : setup.ledgerStartDate;
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return {
    accounts: accounts.map((a) => ({ value: a.id, label: a.name, kind: a.kind })),
    categories: categories
      .filter((c) => c.selectable)
      .map((c) => ({ value: c.id, label: c.name, direction: c.direction, hint: c.hint })),
    targets: [
      ...departments.map((d) => ({
        value: `a:${d.id}`,
        label: d.name,
        group: "Abteilung" as const,
      })),
      ...events.map((e) => ({
        value: `v:${e.id}`,
        label: `${e.title} (${formatCalendarDate(todayCalendarDate(e.startsAt))})`,
        group: "Veranstaltung" as const,
      })),
    ],
    today: iso(today),
    minDate: iso(minDate),
    maxUploadMb: env.MAX_UPLOAD_MB,
    ledgerStart: iso(setup.ledgerStartDate),
  };
}

/** Aktueller (nicht stornierter) Anfangsbestand je Konto – für „Anfangsbestand korrigieren“. */
export async function openingBalances(ctx: TenantContext): Promise<Map<string, number>> {
  assertFinance(ctx, "finance:read");
  const rows = await ctx.db.ledgerEntry.findMany({
    where: { kind: "OPENING", reversedBy: null },
    select: { accountId: true, amountCents: true },
  });
  return new Map(rows.map((row) => [row.accountId, row.amountCents]));
}
