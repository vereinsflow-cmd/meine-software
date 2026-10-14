import type { ShiftStatus } from "@/generated/prisma/enums";
import { shiftHealth, type ShiftHealth } from "@/lib/shift-health";
import { loadVisibleEvent } from "@/modules/events/service";
import { assertCan, can } from "@/server/permissions/policy";
import type { TenantContext } from "@/server/tenancy/context-core";
import { checkEligibility, type Eligibility } from "./eligibility";
import { fullName, noSignup, ownContext, resourceOf, shiftDetailInclude } from "./service-shared";

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
  /** Die Schicht ist vorbei (Ende erreicht). Dann lässt sich niemand mehr zuweisen. */
  ended: boolean;
  responsible: { id: string; name: string } | null;
  filled: number;
  health: ShiftHealth;
  assignments: ShiftAssignmentDto[];
  mine: { assignmentId: string } | null;
  signup: Eligibility;
  can: {
    manage: boolean;
    /** Darf Eingetragene austragen (Abteilung der Veranstaltung). */
    assign: boolean;
    /**
     * „Zuweisen“ ergibt Sinn: wie `assign`, aber nur, solange die Schicht nicht voll und nicht vorbei ist und die
     * Veranstaltung veröffentlicht ist – sonst wäre im Dialog jede Person gesperrt (`checkEligibility` mit `asManager`).
     */
    assignMore: boolean;
    hours: boolean;
    signOut: boolean;
    /** Löschen geht nicht mehr, sobald eine begonnene Schicht Eingetragene hat – ihre Helferstunden blieben sonst weg. */
    delete: boolean;
  };
}

export interface EventShiftPlan {
  event: {
    id: string;
    title: string;
    status: string;
    startsAt: Date;
    endsAt: Date;
    allDay: boolean;
    locationName: string | null;
    cancelReason: string | null;
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
      : noSignup(ctx);
    const started = row.startsAt.getTime() <= now.getTime();
    const ended = row.endsAt.getTime() <= now.getTime();
    const cancelled = row.status === "CANCELLED";
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
      started,
      ended,
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
        assignMore:
          canAssign &&
          event.status === "PUBLISHED" &&
          !cancelled &&
          !ended &&
          filled < row.requiredCount,
        hours: canHours,
        signOut: !!mineRow && !cancelled && !started,
        delete: canManage && !(started && filled > 0),
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
      allDay: event.allDay,
      locationName: event.locationName,
      cancelReason: event.cancelReason,
      departmentId: event.departmentId,
    },
    canManage,
    canAssign,
    canRecordHours: canHours,
    shifts,
  };
}
