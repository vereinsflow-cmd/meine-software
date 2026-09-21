import "server-only";
import { formatDateShort, formatTime, formatTimeRange } from "@/lib/dates";
import { notifyUsers } from "@/modules/notifications/service";
import { prisma } from "@/server/db/client";
import { createTenantDb } from "@/server/db/tenant";

/**
 * Erinnerungen für Helferschichten und Veranstaltungen – 24 Stunden vorher, als Benachrichtigung und (wenn die Person
 * E-Mails wünscht) per E-Mail.
 *
 * Doppelte Erinnerungen werden auf zwei Wegen verhindert: `reminderSentAt` an der Eintragung und – als Sicherheitsnetz –
 * der eindeutige Schlüssel (Benutzer, `dedupeKey`) der Benachrichtigung. Läuft ein Job zweimal oder bricht er mittendrin
 * ab, entstehen keine Duplikate.
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
  for (const row of rows) byShift.set(row.shiftId, [...(byShift.get(row.shiftId) ?? []), row]);

  for (const group of byShift.values()) {
    const first = group[0]!;
    const assignmentByUser = new Map(group.map((row) => [row.member.userId!, row.id]));
    const { shift } = first;
    await notifyUsers(createTenantDb(first.clubId), first.clubId, {
      userIds: [...assignmentByUser.keys()],
      type: "SHIFT_REMINDER",
      title: `Erinnerung: ${shift.title} – ${shift.event.title}`,
      body: `${formatDateShort(shift.startsAt)}, ${formatTimeRange(shift.startsAt, shift.endsAt)}${shift.meetingPoint ? `. Treffpunkt: ${shift.meetingPoint}` : ""}`,
      linkUrl: `/helferplanung/${shift.event.id}`,
      email: true,
      dedupeKey: (userId) => `shift-reminder:${assignmentByUser.get(userId)}:24h`,
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

/** Erinnerung an zugesagte Veranstaltungen. Gibt die Zahl der erzeugten Benachrichtigungen zurück. */
export async function sendEventReminders(now: Date = new Date()): Promise<number> {
  const events = await prisma.event.findMany({
    where: {
      deletedAt: null,
      status: "PUBLISHED",
      startsAt: { gt: now, lte: new Date(now.getTime() + REMINDER_LEAD_HOURS * HOUR) },
      club: { status: "ACTIVE" },
      participants: { some: { status: "ACCEPTED" } },
    },
    select: {
      id: true,
      clubId: true,
      title: true,
      startsAt: true,
      endsAt: true,
      allDay: true,
      locationName: true,
      participants: {
        where: { status: "ACCEPTED", member: { userId: { not: null } } },
        select: { member: { select: { userId: true } } },
      },
    },
    orderBy: { startsAt: "asc" },
    take: 200,
  });

  let created = 0;
  for (const event of events) {
    const userIds = event.participants
      .map((participant) => participant.member.userId!)
      .filter(Boolean);
    if (userIds.length === 0) continue;
    const when = event.allDay
      ? `${formatDateShort(event.startsAt)}, ganztägig`
      : `${formatDateShort(event.startsAt)}, ${formatTime(event.startsAt)} Uhr`;
    created += await notifyUsers(createTenantDb(event.clubId), event.clubId, {
      userIds,
      type: "EVENT_REMINDER",
      title: `Erinnerung: ${event.title}`,
      body: `${when}${event.locationName ? ` · ${event.locationName}` : ""}`,
      linkUrl: `/veranstaltungen/${event.id}`,
      email: true,
      dedupeKey: () => `event-reminder:${event.id}:24h`,
    });
  }
  return created;
}
