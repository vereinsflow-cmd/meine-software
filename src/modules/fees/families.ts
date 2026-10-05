import { formatCalendarDate, parseCalendarDate, todayCalendarDate } from "@/lib/dates";
import { parseInput } from "@/server/action";
import { recordAudit } from "@/server/audit/audit";
import { type TenantTx } from "@/server/db/tenant";
import { conflict, notFound, validationFailed } from "@/server/errors";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import { assertFinance } from "@/modules/finance/access";
import {
  familyCreateSchema,
  familyDissolveSchema,
  familyMemberAddSchema,
  familyMemberDeleteSchema,
  familyMemberEndSchema,
  familyUpdateSchema,
} from "./schemas";
import { getFeeSettings, rateRemovable, rateText } from "./service";

/**
 * Familien für den Familienbeitrag (Etappe 6): feste Gruppen, die der Kassenwart pflegt. Statt der Grundbeiträge ihrer
 * Mitglieder zahlt die Familie den Familienbeitrag an einen Zahler; die übrigen Beiträge der Mitglieder (z. B. ein
 * Zusatzbeitrag) zahlt ebenfalls er, solange kein anderer Zahler gewählt ist. Mitglieder haben einen Zeitraum – wer
 * die Familie verlässt, wird ausgetragen (bis), nicht gelöscht; so bleiben frühere Zeiträume richtig.
 */

export interface FamilyMemberDto {
  /** Eintrag (nicht das Mitglied). */
  id: string;
  memberId: string;
  name: string;
  validFrom: Date;
  validTo: Date | null;
  /** Heute (noch) dabei. */
  current: boolean;
  /** Läuft noch – lässt sich austragen. */
  open: boolean;
  /** Noch nicht gültig oder heute eingetragen – lässt sich ganz entfernen. */
  removable: boolean;
}

export interface FamilyDto {
  id: string;
  name: string;
  /** Aufgelöst: archiviert oder alle Mitglieder schon ausgetragen. */
  dissolved: boolean;
  /** Läuft noch, endet aber für alle zum Tag (aufgelöst zu einem künftigen Tag). */
  endsOn: Date | null;
  feeType: { id: string; name: string; archived: boolean; rateText: string; minMembers: number };
  payer: { id: string; name: string; inactive: boolean };
  members: FamilyMemberDto[];
}

const fullName = (m: { firstName: string; lastName: string }) => `${m.firstName} ${m.lastName}`;

/** Alle Familien: aktive nach Namen, dann aufgelöste. Mitglieder: heute dabei zuerst, dann künftige, dann frühere. */
export async function listFamilies(ctx: TenantContext): Promise<FamilyDto[]> {
  assertFinance(ctx, "finance:read");
  const [rows, settings] = await Promise.all([
    ctx.db.feeFamily.findMany({
      include: {
        feeType: { include: { rates: { orderBy: { validFrom: "asc" } } } },
        payer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            archivedAt: true,
            deletedAt: true,
            anonymizedAt: true,
          },
        },
        members: {
          include: { member: { select: { firstName: true, lastName: true } } },
          orderBy: { validFrom: "asc" },
        },
      },
      orderBy: { name: "asc" },
    }),
    getFeeSettings(ctx),
  ]);
  const today = todayCalendarDate();
  const t = today.getTime();
  const rank = (m: FamilyMemberDto) => (m.current ? 0 : m.validFrom.getTime() > t ? 1 : 2);
  return rows
    .map((row) => {
      const current = [...row.feeType.rates].reverse().find((r) => r.validFrom.getTime() <= t);
      const members = row.members
        .map((m) => ({
          id: m.id,
          memberId: m.memberId,
          name: fullName(m.member),
          validFrom: m.validFrom,
          validTo: m.validTo,
          current: m.validFrom.getTime() <= t && (m.validTo === null || m.validTo.getTime() >= t),
          open: m.validTo === null || m.validTo.getTime() >= t,
          removable: rateRemovable(m, today),
        }))
        .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "de"));
      const ended = members.length > 0 && members.every((m) => m.validTo !== null);
      const lastDay = ended ? Math.max(...members.map((m) => m.validTo!.getTime())) : null;
      const dissolved = row.archivedAt !== null || (lastDay !== null && lastDay < t);
      return {
        id: row.id,
        name: row.name,
        dissolved,
        endsOn: !dissolved && lastDay !== null ? new Date(lastDay) : null,
        feeType: {
          id: row.feeType.id,
          name: row.feeType.name,
          archived: row.feeType.archivedAt !== null,
          rateText: current
            ? rateText(current, settings.feeInterval)
            : row.feeType.rates[0]
              ? `ab ${formatCalendarDate(row.feeType.rates[0].validFrom)}: ${rateText(row.feeType.rates[0], settings.feeInterval)}`
              : "kein Betrag",
          minMembers: row.feeType.familyMinMembers ?? 2,
        },
        payer: {
          id: row.payer.id,
          name: fullName(row.payer),
          inactive:
            row.payer.archivedAt !== null ||
            row.payer.deletedAt !== null ||
            row.payer.anonymizedAt !== null,
        },
        members,
      };
    })
    .sort((a, b) => Number(a.dissolved) - Number(b.dissolved));
}

