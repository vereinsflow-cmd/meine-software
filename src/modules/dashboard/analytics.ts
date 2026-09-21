import type { EventType, MemberStatus, TaskStatus } from "@/generated/prisma/enums";
import {
  countPerBucket,
  foldSlices,
  membersAtBucketEnds,
  sumPerBucket,
} from "@/lib/charts/aggregate";
import { GRANULARITIES, buildBuckets, toLabels, type TimeBucket } from "@/lib/charts/time-buckets";
import type {
  AnalyticsData,
  AnalyticsTopic,
  DistributionDataset,
  DistributionSlice,
  Granularity,
  TimeDataset,
  TimeSeriesView,
} from "@/lib/charts/types";
import { EVENT_TYPE_LABEL, MEMBER_STATUS_LABEL, TASK_STATUS_LABEL } from "@/lib/labels";
import { eventVisibilityWhere } from "@/modules/events/service";
import { memberReadScope } from "@/modules/members/service";
import { listWorkedMinutes } from "@/modules/shifts/service";
import { countTasksByStatus } from "@/modules/tasks/service";
import { can, scopeOf } from "@/server/permissions/policy";
import type { TenantContext } from "@/server/tenancy/context-core";

/**
 * Auswertungen für das Dashboard: bereits vorhandene Vereinsdaten, zu Zeitreihen und Verteilungen verdichtet – nichts wird
 * zusätzlich gespeichert oder erfunden. Wie im übrigen Dashboard entscheidet die Berechtigung HIER: Wer ein Thema nicht sehen
 * darf, bekommt es gar nicht erst geliefert, und alle Abfragen laufen über die Sichtfilter der Fachmodule (Mandant,
 * Abteilungsreichweite, „nur eigene“).
 *
 * Die Zeitreihen werden für alle Auflösungen (Wochen, Monate, Quartale, Jahre) gleich mitgeliefert. Das sind je nur wenige
 * Zahlen, dafür schaltet die Oberfläche ohne Nachladen sofort um.
 */

/** Feste Farbposition je Kategorie: Die Farbe gehört zur Kategorie, nicht zu ihrem Rang (siehe Palette in globals.css). */
const MEMBER_STATUS_SLOT: Record<MemberStatus, number> = {
  ACTIVE: 1,
  PASSIVE: 2,
  HONORARY: 3,
  LEFT: 4,
  BLOCKED: 5,
};
const EVENT_TYPE_SLOT: Record<EventType, number> = {
  EVENT: 1,
  TRAINING: 2,
  MEETING: 3,
  COMPETITION: 4,
  WORK_ASSIGNMENT: 5,
  OTHER: 6,
};
const TASK_STATUS_SLOT: Record<TaskStatus, number> = {
  OPEN: 1,
  IN_PROGRESS: 2,
  BLOCKED: 3,
  DONE: 4,
};

type Windows = Record<Granularity, TimeBucket[]>;

const ALL: readonly Granularity[] = GRANULARITIES;
const LONG: readonly Granularity[] = ["M", "Q", "Y"]; // für Bestandsgrößen sind Wochen nicht sinnvoll

function windowsAt(now: Date): Windows {
  return Object.fromEntries(GRANULARITIES.map((g) => [g, buildBuckets(g, now)])) as Windows;
}

function timeViews(
  windows: Windows,
  granularities: readonly Granularity[],
  valuesFor: (buckets: TimeBucket[]) => number[][],
): Partial<Record<Granularity, TimeSeriesView>> {
  const views: Partial<Record<Granularity, TimeSeriesView>> = {};
  for (const granularity of granularities) {
    const buckets = windows[granularity];
    views[granularity] = { buckets: toLabels(buckets), values: valuesFor(buckets) };
  }
  return views;
}

const slicesOf = <K extends string>(
  entries: { key: K; count: number }[],
  label: Record<K, string>,
  slot: Record<K, number>,
): DistributionSlice[] =>
  entries
    .map(({ key, count }) => ({ id: key, label: label[key], value: count, slot: slot[key] }))
    .filter((slice) => slice.value > 0)
    .sort((a, b) => b.value - a.value);

// ---------------------------------------------------------------------------------------------
// Mitglieder
// ---------------------------------------------------------------------------------------------

