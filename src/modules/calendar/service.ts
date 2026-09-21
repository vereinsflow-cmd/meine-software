import type { Prisma } from "@/generated/prisma/client";
import type { EventStatus, EventType, ParticipantStatus } from "@/generated/prisma/enums";
import { eventVisibilityWhere, loadVisibleEvent } from "@/modules/events/service";
import { assertCan, can } from "@/server/permissions/policy";
import type { TenantContext } from "@/server/tenancy/context-core";
import type { IcsEntry } from "./ics";

/**
 * Kalender – Lesezugriff auf Termine und eigene Helferschichten.
 *
 * Sichtbarkeit: exakt dieselbe wie in der Veranstaltungsliste (`eventVisibilityWhere`) – der Kalender schaltet nichts
 * zusätzlich frei. Archivierte Termine erscheinen nicht. Eigene Helferschichten sieht nur die eingeteilte Person.
 */
export interface CalendarFilters {
  type?: EventType;
  departmentId?: string;
  /** Nur Termine mit eigener Zu-/Warteliste-Anmeldung und eigene Schichten. */
  mine?: boolean;
}

export interface CalendarEntry {
  key: string;
  kind: "event" | "shift";
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  status: EventStatus;
  type: EventType | null;
  color: string | null;
  location: string | null;
  departmentName: string | null;
  href: string;
  myStatus: ParticipantStatus | null;
  /** Bei Schichten: Name der Veranstaltung. */
  subtitle: string | null;
}

/** Mehr als so viele Einträge in einem Zeitraum sind für eine Kalenderansicht nicht sinnvoll lesbar. */
export const CALENDAR_ENTRY_LIMIT = 500;

