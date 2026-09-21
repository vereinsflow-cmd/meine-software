import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendPendingEmails, MAIL_RETRY_HOURS } from "@/server/jobs/mail-queue";
import { completePastEvents } from "@/server/jobs/events";
import { purgeStaleData } from "@/server/jobs/cleanup";
import { runJobs } from "@/server/jobs/runner";
import { sendEventReminders, sendShiftReminders } from "@/server/jobs/reminders";
import { applyRetention } from "@/server/jobs/retention";
import { hashToken } from "@/server/security/tokens";
import { prisma } from "@/server/db/client";
import type { MailMessage } from "@/server/mail";
import {
  addUserToClub,
  createClub,
  createDepartment,
  createEvent,
  createShift,
} from "../helpers/factories";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms);
const inMs = (ms: number) => new Date(Date.now() + ms);

async function clubWithPeople() {
  const club = await createClub("Jobverein");
  const helper = await addUserToClub(club, "HELPER", { firstName: "Hanna", lastName: "Helfer" });
  const helper2 = await addUserToClub(club, "HELPER", { firstName: "Heinz", lastName: "Helfer" });
  return { club, helper, helper2 };
}

const notes = (userId: string) =>
  prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });

describe("Schicht-Erinnerungen", () => {
  it("erinnert 24 Stunden vorher – genau einmal, mit Treffpunkt, Link und vorgemerkter E-Mail", async () => {
    const { club, helper, helper2 } = await clubWithPeople();
    const event = await createEvent(club.id, {
      title: "Sommerfest",
      startsAt: inMs(19 * HOUR),
      endsAt: inMs(30 * HOUR),
    });
    const shift = await createShift(club.id, event.id, {
      title: "Aufbau",
      startsAt: inMs(20 * HOUR),
      endsAt: inMs(23 * HOUR),
      requiredCount: 3,
    });
    await prisma.eventShift.update({
      where: { id: shift.id },
      data: { meetingPoint: "Vereinsheim" },
    });
    for (const person of [helper, helper2]) {
      await prisma.shiftAssignment.create({
        data: {
          clubId: club.id,
          shiftId: shift.id,
          memberId: person.member.id,
          assignedAt: ago(3 * DAY),
        },
      });
    }

    expect(await sendShiftReminders()).toBe(2);
    const [reminder] = await notes(helper.user.id);
    expect(reminder).toMatchObject({
      type: "SHIFT_REMINDER",
      title: "Erinnerung: Aufbau – Sommerfest",
      linkUrl: `/helferplanung/${event.id}`,
      emailStatus: "PENDING",
    });
    expect(reminder!.body).toContain("Treffpunkt: Vereinsheim");
    expect(reminder!.dedupeKey).toMatch(/^shift-reminder:.+:24h$/);
    expect(
      await prisma.shiftAssignment.count({
        where: { shiftId: shift.id, reminderSentAt: { not: null } },
      }),
    ).toBe(2);
    expect(await notes(helper2.user.id)).toHaveLength(1);

    // Zweiter Lauf: keine Duplikate.
    expect(await sendShiftReminders()).toBe(0);
    expect(await notes(helper.user.id)).toHaveLength(1);
  });

  it("dedupeKey ist das Sicherheitsnetz: selbst wenn reminderSentAt zurückgesetzt wird, entsteht keine zweite Benachrichtigung", async () => {
    const { club, helper } = await clubWithPeople();
    const event = await createEvent(club.id, { startsAt: inMs(19 * HOUR) });
    const shift = await createShift(club.id, event.id, {
      startsAt: inMs(20 * HOUR),
      endsAt: inMs(22 * HOUR),
    });
    await prisma.shiftAssignment.create({
      data: {
        clubId: club.id,
        shiftId: shift.id,
        memberId: helper.member.id,
        assignedAt: ago(2 * DAY),
      },
    });
    await sendShiftReminders();
    await prisma.shiftAssignment.updateMany({
      where: { shiftId: shift.id },
      data: { reminderSentAt: null },
    });
    await sendShiftReminders();
    expect(await notes(helper.user.id)).toHaveLength(1);
  });

  it("sendet keine Erinnerung für: zu früh, schon begonnen, abgesagt, Entwurf, gelöscht, ausgetragen, kürzlich eingetragen, ohne Konto, deaktivierten Verein", async () => {
    const { club, helper } = await clubWithPeople();
    const assign = (
      shiftId: string,
      memberId: string,
      extra: { assignedAt?: Date; status?: "CANCELLED" } = {},
    ) =>
      prisma.shiftAssignment.create({
        data: {
          clubId: club.id,
          shiftId,
          memberId,
          assignedAt: extra.assignedAt ?? ago(3 * DAY),
          status: extra.status ?? "CONFIRMED",
        },
      });
    const published = await createEvent(club.id, { title: "Fest", startsAt: inMs(10 * HOUR) });
    const mk = (title: string, startsInMs: number) =>
      createShift(club.id, published.id, {
        title,
        startsAt: inMs(startsInMs),
        endsAt: inMs(startsInMs + 30 * 60_000),
      });

    // Jede Person darf zur selben Zeit nur einmal eingetragen sein (Trigger) – daher je Fall ein eigenes Mitglied.
    const person = async (n: number) =>
      (await addUserToClub(club, "HELPER", { firstName: `P${n}`, lastName: "Test" })).member;
    const tooEarly = await mk("Zu früh", 30 * HOUR);
    await assign(tooEarly.id, (await person(1)).id);
    const started = await createShift(club.id, published.id, {
      title: "Läuft",
      startsAt: ago(HOUR),
      endsAt: inMs(HOUR),
    });
    await assign(started.id, (await person(2)).id);
    const cancelledShift = await mk("Abgesagt", 5 * HOUR);
    await prisma.eventShift.update({
      where: { id: cancelledShift.id },
      data: { status: "CANCELLED" },
    });
    await assign(cancelledShift.id, (await person(3)).id);
    const deletedShift = await mk("Gelöscht", 6 * HOUR);
    await prisma.eventShift.update({
      where: { id: deletedShift.id },
      data: { deletedAt: new Date() },
    });
    await assign(deletedShift.id, (await person(4)).id);
    const cancelledAssignment = await mk("Ausgetragen", 7 * HOUR);
    await assign(cancelledAssignment.id, (await person(5)).id, { status: "CANCELLED" });
    const recent = await mk("Eben erst", 8 * HOUR);
    await assign(recent.id, (await person(6)).id, { assignedAt: ago(HOUR) });
    const noAccount = await mk("Ohne Konto", 9 * HOUR);
    const memberWithoutAccount = await prisma.member.create({
      data: { clubId: club.id, firstName: "Ohne", lastName: "Konto" },
    });
    await assign(noAccount.id, memberWithoutAccount.id);

    const draft = await prisma.event.create({
      data: {
        clubId: club.id,
        title: "Entwurf",
        status: "DRAFT",
        startsAt: inMs(10 * HOUR),
        endsAt: inMs(12 * HOUR),
      },
    });
    const draftShift = await createShift(club.id, draft.id, {
      title: "Im Entwurf",
      startsAt: inMs(10 * HOUR),
      endsAt: inMs(11 * HOUR),
    });
    await assign(draftShift.id, (await person(7)).id);
    const cancelledEvent = await prisma.event.create({
      data: {
        clubId: club.id,
        title: "Abgesagt",
        status: "CANCELLED",
        startsAt: inMs(10 * HOUR),
        endsAt: inMs(12 * HOUR),
      },
    });
    const cancelledEventShift = await createShift(club.id, cancelledEvent.id, {
      title: "Beim abgesagten Fest",
      startsAt: inMs(10 * HOUR),
      endsAt: inMs(11 * HOUR),
    });
    await assign(cancelledEventShift.id, (await person(8)).id);

    const other = await createClub("Deaktiviert");
    const otherHelper = await addUserToClub(other, "HELPER");
    const otherEvent = await createEvent(other.id, { startsAt: inMs(10 * HOUR) });
    const otherShift = await createShift(other.id, otherEvent.id, {
      startsAt: inMs(10 * HOUR),
      endsAt: inMs(12 * HOUR),
    });
    await prisma.shiftAssignment.create({
      data: {
        clubId: other.id,
        shiftId: otherShift.id,
        memberId: otherHelper.member.id,
        assignedAt: ago(3 * DAY),
      },
    });
    await prisma.club.update({ where: { id: other.id }, data: { status: "DEACTIVATED" } });

    void helper;
    expect(await sendShiftReminders()).toBe(0);
    expect(
      await prisma.notification.count({
        where: { clubId: { in: [club.id, other.id] }, type: "SHIFT_REMINDER" },
      }),
    ).toBe(0);
  });

  it("Personen, die keine E-Mails wünschen, bekommen die Benachrichtigung, aber keine E-Mail", async () => {
    const { club, helper } = await clubWithPeople();
    await prisma.user.update({
      where: { id: helper.user.id },
      data: { emailNotifications: false },
    });
    const event = await createEvent(club.id, { startsAt: inMs(19 * HOUR) });
    const shift = await createShift(club.id, event.id, {
      startsAt: inMs(20 * HOUR),
      endsAt: inMs(22 * HOUR),
    });
    await prisma.shiftAssignment.create({
      data: {
        clubId: club.id,
        shiftId: shift.id,
        memberId: helper.member.id,
        assignedAt: ago(2 * DAY),
      },
    });
    await sendShiftReminders();
    expect(await notes(helper.user.id)).toMatchObject([
      { type: "SHIFT_REMINDER", emailStatus: "NONE" },
    ]);
  });
});

