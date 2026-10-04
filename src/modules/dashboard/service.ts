import type { MemberStatus } from "@/generated/prisma/enums";
import { canFinance } from "@/modules/finance/access";
import { sumPerBucket } from "@/lib/charts/aggregate";
import { eventsQuote, hoursQuote, membersQuote, staffingQuote, type Quote } from "./quote";
import { buildBuckets } from "@/lib/charts/time-buckets";
import { berlinParts, daysUntil } from "@/lib/dates";
import { listRecentActivity, type AuditEntryDto } from "@/modules/audit/service";
import { eventVisibilityWhere, listEvents, type EventListItem } from "@/modules/events/service";
import { getOpenPayments, type OpenPayments } from "@/modules/finance/service";
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
  listStaffingHistory,
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
    /** DEPARTMENT: nur die Mitglieder der eigenen Abteilung(en) sind gezählt. */
    scope: "CLUB" | "DEPARTMENT";
    /** Mitgliederzahl heute vor 6, 5, … Monaten bis heute (älteste zuerst, gezählt wie `total`) – Vergleich zum Vormonat. */
    trend: number[];
    /** Kursverlauf der Kennzahlenkarte (6 M, 12 M, 5 J; mit Zu- und Abgängen). */
    quote: Quote;
  } | null;
  events: {
    upcoming: EventListItem[];
    countNext30Days: number;
    /** Tage bis zum nächsten anstehenden Termin (0 = heute); `null` ohne einen. */
    nextInDays: number | null;
    /** Kursverlauf: Termine in den folgenden 30 Tagen zu jedem Stichtag (12 W, 6 M, 12 M). */
    quote: Quote;
  } | null;
  shifts: {
    mine: MyAssignment[];
    open: OpenShiftItem[];
    /** Summe der freien Plätze in kommenden Schichten veröffentlichter Veranstaltungen. */
    freeSpots: number;
    /** Besetzte/benötigte Plätze insgesamt – für die Fortschrittsanzeige der Kennzahlenkarte. */
    staffing: { filled: number; required: number };
    /** Kursverlauf der Besetzung: besetzte Plätze der heute offenen Schichten je Woche (6 W, 12 W). */
    staffingQuote: Quote;
    /** Nur für Veranstalter: Veranstaltungen mit unbesetzten Schichten in den nächsten 7 Tagen. */
    warnings: StaffingEvent[];
    hours: {
      minutes: number;
      scope: "ALL" | "OWN";
      year: number;
      /** Summierte Stunden je der letzten 12 Wochen (älteste zuerst) – für den Vergleich zur Vorwoche. */
      trend: number[];
      /** Kursverlauf: im Zeitraum aufsummierte Stunden (12 W, laufendes Jahr, 5 J). */
      quote: Quote;
    };
  } | null;
  /** Meine offenen Aufgaben und Kennzahlen im Rahmen der Sichtbarkeit. */
  tasks: { mine: TaskDto[]; stats: TaskStats } | null;
  notifications: { unread: number; latest: NotificationDto[] };
  birthdays: UpcomingBirthday[] | null;
  /** Letzte Ereignisse im Verein – nur für Rollen mit Zugriff auf das Änderungsprotokoll. */
  activity: AuditEntryDto[] | null;
  /** Offene Zahlungen (Rechnungen) – nur für Rollen mit `finance:read` (Vereinsadministrator, Vorstand). */
  payments: OpenPayments | null;
}

const FIRST_PAGE = { page: 1, pageSize: 5, skip: 0 } as const;
const DAY = 86_400_000;

async function loadMembers(ctx: TenantContext, now: Date): Promise<DashboardData["members"]> {
  const scope = scopeOf(ctx, "members:read");
  if (scope !== "CLUB" && scope !== "DEPARTMENT") return null; // "nur eigener Datensatz" braucht keine Kennzahlen
  const where = { AND: [{ archivedAt: null, deletedAt: null }, memberReadScope(ctx) ?? {}] };
  // Für den Verlauf alle Mitglieder samt Archiv und Papierkorb: Sie zählen bis zum Archivieren bzw. Löschen mit – genau wie
  // die Zahl auf der Karte (`memberCounts` in quote.ts), der Verlauf endet deshalb immer bei ihr.
  const [groups, records] = await Promise.all([
    ctx.db.member.groupBy({ by: ["status"], where, _count: { _all: true } }),
    ctx.db.member.findMany({
      where: memberReadScope(ctx) ?? {},
      select: { joinedAt: true, createdAt: true, archivedAt: true, deletedAt: true },
    }),
  ]);
  const quote = membersQuote(records, now);
  return {
    total: groups.reduce((sum, group) => sum + group._count._all, 0),
    byStatus: groups
      .map((group) => ({ status: group.status, count: group._count._all }))
      .sort((a, b) => b.count - a.count),
    scope,
    trend: quote.periods.find((period) => period.id === "6M")!.points.map((point) => point.value),
    quote,
  };
}

