import type { Prisma } from "@/generated/prisma/client";
import {
  formatCalendarDate,
  formatEuroFromCents,
  parseCalendarDate,
  todayCalendarDate,
} from "@/lib/dates";
import { parseEuroToCents } from "@/lib/money";
import { parseInput } from "@/server/action";
import { recordAudit } from "@/server/audit/audit";
import { type TenantTx } from "@/server/db/tenant";
import { conflict, notFound, validationFailed } from "@/server/errors";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import { assertFinance, canFinance } from "@/modules/finance/access";
import { calculateFees } from "./engine";
import type {
  ChargePreview,
  EngineFamily,
  EngineFeeType,
  EngineInput,
  EngineMember,
  EnginePreview,
  EngineSettings,
  FeeIntervalValue,
} from "./engine-types";
import {
  nextPeriod,
  periodFor,
  previousPeriod,
  type BillingInterval,
  type FeePeriod,
} from "./periods";

export type { BillingInterval, FeePeriod };
export { nextPeriod, previousPeriod };
import {
  assignmentDeleteSchema,
  assignmentEndSchema,
  assignmentSchema,
  FEE_INTERVAL_LABEL,
  feeRateDeleteSchema,
  feeRateSchema,
  feeSettingsSchema,
  feeTypeArchiveSchema,
  feeTypeCreateSchema,
  feeTypeMoveSchema,
  FAMILY_MIN_MESSAGE,
  familyMinMembersValid,
  feeTypeUpdateSchema,
  kindWithoutRules,
  memberFinanceSchema,
} from "./schemas";

/**
 * Mitgliedsbeiträge: Beitragsarten mit Sätzen, Ermäßigungen und Zahler pflegen und „Wer zahlt was“ für einen Zeitraum
 * berechnen. Gerechnet wird im reinen Rechenkern (`engine.ts`) – hier wird geladen, geprüft und protokolliert. Ansehen
 * braucht `finance:read`, ändern `finance:manage` (beides vereinsweit).
 */

export interface FeeSettings extends EngineSettings {
  feeInterval: BillingInterval;
  dueDay: number;
  /** Ohne eingerichtetes Kassenbuch gelten die Vorgaben (und lassen sich nicht ändern). */
  stored: boolean;
}

const DEFAULT_SETTINGS: Omit<FeeSettings, "stored"> = {
  feeInterval: "QUARTERLY",
  dueDay: 15,
  proRataEntry: "DAY",
  proRataExit: "DAY",
  ageRule: "EXACT_DAY",
  missingBirthDateAsAdult: true,
  minDebitCents: 500,
};

export async function getFeeSettings(ctx: TenantContext): Promise<FeeSettings> {
  assertFinance(ctx, "finance:read");
  const row = await ctx.db.financeSettings.findUnique({ where: { clubId: ctx.clubId } });
  if (!row) return { ...DEFAULT_SETTINGS, stored: false };
  return {
    feeInterval: row.feeInterval === "ONCE" ? "QUARTERLY" : row.feeInterval,
    dueDay: row.dueDay,
    proRataEntry: row.proRataEntry,
    proRataExit: row.proRataExit,
    ageRule: row.ageRule,
    missingBirthDateAsAdult: row.missingBirthDateAsAdult,
    minDebitCents: row.minDebitCents,
    stored: true,
  };
}

