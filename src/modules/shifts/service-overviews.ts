import type { ShiftStatus, AssignmentStatus } from "@/generated/prisma/enums";
import { shiftHealth, type ShiftHealth, type ShiftUrgency } from "@/lib/shift-health";
import { assertCan, can } from "@/server/permissions/policy";
import type { TenantContext } from "@/server/tenancy/context-core";
import { checkEligibility, type Eligibility } from "./eligibility";
import { ACTIVE_EVENT, noSignup, ownContext, resourceOf } from "./service-shared";

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

/**
 * Die heute offenen Schichten (wie `getStaffingOverview`) mit allen Eintragungen samt Zeitpunkt der Eintragung und Absage –
 * daraus berechnet das Dashboard, wie sich die Besetzung entwickelt hat (Kennzahl „wie eine Aktie“,
 * `modules/dashboard/quote.ts`).
 */
export async function listStaffingHistory(ctx: TenantContext): Promise<
  {
    requiredCount: number;
    assignments: { assignedAt: Date; cancelledAt: Date | null; status: AssignmentStatus }[];
  }[]
> {
  assertCan(ctx, "shifts:read");
  return ctx.db.eventShift.findMany({
    where: {
      deletedAt: null,
      status: { not: "CANCELLED" },
      endsAt: { gte: new Date() },
      event: { deletedAt: null, status: "PUBLISHED" },
    },
    select: {
      requiredCount: true,
      assignments: { select: { assignedAt: true, cancelledAt: true, status: true } },
    },
    orderBy: { startsAt: "asc" }, // dieselben (höchstens 1000) Schichten wie `getStaffingOverview`
    take: 1000,
  });
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
        : noSignup(ctx),
    }));
}

export interface PlanningShift {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  requiredCount: number;
  minAge: number | null;
  status: ShiftStatus;
  /** Die Schicht hat begonnen (läuft noch – beendete sind nicht dabei). */
  started: boolean;
  filled: number;
  health: ShiftHealth;
  mine: { assignmentId: string } | null;
  signup: Eligibility;
}

export interface PlanningEvent {
  eventId: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  /** Die Veranstaltung hat begonnen und dauert noch (Zeitpunkt der Abfrage). */
  running: boolean;
  /** Darf die Person hier Helfer zuweisen bzw. Schichten verwalten (Abteilung der Veranstaltung)? */
  canAssign: boolean;
  canManage: boolean;
  required: number;
  /** Besetzte Plätze, je Schicht höchstens so viele wie benötigt (wie `getStaffingOverview`). */
  filled: number;
  /** Freie Plätze, in die man sich selbst eintragen kann: offene Schichten, die noch nicht begonnen haben. */
  signupFreeSpots: number;
  /**
   * Schon beendete Schichten der Veranstaltung (nicht abgesagt). Sie fehlen in `shifts` und in den Summen – die Übersicht
   * sagt dann „noch 1 Schicht“, damit ihre Zahlen nicht wie ein Widerspruch zum Helferplan aussehen.
   */
  endedShifts: number;
  shifts: PlanningShift[];
}

/**
 * Für die Übersicht der Helferplanung: kommende, veröffentlichte Veranstaltungen mit **allen** ihren laufenden und
 * kommenden Schichten – je Schicht Besetzung, Warnstufe, eigene Eintragung und ob man sich eintragen darf. Dieselben
 * Schichten wie `getStaffingOverview` (nicht abgesagt, noch nicht beendet), aber nicht nur als Summen. Zwei Abfragen
 * plus die eigenen Einsätze, unabhängig von der Zahl der Veranstaltungen.
 */
export async function listUpcomingShiftPlans(ctx: TenantContext): Promise<PlanningEvent[]> {
  assertCan(ctx, "shifts:read");
  const now = new Date();
  const [rows, own] = await Promise.all([
    ctx.db.eventShift.findMany({
      where: {
        deletedAt: null,
        status: { not: "CANCELLED" },
        endsAt: { gte: now },
        event: { deletedAt: null, status: "PUBLISHED" },
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        requiredCount: true,
        minAge: true,
        status: true,
        event: {
          select: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            allDay: true,
            status: true,
            departmentId: true,
          },
        },
        _count: { select: { assignments: { where: { status: "CONFIRMED" } } } },
        assignments: ctx.memberId
          ? { where: { memberId: ctx.memberId, status: "CONFIRMED" }, select: { id: true } }
          : { take: 0, select: { id: true } },
      },
      orderBy: [{ startsAt: "asc" }, { title: "asc" }],
      take: 1000, // dieselbe Grenze wie `getStaffingOverview`
    }),
    ownContext(ctx),
  ]);
  const canSignup = can(ctx, "shifts:signup") && ctx.memberId !== null;

  const events = new Map<string, PlanningEvent>();
  for (const row of rows) {
    const filled = row._count.assignments;
    const mine = row.assignments[0] ? { assignmentId: row.assignments[0].id } : null;
    const started = row.startsAt.getTime() <= now.getTime();
    const health = shiftHealth(
      {
        status: row.status,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        requiredCount: row.requiredCount,
        filled,
      },
      now,
    );
    const resource = resourceOf(row.event);
    const entry = events.get(row.event.id) ?? {
      eventId: row.event.id,
      title: row.event.title,
      startsAt: row.event.startsAt,
      endsAt: row.event.endsAt,
      allDay: row.event.allDay,
      running:
        row.event.startsAt.getTime() <= now.getTime() && row.event.endsAt.getTime() > now.getTime(),
      canAssign: can(ctx, "shifts:assign", resource),
      canManage: can(ctx, "shifts:manage", resource),
      required: 0,
      filled: 0,
      signupFreeSpots: 0,
      endedShifts: 0,
      shifts: [],
    };
    entry.required += row.requiredCount;
    entry.filled += Math.min(filled, row.requiredCount);
    if (row.status === "OPEN" && !started) entry.signupFreeSpots += health.freeSpots;
    entry.shifts.push({
      id: row.id,
      title: row.title,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      requiredCount: row.requiredCount,
      minAge: row.minAge,
      status: row.status,
      started,
      filled,
      health,
      mine,
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
            confirmedCount: filled,
            alreadyConfirmed: mine !== null,
            birthDate: own.birthDate,
            ownShifts: own.ownShifts,
            now,
          })
        : noSignup(ctx),
    });
    events.set(row.event.id, entry);
  }
  if (events.size > 0) {
    const ended = await ctx.db.eventShift.groupBy({
      by: ["eventId"],
      where: {
        eventId: { in: [...events.keys()] },
        deletedAt: null,
        status: { not: "CANCELLED" },
        endsAt: { lt: now },
      },
      _count: { _all: true },
    });
    for (const group of ended) {
      const entry = events.get(group.eventId);
      if (entry) entry.endedShifts = group._count._all;
    }
  }
  return [...events.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
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
        event: ACTIVE_EVENT,
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
