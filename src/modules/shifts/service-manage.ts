import { formatDateShort, formatTimeRange, toDateInputValue, toTimeInputValue } from "@/lib/dates";
import { loadVisibleEvent } from "@/modules/events/service";
import { notifyUsers } from "@/modules/notifications/service";
import { diffChanges, recordAudit } from "@/server/audit/audit";
import type { TenantTx } from "@/server/db/tenant";
import { badRequest, conflict, forbidden, validationFailed } from "@/server/errors";
import { can } from "@/server/permissions/policy";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import { normalizeShiftTimes, type ShiftInput } from "./schemas";
import { fullName, guard, loadShift, resourceOf, shiftLink, userIdsOf } from "./service-shared";

// ---------------------------------------------------------------------------------------------
// Anlegen, Ändern, Löschen
// ---------------------------------------------------------------------------------------------

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
          linkUrl: shiftLink(event.id, shiftId),
          email: true,
        });
      }
    }),
  );
}

/** Löscht eine Schicht (weich). Eingetragene werden ausgetragen und benachrichtigt. */
export async function deleteShift(ctx: TenantContext, shiftId: string): Promise<void> {
  const { shift, event } = await loadShift(ctx, shiftId);
  if (!can(ctx, "shifts:manage", resourceOf(event))) throw forbidden();
  // Eine begonnene oder gelaufene Schicht mit Helfern bleibt: Gelöscht verschwänden ihre Helferstunden, und alle bekämen
  // „Schicht entfällt“ für eine Schicht, die sie schon geleistet haben.
  if (shift.assignments.length > 0 && shift.startsAt.getTime() <= Date.now())
    throw conflict(
      "Die Schicht hat bereits begonnen. Damit die Helferstunden erhalten bleiben, lässt sie sich nicht mehr löschen.",
    );
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