describe("Veranstaltungs-Erinnerungen", () => {
  it("erinnert nur Personen mit Zusage – einmalig", async () => {
    const { club, helper, helper2 } = await clubWithPeople();
    const declined = await addUserToClub(club, "MEMBER");
    const event = await createEvent(club.id, {
      title: "Vorstandssitzung",
      startsAt: inMs(20 * HOUR),
      endsAt: inMs(22 * HOUR),
    });
    await prisma.event.update({ where: { id: event.id }, data: { locationName: "Vereinsheim" } });
    await prisma.eventParticipant.createMany({
      data: [
        { clubId: club.id, eventId: event.id, memberId: helper.member.id, status: "ACCEPTED" },
        { clubId: club.id, eventId: event.id, memberId: helper2.member.id, status: "WAITLISTED" },
        { clubId: club.id, eventId: event.id, memberId: declined.member.id, status: "DECLINED" },
      ],
    });
    const far = await createEvent(club.id, { title: "Weit weg", startsAt: inMs(5 * DAY) });
    await prisma.eventParticipant.create({
      data: { clubId: club.id, eventId: far.id, memberId: helper.member.id, status: "ACCEPTED" },
    });

    expect(await sendEventReminders()).toBe(1);
    expect(await notes(helper.user.id)).toMatchObject([
      {
        type: "EVENT_REMINDER",
        title: "Erinnerung: Vorstandssitzung",
        linkUrl: `/veranstaltungen/${event.id}`,
        emailStatus: "PENDING",
      },
    ]);
    expect((await notes(helper.user.id))[0]!.body).toContain("Vereinsheim");
    expect(await notes(helper2.user.id)).toHaveLength(0);
    expect(await notes(declined.user.id)).toHaveLength(0);
    expect(await sendEventReminders()).toBe(0);
  });
});

