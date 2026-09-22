import type { Prisma } from "@/generated/prisma/client";
import type { ShiftStatus } from "@/generated/prisma/enums";
import {
  formatDate,
  formatDateShort,
  formatTimeRange,
  toDateInputValue,
  toTimeInputValue,
} from "@/lib/dates";
import { toCsv } from "@/lib/csv";
import { FILL_LABEL, shiftHealth, type ShiftHealth, type ShiftUrgency } from "@/lib/shift-health";
import { loadVisibleEvent } from "@/modules/events/service";
import { notifyUsers } from "@/modules/notifications/service";
import { mapDatabaseError } from "@/server/action";
import { diffChanges, recordAudit } from "@/server/audit/audit";
import type { TenantTx } from "@/server/db/tenant";
import { badRequest, conflict, forbidden, notFound, validationFailed } from "@/server/errors";
import { assertCan, can, scopeOf, type ResourceRef } from "@/server/permissions/policy";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import { checkEligibility, type Eligibility } from "./eligibility";
import { normalizeShiftTimes, type ShiftInput } from "./schemas";

/**
 * Helfer- und Schichtplanung – Geschäftslogik.
 *
 * Garantien:
 *  - Keine Überbuchung und keine Doppelbelegung: Die Datenbank erzwingt beides (Trigger, auch bei Gleichzeitigkeit).
 *    Diese Schicht prüft vorab und liefert verständliche Begründungen.
 *  - Mitglieder tragen sich selbst ein und aus; Veranstalter weisen zu (nur ihre Abteilung, falls beschränkt).
 *  - Änderungen, die Eingeteilte betreffen (Zeit, Ort, Absage), lösen Benachrichtigungen aus.
 */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw mapDatabaseError(error) ?? error;
  }
}

const resourceOf = (event: { departmentId: string | null }): ResourceRef => ({
  departmentIds: event.departmentId ? [event.departmentId] : [],
});
const fullName = (m: { firstName: string; lastName: string }) => `${m.firstName} ${m.lastName}`;
const shiftLink = (eventId: string) => `/helferplanung/${eventId}`;

// ---------------------------------------------------------------------------------------------
// Lesen: Schichten einer Veranstaltung
// ---------------------------------------------------------------------------------------------

export interface ShiftAssignmentDto {
  id: string;
  memberId: string;
  name: string;
  workedMinutes: number | null;
  hoursApproved: boolean;
  isMe: boolean;
}

export interface ShiftDto {
  id: string;
  eventId: string;
  title: string;
  taskName: string | null;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  meetingPoint: string | null;
  requiredCount: number;
  minAge: number | null;
  requirements: string | null;
  internalNotes: string | null;
  status: ShiftStatus;
  /** Die Schicht hat begonnen (Zeitpunkt der Abfrage). Nach dem Beginn lassen sich Stunden erfassen, aber niemand mehr austragen. */
  started: boolean;
  responsible: { id: string; name: string } | null;
  filled: number;
  health: ShiftHealth;
  assignments: ShiftAssignmentDto[];
  mine: { assignmentId: string } | null;
  signup: Eligibility;
  can: { manage: boolean; assign: boolean; hours: boolean; signOut: boolean };
}

async function ownContext(ctx: TenantContext) {
  if (!ctx.memberId)
    return {
      birthDate: null as Date | null,
      ownShifts: [] as {
        shiftId: string;
        title: string;
        eventTitle: string;
        startsAt: Date;
        endsAt: Date;
      }[],
    };
  const [member, assignments] = await Promise.all([
    ctx.db.member.findFirst({ where: { id: ctx.memberId }, select: { birthDate: true } }),
    ctx.db.shiftAssignment.findMany({
      where: {
        memberId: ctx.memberId,
        status: "CONFIRMED",
        shift: { deletedAt: null, status: { not: "CANCELLED" }, endsAt: { gte: new Date() } },
      },
      select: {
        shiftId: true,
        shift: {
          select: { title: true, startsAt: true, endsAt: true, event: { select: { title: true } } },
        },
      },
    }),
  ]);
  return {
    birthDate: member?.birthDate ?? null,
    ownShifts: assignments.map((a) => ({
      shiftId: a.shiftId,
      title: a.shift.title,
      eventTitle: a.shift.event.title,
      startsAt: a.shift.startsAt,
      endsAt: a.shift.endsAt,
    })),
  };
}

