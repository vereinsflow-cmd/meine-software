import type { Prisma } from "@/generated/prisma/client";
import type {
  AttendanceStatus,
  EventStatus,
  EventType,
  ParticipantStatus,
} from "@/generated/prisma/enums";
import { toCsv } from "@/lib/csv";
import { formatDate, toDateInputValue, toTimeInputValue } from "@/lib/dates";
import { EVENT_TYPE_LABEL } from "@/lib/labels";
import { recordAudit } from "@/server/audit/audit";
import { lockUntilCommit } from "@/server/db/tenant";
import { conflict, notFound } from "@/server/errors";
import { assertCan, can, scopeOf } from "@/server/permissions/policy";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import {
  ATTENDANCE_RESULT_LABEL,
  ATTENDANCE_STATUSES,
  attendanceRate,
  attendanceWindow,
  averageAttendance,
  countsText,
  emptyCounts,
  periodRange,
  totalOf,
  type AttendanceCounts,
  type AttendanceFilters,
  type AttendanceWindow,
  type SaveAttendanceInput,
} from "./attendance-schemas";
import { eventRow } from "./service";

/**
 * Anwesenheit bei Terminen (vor allem Training): Wer war da, wer fehlte entschuldigt, wer unentschuldigt.
 *
 * Getrennt von Zu- und Absagen (`participants.ts`): Erfassen ändert keine Teilnahme, keine Warteliste und nicht das
 * Teilnehmerlimit – wer abgesagt hat, kann trotzdem anwesend sein.
 *
 * Rechte: dasselbe Recht wie für Teilnehmerlisten (`events:manage_participants`), bezogen auf die Abteilung des Termins –
 * Vorstand und Administratoren im ganzen Verein, Abteilungsleiter nur für Termine der eigenen Abteilungen. Personen
 * hinzufügen geht nur aus derselben Reichweite (ganzer Verein bzw. Mitglieder der geleiteten Abteilungen). Auswertungen
 * filtern schon in der Abfrage auf diese Abteilungen. Mitglieder sehen nur ihre eigene Anwesenheit.
 */

const MANAGE = "events:manage_participants" as const;

/** Wer auf die Liste gesetzt werden kann: im Bestand, nicht ausgetreten oder gesperrt. */
const ACTIVE_MEMBER = {
  archivedAt: null,
  deletedAt: null,
  status: { in: ["ACTIVE", "HONORARY", "PASSIVE"] },
} satisfies Prisma.MemberWhereInput;

const isClubWide = (ctx: TenantContext) => scopeOf(ctx, MANAGE) === "CLUB";

/** Termine in der Reichweite des Rechts (ganzer Verein bzw. Termine der geleiteten Abteilungen). */
function eventScope(ctx: TenantContext): Prisma.EventWhereInput {
  return isClubWide(ctx) ? {} : { departmentId: { in: [...ctx.ledDepartmentIds] } };
}

/** Mitglieder in der Reichweite des Rechts (ganzer Verein bzw. Mitglieder der geleiteten Abteilungen). */
function memberScope(ctx: TenantContext): Prisma.MemberWhereInput {
  return isClubWide(ctx)
    ? {}
    : { departments: { some: { departmentId: { in: [...ctx.ledDepartmentIds] } } } };
}

const listName = (member: { firstName: string; lastName: string }) =>
  `${member.lastName}, ${member.firstName}`;

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "de");

function countsFrom(rows: { status: AttendanceStatus; _count: { _all: number } }[]) {
  const counts = emptyCounts();
  for (const row of rows) {
    if (row.status === "PRESENT") counts.present += row._count._all;
    else if (row.status === "EXCUSED") counts.excused += row._count._all;
    else counts.absent += row._count._all;
  }
  return counts;
}

// ---------------------------------------------------------------------------------------------
// Veranstaltungsseite: „Anwesend: X von Y“
// ---------------------------------------------------------------------------------------------

export interface EventAttendanceSummary {
  counts: AttendanceCounts;
  total: number;
  window: AttendanceWindow;
}