/** Auswahl in den Fenstern: Familienbeiträge, Mitglieder, mögliche Zahler (ohne eigenen abweichenden Zahler). */
export async function familyFormOptions(ctx: TenantContext): Promise<{
  feeTypes: { value: string; label: string }[];
  members: { value: string; label: string }[];
  payers: { value: string; label: string }[];
}> {
  assertFinance(ctx, "finance:manage");
  const [types, members] = await Promise.all([
    ctx.db.feeType.findMany({
      where: { kind: "FAMILY", archivedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    ctx.db.member.findMany({
      where: { archivedAt: null, deletedAt: null, anonymizedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        finance: { select: { payerMemberId: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ]);
  const label = (m: (typeof members)[number]) =>
    `${m.lastName}, ${m.firstName}${m.status === "LEFT" ? " (ausgetreten)" : ""}`;
  return {
    feeTypes: types.map((t) => ({ value: t.id, label: t.name })),
    members: members.map((m) => ({ value: m.id, label: label(m) })),
    payers: members
      .filter((m) => !m.finance?.payerMemberId)
      .map((m) => ({ value: m.id, label: label(m) })),
  };
}

async function assertFamilyFeeType(tx: TenantTx, feeTypeId: string) {
  const type = await tx.feeType.findFirst({
    where: { id: feeTypeId, kind: "FAMILY", archivedAt: null },
    select: { id: true, name: true },
  });
  if (!type) throw validationFailed({ feeTypeId: ["Bitte wähle den Familienbeitrag."] });
  return type;
}

/** Der Zahler: aktives Mitglied ohne eigenen abweichenden Zahler (keine Ketten). */
async function assertPayer(tx: TenantTx, payerMemberId: string) {
  const payer = await tx.member.findFirst({
    where: { id: payerMemberId, archivedAt: null, deletedAt: null, anonymizedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      finance: { select: { payerMemberId: true } },
    },
  });
  if (!payer)
    throw validationFailed({ payerMemberId: ["Bitte wähle, wer für die Familie zahlt."] });
  if (payer.finance?.payerMemberId)
    throw validationFailed({
      payerMemberId: [
        `Für ${fullName(payer)} zahlt schon jemand anderes – bitte direkt den Zahlenden wählen.`,
      ],
    });
  return payer;
}

/**
 * Freundliche Meldung vorab, falls das Mitglied ab `validFrom` schon in einer Familie ist (die Datenbank sichert es ab) –
 * mit dem, was zu tun ist: einen späteren Tag wählen, dort austragen oder einen geplanten Eintrag entfernen.
 */
async function assertNotInFamily(
  tx: TenantTx,
  member: { id: string; firstName: string; lastName: string },
  validFrom: Date,
) {
  const other = await tx.feeFamilyMember.findFirst({
    where: { memberId: member.id, OR: [{ validTo: null }, { validTo: { gte: validFrom } }] },
    include: { family: { select: { name: true } } },
    orderBy: { validFrom: "asc" },
  });
  if (!other) return;
  const who = fullName(member);
  const where = `„${other.family.name}“`;
  if (other.validFrom.getTime() > validFrom.getTime())
    throw conflict(
      rateRemovable(other, todayCalendarDate())
        ? `${who} ist ab ${formatCalendarDate(other.validFrom)} für ${where} eingetragen – bitte den Eintrag dort zuerst entfernen.`
        : `${who} ist ab ${formatCalendarDate(other.validFrom)} in ${where} – bitte dort zuerst austragen.`,
    );
  if (other.validTo) {
    const next = new Date(other.validTo.getTime() + 86_400_000);
    throw conflict(
      `${who} ist bis einschließlich ${formatCalendarDate(other.validTo)} in ${where} – bitte frühestens den ${formatCalendarDate(next)} wählen.`,
    );
  }
  throw conflict(`${who} ist schon in ${where} – bitte dort zuerst austragen.`);
}

async function activeMember(tx: TenantTx, memberId: string) {
  const member = await tx.member.findFirst({
    where: { id: memberId, archivedAt: null, deletedAt: null, anonymizedAt: null },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!member) throw validationFailed({ memberId: ["Bitte wähle ein Mitglied."] });
  return member;
}

export async function createFamily(ctx: TenantContext, input: unknown): Promise<{ id: string }> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(familyCreateSchema, input);
  const validFrom = parseCalendarDate(data.validFrom)!;
  return ctx.db.$transaction(async (tx) => {
    const type = await assertFamilyFeeType(tx, data.feeTypeId);
    await assertPayer(tx, data.payerMemberId);
    const members = [];
    for (const memberId of data.memberIds) {
      const member = await tx.member.findFirst({
        where: { id: memberId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          archivedAt: true,
          deletedAt: true,
          anonymizedAt: true,
        },
      });
      // Inzwischen archiviert oder gelöscht (anderes Fenster): beim Feld „Mitglieder“ sagen, wen es betrifft.
      if (!member || member.archivedAt || member.deletedAt || member.anonymizedAt)
        throw validationFailed({
          memberIds: [
            member && !member.anonymizedAt
              ? `${fullName(member)} ist nicht mehr aktiv – bitte aus der Liste nehmen.`
              : "Ein ausgewähltes Mitglied gibt es nicht mehr – bitte die Liste prüfen.",
          ],
        });
      await assertNotInFamily(tx, member, validFrom);
      members.push(member);
    }
    const family = await tx.feeFamily.create({
      data: {
        clubId: ctx.clubId,
        name: data.name,
        feeTypeId: type.id,
        payerMemberId: data.payerMemberId,
        createdById: ctx.userId,
      },
    });
    await tx.feeFamilyMember.createMany({
      data: members.map((m) => ({
        clubId: ctx.clubId,
        familyId: family.id,
        memberId: m.id,
        validFrom,
        createdById: ctx.userId,
      })),
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.family_created",
      entityType: "FeeFamily",
      entityId: family.id,
      summary: `Familie „${family.name}“ angelegt (${members.map(fullName).join(", ")} ab ${formatCalendarDate(validFrom)})`,
    });
    return { id: family.id };
  });
}

export async function updateFamily(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(familyUpdateSchema, input);
  await ctx.db.$transaction(async (tx) => {
    // Auch aufgelöste: Für frühere Zeiträume lässt sich z. B. ein gelöschter Zahler ersetzen.
    const family = await tx.feeFamily.findFirst({ where: { id: data.id } });
    if (!family) throw notFound("Die Familie");
    const type =
      data.feeTypeId === family.feeTypeId
        ? { id: family.feeTypeId }
        : await assertFamilyFeeType(tx, data.feeTypeId);
    if (data.payerMemberId !== family.payerMemberId) await assertPayer(tx, data.payerMemberId);
    await tx.feeFamily.update({
      where: { id: family.id },
      data: { name: data.name, feeTypeId: type.id, payerMemberId: data.payerMemberId },
    });
    const changes: Record<string, { from: string; to: string }> = {};
    if (family.name !== data.name) changes.name = { from: family.name, to: data.name };
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.family_updated",
      entityType: "FeeFamily",
      entityId: family.id,
      summary: `Familie „${data.name}“ geändert${data.payerMemberId !== family.payerMemberId ? " (neuer Zahler)" : ""}${type.id !== family.feeTypeId ? " (anderer Familienbeitrag)" : ""}`,
      changes,
    });
  });
}

export async function addFamilyMember(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(familyMemberAddSchema, input);
  const validFrom = parseCalendarDate(data.validFrom)!;
  await ctx.db.$transaction(async (tx) => {
    const family = await tx.feeFamily.findFirst({ where: { id: data.familyId, archivedAt: null } });
    if (!family) throw notFound("Die Familie");
    const member = await activeMember(tx, data.memberId);
    await assertNotInFamily(tx, member, validFrom);
    await tx.feeFamilyMember.create({
      data: {
        clubId: ctx.clubId,
        familyId: family.id,
        memberId: member.id,
        validFrom,
        createdById: ctx.userId,
      },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.family_member_added",
      entityType: "FeeFamily",
      entityId: family.id,
      summary: `Familie „${family.name}“: ${fullName(member)} ab ${formatCalendarDate(validFrom)}`,
    });
  });
}

/** Austragen: `validTo` ist der letzte Tag in der Familie. Nur früher, nie später als bisher. */
export async function endFamilyMember(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(familyMemberEndSchema, input);
  const validTo = parseCalendarDate(data.validTo)!;
  await ctx.db.$transaction(async (tx) => {
    const row = await tx.feeFamilyMember.findFirst({
      where: { id: data.id },
      include: {
        member: { select: { firstName: true, lastName: true } },
        family: { select: { id: true, name: true } },
      },
    });
    if (!row) throw notFound("Der Eintrag");
    if (validTo.getTime() < row.validFrom.getTime())
      throw validationFailed({
        validTo: [
          `${fullName(row.member)} ist erst ab ${formatCalendarDate(row.validFrom)} in der Familie.`,
        ],
      });
    if (row.validTo && validTo.getTime() > row.validTo.getTime())
      throw validationFailed({ validTo: ["Austragen geht nur früher, nicht später."] });
    await tx.feeFamilyMember.update({
      where: { id: row.id },
      data: { validTo, endedById: ctx.userId },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.family_member_ended",
      entityType: "FeeFamily",
      entityId: row.family.id,
      summary: `Familie „${row.family.name}“: ${fullName(row.member)} bis ${formatCalendarDate(validTo)}`,
    });
  });
}

/** Versehentlich hinzugefügt: entfernen, solange es noch nicht gilt oder heute eingetragen wurde. */
export async function deleteFamilyMember(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(familyMemberDeleteSchema, input);
  await ctx.db.$transaction(async (tx) => {
    const row = await tx.feeFamilyMember.findFirst({
      where: { id: data.id },
      include: {
        member: { select: { firstName: true, lastName: true } },
        family: { select: { id: true, name: true } },
      },
    });
    if (!row) throw notFound("Der Eintrag");
    if (!rateRemovable(row, todayCalendarDate()))
      throw conflict(
        "Wer schon zur Familie gehört hat, bleibt im Verlauf – trage das Mitglied aus.",
      );
    await tx.feeFamilyMember.delete({ where: { id: row.id } });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.family_member_removed",
      entityType: "FeeFamily",
      entityId: row.family.id,
      summary: `Familie „${row.family.name}“: ${fullName(row.member)} entfernt`,
    });
  });
}

/**
 * Familie auflösen: Alle Mitglieder werden zum `validTo` ausgetragen (wer erst danach dazukäme, wird entfernt). Danach
 * steht die Familie unter „Aufgelöst“; bis dahin zahlt sie weiter. Frühere Zeiträume bleiben, wie sie waren.
 */
export async function dissolveFamily(ctx: TenantContext, input: unknown): Promise<void> {
  assertFinance(ctx, "finance:manage");
  const data = parseInput(familyDissolveSchema, input);
  const validTo = parseCalendarDate(data.validTo)!;
  const today = todayCalendarDate();
  await ctx.db.$transaction(async (tx) => {
    const family = await tx.feeFamily.findFirst({
      where: { id: data.id, archivedAt: null },
      include: {
        members: { include: { member: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!family) throw notFound("Die Familie");
    for (const row of family.members) {
      if (row.validTo && row.validTo.getTime() <= validTo.getTime()) continue;
      if (row.validFrom.getTime() > validTo.getTime()) {
        if (!rateRemovable(row, today))
          throw validationFailed({
            validTo: [
              `${fullName(row.member)} ist erst ab ${formatCalendarDate(row.validFrom)} in der Familie – bitte einen späteren Tag wählen.`,
            ],
          });
        await tx.feeFamilyMember.delete({ where: { id: row.id } });
      } else
        await tx.feeFamilyMember.update({
          where: { id: row.id },
          data: { validTo, endedById: ctx.userId },
        });
    }
    // Endet sie erst künftig, läuft sie bis dahin weiter (Familienbeitrag, Zahler, Bearbeiten); aufgelöst gilt sie, sobald
    // der Tag vorbei ist.
    if (validTo.getTime() < today.getTime())
      await tx.feeFamily.update({ where: { id: family.id }, data: { archivedAt: new Date() } });
    await recordAudit(tx, auditActor(ctx), {
      action: "finance.family_dissolved",
      entityType: "FeeFamily",
      entityId: family.id,
      summary: `Familie „${family.name}“ aufgelöst zum ${formatCalendarDate(validTo)}`,
    });
  });
}
