import type { MemberStatus } from "@/generated/prisma/enums";
import { membersAtBucketEnds, sumPerBucket } from "@/lib/charts/aggregate";
import { buildBuckets } from "@/lib/charts/time-buckets";
import { berlinParts } from "@/lib/dates";
import { listRecentActivity, type AuditEntryDto } from "@/modules/audit/service";
import { eventVisibilityWhere, listEvents, type EventListItem } from "@/modules/events/service";
import {
  canSeeBirthdays,
  listUpcomingBirthdays,
  memberReadScope,
  type UpcomingBirthday,
} from "@/modules/members/service";
import {
  countUnread,
  listNotifications,
  type NotificationDto,
} from "@/modules/notifications/service";
import {
  getHoursOverview,
  getStaffingOverview,
  listMyAssignments,
  listOpenShifts,
  listWorkedMinutes,
  type MyAssignment,
  type OpenShiftItem,
  type StaffingEvent,
} from "@/modules/shifts/service";
import {
  getTaskStats,
  listMyOpenTasks,
  type TaskDto,
  type TaskStats,
} from "@/modules/tasks/service";
import { can, scopeOf } from "@/server/permissions/policy";
import type { TenantContext } from "@/server/tenancy/context-core";

/**
 * Daten für das Dashboard. Jeder Block ist `null`, wenn die Rolle ihn nicht sehen darf – die Oberfläche zeigt dann
 * schlicht kein Widget. Die Berechtigung wird HIER geprüft (nicht erst in der Oberfläche), und alle Abfragen laufen
 * über dieselben Fachfunktionen wie die Detailseiten: Das Dashboard schaltet nichts zusätzlich frei.
 */
export interface DashboardData {
  members: {
    total: number;
    byStatus: { status: MemberStatus; count: number }[];
    joinedThisYear: number;
    /** DEPARTMENT: nur die Mitglieder der eigenen Abteilung(en) sind gezählt. */
    scope: "CLUB" | "DEPARTMENT";
    /** Bestand am Ende jeder der letzten 12 Wochen (älteste zuerst) – für die kleine Trendlinie der Kennzahlenkarte. */
    trend: number[];
  } | null;
  events: { upcoming: EventListItem[]; countNext30Days: number } | null;
  shifts: {
    mine: MyAssignment[];
    open: OpenShiftItem[];
    /** Summe der freien Plätze in kommenden Schichten veröffentlichter Veranstaltungen. */
    freeSpots: number;
    /** Besetzte/benötigte Plätze insgesamt – für die Fortschrittsanzeige der Kennzahlenkarte. */
    staffing: { filled: number; required: number };
    /** Nur für Veranstalter: Veranstaltungen mit unbesetzten Schichten in den nächsten 7 Tagen. */
    warnings: StaffingEvent[];
    hours: {
      minutes: number;
      scope: "ALL" | "OWN";
      year: number;
      /** Summierte Stunden je der letzten 12 Wochen (älteste zuerst) – für die kleine Trendlinie der Kennzahlenkarte. */
      trend: number[];
    };
  } | null;
  /** Meine offenen Aufgaben und Kennzahlen im Rahmen der Sichtbarkeit. */
  tasks: { mine: TaskDto[]; stats: TaskStats } | null;
  notifications: { unread: number; latest: NotificationDto[] };
  birthdays: UpcomingBirthday[] | null;
  /** Letzte Ereignisse im Verein – nur für Rollen mit Zugriff auf das Änderungsprotokoll. */
  activity: AuditEntryDto[] | null;
}

const FIRST_PAGE = { page: 1, pageSize: 5, skip: 0 } as const;
const DAY = 86_400_000;