async function membersTopic(
  ctx: TenantContext,
  now: Date,
  windows: Windows,
): Promise<AnalyticsTopic | null> {
  const scope = scopeOf(ctx, "members:read");
  if (scope !== "CLUB" && scope !== "DEPARTMENT") return null; // „nur eigener Datensatz“ braucht keine Auswertung
  const scopeWhere = memberReadScope(ctx) ?? {};
  const [rows, statusGroups] = await Promise.all([
    // Für den Verlauf zählen auch Archivierte mit (sie waren Mitglieder); der Papierkorb nicht.
    ctx.db.member.findMany({
      where: { AND: [{ deletedAt: null }, scopeWhere] },
      select: { joinedAt: true, leftAt: true, status: true },
    }),
    ctx.db.member.groupBy({
      by: ["status"],
      where: { AND: [{ archivedAt: null, deletedAt: null }, scopeWhere] },
      _count: { _all: true },
    }),
  ]);

  let skipped = 0;
  const trend: TimeDataset = {
    kind: "time",
    id: "members-trend",
    title: "Mitgliederentwicklung",
    shortTitle: "Entwicklung",
    description:
      scope === "DEPARTMENT" ? "Bestand in deiner Abteilung" : "Bestand am Ende des Zeitraums",
    unit: { singular: "Mitglied", plural: "Mitglieder", decimals: 0 },
    series: [{ id: "count", label: "Mitglieder" }],
    granularities: [...LONG],
    defaultGranularity: "M",
    views: timeViews(windows, LONG, (buckets) => {
      const result = membersAtBucketEnds(rows, buckets, now);
      skipped = result.skipped;
      return [result.counts];
    }),
    types: ["line", "area", "bar"],
    defaultType: "line",
  };
  trend.note =
    "Gezählt werden Mitglieder mit Eintrittsdatum; Ausgetretene zählen ab ihrem Austrittsdatum nicht mehr." +
    (skipped > 0
      ? ` ${skipped} ${skipped === 1 ? "Mitglied fehlt" : "Mitglieder fehlen"}, weil das Eintrittsdatum (oder bei Ausgetretenen das Austrittsdatum) nicht eingetragen ist.`
      : "");

  const byStatus: DistributionDataset = {
    kind: "distribution",
    id: "members-status",
    title: "Mitglieder nach Status",
    shortTitle: "Nach Status",
    description:
      scope === "DEPARTMENT" ? "Nur deine Abteilung(en), ohne Archiv" : "Aktuell, ohne Archiv",
    unit: { singular: "Mitglied", plural: "Mitglieder", decimals: 0 },
    views: {
      ALL: slicesOf(
        statusGroups.map((group) => ({ key: group.status, count: group._count._all })),
        MEMBER_STATUS_LABEL,
        MEMBER_STATUS_SLOT,
      ),
    },
    types: ["donut", "bar"],
    defaultType: "donut",
  };

  return { id: "members", label: "Mitglieder", datasets: [byStatus, trend] };
}

// ---------------------------------------------------------------------------------------------
// Veranstaltungen
// ---------------------------------------------------------------------------------------------

async function eventsTopic(ctx: TenantContext, windows: Windows): Promise<AnalyticsTopic | null> {
  if (!can(ctx, "events:read")) return null;
  const widest = windows.Y;
  const from = widest[0]!.start;
  const to = widest[widest.length - 1]!.end;
  const rows = await ctx.db.event.findMany({
    where: {
      AND: [
        eventVisibilityWhere(ctx),
        // Entwürfe, Abgesagte und Archivierte zählen nicht als stattgefundene oder geplante Veranstaltung.
        { status: { in: ["PUBLISHED", "COMPLETED"] }, startsAt: { gte: from, lt: to } },
      ],
    },
    select: { startsAt: true, type: true },
  });

  const trend: TimeDataset = {
    kind: "time",
    id: "events-trend",
    title: "Veranstaltungen im Zeitverlauf",
    shortTitle: "Verlauf",
    description: "Veröffentlichte und abgeschlossene Veranstaltungen je Zeitraum",
    unit: { singular: "Veranstaltung", plural: "Veranstaltungen", decimals: 0 },
    series: [{ id: "count", label: "Veranstaltungen" }],
    granularities: [...ALL],
    defaultGranularity: "M",
    views: timeViews(windows, ALL, (buckets) => [
      countPerBucket(
        rows.map((row) => row.startsAt),
        buckets,
      ),
    ]),
    types: ["bar", "line", "area"],
    defaultType: "bar",
    note: "Der laufende Zeitraum enthält auch bereits geplante Termine; er ist deshalb noch nicht abgeschlossen.",
  };

  const byType: DistributionDataset = {
    kind: "distribution",
    id: "events-type",
    title: "Veranstaltungen nach Art",
    shortTitle: "Nach Art",
    description: "Verteilung im gewählten Zeitraum",
    unit: { singular: "Veranstaltung", plural: "Veranstaltungen", decimals: 0 },
    granularities: [...ALL],
    defaultGranularity: "M",
    views: Object.fromEntries(
      ALL.map((granularity) => {
        const buckets = windows[granularity];
        const start = buckets[0]!.start.getTime();
        const end = buckets[buckets.length - 1]!.end.getTime();
        const counts = new Map<EventType, number>();
        for (const row of rows) {
          const time = row.startsAt.getTime();
          if (time >= start && time < end) counts.set(row.type, (counts.get(row.type) ?? 0) + 1);
        }
        const slices = slicesOf(
          [...counts].map(([key, count]) => ({ key, count })),
          EVENT_TYPE_LABEL,
          EVENT_TYPE_SLOT,
        );
        return [granularity, foldSlices(slices, 6)];
      }),
    ) as DistributionDataset["views"],
    types: ["donut", "bar"],
    defaultType: "donut",
  };

  return { id: "events", label: "Veranstaltungen", datasets: [trend, byType] };
}

