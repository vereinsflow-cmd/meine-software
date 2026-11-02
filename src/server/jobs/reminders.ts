import "server-only";
import { formatDateShort, formatTime, formatTimeRange } from "@/lib/dates";
import { notifyUsers } from "@/modules/notifications/service";
import { prisma } from "@/server/db/client";
import { createTenantDb } from "@/server/db/tenant";

/**
 * Erinnerungen für Helferschichten und Veranstaltungen – 24 Stunden vorher, als Benachrichtigung und (wenn die Person
 * E-Mails wünscht) per E-Mail.
 *
 * Doppelte Erinnerungen werden auf zwei Wegen verhindert: `reminderSentAt` an der Eintragung bzw. Zusage und – als
 * Sicherheitsnetz – der eindeutige Schlüssel (Benutzer, `dedupeKey`) der Benachrichtigung. Läuft ein Job zweimal oder
 * bricht er mittendrin ab, entstehen keine Duplikate. Der Schlüssel enthält den Beginn: Wird eine Schicht oder
 * Veranstaltung verschoben (und `reminderSentAt` dabei zurückgesetzt), gibt es vor dem neuen Termin wieder eine Erinnerung.
 */
const HOUR = 3_600_000;
export const REMINDER_LEAD_HOURS = 24;
/** Wer sich erst kurz vorher eingetragen hat, braucht keine Erinnerung an das, was er eben getan hat. */
export const MIN_HOURS_AFTER_SIGNUP = 6;

export async function sendShiftReminders(now: Date = new Date()): Promise<number> {
  const rows = await prisma.shiftAssignment.findMany({
    where: {
      status: "CONFIRMED",
      reminderSentAt: null,
      assignedAt: { lte: new Date(now.getTime() - MIN_HOURS_AFTER_SIGNUP * HOUR) },
      member: { userId: { not: null } },
      shift: {
        deletedAt: null,
        status: { not: "CANCELLED" },
        startsAt: { gt: now, lte: new Date(now.getTime() + REMINDER_LEAD_HOURS * HOUR) },
        event: { deletedAt: null, status: "PUBLISHED", club: { status: "ACTIVE" } },
      },
    },
    select: {
      id: true,
      clubId: true,
      shiftId: true,
      member: { select: { userId: true } },
      shift: {
        select: {
          title: true,
          startsAt: true,
          endsAt: true,
          meetingPoint: true,
          event: { select: { id: true, title: true } },
        },
      },
    },
    orderBy: { shift: { startsAt: "asc" } },
    take: 1000,
  });
  if (rows.length === 0) return 0;

  const byShift = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = byShift.get(row.shiftId);
    if (group) group.push(row);
    else byShift.set(row.shiftId, [row]);
  }

  for (const group of byShift.values()) {
    const first = group[0]!;
    const assignmentByUser = new Map(group.map((row) => [row.member.userId!, row.id]));
    const { shift } = first;
    await notifyUsers(createTenantDb(first.clubId), first.clubId, {
      userIds: [...assignmentByUser.keys()],
      type: "SHIFT_REMINDER",
      title: `Erinnerung: ${shift.title} – ${shift.event.title}`,
      body: `${formatDateShort(shift.startsAt)}, ${formatTimeRange(shift.startsAt, shift.endsAt)}${shift.meetingPoint ? `. Treffpunkt: ${shift.meetingPoint}` : ""}`,
      linkUrl: `/helferplanung/${shift.event.id}?schicht=${first.shiftId}`,
      email: true,
      dedupeKey: (userId) =>
        `shift-reminder:${assignmentByUser.get(userId)}:${shift.startsAt.toISOString()}:24h`,
    });
  }

  // Auch dann als erledigt markieren, wenn niemand benachrichtigt werden konnte (z. B. gesperrtes Konto) – sonst
  // würde der Job dieselben Zeilen bei jedem Lauf erneut prüfen.
  await prisma.shiftAssignment.updateMany({
    where: { id: { in: rows.map((row) => row.id) }, reminderSentAt: null },
    data: { reminderSentAt: now },
  });
  return rows.length;
}

/** Zusagen je Durchgang. Der Job arbeitet so lange Seiten ab, bis keine Zusage ohne Erinnerung mehr im Fenster liegt. */
const EVENT_REMINDER_PAGE = 1000;

/**
 * Erinnerung an zugesagte Veranstaltungen. Gibt die Zahl der erzeugten Benachrichtigungen zurück.
 *
 * Wie bei den Schichten nur Zusagen ohne `reminderSentAt` – erinnerte Zusagen fasst kein weiterer Lauf mehr an, und es gibt
 * keine feste Obergrenze, hinter der spätere Veranstaltungen erst verspätet drankämen.
 */
export async function sendEventReminders(now: Date = new Date()): Promise<number> {
  let created = 0;
  for (;;) {
    const rows = await prisma.eventParticipant.findMany({
      where: {
        status: "ACCEPTED",
        reminderSentAt: null,
        member: { userId: { not: null } },
        event: {
          deletedAt: null,
          status: "PUBLISHED",
          startsAt: { gt: now, lte: new Date(now.getTime() + REMINDER_LEAD_HOURS * HOUR) },
          club: { status: "ACTIVE" },
        },
      },
      select: {
        id: true,
        clubId: true,
        eventId: true,
        member: { select: { userId: true } },
        event: {
          select: { title: true, startsAt: true, allDay: true, locationName: true },
        },
      },
      orderBy: [{ event: { startsAt: "asc" } }, { id: "asc" }],
      take: EVENT_REMINDER_PAGE,
    });
    if (rows.length === 0) break;

    const byEvent = new Map<string, typeof rows>();
    for (const row of rows) {
      const group = byEvent.get(row.eventId);
      if (group) group.push(row);
      else byEvent.set(row.eventId, [row]);
    }

    for (const group of byEvent.values()) {
      const { clubId, eventId, event } = group[0]!;
      const when = event.allDay
        ? `${formatDateShort(event.startsAt)}, ganztägig`
        : `${formatDateShort(event.startsAt)}, ${formatTime(event.startsAt)} Uhr`;
      created += await notifyUsers(createTenantDb(clubId), clubId, {
        userIds: group.map((row) => row.member.userId!),
        type: "EVENT_REMINDER",
        title: `Erinnerung: ${event.title}`,
        body: `${when}${event.locationName ? ` · ${event.locationName}` : ""}`,
        linkUrl: `/veranstaltungen/${eventId}`,
        email: true,
        dedupeKey: () => `event-reminder:${eventId}:${event.startsAt.toISOString()}:24h`,
      });
    }

    // Wie bei den Schichten auch dann erledigt, wenn niemand benachrichtigt werden konnte (z. B. gesperrtes Konto).
    await prisma.eventParticipant.updateMany({
      where: { id: { in: rows.map((row) => row.id) }, reminderSentAt: null },
      data: { reminderSentAt: now },
    });
    // Jede Seite wird vollständig vermerkt – die nächste Abfrage liefert also nur noch Offene.
    if (rows.length < EVENT_REMINDER_PAGE) break;
  }
  return created;
}
