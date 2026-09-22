import type { Prisma } from "@/generated/prisma/client";
import type { ConsentType, MemberStatus } from "@/generated/prisma/enums";
import { nextBirthday } from "@/lib/birthdays";
import { ageOn, parseCalendarDate, todayCalendarDate } from "@/lib/dates";
import { paged, type PageRequest, type Paged } from "@/lib/search-params";
import { diffChanges, recordAudit } from "@/server/audit/audit";
import type { TenantDb, TenantTx } from "@/server/db/tenant";
import { badRequest, conflict, forbidden, notFound, validationFailed } from "@/server/errors";
import {
  assertCan,
  can,
  scopeFilter,
  scopeOf,
  type ResourceRef,
} from "@/server/permissions/policy";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import type { MemberInput } from "./schemas";
import type {
  ConsentState,
  MemberDepartmentRef,
  MemberDetail,
  MemberListItem,
  MemberSortField,
  MemberView,
} from "./types";

/**
 * Mitgliederverwaltung – Geschäftslogik.
 *
 * Grundsätze:
 *  - Jeder Zugriff läuft über `ctx.db` (automatisch auf den Verein beschränkt).
 *  - Jede Funktion prüft die Berechtigung selbst; die Oberfläche blendet Schaltflächen nur aus.
 *  - Kontakt- und sensible Daten werden nach Berechtigung FÜR GENAU DIESES MITGLIED geschwärzt.
 *  - Gelöscht wird stufenweise: archivieren → löschen (Papierkorb) → endgültig entfernen (Aufbewahrungsjob).
 */

/** Felder, bei denen im Audit-Log nur "geändert" (ohne Werte) vermerkt wird – Datensparsamkeit. */
const MASKED_AUDIT_FIELDS = [
  "email",
  "phone",
  "street",
  "postalCode",
  "city",
  "country",
  "birthDate",
  "internalNotes",
] as const;

const rowInclude = {
  departments: {
    include: { department: { select: { id: true, name: true } } },
    orderBy: { department: { name: "asc" } },
  },
  membership: { select: { status: true } },
} satisfies Prisma.MemberInclude;

type MemberRow = Prisma.MemberGetPayload<{ include: typeof rowInclude }>;

const departmentRefs = (row: MemberRow): MemberDepartmentRef[] =>
  row.departments.map((d) => ({
    id: d.department.id,
    name: d.department.name,
    isLeader: d.isLeader,
  }));

/** Bezug für die Berechtigungsprüfung: Abteilungen des Mitglieds und das Mitglied selbst. */
const resourceOf = (row: MemberRow): ResourceRef => ({
  departmentIds: row.departments.map((d) => d.departmentId),
  ownerMemberId: row.id,
});

function toListItem(ctx: TenantContext, row: MemberRow): MemberListItem {
  const contactAllowed = can(ctx, "members:read_contact", resourceOf(row));
  return {
    id: row.id,
    memberNumber: row.memberNumber,
    firstName: row.firstName,
    lastName: row.lastName,
    status: row.status,
    clubFunction: row.clubFunction,
    joinedAt: row.joinedAt,
    archivedAt: row.archivedAt,
    deletedAt: row.deletedAt,
    hasAccount: row.userId !== null,
    departments: departmentRefs(row),
    email: contactAllowed ? row.email : null,
    phone: contactAllowed ? row.phone : null,
  };
}

/** `where`-Filter für eine Berechtigung mit Reichweite (ganzer Verein / eigene Abteilungen / nur man selbst). */
function scopedMembers(
  ctx: TenantContext,
  key: "members:read" | "members:read_private",
): Prisma.MemberWhereInput | undefined {
  return scopeFilter<Prisma.MemberWhereInput>(ctx, key, {
    department: (ids) => ({ departments: { some: { departmentId: { in: [...ids] } } } }),
    own: (holder) => ({ id: holder.memberId ?? "kein-mitglied" }),
  });
}

const readScope = (ctx: TenantContext) => scopedMembers(ctx, "members:read");

/** Lesereichweite für Auswertungen außerhalb der Mitgliederliste (z. B. Dashboard). Wirft ohne Berechtigung `FORBIDDEN`. */
export const memberReadScope = readScope;

