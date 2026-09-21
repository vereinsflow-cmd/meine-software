import type { Prisma } from "@/generated/prisma/client";
import type { TaskPriority, TaskStatus } from "@/generated/prisma/enums";
import {
  addBerlinDays,
  formatCalendarDate,
  parseCalendarDate,
  startOfBerlinDay,
  todayCalendarDate,
} from "@/lib/dates";
import { paged, type PageRequest, type Paged } from "@/lib/search-params";
import { notifyUsers } from "@/modules/notifications/service";
import { diffChanges, recordAudit } from "@/server/audit/audit";
import type { TenantDb, TenantTx } from "@/server/db/tenant";
import { forbidden, notFound, validationFailed } from "@/server/errors";
import { assertCan, can, scopeOf, type ResourceRef } from "@/server/permissions/policy";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import type { TaskInput } from "./schemas";

/**
 * Aufgaben – Geschäftslogik.
 *
 * Sichtbarkeit (`tasks:read`): Verein = alle; Abteilung = Aufgaben der eigenen Abteilung(en) (über Veranstaltung, Gruppe
 * oder zuständiges Mitglied) sowie eigene und selbst angelegte; nur eigene = die mir zugewiesenen.
 * Verwalten (`tasks:manage`) betrifft Anlegen, Bearbeiten, Zuweisen, Löschen; den STATUS ändern darf, wer verwalten darf
 * oder (`tasks:update`) die Aufgabe selbst bearbeitet. Gelöscht wird weich (Papierkorb-Prinzip: `deletedAt`).
 */
const taskInclude = {
  assignee: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      userId: true,
      departments: { select: { departmentId: true } },
    },
  },
  event: { select: { id: true, title: true, departmentId: true } },
  group: { select: { id: true, name: true, departmentId: true } },
} satisfies Prisma.TaskInclude;
type TaskRow = Prisma.TaskGetPayload<{ include: typeof taskInclude }>;

const fullName = (member: { firstName: string; lastName: string }) =>
  `${member.firstName} ${member.lastName}`;

/** Abteilungen, zu denen die Aufgabe gehört: über Veranstaltung, Gruppe und das zuständige Mitglied. */
function departmentsOf(task: TaskRow): string[] {
  const ids = new Set<string>();
  if (task.event?.departmentId) ids.add(task.event.departmentId);
  if (task.group?.departmentId) ids.add(task.group.departmentId);
  for (const membership of task.assignee?.departments ?? []) ids.add(membership.departmentId);
  return [...ids];
}

const resourceOf = (task: TaskRow): ResourceRef => ({
  departmentIds: departmentsOf(task),
  ownerMemberId: task.assigneeMemberId,
  ownerUserId: task.createdById,
});

function visibilityWhere(ctx: TenantContext): Prisma.TaskWhereInput {
  const scope = scopeOf(ctx, "tasks:read");
  if (scope === null) throw forbidden();
  if (scope === "CLUB") return { deletedAt: null };
  if (scope === "OWN")
    return {
      deletedAt: null,
      ...(ctx.memberId ? { assigneeMemberId: ctx.memberId } : { id: "kein-mitglied" }),
    };
  const led = [...ctx.ledDepartmentIds];
  return {
    deletedAt: null,
    OR: [
      { createdById: ctx.userId },
      ...(ctx.memberId ? [{ assigneeMemberId: ctx.memberId }] : []),
      { event: { departmentId: { in: led } } },
      { group: { departmentId: { in: led } } },
      { assignee: { departments: { some: { departmentId: { in: led } } } } },
    ],
  };
}

export interface TaskDto {
  id: string;
  title: string;
  description: string | null;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  /** Kalendertag (UTC-Mitternacht, `@db.Date`-Konvention). */
  dueDate: Date | null;
  overdue: boolean;
  completedAt: Date | null;
  assignee: { id: string; name: string } | null;
  event: { id: string; title: string } | null;
  group: { id: string; name: string } | null;
  can: { edit: boolean; setStatus: boolean };
}

function toDto(ctx: TenantContext, task: TaskRow, today = todayCalendarDate()): TaskDto {
  const resource = resourceOf(task);
  const manage = can(ctx, "tasks:manage", resource);
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    notes: manage ? task.notes : null,
    status: task.status,
    priority: task.priority,
    dueDate: task.dueDate,
    overdue:
      task.status !== "DONE" && task.dueDate !== null && task.dueDate.getTime() < today.getTime(),
    completedAt: task.completedAt,
    assignee: task.assignee ? { id: task.assignee.id, name: fullName(task.assignee) } : null,
    event: task.event ? { id: task.event.id, title: task.event.title } : null,
    group: task.group ? { id: task.group.id, name: task.group.name } : null,
    can: { edit: manage, setStatus: manage || can(ctx, "tasks:update", resource) },
  };
}

