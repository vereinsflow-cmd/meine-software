import { diffChanges, recordAudit } from "@/server/audit/audit";
import { badRequest, conflict, forbidden, notFound, validationFailed } from "@/server/errors";
import { assertCan, can, scopeOf } from "@/server/permissions/policy";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import type { DepartmentInput, GroupInput } from "./schemas";

/**
 * Abteilungen und Gruppen.
 *  - Ansehen: alle Mitglieder (Namen, Zähler); Mitgliederlisten nur nach Mitglieder-Berechtigung.
 *  - Pflegen: `departments:manage`. Vereinsweite Berechtigung: alles. Abteilungsleiter: nur die eigene Abteilung
 *    und deren Gruppen – aber keine Abteilungen anlegen, deaktivieren, löschen oder Leiter bestimmen.
 */
export interface DepartmentListItem {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  isActive: boolean;
  memberCount: number;
  groupCount: number;
  leaders: { id: string; name: string }[];
}

const isClubWide = (ctx: TenantContext) => scopeOf(ctx, "departments:manage") === "CLUB";

export async function listDepartments(
  ctx: TenantContext,
  options: { includeInactive?: boolean } = {},
): Promise<DepartmentListItem[]> {
  assertCan(ctx, "departments:read");
  const [departments, counts, leaders, groups] = await Promise.all([
    ctx.db.department.findMany({
      where: options.includeInactive ? {} : { isActive: true },
      orderBy: { name: "asc" },
    }),
    ctx.db.memberDepartment.groupBy({
      by: ["departmentId"],
      where: { member: { archivedAt: null, deletedAt: null } },
      _count: { _all: true },
    }),
    ctx.db.memberDepartment.findMany({
      where: { isLeader: true, member: { archivedAt: null, deletedAt: null } },
      select: {
        departmentId: true,
        member: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    ctx.db.group.groupBy({
      by: ["departmentId"],
      where: { isActive: true, departmentId: { not: null } },
      _count: { _all: true },
    }),
  ]);

  return departments.map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    color: d.color,
    isActive: d.isActive,
    memberCount: counts.find((c) => c.departmentId === d.id)?._count._all ?? 0,
    groupCount: groups.find((g) => g.departmentId === d.id)?._count._all ?? 0,
    leaders: leaders
      .filter((l) => l.departmentId === d.id)
      .map((l) => ({ id: l.member.id, name: `${l.member.firstName} ${l.member.lastName}` })),
  }));
}

export interface DepartmentDetail extends DepartmentListItem {
  canManage: boolean;
  canManageClubWide: boolean;
  members: { id: string; name: string; clubFunction: string | null; isLeader: boolean }[] | null;
  groups: {
    id: string;
    name: string;
    description: string | null;
    isActive: boolean;
    members: { id: string; name: string; isLead: boolean }[];
  }[];
}

export async function getDepartment(ctx: TenantContext, id: string): Promise<DepartmentDetail> {
  assertCan(ctx, "departments:read");
  const department = await ctx.db.department.findFirst({ where: { id } });
  if (!department) throw notFound("Die Abteilung");

  const canSeeMembers = can(ctx, "members:read");
  const [list, members, groups] = await Promise.all([
    listDepartments(ctx, { includeInactive: true }).then((all) => all.find((d) => d.id === id)!),
    canSeeMembers
      ? ctx.db.memberDepartment.findMany({
          where: {
            departmentId: id,
            member: {
              archivedAt: null,
              deletedAt: null,
              // Nur Mitglieder, die der Benutzer auch sonst sehen dürfte (Reichweite der Leseberechtigung).
              ...(ctx.permissions.get("members:read") === "OWN"
                ? { id: ctx.memberId ?? "kein-mitglied" }
                : {}),
              ...(ctx.permissions.get("members:read") === "DEPARTMENT"
                ? { departments: { some: { departmentId: { in: [...ctx.ledDepartmentIds] } } } }
                : {}),
            },
          },
          select: {
            isLeader: true,
            member: { select: { id: true, firstName: true, lastName: true, clubFunction: true } },
          },
        })
      : Promise.resolve(null),
    ctx.db.group.findMany({
      where: { departmentId: id },
      orderBy: { name: "asc" },
      include: {
        members: { include: { member: { select: { id: true, firstName: true, lastName: true } } } },
      },
    }),
  ]);

  return {
    ...list,
    canManage: can(ctx, "departments:manage", { departmentIds: [id] }),
    canManageClubWide: isClubWide(ctx),
    members:
      members
        ?.map((m) => ({
          id: m.member.id,
          name: `${m.member.lastName}, ${m.member.firstName}`,
          clubFunction: m.member.clubFunction,
          isLeader: m.isLeader,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "de")) ?? null,
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      isActive: g.isActive,
      members: g.members
        .map((m) => ({
          id: m.member.id,
          name: `${m.member.firstName} ${m.member.lastName}`,
          isLead: m.isLead,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, "de")),
    })),
  };
}