export async function updateFeeSettings(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(feeSettingsSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const before = await tx.financeSettings.findUnique({ where: { clubId: ctx.clubId } });
    if (!before)
      throw conflict(
        "Bitte richte zuerst das Kassenbuch ein – danach lassen sich die Beiträge einstellen.",
      );
    await tx.financeSettings.update({
      where: { clubId: ctx.clubId },
      data: {
        feeInterval: data.feeInterval,
        dueDay: Number(data.dueDay),
        proRataEntry: data.proRataEntry,
        proRataExit: data.proRataExit,
        ageRule: data.ageRule,
        missingBirthDateAsAdult: data.missingBirthDateAsAdult,
        updatedById: ctx.userId,
      },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.fee_settings_updated",
      entityType: "FinanceSettings",
      entityId: before.id,
      summary: "Einstellungen für Beiträge geändert",
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Beitragsarten und Sätze
// ---------------------------------------------------------------------------------------------

/** Abteilungen zur Auswahl (Beitragsart „nur für …“, Zusatzbeitrag). */
export async function listFeeDepartments(
  ctx: TenantContext,
): Promise<{ id: string; name: string }[]> {
  assertFinance(ctx, "finance:read");
  return ctx.db.department.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export interface FeeRateDto {
  id: string;
  validFrom: Date;
  amountCents: number;
  interval: FeeIntervalValue;
  /** Gilt heute (der jüngste Satz mit „ab“ ≤ heute). */
  current: boolean;
  /** Gilt erst in Zukunft. */
  future: boolean;
  /** Lässt sich zurücknehmen (noch nicht gültig oder heute eingegeben). */
  removable: boolean;
}

export interface FeeTypeDto {
  id: string;
  name: string;
  kind: "BASE" | "ADDITIONAL" | "ADMISSION" | "FAMILY";
  department: { id: string; name: string } | null;
  statuses: ("ACTIVE" | "PASSIVE" | "LEFT" | "HONORARY" | "BLOCKED")[];
  minAge: number | null;
  maxAge: number | null;
  /** Nur beim Familienbeitrag. */
  familyMinMembers: number | null;
  priority: number;
  description: string | null;
  archived: boolean;
  rates: FeeRateDto[];
  /** Für wen, in einem Satz („Aktive und Gesperrte von 0 bis 17 Jahren, nur Fußball“). */
  ruleText: string;
  /** Aktueller Betrag als Text („12,00 € im Monat – 36,00 € im Quartal“). */
  rateText: string;
}

const STATUS_PLURAL: Record<string, string> = {
  ACTIVE: "Aktive",
  PASSIVE: "Passive",
  HONORARY: "Ehrenmitglieder",
  BLOCKED: "Gesperrte",
};

function ruleText(type: {
  kind: string;
  statuses: string[];
  minAge: number | null;
  maxAge: number | null;
  familyMinMembers: number | null;
  department: { name: string } | null;
}): string {
  if (type.kind === "ADMISSION") return "einmalig beim Eintritt";
  if (type.kind === "FAMILY")
    return `für Familien, sobald ${type.familyMinMembers ?? 2} Mitglieder einen Grundbeitrag zahlen würden`;
  const who = type.statuses.length
    ? type.statuses.map((s) => STATUS_PLURAL[s] ?? s).join(", ")
    : "Aktive, Passive und Gesperrte";
  const ages =
    type.minAge !== null && type.maxAge !== null
      ? ` von ${type.minAge} bis ${type.maxAge} Jahren`
      : type.minAge !== null
        ? ` ab ${type.minAge} Jahren`
        : type.maxAge !== null
          ? ` bis ${type.maxAge} Jahre`
          : "";
  const department = type.department
    ? type.kind === "ADDITIONAL"
      ? `, Mitglieder von ${type.department.name}`
      : `, nur ${type.department.name}`
    : "";
  return `${who}${ages}${department}`;
}

const MONTHS: Record<FeeIntervalValue, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  YEARLY: 12,
  ONCE: 0,
};

/** „12,00 € im Monat – 36,00 € im Quartal“ (zweiter Teil im Rhythmus des Beitragslaufs). */
export function rateText(
  rate: { amountCents: number; interval: FeeIntervalValue } | undefined,
  billing: BillingInterval,
): string {
  if (!rate) return "kein Betrag";
  if (rate.amountCents === 0) return "beitragsfrei";
  const own = `${formatEuroFromCents(rate.amountCents)} ${FEE_INTERVAL_LABEL[rate.interval]}`;
  if (rate.interval === "ONCE" || rate.interval === billing) return own;
  const perBilling = Math.round((rate.amountCents * MONTHS[billing]) / MONTHS[rate.interval]);
  return `${own} – ${formatEuroFromCents(perBilling)} ${FEE_INTERVAL_LABEL[billing]}`;
}

const feeTypeInclude = {
  department: { select: { id: true, name: true } },
  rates: { orderBy: { validFrom: "asc" } },
} satisfies Prisma.FeeTypeInclude;

type FeeTypeRow = Prisma.FeeTypeGetPayload<{ include: typeof feeTypeInclude }>;

function feeTypeDto(row: FeeTypeRow, today: Date, billing: BillingInterval): FeeTypeDto {
  const current = [...row.rates].reverse().find((r) => r.validFrom.getTime() <= today.getTime());
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    department: row.department,
    statuses: row.statuses,
    minAge: row.minAge,
    maxAge: row.maxAge,
    familyMinMembers: row.familyMinMembers,
    priority: row.priority,
    description: row.description,
    archived: row.archivedAt !== null,
    rates: row.rates.map((rate) => ({
      id: rate.id,
      validFrom: rate.validFrom,
      amountCents: rate.amountCents,
      interval: rate.interval,
      current: rate.id === current?.id,
      future: rate.validFrom.getTime() > today.getTime(),
      removable: rateRemovable(rate, today),
    })),
    ruleText: ruleText(row),
    // Gilt noch kein Betrag (alles ab einem späteren Tag): das deutlich sagen statt einen künftigen als heutigen zu zeigen.
    rateText: current
      ? rateText(current, billing)
      : row.rates[0]
        ? `noch kein Betrag – ab ${formatCalendarDate(row.rates[0].validFrom)}: ${rateText(row.rates[0], billing)}`
        : "kein Betrag",
  };
}

/** Alle Beitragsarten: Grundbeiträge in der Reihenfolge, in der sie geprüft werden, dann die übrigen. */
export async function listFeeTypes(ctx: TenantContext): Promise<FeeTypeDto[]> {
  assertFinance(ctx, "finance:read");
  const [rows, settings] = await Promise.all([
    ctx.db.feeType.findMany({
      include: feeTypeInclude,
      orderBy: [{ kind: "asc" }, { priority: "asc" }, { name: "asc" }],
    }),
    getFeeSettings(ctx),
  ]);
  const today = todayCalendarDate();
  return rows.map((row) => feeTypeDto(row, today, settings.feeInterval));
}

async function assertNameFree(tx: TenantTx, name: string, exceptId?: string) {
  const taken = await tx.feeType.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (taken) throw validationFailed({ name: ["Eine Beitragsart mit diesem Namen gibt es schon."] });
}

async function assertDepartment(tx: TenantTx, departmentId: string | undefined) {
  if (!departmentId) return null;
  const department = await tx.department.findFirst({
    where: { id: departmentId },
    select: { id: true, name: true },
  });
  if (!department) throw validationFailed({ departmentId: ["Bitte wähle eine Abteilung."] });
  return department;
}

const ageValue = (text: string | undefined) => (text === undefined ? null : Number(text));

export async function createFeeType(ctx: TenantContext, input: unknown): Promise<{ id: string }> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(feeTypeCreateSchema, input);
  return ctx.db.$transaction(async (tx) => {
    await assertNameFree(tx, data.name);
    const department = await assertDepartment(tx, data.departmentId);
    // Neue Grundbeiträge kommen ans Ende der Reihenfolge.
    const last = await tx.feeType.aggregate({
      where: { kind: "BASE", archivedAt: null },
      _max: { priority: true },
    });
    const type = await tx.feeType.create({
      data: {
        clubId: ctx.clubId,
        name: data.name,
        kind: data.kind,
        departmentId: kindWithoutRules(data.kind) ? null : (department?.id ?? null),
        statuses: kindWithoutRules(data.kind) ? [] : data.statuses,
        minAge: kindWithoutRules(data.kind) ? null : ageValue(data.minAge),
        maxAge: kindWithoutRules(data.kind) ? null : ageValue(data.maxAge),
        familyMinMembers: data.kind === "FAMILY" ? Number(data.familyMinMembers) : null,
        priority: data.kind === "BASE" ? (last._max.priority ?? 0) + 10 : 100,
        description: data.description || null,
      },
    });
    await tx.feeRate.create({
      data: {
        clubId: ctx.clubId,
        feeTypeId: type.id,
        validFrom: parseCalendarDate(data.validFrom)!,
        amountCents: parseEuroToCents(data.amount)!,
        interval: data.interval,
        createdById: ctx.userId,
      },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.fee_type_created",
      entityType: "FeeType",
      entityId: type.id,
      summary: `Beitragsart „${type.name}“ angelegt (${formatEuroFromCents(parseEuroToCents(data.amount)!)} ${FEE_INTERVAL_LABEL[data.interval]} ab ${formatCalendarDate(parseCalendarDate(data.validFrom))})`,
    });
    return { id: type.id };
  });
}

export async function updateFeeType(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(feeTypeUpdateSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const type = await tx.feeType.findFirst({ where: { id: data.id } });
    if (!type) throw notFound("Die Beitragsart");
    await assertNameFree(tx, data.name, type.id);
    const department = await assertDepartment(tx, data.departmentId);
    if (type.kind === "ADDITIONAL" && !department)
      throw validationFailed({ departmentId: ["Ein Zusatzbeitrag gehört zu einer Abteilung."] });
    if (type.kind === "FAMILY" && !familyMinMembersValid(data.familyMinMembers))
      throw validationFailed({
        familyMinMembers: [
          data.familyMinMembers === undefined
            ? "Bitte angeben, ab wie vielen Mitgliedern der Familienbeitrag gilt."
            : FAMILY_MIN_MESSAGE,
        ],
      });
    const noRules = kindWithoutRules(type.kind);
    await tx.feeType.update({
      where: { id: type.id },
      data: {
        name: data.name,
        departmentId: noRules ? null : (department?.id ?? null),
        statuses: noRules ? [] : data.statuses,
        minAge: noRules ? null : ageValue(data.minAge),
        maxAge: noRules ? null : ageValue(data.maxAge),
        familyMinMembers: type.kind === "FAMILY" ? Number(data.familyMinMembers) : null,
        description: data.description || null,
      },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.fee_type_updated",
      entityType: "FeeType",
      entityId: type.id,
      summary: `Beitragsart „${type.name}“ geändert`,
      changes: type.name !== data.name ? { name: { from: type.name, to: data.name } } : {},
    });
  });
}

/** Archivieren: nicht mehr berechnet. Wieder aktivieren reiht einen Grundbeitrag hinten ein. */
export async function archiveFeeType(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(feeTypeArchiveSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const type = await tx.feeType.findFirst({ where: { id: data.id } });
    if (!type) throw notFound("Die Beitragsart");
    if (data.archived === (type.archivedAt !== null)) return;
    let priority = type.priority;
    if (!data.archived && type.kind === "BASE") {
      const last = await tx.feeType.aggregate({
        where: { kind: "BASE", archivedAt: null },
        _max: { priority: true },
      });
      priority = (last._max.priority ?? 0) + 10;
    }
    await tx.feeType.update({
      where: { id: type.id },
      data: { archivedAt: data.archived ? new Date() : null, priority },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: data.archived ? "finance.fee_type_archived" : "finance.fee_type_restored",
      entityType: "FeeType",
      entityId: type.id,
      summary: `Beitragsart „${type.name}“ ${data.archived ? "archiviert" : "wieder aktiviert"}`,
    });
  });
}