describe("E-Mail-Warteschlange", () => {
  // Die Warteschlange ist bewusst global (alle Vereine). Frühere Tests dieser Datei haben vorgemerkte E-Mails
  // hinterlassen – für die Zählungen hier beginnen wir mit einer leeren Warteschlange.
  beforeEach(async () => {
    await prisma.notification.updateMany({
      where: { emailStatus: "PENDING" },
      data: { emailStatus: "NONE" },
    });
  });

  const queued = async (
    clubId: string,
    userId: string,
    title = "Erinnerung",
    createdAt: Date = new Date(),
  ) =>
    prisma.notification.create({
      data: {
        clubId,
        userId,
        type: "SYSTEM",
        title,
        body: "Details",
        linkUrl: "/helferplanung/x",
        emailStatus: "PENDING",
        createdAt,
      },
    });

  it("versendet vorgemerkte Nachrichten mit Link, markiert sie als gesendet und sendet nichts doppelt", async () => {
    const { club, helper } = await clubWithPeople();
    const row = await queued(club.id, helper.user.id, "Erinnerung: Aufbau");
    const send = vi.fn<(message: MailMessage) => Promise<void>>().mockResolvedValue(undefined);

    expect(await sendPendingEmails({ send })).toEqual({ sent: 1, failed: 0, skipped: 0, retry: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0]![0];
    expect(message.to).toBe(helper.user.email);
    expect(message.subject).toBe("[Jobverein] Erinnerung: Aufbau");
    expect(message.text).toContain("http://localhost:3000/helferplanung/x");
    expect(message.html).toContain("http://localhost:3000/helferplanung/x");
    expect(await prisma.notification.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
      emailStatus: "SENT",
      emailSentAt: expect.any(Date),
    });

    expect(await sendPendingEmails({ send })).toEqual({ sent: 0, failed: 0, skipped: 0, retry: 0 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("prüft vor dem Versand erneut: abgeschaltete E-Mails, gesperrtes Konto, ausgesetzte Mitgliedschaft, deaktivierter Verein", async () => {
    const { club, helper, helper2 } = await clubWithPeople();
    const noMail = await addUserToClub(club, "MEMBER");
    const suspended = await addUserToClub(club, "MEMBER");
    const rows = [
      await queued(club.id, noMail.user.id),
      await queued(club.id, helper.user.id),
      await queued(club.id, suspended.user.id),
      await queued(club.id, helper2.user.id),
    ];
    await prisma.user.update({
      where: { id: noMail.user.id },
      data: { emailNotifications: false },
    });
    await prisma.user.update({ where: { id: helper.user.id }, data: { disabledAt: new Date() } });
    await prisma.clubMembership.update({
      where: { id: suspended.membershipId },
      data: { status: "SUSPENDED" },
    });
    const send = vi.fn().mockResolvedValue(undefined);

    // helper2 ist in Ordnung → wird gesendet; die anderen drei werden übersprungen.
    expect(await sendPendingEmails({ send })).toEqual({ sent: 1, failed: 0, skipped: 3, retry: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      (
        await prisma.notification.findMany({
          where: { id: { in: rows.map((r) => r.id) } },
          orderBy: { id: "asc" },
        })
      ).map((r) => r.emailStatus),
    ).toEqual(["NONE", "NONE", "NONE", "SENT"]);

    const other = await clubWithPeople();
    const inactive = await queued(other.club.id, other.helper.user.id);
    await prisma.club.update({ where: { id: other.club.id }, data: { status: "DEACTIVATED" } });
    expect(await sendPendingEmails({ send })).toMatchObject({ skipped: 1, sent: 0 });
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: inactive.id } })).emailStatus,
    ).toBe("NONE");
  });

  it("bei Fehlern: erneut versuchen, nach sechs Stunden aufgeben – ohne Adresse oder Inhalt im Protokoll", async () => {
    const { club, helper, helper2 } = await clubWithPeople();
    const young = await queued(club.id, helper.user.id, "Frisch");
    const old = await queued(club.id, helper2.user.id, "Alt", ago((MAIL_RETRY_HOURS + 1) * HOUR));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const send = vi
      .fn()
      .mockRejectedValue(new Error(`SMTP nicht erreichbar für ${helper.user.email}`));

    expect(await sendPendingEmails({ send })).toEqual({ sent: 0, failed: 1, skipped: 0, retry: 1 });
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: young.id } })).emailStatus,
    ).toBe("PENDING");
    expect(
      (await prisma.notification.findUniqueOrThrow({ where: { id: old.id } })).emailStatus,
    ).toBe("FAILED");
    const logged = error.mock.calls.flat().join(" ");
    expect(logged).toContain("Versand fehlgeschlagen");
    expect(logged).not.toContain(helper.user.email);
    expect(logged).not.toContain("Frisch");
    error.mockRestore();

    // Beim nächsten Lauf klappt es.
    const ok = vi.fn().mockResolvedValue(undefined);
    expect(await sendPendingEmails({ send: ok })).toMatchObject({ sent: 1 });
  });

  it("Zeilenumbrüche im Titel gelangen nie in die Betreffzeile (Header-Injection)", async () => {
    const { club, helper } = await clubWithPeople();
    await queued(club.id, helper.user.id, "Neuer Titel\r\nBcc: angreifer@example.org");
    const send = vi.fn<(message: MailMessage) => Promise<void>>().mockResolvedValue(undefined);
    await sendPendingEmails({ send });
    expect(send.mock.calls[0]![0].subject).toBe(
      "[Jobverein] Neuer Titel Bcc: angreifer@example.org",
    );
    expect(send.mock.calls[0]![0].subject).not.toMatch(/[\r\n]/);
  });

  it("verarbeitet höchstens eine Charge pro Lauf, älteste zuerst", async () => {
    const { club, helper } = await clubWithPeople();
    for (let index = 0; index < 5; index += 1)
      await queued(club.id, helper.user.id, `Nachricht ${index}`, ago((10 - index) * 1000));
    const send = vi.fn<(message: MailMessage) => Promise<void>>().mockResolvedValue(undefined);
    expect(await sendPendingEmails({ send, batchSize: 3 })).toMatchObject({ sent: 3 });
    expect(send.mock.calls.map(([m]) => m.subject)).toEqual([
      "[Jobverein] Nachricht 0",
      "[Jobverein] Nachricht 1",
      "[Jobverein] Nachricht 2",
    ]);
    expect(await sendPendingEmails({ send, batchSize: 3 })).toMatchObject({ sent: 2 });
  });
});