/**
 * Zahlen für die Karte auf der Veranstaltungsseite – nur für Berechtigte, sonst `null`. `event` stammt aus `getEvent`
 * (bereits auf Sichtbarkeit geprüft).
 */
export async function getEventAttendanceSummary(
  ctx: TenantContext,
  event: { id: string; status: EventStatus; startsAt: Date; departmentId: string | null },
  now: Date = new Date(),
): Promise<EventAttendanceSummary | null> {
  if (!can(ctx, MANAGE, { departmentIds: event.departmentId ? [event.departmentId] : [] }))
    return null;
  const rows = await ctx.db.eventAttendance.groupBy({
    by: ["status"],
    where: { eventId: event.id, member: { deletedAt: null } },
    _count: { _all: true },
  });
  const counts = countsFrom(rows);
  return { counts, total: totalOf(counts), window: attendanceWindow(event, now) };
}

// ---------------------------------------------------------------------------------------------
// Erfassungsliste
// ---------------------------------------------------------------------------------------------

export interface AttendanceSheetRow {
  memberId: string;
  name: string;
  /** Vorschlag für die Liste: gespeicherter Status, bei einer Absage „entschuldigt“, sonst offen. */
  status: AttendanceStatus | null;
  /** Gespeicherter Status (`null` = noch nicht erfasst). */
  saved: AttendanceStatus | null;
  /** Zu- oder Absage zum Termin (nur als Hinweis; unabhängig von der Anwesenheit). */
  rsvp: "ACCEPTED" | "DECLINED" | null;
}

export interface AttendanceSheet {
  event: {
    id: string;
    title: string;
    type: EventType;
    status: EventStatus;
    startsAt: Date;
    endsAt: Date;
    allDay: boolean;
    departmentName: string | null;
  };
  window: AttendanceWindow;
  rows: AttendanceSheetRow[];
  /** Wen „+ Person“ hinzufügen kann (Reichweite des Rechts, nur Namen). */
  people: { id: string; name: string }[];
  /** Gruppen der Abteilung des Termins (ohne Abteilung: alle Gruppen) für „Gruppe laden“. */
  groups: { id: string; name: string; memberIds: string[] }[];
}

export async function getAttendanceSheet(
  ctx: TenantContext,
  eventId: string,
  now: Date = new Date(),
): Promise<AttendanceSheet> {
  const event = await eventRow(ctx, eventId, MANAGE);
  const scope = memberScope(ctx);
  const names = { firstName: true, lastName: true } as const;

  const [attendances, rsvps, people, groups] = await Promise.all([
    ctx.db.eventAttendance.findMany({
      where: { eventId: event.id, member: { deletedAt: null } },
      select: { memberId: true, status: true, member: { select: names } },
    }),
    ctx.db.eventParticipant.findMany({
      where: {
        eventId: event.id,
        status: { in: ["ACCEPTED", "DECLINED"] satisfies ParticipantStatus[] },
        member: { deletedAt: null },
      },
      select: { memberId: true, status: true, member: { select: names } },
    }),
    ctx.db.member.findMany({
      where: { ...ACTIVE_MEMBER, ...scope },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, ...names },
      take: 2000,
    }),
    ctx.db.group.findMany({
      where: {
        isActive: true,
        ...(event.departmentId ? { departmentId: event.departmentId } : {}),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        members: { where: { member: { ...ACTIVE_MEMBER, ...scope } }, select: { memberId: true } },
      },
    }),
  ]);

  const rows = new Map<string, AttendanceSheetRow>();
  for (const rsvp of rsvps) {
    const response = rsvp.status === "DECLINED" ? "DECLINED" : "ACCEPTED";
    rows.set(rsvp.memberId, {
      memberId: rsvp.memberId,
      name: listName(rsvp.member),
      status: response === "DECLINED" ? "EXCUSED" : null,
      saved: null,
      rsvp: response,
    });
  }
  for (const row of attendances) {
    rows.set(row.memberId, {
      memberId: row.memberId,
      name: listName(row.member),
      status: row.status,
      saved: row.status,
      rsvp: rows.get(row.memberId)?.rsvp ?? null,
    });
  }

  return {
    event: {
      id: event.id,
      title: event.title,
      type: event.type,
      status: event.status,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      allDay: event.allDay,
      departmentName: event.department?.name ?? null,
    },
    window: attendanceWindow(event, now),
    rows: [...rows.values()].sort(byName),
    people: people.map((member) => ({ id: member.id, name: listName(member) })),
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      memberIds: group.members.map((m) => m.memberId),
    })),
  };
}

