import type { Prisma } from "@/generated/prisma/client";
import type { QualificationKind } from "@/generated/prisma/enums";
import { formatCalendarDate, parseCalendarDate } from "@/lib/dates";
import { diffChanges, recordAudit } from "@/server/audit/audit";
import { forbidden, notFound } from "@/server/errors";
import { assertCan, can, type ResourceRef } from "@/server/permissions/policy";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import {
  QUALIFICATION_KIND_LABEL,
  qualificationName,
  type QualificationInput,
} from "./qualification-schemas";

/**
 * Qualifikationen und Lizenzen von Mitgliedern (Übungsleiterlizenz, Erste Hilfe, Schiedsrichter …).
 *
 * Rechte wie beim Mitglied selbst: Lesen mit `members:read` in derselben Reichweite (Vorstand alle, Abteilungsleitung
 * ihre Abteilungen, jedes Mitglied sich selbst), Eintragen, Ändern und Entfernen mit `members:update` für genau dieses
 * Mitglied. Jede Änderung steht im Änderungsverlauf des Mitglieds (Nummer und Notiz nur als „geändert“). Ist das Mitglied
 * im Verein nicht auffindbar oder nicht lesbar, lautet die Antwort „nicht gefunden“ – wie in `service.ts`.
 */

export interface QualificationItem {
  id: string;
  kind: QualificationKind;
  title: string | null;
  number: string | null;
  issuedOn: Date | null;
  validUntil: Date | null;
  issuer: string | null;
  note: string | null;
}

export interface MemberQualifications {
  items: QualificationItem[];
  /** Darf der Benutzer eintragen, ändern und entfernen? (Nicht im Papierkorb.) */
  canManage: boolean;
}

const memberSelect = {
  id: true,
  firstName: true,
  lastName: true,
  deletedAt: true,
  departments: { select: { departmentId: true } },
} satisfies Prisma.MemberSelect;

type MemberRef = Prisma.MemberGetPayload<{ select: typeof memberSelect }>;

const resourceOf = (member: MemberRef): ResourceRef => ({
  departmentIds: member.departments.map((d) => d.departmentId),
  ownerMemberId: member.id,
});

const itemSelect = {
  id: true,
  kind: true,
  title: true,
  number: true,
  issuedOn: true,
  validUntil: true,
  issuer: true,
  note: true,
} satisfies Prisma.MemberQualificationSelect;

export async function listMemberQualifications(
  ctx: TenantContext,
  memberId: string,
): Promise<MemberQualifications> {
  assertCan(ctx, "members:read");
  // Den Papierkorb sieht nur, wer löschen darf – wie die Seite des Mitglieds (`getMember`).
  const member = await ctx.db.member.findFirst({
    where: { id: memberId, ...(can(ctx, "members:delete") ? {} : { deletedAt: null }) },
    select: memberSelect,
  });
  if (!member || !can(ctx, "members:read", resourceOf(member))) throw notFound("Das Mitglied");

  const items = await ctx.db.memberQualification.findMany({
    where: { memberId: member.id },
    select: itemSelect,
    orderBy: [{ kind: "asc" }, { createdAt: "asc" }],
  });
  return {
    items,
    canManage: member.deletedAt === null && can(ctx, "members:update", resourceOf(member)),
  };
}

/** Mitglied für eine Änderung laden (nie aus dem Papierkorb): unsichtbar → „nicht gefunden“, nur lesbar → „verboten“. */
async function loadForUpdate(
  ctx: TenantContext,
  memberId: string,
  what = "Das Mitglied",
): Promise<MemberRef> {
  const member = await ctx.db.member.findFirst({
    where: { id: memberId, deletedAt: null },
    select: memberSelect,
  });
  if (!member || !can(ctx, "members:read", resourceOf(member))) throw notFound(what);
  if (!can(ctx, "members:update", resourceOf(member))) throw forbidden();
  return member;
}

const toDate = (value: string | undefined): Date | null =>
  value ? parseCalendarDate(value) : null;

function toData(input: QualificationInput) {
  return {
    kind: input.kind,
    title: input.title ?? null,
    number: input.number ?? null,
    issuedOn: toDate(input.issuedOn),
    validUntil: toDate(input.validUntil),
    issuer: input.issuer ?? null,
    note: input.note ?? null,
  };
}

/** Stand für den Änderungsverlauf – deutsche Schlüssel (Beschriftung in `MEMBER_FIELD_LABEL`), Tage als TT.MM.JJJJ. */
function auditState(q: ReturnType<typeof toData>) {
  const day = (value: Date | null) => (value ? formatCalendarDate(value) : null);
  return {
    art: QUALIFICATION_KIND_LABEL[q.kind],
    bezeichnung: q.title,
    nummer: q.number,
    ausgestelltAm: day(q.issuedOn),
    gueltigBis: day(q.validUntil),
    aussteller: q.issuer,
    notiz: q.note,
  };
}

/** Nummer und Notiz stehen im Protokoll nur als „geändert“ (Datensparsamkeit, wie Kontaktdaten beim Mitglied). */
const MASKED = ["nummer", "notiz"] as const;

const fullName = (member: MemberRef) => `${member.firstName} ${member.lastName}`;

export async function addQualification(
  ctx: TenantContext,
  memberId: string,
  input: QualificationInput,
): Promise<{ id: string }> {
  const member = await loadForUpdate(ctx, memberId);
  const data = toData(input);
  return ctx.db.$transaction(async (tx) => {
    const row = await tx.memberQualification.create({
      data: { clubId: ctx.clubId, memberId: member.id, ...data },
      select: { id: true },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "member.qualification_added",
      entityType: "Member",
      entityId: member.id,
      summary: `Qualifikation von ${fullName(member)} eingetragen: ${qualificationName(data)}`,
    });
    return row;
  });
}

/** Qualifikation samt Mitglied für eine Änderung; eine fremde oder unsichtbare ist „nicht gefunden“. */
async function loadQualificationForUpdate(ctx: TenantContext, id: string) {
  const row = await ctx.db.memberQualification.findFirst({ where: { id } });
  if (!row) throw notFound("Die Qualifikation");
  const member = await loadForUpdate(ctx, row.memberId, "Die Qualifikation");
  return { row, member };
}

export async function updateQualification(
  ctx: TenantContext,
  id: string,
  input: QualificationInput,
): Promise<{ memberId: string }> {
  const { row, member } = await loadQualificationForUpdate(ctx, id);
  const after = toData(input);
  const changes = diffChanges(auditState(row), auditState(after), { masked: MASKED });
  if (!changes) return { memberId: member.id };
  await ctx.db.$transaction(async (tx) => {
    await tx.memberQualification.update({ where: { id: row.id }, data: after });
    await recordAudit(tx, auditActor(ctx), {
      action: "member.qualification_updated",
      entityType: "Member",
      entityId: member.id,
      summary: `Qualifikation von ${fullName(member)} geändert: ${qualificationName(after)}`,
      changes,
    });
  });
  return { memberId: member.id };
}

export async function removeQualification(
  ctx: TenantContext,
  id: string,
): Promise<{ memberId: string }> {
  const { row, member } = await loadQualificationForUpdate(ctx, id);
  await ctx.db.$transaction(async (tx) => {
    await tx.memberQualification.delete({ where: { id: row.id } });
    await recordAudit(tx, auditActor(ctx), {
      action: "member.qualification_removed",
      entityType: "Member",
      entityId: member.id,
      summary: `Qualifikation von ${fullName(member)} entfernt: ${qualificationName(row)}`,
    });
  });
  return { memberId: member.id };
}