describe("Aufräumen", () => {
  it("entfernt Altdaten, lässt Gültiges unberührt", async () => {
    const { club, helper } = await clubWithPeople();
    const userId = helper.user.id;
    // Die Datenbank verlangt expiresAt > createdAt – die Testsitzungen wurden "vor drei Tagen" angelegt.
    const session = (id: string, over: { expiresAt: Date; lastSeenAt: Date }) =>
      prisma.session.create({ data: { id, userId, createdAt: ago(3 * DAY), ...over } });
    await session("s-expired", { expiresAt: ago(HOUR), lastSeenAt: ago(2 * HOUR) });
    await session("s-idle", { expiresAt: inMs(5 * DAY), lastSeenAt: ago(3 * HOUR) }); // Leerlauf 60 min → nach 2 h aufgeräumt
    await session("s-valid", { expiresAt: inMs(5 * DAY), lastSeenAt: ago(5 * 60_000) });

    await prisma.rateLimitBucket.createMany({
      data: [
        { key: "old", count: 3, resetAt: ago(HOUR) },
        { key: "fresh", count: 1, resetAt: inMs(HOUR) },
      ],
    });
    const token = (name: string, over: { expiresAt: Date; usedAt?: Date }) =>
      prisma.verificationToken.create({
        data: { userId, type: "PASSWORD_RESET", tokenHash: hashToken(name), ...over },
      });
    await token("t-old-expired", { expiresAt: ago(8 * DAY) });
    await token("t-old-used", { expiresAt: inMs(DAY), usedAt: ago(8 * DAY) });
    await token("t-recent-expired", { expiresAt: ago(2 * DAY) });
    await token("t-valid", { expiresAt: inMs(HOUR) });

    const note = (
      title: string,
      over: { readAt?: Date | null; createdAt: Date; emailStatus?: "PENDING" | "NONE" },
    ) =>
      prisma.notification.create({
        data: {
          clubId: club.id,
          userId,
          type: "SYSTEM",
          title,
          readAt: over.readAt ?? null,
          createdAt: over.createdAt,
          emailStatus: over.emailStatus ?? "NONE",
        },
      });
    await note("gelesen alt", { readAt: ago(91 * DAY), createdAt: ago(100 * DAY) });
    await note("gelesen neu", { readAt: ago(10 * DAY), createdAt: ago(100 * DAY) });
    await note("ungelesen sehr alt", { createdAt: ago(181 * DAY) });
    await note("ungelesen alt, E-Mail steht aus", {
      createdAt: ago(181 * DAY),
      emailStatus: "PENDING",
    });
    await note("ungelesen neu", { createdAt: ago(30 * DAY) });

    const feed = (name: string, revokedAt: Date | null) =>
      prisma.calendarFeedToken.create({
        data: { clubId: club.id, userId, tokenHash: hashToken(name), revokedAt },
      });
    await feed("f-revoked-old", ago(31 * DAY));
    await feed("f-revoked-recent", ago(2 * DAY));
    await feed("f-active", null);

    const result = await purgeStaleData();
    expect(result).toMatchObject({
      sessions: 2,
      verificationTokens: 2,
      notifications: 2,
      feedTokens: 1,
    });
    expect(result.rateLimits).toBeGreaterThanOrEqual(1);

    expect((await prisma.session.findMany({ where: { userId } })).map((s) => s.id)).toEqual([
      "s-valid",
    ]);
    expect(await prisma.rateLimitBucket.findUnique({ where: { key: "fresh" } })).not.toBeNull();
    expect(await prisma.rateLimitBucket.findUnique({ where: { key: "old" } })).toBeNull();
    expect(
      (await prisma.notification.findMany({ where: { userId }, orderBy: { title: "asc" } })).map(
        (n) => n.title,
      ),
    ).toEqual(["gelesen neu", "ungelesen alt, E-Mail steht aus", "ungelesen neu"]);
    expect(await prisma.verificationToken.count({ where: { userId } })).toBe(2);
    expect(await prisma.calendarFeedToken.count({ where: { userId } })).toBe(2);

    expect(await purgeStaleData()).toMatchObject({
      sessions: 0,
      verificationTokens: 0,
      notifications: 0,
      feedTokens: 0,
    });
  });
});