export interface SaveAttendanceResult extends AttendanceCounts {
  /** Wie viele Personen sich geändert haben (neu, geändert, entfernt). */
  changed: number;
}

/**
 * Speichert die Anwesenheit eines Termins in EINER Transaktion: neue Einträge anlegen, geänderte umstellen (mit neuem
 * „erfasst am/von“), Einträge mit `null` entfernen. Unveränderte bleiben unberührt. Gleichzeitiges Speichern desselben
 * Termins wartet aufeinander (Sperre je Termin). Das Protokoll nennt nur Zahlen, keine Namen.
 */
export async function saveAttendance(
  ctx: TenantContext,
  input: SaveAttendanceInput,
  now: Date = new Date(),
): Promise<SaveAttendanceResult> {
  const event = await eventRow(ctx, input.eventId, MANAGE);
  const window = attendanceWindow(event, now);
  if (!window.open) throw conflict(window.reason ?? "Die Anwesenheit lässt sich nicht erfassen.");

  // Wer neu auf die Liste darf: wer zu- oder abgesagt hat, schon erfasst ist oder in der Reichweite des Rechts liegt.
  const setIds = input.entries.filter((e) => e.status !== null).map((e) => e.memberId);
  if (setIds.length > 0) {
    const [rsvps, recorded, scoped] = await Promise.all([
      ctx.db.eventParticipant.findMany({
        where: { eventId: event.id, memberId: { in: setIds }, member: { deletedAt: null } },
        select: { memberId: true },
      }),
      ctx.db.eventAttendance.findMany({
        where: { eventId: event.id, memberId: { in: setIds }, member: { deletedAt: null } },
        select: { memberId: true },
      }),
      ctx.db.member.findMany({
        where: { id: { in: setIds }, ...ACTIVE_MEMBER, ...memberScope(ctx) },
        select: { id: true },
      }),
    ]);
    const allowed = new Set([
      ...rsvps.map((r) => r.memberId),
      ...recorded.map((r) => r.memberId),
      ...scoped.map((m) => m.id),
    ]);
    if (setIds.some((id) => !allowed.has(id))) throw notFound("Das Mitglied");
  }

  try {
    return await ctx.db.$transaction(async (tx) => {
      await lockUntilCommit(tx, ctx.clubId, `attendance:${event.id}`);
      const before = await tx.eventAttendance.findMany({
        where: { eventId: event.id, memberId: { in: input.entries.map((e) => e.memberId) } },
        select: { memberId: true, status: true },
      });
      const current = new Map(before.map((row) => [row.memberId, row.status]));
      const remove = input.entries
        .filter((e) => e.status === null && current.has(e.memberId))
        .map((e) => e.memberId);
      const create = input.entries.filter(
        (e): e is { memberId: string; status: AttendanceStatus } =>
          e.status !== null && !current.has(e.memberId),
      );
      const update = input.entries.filter(
        (e): e is { memberId: string; status: AttendanceStatus } =>
          e.status !== null && current.has(e.memberId) && current.get(e.memberId) !== e.status,
      );

      if (remove.length > 0)
        await tx.eventAttendance.deleteMany({
          where: { eventId: event.id, memberId: { in: remove } },
        });
      if (create.length > 0)
        await tx.eventAttendance.createMany({
          data: create.map((entry) => ({
            clubId: ctx.clubId,
            eventId: event.id,
            memberId: entry.memberId,
            status: entry.status,
            recordedById: ctx.userId,
            recordedAt: now,
          })),
        });
      for (const status of ATTENDANCE_STATUSES) {
        const ids = update.filter((e) => e.status === status).map((e) => e.memberId);
        if (ids.length > 0)
          await tx.eventAttendance.updateMany({
            where: { eventId: event.id, memberId: { in: ids } },
            data: { status, recordedById: ctx.userId, recordedAt: now },
          });
      }

      const changed = remove.length + create.length + update.length;
      // Dieselben Zahlen wie auf Karte und Liste: Mitglieder im Papierkorb bzw. anonymisierte zählen nicht mit.
      const counts = countsFrom(
        await tx.eventAttendance.groupBy({
          by: ["status"],
          where: { eventId: event.id, member: { deletedAt: null } },
          _count: { _all: true },
        }),
      );
      if (changed > 0) {
        await recordAudit(tx, auditActor(ctx), {
          action: "event.attendance_saved",
          entityType: "Event",
          entityId: event.id,
          summary: `Anwesenheit „${event.title}“: ${countsText(counts)}`,
          changes: {
            neu: { to: create.length },
            geaendert: { to: update.length },
            entfernt: { to: remove.length },
          },
        });
      }
      return { ...counts, changed };
    });
  } catch (error) {
    // Eindeutig je Termin und Mitglied: Kam ein Eintrag gleichzeitig von anderswo (ohne Sperre), lieber neu laden lassen.
    if (error instanceof Error && /eventId_memberId|Unique constraint/i.test(error.message))
      throw conflict(
        "Die Anwesenheit wurde gerade gleichzeitig geändert. Bitte lade die Seite neu und speichere noch einmal.",
      );
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Auswertung
// ---------------------------------------------------------------------------------------------

/** Filter der Auswertung – Reichweite des Rechts immer zuerst, dann die gewählten Filter. */
async function statsWhere(
  ctx: TenantContext,
  filters: AttendanceFilters,
  now: Date,
): Promise<{ where: Prisma.EventAttendanceWhereInput; range: { from: Date; to: Date } }> {
  assertCan(ctx, MANAGE);
  const range = periodRange(filters.period, now);
  // Nur Gruppen in der Reichweite des Rechts (wie in `attendanceFilterOptions`): Abteilungsleiter sonst über den CSV-Export
  // mit einer vereinsweiten Gruppe erfahren, wer von ihren Teilnehmern dort Mitglied ist. Fremd = wie unbekannt.
  const group = filters.groupId
    ? await ctx.db.group.findFirst({
        where: {
          id: filters.groupId,
          ...(isClubWide(ctx) ? {} : { departmentId: { in: [...ctx.ledDepartmentIds] } }),
        },
        select: { id: true, departmentId: true },
      })
    : null;
  if (filters.groupId && !group) throw notFound("Die Gruppe");

  const event: Prisma.EventWhereInput = {
    AND: [
      { deletedAt: null },
      eventScope(ctx),
      filters.type ? { type: filters.type } : {},
      { startsAt: { gte: range.from, lt: range.to } },
      filters.departmentId ? { departmentId: filters.departmentId } : {},
      group?.departmentId ? { departmentId: group.departmentId } : {},
      filters.seriesId ? { seriesId: filters.seriesId } : {},
    ],
  };
  const member: Prisma.MemberWhereInput = {
    deletedAt: null,
    ...(group ? { groups: { some: { groupId: group.id } } } : {}),
  };
  return { where: { event, member }, range };
}

export interface AttendanceStatsRow extends AttendanceCounts {
  memberId: string;
  name: string;
  total: number;
  rate: number | null;
}

export interface AttendanceStats {
  rows: AttendanceStatsRow[];
  /** Termine mit mindestens einem Eintrag (im Filter). */
  recordedEvents: number;
  /** Im Schnitt anwesend je erfasstem Termin. */
  averagePresent: number | null;
  totals: AttendanceCounts;
  range: { from: Date; to: Date };
}

export async function attendanceStats(
  ctx: TenantContext,
  filters: AttendanceFilters,
  now: Date = new Date(),
): Promise<AttendanceStats> {
  const { where, range } = await statsWhere(ctx, filters, now);
  const [perMember, perEvent] = await Promise.all([
    ctx.db.eventAttendance.groupBy({
      by: ["memberId", "status"],
      where,
      _count: { _all: true },
    }),
    ctx.db.eventAttendance.groupBy({ by: ["eventId"], where, _count: { _all: true } }),
  ]);

  const counts = new Map<string, AttendanceCounts>();
  for (const row of perMember) {
    const entry = counts.get(row.memberId) ?? emptyCounts();
    if (row.status === "PRESENT") entry.present += row._count._all;
    else if (row.status === "EXCUSED") entry.excused += row._count._all;
    else entry.absent += row._count._all;
    counts.set(row.memberId, entry);
  }
  const members = await ctx.db.member.findMany({
    where: { id: { in: [...counts.keys()] } },
    select: { id: true, firstName: true, lastName: true },
  });
  const rows = members
    .map((member) => {
      const entry = counts.get(member.id)!;
      return {
        memberId: member.id,
        name: listName(member),
        ...entry,
        total: totalOf(entry),
        rate: attendanceRate(entry),
      };
    })
    .sort(byName);
  const totals = rows.reduce(
    (sum, row) => ({
      present: sum.present + row.present,
      excused: sum.excused + row.excused,
      absent: sum.absent + row.absent,
    }),
    emptyCounts(),
  );
  return {
    rows,
    recordedEvents: perEvent.length,
    averagePresent: averageAttendance(totals.present, perEvent.length),
    totals,
    range,
  };
}

export interface AttendanceFilterOptions {
  departments: { id: string; name: string }[];
  groups: { id: string; name: string; departmentName: string | null }[];
  series: { id: string; label: string }[];
}

/** Auswahl für die Filter der Auswertung – nur Abteilungen, Gruppen und Serien in der Reichweite des Rechts. */
export async function attendanceFilterOptions(
  ctx: TenantContext,
): Promise<AttendanceFilterOptions> {
  assertCan(ctx, MANAGE);
  const club = isClubWide(ctx);
  const led = [...ctx.ledDepartmentIds];
  const [departments, groups, series] = await Promise.all([
    ctx.db.department.findMany({
      where: club ? { isActive: true } : { id: { in: led } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    ctx.db.group.findMany({
      where: { isActive: true, ...(club ? {} : { departmentId: { in: led } }) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, department: { select: { name: true } } },
    }),
    ctx.db.event.groupBy({
      by: ["seriesId"],
      where: {
        deletedAt: null,
        seriesId: { not: null },
        attendances: { some: {} },
        ...eventScope(ctx),
      },
      _min: { startsAt: true },
    }),
  ]);
  const seriesIds = series.map((s) => s.seriesId).filter((id): id is string => id !== null);
  const titles =
    seriesIds.length > 0
      ? await ctx.db.event.findMany({
          where: { seriesId: { in: seriesIds }, deletedAt: null },
          distinct: ["seriesId"],
          orderBy: { startsAt: "asc" },
          select: { seriesId: true, title: true },
        })
      : [];
  const titleOf = new Map(titles.map((t) => [t.seriesId, t.title]));
  return {
    departments,
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      departmentName: g.department?.name ?? null,
    })),
    series: series
      .filter((s): s is typeof s & { seriesId: string } => s.seriesId !== null)
      .map((s) => ({
        id: s.seriesId,
        label: `${titleOf.get(s.seriesId) ?? "Terminserie"} (ab ${formatDate(s._min.startsAt)})`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "de")),
  };
}

const MAX_EXPORT_ROWS = 20_000;

/**
 * CSV der Anwesenheit (eine Zeile je Termin und Person) mit denselben Filtern wie die Auswertung. Ohne „erfasst von“.
 * Jeder Export wird protokolliert (nur die Anzahl).
 */
export async function exportAttendanceCsv(
  ctx: TenantContext,
  filters: AttendanceFilters,
  now: Date = new Date(),
): Promise<{ csv: string; filename: string; count: number }> {
  const { where } = await statsWhere(ctx, filters, now);
  const rows = await ctx.db.eventAttendance.findMany({
    where,
    select: {
      status: true,
      event: {
        select: { title: true, startsAt: true, type: true, department: { select: { name: true } } },
      },
      member: { select: { firstName: true, lastName: true } },
    },
    orderBy: [
      { event: { startsAt: "asc" } },
      { member: { lastName: "asc" } },
      { member: { firstName: "asc" } },
    ],
    take: MAX_EXPORT_ROWS,
  });
  const header = ["Datum", "Beginn", "Termin", "Art", "Abteilung", "Nachname", "Vorname", "Status"];
  const body = rows.map((row) => [
    formatDate(row.event.startsAt),
    toTimeInputValue(row.event.startsAt),
    row.event.title,
    EVENT_TYPE_LABEL[row.event.type],
    row.event.department?.name ?? "Ganzer Verein",
    row.member.lastName,
    row.member.firstName,
    ATTENDANCE_RESULT_LABEL[row.status],
  ]);
  await recordAudit(ctx.db, auditActor(ctx), {
    action: "event.attendance_exported",
    entityType: "Event",
    summary: `Anwesenheitsliste als CSV exportiert (${rows.length} ${rows.length === 1 ? "Eintrag" : "Einträge"})`,
    changes: { anzahl: { to: rows.length } },
  });
  return {
    csv: toCsv(header, body),
    filename: `anwesenheit-${toDateInputValue(now)}.csv`,
    count: rows.length,
  };
}

// ---------------------------------------------------------------------------------------------
// Mitgliedsseite
// ---------------------------------------------------------------------------------------------

export interface MemberAttendanceSummary extends AttendanceCounts {
  total: number;
  rate: number | null;
  /** Die letzten zehn erfassten Termine, neueste zuerst. */
  recent: {
    eventId: string;
    title: string;
    startsAt: Date;
    status: AttendanceStatus;
    /** Termin für alle sichtbar (veröffentlicht, abgeschlossen, abgesagt) – dann verlinkt. */
    linkable: boolean;
  }[];
}

/**
 * Anwesenheit eines Mitglieds: für die Person selbst vollständig, für Berechtigte (Recht für eine Abteilung des Mitglieds)
 * nur Termine in ihrer Reichweite. Sonst `null`.
 */
export async function memberAttendanceSummary(
  ctx: TenantContext,
  memberId: string,
): Promise<MemberAttendanceSummary | null> {
  const member = await ctx.db.member.findFirst({
    where: { id: memberId },
    select: { id: true, anonymizedAt: true, departments: { select: { departmentId: true } } },
  });
  // Anonymisiert („Gelöschtes Mitglied“): keine Anwesenheit mehr zeigen, auch falls noch Zeilen übrig wären.
  if (!member || member.anonymizedAt) return null;
  const own = ctx.memberId !== null && ctx.memberId === member.id;
  if (!own && !can(ctx, MANAGE, { departmentIds: member.departments.map((d) => d.departmentId) }))
    return null;

  const where: Prisma.EventAttendanceWhereInput = {
    memberId: member.id,
    event: { deletedAt: null, ...(own ? {} : eventScope(ctx)) },
  };
  const [grouped, recent] = await Promise.all([
    ctx.db.eventAttendance.groupBy({ by: ["status"], where, _count: { _all: true } }),
    ctx.db.eventAttendance.findMany({
      where,
      orderBy: { event: { startsAt: "desc" } },
      take: 10,
      select: {
        status: true,
        event: { select: { id: true, title: true, startsAt: true, status: true } },
      },
    }),
  ]);
  const counts = countsFrom(grouped);
  return {
    ...counts,
    total: totalOf(counts),
    rate: attendanceRate(counts),
    recent: recent.map((row) => ({
      eventId: row.event.id,
      title: row.event.title,
      startsAt: row.event.startsAt,
      status: row.status,
      linkable: ["PUBLISHED", "COMPLETED", "CANCELLED"].includes(row.event.status),
    })),
  };
}