/** Grundbeitrag eine Stelle nach oben/unten (tauscht die Reihenfolge mit dem Nachbarn). */
export async function moveFeeType(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(feeTypeMoveSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const type = await tx.feeType.findFirst({
      where: { id: data.id, kind: "BASE", archivedAt: null },
    });
    if (!type) throw notFound("Die Beitragsart");
    const neighbour = await tx.feeType.findFirst({
      where: {
        kind: "BASE",
        archivedAt: null,
        priority: data.direction === "up" ? { lt: type.priority } : { gt: type.priority },
      },
      orderBy: { priority: data.direction === "up" ? "desc" : "asc" },
    });
    if (!neighbour) return;
    // Tauschen über einen freien Zwischenwert – die Reihenfolge ist je Verein eindeutig.
    await tx.feeType.update({ where: { id: type.id }, data: { priority: 10_000 } });
    await tx.feeType.update({ where: { id: neighbour.id }, data: { priority: type.priority } });
    await tx.feeType.update({ where: { id: type.id }, data: { priority: neighbour.priority } });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.fee_type_updated",
      entityType: "FeeType",
      entityId: type.id,
      summary: `Reihenfolge der Beitragsart „${type.name}“ geändert`,
    });
  });
}

/** „Neuer Betrag ab …“ – frühere Sätze bleiben, damit vergangene Zeiträume richtig gerechnet bleiben. */
export async function addFeeRate(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(feeRateSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const type = await tx.feeType.findFirst({ where: { id: data.feeTypeId } });
    if (!type) throw notFound("Die Beitragsart");
    if ((type.kind === "ADMISSION") !== (data.interval === "ONCE"))
      throw validationFailed({
        interval: [
          type.kind === "ADMISSION"
            ? "Eine Aufnahmegebühr ist einmalig."
            : "„Einmalig“ gibt es nur bei der Aufnahmegebühr.",
        ],
      });
    const validFrom = parseCalendarDate(data.validFrom)!;
    const taken = await tx.feeRate.findFirst({ where: { feeTypeId: type.id, validFrom } });
    if (taken) throw validationFailed({ validFrom: ["Ab diesem Tag gibt es schon einen Betrag."] });
    const amountCents = parseEuroToCents(data.amount)!;
    await tx.feeRate.create({
      data: {
        clubId: ctx.clubId,
        feeTypeId: type.id,
        validFrom,
        amountCents,
        interval: data.interval,
        createdById: ctx.userId,
      },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.fee_rate_added",
      entityType: "FeeType",
      entityId: type.id,
      summary: `„${type.name}“: ${formatEuroFromCents(amountCents)} ${FEE_INTERVAL_LABEL[data.interval]} ab ${formatCalendarDate(validFrom)}`,
    });
  });
}