describe("Veranstaltungen automatisch abschließen", () => {
  it("nur veröffentlichte Veranstaltungen, die seit mehr als 12 Stunden vorbei sind", async () => {
    const club = await createClub("Abschlussverein");
    const make = (
      title: string,
      over: {
        status?: "PUBLISHED" | "DRAFT" | "CANCELLED" | "ARCHIVED";
        endedAgoMs: number;
        deletedAt?: Date;
      },
    ) =>
      prisma.event.create({
        data: {
          clubId: club.id,
          title,
          status: over.status ?? "PUBLISHED",
          startsAt: ago(over.endedAgoMs + 2 * HOUR),
          endsAt: ago(over.endedAgoMs),
          deletedAt: over.deletedAt,
        },
      });
    const done = await make("Vorbei", { endedAgoMs: 13 * HOUR });
    await make("Gerade erst vorbei", { endedAgoMs: HOUR });
    await make("Entwurf", { status: "DRAFT", endedAgoMs: 3 * DAY });
    await make("Abgesagt", { status: "CANCELLED", endedAgoMs: 3 * DAY });
    await make("Archiviert", { status: "ARCHIVED", endedAgoMs: 3 * DAY });
    await make("Gelöscht", { endedAgoMs: 3 * DAY, deletedAt: new Date() });

    expect(await completePastEvents()).toBeGreaterThanOrEqual(1); // "Vorbei" – alle anderen erfüllen die Bedingungen nicht
    const status = async (title: string) =>
      (await prisma.event.findFirstOrThrow({ where: { clubId: club.id, title } })).status;
    expect(await status("Vorbei")).toBe("COMPLETED");
    expect(await status("Gerade erst vorbei")).toBe("PUBLISHED");
    expect(await status("Entwurf")).toBe("DRAFT");
    expect(await status("Abgesagt")).toBe("CANCELLED");
    expect(await status("Archiviert")).toBe("ARCHIVED");
    expect(await status("Gelöscht")).toBe("PUBLISHED"); // gelöschte Veranstaltungen bleiben unberührt

    const audit = await prisma.auditLog.findMany({
      where: { clubId: club.id, action: "event.auto_completed" },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorType: "SYSTEM", entityType: "Event", entityId: done.id });
  });
});