function viewWhere(view: MemberView): Prisma.MemberWhereInput {
  switch (view) {
    case "active":
      return { archivedAt: null, deletedAt: null };
    case "archived":
      return { archivedAt: { not: null }, deletedAt: null };
    case "trash":
      return { deletedAt: { not: null } };
  }
}

// ---------------------------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------------------------

export interface MemberListQuery {
  q?: string;
  status?: MemberStatus;
  departmentId?: string;
  view: MemberView;
  sort: MemberSortField;
  dir: "asc" | "desc";
  request: PageRequest;
}

/** Auch von der zentralen Suche verwendet (src/modules/search/service.ts). */
export function searchWhere(ctx: TenantContext, q: string): Prisma.MemberWhereInput {
  const tokens = q.trim().split(/\s+/).filter(Boolean).slice(0, 5);
  // Wer keine Kontaktdaten sehen darf, kann auch nicht danach suchen (sonst ließe sich die E-Mail erraten).
  const searchEmail = can(ctx, "members:read_contact");
  return {
    AND: tokens.map((token) => ({
      OR: [
        { firstName: { contains: token, mode: "insensitive" as const } },
        { lastName: { contains: token, mode: "insensitive" as const } },
        { memberNumber: { contains: token, mode: "insensitive" as const } },
        ...(searchEmail ? [{ email: { contains: token, mode: "insensitive" as const } }] : []),
      ],
    })),
  };
}

function orderBy(
  sort: MemberSortField,
  dir: "asc" | "desc",
): Prisma.MemberOrderByWithRelationInput[] {
  switch (sort) {
    case "joinedAt":
      return [{ joinedAt: { sort: dir, nulls: "last" } }, { lastName: "asc" }];
    case "status":
      return [{ status: dir }, { lastName: "asc" }, { firstName: "asc" }];
    case "memberNumber":
      return [{ memberNumber: { sort: dir, nulls: "last" } }, { lastName: "asc" }];
    default:
      return [{ lastName: dir }, { firstName: dir }];
  }
}

export async function listMembers(
  ctx: TenantContext,
  query: MemberListQuery,
): Promise<Paged<MemberListItem>> {
  assertCan(ctx, "members:read");
  if (query.view === "archived") assertCan(ctx, "members:archive");
  if (query.view === "trash") assertCan(ctx, "members:delete");

  const where: Prisma.MemberWhereInput = {
    AND: [
      viewWhere(query.view),
      readScope(ctx) ?? {},
      query.status ? { status: query.status } : {},
      query.departmentId ? { departments: { some: { departmentId: query.departmentId } } } : {},
      query.q ? searchWhere(ctx, query.q) : {},
    ],
  };

  const [rows, total] = await Promise.all([
    ctx.db.member.findMany({
      where,
      include: rowInclude,
      orderBy: orderBy(query.sort, query.dir),
      skip: query.request.skip,
      take: query.request.pageSize,
    }),
    ctx.db.member.count({ where }),
  ]);
  return paged(
    rows.map((row) => toListItem(ctx, row)),
    total,
    query.request,
  );
}

async function latestConsents(ctx: TenantContext, memberId: string): Promise<ConsentState[]> {
  const rows = await ctx.db.consent.findMany({
    where: { memberId },
    orderBy: { recordedAt: "desc" },
  });
  const seen = new Set<ConsentType>();
  const result: ConsentState[] = [];
  for (const row of rows) {
    if (seen.has(row.type)) continue;
    seen.add(row.type);
    result.push({
      type: row.type,
      granted: row.granted,
      recordedAt: row.recordedAt,
      source: row.source,
    });
  }
  return result;
}

/**
 * Lädt ein Mitglied für eine Aktion. Ist es im Verein nicht auffindbar oder für den Benutzer nicht
 * lesbar, lautet die Antwort "nicht gefunden"; ist es lesbar, aber die Aktion nicht erlaubt, "verboten".
 */
async function loadForAction(
  ctx: TenantContext,
  id: string,
  permission: "members:update" | "members:archive" | "members:delete",
  options: { includeDeleted?: boolean } = {},
): Promise<MemberRow> {
  const row = await ctx.db.member.findFirst({
    where: { id, ...(options.includeDeleted ? {} : { deletedAt: null }) },
    include: rowInclude,
  });
  if (!row || !can(ctx, "members:read", resourceOf(row))) throw notFound("Das Mitglied");
  if (!can(ctx, permission, resourceOf(row))) throw forbidden();
  return row;
}

