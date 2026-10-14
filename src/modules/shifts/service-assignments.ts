import { formatDateShort, formatTimeRange } from "@/lib/dates";
import { notifyUsers } from "@/modules/notifications/service";
import { recordAudit } from "@/server/audit/audit";
import type { TenantTx } from "@/server/db/tenant";
import { badRequest, conflict, forbidden, notFound } from "@/server/errors";
import { assertCan, can } from "@/server/permissions/policy";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import { checkEligibility } from "./eligibility";
import {
  fullName,
  guard,
  loadShift,
  ownContext,
  resourceOf,
  shiftLink,
  userIdsOf,
} from "./service-shared";

// ---------------------------------------------------------------------------------------------
// Eintragen, Austragen, Zuweisen
// ---------------------------------------------------------------------------------------------

async function upsertAssignment(
  tx: TenantTx,
  ctx: TenantContext,
  shiftId: string,
  memberId: string,
  /** „Rückgängig“: Die Person behält ihren alten Platz in der Reihenfolge der Namen. */
  keepAssignedAt = false,
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
      ...(keepAssignedAt ? {} : { assignedAt: new Date() }),
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
            linkUrl: shiftLink(event.id, shift.id),
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
          linkUrl: shiftLink(event.id, shift.id),
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

/** So lange nach dem Austragen gilt „Rückgängig“ als Korrektur, von der die Person nichts merken soll. */
const UNDO_WINDOW_MS = 10 * 60_000;

/**
 * Veranstalter weisen ein Mitglied manuell zu (Konflikte und Mindestalter werden geprüft). Mit `undo` (Knopf
 * „Rückgängig“ nach „×“) ist es eine Korrektur: Ist die Nachricht „Du wurdest ausgetragen“ noch nicht per E-Mail
 * verschickt, wird sie zurückgenommen und die Person bekommt auch keine neue – sonst erführe sie zweimal von einem
 * Verklicken.
 */
export async function assignMember(
  ctx: TenantContext,
  input: { shiftId: string; memberId: string },
  options: { undo?: boolean } = {},
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
      await upsertAssignment(tx, ctx, shift.id, member.id, options.undo === true);
      await recordAudit(tx, auditActor(ctx), {
        action: "shift.assigned",
        entityType: "EventShift",
        entityId: shift.id,
        summary: options.undo
          ? `${fullName(member)} wieder der Schicht „${shift.title}“ zugewiesen (Rückgängig)`
          : `${fullName(member)} der Schicht „${shift.title}“ zugewiesen`,
      });
      if (options.undo && member.userId) {
        const pending = await tx.notification.findMany({
          where: {
            userId: member.userId,
            type: "SHIFT_CANCELLED",
            linkUrl: shiftLink(event.id, shift.id),
            emailStatus: { in: ["PENDING", "NONE"] },
            createdAt: { gte: new Date(Date.now() - UNDO_WINDOW_MS) },
          },
          select: { id: true, readAt: true },
        });
        if (pending.length > 0) {
          await tx.notification.deleteMany({ where: { id: { in: pending.map((n) => n.id) } } });
          // Ungelesen und ohne E-Mail: Die Person hat nichts mitbekommen – dann auch keine neue Nachricht.
          if (pending.every((n) => n.readAt === null)) return;
        }
      }
      if (member.userId && member.userId !== ctx.userId) {
        await notifyUsers(tx, ctx.clubId, {
          userIds: [member.userId],
          type: "SHIFT_ASSIGNED",
          title: `Du wurdest eingeteilt: ${shift.title}`,
          body: `${event.title} – ${formatDateShort(shift.startsAt)}, ${formatTimeRange(shift.startsAt, shift.endsAt)}${shift.meetingPoint ? `, Treffpunkt: ${shift.meetingPoint}` : ""}`,
          linkUrl: shiftLink(event.id, shift.id),
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
        linkUrl: shiftLink(event.id, shift.id),
        email: true,
      });
    }
  });
}