/** Zurücknehmen geht, solange ein Betrag bzw. eine Regel noch nicht gilt – oder am Tag der Eingabe (vertippt). */
export function rateRemovable(row: { validFrom: Date; createdAt: Date }, today: Date): boolean {
  return (
    row.validFrom.getTime() > today.getTime() ||
    todayCalendarDate(row.createdAt).getTime() === today.getTime()
  );
}

/** Einen künftigen (oder heute vertippten) Betrag zurücknehmen – geltende bleiben, das sichert die Datenbank. */
export async function deleteFeeRate(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const { id } = parseInput(feeRateDeleteSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const rate = await tx.feeRate.findFirst({
      where: { id },
      include: { feeType: { select: { id: true, name: true } } },
    });
    if (!rate) throw notFound("Der Betrag");
    if (!rateRemovable(rate, todayCalendarDate()))
      throw conflict(
        "Ein Betrag, der schon gilt, bleibt erhalten – lege stattdessen einen neuen ab einem Datum an.",
      );
    const others = await tx.feeRate.count({ where: { feeTypeId: rate.feeType.id, NOT: { id } } });
    if (others === 0) throw conflict("Eine Beitragsart braucht mindestens einen Betrag.");
    await tx.feeRate.delete({ where: { id } });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.fee_rate_deleted",
      entityType: "FeeType",
      entityId: rate.feeType.id,
      summary: `„${rate.feeType.name}“: Betrag ab ${formatCalendarDate(rate.validFrom)} zurückgenommen`,
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Mitglieder: Zahler, Zahlweg, Ermäßigungen
// ---------------------------------------------------------------------------------------------

export async function updateMemberFinance(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(memberFinanceSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const member = await tx.member.findFirst({
      where: { id: data.memberId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!member) throw notFound("Das Mitglied");
    if (data.payerMemberId) {
      if (data.payerMemberId === member.id)
        throw validationFailed({
          payerMemberId: ["Das Mitglied zahlt dann selbst – bitte „selbst“ wählen."],
        });
      const payer = await tx.member.findFirst({
        where: { id: data.payerMemberId, deletedAt: null },
        select: { id: true },
      });
      if (!payer) throw validationFailed({ payerMemberId: ["Bitte wähle, wer zahlt."] });
    }
    const values = {
      payerMemberId: data.payerMemberId ?? null,
      paymentMethod: data.paymentMethod,
      note: data.note || null,
      updatedById: ctx.userId,
    };
    await tx.memberFinance.upsert({
      where: { clubId_memberId: { clubId: ctx.clubId, memberId: member.id } },
      create: { clubId: ctx.clubId, memberId: member.id, ...values },
      update: values,
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.member_finance_updated",
      entityType: "Member",
      entityId: member.id,
      summary: `Beitrag von ${member.firstName} ${member.lastName}: Zahler und Zahlweg geändert`,
    });
  });
}

export async function addAssignment(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(assignmentSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const member = await tx.member.findFirst({
      where: { id: data.memberId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!member) throw notFound("Das Mitglied");
    if (data.kind === "ASSIGN") {
      const type = await tx.feeType.findFirst({
        where: { id: data.feeTypeId, kind: "BASE", archivedAt: null },
        select: { id: true },
      });
      if (!type) throw validationFailed({ feeTypeId: ["Bitte wähle eine Beitragsart."] });
    }
    const validFrom = parseCalendarDate(data.validFrom)!;
    const validTo = data.validTo ? parseCalendarDate(data.validTo) : null;
    // Überschneidung vorab prüfen (freundliche Meldung; die Datenbank sichert es zusätzlich ab).
    const overlap = await tx.memberFeeAssignment.findFirst({
      where: {
        memberId: member.id,
        ...(data.kind === "ASSIGN" ? { kind: "ASSIGN" } : { kind: { not: "ASSIGN" } }),
        validFrom: validTo ? { lte: validTo } : undefined,
        OR: [{ validTo: null }, { validTo: { gte: validFrom } }],
      },
    });
    if (overlap)
      throw conflict(
        data.kind === "ASSIGN"
          ? "Für diesen Zeitraum gibt es schon eine feste Beitragsart – beende sie zuerst."
          : "Für diesen Zeitraum gibt es schon eine Ermäßigung oder Befreiung – beende sie zuerst.",
      );
    const percentBp =
      data.kind === "DISCOUNT_PERCENT"
        ? Math.round(Number(data.percent!.replace(",", ".")) * 100)
        : null;
    const amountCents = data.kind === "FIXED_AMOUNT" ? parseEuroToCents(data.amount!)! : null;
    await tx.memberFeeAssignment.create({
      data: {
        clubId: ctx.clubId,
        memberId: member.id,
        kind: data.kind,
        feeTypeId: data.kind === "ASSIGN" ? data.feeTypeId! : null,
        percentBp,
        amountCents,
        validFrom,
        validTo,
        reason: data.reason || null,
        createdById: ctx.userId,
      },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.assignment_created",
      entityType: "Member",
      entityId: member.id,
      summary: `Beitrag von ${member.firstName} ${member.lastName}: ${assignmentSummary(data.kind, percentBp, amountCents, data.reason)} ab ${formatCalendarDate(validFrom)}`,
    });
  });
}

function assignmentSummary(
  kind: string,
  percentBp: number | null,
  amountCents: number | null,
  reason: string | undefined,
): string {
  const why = reason ? ` (${reason})` : "";
  if (kind === "DISCOUNT_PERCENT") return `${formatPercent(percentBp!)} ermäßigt${why}`;
  if (kind === "FIXED_AMOUNT")
    return `fester Betrag ${formatEuroFromCents(amountCents!)} im Monat${why}`;
  if (kind === "EXEMPT") return `beitragsfrei${why}`;
  return "feste Beitragsart";
}

export const formatPercent = (bp: number) =>
  `${(bp / 100).toLocaleString("de-DE", { maximumFractionDigits: 2 })} %`;

/** Regel beenden (letzter Tag). Liegt der Beginn noch in der Zukunft, wird sie stattdessen gelöscht. */
export async function endAssignment(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(assignmentEndSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const row = await tx.memberFeeAssignment.findFirst({
      where: { id: data.id },
      include: { member: { select: { firstName: true, lastName: true } } },
    });
    if (!row) throw notFound("Die Regel");
    const validTo = parseCalendarDate(data.validTo)!;
    const today = todayCalendarDate();
    if (row.validFrom.getTime() > today.getTime() && validTo.getTime() < row.validFrom.getTime()) {
      await tx.memberFeeAssignment.delete({ where: { id: row.id } });
    } else {
      if (validTo.getTime() < row.validFrom.getTime())
        throw validationFailed({ validTo: ["Das Ende liegt vor dem Beginn."] });
      if (row.validTo && validTo.getTime() > row.validTo.getTime())
        throw validationFailed({ validTo: ["Eine Regel lässt sich nur früher beenden."] });
      await tx.memberFeeAssignment.update({
        where: { id: row.id },
        data: { validTo, endedById: ctx.userId },
      });
    }
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.assignment_ended",
      entityType: "Member",
      entityId: row.memberId,
      summary: `Beitrag von ${row.member.firstName} ${row.member.lastName}: Regel endet am ${formatCalendarDate(validTo)}`,
    });
  });
}

/** Regel entfernen, solange sie noch nicht gilt oder heute angelegt wurde (versehentlich, falsches Mitglied). */
export async function deleteAssignment(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const { id } = parseInput(assignmentDeleteSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const row = await tx.memberFeeAssignment.findFirst({
      where: { id },
      include: { member: { select: { firstName: true, lastName: true } } },
    });
    if (!row) throw notFound("Die Regel");
    if (!rateRemovable(row, todayCalendarDate()))
      throw conflict("Diese Regel gilt schon länger – beende sie stattdessen.");
    await tx.memberFeeAssignment.delete({ where: { id: row.id } });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.assignment_deleted",
      entityType: "Member",
      entityId: row.memberId,
      summary: `Beitrag von ${row.member.firstName} ${row.member.lastName}: Regel entfernt`,
    });
  });
}