export async function getMember(ctx: TenantContext, id: string): Promise<MemberDetail> {
  assertCan(ctx, "members:read");
  const includeDeleted = can(ctx, "members:delete");
  const row = await ctx.db.member.findFirst({
    where: { AND: [{ id }, readScope(ctx) ?? {}, includeDeleted ? {} : { deletedAt: null }] },
    include: rowInclude,
  });
  if (!row) throw notFound("Das Mitglied");

  const resource = resourceOf(row);
  const canContact = can(ctx, "members:read_contact", resource);
  const canPrivate = can(ctx, "members:read_private", resource);
  const canUpdate = can(ctx, "members:update", resource);

  return {
    ...toListItem(ctx, row),
    leftAt: row.leftAt,
    accountStatus: row.membership?.status ?? null,
    contact: canContact
      ? { street: row.street, postalCode: row.postalCode, city: row.city, country: row.country }
      : null,
    private: canPrivate
      ? {
          birthDate: row.birthDate,
          internalNotes: row.internalNotes,
          consents: await latestConsents(ctx, id),
        }
      : null,
    can: {
      update: canUpdate,
      archive: can(ctx, "members:archive", resource),
      delete: can(ctx, "members:delete", resource),
      consents: canUpdate && canPrivate,
    },
  };
}

/** Werte für das Bearbeiten-Formular (nur Felder, die der Benutzer sehen und ändern darf). */
export interface MemberFormValues {
  memberNumber: string;
  firstName: string;
  lastName: string;
  status: MemberStatus;
  clubFunction: string;
  joinedAt: string;
  leftAt: string;
  email: string;
  phone: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  birthDate: string;
  internalNotes: string;
  departmentIds: string[];
  leaderDepartmentIds: string[];
}

export async function getMemberForEdit(ctx: TenantContext, id: string) {
  const row = await loadForAction(ctx, id, "members:update");
  const resource = resourceOf(row);
  const dateValue = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : "");
  const canContact = can(ctx, "members:read_contact", resource);
  const canPrivate = can(ctx, "members:read_private", resource);
  const values: MemberFormValues = {
    memberNumber: row.memberNumber ?? "",
    firstName: row.firstName,
    lastName: row.lastName,
    status: row.status,
    clubFunction: row.clubFunction ?? "",
    joinedAt: dateValue(row.joinedAt),
    leftAt: dateValue(row.leftAt),
    email: canContact ? (row.email ?? "") : "",
    phone: canContact ? (row.phone ?? "") : "",
    street: canContact ? (row.street ?? "") : "",
    postalCode: canContact ? (row.postalCode ?? "") : "",
    city: canContact ? (row.city ?? "") : "",
    country: canContact ? (row.country ?? "") : "",
    birthDate: canPrivate ? dateValue(row.birthDate) : "",
    internalNotes: canPrivate ? (row.internalNotes ?? "") : "",
    departmentIds: row.departments.map((d) => d.departmentId),
    leaderDepartmentIds: row.departments.filter((d) => d.isLeader).map((d) => d.departmentId),
  };
  return {
    values,
    editable: { contact: canContact, private: canPrivate, leaders: can(ctx, "departments:manage") },
  };
}

export interface DepartmentOption {
  id: string;
  name: string;
  /** Darf der Benutzer Mitglieder dieser Abteilung zuordnen bzw. entfernen? */
  assignable: boolean;
  isActive: boolean;
}

/** Abteilungen für das Formular; nicht zuweisbare bleiben sichtbar, sind aber gesperrt. */
export async function listDepartmentOptions(
  ctx: TenantContext,
  permission: "members:create" | "members:update",
): Promise<DepartmentOption[]> {
  const departments = await ctx.db.department.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, isActive: true },
  });
  const scope = scopeOf(ctx, permission);
  return departments.map((department) => ({
    ...department,
    assignable:
      scope === "CLUB" || (scope === "DEPARTMENT" && ctx.ledDepartmentIds.includes(department.id)),
  }));
}