async function assertNameFree(ctx: TenantContext, name: string, exceptId?: string): Promise<void> {
  const existing = await ctx.db.department.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (existing)
    throw validationFailed({ name: ["Eine Abteilung mit diesem Namen existiert bereits."] });
}

export async function createDepartment(
  ctx: TenantContext,
  input: DepartmentInput,
): Promise<{ id: string }> {
  assertCan(ctx, "departments:manage");
  if (!isClubWide(ctx)) throw forbidden("Neue Abteilungen kann nur der Vorstand anlegen.");
  await assertNameFree(ctx, input.name);

  return ctx.db.$transaction(async (tx) => {
    const department = await tx.department.create({
      data: {
        clubId: ctx.clubId,
        name: input.name,
        description: input.description ?? null,
        color: input.color ?? null,
      },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "department.created",
      entityType: "Department",
      entityId: department.id,
      summary: `Abteilung ${input.name} angelegt`,
    });
    return { id: department.id };
  });
}

async function loadManageable(ctx: TenantContext, id: string) {
  const department = await ctx.db.department.findFirst({ where: { id } });
  if (!department) throw notFound("Die Abteilung");
  if (!can(ctx, "departments:manage", { departmentIds: [id] })) throw forbidden();
  return department;
}

export async function updateDepartment(
  ctx: TenantContext,
  id: string,
  input: DepartmentInput,
): Promise<void> {
  const before = await loadManageable(ctx, id);
  await assertNameFree(ctx, input.name, id);
  const after = {
    name: input.name,
    description: input.description ?? null,
    color: input.color ?? null,
  };
  await ctx.db.$transaction(async (tx) => {
    await tx.department.update({ where: { id }, data: after });
    const changes = diffChanges(before, after);
    if (changes) {
      await recordAudit(tx, auditActor(ctx), {
        action: "department.updated",
        entityType: "Department",
        entityId: id,
        summary: `Abteilung ${input.name} geändert`,
        changes,
      });
    }
  });
}

export async function setDepartmentActive(
  ctx: TenantContext,
  id: string,
  isActive: boolean,
): Promise<void> {
  const department = await loadManageable(ctx, id);
  if (!isClubWide(ctx)) throw forbidden("Abteilungen kann nur der Vorstand (de)aktivieren.");
  if (department.isActive === isActive) return;
  await ctx.db.$transaction(async (tx) => {
    await tx.department.update({ where: { id }, data: { isActive } });
    await recordAudit(tx, auditActor(ctx), {
      action: isActive ? "department.activated" : "department.deactivated",
      entityType: "Department",
      entityId: id,
      summary: `Abteilung ${department.name} ${isActive ? "aktiviert" : "deaktiviert"}`,
    });
  });
}

/** Löscht eine Abteilung nur, wenn nichts mehr daran hängt – sonst muss sie deaktiviert werden. */
export async function deleteDepartment(ctx: TenantContext, id: string): Promise<void> {
  const department = await loadManageable(ctx, id);
  if (!isClubWide(ctx)) throw forbidden("Abteilungen kann nur der Vorstand löschen.");

  const [members, events, groups, messages] = await Promise.all([
    ctx.db.memberDepartment.count({ where: { departmentId: id } }),
    ctx.db.event.count({ where: { departmentId: id } }),
    ctx.db.group.count({ where: { departmentId: id } }),
    ctx.db.message.count({ where: { departmentId: id } }),
  ]);
  if (members + events + groups + messages > 0) {
    throw conflict(
      `Die Abteilung ist noch in Benutzung (${members} Mitglieder, ${events} Veranstaltungen, ${groups} Gruppen). Bitte deaktiviere sie stattdessen.`,
    );
  }
  await ctx.db.$transaction(async (tx) => {
    await tx.department.delete({ where: { id } });
    await recordAudit(tx, auditActor(ctx), {
      action: "department.deleted",
      entityType: "Department",
      entityId: id,
      summary: `Abteilung ${department.name} gelöscht`,
    });
  });
}