// ---------------------------------------------------------------------------------------------
// Helferstunden
// ---------------------------------------------------------------------------------------------

async function hoursTopic(ctx: TenantContext, windows: Windows): Promise<AnalyticsTopic | null> {
  if (!can(ctx, "shifts:read")) return null;
  const widest = windows.Y;
  const { scope, rows } = await listWorkedMinutes(ctx, {
    from: widest[0]!.start,
    to: widest[widest.length - 1]!.end,
  });

  const trend: TimeDataset = {
    kind: "time",
    id: "hours-trend",
    title: scope === "ALL" ? "Helferstunden" : "Meine Helferstunden",
    shortTitle: "Verlauf",
    description:
      scope === "ALL"
        ? "Dokumentierte Einsatzstunden nach Datum der Schicht"
        : "Deine dokumentierten Einsatzstunden nach Datum der Schicht",
    unit: { singular: "Std.", plural: "Std.", decimals: 1 },
    series: [{ id: "hours", label: "Stunden" }],
    granularities: [...ALL],
    defaultGranularity: "M",
    views: timeViews(windows, ALL, (buckets) => [
      sumPerBucket(
        rows.map((row) => ({ at: row.at, value: row.minutes / 60 })),
        buckets,
      ).map((hours) => Math.round(hours * 100) / 100),
    ]),
    types: ["bar", "line", "area"],
    defaultType: "bar",
    note: "Gezählt werden nur Schichten, für die Stunden dokumentiert sind.",
  };

  return { id: "hours", label: "Helferstunden", datasets: [trend] };
}

// ---------------------------------------------------------------------------------------------
// Aufgaben
// ---------------------------------------------------------------------------------------------

async function tasksTopic(ctx: TenantContext): Promise<AnalyticsTopic | null> {
  if (!can(ctx, "tasks:read")) return null;
  const groups = await countTasksByStatus(ctx);
  const byStatus: DistributionDataset = {
    kind: "distribution",
    id: "tasks-status",
    title: "Aufgaben nach Status",
    shortTitle: "Nach Status",
    description: "Alle Aufgaben, die du sehen darfst",
    unit: { singular: "Aufgabe", plural: "Aufgaben", decimals: 0 },
    views: {
      ALL: slicesOf(
        groups.map((group) => ({ key: group.status, count: group.count })),
        TASK_STATUS_LABEL,
        TASK_STATUS_SLOT,
      ),
    },
    types: ["donut", "bar"],
    defaultType: "donut",
  };
  return { id: "tasks", label: "Aufgaben", datasets: [byStatus] };
}

export async function getAnalytics(
  ctx: TenantContext,
  now: Date = new Date(),
): Promise<AnalyticsData> {
  const windows = windowsAt(now);
  const topics = await Promise.all([
    membersTopic(ctx, now, windows),
    eventsTopic(ctx, windows),
    hoursTopic(ctx, windows),
    tasksTopic(ctx),
  ]);
  return { topics: topics.filter((topic): topic is AnalyticsTopic => topic !== null) };
}