describe("Aufbewahrungsfristen", () => {
  const setRetention = (clubId: string, retention: Record<string, number>) =>
    prisma.club.update({ where: { id: clubId }, data: { settings: { retention } } });

  async function fullMember(
    clubId: string,
    overrides: {
      deletedAt?: Date;
      status?: "LEFT" | "ACTIVE";
      leftAt?: Date;
      firstName?: string;
      lastName?: string;
    } = {},
  ) {
    const dept = await createDepartment(clubId, `Abt-${Math.random().toString(36).slice(2, 8)}`);
    const member = await prisma.member.create({
      data: {
        clubId,
        firstName: overrides.firstName ?? "Max",
        lastName: overrides.lastName ?? "Muster",
        memberNumber: `N-${Math.random().toString(36).slice(2, 8)}`,
        email: "max@example.org",
        phone: "0123",
        street: "Weg 1",
        postalCode: "12345",
        city: "Musterstadt",
        birthDate: new Date(Date.UTC(1990, 4, 5)),
        clubFunction: "Kassenwart",
        internalNotes: "Geheim",
        archivedAt: overrides.deletedAt ? ago(40 * DAY) : null,
        deletedAt: overrides.deletedAt ?? null,
        status: overrides.status ?? "ACTIVE",
        leftAt: overrides.leftAt,
      },
    });
    await prisma.memberDepartment.create({
      data: { clubId, memberId: member.id, departmentId: dept.id },
    });
    await prisma.consent.create({
      data: { clubId, memberId: member.id, type: "NEWSLETTER", granted: true },
    });
    return member;
  }

  it("anonymisiert Mitglieder nach Ablauf der Papierkorb-Frist – vollständig und ohne andere zu berühren", async () => {
    const { club } = await clubWithPeople();
    const gone = await fullMember(club.id, { deletedAt: ago(31 * DAY) });
    const recent = await fullMember(club.id, {
      deletedAt: ago(10 * DAY),
      firstName: "Erna",
      lastName: "Frisch",
    });
    const active = await fullMember(club.id, { firstName: "Karl", lastName: "Aktiv" });
    await prisma.auditLog.createMany({
      data: [
        {
          clubId: club.id,
          action: "member.updated",
          entityType: "Member",
          entityId: gone.id,
          summary: "Mitglied Max Muster geändert",
          changes: { email: "geändert" },
        },
        {
          clubId: club.id,
          action: "shift.assigned",
          entityType: "ShiftAssignment",
          entityId: "x",
          summary: "Max Muster wurde für Aufbau eingeteilt",
        },
        {
          clubId: club.id,
          action: "member.updated",
          entityType: "Member",
          entityId: active.id,
          summary: "Mitglied Karl Aktiv geändert",
        },
      ],
    });

    expect(await applyRetention()).toMatchObject({ trashAnonymized: 1, leftAnonymized: 0 });

    const after = await prisma.member.findUniqueOrThrow({ where: { id: gone.id } });
    expect(after).toMatchObject({
      firstName: "Gelöschtes",
      lastName: "Mitglied",
      memberNumber: null,
      email: null,
      phone: null,
      street: null,
      postalCode: null,
      city: null,
      country: null,
      birthDate: null,
      clubFunction: null,
      internalNotes: null,
      userId: null,
      status: "LEFT",
    });
    expect(after.anonymizedAt).toBeInstanceOf(Date);
    expect(await prisma.consent.count({ where: { memberId: gone.id } })).toBe(0);
    expect(await prisma.memberDepartment.count({ where: { memberId: gone.id } })).toBe(0);

    // Andere Datensätze bleiben vollständig.
    expect(await prisma.member.findUniqueOrThrow({ where: { id: recent.id } })).toMatchObject({
      firstName: "Erna",
      email: "max@example.org",
      anonymizedAt: null,
    });
    expect(await prisma.member.findUniqueOrThrow({ where: { id: active.id } })).toMatchObject({
      firstName: "Karl",
      birthDate: expect.any(Date),
      anonymizedAt: null,
    });
    expect(await prisma.consent.count({ where: { memberId: active.id } })).toBe(1);

    // Änderungsprotokoll: Klarnamen und Details verschwinden, Nachweis (wer/wann/was) bleibt.
    const entries = await prisma.auditLog.findMany({
      where: { clubId: club.id },
      orderBy: { createdAt: "asc" },
    });
    const own = entries.find(
      (e) => e.entityType === "Member" && e.entityId === gone.id && e.action === "member.updated",
    )!;
    expect(own.summary).toBe("Mitglied (anonymisiert)");
    expect(own.changes).toBeNull();
    expect(entries.find((e) => e.action === "shift.assigned")!.summary).toBe(
      "Gelöschtes Mitglied wurde für Aufbau eingeteilt",
    );
    expect(entries.find((e) => e.entityId === active.id)!.summary).toBe(
      "Mitglied Karl Aktiv geändert",
    );
    const record = entries.find((e) => e.action === "member.anonymized")!;
    expect(record).toMatchObject({ actorType: "SYSTEM", entityId: gone.id });
    expect(record.summary).not.toContain("Muster");

    // Wiederholbar: nichts passiert ein zweites Mal.
    expect(await applyRetention()).toMatchObject({ trashAnonymized: 0 });
    expect(
      await prisma.auditLog.count({ where: { clubId: club.id, action: "member.anonymized" } }),
    ).toBe(1);
  });

  it("jeder Verein hat seine eigenen Fristen", async () => {
    const strict = await clubWithPeople();
    const lenient = await clubWithPeople();
    await setRetention(strict.club.id, { trashDays: 7 });
    const inStrict = await fullMember(strict.club.id, { deletedAt: ago(8 * DAY) });
    const inLenient = await fullMember(lenient.club.id, { deletedAt: ago(8 * DAY) }); // Standard 30 Tage
    await applyRetention();
    expect(
      (await prisma.member.findUniqueOrThrow({ where: { id: inStrict.id } })).anonymizedAt,
    ).not.toBeNull();
    expect(
      (await prisma.member.findUniqueOrThrow({ where: { id: inLenient.id } })).anonymizedAt,
    ).toBeNull();
  });

  it("ausgetretene Mitglieder: nach 24 Monaten (Standard), einstellbar, 0 = nie", async () => {
    const standard = await clubWithPeople();
    const never = await clubWithPeople();
    await setRetention(never.club.id, { leftMembersMonths: 0 });
    const months = (n: number) =>
      new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - n, 15));
    const longGone = await fullMember(standard.club.id, { status: "LEFT", leftAt: months(25) });
    const recentlyLeft = await fullMember(standard.club.id, { status: "LEFT", leftAt: months(12) });
    const neverPurged = await fullMember(never.club.id, { status: "LEFT", leftAt: months(60) });

    expect(await applyRetention()).toMatchObject({ leftAnonymized: 1 });
    const anonymized = async (id: string) =>
      (await prisma.member.findUniqueOrThrow({ where: { id } })).anonymizedAt !== null;
    expect(await anonymized(longGone.id)).toBe(true);
    expect(await anonymized(recentlyLeft.id)).toBe(false);
    expect(await anonymized(neverPurged.id)).toBe(false);
  });

  it("löscht Protokolleinträge nach Ablauf der Frist (nur diese Routine darf das), behält neuere", async () => {
    const { club } = await clubWithPeople();
    const other = await clubWithPeople();
    await setRetention(other.club.id, { auditMonths: 6 });
    const old = new Date(Date.UTC(new Date().getUTCFullYear() - 4, 0, 1)); // > 36 Monate
    const halfYearAgo = ago(200 * DAY); // > 6 Monate, < 36 Monate
    await prisma.auditLog.createMany({
      data: [
        { clubId: club.id, action: "a.old", entityType: "T", createdAt: old },
        { clubId: club.id, action: "a.middle", entityType: "T", createdAt: halfYearAgo },
        { clubId: club.id, action: "a.new", entityType: "T" },
        { clubId: other.club.id, action: "b.middle", entityType: "T", createdAt: halfYearAgo },
        { clubId: other.club.id, action: "b.new", entityType: "T" },
      ],
    });
    const result = await applyRetention();
    expect(result.auditDeleted).toBeGreaterThanOrEqual(2);
    const left = async (clubId: string) =>
      (await prisma.auditLog.findMany({ where: { clubId } })).map((e) => e.action).sort();
    expect(await left(club.id)).toEqual(["a.middle", "a.new"]);
    expect(await left(other.club.id)).toEqual(["b.new"]);
  });
});

describe("Job-Läufer", () => {
  it("führt ausgewählte Jobs aus und berichtet Ergebnis und Dauer", async () => {
    const summary = await runJobs({ only: ["events", "cleanup"] });
    expect(summary.ran).toBe(true);
    expect(summary.reports.map((r) => r.name)).toEqual(["events", "cleanup"]);
    for (const report of summary.reports) {
      expect(report).toMatchObject({ ok: true, durationMs: expect.any(Number) });
      expect(report.error).toBeUndefined();
    }
    expect(summary.reports[0]!.result).toEqual({ completed: expect.any(Number) });
  });

  it("überspringt den Lauf, wenn bereits ein anderer aktiv ist (Datenbank-Sperre)", async () => {
    const summary = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('vereinsflow:jobs'))`;
        return runJobs({ only: ["events"] });
      },
      { timeout: 30_000 },
    );
    expect(summary).toEqual({ ran: false, reports: [] });
    // Nach Freigabe läuft es wieder.
    expect((await runJobs({ only: ["events"] })).ran).toBe(true);
  });
});