/** Bestimmt oder entzieht die Abteilungsleitung. Nur vereinsweit berechtigte Rollen (Vorstand, Administrator). */
export async function setDepartmentLeader(
  ctx: TenantContext,
  input: { departmentId: string; memberId: string; isLeader: boolean },
): Promise<void> {
  assertCan(ctx, "departments:manage");
  if (!isClubWide(ctx)) throw forbidden("Die Abteilungsleitung bestimmt der Vorstand.");
  const link = await ctx.db.memberDepartment.findFirst({
    where: {
      departmentId: input.departmentId,
      memberId: input.memberId,
      member: { deletedAt: null },
    },
    include: {
      member: { select: { firstName: true, lastName: true } },
      department: { select: { name: true } },
    },
  });
  if (!link) throw badRequest("Das Mitglied gehört der Abteilung nicht an.");
  if (link.isLeader === input.isLeader) return;

  await ctx.db.$transaction(async (tx) => {
    await tx.memberDepartment.updateMany({
      where: { departmentId: input.departmentId, memberId: input.memberId },
      data: { isLeader: input.isLeader },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: input.isLeader ? "department.leader_set" : "department.leader_removed",
      entityType: "Department",
      entityId: input.departmentId,
      summary: `${link.member.firstName} ${link.member.lastName} ist ${input.isLeader ? "jetzt" : "nicht mehr"} Leitung der Abteilung ${link.department.name}`,
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Gruppen
// ---------------------------------------------------------------------------------------------

async function loadGroupManageable(ctx: TenantContext, groupId: string) {
  const group = await ctx.db.group.findFirst({ where: { id: groupId } });
  if (!group) throw notFound("Die Gruppe");
  // Gruppen einer Abteilung: Leitung der Abteilung genügt; vereinsweite Gruppen: nur vereinsweit Berechtigte.
  const allowed = group.departmentId
    ? can(ctx, "departments:manage", { departmentIds: [group.departmentId] })
    : isClubWide(ctx);
  if (!allowed) throw forbidden();
  return group;
}

export async function createGroup(ctx: TenantContext, input: GroupInput): Promise<{ id: string }> {
  assertCan(ctx, "departments:manage");
  if (input.departmentId) {
    if (!can(ctx, "departments:manage", { departmentIds: [input.departmentId] })) throw forbidden();
    if (
      !(await ctx.db.department.findFirst({
        where: { id: input.departmentId },
        select: { id: true },
      }))
    )
      throw notFound("Die Abteilung");
  } else if (!isClubWide(ctx)) {
    throw forbidden("Vereinsweite Gruppen kann nur der Vorstand anlegen.");
  }

  return ctx.db.$transaction(async (tx) => {
    const group = await tx.group.create({
      data: {
        clubId: ctx.clubId,
        departmentId: input.departmentId ?? null,
        name: input.name,
        description: input.description ?? null,
      },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "group.created",
      entityType: "Group",
      entityId: group.id,
      summary: `Gruppe ${input.name} angelegt`,
    });
    return { id: group.id };
  });
}

export async function updateGroup(
  ctx: TenantContext,
  id: string,
  input: { name: string; description?: string | undefined },
): Promise<void> {
  const group = await loadGroupManageable(ctx, id);
  await ctx.db.$transaction(async (tx) => {
    await tx.group.update({
      where: { id },
      data: { name: input.name, description: input.description ?? null },
    });
    const changes = diffChanges(
      { name: group.name, description: group.description },
      { name: input.name, description: input.description ?? null },
    );
    if (changes) {
      await recordAudit(tx, auditActor(ctx), {
        action: "group.updated",
        entityType: "Group",
        entityId: id,
        summary: `Gruppe ${input.name} geändert`,
        changes,
      });
    }
  });
}

export async function deleteGroup(ctx: TenantContext, id: string): Promise<void> {
  const group = await loadGroupManageable(ctx, id);
  const tasks = await ctx.db.task.count({ where: { groupId: id } });
  if (tasks > 0) throw conflict(`Der Gruppe sind noch ${tasks} Aufgaben zugeordnet.`);
  await ctx.db.$transaction(async (tx) => {
    await tx.group.delete({ where: { id } });
    await recordAudit(tx, auditActor(ctx), {
      action: "group.deleted",
      entityType: "Group",
      entityId: id,
      summary: `Gruppe ${group.name} gelöscht`,
    });
  });
}

export async function addGroupMember(
  ctx: TenantContext,
  input: { groupId: string; memberId: string },
): Promise<void> {
  const group = await loadGroupManageable(ctx, input.groupId);
  const member = await ctx.db.member.findFirst({
    where: { id: input.memberId, deletedAt: null, archivedAt: null },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!member) throw notFound("Das Mitglied");
  await ctx.db.$transaction(async (tx) => {
    await tx.groupMember.createMany({
      data: [{ clubId: ctx.clubId, groupId: group.id, memberId: member.id }],
      skipDuplicates: true,
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "group.member_added",
      entityType: "Group",
      entityId: group.id,
      summary: `${member.firstName} ${member.lastName} zur Gruppe ${group.name} hinzugefügt`,
    });
  });
}

export async function removeGroupMember(
  ctx: TenantContext,
  input: { groupId: string; memberId: string },
): Promise<void> {
  const group = await loadGroupManageable(ctx, input.groupId);
  await ctx.db.$transaction(async (tx) => {
    const result = await tx.groupMember.deleteMany({
      where: { groupId: group.id, memberId: input.memberId },
    });
    if (result.count > 0) {
      await recordAudit(tx, auditActor(ctx), {
        action: "group.member_removed",
        entityType: "Group",
        entityId: group.id,
        summary: `Mitglied aus der Gruppe ${group.name} entfernt`,
      });
    }
  });
}
