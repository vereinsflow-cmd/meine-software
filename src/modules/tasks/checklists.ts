import type { Prisma } from "@/generated/prisma/client";
import { parseCalendarDate } from "@/lib/dates";
import { recordAudit } from "@/server/audit/audit";
import { forbidden, notFound, validationFailed } from "@/server/errors";
import { assertCan, can, scopeOf, type ResourceRef } from "@/server/permissions/policy";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import type { ChecklistInput } from "./schemas";

/**
 * Checklisten (z. B. "Vorbereitung Sommerfest"), optional einer Veranstaltung zugeordnet.
 *
 * Lesen: Rollen mit `tasks:read` für den Verein oder die eigene Abteilung (Abteilungsleiter sehen die Listen ihrer
 * Veranstaltungen). Verwalten (anlegen, löschen, Punkte hinzufügen/entfernen): `tasks:manage`. Abhaken darf, wer
 * verwalten darf oder ein Punkt SELBST zugewiesen ist (`tasks:update`).
 */
const include = {
  event: { select: { id: true, title: true, departmentId: true } },
  items: {
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    include: { assignee: { select: { id: true, firstName: true, lastName: true } } },
  },
} satisfies Prisma.ChecklistInclude;
type ChecklistRow = Prisma.ChecklistGetPayload<{ include: typeof include }>;

export interface ChecklistItemDto {
  id: string;
  text: string;
  isDone: boolean;
  doneAt: Date | null;
  dueDate: Date | null;
  assignee: { id: string; name: string } | null;
  canToggle: boolean;
}

export interface ChecklistDto {
  id: string;
  title: string;
  event: { id: string; title: string } | null;
  items: ChecklistItemDto[];
  done: number;
  canManage: boolean;
}

const resourceOf = (row: { event: { departmentId: string | null } | null }): ResourceRef => ({
  departmentIds: row.event?.departmentId ? [row.event.departmentId] : [],
});

function visibilityWhere(ctx: TenantContext): Prisma.ChecklistWhereInput {
  const scope = scopeOf(ctx, "tasks:read");
  if (scope === "CLUB") return { deletedAt: null };
  if (scope === "DEPARTMENT")
    return { deletedAt: null, event: { departmentId: { in: [...ctx.ledDepartmentIds] } } };
  throw forbidden(); // "nur eigene Aufgaben" sieht keine Checklisten
}

function toDto(ctx: TenantContext, row: ChecklistRow): ChecklistDto {
  const manage = can(ctx, "tasks:manage", resourceOf(row));
  return {
    id: row.id,
    title: row.title,
    event: row.event ? { id: row.event.id, title: row.event.title } : null,
    items: row.items.map((item) => ({
      id: item.id,
      text: item.text,
      isDone: item.isDone,
      doneAt: item.doneAt,
      dueDate: item.dueDate,
      assignee: item.assignee
        ? { id: item.assignee.id, name: `${item.assignee.firstName} ${item.assignee.lastName}` }
        : null,
      canToggle:
        manage ||
        (can(ctx, "tasks:update") &&
          item.assigneeMemberId !== null &&
          item.assigneeMemberId === ctx.memberId),
    })),
    done: row.items.filter((item) => item.isDone).length,
    canManage: manage,
  };
}

export async function listChecklists(
  ctx: TenantContext,
  options: { eventId?: string } = {},
): Promise<ChecklistDto[]> {
  assertCan(ctx, "tasks:read");
  const rows = await ctx.db.checklist.findMany({
    where: { AND: [visibilityWhere(ctx), options.eventId ? { eventId: options.eventId } : {}] },
    include,
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });
  return rows.map((row) => toDto(ctx, row));
}

async function loadVisible(ctx: TenantContext, id: string): Promise<ChecklistRow> {
  assertCan(ctx, "tasks:read");
  const row = await ctx.db.checklist.findFirst({
    where: { AND: [{ id }, visibilityWhere(ctx)] },
    include,
  });
  if (!row) throw notFound("Die Checkliste");
  return row;
}

async function loadForManage(ctx: TenantContext, id: string): Promise<ChecklistRow> {
  const row = await loadVisible(ctx, id);
  if (!can(ctx, "tasks:manage", resourceOf(row))) throw forbidden();
  return row;
}