async function loadEvents(ctx: TenantContext, now: Date): Promise<DashboardData["events"]> {
  if (!can(ctx, "events:read")) return null;
  // Für den Kursverlauf: alle Termine ab dem ältesten Stichtag (vor 12 Monaten) bis 30 Tage nach heute
  const historyFrom = buildBuckets("M", now)[0]!.start;
  const [upcoming, countNext30Days, historyRows] = await Promise.all([
    listEvents(ctx, { status: "PUBLISHED", period: "upcoming", request: FIRST_PAGE }),
    ctx.db.event.count({
      where: {
        AND: [
          eventVisibilityWhere(ctx),
          { status: "PUBLISHED", startsAt: { gte: now, lt: new Date(now.getTime() + 30 * DAY) } },
        ],
      },
    }),
    ctx.db.event.findMany({
      where: {
        AND: [
          eventVisibilityWhere(ctx),
          {
            status: { in: ["PUBLISHED", "COMPLETED"] },
            startsAt: { gte: historyFrom, lt: new Date(now.getTime() + 30 * DAY) },
          },
        ],
      },
      select: { startsAt: true },
    }),
  ]);
  return {
    upcoming: upcoming.items,
    countNext30Days,
    quote: eventsQuote(
      historyRows.map((row) => row.startsAt),
      now,
      countNext30Days,
    ),
    nextInDays: upcoming.items[0] ? daysUntil(upcoming.items[0].startsAt, now) : null,
  };
}

async function loadShifts(ctx: TenantContext, now: Date): Promise<DashboardData["shifts"]> {
  if (!can(ctx, "shifts:read")) return null;
  const year = berlinParts(now).year;
  const isOrganizer = can(ctx, "shifts:manage") || can(ctx, "shifts:assign");
  const weeks = buildBuckets("W", now);
  const years = buildBuckets("Y", now); // der weiteste Zeitraum des Kursverlaufs (5 Jahre)
  const [mine, open, staffing, hours, worked, history] = await Promise.all([
    listMyAssignments(ctx, { limit: 5 }),
    listOpenShifts(ctx, { limit: 5 }),
    getStaffingOverview(ctx),
    getHoursOverview(ctx, year),
    listWorkedMinutes(ctx, { from: years[0]!.start, to: years[years.length - 1]!.end }),
    listStaffingHistory(ctx),
  ]);
  const trend = sumPerBucket(
    worked.rows.map((row) => ({ at: row.at, value: row.minutes / 60 })),
    weeks,
  ).map((value) => Math.round(value * 10) / 10);
  const filled = staffing.reduce((sum, event) => sum + Math.min(event.filled, event.required), 0);
  return {
    mine,
    open,
    freeSpots: staffing.reduce((sum, event) => sum + Math.max(0, event.required - event.filled), 0),
    staffing: {
      filled,
      required: staffing.reduce((sum, event) => sum + event.required, 0),
    },
    staffingQuote: staffingQuote(history, now, filled),
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
    hours: {
      minutes: hours.totalMinutes,
      scope: hours.scope,
      year,
      trend,
      quote: hoursQuote(worked.rows, now, year, hours.totalMinutes),
    },
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
  const [members, events, shifts, tasks, unread, latest, birthdays, activity, payments] =
    await Promise.all([
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
      canFinance(ctx, "finance:read") ? getOpenPayments(ctx, { limit: 6 }) : Promise.resolve(null),
    ]);
  return {
    members,
    events,
    shifts,
    tasks,
    notifications: { unread, latest: latest.items },
    birthdays,
    activity,
    payments,
  };
}
