import { createHash } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import {
  formatEuroFromCents,
  parseCalendarDate,
  toDateInputValue,
  todayCalendarDate,
} from "@/lib/dates";
import { parseInput } from "@/server/action";
import { recordAudit } from "@/server/audit/audit";
import { lockUntilCommit } from "@/server/db/tenant";
import { conflict, notFound, validationFailed } from "@/server/errors";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import { assertFinance } from "@/modules/finance/access";
import { nextNumbers } from "@/modules/finance/ledger";
import type { EnginePreview } from "./engine-types";
import { periodFor, type FeePeriod } from "./periods";
import { chargeVoidSchema, feeRunExecuteSchema, feeRunRevertSchema } from "./schemas";
import { calculatePreview, getFeeSettings, type FeeSettings } from "./service";

/**
 * Beitragslauf (Etappe 7): Aus der Vorschau eines Zeitraums werden Beiträge (Forderungen) mit Nummer, Zeilen und den
 * abgedeckten Tagen. Drei Zusagen:
 *  - Es entsteht genau, was zu sehen war: Der Prüfwert (`inputHash`) der Vorschau muss beim Erstellen noch stimmen.
 *  - Kein Tag wird zweimal berechnet: Die Vorschau rechnet ohne schon abgedeckte Tage, die Datenbank sichert es ab.
 *  - Rückgängig, solange nichts bezahlt oder gemahnt ist (später auch: solange die Lastschrift nicht bei der Bank ist).
 * Ein zweiter Lauf für denselben Zeitraum (Nachlauf) erstellt nur, was noch fehlt – etwa für neue Mitglieder.
 */

const iso = (date: Date) => toDateInputValue(date);
const DAY_MS = 86_400_000;

/** „B-2026-0412“ */
export const chargeNumber = (year: number, number: number) =>
  `B-${year}-${String(number).padStart(4, "0")}`;

/** Fälligkeit: Tag „fällig am“ der Einstellungen im ersten Monat – liegt er schon zurück, heute. */
export function defaultDueDate(
  settings: FeeSettings,
  period: FeePeriod,
  today = todayCalendarDate(),
) {
  const due = new Date(period.start.getTime() + (settings.dueDay - 1) * DAY_MS);
  return due.getTime() < today.getTime() ? today : due;
}

/**
 * Prüfwert der Vorschau: alles, was erstellt würde (Wer, Zahler, Zahlweg, Betrag, Zeilen, abgedeckte Tage), dazu
 * Zeitraum und Fälligkeit – ohne Zeitpunkte, also für dieselbe Lage immer gleich.
 */