export async function suggestNextMemberNumber(ctx: TenantContext): Promise<string> {
  const rows = await ctx.db.member.findMany({
    where: { memberNumber: { not: null } },
    select: { memberNumber: true },
  });
  let max = 0;
  for (const { memberNumber } of rows) {
    const match = /^M-(\d+)$/.exec(memberNumber ?? "");
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `M-${String(max + 1).padStart(4, "0")}`;
}

// ---------------------------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------------------------

async function assertDepartmentsExist(
  db: TenantDb | TenantTx,
  ids: readonly string[],
): Promise<void> {
  if (ids.length === 0) return;
  const count = await db.department.count({ where: { id: { in: [...ids] } } });
  if (count !== new Set(ids).size)
    throw badRequest("Mindestens eine ausgewählte Abteilung existiert nicht.");
}

async function assertMemberNumberFree(
  db: TenantDb | TenantTx,
  memberNumber: string | undefined,
  exceptId?: string,
): Promise<void> {
  if (!memberNumber) return;
  const existing = await db.member.findFirst({
    where: { memberNumber, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });
  if (existing)
    throw validationFailed({ memberNumber: ["Diese Mitgliedsnummer ist bereits vergeben."] });
}

const toDate = (value: string | undefined): Date | null =>
  value ? parseCalendarDate(value) : null;

/**
 * Darf der Benutzer das Leiter-Kennzeichen in einer bestimmten Abteilung setzen oder entziehen? Vereinsweit Berechtigte
 * für jede Abteilung, Abteilungsleiter nur für ihre eigene – NIE pauschal (sonst könnte ein Leiter beim Bearbeiten eines
 * Mitglieds die Leitung in einer fremden Abteilung entziehen).
 */
const canSetLeader = (ctx: TenantContext) => (departmentId: string) =>
  can(ctx, "departments:manage", { departmentIds: [departmentId] });

/** Der letzte Vereinsadministrator darf nicht ausgesperrt werden – sonst kann niemand den Verein mehr verwalten. */
export async function assertNotLastAdmin(
  db: TenantDb | TenantTx,
  userId: string | null,
): Promise<void> {
  if (!userId) return;
  const membership = await db.clubMembership.findFirst({
    where: { userId, status: "ACTIVE", role: { key: "CLUB_ADMIN" } },
    select: { id: true },
  });
  if (!membership) return;
  const others = await db.clubMembership.count({
    where: { userId: { not: userId }, status: "ACTIVE", role: { key: "CLUB_ADMIN" } },
  });
  if (others === 0)
    throw conflict(
      "Das ist der letzte Vereinsadministrator. Bestimme zuerst einen weiteren Administrator.",
    );
}

/** Sperrt den Zugang eines verknüpften Benutzerkontos (z. B. bei Austritt oder Archivierung). */
async function suspendAccess(tx: TenantTx, userId: string | null): Promise<void> {
  if (!userId) return;
  await tx.clubMembership.updateMany({ where: { userId }, data: { status: "SUSPENDED" } });
}

export async function createMember(
  ctx: TenantContext,
  input: MemberInput,
): Promise<{ id: string }> {
  assertCan(ctx, "members:create");
  // Abteilungsleiter dürfen nur Mitglieder ihrer eigenen Abteilung(en) anlegen.
  if (scopeOf(ctx, "members:create") === "DEPARTMENT") {
    const outside = input.departmentIds.filter((id) => !ctx.ledDepartmentIds.includes(id));
    if (input.departmentIds.length === 0 || outside.length > 0) {
      throw validationFailed({
        departmentIds: ["Bitte ordne das Mitglied mindestens einer deiner Abteilungen zu."],
      });
    }
  }
  await assertDepartmentsExist(ctx.db, input.departmentIds);
  await assertMemberNumberFree(ctx.db, input.memberNumber);

  const resource: ResourceRef = { departmentIds: input.departmentIds };
  const contact = can(ctx, "members:read_contact", resource);
  const sensitive = can(ctx, "members:read_private", resource);
  const manageLeader = canSetLeader(ctx);

  return ctx.db.$transaction(async (tx) => {
    const member = await tx.member.create({
      data: {
        clubId: ctx.clubId,
        memberNumber: input.memberNumber ?? null,
        firstName: input.firstName,
        lastName: input.lastName,
        status: input.status,
        clubFunction: input.clubFunction ?? null,
        joinedAt: toDate(input.joinedAt),
        leftAt: toDate(input.leftAt),
        email: contact ? (input.email ?? null) : null,
        phone: contact ? (input.phone ?? null) : null,
        street: contact ? (input.street ?? null) : null,
        postalCode: contact ? (input.postalCode ?? null) : null,
        city: contact ? (input.city ?? null) : null,
        country: contact ? (input.country ?? "DE") : "DE",
        birthDate: sensitive ? toDate(input.birthDate) : null,
        internalNotes: sensitive ? (input.internalNotes ?? null) : null,
      },
    });
    if (input.departmentIds.length > 0) {
      await tx.memberDepartment.createMany({
        data: [...new Set(input.departmentIds)].map((departmentId) => ({
          clubId: ctx.clubId,
          memberId: member.id,
          departmentId,
          isLeader: manageLeader(departmentId) && input.leaderDepartmentIds.includes(departmentId),
        })),
      });
    }
    await recordAudit(tx, auditActor(ctx), {
      action: "member.created",
      entityType: "Member",
      entityId: member.id,
      summary: `Mitglied ${input.firstName} ${input.lastName} angelegt`,
    });
    return { id: member.id };
  });
}

export async function updateMember(
  ctx: TenantContext,
  id: string,
  input: MemberInput,
): Promise<void> {
  const existing = await loadForAction(ctx, id, "members:update");
  const resource = resourceOf(existing);
  const contact = can(ctx, "members:read_contact", resource);
  const sensitive = can(ctx, "members:read_private", resource);
  const manageLeader = canSetLeader(ctx);

  await assertMemberNumberFree(ctx.db, input.memberNumber, id);

  // Abteilungen: Abteilungsleiter ändern nur Zuordnungen zu ihren eigenen Abteilungen.
  const scope = scopeOf(ctx, "members:update");
  const isEditable = (departmentId: string) =>
    scope === "CLUB" || ctx.ledDepartmentIds.includes(departmentId);
  const nextIds = new Set<string>();
  for (const current of existing.departments)
    if (!isEditable(current.departmentId)) nextIds.add(current.departmentId);
  for (const requested of input.departmentIds) if (isEditable(requested)) nextIds.add(requested);
  await assertDepartmentsExist(ctx.db, [...nextIds]);

  const before = {
    memberNumber: existing.memberNumber,
    firstName: existing.firstName,
    lastName: existing.lastName,
    status: existing.status,
    clubFunction: existing.clubFunction,
    joinedAt: existing.joinedAt,
    leftAt: existing.leftAt,
    email: existing.email,
    phone: existing.phone,
    street: existing.street,
    postalCode: existing.postalCode,
    city: existing.city,
    country: existing.country,
    birthDate: existing.birthDate,
    internalNotes: existing.internalNotes,
  };
  const after = {
    ...before,
    memberNumber: input.memberNumber ?? null,
    firstName: input.firstName,
    lastName: input.lastName,
    status: input.status,
    clubFunction: input.clubFunction ?? null,
    joinedAt: toDate(input.joinedAt),
    leftAt: toDate(input.leftAt),
    // Felder ohne Berechtigung bleiben unverändert (werden nie überschrieben oder geleert).
    ...(contact
      ? {
          email: input.email ?? null,
          phone: input.phone ?? null,
          street: input.street ?? null,
          postalCode: input.postalCode ?? null,
          city: input.city ?? null,
          // Wie beim Anlegen: ohne Angabe gilt Deutschland (sonst würde das Land unbemerkt gelöscht).
          country: input.country ?? "DE",
        }
      : {}),
    ...(sensitive
      ? { birthDate: toDate(input.birthDate), internalNotes: input.internalNotes ?? null }
      : {}),
  };

  await ctx.db.$transaction(async (tx) => {
    await tx.member.update({ where: { id }, data: after });

    const currentById = new Map(existing.departments.map((d) => [d.departmentId, d]));
    const removed = existing.departments.filter((d) => !nextIds.has(d.departmentId));
    if (removed.length > 0) {
      await tx.memberDepartment.deleteMany({
        where: { memberId: id, departmentId: { in: removed.map((d) => d.departmentId) } },
      });
    }
    for (const departmentId of nextIds) {
      // Das Leiter-Kennzeichen ändert nur, wer die JEWEILIGE Abteilung verwalten darf; sonst bleibt es, wie es ist.
      const wantsLeader = manageLeader(departmentId)
        ? input.leaderDepartmentIds.includes(departmentId)
        : (currentById.get(departmentId)?.isLeader ?? false);
      const current = currentById.get(departmentId);
      if (!current) {
        await tx.memberDepartment.create({
          data: { clubId: ctx.clubId, memberId: id, departmentId, isLeader: wantsLeader },
        });
      } else if (current.isLeader !== wantsLeader) {
        await tx.memberDepartment.updateMany({
          where: { memberId: id, departmentId },
          data: { isLeader: wantsLeader },
        });
      }
    }

    // Austritt oder Sperre entzieht das Benutzerkonto den Zugang zum Verein.
    if (
      (after.status === "LEFT" || after.status === "BLOCKED") &&
      existing.status !== after.status
    ) {
      await assertNotLastAdmin(tx, existing.userId);
      await suspendAccess(tx, existing.userId);
    }

    const names = new Map(
      (
        await tx.department.findMany({
          where: { id: { in: [...nextIds, ...existing.departments.map((d) => d.departmentId)] } },
          select: { id: true, name: true },
        })
      ).map((d) => [d.id, d.name]),
    );
    const nameList = (ids: Iterable<string>) =>
      [...ids].map((departmentId) => names.get(departmentId) ?? departmentId).sort();
    const changes = {
      ...(diffChanges(before, after, { masked: MASKED_AUDIT_FIELDS }) ?? {}),
      ...(JSON.stringify(nameList(currentById.keys())) !== JSON.stringify(nameList(nextIds))
        ? { departments: { from: nameList(currentById.keys()), to: nameList(nextIds) } }
        : {}),
    };
    if (Object.keys(changes).length > 0) {
      await recordAudit(tx, auditActor(ctx), {
        action: "member.updated",
        entityType: "Member",
        entityId: id,
        summary: `Mitglied ${after.firstName} ${after.lastName} geändert`,
        changes,
      });
    }
  });
}

export async function archiveMember(ctx: TenantContext, id: string): Promise<void> {
  const member = await loadForAction(ctx, id, "members:archive");
  if (member.archivedAt) return;
  await ctx.db.$transaction(async (tx) => {
    await assertNotLastAdmin(tx, member.userId);
    await tx.member.update({ where: { id }, data: { archivedAt: new Date() } });
    await suspendAccess(tx, member.userId);
    await recordAudit(tx, auditActor(ctx), {
      action: "member.archived",
      entityType: "Member",
      entityId: id,
      summary: `Mitglied ${member.firstName} ${member.lastName} archiviert`,
    });
  });
}

export async function restoreMember(ctx: TenantContext, id: string): Promise<void> {
  const member = await loadForAction(ctx, id, "members:archive");
  if (!member.archivedAt) return;
  await ctx.db.$transaction(async (tx) => {
    await tx.member.update({ where: { id }, data: { archivedAt: null } });
    await recordAudit(tx, auditActor(ctx), {
      action: "member.restored",
      entityType: "Member",
      entityId: id,
      summary: `Mitglied ${member.firstName} ${member.lastName} wiederhergestellt`,
    });
  });
}

/** Verschiebt ein ARCHIVIERTES Mitglied in den Papierkorb (endgültig entfernt es später der Aufbewahrungsjob). */
export async function deleteMember(ctx: TenantContext, id: string): Promise<void> {
  const member = await loadForAction(ctx, id, "members:delete");
  if (!member.archivedAt)
    throw badRequest(
      "Bitte archiviere das Mitglied zuerst. Erst archivierte Mitglieder können gelöscht werden.",
    );
  await ctx.db.$transaction(async (tx) => {
    await assertNotLastAdmin(tx, member.userId);
    await tx.member.update({ where: { id }, data: { deletedAt: new Date() } });
    await suspendAccess(tx, member.userId);
    await recordAudit(tx, auditActor(ctx), {
      action: "member.deleted",
      entityType: "Member",
      entityId: id,
      summary: `Mitglied ${member.firstName} ${member.lastName} in den Papierkorb verschoben`,
    });
  });
}

export async function restoreFromTrash(ctx: TenantContext, id: string): Promise<void> {
  const member = await loadForAction(ctx, id, "members:delete", { includeDeleted: true });
  if (!member.deletedAt) return;
  await ctx.db.$transaction(async (tx) => {
    await tx.member.update({ where: { id }, data: { deletedAt: null } });
    await recordAudit(tx, auditActor(ctx), {
      action: "member.restored_from_trash",
      entityType: "Member",
      entityId: id,
      summary: `Mitglied ${member.firstName} ${member.lastName} aus dem Papierkorb wiederhergestellt`,
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Einwilligungen und Verlauf
// ---------------------------------------------------------------------------------------------

export async function recordConsent(
  ctx: TenantContext,
  input: { memberId: string; type: ConsentType; granted: boolean; source: "app" | "paper" },
): Promise<void> {
  const member = await loadForAction(ctx, input.memberId, "members:update");
  if (!can(ctx, "members:read_private", resourceOf(member))) throw forbidden();
  await ctx.db.$transaction(async (tx) => {
    await tx.consent.create({
      data: {
        clubId: ctx.clubId,
        memberId: member.id,
        type: input.type,
        granted: input.granted,
        source: input.source,
        recordedBy: ctx.userId,
      },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "member.consent_changed",
      entityType: "Member",
      entityId: member.id,
      summary: `Einwilligung ${input.type} ${input.granted ? "erteilt" : "widerrufen"}`,
      changes: { [input.type]: { to: input.granted } },
    });
  });
}

export interface HistoryEntry {
  id: string;
  action: string;
  summary: string | null;
  changes: Record<string, unknown> | null;
  createdAt: Date;
  actorName: string | null;
}

export async function getMemberHistory(ctx: TenantContext, id: string): Promise<HistoryEntry[]> {
  const member = await ctx.db.member.findFirst({ where: { id }, include: rowInclude });
  if (!member || !can(ctx, "members:read", resourceOf(member))) throw notFound("Das Mitglied");
  if (!can(ctx, "members:read_private", resourceOf(member))) throw forbidden();

  const logs = await ctx.db.auditLog.findMany({
    where: { entityType: "Member", entityId: id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const actorIds = [
    ...new Set(logs.map((log) => log.actorUserId).filter((value): value is string => !!value)),
  ];
  const actors = actorIds.length
    ? await ctx.db.clubMembership.findMany({
        where: { userId: { in: actorIds } },
        select: { userId: true, user: { select: { firstName: true, lastName: true } } },
      })
    : [];
  const names = new Map(actors.map((a) => [a.userId, `${a.user.firstName} ${a.user.lastName}`]));

  return logs.map((log) => ({
    id: log.id,
    action: log.action,
    summary: log.summary,
    changes: (log.changes as Record<string, unknown> | null) ?? null,
    createdAt: log.createdAt,
    actorName: log.actorUserId ? (names.get(log.actorUserId) ?? "Ehemaliger Benutzer") : "System",
  }));
}

// ---------------------------------------------------------------------------------------------
// Geburtstage
// ---------------------------------------------------------------------------------------------

export interface UpcomingBirthday {
  memberId: string;
  name: string;
  /** Kalendertag des Geburtstags (UTC-Mitternacht, `@db.Date`-Konvention). */
  date: Date;
  turns: number;
  inDays: number;
}

/** Darf der Benutzer Geburtstage anderer Mitglieder sehen? (Nur mit vereinsweitem oder Abteilungs-Recht auf sensible Daten.) */
export function canSeeBirthdays(ctx: TenantContext): boolean {
  const privateScope = scopeOf(ctx, "members:read_private");
  return (privateScope === "CLUB" || privateScope === "DEPARTMENT") && can(ctx, "members:read");
}

/**
 * Geburtstage der nächsten Tage. Das Geburtsdatum gehört zu den sensiblen Angaben: Nur wer es ansehen darf
 * (`members:read_private`, vereinsweit oder für die eigene Abteilung) bekommt die Liste – sonst ist sie leer.
 * Berücksichtigt werden aktive, passive und Ehrenmitglieder ohne Archiv/Papierkorb.
 */
export async function listUpcomingBirthdays(
  ctx: TenantContext,
  options: { days?: number; limit?: number; now?: Date } = {},
): Promise<UpcomingBirthday[]> {
  if (!canSeeBirthdays(ctx)) return [];

  const rows = await ctx.db.member.findMany({
    where: {
      AND: [
        {
          archivedAt: null,
          deletedAt: null,
          status: { in: ["ACTIVE", "PASSIVE", "HONORARY"] },
          birthDate: { not: null },
        },
        scopedMembers(ctx, "members:read") ?? {},
        scopedMembers(ctx, "members:read_private") ?? {},
      ],
    },
    select: { id: true, firstName: true, lastName: true, birthDate: true },
    take: 5000,
  });

  const today = todayCalendarDate(options.now);
  const horizon = options.days ?? 14;
  return rows
    .map((row) => ({ row, next: nextBirthday(row.birthDate!, today) }))
    .filter(({ next }) => next.inDays <= horizon)
    .sort(
      (a, b) => a.next.inDays - b.next.inDays || a.row.lastName.localeCompare(b.row.lastName, "de"),
    )
    .slice(0, options.limit ?? 10)
    .map(({ row, next }) => ({
      memberId: row.id,
      name: `${row.firstName} ${row.lastName}`,
      date: next.date,
      turns: next.turns,
      inDays: next.inDays,
    }));
}

// ---------------------------------------------------------------------------------------------
// Statistik
// ---------------------------------------------------------------------------------------------

export interface MemberStats {
  total: number;
  byStatus: { status: MemberStatus; count: number }[];
  byDepartment: { id: string; name: string; count: number }[];
  joinedPerYear: { year: number; count: number }[];
  /** Nur mit vereinsweiter Berechtigung für sensible Daten. */
  ageGroups: { label: string; count: number }[] | null;
}

const AGE_GROUPS: [string, number, number][] = [
  ["bis 13 Jahre", 0, 13],
  ["14–17 Jahre", 14, 17],
  ["18–29 Jahre", 18, 29],
  ["30–49 Jahre", 30, 49],
  ["50–64 Jahre", 50, 64],
  ["ab 65 Jahre", 65, 200],
];

export async function getMemberStats(ctx: TenantContext): Promise<MemberStats> {
  assertCan(ctx, "members:read");
  const where: Prisma.MemberWhereInput = {
    AND: [{ archivedAt: null, deletedAt: null }, readScope(ctx) ?? {}],
  };

  const [statusGroups, memberships, joined, departments] = await Promise.all([
    ctx.db.member.groupBy({ by: ["status"], where, _count: { _all: true } }),
    ctx.db.memberDepartment.groupBy({
      by: ["departmentId"],
      where: { member: where },
      _count: { _all: true },
    }),
    ctx.db.member.findMany({
      where: { AND: [where, { joinedAt: { not: null } }] },
      select: { joinedAt: true },
    }),
    ctx.db.department.findMany({ select: { id: true, name: true } }),
  ]);

  const names = new Map(departments.map((d) => [d.id, d.name]));
  const perYear = new Map<number, number>();
  for (const { joinedAt } of joined) {
    const year = joinedAt!.getUTCFullYear();
    perYear.set(year, (perYear.get(year) ?? 0) + 1);
  }

  let ageGroups: MemberStats["ageGroups"] = null;
  if (scopeOf(ctx, "members:read_private") === "CLUB") {
    const births = await ctx.db.member.findMany({
      where: { AND: [where, { birthDate: { not: null } }] },
      select: { birthDate: true },
    });
    const today = todayCalendarDate(); // Kalendertag in Berlin – wie überall sonst bei Altersangaben
    ageGroups = AGE_GROUPS.map(([label, min, max]) => ({
      label,
      count: births.filter(({ birthDate }) => {
        const age = ageOn(birthDate!, today);
        return age >= min && age <= max;
      }).length,
    }));
  }

  return {
    total: statusGroups.reduce((sum, g) => sum + g._count._all, 0),
    byStatus: statusGroups.map((g) => ({ status: g.status, count: g._count._all })),
    byDepartment: memberships
      .map((m) => ({
        id: m.departmentId,
        name: names.get(m.departmentId) ?? "?",
        count: m._count._all,
      }))
      .sort((a, b) => b.count - a.count),
    joinedPerYear: [...perYear.entries()]
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year - b.year)
      .slice(-8),
    ageGroups,
  };
}