// ---------------------------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------------------------

export interface TaskListQuery {
  q?: string;
  /** offen = nicht erledigt (Standard), erledigt, alle */
  view: "open" | "done" | "all";
  priority?: TaskPriority;
  /** "me" = mir zugewiesen, "none" = niemandem zugewiesen, sonst eine Mitglieds-ID */
  assignee?: string;
  eventId?: string;
  overdueOnly?: boolean;
  request: PageRequest;
}

export async function listTasks(ctx: TenantContext, query: TaskListQuery): Promise<Paged<TaskDto>> {
  assertCan(ctx, "tasks:read");
  const tokens = (query.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  const today = todayCalendarDate();
  const assignee: Prisma.TaskWhereInput =
    query.assignee === "me"
      ? { assigneeMemberId: ctx.memberId ?? "kein-mitglied" }
      : query.assignee === "none"
        ? { assigneeMemberId: null }
        : query.assignee
          ? { assigneeMemberId: query.assignee }
          : {};
  const where: Prisma.TaskWhereInput = {
    AND: [
      visibilityWhere(ctx),
      query.view === "open"
        ? { status: { not: "DONE" } }
        : query.view === "done"
          ? { status: "DONE" }
          : {},
      query.priority ? { priority: query.priority } : {},
      assignee,
      query.eventId ? { eventId: query.eventId } : {},
      query.overdueOnly ? { status: { not: "DONE" }, dueDate: { lt: today } } : {},
      ...tokens.map((token) => ({
        OR: [
          { title: { contains: token, mode: "insensitive" as const } },
          { description: { contains: token, mode: "insensitive" as const } },
        ],
      })),
    ],
  };
  const [rows, total] = await Promise.all([
    ctx.db.task.findMany({
      where,
      include: taskInclude,
      // Fällige zuerst (ohne Termin zuletzt), dann dringende, dann neue.
      orderBy:
        query.view === "done"
          ? [{ completedAt: "desc" }]
          : [
              { dueDate: { sort: "asc", nulls: "last" } },
              { priority: "desc" },
              { createdAt: "desc" },
            ],
      skip: query.request.skip,
      take: query.request.pageSize,
    }),
    ctx.db.task.count({ where }),
  ]);
  return paged(
    rows.map((row) => toDto(ctx, row, today)),
    total,
    query.request,
  );
}

export async function getTask(ctx: TenantContext, id: string): Promise<TaskDto> {
  assertCan(ctx, "tasks:read");
  const row = await ctx.db.task.findFirst({
    where: { AND: [{ id }, visibilityWhere(ctx)] },
    include: taskInclude,
  });
  if (!row) throw notFound("Die Aufgabe");
  return toDto(ctx, row);
}

export interface TaskStats {
  open: number;
  overdue: number;
  mineOpen: number;
}

/** Kennzahlen im Rahmen der Sichtbarkeit (für das Dashboard). */
export async function getTaskStats(ctx: TenantContext): Promise<TaskStats> {
  assertCan(ctx, "tasks:read");
  const visible = visibilityWhere(ctx);
  const today = todayCalendarDate();
  const [open, overdue, mineOpen] = await Promise.all([
    ctx.db.task.count({ where: { AND: [visible, { status: { not: "DONE" } }] } }),
    ctx.db.task.count({
      where: { AND: [visible, { status: { not: "DONE" }, dueDate: { lt: today } }] },
    }),
    ctx.memberId
      ? ctx.db.task.count({
          where: { AND: [visible, { status: { not: "DONE" }, assigneeMemberId: ctx.memberId }] },
        })
      : Promise.resolve(0),
  ]);
  return { open, overdue, mineOpen };
}

/** Anzahl der sichtbaren Aufgaben je Status (für die Auswertungen auf dem Dashboard). */
export async function countTasksByStatus(
  ctx: TenantContext,
): Promise<{ status: TaskStatus; count: number }[]> {
  assertCan(ctx, "tasks:read");
  const groups = await ctx.db.task.groupBy({
    by: ["status"],
    where: visibilityWhere(ctx),
    _count: { _all: true },
  });
  return groups.map((group) => ({ status: group.status, count: group._count._all }));
}

/** Meine offenen Aufgaben, fällige zuerst (für das Dashboard). */
export async function listMyOpenTasks(ctx: TenantContext, limit = 5): Promise<TaskDto[]> {
  assertCan(ctx, "tasks:read");
  if (!ctx.memberId) return [];
  const rows = await ctx.db.task.findMany({
    where: {
      AND: [visibilityWhere(ctx), { status: { not: "DONE" }, assigneeMemberId: ctx.memberId }],
    },
    include: taskInclude,
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }],
    take: limit,
  });
  return rows.map((row) => toDto(ctx, row));
}