export async function createChecklist(
  ctx: TenantContext,
  input: Pick<ChecklistInput, "title"> & { eventId?: string | undefined },
): Promise<{ id: string }> {
  assertCan(ctx, "tasks:manage");
  const event = input.eventId
    ? await ctx.db.event.findFirst({
        where: { id: input.eventId, deletedAt: null },
        select: { id: true, departmentId: true },
      })
    : null;
  if (input.eventId && !event)
    throw validationFailed({ eventId: ["Diese Veranstaltung ist nicht verfügbar."] });
  // Abteilungsleiter legen nur Listen für Veranstaltungen ihrer Abteilung an.
  if (!can(ctx, "tasks:manage", resourceOf({ event }))) throw forbidden();

  return ctx.db.$transaction(async (tx) => {
    const list = await tx.checklist.create({
      data: { clubId: ctx.clubId, title: input.title, eventId: event?.id ?? null },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "checklist.created",
      entityType: "Checklist",
      entityId: list.id,
      summary: `Checkliste „${list.title}“ angelegt`,
    });
    return { id: list.id };
  });
}

export async function deleteChecklist(ctx: TenantContext, id: string): Promise<void> {
  const row = await loadForManage(ctx, id);
  await ctx.db.$transaction(async (tx) => {
    await tx.checklist.update({ where: { id }, data: { deletedAt: new Date() } });
    await recordAudit(tx, auditActor(ctx), {
      action: "checklist.deleted",
      entityType: "Checklist",
      entityId: id,
      summary: `Checkliste „${row.title}“ gelöscht`,
    });
  });
}

const MAX_ITEMS = 200;

export async function addChecklistItem(
  ctx: TenantContext,
  input: { checklistId: string; text: string; assigneeMemberId?: string; dueDate?: string },
): Promise<{ id: string }> {
  const list = await loadForManage(ctx, input.checklistId);
  if (list.items.length >= MAX_ITEMS)
    throw validationFailed({
      text: [`Eine Checkliste kann höchstens ${MAX_ITEMS} Punkte enthalten.`],
    });
  const assignee = input.assigneeMemberId
    ? await ctx.db.member.findFirst({
        where: { id: input.assigneeMemberId, archivedAt: null, deletedAt: null },
        select: { id: true },
      })
    : null;
  if (input.assigneeMemberId && !assignee)
    throw validationFailed({ assigneeMemberId: ["Dieses Mitglied ist nicht verfügbar."] });
  if (input.dueDate && !parseCalendarDate(input.dueDate))
    throw validationFailed({ dueDate: ["Bitte gib ein gültiges Datum ein."] });

  const item = await ctx.db.checklistItem.create({
    data: {
      clubId: ctx.clubId,
      checklistId: list.id,
      text: input.text,
      position: (list.items.at(-1)?.position ?? -1) + 1,
      assigneeMemberId: assignee?.id ?? null,
      dueDate: input.dueDate ? parseCalendarDate(input.dueDate) : null,
    },
  });
  return { id: item.id };
}

/** Punkt abhaken oder wieder öffnen. */
export async function toggleChecklistItem(
  ctx: TenantContext,
  itemId: string,
  done: boolean,
): Promise<void> {
  assertCan(ctx, "tasks:read");
  const item = await ctx.db.checklistItem.findFirst({
    where: { id: itemId, checklist: { AND: [visibilityWhere(ctx)] } },
    include: { checklist: { include: { event: { select: { departmentId: true } } } } },
  });
  if (!item) throw notFound("Der Punkt");
  const manage = can(ctx, "tasks:manage", resourceOf(item.checklist));
  const own =
    can(ctx, "tasks:update") &&
    item.assigneeMemberId !== null &&
    item.assigneeMemberId === ctx.memberId;
  if (!manage && !own) throw forbidden();
  if (item.isDone === done) return;
  await ctx.db.checklistItem.update({
    where: { id: itemId },
    data: { isDone: done, doneAt: done ? new Date() : null, doneById: done ? ctx.userId : null },
  });
}

export async function removeChecklistItem(ctx: TenantContext, itemId: string): Promise<void> {
  assertCan(ctx, "tasks:read");
  const item = await ctx.db.checklistItem.findFirst({
    where: { id: itemId, checklist: { AND: [visibilityWhere(ctx)] } },
    include: { checklist: { include: { event: { select: { departmentId: true } } } } },
  });
  if (!item) throw notFound("Der Punkt");
  if (!can(ctx, "tasks:manage", resourceOf(item.checklist))) throw forbidden();
  await ctx.db.checklistItem.delete({ where: { id: itemId } });
}