export function previewHash(period: FeePeriod, dueDate: Date, preview: EnginePreview): string {
  const canonical = JSON.stringify({
    period: [iso(period.start), iso(period.end)],
    due: iso(dueDate),
    charges: preview.charges.map((c) => [
      c.key,
      c.memberId,
      c.payerMemberId,
      c.paymentMethod,
      c.amountCents,
      c.lines.map((l) => [
        l.feeTypeId,
        l.feeRateId,
        l.assignmentId,
        iso(l.fromDate),
        iso(l.toDate),
        l.amountCents,
        l.text,
      ]),
      c.coverage.map((v) => [v.memberId, v.feeGroup, iso(v.from), iso(v.to), v.line]),
    ]),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export interface FeeRunSummary {
  id: string;
  label: string;
  status: "CREATED" | "REVERTED";
  chargeCount: number;
  totalCents: number;
  numberFrom: string | null;
  numberTo: string | null;
  dueDate: Date;
  createdAt: Date;
  revertedAt: Date | null;
  revertReason: string | null;
}

const runSummary = (run: {
  id: string;
  label: string;
  status: "CREATED" | "REVERTED";
  chargeCount: number;
  totalCents: number;
  year: number;
  numberFrom: number | null;
  numberTo: number | null;
  dueDate: Date;
  createdAt: Date;
  revertedAt: Date | null;
  revertReason: string | null;
}): FeeRunSummary => ({
  id: run.id,
  label: run.label,
  status: run.status,
  chargeCount: run.chargeCount,
  totalCents: run.totalCents,
  numberFrom: run.numberFrom === null ? null : chargeNumber(run.year, run.numberFrom),
  numberTo: run.numberTo === null ? null : chargeNumber(run.year, run.numberTo),
  dueDate: run.dueDate,
  createdAt: run.createdAt,
  revertedAt: run.revertedAt,
  revertReason: run.revertReason,
});

export interface FeeRunAnalysis {
  period: FeePeriod;
  dueDate: Date;
  settings: FeeSettings;
  preview: EnginePreview;
  inputHash: string;
  feeTypeCount: number;
  /** Frühere Läufe für denselben Zeitraum (dann ist dieser ein Nachlauf). */
  runs: FeeRunSummary[];
}

/** Prüfen und Vorschau: was ein Lauf für den Zeitraum jetzt erstellen würde (ohne schon abgerechnete Tage). */
export async function analyzeFeeRun(
  ctx: TenantContext,
  options: { period: FeePeriod; dueDate?: Date },
): Promise<FeeRunAnalysis> {
  assertFinance(ctx, "finance:read");
  const settings = await getFeeSettings(ctx);
  const dueDate = options.dueDate ?? defaultDueDate(settings, options.period);
  const [{ preview, feeTypeCount }, runs] = await Promise.all([
    calculatePreview(ctx.db, settings, options.period, { withCoverage: true }),
    // Läufe, die diesen Zeitraum berühren (auch nach einem Wechsel von monatlich zu vierteljährlich).
    ctx.db.feeRun.findMany({
      where: {
        periodStart: { lte: options.period.end },
        periodEnd: { gte: options.period.start },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return {
    period: options.period,
    dueDate,
    settings,
    preview,
    inputHash: previewHash(options.period, dueDate, preview),
    feeTypeCount,
    runs: runs.map(runSummary),
  };
}

/** „N Beiträge erstellen“ – in einer Transaktion unter der Sperre des Vereins (siehe Kopf). */
export async function executeFeeRun(
  ctx: TenantContext,
  input: unknown,
): Promise<{ id: string; existed: boolean }> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(feeRunExecuteSchema, input);
  const settings = await getFeeSettings(ctx);
  if (!settings.stored)
    throw conflict("Bitte richte zuerst das Kassenbuch ein – dorthin gehen später die Zahlungen.");
  const start = parseCalendarDate(data.periodStart)!;
  const dueDate = parseCalendarDate(data.dueDate)!;
  const period = periodFor(settings.feeInterval, start);
  if (period.start.getTime() !== start.getTime())
    throw validationFailed({ periodStart: ["Bitte einen Zeitraum aus der Liste wählen."] });
  return ctx.db.$transaction(
    async (tx) => {
      await lockUntilCommit(tx, ctx.clubId, "finance:fee-run");
      // Doppelter Klick (gleicher Prüfwert) ergibt denselben Lauf – nach dem Streichen (einzeln oder per „rückgängig“)
      // aber einen neuen: Die Zahl der gestrichenen Beiträge des Zeitraums gehört zum Schlüssel.
      const voided = await tx.charge.count({
        where: { periodStart: period.start, status: "VOID" },
      });
      const idempotencyKey = `${iso(period.start)}:${voided}:${data.inputHash}`;
      const existing = await tx.feeRun.findFirst({
        where: { idempotencyKey },
        select: { id: true },
      });
      if (existing) return { id: existing.id, existed: true };

      const { preview } = await calculatePreview(tx, settings, period, { withCoverage: true });
      if (previewHash(period, dueDate, preview) !== data.inputHash)
        throw conflict(
          "Die Vorschau hat sich inzwischen geändert (z. B. ein Mitglied oder ein Betrag) – bitte noch einmal prüfen.",
        );
      if (preview.charges.length === 0)
        throw conflict("Für diesen Zeitraum ist nichts mehr zu erstellen.");

      // Kategorie je Beitragsart: eigene, sonst „Mitgliedsbeiträge“ bzw. „Aufnahmegebühren“.
      const [system, types] = await Promise.all([
        tx.financeCategory.findMany({
          where: { systemKey: { in: ["FEES", "ADMISSION"] } },
          select: { id: true, systemKey: true },
        }),
        tx.feeType.findMany({
          select: { id: true, kind: true, categoryId: true, departmentId: true },
        }),
      ]);
      const fees = system.find((c) => c.systemKey === "FEES")?.id;
      const admission = system.find((c) => c.systemKey === "ADMISSION")?.id ?? fees;
      if (!fees)
        throw conflict(
          "Im Kassenbuch fehlt die Kategorie „Mitgliedsbeiträge“ – bitte unter „Konten und Kategorien“ prüfen.",
        );
      const typeById = new Map(types.map((t) => [t.id, t]));
      const categoryOf = (feeTypeId: string) => {
        const type = typeById.get(feeTypeId);
        return type?.categoryId ?? (type?.kind === "ADMISSION" ? admission! : fees);
      };
      const departmentOf = (feeTypeId: string) => {
        const type = typeById.get(feeTypeId);
        return type?.kind === "ADDITIONAL" ? type.departmentId : null;
      };

      const year = period.start.getUTCFullYear();
      const count = preview.charges.length;
      const numbers = await nextNumbers(tx, ctx.clubId, "CHARGE", year, count);
      const [runNumber] = await nextNumbers(tx, ctx.clubId, "FEE_RUN", year, 1);
      const totalCents = preview.charges.reduce((sum, c) => sum + c.amountCents, 0);
      const run = await tx.feeRun.create({
        data: {
          clubId: ctx.clubId,
          year,
          number: runNumber!,
          label: period.label,
          periodStart: period.start,
          periodEnd: period.end,
          dueDate,
          idempotencyKey,
          inputHash: data.inputHash,
          chargeCount: count,
          totalCents,
          warnings: preview.warnings.map((w) => w.text),
          numberFrom: numbers[0]!,
          numberTo: numbers[count - 1]!,
          createdById: ctx.userId,
        },
      });
      const charges = await tx.charge.createManyAndReturn({
        data: preview.charges.map((charge, i) => ({
          clubId: ctx.clubId,
          year,
          number: numbers[i]!,
          kind: "FEE" as const,
          title: `Mitgliedsbeitrag ${period.label}`,
          memberId: charge.memberId,
          familyId: charge.family?.id ?? null,
          payerMemberId: charge.payerMemberId,
          feeRunId: run.id,
          periodStart: period.start,
          periodEnd: period.end,
          dueDate,
          amountCents: charge.amountCents,
          paymentMethod: charge.paymentMethod,
          calculation: {
            explanation: charge.explanation,
            family: charge.family
              ? {
                  id: charge.family.id,
                  name: charge.family.name,
                  members: charge.family.members.map((m) => ({ id: m.id, name: m.name })),
                }
              : null,
            lines: charge.lines.map((l) => ({
              text: l.text,
              exact: l.exact,
              cents: l.amountCents,
              from: iso(l.fromDate),
              to: iso(l.toDate),
              feeTypeId: l.feeTypeId,
              feeRateId: l.feeRateId,
              assignmentId: l.assignmentId,
            })),
          } satisfies Prisma.InputJsonValue,
          explanation: charge.explanation,
          debtorName: charge.memberName,
          payerName: charge.payerName,
          createdById: ctx.userId,
        })),
        select: { id: true, number: true },
      });
      const chargeId = new Map(charges.map((c) => [c.number, c.id]));
      const lines = await tx.chargeLine.createManyAndReturn({
        data: preview.charges.flatMap((charge, i) =>
          charge.lines.map((line, position) => ({
            clubId: ctx.clubId,
            chargeId: chargeId.get(numbers[i]!)!,
            position,
            feeTypeId: line.feeTypeId,
            feeRateId: line.feeRateId,
            assignmentId: line.assignmentId,
            fromDate: line.fromDate,
            toDate: line.toDate,
            amountCents: line.amountCents,
            categoryId: categoryOf(line.feeTypeId),
            departmentId: departmentOf(line.feeTypeId),
            text: line.text,
          })),
        ),
        select: { id: true, chargeId: true, position: true },
      });
      const lineId = new Map(lines.map((l) => [`${l.chargeId}:${l.position}`, l.id]));
      await tx.chargeCoverage.createMany({
        data: preview.charges.flatMap((charge, i) =>
          charge.coverage.map((coverage) => ({
            clubId: ctx.clubId,
            chargeLineId: lineId.get(`${chargeId.get(numbers[i]!)}:${coverage.line}`)!,
            memberId: coverage.memberId,
            feeGroup: coverage.feeGroup,
            coversFrom: coverage.from,
            coversTo: coverage.to,
          })),
        ),
      });
      await recordAudit(tx, auditActor(ctx), {
        action: "finance.fee_run_created",
        entityType: "FeeRun",
        entityId: run.id,
        summary: `Beitragslauf ${period.label}: ${count} ${count === 1 ? "Beitrag" : "Beiträge"} über ${formatEuroFromCents(totalCents)} erstellt (${chargeNumber(year, numbers[0]!)} bis ${chargeNumber(year, numbers[count - 1]!)})`,
      });
      return { id: run.id, existed: false };
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
}

/** Was „rückgängig“ verhindert: Beiträge mit Zahlung, ausgebucht oder gemahnt. */
function blockerText(charge: {
  year: number;
  number: number;
  status: string;
  paidCents: number;
  reminderLevel: number;
}): string | null {
  const nr = chargeNumber(charge.year, charge.number);
  if (charge.status === "VOID") return null;
  if (charge.paidCents > 0 || charge.status === "PAID") return `${nr} (schon bezahlt)`;
  if (charge.status === "WRITTEN_OFF") return `${nr} (ausgebucht)`;
  if (charge.reminderLevel > 0) return `${nr} (schon erinnert)`;
  return null;
}

/** Beitragslauf rückgängig: alle Beiträge werden gestrichen, die Tage sind wieder frei. Mit Grund. */
export async function revertFeeRun(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(feeRunRevertSchema, input);
  await ctx.db.$transaction(
    async (tx) => {
      await lockUntilCommit(tx, ctx.clubId, "finance:fee-run");
      const run = await tx.feeRun.findFirst({ where: { id: data.id } });
      if (!run) throw notFound("Der Beitragslauf");
      if (run.status === "REVERTED") throw conflict("Dieser Beitragslauf ist schon rückgängig.");
      const charges = await tx.charge.findMany({
        where: { feeRunId: run.id },
        select: {
          id: true,
          year: true,
          number: true,
          status: true,
          paidCents: true,
          reminderLevel: true,
        },
        orderBy: { number: "asc" },
      });
      const blockers = charges.map(blockerText).filter((text): text is string => text !== null);
      if (blockers.length > 0)
        throw conflict(
          `Rückgängig geht nicht mehr: ${blockers.slice(0, 5).join(", ")}${blockers.length > 5 ? ` und ${blockers.length - 5} weitere` : ""}. Einzelne offene Beiträge lassen sich stattdessen streichen.`,
        );
      const now = new Date();
      await tx.charge.updateMany({
        where: { feeRunId: run.id, status: "OPEN" },
        data: {
          status: "VOID",
          voidedAt: now,
          voidedById: ctx.userId,
          voidReason: `Beitragslauf rückgängig: ${data.reason}`.slice(0, 300),
        },
      });
      await tx.feeRun.update({
        where: { id: run.id },
        data: {
          status: "REVERTED",
          revertedAt: now,
          revertedById: ctx.userId,
          revertReason: data.reason,
        },
      });
      await recordAudit(tx, auditActor(ctx), {
        action: "finance.fee_run_reverted",
        entityType: "FeeRun",
        entityId: run.id,
        summary: `Beitragslauf ${run.label} rückgängig gemacht (${run.chargeCount} Beiträge gestrichen): ${data.reason}`,
      });
    },
    { timeout: 60_000, maxWait: 15_000 },
  );
}

/** Einen offenen, unbezahlten Beitrag streichen (mit Grund). Seine Tage sind danach wieder frei. */
export async function voidCharge(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(chargeVoidSchema, input);
  await ctx.db.$transaction(async (tx) => {
    await lockUntilCommit(tx, ctx.clubId, "finance:fee-run");
    const charge = await tx.charge.findFirst({ where: { id: data.id } });
    if (!charge) throw notFound("Der Beitrag");
    if (charge.status === "VOID") throw conflict("Dieser Beitrag ist schon gestrichen.");
    if (charge.status !== "OPEN" || charge.paidCents > 0)
      throw conflict(
        "Ein (teilweise) bezahlter oder ausgebuchter Beitrag lässt sich nicht streichen.",
      );
    await tx.charge.update({
      where: { id: charge.id },
      data: {
        status: "VOID",
        voidedAt: new Date(),
        voidedById: ctx.userId,
        voidReason: data.reason,
      },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.charge_voided",
      entityType: "Charge",
      entityId: charge.id,
      summary: `Beitrag ${chargeNumber(charge.year, charge.number)} (${charge.debtorName}, ${formatEuroFromCents(charge.amountCents)}) gestrichen: ${data.reason}`,
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Lesen: Läufe und Beiträge
// ---------------------------------------------------------------------------------------------

export interface ChargeRow {
  id: string;
  number: string;
  title: string;
  memberId: string;
  familyId: string | null;
  debtorName: string;
  payerMemberId: string;
  payerName: string;
  periodLabel: string | null;
  dueDate: Date;
  amountCents: number;
  openCents: number;
  status: "OPEN" | "PAID" | "VOID" | "WRITTEN_OFF";
  /** Offen und die Fälligkeit liegt zurück. */
  overdue: boolean;
  paymentMethod: "TRANSFER" | "DIRECT_DEBIT" | "CASH";
  explanation: string;
  feeRunId: string | null;
}

const chargeSelect = {
  id: true,
  year: true,
  number: true,
  title: true,
  memberId: true,
  familyId: true,
  debtorName: true,
  payerMemberId: true,
  payerName: true,
  periodStart: true,
  feeRun: { select: { label: true } },
  dueDate: true,
  amountCents: true,
  paidCents: true,
  writtenOffCents: true,
  status: true,
  paymentMethod: true,
  explanation: true,
  feeRunId: true,
} satisfies Prisma.ChargeSelect;

function chargeRow(
  row: Prisma.ChargeGetPayload<{ select: typeof chargeSelect }>,
  today: Date,
): ChargeRow {
  const open = row.status === "OPEN" ? row.amountCents - row.paidCents - row.writtenOffCents : 0;
  return {
    id: row.id,
    number: chargeNumber(row.year, row.number),
    title: row.title,
    memberId: row.memberId,
    familyId: row.familyId,
    debtorName: row.debtorName,
    payerMemberId: row.payerMemberId,
    payerName: row.payerName,
    periodLabel: row.feeRun?.label ?? null,
    dueDate: row.dueDate,
    amountCents: row.amountCents,
    openCents: open,
    status: row.status,
    overdue: row.status === "OPEN" && row.dueDate.getTime() < today.getTime(),
    paymentMethod: row.paymentMethod,
    explanation: row.explanation,
    feeRunId: row.feeRunId,
  };
}

export type ChargeFilter = "offen" | "bezahlt" | "gestrichen" | "alle";

const FILTER_WHERE: Record<ChargeFilter, Prisma.ChargeWhereInput> = {
  offen: { status: "OPEN" },
  bezahlt: { status: { in: ["PAID", "WRITTEN_OFF"] } },
  gestrichen: { status: "VOID" },
  alle: {},
};

/** „Offene Beiträge“ (und die übrigen): nach Fälligkeit, dann Nummer. */
export async function listCharges(
  ctx: TenantContext,
  options: { filter?: ChargeFilter; q?: string; page?: number; pageSize?: number } = {},
): Promise<{
  items: ChargeRow[];
  total: number;
  counts: Record<ChargeFilter, number>;
  openCents: number;
  overdueCount: number;
}> {
  assertFinance(ctx, "finance:read");
  const filter = options.filter ?? "offen";
  const pageSize = options.pageSize ?? 50;
  const page = Math.max(1, options.page ?? 1);
  const q = options.q?.trim();
  // Nummer wie angezeigt („B-2026-0412“, „2026-0412“) oder nur die laufende Nummer („412“).
  const numberMatch = q ? /^(?:B-?)?(?:(\d{4})-)?0*(\d{1,9})$/i.exec(q) : null;
  const search: Prisma.ChargeWhereInput = q
    ? {
        OR: [
          { debtorName: { contains: q, mode: "insensitive" } },
          { payerName: { contains: q, mode: "insensitive" } },
          ...(numberMatch
            ? [
                numberMatch[1]
                  ? { year: Number(numberMatch[1]), number: Number(numberMatch[2]) }
                  : { number: Number(numberMatch[2]) },
              ]
            : []),
        ],
      }
    : {};
  const where = { ...FILTER_WHERE[filter], ...search };
  const today = todayCalendarDate();
  const [rows, total, grouped, open, overdueCount] = await Promise.all([
    ctx.db.charge.findMany({
      where,
      select: chargeSelect,
      orderBy: [{ dueDate: "asc" }, { year: "asc" }, { number: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    ctx.db.charge.count({ where }),
    ctx.db.charge.groupBy({ by: ["status"], where: search, _count: { _all: true } }),
    ctx.db.charge.aggregate({
      where: { status: "OPEN", ...search },
      _sum: { amountCents: true, paidCents: true },
    }),
    ctx.db.charge.count({ where: { status: "OPEN", dueDate: { lt: today }, ...search } }),
  ]);
  const countOf = (statuses: string[]) =>
    grouped.filter((g) => statuses.includes(g.status)).reduce((sum, g) => sum + g._count._all, 0);
  return {
    items: rows.map((row) => chargeRow(row, today)),
    total,
    counts: {
      offen: countOf(["OPEN"]),
      bezahlt: countOf(["PAID", "WRITTEN_OFF"]),
      gestrichen: countOf(["VOID"]),
      alle: countOf(["OPEN", "PAID", "WRITTEN_OFF", "VOID"]),
    },
    openCents: (open._sum.amountCents ?? 0) - (open._sum.paidCents ?? 0),
    overdueCount,
  };
}

export interface FeeRunDetail extends FeeRunSummary {
  periodStart: Date;
  periodEnd: Date;
  warnings: string[];
  charges: ChargeRow[];
  /** Was „rückgängig“ verhindert (leer = geht). */
  blockers: string[];
}

export async function getFeeRun(ctx: TenantContext, id: string): Promise<FeeRunDetail | null> {
  assertFinance(ctx, "finance:read");
  const run = await ctx.db.feeRun.findFirst({ where: { id } });
  if (!run) return null;
  const rows = await ctx.db.charge.findMany({
    where: { feeRunId: run.id },
    select: { ...chargeSelect, reminderLevel: true },
    orderBy: { number: "asc" },
  });
  const today = todayCalendarDate();
  return {
    ...runSummary(run),
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    warnings: Array.isArray(run.warnings) ? (run.warnings as string[]) : [],
    charges: rows.map((row) => chargeRow(row, today)),
    blockers:
      run.status === "CREATED"
        ? rows.map(blockerText).filter((text): text is string => text !== null)
        : [],
  };
}

/** Alle Läufe, neueste zuerst. */
export async function listFeeRuns(ctx: TenantContext): Promise<FeeRunSummary[]> {
  assertFinance(ctx, "finance:read");
  const runs = await ctx.db.feeRun.findMany({
    orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
  });
  return runs.map(runSummary);
}

export interface ChargeDetail extends ChargeRow {
  periodStart: Date | null;
  periodEnd: Date | null;
  paidCents: number;
  createdAt: Date;
  voidedAt: Date | null;
  voidReason: string | null;
  feeRun: { id: string; label: string } | null;
  lines: { id: string; text: string; amountCents: number; category: string }[];
}

export async function getCharge(ctx: TenantContext, id: string): Promise<ChargeDetail | null> {
  assertFinance(ctx, "finance:read");
  const row = await ctx.db.charge.findFirst({
    where: { id },
    select: {
      ...chargeSelect,
      periodEnd: true,
      createdAt: true,
      voidedAt: true,
      voidReason: true,
      feeRun: { select: { id: true, label: true } },
      lines: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          text: true,
          amountCents: true,
          category: { select: { name: true } },
        },
      },
    },
  });
  if (!row) return null;
  return {
    ...chargeRow(row, todayCalendarDate()),
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    paidCents: row.paidCents,
    createdAt: row.createdAt,
    voidedAt: row.voidedAt,
    voidReason: row.voidReason,
    feeRun: row.feeRun,
    lines: row.lines.map((l) => ({
      id: l.id,
      text: l.text,
      amountCents: l.amountCents,
      category: l.category.name,
    })),
  };
}

/** Für „Das steht an“: Ist für den laufenden (oder in drei Wochen beginnenden) Zeitraum noch kein Lauf erstellt? */
export async function feeRunDue(
  ctx: TenantContext,
): Promise<{ period: FeePeriod; next: boolean } | null> {
  assertFinance(ctx, "finance:read");
  const settings = await getFeeSettings(ctx);
  if (!settings.stored) return null;
  const types = await ctx.db.feeType.count({
    where: { archivedAt: null, kind: { in: ["BASE", "FAMILY"] } },
  });
  if (types === 0) return null;
  const today = todayCalendarDate();
  const current = periodFor(settings.feeInterval, today);
  // Erledigt, wenn ein Lauf den Zeitraum ganz enthält. Berühren ihn nur andere Läufe (nach einem Wechsel des Rhythmus),
  // entscheidet, ob noch etwas zu erstellen ist.
  const created = async (period: FeePeriod) => {
    const overlapping = await ctx.db.feeRun.findMany({
      where: {
        status: "CREATED",
        periodStart: { lte: period.end },
        periodEnd: { gte: period.start },
      },
      select: { periodStart: true, periodEnd: true },
    });
    if (overlapping.length === 0) return false;
    if (
      overlapping.some(
        (run) =>
          run.periodStart.getTime() <= period.start.getTime() &&
          run.periodEnd.getTime() >= period.end.getTime(),
      )
    )
      return true;
    const { preview } = await calculatePreview(ctx.db, settings, period, { withCoverage: true });
    return preview.charges.length === 0;
  };
  if (!(await created(current))) return { period: current, next: false };
  const upcoming = periodFor(settings.feeInterval, new Date(current.end.getTime() + DAY_MS));
  if (upcoming.start.getTime() - today.getTime() <= 21 * DAY_MS && !(await created(upcoming)))
    return { period: upcoming, next: true };
  return null;
}