export interface TaskFormOptions {
  members: { id: string; name: string }[];
  events: { id: string; title: string }[];
  groups: { id: string; name: string }[];
}

/** Auswahllisten für das Formular – im Rahmen dessen, was der Benutzer sehen darf (Abteilungsleiter: nur die eigene Abteilung). */
export async function getTaskFormOptions(ctx: TenantContext): Promise<TaskFormOptions> {
  if (!can(ctx, "tasks:manage")) return { members: [], events: [], groups: [] };
  const dept = scopeOf(ctx, "tasks:manage") === "DEPARTMENT" ? [...ctx.ledDepartmentIds] : null;
  const [members, events, groups] = await Promise.all([
    ctx.db.member.findMany({
      where: {
        archivedAt: null,
        deletedAt: null,
        status: { in: ["ACTIVE", "HONORARY", "PASSIVE"] },
        ...(dept ? { departments: { some: { departmentId: { in: dept } } } } : {}),
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
      take: 1000,
    }),
    ctx.db.event.findMany({
      where: {
        deletedAt: null,
        status: { in: ["PUBLISHED", "DRAFT"] },
        endsAt: { gte: addBerlinDays(startOfBerlinDay(new Date()), -30) },
        ...(dept ? { departmentId: { in: dept } } : {}),
      },
      orderBy: { startsAt: "asc" },
      select: { id: true, title: true },
      take: 200,
    }),
    ctx.db.group.findMany({
      where: { isActive: true, ...(dept ? { departmentId: { in: dept } } : {}) },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      take: 200,
    }),
  ]);
  return {
    members: members.map((m) => ({ id: m.id, name: `${m.lastName}, ${m.firstName}` })),
    events,
    groups,
  };
}

// ---------------------------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------------------------

type Db = TenantDb | TenantTx;

/** Prüft, dass Mitglied, Veranstaltung und Gruppe zum Verein gehören und nutzbar sind (fremde IDs → "nicht gefunden"). */
async function loadRefs(
  db: Db,
  input: Pick<TaskInput, "assigneeMemberId" | "eventId" | "groupId">,
) {
  const [assignee, event, group] = await Promise.all([
    input.assigneeMemberId
      ? db.member.findFirst({
          where: { id: input.assigneeMemberId, archivedAt: null, deletedAt: null },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            userId: true,
            departments: { select: { departmentId: true } },
          },
        })
      : null,
    input.eventId
      ? db.event.findFirst({
          where: { id: input.eventId, deletedAt: null },
          select: { id: true, title: true, departmentId: true },
        })
      : null,
    input.groupId
      ? db.group.findFirst({
          where: { id: input.groupId, isActive: true },
          select: { id: true, name: true, departmentId: true },
        })
      : null,
  ]);
  if (input.assigneeMemberId && !assignee)
    throw validationFailed({ assigneeMemberId: ["Dieses Mitglied ist nicht verfügbar."] });
  if (input.eventId && !event)
    throw validationFailed({ eventId: ["Diese Veranstaltung ist nicht verfügbar."] });
  if (input.groupId && !group)
    throw validationFailed({ groupId: ["Diese Gruppe ist nicht verfügbar."] });
  return { assignee, event, group };
}

function assertDepartmentReach(
  ctx: TenantContext,
  refs: Awaited<ReturnType<typeof loadRefs>>,
): void {
  if (scopeOf(ctx, "tasks:manage") !== "DEPARTMENT") return;
  const ids = new Set<string>();
  if (refs.event?.departmentId) ids.add(refs.event.departmentId);
  if (refs.group?.departmentId) ids.add(refs.group.departmentId);
  for (const membership of refs.assignee?.departments ?? []) ids.add(membership.departmentId);
  if (![...ids].some((id) => ctx.ledDepartmentIds.includes(id))) {
    throw validationFailed({
      assigneeMemberId: [
        "Als Abteilungsleiter kannst du Aufgaben nur für deine Abteilung anlegen: Wähle eine Person, Veranstaltung oder Gruppe deiner Abteilung.",
      ],
    });
  }
}

const dueOf = (value: string | undefined): Date | null => (value ? parseCalendarDate(value) : null);

async function notifyAssignee(
  ctx: TenantContext,
  tx: TenantTx,
  task: { title: string; dueDate: Date | null },
  assignee: { userId: string | null } | null,
): Promise<void> {
  if (!assignee?.userId || assignee.userId === ctx.userId) return; // Wer sich selbst etwas zuweist, braucht keine Nachricht
  await notifyUsers(tx, ctx.clubId, {
    userIds: [assignee.userId],
    type: "TASK_ASSIGNED",
    title: `Neue Aufgabe: ${task.title}`,
    body: task.dueDate ? `Fällig am ${formatCalendarDate(task.dueDate)}` : null,
    linkUrl: "/aufgaben",
    email: true,
  });
}