// ---------------------------------------------------------------------------------------------
// „Wer zahlt was“
// ---------------------------------------------------------------------------------------------

/** Zeitraum im Rhythmus des Vereins, der `day` enthält (Vorgabe: heute). */
export function billingPeriod(
  interval: BillingInterval,
  day: Date = todayCalendarDate(),
): FeePeriod {
  const period = periodFor(interval, day);
  return { start: period.start, end: period.end, label: period.label };
}

const engineFeeTypes = (rows: FeeTypeRow[]): EngineFeeType[] =>
  rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    departmentId: row.departmentId,
    statuses: row.statuses,
    minAge: row.minAge,
    maxAge: row.maxAge,
    familyMinMembers: row.familyMinMembers,
    priority: row.priority,
    archived: row.archivedAt !== null,
    rates: row.rates.map((rate) => ({
      id: rate.id,
      validFrom: rate.validFrom,
      amountCents: rate.amountCents,
      interval: rate.interval,
    })),
  }));

const memberSelect = {
  id: true,
  firstName: true,
  lastName: true,
  birthDate: true,
  joinedAt: true,
  leftAt: true,
  status: true,
  archivedAt: true,
  deletedAt: true,
  anonymizedAt: true,
  // In der Reihenfolge der Erfassung – die Datenbank sortiert genauer, als JavaScript Zeitpunkte kennt.
  statusChanges: {
    select: { status: true, validFrom: true, createdAt: true },
    orderBy: [{ createdAt: "asc" }, { validFrom: "asc" }],
  },
  departments: { select: { departmentId: true, since: true, createdAt: true } },
  feeAssignments: true,
  finance: { select: { payerMemberId: true, paymentMethod: true } },
} satisfies Prisma.MemberSelect;