async function loadMembers(ctx: TenantContext, now: Date): Promise<DashboardData["members"]> {
  const scope = scopeOf(ctx, "members:read");
  if (scope !== "CLUB" && scope !== "DEPARTMENT") return null; // "nur eigener Datensatz" braucht keine Kennzahlen
  const where = { AND: [{ archivedAt: null, deletedAt: null }, memberReadScope(ctx) ?? {}] };
  const yearStart = new Date(Date.UTC(berlinParts(now).year, 0, 1));
  // Für die Trendlinie zählen (wie in den Auswertungen) auch Archivierte mit – sie waren in der Woche Mitglieder.
  const [groups, joinedThisYear, membershipRows] = await Promise.all([
    ctx.db.member.groupBy({ by: ["status"], where, _count: { _all: true } }),
    ctx.db.member.count({ where: { AND: [where, { joinedAt: { gte: yearStart } }] } }),
    ctx.db.member.findMany({
      where: { AND: [{ deletedAt: null }, memberReadScope(ctx) ?? {}] },
      select: { joinedAt: true, leftAt: true, status: true },
    }),
  ]);
  return {
    total: groups.reduce((sum, group) => sum + group._count._all, 0),
    byStatus: groups
      .map((group) => ({ status: group.status, count: group._count._all }))
      .sort((a, b) => b.count - a.count),
    joinedThisYear,
    scope,
    trend: membersAtBucketEnds(membershipRows, buildBuckets("W", now), now).counts,
  };
}

async function loadEvents(ctx: TenantContext, now: Date): Promise<DashboardData["events"]> {
  if (!can(ctx, "events:read")) return null;
  const [upcoming, countNext30Days] = await Promise.all([
    listEvents(ctx, { status: "PUBLISHED", period: "upcoming", request: FIRST_PAGE }),
    ctx.db.event.count({
      where: {
        AND: [
          eventVisibilityWhere(ctx),
          { status: "PUBLISHED", startsAt: { gte: now, lt: new Date(now.getTime() + 30 * DAY) } },
        ],
      },
    }),
  ]);
  return { upcoming: upcoming.items, countNext30Days };
}

async function loadShifts(ctx: TenantContext, now: Date): Promise<DashboardData["shifts"]> {
  if (!can(ctx, "shifts:read")) return null;
  const year = berlinParts(now).year;
  const isOrganizer = can(ctx, "shifts:manage") || can(ctx, "shifts:assign");
  const weeks = buildBuckets("W", now);
  const [mine, open, staffing, hours, worked] = await Promise.all([
    listMyAssignments(ctx, { limit: 5 }),
    listOpenShifts(ctx, { limit: 5 }),
    getStaffingOverview(ctx),
    getHoursOverview(ctx, year),
    listWorkedMinutes(ctx, { from: weeks[0]!.start, to: weeks[weeks.length - 1]!.end }),
  ]);
  const trend = sumPerBucket(
    worked.rows.map((row) => ({ at: row.at, value: row.minutes / 60 })),
    weeks,
  ).map((value) => Math.round(value * 10) / 10);
  return {
    mine,
    open,
    freeSpots: staffing.reduce((sum, event) => sum + Math.max(0, event.required - event.filled), 0),
    staffing: {
      filled: staffing.reduce((sum, event) => sum + Math.min(event.filled, event.required), 0),
      required: staffing.reduce((sum, event) => sum + event.required, 0),
    },
    warnings: isOrganizer
      ? staffing
          .filter(
            (event) =>
              event.openShifts > 0 &&
              (event.worstUrgency === "SOON" || event.worstUrgency === "CRITICAL"),
          )
          .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
          .slice(0, 5)
      : [],
    hours: { minutes: hours.totalMinutes, scope: hours.scope, year, trend },
  };
}

async function loadTasks(ctx: TenantContext): Promise<DashboardData["tasks"]> {
  if (!can(ctx, "tasks:read")) return null;
  const [mine, stats] = await Promise.all([listMyOpenTasks(ctx, 5), getTaskStats(ctx)]);
  return { mine, stats };
}

export async function getDashboard(
  ctx: TenantContext,
  now: Date = new Date(),
): Promise<DashboardData> {
  const [members, events, shifts, tasks, unread, latest, birthdays, activity] = await Promise.all([
    loadMembers(ctx, now),
    loadEvents(ctx, now),
    loadShifts(ctx, now),
    loadTasks(ctx),
    countUnread(ctx),
    listNotifications(ctx, { request: FIRST_PAGE }),
    canSeeBirthdays(ctx)
      ? listUpcomingBirthdays(ctx, { now, days: 14, limit: 6 })
      : Promise.resolve(null),
    can(ctx, "audit:read") ? listRecentActivity(ctx, 6) : Promise.resolve(null),
  ]);
  return {
    members,
    events,
    shifts,
    tasks,
    notifications: { unread, latest: latest.items },
    birthdays,
    activity,
  };
}