export async function createTask(ctx: TenantContext, input: TaskInput): Promise<{ id: string }> {
  assertCan(ctx, "tasks:manage");
  const refs = await loadRefs(ctx.db, input);
  assertDepartmentReach(ctx, refs);

  return ctx.db.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        clubId: ctx.clubId,
        title: input.title,
        description: input.description ?? null,
        notes: input.notes ?? null,
        assigneeMemberId: refs.assignee?.id ?? null,
        eventId: refs.event?.id ?? null,
        groupId: refs.group?.id ?? null,
        dueDate: dueOf(input.dueDate),
        priority: input.priority,
        status: input.status,
        completedAt: input.status === "DONE" ? new Date() : null,
        createdById: ctx.userId,
      },
    });
    await notifyAssignee(ctx, tx, task, refs.assignee);
    await recordAudit(tx, auditActor(ctx), {
      action: "task.created",
      entityType: "Task",
      entityId: task.id,
      summary: `Aufgabe „${task.title}“ angelegt`,
    });
    return { id: task.id };
  });
}

async function loadForManage(ctx: TenantContext, id: string): Promise<TaskRow> {
  const row = await ctx.db.task.findFirst({
    where: { AND: [{ id }, visibilityWhere(ctx)] },
    include: taskInclude,
  });
  if (!row) throw notFound("Die Aufgabe");
  if (!can(ctx, "tasks:manage", resourceOf(row))) throw forbidden();
  return row;
}

export async function updateTask(ctx: TenantContext, id: string, input: TaskInput): Promise<void> {
  const before = await loadForManage(ctx, id);
  const refs = await loadRefs(ctx.db, input);
  assertDepartmentReach(ctx, refs);
  const reassigned = (refs.assignee?.id ?? null) !== before.assigneeMemberId;

  await ctx.db.$transaction(async (tx) => {
    const wasDone = before.status === "DONE";
    const updated = await tx.task.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description ?? null,
        notes: input.notes ?? null,
        assigneeMemberId: refs.assignee?.id ?? null,
        eventId: refs.event?.id ?? null,
        groupId: refs.group?.id ?? null,
        dueDate: dueOf(input.dueDate),
        priority: input.priority,
        status: input.status,
        completedAt: input.status === "DONE" ? (wasDone ? before.completedAt : new Date()) : null,
      },
    });
    if (reassigned) await notifyAssignee(ctx, tx, updated, refs.assignee);
    const changes = diffChanges(
      {
        title: before.title,
        description: before.description,
        assignee: before.assignee ? fullName(before.assignee) : null,
        dueDate: before.dueDate,
        priority: before.priority,
        status: before.status,
      },
      {
        title: updated.title,
        description: updated.description,
        assignee: refs.assignee ? fullName(refs.assignee) : null,
        dueDate: updated.dueDate,
        priority: updated.priority,
        status: updated.status,
      },
      { masked: ["description"] },
    );
    await recordAudit(tx, auditActor(ctx), {
      action: "task.updated",
      entityType: "Task",
      entityId: id,
      summary: `Aufgabe „${updated.title}“ geändert`,
      changes,
    });
  });
}

/** Status ändern: Verwalter für jede sichtbare Aufgabe, sonst nur der/die Zuständige (`tasks:update`). */
export async function setTaskStatus(
  ctx: TenantContext,
  id: string,
  status: TaskStatus,
): Promise<void> {
  assertCan(ctx, "tasks:read");
  const row = await ctx.db.task.findFirst({
    where: { AND: [{ id }, visibilityWhere(ctx)] },
    include: taskInclude,
  });
  if (!row) throw notFound("Die Aufgabe");
  const resource = resourceOf(row);
  if (!can(ctx, "tasks:manage", resource) && !can(ctx, "tasks:update", resource)) throw forbidden();
  if (row.status === status) return;

  await ctx.db.$transaction(async (tx) => {
    await tx.task.update({
      where: { id },
      data: { status, completedAt: status === "DONE" ? new Date() : null },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "task.status_changed",
      entityType: "Task",
      entityId: id,
      summary: `Status der Aufgabe „${row.title}“ geändert`,
      changes: { status: { from: row.status, to: status } },
    });
  });
}

export async function deleteTask(ctx: TenantContext, id: string): Promise<void> {
  const row = await loadForManage(ctx, id);
  await ctx.db.$transaction(async (tx) => {
    await tx.task.update({ where: { id }, data: { deletedAt: new Date() } });
    await recordAudit(tx, auditActor(ctx), {
      action: "task.deleted",
      entityType: "Task",
      entityId: id,
      summary: `Aufgabe „${row.title}“ gelöscht`,
    });
  });
}