type MemberRow = Prisma.MemberGetPayload<{ select: typeof memberSelect }>;

/**
 * Status-Verlauf in der Reihenfolge, in der er erfasst wurde: Ein späterer Eintrag ersetzt frühere, die ab demselben oder
 * einem späteren Tag gelten sollten. Beispiel: Kündigung zum 31.12. erfasst, am 10.10. zurückgenommen – danach gilt „aktiv“
 * auch über den 31.12. hinaus.
 */
export function effectiveHistory<T extends { validFrom: Date }>(
  /** In der Reihenfolge der Erfassung (älteste zuerst). */
  rows: T[],
): T[] {
  let result: T[] = [];
  for (const row of rows) {
    result = result.filter((earlier) => earlier.validFrom.getTime() < row.validFrom.getTime());
    result.push(row);
  }
  return result;
}

function engineMember(
  row: MemberRow,
  methodOf: Map<string, EngineMember["paymentMethod"]>,
  inactivePayers: Set<string>,
): EngineMember {
  // Ein archivierter, gelöschter oder anonymisierter Zahler zahlt nicht mehr – bis ein neuer gewählt ist, das Mitglied selbst.
  const assigned = row.finance?.payerMemberId ?? null;
  const payer = assigned && !inactivePayers.has(assigned) ? assigned : null;
  return {
    id: row.id,
    name: `${row.firstName} ${row.lastName}`,
    shortName: row.firstName,
    birthDate: row.birthDate,
    joinedAt: row.joinedAt,
    leftAt: row.leftAt,
    status: row.status,
    inactive: row.archivedAt !== null || row.deletedAt !== null || row.anonymizedAt !== null,
    statusHistory: effectiveHistory(row.statusChanges),
    // Ohne „seit“ zählt die Abteilung ab dem Tag, an dem sie dem Mitglied zugeordnet wurde – so verschiebt eine neue
    // Zuordnung nicht rückwirkend frühere Zeiträume (Zusatzbeitrag erst ab dem Eintritt in die Abteilung).
    departments: row.departments.map((d) => ({
      departmentId: d.departmentId,
      since: d.since ?? todayCalendarDate(d.createdAt),
    })),
    assignments: row.feeAssignments.map((a) => ({
      id: a.id,
      kind: a.kind,
      feeTypeId: a.feeTypeId,
      percentBp: a.percentBp,
      amountCents: a.amountCents,
      validFrom: a.validFrom,
      validTo: a.validTo,
      reason: a.reason,
    })),
    payerMemberId: payer,
    // Wie bezahlt wird, bestimmt der Zahler (zahlt die Mutter per Lastschrift, gilt das für alle Kinder).
    paymentMethod:
      (payer ? methodOf.get(payer) : undefined) ?? row.finance?.paymentMethod ?? "TRANSFER",
  };
}

export interface WhoPays extends EnginePreview {
  period: FeePeriod;
  settings: FeeSettings;
  feeTypeCount: number;
}