const shiftDetailInclude = {
  responsible: { select: { id: true, firstName: true, lastName: true } },
  assignments: {
    where: { status: "CONFIRMED" as const },
    include: { member: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { assignedAt: "asc" as const },
  },
} satisfies Prisma.EventShiftInclude;

export interface EventShiftPlan {
  event: {
    id: string;
    title: string;
    status: string;
    startsAt: Date;
    endsAt: Date;
    departmentId: string | null;
  };
  canManage: boolean;
  canAssign: boolean;
  canRecordHours: boolean;
  shifts: ShiftDto[];
}

export async function listShiftsForEvent(
  ctx: TenantContext,
  eventId: string,
): Promise<EventShiftPlan> {
  assertCan(ctx, "shifts:read");
  const event = await loadVisibleEvent(ctx, eventId);
  const resource = resourceOf(event);
  const [rows, own] = await Promise.all([
    ctx.db.eventShift.findMany({
      where: { eventId, deletedAt: null },
      orderBy: [{ startsAt: "asc" }, { title: "asc" }],
      include: shiftDetailInclude,
    }),
    ownContext(ctx),
  ]);
  const canManage = can(ctx, "shifts:manage", resource);
  const canAssign = can(ctx, "shifts:assign", resource);
  const canHours = can(ctx, "shifts:hours", resource);
  const canSignup = can(ctx, "shifts:signup") && ctx.memberId !== null;
  const now = new Date();

  const shifts = rows.map<ShiftDto>((row) => {
    const mineRow = row.assignments.find((a) => a.memberId === ctx.memberId);
    const filled = row.assignments.length;
    const eligibility = canSignup
      ? checkEligibility({
          shift: {
            id: row.id,
            status: row.status,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            requiredCount: row.requiredCount,
            minAge: row.minAge,
          },
          eventStatus: event.status,
          confirmedCount: filled,
          alreadyConfirmed: !!mineRow,
          birthDate: own.birthDate,
          ownShifts: own.ownShifts,
          now,
        })
      : { allowed: false, reason: "Für dich ist die Selbst-Eintragung nicht freigeschaltet." };
    return {
      id: row.id,
      eventId: row.eventId,
      title: row.title,
      taskName: row.taskName,
      description: row.description,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      meetingPoint: row.meetingPoint,
      requiredCount: row.requiredCount,
      minAge: row.minAge,
      requirements: row.requirements,
      internalNotes: canManage || canAssign ? row.internalNotes : null,
      status: row.status,
      started: row.startsAt.getTime() <= now.getTime(),
      responsible: row.responsible
        ? { id: row.responsible.id, name: fullName(row.responsible) }
        : null,
      filled,
      health: shiftHealth(
        {
          status: row.status,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          requiredCount: row.requiredCount,
          filled,
        },
        now,
      ),
      assignments: row.assignments.map((a) => ({
        id: a.id,
        memberId: a.memberId,
        name: fullName(a.member),
        workedMinutes: a.workedMinutes,
        hoursApproved: a.hoursApprovedAt !== null,
        isMe: a.memberId === ctx.memberId,
      })),
      mine: mineRow ? { assignmentId: mineRow.id } : null,
      signup: eligibility,
      can: {
        manage: canManage,
        assign: canAssign,
        hours: canHours,
        signOut: !!mineRow && row.startsAt.getTime() > now.getTime(),
      },
    };
  });

  return {
    event: {
      id: event.id,
      title: event.title,
      status: event.status,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      departmentId: event.departmentId,
    },
    canManage,
    canAssign,
    canRecordHours: canHours,
    shifts,
  };
}

// ---------------------------------------------------------------------------------------------
// Anlegen, Ändern, Löschen
// ---------------------------------------------------------------------------------------------

async function loadShift(ctx: TenantContext, shiftId: string) {
  const shift = await ctx.db.eventShift.findFirst({
    where: { id: shiftId, deletedAt: null },
    include: shiftDetailInclude,
  });
  if (!shift) throw notFound("Die Schicht");
  const event = await loadVisibleEvent(ctx, shift.eventId);
  return { shift, event };
}

async function assertResponsible(ctx: TenantContext, memberId: string | undefined): Promise<void> {
  if (
    memberId &&
    !(await ctx.db.member.findFirst({
      where: { id: memberId, deletedAt: null },
      select: { id: true },
    }))
  ) {
    throw validationFailed({ responsibleMemberId: ["Dieses Mitglied existiert nicht."] });
  }
}

export async function createShift(
  ctx: TenantContext,
  eventId: string,
  input: ShiftInput,
): Promise<{ id: string }> {
  const event = await loadVisibleEvent(ctx, eventId);
  if (!can(ctx, "shifts:manage", resourceOf(event))) throw forbidden();
  if (event.status === "CANCELLED" || event.status === "ARCHIVED")
    throw badRequest(
      "Für abgesagte oder archivierte Veranstaltungen lassen sich keine Schichten anlegen.",
    );
  const times = normalizeShiftTimes(input);
  if (!times) throw validationFailed({ date: ["Bitte prüfe Datum und Uhrzeit."] });
  await assertResponsible(ctx, input.responsibleMemberId);

  return ctx.db.$transaction(async (tx) => {
    const shift = await tx.eventShift.create({
      data: {
        clubId: ctx.clubId,
        eventId,
        title: input.title,
        taskName: input.taskName ?? null,
        description: input.description ?? null,
        startsAt: times.startsAt,
        endsAt: times.endsAt,
        meetingPoint: input.meetingPoint ?? null,
        requiredCount: input.requiredCount,
        minAge: input.minAge ?? null,
        requirements: input.requirements ?? null,
        internalNotes: input.internalNotes ?? null,
        responsibleMemberId: input.responsibleMemberId ?? null,
        status: input.status,
      },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "shift.created",
      entityType: "EventShift",
      entityId: shift.id,
      summary: `Schicht „${input.title}“ (${input.requiredCount} Helfer) zu „${event.title}“ hinzugefügt`,
    });
    return { id: shift.id };
  });
}

export async function getShiftForEdit(ctx: TenantContext, shiftId: string) {
  const { shift, event } = await loadShift(ctx, shiftId);
  if (!can(ctx, "shifts:manage", resourceOf(event))) throw forbidden();
  return {
    eventId: shift.eventId,
    eventTitle: event.title,
    values: {
      title: shift.title,
      taskName: shift.taskName ?? "",
      description: shift.description ?? "",
      date: toDateInputValue(shift.startsAt),
      startTime: toTimeInputValue(shift.startsAt),
      endTime: toTimeInputValue(shift.endsAt),
      meetingPoint: shift.meetingPoint ?? "",
      requiredCount: shift.requiredCount,
      minAge: shift.minAge ?? undefined,
      requirements: shift.requirements ?? "",
      internalNotes: shift.internalNotes ?? "",
      responsibleMemberId: shift.responsibleMemberId ?? "",
      status: shift.status === "CANCELLED" ? ("CLOSED" as const) : shift.status,
    },
  };
}

/** Überschneidet sich eine neue Zeit mit anderen Einteilungen der bereits Eingetragenen? Liefert deren Namen. */
async function findTimeConflicts(
  tx: TenantTx | TenantContext["db"],
  shiftId: string,
  memberIds: string[],
  startsAt: Date,
  endsAt: Date,
): Promise<string[]> {
  if (memberIds.length === 0) return [];
  const clashes = await tx.shiftAssignment.findMany({
    where: {
      memberId: { in: memberIds },
      status: "CONFIRMED",
      shiftId: { not: shiftId },
      shift: {
        deletedAt: null,
        status: { not: "CANCELLED" },
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    },
    select: { member: { select: { firstName: true, lastName: true } } },
  });
  return [...new Set(clashes.map((c) => fullName(c.member)))];
}

export async function updateShift(
  ctx: TenantContext,
  shiftId: string,
  input: ShiftInput,
): Promise<void> {
  const { shift, event } = await loadShift(ctx, shiftId);
  if (!can(ctx, "shifts:manage", resourceOf(event))) throw forbidden();
  if (shift.status === "CANCELLED")
    throw badRequest("Abgesagte Schichten lassen sich nicht bearbeiten.");
  const times = normalizeShiftTimes(input);
  if (!times) throw validationFailed({ date: ["Bitte prüfe Datum und Uhrzeit."] });
  await assertResponsible(ctx, input.responsibleMemberId);

  const confirmed = shift.assignments.length;
  if (input.requiredCount < confirmed) {
    throw validationFailed({
      requiredCount: [
        `Es sind bereits ${confirmed} Helfer eingetragen. Bitte trage zuerst Helfer aus.`,
      ],
    });
  }
  const timeChanged =
    times.startsAt.getTime() !== shift.startsAt.getTime() ||
    times.endsAt.getTime() !== shift.endsAt.getTime();
  if (timeChanged) {
    const clashing = await findTimeConflicts(
      ctx.db,
      shift.id,
      shift.assignments.map((a) => a.memberId),
      times.startsAt,
      times.endsAt,
    );
    if (clashing.length > 0) {
      throw conflict(
        `Mit der neuen Zeit überschneidet sich die Schicht bei ${clashing.join(", ")} mit einer anderen Schicht. Bitte trage diese Personen zuerst aus.`,
      );
    }
  }

  const before = {
    title: shift.title,
    taskName: shift.taskName,
    description: shift.description,
    startsAt: shift.startsAt,
    endsAt: shift.endsAt,
    meetingPoint: shift.meetingPoint,
    requiredCount: shift.requiredCount,
    minAge: shift.minAge,
    requirements: shift.requirements,
    internalNotes: shift.internalNotes,
    responsibleMemberId: shift.responsibleMemberId,
    status: shift.status,
  };
  const after = {
    title: input.title,
    taskName: input.taskName ?? null,
    description: input.description ?? null,
    startsAt: times.startsAt,
    endsAt: times.endsAt,
    meetingPoint: input.meetingPoint ?? null,
    requiredCount: input.requiredCount,
    minAge: input.minAge ?? null,
    requirements: input.requirements ?? null,
    internalNotes: input.internalNotes ?? null,
    responsibleMemberId: input.responsibleMemberId ?? null,
    status: input.status,
  };
  const changes = diffChanges(before, after, { masked: ["internalNotes"] });
  const affectsHelpers = Boolean(
    changes && ["startsAt", "endsAt", "meetingPoint", "title"].some((key) => key in changes),
  );

  await guard(() =>
    ctx.db.$transaction(async (tx) => {
      await tx.eventShift.update({ where: { id: shiftId }, data: after });
      if (changes) {
        await recordAudit(tx, auditActor(ctx), {
          action: "shift.updated",
          entityType: "EventShift",
          entityId: shiftId,
          summary: `Schicht „${input.title}“ geändert`,
          changes,
        });
      }
      if (affectsHelpers && event.status === "PUBLISHED") {
        const users = await userIdsOf(
          tx,
          shift.assignments.map((a) => a.memberId),
        );
        await notifyUsers(tx, ctx.clubId, {
          userIds: users.filter((id) => id !== ctx.userId),
          type: "SHIFT_CHANGED",
          title: `Schicht geändert: ${input.title}`,
          body: `${event.title} – ${formatDateShort(times.startsAt)}, ${formatTimeRange(times.startsAt, times.endsAt)}${input.meetingPoint ? `, Treffpunkt: ${input.meetingPoint}` : ""}`,
          linkUrl: shiftLink(event.id),
          email: true,
        });
      }
    }),
  );
}

async function userIdsOf(
  db: TenantTx | TenantContext["db"],
  memberIds: string[],
): Promise<string[]> {
  if (memberIds.length === 0) return [];
  const rows = await db.member.findMany({
    where: { id: { in: memberIds } },
    select: { userId: true },
  });
  return rows.map((r) => r.userId).filter((id): id is string => id !== null);
}

/** Löscht eine Schicht (weich). Eingetragene werden ausgetragen und benachrichtigt. */
export async function deleteShift(ctx: TenantContext, shiftId: string): Promise<void> {
  const { shift, event } = await loadShift(ctx, shiftId);
  if (!can(ctx, "shifts:manage", resourceOf(event))) throw forbidden();
  await ctx.db.$transaction(async (tx) => {
    const users = await userIdsOf(
      tx,
      shift.assignments.map((a) => a.memberId),
    );
    await tx.shiftAssignment.updateMany({
      where: { shiftId, status: "CONFIRMED" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await tx.eventShift.update({
      where: { id: shiftId },
      data: { deletedAt: new Date(), status: "CANCELLED" },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "shift.deleted",
      entityType: "EventShift",
      entityId: shiftId,
      summary: `Schicht „${shift.title}“ gelöscht (${shift.assignments.length} Eingetragene ausgetragen)`,
    });
    if (event.status === "PUBLISHED") {
      await notifyUsers(tx, ctx.clubId, {
        userIds: users.filter((id) => id !== ctx.userId),
        type: "SHIFT_CANCELLED",
        title: `Schicht entfällt: ${shift.title}`,
        body: `${event.title} – ${formatDateShort(shift.startsAt)}, ${formatTimeRange(shift.startsAt, shift.endsAt)}`,
        linkUrl: shiftLink(event.id),
        email: true,
      });
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Eintragen, Austragen, Zuweisen
// ---------------------------------------------------------------------------------------------

async function upsertAssignment(
  tx: TenantTx,
  ctx: TenantContext,
  shiftId: string,
  memberId: string,
): Promise<void> {
  await tx.shiftAssignment.upsert({
    where: { shiftId_memberId: { shiftId, memberId } },
    create: {
      clubId: ctx.clubId,
      shiftId,
      memberId,
      status: "CONFIRMED",
      assignedByUserId: ctx.userId,
    },
    update: {
      status: "CONFIRMED",
      cancelledAt: null,
      assignedAt: new Date(),
      assignedByUserId: ctx.userId,
      workedMinutes: null,
      hoursApprovedAt: null,
      hoursApprovedById: null,
      reminderSentAt: null,
    },
  });
}

/** Ein Mitglied trägt sich selbst in eine Schicht ein. */
export async function signUp(ctx: TenantContext, shiftId: string): Promise<void> {
  assertCan(ctx, "shifts:signup");
  const memberId = ctx.memberId;
  if (!memberId)
    throw badRequest(
      "Dein Benutzerkonto ist keinem Mitglied zugeordnet. Bitte wende dich an den Vorstand.",
    );
  const { shift, event } = await loadShift(ctx, shiftId);
  const own = await ownContext(ctx);

  const eligibility = checkEligibility({
    shift: {
      id: shift.id,
      status: shift.status,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      requiredCount: shift.requiredCount,
      minAge: shift.minAge,
    },
    eventStatus: event.status,
    confirmedCount: shift.assignments.length,
    alreadyConfirmed: shift.assignments.some((a) => a.memberId === memberId),
    birthDate: own.birthDate,
    ownShifts: own.ownShifts,
  });
  if (!eligibility.allowed)
    throw conflict(eligibility.reason ?? "Die Eintragung ist nicht möglich.");

  await guard(() =>
    ctx.db.$transaction(async (tx) => {
      await upsertAssignment(tx, ctx, shiftId, memberId);
      if (shift.responsible) {
        const [responsibleUser] = await userIdsOf(tx, [shift.responsible.id]);
        if (responsibleUser && responsibleUser !== ctx.userId) {
          await notifyUsers(tx, ctx.clubId, {
            userIds: [responsibleUser],
            type: "SHIFT_CHANGED",
            title: `Neue Eintragung: ${shift.title}`,
            body: `${fullName(ctx.user)} hat sich für „${shift.title}“ (${event.title}) eingetragen.`,
            linkUrl: shiftLink(event.id),
          });
        }
      }
    }),
  );
}

/** Ein Mitglied trägt sich selbst wieder aus (bis zum Beginn der Schicht). */
export async function signOut(ctx: TenantContext, shiftId: string): Promise<void> {
  assertCan(ctx, "shifts:signup");
  const memberId = ctx.memberId;
  if (!memberId) throw badRequest("Dein Benutzerkonto ist keinem Mitglied zugeordnet.");
  const { shift, event } = await loadShift(ctx, shiftId);
  const assignment = shift.assignments.find((a) => a.memberId === memberId);
  if (!assignment) return;
  if (shift.startsAt.getTime() <= Date.now())
    throw conflict(
      "Die Schicht hat bereits begonnen. Bitte wende dich an die verantwortliche Person.",
    );

  await ctx.db.$transaction(async (tx) => {
    await tx.shiftAssignment.update({
      where: { id: assignment.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    if (shift.responsible) {
      const [responsibleUser] = await userIdsOf(tx, [shift.responsible.id]);
      if (responsibleUser && responsibleUser !== ctx.userId) {
        await notifyUsers(tx, ctx.clubId, {
          userIds: [responsibleUser],
          type: "SHIFT_CHANGED",
          title: `Abmeldung: ${shift.title}`,
          body: `${fullName(ctx.user)} hat sich aus „${shift.title}“ (${event.title}) ausgetragen – ein Platz ist wieder frei.`,
          linkUrl: shiftLink(event.id),
        });
      }
    }
  });
}

export interface AssignableMember {
  id: string;
  name: string;
  /** Wenn gesetzt, kann das Mitglied nicht zugewiesen werden – mit Begründung (z. B. Konflikt, Mindestalter). */
  blockedReason: string | null;
  alreadyAssigned: boolean;
}

/** Mitglieder für die manuelle Zuweisung – mit Anzeige von Konflikten (überschneidende Schicht, Mindestalter). */
export async function listAssignableMembers(
  ctx: TenantContext,
  shiftId: string,
): Promise<AssignableMember[]> {
  const { shift, event } = await loadShift(ctx, shiftId);
  if (!can(ctx, "shifts:assign", resourceOf(event))) throw forbidden();

  const members = await ctx.db.member.findMany({
    where: { archivedAt: null, deletedAt: null, status: { in: ["ACTIVE", "PASSIVE", "HONORARY"] } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true, birthDate: true },
    take: 1000,
  });
  const busy = await ctx.db.shiftAssignment.findMany({
    where: {
      memberId: { in: members.map((m) => m.id) },
      status: "CONFIRMED",
      shiftId: { not: shift.id },
      shift: { deletedAt: null, status: { not: "CANCELLED" }, endsAt: { gte: new Date() } },
    },
    select: {
      memberId: true,
      shiftId: true,
      shift: {
        select: { title: true, startsAt: true, endsAt: true, event: { select: { title: true } } },
      },
    },
  });
  const assigned = new Set(shift.assignments.map((a) => a.memberId));

  return members.map((m) => {
    const eligibility = checkEligibility({
      shift: {
        id: shift.id,
        status: shift.status,
        startsAt: shift.startsAt,
        endsAt: shift.endsAt,
        requiredCount: shift.requiredCount,
        minAge: shift.minAge,
      },
      eventStatus: event.status,
      confirmedCount: shift.assignments.length,
      alreadyConfirmed: assigned.has(m.id),
      birthDate: m.birthDate,
      ownShifts: busy
        .filter((b) => b.memberId === m.id)
        .map((b) => ({
          shiftId: b.shiftId,
          title: b.shift.title,
          eventTitle: b.shift.event.title,
          startsAt: b.shift.startsAt,
          endsAt: b.shift.endsAt,
        })),
      asManager: true,
    });
    return {
      id: m.id,
      name: `${m.lastName}, ${m.firstName}`,
      blockedReason: eligibility.allowed ? null : eligibility.reason,
      alreadyAssigned: assigned.has(m.id),
    };
  });
}

/** Veranstalter weisen ein Mitglied manuell zu (Konflikte und Mindestalter werden geprüft). */
export async function assignMember(
  ctx: TenantContext,
  input: { shiftId: string; memberId: string },
): Promise<void> {
  const { shift, event } = await loadShift(ctx, input.shiftId);
  if (!can(ctx, "shifts:assign", resourceOf(event))) throw forbidden();
  const member = await ctx.db.member.findFirst({
    where: {
      id: input.memberId,
      deletedAt: null,
      archivedAt: null,
      status: { in: ["ACTIVE", "PASSIVE", "HONORARY"] },
    },
    select: { id: true, firstName: true, lastName: true, userId: true, birthDate: true },
  });
  if (!member) throw notFound("Das Mitglied");

  const busy = await ctx.db.shiftAssignment.findMany({
    where: {
      memberId: member.id,
      status: "CONFIRMED",
      shift: { deletedAt: null, status: { not: "CANCELLED" }, endsAt: { gte: new Date() } },
    },
    select: {
      shiftId: true,
      shift: {
        select: { title: true, startsAt: true, endsAt: true, event: { select: { title: true } } },
      },
    },
  });
  const eligibility = checkEligibility({
    shift: {
      id: shift.id,
      status: shift.status,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      requiredCount: shift.requiredCount,
      minAge: shift.minAge,
    },
    eventStatus: event.status,
    confirmedCount: shift.assignments.length,
    alreadyConfirmed: shift.assignments.some((a) => a.memberId === member.id),
    birthDate: member.birthDate,
    ownShifts: busy.map((b) => ({
      shiftId: b.shiftId,
      title: b.shift.title,
      eventTitle: b.shift.event.title,
      startsAt: b.shift.startsAt,
      endsAt: b.shift.endsAt,
    })),
    asManager: true,
  });
  if (!eligibility.allowed) throw conflict(`${fullName(member)}: ${eligibility.reason}`);

  await guard(() =>
    ctx.db.$transaction(async (tx) => {
      await upsertAssignment(tx, ctx, shift.id, member.id);
      await recordAudit(tx, auditActor(ctx), {
        action: "shift.assigned",
        entityType: "EventShift",
        entityId: shift.id,
        summary: `${fullName(member)} der Schicht „${shift.title}“ zugewiesen`,
      });
      if (member.userId && member.userId !== ctx.userId) {
        await notifyUsers(tx, ctx.clubId, {
          userIds: [member.userId],
          type: "SHIFT_ASSIGNED",
          title: `Du wurdest eingeteilt: ${shift.title}`,
          body: `${event.title} – ${formatDateShort(shift.startsAt)}, ${formatTimeRange(shift.startsAt, shift.endsAt)}${shift.meetingPoint ? `, Treffpunkt: ${shift.meetingPoint}` : ""}`,
          linkUrl: shiftLink(event.id),
          email: true,
        });
      }
    }),
  );
}

export async function unassignMember(
  ctx: TenantContext,
  input: { shiftId: string; memberId: string },
): Promise<void> {
  const { shift, event } = await loadShift(ctx, input.shiftId);
  if (!can(ctx, "shifts:assign", resourceOf(event))) throw forbidden();
  const assignment = shift.assignments.find((a) => a.memberId === input.memberId);
  if (!assignment) return;
  await ctx.db.$transaction(async (tx) => {
    await tx.shiftAssignment.update({
      where: { id: assignment.id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "shift.unassigned",
      entityType: "EventShift",
      entityId: shift.id,
      summary: `${fullName(assignment.member)} aus der Schicht „${shift.title}“ ausgetragen`,
    });
    const [userId] = await userIdsOf(tx, [input.memberId]);
    if (userId && userId !== ctx.userId) {
      await notifyUsers(tx, ctx.clubId, {
        userIds: [userId],
        type: "SHIFT_CANCELLED",
        title: `Du wurdest ausgetragen: ${shift.title}`,
        body: `${event.title} – ${formatDateShort(shift.startsAt)}, ${formatTimeRange(shift.startsAt, shift.endsAt)}`,
        linkUrl: shiftLink(event.id),
        email: true,
      });
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Helferstunden
// ---------------------------------------------------------------------------------------------

async function loadAssignmentForHours(ctx: TenantContext, assignmentId: string) {
  const assignment = await ctx.db.shiftAssignment.findFirst({
    where: { id: assignmentId, status: "CONFIRMED" },
    include: {
      shift: {
        include: {
          event: { select: { departmentId: true, title: true, status: true, deletedAt: true } },
        },
      },
      member: { select: { firstName: true, lastName: true } },
    },
  });
  if (!assignment || assignment.shift.deletedAt || assignment.shift.event.deletedAt)
    throw notFound("Die Eintragung");
  if (!can(ctx, "shifts:hours", resourceOf(assignment.shift.event))) throw forbidden();
  return assignment;
}

/** Dokumentiert die tatsächlich geleisteten Minuten eines Helfers (erst nach Beginn der Schicht). */
export async function recordHours(
  ctx: TenantContext,
  input: { assignmentId: string; minutes: number },
): Promise<void> {
  const assignment = await loadAssignmentForHours(ctx, input.assignmentId);
  if (assignment.shift.startsAt.getTime() > Date.now())
    throw conflict(
      "Die Schicht hat noch nicht begonnen. Stunden lassen sich erst danach dokumentieren.",
    );
  await ctx.db.$transaction(async (tx) => {
    await tx.shiftAssignment.update({
      where: { id: assignment.id },
      data: {
        workedMinutes: input.minutes,
        hoursApprovedAt: new Date(),
        hoursApprovedById: ctx.userId,
      },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "shift.hours_recorded",
      entityType: "EventShift",
      entityId: assignment.shiftId,
      summary: `${fullName(assignment.member)}: ${input.minutes} Minuten dokumentiert (Schicht „${assignment.shift.title}“)`,
    });
  });
}

/** Übernimmt für alle Eingetragenen ohne dokumentierte Stunden die geplante Dauer. */
export async function confirmPlannedHours(ctx: TenantContext, shiftId: string): Promise<number> {
  const { shift, event } = await loadShift(ctx, shiftId);
  if (!can(ctx, "shifts:hours", resourceOf(event))) throw forbidden();
  if (shift.startsAt.getTime() > Date.now())
    throw conflict(
      "Die Schicht hat noch nicht begonnen. Stunden lassen sich erst danach dokumentieren.",
    );
  const planned = Math.round((shift.endsAt.getTime() - shift.startsAt.getTime()) / 60_000);
  return ctx.db.$transaction(async (tx) => {
    const result = await tx.shiftAssignment.updateMany({
      where: { shiftId, status: "CONFIRMED", workedMinutes: null },
      data: { workedMinutes: planned, hoursApprovedAt: new Date(), hoursApprovedById: ctx.userId },
    });
    if (result.count > 0) {
      await recordAudit(tx, auditActor(ctx), {
        action: "shift.hours_recorded",
        entityType: "EventShift",
        entityId: shiftId,
        summary: `Geplante Dauer (${planned} Min.) für ${result.count} Helfer der Schicht „${shift.title}“ übernommen`,
      });
    }
    return result.count;
  });
}

export interface HoursRow {
  memberId: string;
  name: string;
  shifts: number;
  minutes: number;
}

/** Dokumentierte Helferstunden im Zeitraum – im Rahmen der Reichweite (alle, eigene Abteilung(en) oder nur die eigenen). */
function workedHoursWhere(
  ctx: TenantContext,
  scope: ReturnType<typeof scopeOf>,
  from: Date,
  to: Date,
): Prisma.ShiftAssignmentWhereInput {
  return {
    status: "CONFIRMED",
    workedMinutes: { not: null },
    shift: {
      deletedAt: null,
      startsAt: { gte: from, lt: to },
      ...(scope === "DEPARTMENT"
        ? { event: { departmentId: { in: [...ctx.ledDepartmentIds] } } }
        : {}),
    },
    ...(scope === null ? { memberId: ctx.memberId ?? "kein-mitglied" } : {}),
  };
}

/**
 * Für Auswertungen: dokumentierte Helferminuten samt Datum der Schicht (nur diese zwei Angaben, keine Namen) im Zeitraum.
 * Es gilt dieselbe Sichtbarkeit wie in der Stundenübersicht.
 */
export async function listWorkedMinutes(
  ctx: TenantContext,
  range: { from: Date; to: Date },
): Promise<{ scope: "ALL" | "OWN"; rows: { at: Date; minutes: number }[] }> {
  assertCan(ctx, "shifts:read");
  const scope = scopeOf(ctx, "shifts:hours");
  const rows = await ctx.db.shiftAssignment.findMany({
    where: workedHoursWhere(ctx, scope, range.from, range.to),
    select: { workedMinutes: true, shift: { select: { startsAt: true } } },
  });
  return {
    scope: scope === null ? "OWN" : "ALL",
    rows: rows.map((row) => ({ at: row.shift.startsAt, minutes: row.workedMinutes ?? 0 })),
  };
}

/** Helferstunden eines Jahres. Veranstalter sehen alle (im Rahmen ihrer Reichweite), Mitglieder nur die eigenen. */
export async function getHoursOverview(
  ctx: TenantContext,
  year: number,
): Promise<{ rows: HoursRow[]; totalMinutes: number; scope: "ALL" | "OWN" }> {
  assertCan(ctx, "shifts:read");
  const scope = scopeOf(ctx, "shifts:hours");
  const from = new Date(Date.UTC(year - 1, 11, 31, 12));
  const to = new Date(Date.UTC(year + 1, 0, 1, 12));

  const rows = await ctx.db.shiftAssignment.findMany({
    where: workedHoursWhere(ctx, scope, from, to),
    select: {
      memberId: true,
      workedMinutes: true,
      shift: { select: { startsAt: true } },
      member: { select: { firstName: true, lastName: true } },
    },
  });

  const byMember = new Map<string, HoursRow>();
  for (const row of rows) {
    if (
      row.shift.startsAt.getUTCFullYear() !== year &&
      new Date(row.shift.startsAt.getTime() + 2 * 3_600_000).getUTCFullYear() !== year
    )
      continue;
    const entry = byMember.get(row.memberId) ?? {
      memberId: row.memberId,
      name: `${row.member.lastName}, ${row.member.firstName}`,
      shifts: 0,
      minutes: 0,
    };
    entry.shifts += 1;
    entry.minutes += row.workedMinutes ?? 0;
    byMember.set(row.memberId, entry);
  }
  const list = [...byMember.values()].sort(
    (a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name, "de"),
  );
  return {
    rows: list,
    totalMinutes: list.reduce((sum, r) => sum + r.minutes, 0),
    scope: scope === null ? "OWN" : "ALL",
  };
}

// ---------------------------------------------------------------------------------------------
// Übersichten: Besetzung, offene Schichten, eigene Einsätze
// ---------------------------------------------------------------------------------------------

export interface StaffingEvent {
  eventId: string;
  title: string;
  startsAt: Date;
  departmentId: string | null;
  shifts: number;
  required: number;
  filled: number;
  worstUrgency: ShiftUrgency;
  openShifts: number;
}

const URGENCY_RANK: Record<ShiftUrgency, number> = { NONE: 0, SOON: 1, CRITICAL: 2, OVERDUE: 3 };

/** Kommende, veröffentlichte Veranstaltungen mit Schichten samt Besetzungsstand und Warnstufe. */
export async function getStaffingOverview(
  ctx: TenantContext,
  options: { departmentId?: string } = {},
): Promise<StaffingEvent[]> {
  assertCan(ctx, "shifts:read");
  const now = new Date();
  const rows = await ctx.db.eventShift.findMany({
    where: {
      deletedAt: null,
      status: { not: "CANCELLED" },
      endsAt: { gte: now },
      event: {
        deletedAt: null,
        status: "PUBLISHED",
        ...(options.departmentId ? { departmentId: options.departmentId } : {}),
      },
    },
    select: {
      status: true,
      startsAt: true,
      endsAt: true,
      requiredCount: true,
      event: { select: { id: true, title: true, startsAt: true, departmentId: true } },
      _count: { select: { assignments: { where: { status: "CONFIRMED" } } } },
    },
    orderBy: { startsAt: "asc" },
    take: 1000,
  });

  const events = new Map<string, StaffingEvent>();
  for (const row of rows) {
    const health = shiftHealth(
      {
        status: row.status,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        requiredCount: row.requiredCount,
        filled: row._count.assignments,
      },
      now,
    );
    const entry = events.get(row.event.id) ?? {
      eventId: row.event.id,
      title: row.event.title,
      startsAt: row.event.startsAt,
      departmentId: row.event.departmentId,
      shifts: 0,
      required: 0,
      filled: 0,
      worstUrgency: "NONE" as ShiftUrgency,
      openShifts: 0,
    };
    entry.shifts += 1;
    entry.required += row.requiredCount;
    entry.filled += Math.min(row._count.assignments, row.requiredCount);
    if (health.fill !== "FULL") entry.openShifts += 1;
    if (URGENCY_RANK[health.urgency] > URGENCY_RANK[entry.worstUrgency])
      entry.worstUrgency = health.urgency;
    events.set(row.event.id, entry);
  }
  return [...events.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export interface OpenShiftItem {
  shiftId: string;
  title: string;
  taskName: string | null;
  startsAt: Date;
  endsAt: Date;
  meetingPoint: string | null;
  requiredCount: number;
  filled: number;
  event: { id: string; title: string };
  health: ShiftHealth;
  signup: Eligibility;
}

/** Kommende Schichten mit freien Plätzen (nur veröffentlichte Veranstaltungen, nur offene Schichten). */
export async function listOpenShifts(
  ctx: TenantContext,
  options: { departmentId?: string; limit?: number } = {},
): Promise<OpenShiftItem[]> {
  assertCan(ctx, "shifts:read");
  const now = new Date();
  const [rows, own] = await Promise.all([
    ctx.db.eventShift.findMany({
      where: {
        deletedAt: null,
        status: "OPEN",
        startsAt: { gt: now },
        event: {
          deletedAt: null,
          status: "PUBLISHED",
          ...(options.departmentId ? { departmentId: options.departmentId } : {}),
        },
      },
      select: {
        id: true,
        title: true,
        taskName: true,
        startsAt: true,
        endsAt: true,
        meetingPoint: true,
        requiredCount: true,
        minAge: true,
        status: true,
        event: { select: { id: true, title: true, status: true } },
        _count: { select: { assignments: { where: { status: "CONFIRMED" } } } },
        assignments: ctx.memberId
          ? { where: { memberId: ctx.memberId, status: "CONFIRMED" }, select: { id: true } }
          : { take: 0, select: { id: true } },
      },
      orderBy: { startsAt: "asc" },
      take: 300,
    }),
    ownContext(ctx),
  ]);
  const canSignup = can(ctx, "shifts:signup") && ctx.memberId !== null;

  return rows
    .filter((row) => row._count.assignments < row.requiredCount)
    .slice(0, options.limit ?? 100)
    .map((row) => ({
      shiftId: row.id,
      title: row.title,
      taskName: row.taskName,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      meetingPoint: row.meetingPoint,
      requiredCount: row.requiredCount,
      filled: row._count.assignments,
      event: { id: row.event.id, title: row.event.title },
      health: shiftHealth(
        {
          status: row.status,
          startsAt: row.startsAt,
          endsAt: row.endsAt,
          requiredCount: row.requiredCount,
          filled: row._count.assignments,
        },
        now,
      ),
      signup: canSignup
        ? checkEligibility({
            shift: {
              id: row.id,
              status: row.status,
              startsAt: row.startsAt,
              endsAt: row.endsAt,
              requiredCount: row.requiredCount,
              minAge: row.minAge,
            },
            eventStatus: row.event.status,
            confirmedCount: row._count.assignments,
            alreadyConfirmed: row.assignments.length > 0,
            birthDate: own.birthDate,
            ownShifts: own.ownShifts,
            now,
          })
        : { allowed: false, reason: "Für dich ist die Selbst-Eintragung nicht freigeschaltet." },
    }));
}

export interface MyAssignment {
  assignmentId: string;
  shiftId: string;
  title: string;
  taskName: string | null;
  startsAt: Date;
  endsAt: Date;
  meetingPoint: string | null;
  event: { id: string; title: string };
  canSignOut: boolean;
  workedMinutes: number | null;
}

export async function listMyAssignments(
  ctx: TenantContext,
  options: { limit?: number; includePast?: boolean } = {},
): Promise<MyAssignment[]> {
  if (!ctx.memberId) return [];
  const rows = await ctx.db.shiftAssignment.findMany({
    where: {
      memberId: ctx.memberId,
      status: "CONFIRMED",
      shift: {
        deletedAt: null,
        status: { not: "CANCELLED" },
        event: { deletedAt: null, status: { not: "CANCELLED" } },
        ...(options.includePast ? {} : { endsAt: { gte: new Date() } }),
      },
    },
    include: { shift: { include: { event: { select: { id: true, title: true } } } } },
    orderBy: { shift: { startsAt: options.includePast ? "desc" : "asc" } },
    take: options.limit ?? 50,
  });
  return rows.map((row) => ({
    assignmentId: row.id,
    shiftId: row.shiftId,
    title: row.shift.title,
    taskName: row.shift.taskName,
    startsAt: row.shift.startsAt,
    endsAt: row.shift.endsAt,
    meetingPoint: row.shift.meetingPoint,
    event: row.shift.event,
    canSignOut: row.shift.startsAt.getTime() > Date.now(),
    workedMinutes: row.workedMinutes,
  }));
}

/** Mitglieder für die Auswahl "Verantwortliche Person" (nur Namen; nur für Schichtverwalter). */
export async function listResponsibleOptions(
  ctx: TenantContext,
): Promise<{ id: string; name: string }[]> {
  if (!can(ctx, "shifts:manage")) return [];
  const rows = await ctx.db.member.findMany({
    where: { archivedAt: null, deletedAt: null, status: { in: ["ACTIVE", "HONORARY", "PASSIVE"] } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true },
    take: 1000,
  });
  return rows.map((m) => ({ id: m.id, name: `${m.lastName}, ${m.firstName}` }));
}

// ---------------------------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------------------------

/** CSV der Helferplanung einer Veranstaltung (für Veranstalter). Kontaktdaten nur mit entsprechendem Recht. */
// ---------------------------------------------------------------------------------------------
// Ausdruck: Helferplan über mehrere Veranstaltungen
// ---------------------------------------------------------------------------------------------

export interface PrintShiftDto {
  id: string;
  title: string;
  taskName: string | null;
  startsAt: Date;
  endsAt: Date;
  meetingPoint: string | null;
  requiredCount: number;
  filled: number;
  fillLabel: string;
  responsible: string | null;
  /** Nur Namen – der Ausdruck ist zum Aushängen gedacht, keine Kontaktdaten wie beim CSV-Export für Organisatoren. */
  helperNames: string[];
}

export interface PrintPlanEvent {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  locationName: string | null;
  address: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  shifts: PrintShiftDto[];
}

export interface PrintPlanFilter {
  /** Nur diese Veranstaltungen (leer/weggelassen = keine Einschränkung nach Veranstaltung). */
  eventIds?: string[];
  /** Nur Veranstaltungen, die in diesem Zeitraum beginnen (jeweils optional, `to` ist exklusiv). */
  from?: Date;
  to?: Date;
  /** Nur Schichten mit noch freien Plätzen. */
  onlyOpen?: boolean;
}

/**
 * Helferplan für den Ausdruck, über mehrere Veranstaltungen hinweg und wahlweise eingegrenzt auf bestimmte
 * Veranstaltungen, einen Zeitraum oder nur offene Schichten. Nur veröffentlichte Veranstaltungen mit mindestens
 * einer nicht abgesagten Schicht; ohne jede Einschränkung nur Veranstaltungen, die noch nicht begonnen haben (anders
 * als `getStaffingOverview`, das nach dem Ende der Schicht geht – für den Ausdruck reicht der gröbere Blick).
 * Veranstaltungen, die nach Anwendung von `onlyOpen` keine Schicht mehr übrig haben, entfallen ganz.
 */
export async function listShiftPlanForPrint(
  ctx: TenantContext,
  filter: PrintPlanFilter = {},
): Promise<PrintPlanEvent[]> {
  assertCan(ctx, "shifts:read");
  const eventIds = filter.eventIds?.filter((id) => id.length > 0) ?? [];
  const hasDateFilter = filter.from !== undefined || filter.to !== undefined;

  const events = await ctx.db.event.findMany({
    where: {
      deletedAt: null,
      status: "PUBLISHED",
      ...(eventIds.length > 0 ? { id: { in: eventIds } } : {}),
      ...(hasDateFilter
        ? {
            startsAt: {
              ...(filter.from ? { gte: filter.from } : {}),
              ...(filter.to ? { lt: filter.to } : {}),
            },
          }
        : eventIds.length === 0
          ? { startsAt: { gte: new Date() } } // Ohne jede Auswahl: nur Kommendes, wie die übrige Helferplanung
          : {}),
      shifts: { some: { deletedAt: null, status: { not: "CANCELLED" } } },
    },
    select: {
      id: true,
      title: true,
      startsAt: true,
      endsAt: true,
      allDay: true,
      locationName: true,
      address: true,
      contactName: true,
      contactEmail: true,
      contactPhone: true,
      shifts: {
        where: { deletedAt: null, status: { not: "CANCELLED" } },
        orderBy: [{ startsAt: "asc" }, { title: "asc" }],
        select: {
          id: true,
          title: true,
          taskName: true,
          startsAt: true,
          endsAt: true,
          meetingPoint: true,
          requiredCount: true,
          status: true,
          responsible: { select: { firstName: true, lastName: true } },
          assignments: {
            where: { status: "CONFIRMED" },
            orderBy: { assignedAt: "asc" },
            select: { member: { select: { firstName: true, lastName: true } } },
          },
        },
      },
    },
    orderBy: { startsAt: "asc" },
    take: 200,
  });

  return events
    .map((event) => {
      const shifts = event.shifts
        .map<PrintShiftDto>((row) => {
          const filled = row.assignments.length;
          const health = shiftHealth({
            status: row.status,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            requiredCount: row.requiredCount,
            filled,
          });
          return {
            id: row.id,
            title: row.title,
            taskName: row.taskName,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            meetingPoint: row.meetingPoint,
            requiredCount: row.requiredCount,
            filled,
            fillLabel: FILL_LABEL[health.fill],
            responsible: row.responsible ? fullName(row.responsible) : null,
            helperNames: row.assignments.map((a) => fullName(a.member)),
          };
        })
        .filter((shift) => !filter.onlyOpen || shift.filled < shift.requiredCount);
      return {
        id: event.id,
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        allDay: event.allDay,
        locationName: event.locationName,
        address: event.address,
        contactName: event.contactName,
        contactEmail: event.contactEmail,
        contactPhone: event.contactPhone,
        shifts,
      } satisfies PrintPlanEvent;
    })
    .filter((event) => event.shifts.length > 0);
}

export async function exportShiftPlanCsv(
  ctx: TenantContext,
  eventId: string,
): Promise<{ csv: string; filename: string }> {
  const event = await loadVisibleEvent(ctx, eventId);
  const resource = resourceOf(event);
  if (!can(ctx, "shifts:manage", resource) && !can(ctx, "shifts:assign", resource))
    throw forbidden();

  const shifts = await ctx.db.eventShift.findMany({
    where: { eventId, deletedAt: null },
    orderBy: [{ startsAt: "asc" }, { title: "asc" }],
    include: {
      responsible: { select: { firstName: true, lastName: true } },
      assignments: {
        where: { status: "CONFIRMED" },
        include: {
          member: {
            select: {
              firstName: true,
              lastName: true,
              phone: true,
              departments: { select: { departmentId: true } },
              id: true,
            },
          },
        },
        orderBy: { assignedAt: "asc" },
      },
    },
  });

  const includeContact = can(ctx, "members:read_contact");
  const header = [
    "Schicht",
    "Aufgabe",
    "Datum",
    "Beginn",
    "Ende",
    "Treffpunkt",
    "Benötigt",
    "Eingetragen",
    "Verantwortlich",
    "Helfer",
    ...(includeContact ? ["Telefon"] : []),
    "Geleistete Minuten",
  ];
  const rows: (string | number | null)[][] = [];
  for (const shift of shifts) {
    const common = [
      shift.title,
      shift.taskName,
      formatDate(shift.startsAt),
      toTimeInputValue(shift.startsAt),
      toTimeInputValue(shift.endsAt),
      shift.meetingPoint,
      shift.requiredCount,
      shift.assignments.length,
      shift.responsible ? fullName(shift.responsible) : null,
    ];
    for (const a of shift.assignments) {
      const contactAllowed =
        includeContact &&
        can(ctx, "members:read_contact", {
          departmentIds: a.member.departments.map((d) => d.departmentId),
          ownerMemberId: a.member.id,
        });
      rows.push([
        ...common,
        fullName(a.member),
        ...(includeContact ? [contactAllowed ? a.member.phone : ""] : []),
        a.workedMinutes,
      ]);
    }
    for (let i = shift.assignments.length; i < shift.requiredCount; i++) {
      rows.push([...common, "— frei —", ...(includeContact ? [""] : []), null]);
    }
  }
  const slug =
    event.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "veranstaltung";
  return { csv: toCsv(header, rows), filename: `helferplan-${slug}.csv` };
}