export async function listCalendarEntries(
  ctx: TenantContext,
  range: { from: Date; to: Date },
  filters: CalendarFilters = {},
): Promise<{ entries: CalendarEntry[]; truncated: boolean }> {
  assertCan(ctx, "events:read");

  const where: Prisma.EventWhereInput = {
    AND: [
      eventVisibilityWhere(ctx),
      { status: { not: "ARCHIVED" } },
      { startsAt: { lt: range.to }, endsAt: { gte: range.from } },
      filters.type ? { type: filters.type } : {},
      filters.departmentId ? { departmentId: filters.departmentId } : {},
      filters.mine
        ? ctx.memberId
          ? {
              participants: {
                some: { memberId: ctx.memberId, status: { in: ["ACCEPTED", "WAITLISTED"] } },
              },
            }
          : { id: "" }
        : {},
    ],
  };

  const includeShifts = ctx.memberId !== null && can(ctx, "shifts:read") && !filters.type;
  const [events, assignments] = await Promise.all([
    ctx.db.event.findMany({
      where,
      orderBy: [{ startsAt: "asc" }, { title: "asc" }],
      take: CALENDAR_ENTRY_LIMIT + 1,
      select: {
        id: true,
        title: true,
        type: true,
        status: true,
        startsAt: true,
        endsAt: true,
        allDay: true,
        locationName: true,
        department: { select: { name: true, color: true } },
        participants: ctx.memberId
          ? { where: { memberId: ctx.memberId }, select: { status: true } }
          : false,
      },
    }),
    includeShifts
      ? ctx.db.shiftAssignment.findMany({
          where: {
            memberId: ctx.memberId!,
            status: "CONFIRMED",
            shift: {
              deletedAt: null,
              status: { not: "CANCELLED" },
              startsAt: { lt: range.to },
              endsAt: { gte: range.from },
              event: {
                deletedAt: null,
                status: { in: ["PUBLISHED", "COMPLETED"] },
                ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
              },
            },
          },
          orderBy: { shift: { startsAt: "asc" } },
          take: CALENDAR_ENTRY_LIMIT,
          select: {
            shiftId: true,
            shift: {
              select: {
                title: true,
                startsAt: true,
                endsAt: true,
                meetingPoint: true,
                event: {
                  select: {
                    id: true,
                    title: true,
                    status: true,
                    department: { select: { color: true } },
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const truncated = events.length > CALENDAR_ENTRY_LIMIT;
  const entries: CalendarEntry[] = events.slice(0, CALENDAR_ENTRY_LIMIT).map((event) => ({
    key: `event-${event.id}`,
    kind: "event",
    id: event.id,
    title: event.title,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: event.allDay,
    status: event.status,
    type: event.type,
    color: event.department?.color ?? null,
    location: event.locationName,
    departmentName: event.department?.name ?? null,
    href: `/veranstaltungen/${event.id}`,
    myStatus: Array.isArray(event.participants) ? (event.participants[0]?.status ?? null) : null,
    subtitle: null,
  }));

  for (const assignment of assignments) {
    const { shift } = assignment;
    entries.push({
      key: `shift-${assignment.shiftId}`,
      kind: "shift",
      id: assignment.shiftId,
      title: `Schicht: ${shift.title}`,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      allDay: false,
      status: shift.event.status,
      type: null,
      color: shift.event.department?.color ?? null,
      location: shift.meetingPoint,
      departmentName: null,
      href: `/helferplanung/${shift.event.id}`,
      myStatus: null,
      subtitle: shift.event.title,
    });
  }

  entries.sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.title.localeCompare(b.title, "de"),
  );
  return { entries, truncated };
}

/** Abteilungen für den Filter (nur Namen und Farben). */
export async function listCalendarDepartments(
  ctx: TenantContext,
): Promise<{ id: string; name: string }[]> {
  assertCan(ctx, "events:read");
  return ctx.db.department.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
    take: 200,
  });
}

// ---------------------------------------------------------------------------------------------
// iCal
// ---------------------------------------------------------------------------------------------

const toIcsStatus = (status: EventStatus): IcsEntry["status"] =>
  status === "ARCHIVED" ? "COMPLETED" : status;

/** Beschreibung für Kalender-Apps: nur öffentlich sichtbare Angaben, keine internen Hinweise. */
function describe(event: { description: string | null; address: string | null }): string | null {
  const parts = [
    event.description?.trim(),
    event.address ? `Adresse: ${event.address}` : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

/** Ein einzelner Termin als iCal-Eintrag – nur, wenn der Benutzer ihn sehen darf (sonst "nicht gefunden"). */
export async function getEventIcsEntry(
  ctx: TenantContext,
  eventId: string,
  appUrl: string,
): Promise<IcsEntry> {
  assertCan(ctx, "events:read");
  const event = await loadVisibleEvent(ctx, eventId);
  return {
    uid: `event-${event.id}`,
    title: event.title,
    description: describe(event),
    location: [event.locationName, event.address].filter(Boolean).join(", ") || null,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: event.allDay,
    status: toIcsStatus(event.status),
    url: `${appUrl}/veranstaltungen/${event.id}`,
    updatedAt: event.updatedAt,
  };
}

/** Persönlicher Kalender-Feed: Termine der letzten 30 Tage bis 12 Monate voraus plus eigene Schichten. */
export async function getFeedIcsEntries(
  ctx: TenantContext,
  appUrl: string,
  now: Date = new Date(),
): Promise<IcsEntry[]> {
  assertCan(ctx, "events:read");
  const from = new Date(now.getTime() - 30 * 86_400_000);
  const to = new Date(now.getTime() + 366 * 86_400_000);
  const where: Prisma.EventWhereInput = {
    AND: [
      eventVisibilityWhere(ctx),
      { status: { in: ["PUBLISHED", "COMPLETED", "CANCELLED"] } },
      { startsAt: { lt: to }, endsAt: { gte: from } },
    ],
  };
  const includeShifts = ctx.memberId !== null && can(ctx, "shifts:read");
  const [events, assignments] = await Promise.all([
    ctx.db.event.findMany({ where, orderBy: { startsAt: "asc" }, take: 1000 }),
    includeShifts
      ? ctx.db.shiftAssignment.findMany({
          where: {
            memberId: ctx.memberId!,
            status: "CONFIRMED",
            shift: {
              deletedAt: null,
              status: { not: "CANCELLED" },
              startsAt: { lt: to },
              endsAt: { gte: from },
              event: { deletedAt: null, status: { in: ["PUBLISHED", "COMPLETED"] } },
            },
          },
          take: 500,
          select: {
            shiftId: true,
            shift: {
              select: {
                title: true,
                startsAt: true,
                endsAt: true,
                meetingPoint: true,
                updatedAt: true,
                event: { select: { id: true, title: true } },
              },
            },
          },
        })
      : Promise.resolve([]),
  ]);

  const entries: IcsEntry[] = events.map((event) => ({
    uid: `event-${event.id}`,
    title: event.title,
    description: describe(event),
    location: [event.locationName, event.address].filter(Boolean).join(", ") || null,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    allDay: event.allDay,
    status: toIcsStatus(event.status),
    url: `${appUrl}/veranstaltungen/${event.id}`,
    updatedAt: event.updatedAt,
  }));
  for (const { shiftId, shift } of assignments) {
    entries.push({
      uid: `shift-${shiftId}`,
      title: `Helferschicht: ${shift.title} (${shift.event.title})`,
      description: shift.meetingPoint ? `Treffpunkt: ${shift.meetingPoint}` : null,
      location: shift.meetingPoint,
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      allDay: false,
      status: "PUBLISHED",
      url: `${appUrl}/helferplanung/${shift.event.id}`,
      updatedAt: shift.updatedAt,
    });
  }
  return entries;
}