/** „Wer zahlt was“ im Zeitraum `period` (Vorgabe: der laufende). Für alle Mitglieder oder ein einzelnes. */
export async function whoPays(
  ctx: TenantContext,
  options: { period?: FeePeriod; memberId?: string } = {},
): Promise<WhoPays> {
  assertFinance(ctx, "finance:read");
  const settings = await getFeeSettings(ctx);
  const period = options.period ?? billingPeriod(settings.feeInterval);
  // Familien, die den Zeitraum berühren (bei einem einzelnen Mitglied nur seine).
  const familyRows = await ctx.db.feeFamily.findMany({
    where: {
      ...(options.memberId ? { members: { some: { memberId: options.memberId } } } : {}),
    },
    include: {
      members: {
        where: {
          validFrom: { lte: period.end },
          OR: [{ validTo: null }, { validTo: { gte: period.start } }],
        },
        select: { memberId: true, validFrom: true, validTo: true },
      },
    },
  });
  // Ein einzelnes Mitglied: mit den übrigen Mitgliedern und Zahlern seiner Familien – ob der Familienbeitrag gilt, hängt
  // von allen ab.
  const memberIds = options.memberId
    ? [
        ...new Set([
          options.memberId,
          ...familyRows.flatMap((f) => [f.payerMemberId, ...f.members.map((m) => m.memberId)]),
        ]),
      ]
    : null;
  const [feeTypes, members] = await Promise.all([
    ctx.db.feeType.findMany({ include: feeTypeInclude }),
    ctx.db.member.findMany({
      where: memberIds ? { id: { in: memberIds } } : {},
      select: memberSelect,
    }),
  ]);
  // Zahler, die nicht selbst in der Liste stehen (Einzelansicht): Name und Zahlweg nachladen.
  const payerIds = [
    ...new Set(members.map((m) => m.finance?.payerMemberId).filter((id): id is string => !!id)),
  ].filter((id) => !members.some((m) => m.id === id));
  const payers = payerIds.length
    ? await ctx.db.member.findMany({
        where: { id: { in: payerIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          archivedAt: true,
          deletedAt: true,
          anonymizedAt: true,
          finance: { select: { paymentMethod: true } },
        },
      })
    : [];
  const inactive = (m: {
    archivedAt: Date | null;
    deletedAt: Date | null;
    anonymizedAt: Date | null;
  }) => m.archivedAt !== null || m.deletedAt !== null || m.anonymizedAt !== null;
  const inactivePayers = new Set([
    ...members.filter(inactive).map((m) => m.id),
    ...payers.filter(inactive).map((p) => p.id),
  ]);
  const methodOf = new Map<string, EngineMember["paymentMethod"]>([
    ...members.map((m) => [m.id, m.finance?.paymentMethod ?? "TRANSFER"] as const),
    ...payers.map((p) => [p.id, p.finance?.paymentMethod ?? "TRANSFER"] as const),
  ]);
  const families: EngineFamily[] = familyRows
    .filter((f) => f.members.length > 0)
    .map((f) => ({
      id: f.id,
      name: f.name,
      feeTypeId: f.feeTypeId,
      payerMemberId: f.payerMemberId,
      members: f.members,
    }));
  const input: EngineInput = {
    periodStart: period.start,
    periodEnd: period.end,
    feeTypes: engineFeeTypes(feeTypes),
    settings,
    members: members.map((row) => engineMember(row, methodOf, inactivePayers)),
    families,
    payerNames: Object.fromEntries(payers.map((p) => [p.id, `${p.firstName} ${p.lastName}`])),
  };
  let preview = calculateFees(input);
  // Hinweis für Mitglieder, deren Zahler nicht mehr aktiv ist: Bis ein neuer gewählt ist, zahlen sie selbst – bzw. in
  // einer Familie deren Zahler.
  for (const row of members) {
    const payerId = row.finance?.payerMemberId;
    if (!payerId || !inactivePayers.has(payerId) || inactive(row)) continue;
    const own = preview.charges.find((c) => c.key === `m:${row.id}`);
    const until = !own
      ? ""
      : own.payerMemberId === row.id
        ? ` Bis dahin zahlt ${row.firstName} selbst.`
        : ` Bis dahin zahlt ${own.payerName} (Zahler der Familie).`;
    preview.warnings.push({
      code: "PAYER_NOT_MEMBER",
      memberId: row.id,
      text: `Der Zahler von ${row.firstName} ${row.lastName} ist nicht mehr aktiv (archiviert oder gelöscht) – bitte einen neuen wählen.${until}`,
    });
  }
  if (options.memberId) {
    // Hinweise zu den eigenen Familien (z. B. „Familienbeitrag greift nicht“) gehören auf die Karte des Mitglieds.
    const ownFamilies = families
      .filter((f) => f.members.some((m) => m.memberId === options.memberId))
      .map((f) => f.id);
    preview = onlyMember(preview, options.memberId, ownFamilies);
  }
  return {
    ...preview,
    period,
    settings,
    feeTypeCount: feeTypes.filter((t) => t.archivedAt === null).length,
  };
}

/** Aus einer Vorschau mit Familienmitgliedern nur das, was ein Mitglied betrifft (eigene Zeile, seine Familie). */
function onlyMember(
  preview: EnginePreview,
  memberId: string,
  ownFamilies: string[],
): EnginePreview {
  const charges = preview.charges.filter((charge) =>
    charge.family
      ? charge.family.members.some((m) => m.id === memberId)
      : charge.memberId === memberId,
  );
  const familyIds = new Set([
    ...ownFamilies,
    ...charges.flatMap((charge) => (charge.family ? [charge.family.id] : [])),
  ]);
  for (const covered of preview.covered)
    if (covered.memberId === memberId) familyIds.add(covered.familyId);
  return {
    charges,
    exempt: preview.exempt.filter((e) => e.memberId === memberId && !e.familyId),
    covered: preview.covered.filter((c) => c.memberId === memberId),
    skipped: preview.skipped.filter((s) => s.memberId === memberId),
    warnings: preview.warnings.filter((w) =>
      w.familyId ? familyIds.has(w.familyId) : w.memberId === memberId,
    ),
    totalCents: charges.reduce((total, charge) => total + charge.amountCents, 0),
  };
}

export interface MemberFeeInfo {
  period: FeePeriod;
  /** Eigener Betrag im laufenden Zeitraum, `null` = keiner (beitragsfrei, über die Familie, nicht berechnet). */
  charge: ChargePreview | null;
  /** Familienbeiträge, die im Zeitraum den Grundbeitrag des Mitglieds abdecken (bei einem Wechsel zwei). */
  familyCharges: ChargePreview[];
  exempt: string | null;
  warnings: string[];
  paymentMethod: "TRANSFER" | "DIRECT_DEBIT" | "CASH";
  /** Ausdrücklich gewählter Zahler. */
  payer: { id: string; name: string } | null;
  /** Familie, in der das Mitglied heute ist (bzw. als nächstes sein wird), mit ihrem Zahler. */
  family: {
    id: string;
    name: string;
    validFrom: Date;
    validTo: Date | null;
    payer: { id: string; name: string };
  } | null;
  /** Mitglieder, für die dieses Mitglied zahlt. */
  paysFor: { id: string; name: string }[];
  /** Familien, für die dieses Mitglied zahlt. */
  paysForFamilies: { id: string; name: string }[];
  note: string | null;
  assignments: {
    id: string;
    kind: "ASSIGN" | "EXEMPT" | "DISCOUNT_PERCENT" | "FIXED_AMOUNT";
    text: string;
    validFrom: Date;
    validTo: Date | null;
    /** Läuft (noch) – lässt sich beenden. */
    open: boolean;
    /** Noch nicht gültig oder heute angelegt – lässt sich ganz entfernen. */
    removable: boolean;
  }[];
  canManage: boolean;
}

/** Auswahl für „Wer zahlt?“ und „Feste Beitragsart“ im Fenster eines Mitglieds. */
export async function memberFeeOptions(
  ctx: TenantContext,
  memberId: string,
): Promise<{
  payers: { value: string; label: string }[];
  feeTypes: { value: string; label: string }[];
}> {
  assertFinance(ctx, "finance:manage");
  const [members, types] = await Promise.all([
    ctx.db.member.findMany({
      where: {
        id: { not: memberId },
        deletedAt: null,
        anonymizedAt: null,
        // Wer selbst einen anderen Zahler hat, kommt nicht in Frage (keine Ketten).
        OR: [{ finance: { is: null } }, { finance: { is: { payerMemberId: null } } }],
      },
      select: { id: true, firstName: true, lastName: true, status: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    ctx.db.feeType.findMany({
      where: { kind: "BASE", archivedAt: null },
      select: { id: true, name: true },
      orderBy: { priority: "asc" },
    }),
  ]);
  return {
    payers: members.map((m) => ({
      value: m.id,
      label: `${m.lastName}, ${m.firstName}${m.status === "LEFT" ? " (ausgetreten)" : ""}`,
    })),
    feeTypes: types.map((t) => ({ value: t.id, label: t.name })),
  };
}

/** Karte „Beitrag“ auf der Seite eines Mitglieds. */
export async function getMemberFee(
  ctx: TenantContext,
  memberId: string,
): Promise<MemberFeeInfo | null> {
  if (!canFinance(ctx, "finance:read")) return null;
  const member = await ctx.db.member.findFirst({
    where: { id: memberId },
    select: {
      id: true,
      finance: {
        select: {
          paymentMethod: true,
          note: true,
          payer: { select: { id: true, firstName: true, lastName: true } },
        },
      },
      paysFor: { select: { member: { select: { id: true, firstName: true, lastName: true } } } },
      // Familien, die noch laufen (nicht aufgelöst, jemand heute oder künftig dabei).
      paysForFamilies: {
        where: {
          archivedAt: null,
          members: {
            some: { OR: [{ validTo: null }, { validTo: { gte: todayCalendarDate() } }] },
          },
        },
        select: { id: true, name: true },
      },
      feeFamilies: {
        where: { OR: [{ validTo: null }, { validTo: { gte: todayCalendarDate() } }] },
        orderBy: { validFrom: "asc" },
        take: 1,
        select: {
          validFrom: true,
          validTo: true,
          family: {
            select: {
              id: true,
              name: true,
              payer: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
      feeAssignments: {
        orderBy: { validFrom: "desc" },
        include: { feeType: { select: { name: true } } },
      },
    },
  });
  if (!member) return null;
  const result = await whoPays(ctx, { memberId });
  const today = todayCalendarDate();
  const charge = result.charges.find((c) => c.family === null) ?? null;
  const familyCharges = result.charges.filter((c) => c.family !== null);
  const membership = member.feeFamilies[0];
  return {
    period: result.period,
    charge,
    familyCharges,
    exempt: result.exempt[0]?.reason ?? result.skipped[0]?.reason ?? null,
    warnings: result.warnings.map((w) => w.text),
    paymentMethod: member.finance?.paymentMethod ?? "TRANSFER",
    payer: member.finance?.payer
      ? {
          id: member.finance.payer.id,
          name: `${member.finance.payer.firstName} ${member.finance.payer.lastName}`,
        }
      : null,
    family: membership
      ? {
          id: membership.family.id,
          name: membership.family.name,
          validFrom: membership.validFrom,
          validTo: membership.validTo,
          payer: {
            id: membership.family.payer.id,
            name: `${membership.family.payer.firstName} ${membership.family.payer.lastName}`,
          },
        }
      : null,
    paysFor: member.paysFor.map((f) => ({
      id: f.member.id,
      name: `${f.member.firstName} ${f.member.lastName}`,
    })),
    paysForFamilies: member.paysForFamilies,
    note: member.finance?.note ?? null,
    assignments: member.feeAssignments.map((a) => ({
      id: a.id,
      kind: a.kind,
      text:
        a.kind === "ASSIGN"
          ? `Feste Beitragsart: ${a.feeType?.name ?? "–"}`
          : assignmentSummary(a.kind, a.percentBp, a.amountCents, a.reason ?? undefined).replace(
              /^./,
              (c) => c.toUpperCase(),
            ),
      validFrom: a.validFrom,
      validTo: a.validTo,
      open: a.validTo === null || a.validTo.getTime() >= today.getTime(),
      removable: rateRemovable(a, today),
    })),
    canManage: canFinance(ctx, "finance:manage"),
  };
}
