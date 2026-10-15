import { beforeEach, describe, expect, it, vi } from "vitest";

// Server Actions laufen hier ohne Next.js: Cookies/Kopfzeilen der Anfrage und das Neuladen des Caches werden ersetzt.
vi.mock("next/headers", async () => (await import("../helpers/next-request")).nextHeadersMock());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { revalidatePath } from "next/cache";
import type { AttendanceStatus, EventStatus } from "@/generated/prisma/enums";
import { saveAttendanceAction } from "@/modules/events/actions";
import {
  attendanceFilterOptions,
  attendanceStats,
  exportAttendanceCsv,
  getAttendanceSheet,
  getEventAttendanceSummary,
  memberAttendanceSummary,
  saveAttendance,
} from "@/modules/events/attendance";
import { prisma } from "@/server/db/client";
import { applyRetention } from "@/server/jobs/retention";
import { anonymizeMemberData } from "@/server/privacy/anonymize";
import { executeDeletionRequest } from "@/server/privacy/deletion";
import { buildUserDataExport } from "@/server/privacy/export";
import {
  addUserToClub,
  contextFor,
  createClub,
  createDepartment,
  createMember,
} from "../helpers/factories";
import { loginAs, request } from "../helpers/next-request";

/**
 * Anwesenheit bei Terminen (vor allem Training): Erfassen und Entfernen, unabhängig von Zu- und Absagen, Rechte je
 * Abteilung, Auswertung nur in der eigenen Reichweite, Zeitfenster, Mandantentrennung, Datenexport, Kontolöschung,
 * Aufbewahrung und ein Protokoll nur mit Zahlen.
 *
 * Die Zeit ist fest: Die Dienste bekommen `NOW` übergeben, alle Termine liegen relativ dazu. Nur der Test der Server
 * Action rechnet mit der echten Uhr (die Action nimmt die aktuelle Zeit) – dort liegt der Termin zwei Stunden zurück.
 */
const NOW = new Date("2026-10-14T16:00:00.000Z"); // Mittwoch, 18:00 Uhr in Berlin (Sommerzeit)
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const at = (offset: number) => new Date(NOW.getTime() + offset);

beforeEach(() => {
  request.token = null;
  vi.mocked(revalidatePath).mockClear();
});

async function setup(name = "Anwesenheitsverein") {
  const club = await createClub(name);
  const fussball = await createDepartment(club.id, "Fußball");
  const handball = await createDepartment(club.id, "Handball");
  const admin = await addUserToClub(club, "CLUB_ADMIN", { firstName: "Anna", lastName: "Admin" });
  const board = await addUserToClub(club, "BOARD", { firstName: "Bernd", lastName: "Vorstand" });
  const leadF = await addUserToClub(club, "DEPARTMENT_LEAD", {
    firstName: "Tamara",
    lastName: "Trainerin",
    ledDepartmentIds: [fussball.id],
  });
  const leadH = await addUserToClub(club, "DEPARTMENT_LEAD", {
    firstName: "Hugo",
    lastName: "Hallenwart",
    ledDepartmentIds: [handball.id],
  });
  const mia = await addUserToClub(club, "MEMBER", { firstName: "Mia", lastName: "Mitglied" });
  const otto = await addUserToClub(club, "MEMBER", { firstName: "Otto", lastName: "Anders" });
  // Mitglieder ohne Konto: Lena nur Fußball, Ben in beiden Abteilungen, Hanna nur Handball.
  const lena = await createMember(club.id, { firstName: "Lena", lastName: "Läuferin" });
  const ben = await createMember(club.id, { firstName: "Ben", lastName: "Beide" });
  const hanna = await createMember(club.id, { firstName: "Hanna", lastName: "Werfer" });
  await prisma.memberDepartment.createMany({
    data: [
      { clubId: club.id, memberId: mia.member.id, departmentId: fussball.id },
      { clubId: club.id, memberId: lena.id, departmentId: fussball.id },
      { clubId: club.id, memberId: ben.id, departmentId: fussball.id },
      { clubId: club.id, memberId: ben.id, departmentId: handball.id },
      { clubId: club.id, memberId: hanna.id, departmentId: handball.id },
    ],
  });
  return {
    club,
    fussball,
    handball,
    people: { admin, board, leadF, leadH, mia, otto },
    members: { mia: mia.member, otto: otto.member, lena, ben, hanna },
    ctx: {
      admin: await contextFor(admin.user.id, club.id),
      board: await contextFor(board.user.id, club.id),
      leadF: await contextFor(leadF.user.id, club.id),
      leadH: await contextFor(leadH.user.id, club.id),
      mia: await contextFor(mia.user.id, club.id),
      otto: await contextFor(otto.user.id, club.id),
    },
  };
}

/** Training direkt in der Datenbank (Standard: veröffentlicht, vor zwei Stunden begonnen, 90 Minuten). */
function training(
  clubId: string,
  options: {
    title?: string;
    departmentId?: string | null;
    startsAt?: Date;
    status?: EventStatus;
    maxParticipants?: number;
    waitlistEnabled?: boolean;
  } = {},
) {
  const startsAt = options.startsAt ?? at(-2 * HOUR);
  return prisma.event.create({
    data: {
      clubId,
      title: options.title ?? "Training",
      type: "TRAINING",
      status: options.status ?? "PUBLISHED",
      startsAt,
      endsAt: new Date(startsAt.getTime() + 90 * MIN),
      departmentId: options.departmentId ?? null,
      maxParticipants: options.maxParticipants ?? null,
      registrationRequired: options.maxParticipants !== undefined,
      waitlistEnabled: options.waitlistEnabled ?? false,
    },
  });
}

const entries = (...rows: [memberId: string, status: AttendanceStatus | null][]) =>
  rows.map(([memberId, status]) => ({ memberId, status }));

/** Anwesenheit direkt in der Datenbank (für Auswertung, Aufbewahrung und Mandantentrennung). */
const record = (
  clubId: string,
  eventId: string,
  rows: [memberId: string, status: AttendanceStatus][],
) =>
  prisma.eventAttendance.createMany({
    data: rows.map(([memberId, status]) => ({ clubId, eventId, memberId, status })),
  });

/** Gespeicherte Zeilen eines Termins je Mitglied. */
async function stored(eventId: string) {
  const rows = await prisma.eventAttendance.findMany({ where: { eventId } });
  return Object.fromEntries(
    rows.map((row) => [
      row.memberId,
      { status: row.status, recordedById: row.recordedById, recordedAt: row.recordedAt },
    ]),
  );
}

const attendanceAudits = (clubId: string) =>
  prisma.auditLog.findMany({
    where: { clubId, action: "event.attendance_saved" },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

describe("Erfassen und Entfernen", () => {
  it("legt neue Einträge an, ändert nur Geänderte und entfernt Einträge mit null – mit „erfasst am/von“", async () => {
    const { club, fussball, people, members, ctx } = await setup();
    const event = await training(club.id, { departmentId: fussball.id });

    expect(
      await saveAttendance(
        ctx.admin,
        {
          eventId: event.id,
          entries: entries(
            [members.lena.id, "PRESENT"],
            [members.ben.id, "ABSENT"],
            [members.mia.id, "EXCUSED"],
          ),
        },
        NOW,
      ),
    ).toEqual({ present: 1, excused: 1, absent: 1, changed: 3 });
    expect(await stored(event.id)).toEqual({
      [members.lena.id]: { status: "PRESENT", recordedById: people.admin.user.id, recordedAt: NOW },
      [members.ben.id]: { status: "ABSENT", recordedById: people.admin.user.id, recordedAt: NOW },
      [members.mia.id]: { status: "EXCUSED", recordedById: people.admin.user.id, recordedAt: NOW },
    });

    // Zweite Runde durch den Vorstand: Lena unverändert, Ben geändert, Mia entfernt, Otto (nie erfasst) „entfernt“.
    const later = at(5 * MIN);
    expect(
      await saveAttendance(
        ctx.board,
        {
          eventId: event.id,
          entries: entries(
            [members.lena.id, "PRESENT"],
            [members.ben.id, "PRESENT"],
            [members.mia.id, null],
            [members.otto.id, null],
          ),
        },
        later,
      ),
    ).toEqual({ present: 2, excused: 0, absent: 0, changed: 2 });
    expect(await stored(event.id)).toEqual({
      // Unverändert: „erfasst am/von“ bleibt beim ersten Erfassen.
      [members.lena.id]: { status: "PRESENT", recordedById: people.admin.user.id, recordedAt: NOW },
      [members.ben.id]: {
        status: "PRESENT",
        recordedById: people.board.user.id,
        recordedAt: later,
      },
    });

    // Nichts geändert: nichts geschrieben, nichts protokolliert.
    expect(await attendanceAudits(club.id)).toHaveLength(2);
    expect(
      await saveAttendance(
        ctx.board,
        {
          eventId: event.id,
          entries: entries([members.lena.id, "PRESENT"], [members.mia.id, null]),
        },
        at(10 * MIN),
      ),
    ).toEqual({ present: 2, excused: 0, absent: 0, changed: 0 });
    expect((await stored(event.id))[members.lena.id]?.recordedAt).toEqual(NOW);
    expect(await attendanceAudits(club.id)).toHaveLength(2);

    // Karte auf der Veranstaltungsseite und Erfassungsliste zeigen den gespeicherten Stand.
    expect(await getEventAttendanceSummary(ctx.admin, event, NOW)).toMatchObject({
      counts: { present: 2, excused: 0, absent: 0 },
      total: 2,
      window: { open: true, reason: null },
    });
    const sheet = await getAttendanceSheet(ctx.admin, event.id, NOW);
    expect(sheet.rows).toEqual([
      {
        memberId: members.ben.id,
        name: "Beide, Ben",
        status: "PRESENT",
        saved: "PRESENT",
        rsvp: null,
      },
      {
        memberId: members.lena.id,
        name: "Läuferin, Lena",
        status: "PRESENT",
        saved: "PRESENT",
        rsvp: null,
      },
    ]);
  });
});

describe("Unabhängig von Zu- und Absagen", () => {
  it("wer abgesagt hat, kann anwesend sein; Teilnahmen, Warteliste und Teilnehmerlimit bleiben unverändert", async () => {
    const { club, fussball, members, ctx } = await setup();
    const event = await training(club.id, {
      departmentId: fussball.id,
      maxParticipants: 1,
      waitlistEnabled: true,
    });
    await prisma.eventParticipant.createMany({
      data: [
        { memberId: members.lena.id, status: "ACCEPTED" as const, respondedAt: at(-3 * DAY) },
        { memberId: members.ben.id, status: "WAITLISTED" as const, respondedAt: at(-2 * DAY) },
        { memberId: members.mia.id, status: "DECLINED" as const, respondedAt: at(-1 * DAY) },
      ].map((row) => ({ ...row, clubId: club.id, eventId: event.id })),
    });
    const participantsBefore = await prisma.eventParticipant.findMany({
      where: { eventId: event.id },
      orderBy: { memberId: "asc" },
    });
    const eventBefore = await prisma.event.findUniqueOrThrow({ where: { id: event.id } });

    // Vorschlag der Liste: Absage → „entschuldigt“, Zusage → offen; Wartende stehen (noch) nicht drauf.
    const before = await getAttendanceSheet(ctx.admin, event.id, NOW);
    expect(before.rows).toEqual([
      {
        memberId: members.lena.id,
        name: "Läuferin, Lena",
        status: null,
        saved: null,
        rsvp: "ACCEPTED",
      },
      {
        memberId: members.mia.id,
        name: "Mitglied, Mia",
        status: "EXCUSED",
        saved: null,
        rsvp: "DECLINED",
      },
    ]);

    expect(
      await saveAttendance(
        ctx.admin,
        {
          eventId: event.id,
          entries: entries(
            [members.mia.id, "PRESENT"], // hat abgesagt, kam aber doch
            [members.lena.id, "ABSENT"], // hat zugesagt, kam nicht
            [members.ben.id, "PRESENT"], // stand auf der Warteliste
          ),
        },
        NOW,
      ),
    ).toEqual({ present: 2, excused: 0, absent: 1, changed: 3 });

    // Teilnahmen, Warteliste und Limit: unverändert – niemand rückt nach, niemand wird benachrichtigt.
    expect(
      await prisma.eventParticipant.findMany({
        where: { eventId: event.id },
        orderBy: { memberId: "asc" },
      }),
    ).toEqual(participantsBefore);
    expect(await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).toEqual(eventBefore);
    expect(await prisma.notification.count({ where: { clubId: club.id } })).toBe(0);

    const after = await getAttendanceSheet(ctx.admin, event.id, NOW);
    expect(after.rows.map((r) => [r.name, r.saved, r.rsvp])).toEqual([
      ["Beide, Ben", "PRESENT", null],
      ["Läuferin, Lena", "ABSENT", "ACCEPTED"],
      ["Mitglied, Mia", "PRESENT", "DECLINED"],
    ]);
  });
});

describe("Rechte", () => {
  it("Abteilungsleiter erfassen nur Termine der eigenen Abteilung – fremde Abteilung und ganzer Verein werden abgelehnt", async () => {
    const { club, fussball, handball, members, ctx } = await setup();
    const own = await training(club.id, { departmentId: fussball.id });
    const other = await training(club.id, { departmentId: handball.id });
    const clubWide = await training(club.id, { departmentId: null });

    for (const event of [other, clubWide]) {
      await expect(
        saveAttendance(
          ctx.leadF,
          { eventId: event.id, entries: entries([members.ben.id, "PRESENT"]) },
          NOW,
        ),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(getAttendanceSheet(ctx.leadF, event.id, NOW)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(await getEventAttendanceSummary(ctx.leadF, event, NOW)).toBeNull();
    }
    await expect(
      saveAttendance(
        ctx.leadH,
        { eventId: own.id, entries: entries([members.ben.id, "PRESENT"]) },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await prisma.eventAttendance.count({ where: { clubId: club.id } })).toBe(0);

    expect(
      await saveAttendance(
        ctx.leadF,
        {
          eventId: own.id,
          entries: entries([members.lena.id, "PRESENT"], [members.ben.id, "EXCUSED"]),
        },
        NOW,
      ),
    ).toEqual({ present: 1, excused: 1, absent: 0, changed: 2 });
    expect(await getEventAttendanceSummary(ctx.leadF, own, NOW)).toMatchObject({ total: 2 });

    // „+ Person“ bietet nur Mitglieder der geleiteten Abteilung an (Hanna ist nur im Handball).
    const sheet = await getAttendanceSheet(ctx.leadF, own.id, NOW);
    expect(sheet.people.map((p) => p.name)).toEqual([
      "Beide, Ben",
      "Läuferin, Lena",
      "Mitglied, Mia",
      "Trainerin, Tamara",
    ]);
  });

  it("Personen außerhalb der Abteilung nur, wenn sie zu- oder abgesagt haben", async () => {
    const { club, fussball, members, ctx } = await setup();
    const own = await training(club.id, { departmentId: fussball.id });

    await expect(
      saveAttendance(
        ctx.leadF,
        { eventId: own.id, entries: entries([members.hanna.id, "PRESENT"]) },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await stored(own.id)).toEqual({});

    await prisma.eventParticipant.create({
      data: { clubId: club.id, eventId: own.id, memberId: members.hanna.id, status: "DECLINED" },
    });
    expect(
      await saveAttendance(
        ctx.leadF,
        { eventId: own.id, entries: entries([members.hanna.id, "PRESENT"]) },
        NOW,
      ),
    ).toMatchObject({ present: 1, changed: 1 });
  });

  it("einfache Mitglieder dürfen nicht erfassen und nichts auswerten – auch nicht für sich selbst", async () => {
    const { club, fussball, members, ctx } = await setup();
    const event = await training(club.id, { departmentId: fussball.id });

    await expect(
      saveAttendance(
        ctx.mia,
        { eventId: event.id, entries: entries([members.mia.id, "PRESENT"]) },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getAttendanceSheet(ctx.mia, event.id, NOW)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      attendanceStats(ctx.mia, { period: "12m", type: null }, NOW),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      exportAttendanceCsv(ctx.mia, { period: "12m", type: null }, NOW),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(attendanceFilterOptions(ctx.mia)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await getEventAttendanceSummary(ctx.mia, event, NOW)).toBeNull();
    expect(await stored(event.id)).toEqual({});
  });

  it("Server Action: ohne Anmeldung und als Mitglied abgelehnt, doppelte Personen ungültig, als Vorstand gespeichert", async () => {
    const { club, fussball, people, members } = await setup();
    // Die Action rechnet mit der echten Uhr – der Termin begann vor zwei Stunden.
    const event = await training(club.id, {
      departmentId: fussball.id,
      startsAt: new Date(Date.now() - 2 * HOUR),
    });
    const input = { eventId: event.id, entries: entries([members.lena.id, "PRESENT"]) };

    expect(await saveAttendanceAction(input)).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
    await loginAs(people.mia.user.id, club.id);
    expect(await saveAttendanceAction(input)).toMatchObject({
      ok: false,
      error: { code: "FORBIDDEN" },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(await stored(event.id)).toEqual({});

    await loginAs(people.board.user.id, club.id);
    expect(
      await saveAttendanceAction({
        eventId: event.id,
        entries: entries([members.lena.id, "PRESENT"], [members.lena.id, "ABSENT"]),
      }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await saveAttendanceAction(input)).toEqual({
      ok: true,
      data: { present: 1, excused: 0, absent: 0, changed: 1 },
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/veranstaltungen/${event.id}/anwesenheit`);
    expect(await stored(event.id)).toMatchObject({
      [members.lena.id]: { status: "PRESENT", recordedById: people.board.user.id },
    });
  });
});

describe("Auswertung", () => {
  it("Abteilungsleiter sehen nur Anwesenheit bei Terminen ihrer Abteilungen – gefiltert schon in der Abfrage", async () => {
    const { club, fussball, handball, members, ctx } = await setup();
    const f1 = await training(club.id, {
      title: "Fußball 1",
      departmentId: fussball.id,
      startsAt: at(-7 * DAY),
    });
    const f2 = await training(club.id, {
      title: "Fußball 2",
      departmentId: fussball.id,
      startsAt: at(-14 * DAY),
    });
    const h1 = await training(club.id, {
      title: "Handball 1",
      departmentId: handball.id,
      startsAt: at(-7 * DAY),
    });
    const c1 = await training(club.id, {
      title: "Vereinslauf",
      departmentId: null,
      startsAt: at(-3 * DAY),
    });
    await record(club.id, f1.id, [
      [members.lena.id, "PRESENT"],
      [members.ben.id, "PRESENT"],
      [members.mia.id, "ABSENT"],
    ]);
    await record(club.id, f2.id, [
      [members.lena.id, "EXCUSED"],
      [members.ben.id, "PRESENT"],
    ]);
    await record(club.id, h1.id, [
      [members.ben.id, "ABSENT"],
      [members.hanna.id, "PRESENT"],
    ]);
    await record(club.id, c1.id, [
      [members.lena.id, "PRESENT"],
      [members.hanna.id, "PRESENT"],
    ]);
    const row = (
      memberId: string,
      name: string,
      present: number,
      excused: number,
      absent: number,
    ) => {
      const total = present + excused + absent;
      return { memberId, name, present, excused, absent, total, rate: present / total };
    };

    // Administrator: ganzer Verein.
    expect(await attendanceStats(ctx.admin, { period: "12m", type: null }, NOW)).toMatchObject({
      rows: [
        row(members.ben.id, "Beide, Ben", 2, 0, 1),
        row(members.lena.id, "Läuferin, Lena", 2, 1, 0),
        row(members.mia.id, "Mitglied, Mia", 0, 0, 1),
        row(members.hanna.id, "Werfer, Hanna", 2, 0, 0),
      ],
      recordedEvents: 4,
      totals: { present: 6, excused: 1, absent: 2 },
      averagePresent: 1.5,
    });

    // Leitung Fußball: nur f1 und f2. Auch Zähler je Termin und Summen enthalten nichts von Handball oder Verein – die
    // Reichweite steckt also in der Abfrage, nicht in einer nachträglichen Auswahl der Zeilen.
    const leadStats = await attendanceStats(ctx.leadF, { period: "12m", type: "TRAINING" }, NOW);
    expect(leadStats).toMatchObject({
      rows: [
        row(members.ben.id, "Beide, Ben", 2, 0, 0),
        row(members.lena.id, "Läuferin, Lena", 1, 1, 0),
        row(members.mia.id, "Mitglied, Mia", 0, 0, 1),
      ],
      recordedEvents: 2,
      totals: { present: 3, excused: 1, absent: 1 },
      averagePresent: 1.5,
    });
    expect(leadStats.rows.map((r) => r.memberId)).not.toContain(members.hanna.id);

    // Fremde Abteilung als Filter: leer statt fremder Daten.
    expect(
      await attendanceStats(
        ctx.leadF,
        { period: "12m", type: null, departmentId: handball.id },
        NOW,
      ),
    ).toMatchObject({ rows: [], recordedEvents: 0, averagePresent: null });

    // Leitung Handball: nur h1.
    expect(
      (await attendanceStats(ctx.leadH, { period: "12m", type: null }, NOW)).rows.map((r) => [
        r.name,
        r.present,
        r.absent,
      ]),
    ).toEqual([
      ["Beide, Ben", 0, 1],
      ["Werfer, Hanna", 1, 0],
    ]);

    // Filterauswahl, CSV und Mitgliedsseite folgen derselben Reichweite.
    expect((await attendanceFilterOptions(ctx.leadF)).departments).toEqual([
      { id: fussball.id, name: "Fußball" },
    ]);
    const csv = await exportAttendanceCsv(ctx.leadF, { period: "12m", type: null }, NOW);
    expect(csv.count).toBe(5);
    expect(csv.csv).not.toContain("Werfer");
    expect(csv.csv).not.toContain("Handball 1");
    expect(csv.csv).not.toContain("Vereinslauf");
    expect(await memberAttendanceSummary(ctx.leadF, members.ben.id)).toMatchObject({
      present: 2,
      excused: 0,
      absent: 0,
      total: 2,
      recent: [
        { eventId: f1.id, status: "PRESENT" },
        { eventId: f2.id, status: "PRESENT" },
      ],
    });
    expect(await memberAttendanceSummary(ctx.leadF, members.hanna.id)).toBeNull();
  });

  it("Mitglieder sehen ihre eigene Anwesenheit (Zahlen und die letzten zehn Termine) – andere Mitglieder nicht", async () => {
    const { club, fussball, handball, members, ctx } = await setup();
    // Zwölf Fußball-Trainings (wöchentlich zurück) und ein Handball-Termin vor zwei Tagen.
    const statuses: AttendanceStatus[] = [
      "PRESENT",
      "PRESENT",
      "EXCUSED",
      "PRESENT",
      "ABSENT",
      "PRESENT",
      "PRESENT",
      "EXCUSED",
      "PRESENT",
      "ABSENT",
      "PRESENT",
      "ABSENT",
    ];
    const weekly = await Promise.all(
      statuses.map((_, index) =>
        training(club.id, {
          title: `Training ${index + 1}`,
          departmentId: fussball.id,
          startsAt: at(-(index + 1) * 7 * DAY),
        }),
      ),
    );
    const extra = await training(club.id, {
      title: "Handball-Schnuppertraining",
      departmentId: handball.id,
      startsAt: at(-2 * DAY),
    });
    for (const [index, event] of weekly.entries())
      await record(club.id, event.id, [[members.mia.id, statuses[index]!]]);
    await record(club.id, extra.id, [[members.mia.id, "PRESENT"]]);

    const own = await memberAttendanceSummary(ctx.mia, members.mia.id);
    expect(own).toMatchObject({ present: 8, excused: 2, absent: 3, total: 13, rate: 8 / 13 });
    expect(own?.recent).toHaveLength(10);
    expect(own?.recent.map((r) => r.title)).toEqual([
      "Handball-Schnuppertraining",
      ...weekly.slice(0, 9).map((e) => e.title),
    ]);
    expect(own?.recent[0]).toEqual({
      eventId: extra.id,
      title: "Handball-Schnuppertraining",
      startsAt: at(-2 * DAY),
      status: "PRESENT",
      linkable: true,
    });
    expect(own?.recent.slice(1).map((r) => r.status)).toEqual(statuses.slice(0, 9));

    // Ein anderes Mitglied und die Leitung einer fremden Abteilung sehen nichts; die eigene Leitung nur Fußball.
    expect(await memberAttendanceSummary(ctx.otto, members.mia.id)).toBeNull();
    expect(await memberAttendanceSummary(ctx.leadH, members.mia.id)).toBeNull();
    expect(await memberAttendanceSummary(ctx.leadF, members.mia.id)).toMatchObject({
      present: 7,
      total: 12,
    });
    // Ohne eigene Einträge: keine Quote statt Teilen durch null.
    expect(await memberAttendanceSummary(ctx.otto, members.otto.id)).toEqual({
      present: 0,
      excused: 0,
      absent: 0,
      total: 0,
      rate: null,
      recent: [],
    });
  });

  it("Gruppenfilter nur in der eigenen Reichweite – auch im CSV-Export (dort wird er nicht vorher geprüft)", async () => {
    const { club, fussball, members, ctx } = await setup();
    const event = await training(club.id, { departmentId: fussball.id, startsAt: at(-DAY) });
    await record(club.id, event.id, [
      [members.lena.id, "PRESENT"],
      [members.ben.id, "PRESENT"],
    ]);
    // Eine vereinsweite Gruppe (ohne Abteilung), in der nur Ben ist, und eine Gruppe der Fußballabteilung mit Lena.
    const clubWide = await prisma.group.create({
      data: { clubId: club.id, name: "Vorstandsrunde" },
    });
    const own = await prisma.group.create({
      data: { clubId: club.id, departmentId: fussball.id, name: "U13" },
    });
    await prisma.groupMember.createMany({
      data: [
        { clubId: club.id, groupId: clubWide.id, memberId: members.ben.id },
        { clubId: club.id, groupId: own.id, memberId: members.lena.id },
      ],
    });

    // Leitung Fußball: die vereinsweite Gruppe gibt es für sie nicht – wie eine unbekannte.
    const foreign = { period: "12m" as const, type: null, groupId: clubWide.id };
    await expect(exportAttendanceCsv(ctx.leadF, foreign, NOW)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(attendanceStats(ctx.leadF, foreign, NOW)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(
      await prisma.auditLog.count({
        where: { clubId: club.id, action: "event.attendance_exported" },
      }),
    ).toBe(0);
    // Die eigene Gruppe geht.
    const csv = await exportAttendanceCsv(
      ctx.leadF,
      { period: "12m", type: null, groupId: own.id },
      NOW,
    );
    expect(csv.count).toBe(1);
    expect(csv.csv).toContain("Läuferin");
    expect(csv.csv).not.toContain("Beide");
    // Der Vorstand (ganzer Verein) darf nach der vereinsweiten Gruppe filtern.
    expect(
      (await attendanceStats(ctx.board, foreign, NOW)).rows.map((row) => row.memberId),
    ).toEqual([members.ben.id]);
  });
});

describe("Zeitfenster und Status", () => {
  it("Entwürfe, abgesagte und archivierte Termine lassen sich nicht erfassen; abgeschlossene schon", async () => {
    const { club, fussball, members, ctx } = await setup();
    const input = (eventId: string) => ({
      eventId,
      entries: entries([members.lena.id, "PRESENT"]),
    });

    for (const [status, reason] of [
      ["DRAFT", "Entwurf"],
      ["CANCELLED", "abgesagt"],
      ["ARCHIVED", "archiviert"],
    ] as const) {
      const event = await training(club.id, { departmentId: fussball.id, status });
      await expect(saveAttendance(ctx.admin, input(event.id), NOW)).rejects.toMatchObject({
        code: "CONFLICT",
        message: expect.stringContaining(reason),
      });
      expect((await getAttendanceSheet(ctx.admin, event.id, NOW)).window).toMatchObject({
        open: false,
        reason: expect.stringContaining(reason),
      });
      expect(await stored(event.id)).toEqual({});
    }

    const completed = await training(club.id, { departmentId: fussball.id, status: "COMPLETED" });
    await expect(saveAttendance(ctx.admin, input(completed.id), NOW)).resolves.toMatchObject({
      present: 1,
    });
  });

  it("frühestens 60 Minuten vor Beginn – nach oben ohne Grenze", async () => {
    const { club, fussball, members, ctx } = await setup();
    const input = (eventId: string) => ({
      eventId,
      entries: entries([members.lena.id, "PRESENT"]),
    });

    const soon = await training(club.id, { departmentId: fussball.id, startsAt: at(61 * MIN) });
    await expect(saveAttendance(ctx.admin, input(soon.id), NOW)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("60 Minuten"),
    });
    expect(await stored(soon.id)).toEqual({});
    // Eine Minute später ist es genau 60 Minuten vor Beginn.
    await expect(saveAttendance(ctx.admin, input(soon.id), at(MIN))).resolves.toMatchObject({
      present: 1,
    });

    const exactly = await training(club.id, { departmentId: fussball.id, startsAt: at(60 * MIN) });
    await expect(saveAttendance(ctx.admin, input(exactly.id), NOW)).resolves.toMatchObject({
      present: 1,
    });

    const longAgo = await training(club.id, { departmentId: fussball.id, startsAt: at(-90 * DAY) });
    await expect(saveAttendance(ctx.admin, input(longAgo.id), NOW)).resolves.toMatchObject({
      present: 1,
    });
  });
});

describe("Mandantentrennung", () => {
  it("der Administrator eines anderen Vereins sieht und ändert nichts", async () => {
    const a = await setup("Verein A");
    const b = await setup("Verein B");
    const eventA = await training(a.club.id, { departmentId: a.fussball.id });
    const eventB = await training(b.club.id, { departmentId: b.fussball.id });
    await saveAttendance(
      a.ctx.admin,
      { eventId: eventA.id, entries: entries([a.members.lena.id, "PRESENT"]) },
      NOW,
    );
    const before = await stored(eventA.id);

    await expect(
      saveAttendance(
        b.ctx.admin,
        { eventId: eventA.id, entries: entries([a.members.lena.id, "ABSENT"]) },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      saveAttendance(
        b.ctx.admin,
        { eventId: eventA.id, entries: entries([a.members.lena.id, null]) },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getAttendanceSheet(b.ctx.admin, eventA.id, NOW)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    // Eigener Termin von B mit einem Mitglied von A: das Mitglied gibt es für B nicht.
    await expect(
      saveAttendance(
        b.ctx.admin,
        { eventId: eventB.id, entries: entries([a.members.lena.id, "PRESENT"]) },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    expect(await attendanceStats(b.ctx.admin, { period: "12m", type: null }, NOW)).toMatchObject({
      rows: [],
      recordedEvents: 0,
    });
    expect((await exportAttendanceCsv(b.ctx.admin, { period: "12m", type: null }, NOW)).count).toBe(
      0,
    );
    expect(await memberAttendanceSummary(b.ctx.admin, a.members.lena.id)).toBeNull();
    expect(await stored(eventA.id)).toEqual(before);
    expect(await stored(eventB.id)).toEqual({});
  });

  it("die Datenbank verknüpft nie Termin und Mitglied zweier Vereine (zusammengesetzte Fremdschlüssel)", async () => {
    const a = await setup("Verein A");
    const b = await setup("Verein B");
    const eventA = await training(a.club.id, { departmentId: a.fussball.id });

    for (const data of [
      { clubId: a.club.id, eventId: eventA.id, memberId: b.members.lena.id },
      { clubId: b.club.id, eventId: eventA.id, memberId: b.members.lena.id },
      { clubId: b.club.id, eventId: eventA.id, memberId: a.members.lena.id },
    ])
      await expect(
        prisma.eventAttendance.create({ data: { ...data, status: "PRESENT" } }),
        JSON.stringify(data),
      ).rejects.toThrow(/Foreign key constraint/);
    const bothClubs = { clubId: { in: [a.club.id, b.club.id] } };
    expect(await prisma.eventAttendance.count({ where: bothClubs })).toBe(0);

    // Gegenprobe: Termin und Mitglied desselben Vereins lassen sich verknüpfen.
    await prisma.eventAttendance.create({
      data: {
        clubId: a.club.id,
        eventId: eventA.id,
        memberId: a.members.lena.id,
        status: "PRESENT",
      },
    });
    expect(await prisma.eventAttendance.count({ where: bothClubs })).toBe(1);
  });
});

describe("Datenschutz und Aufbewahrung", () => {
  it("der Datenexport enthält die eigene Anwesenheit („anwesenheit“) – ohne, wer sie erfasst hat", async () => {
    const { club, fussball, people, members, ctx } = await setup();
    const first = await training(club.id, {
      title: "Training Dienstag",
      departmentId: fussball.id,
      startsAt: at(-DAY),
    });
    const second = await training(club.id, {
      title: "Training Mittwoch",
      departmentId: fussball.id,
    });
    await saveAttendance(
      ctx.leadF,
      {
        eventId: first.id,
        entries: entries([members.mia.id, "PRESENT"], [members.lena.id, "ABSENT"]),
      },
      NOW,
    );
    await saveAttendance(
      ctx.admin,
      { eventId: second.id, entries: entries([members.mia.id, "EXCUSED"]) },
      at(5 * MIN),
    );

    const data = await buildUserDataExport(people.mia.user.id, NOW);
    const mitglied = data?.vereine[0]?.mitglied as { anwesenheit: Record<string, unknown>[] };
    expect(mitglied.anwesenheit).toEqual([
      {
        veranstaltung: "Training Dienstag",
        beginn: at(-DAY).toISOString(),
        status: "PRESENT",
        erfasstAm: NOW.toISOString(),
      },
      {
        veranstaltung: "Training Mittwoch",
        beginn: at(-2 * HOUR).toISOString(),
        status: "EXCUSED",
        erfasstAm: at(5 * MIN).toISOString(),
      },
    ]);
    // Weder die erfassende Person noch die Anwesenheit anderer stehen im Export.
    const json = JSON.stringify(data);
    for (const foreign of [
      people.leadF.user.id,
      people.admin.user.id,
      "Tamara",
      "Trainerin",
      "Läuferin",
      members.lena.id,
    ])
      expect(json, foreign).not.toContain(foreign);
  });

  it("das Löschen eines Kontos leert „erfasst von“ – die erfasste Anwesenheit bleibt", async () => {
    const { club, fussball, people, members, ctx } = await setup();
    const byLead = await training(club.id, { departmentId: fussball.id, startsAt: at(-DAY) });
    const byAdmin = await training(club.id, { departmentId: fussball.id });
    await saveAttendance(
      ctx.leadF,
      {
        eventId: byLead.id,
        entries: entries([members.lena.id, "PRESENT"], [members.mia.id, "ABSENT"]),
      },
      NOW,
    );
    await saveAttendance(
      ctx.admin,
      { eventId: byAdmin.id, entries: entries([members.lena.id, "EXCUSED"]) },
      NOW,
    );

    const pending = await prisma.deletionRequest.create({
      data: { userId: people.leadF.user.id, requestedAt: at(-15 * DAY), scheduledFor: NOW },
    });
    expect(await executeDeletionRequest(pending.id, NOW)).toBe("COMPLETED");
    expect(await prisma.user.findUnique({ where: { id: people.leadF.user.id } })).toBeNull();

    expect(await stored(byLead.id)).toEqual({
      [members.lena.id]: { status: "PRESENT", recordedById: null, recordedAt: NOW },
      [members.mia.id]: { status: "ABSENT", recordedById: null, recordedAt: NOW },
    });
    expect(await stored(byAdmin.id)).toEqual({
      [members.lena.id]: { status: "EXCUSED", recordedById: people.admin.user.id, recordedAt: NOW },
    });
    expect(
      await prisma.eventAttendance.count({ where: { recordedById: people.leadF.user.id } }),
    ).toBe(0);
  });

  it("der Aufbewahrungsjob löscht Anwesenheit 24 Monate nach dem Termin und behält Neuere samt Termin", async () => {
    const { club, fussball, members } = await setup();
    const cutoff = new Date("2024-10-14T16:00:00.000Z"); // NOW minus 24 Monate
    const older = await training(club.id, {
      departmentId: fussball.id,
      startsAt: new Date(cutoff.getTime() - DAY),
    });
    const justOlder = await training(club.id, {
      departmentId: fussball.id,
      startsAt: new Date(cutoff.getTime() - MIN),
    });
    const exactly = await training(club.id, { departmentId: fussball.id, startsAt: cutoff });
    const recent = await training(club.id, { departmentId: fussball.id, startsAt: at(-7 * DAY) });
    await record(club.id, older.id, [
      [members.lena.id, "PRESENT"],
      [members.ben.id, "ABSENT"],
    ]);
    await record(club.id, justOlder.id, [[members.lena.id, "EXCUSED"]]);
    await record(club.id, exactly.id, [[members.lena.id, "PRESENT"]]);
    await record(club.id, recent.id, [[members.ben.id, "PRESENT"]]);

    expect(await applyRetention(NOW)).toMatchObject({ attendancePurged: 3 });
    const left = await prisma.eventAttendance.findMany({
      where: { clubId: club.id },
      select: { eventId: true },
    });
    expect(left.map((r) => r.eventId).sort()).toEqual([exactly.id, recent.id].sort());
    // Die Termine selbst bleiben.
    expect(await prisma.event.count({ where: { id: { in: [older.id, justOlder.id] } } })).toBe(2);
    // Wiederholbar: Ein zweiter Lauf findet nichts mehr.
    expect(await applyRetention(NOW)).toMatchObject({ attendancePurged: 0 });
  });

  it("das Protokoll „Anwesenheit erfasst“ nennt nur Zahlen, keine Namen", async () => {
    const { club, fussball, people, members, ctx } = await setup();
    const event = await training(club.id, { title: "Training Fußball", departmentId: fussball.id });
    await saveAttendance(
      ctx.admin,
      {
        eventId: event.id,
        entries: entries(
          [members.lena.id, "PRESENT"],
          [members.ben.id, "EXCUSED"],
          [members.mia.id, "ABSENT"],
        ),
      },
      NOW,
    );
    await saveAttendance(
      ctx.admin,
      {
        eventId: event.id,
        entries: entries([members.ben.id, "PRESENT"], [members.mia.id, null]),
      },
      at(MIN),
    );

    const audits = await attendanceAudits(club.id);
    expect(audits).toEqual([
      expect.objectContaining({
        actorUserId: people.admin.user.id,
        entityType: "Event",
        entityId: event.id,
        summary: "Anwesenheit „Training Fußball“: 1 anwesend, 1 entschuldigt, 1 gefehlt",
        changes: { neu: { to: 3 }, geaendert: { to: 0 }, entfernt: { to: 0 } },
      }),
      expect.objectContaining({
        summary: "Anwesenheit „Training Fußball“: 2 anwesend, 0 entschuldigt, 0 gefehlt",
        changes: { neu: { to: 0 }, geaendert: { to: 1 }, entfernt: { to: 1 } },
      }),
    ]);
    const json = JSON.stringify(audits.map((a) => ({ summary: a.summary, changes: a.changes })));
    for (const personal of [
      "Lena",
      "Läuferin",
      "Ben",
      "Beide",
      "Mia",
      members.lena.id,
      members.ben.id,
      members.mia.id,
    ])
      expect(json, personal).not.toContain(personal);
  });

  it("das Protokoll „Anwesenheit exportiert“ nennt, wer exportiert hat, und nur die Anzahl – keine Namen", async () => {
    const { club, fussball, people, members, ctx } = await setup();
    const event = await training(club.id, {
      title: "Training Export",
      departmentId: fussball.id,
      startsAt: at(-DAY),
    });
    await record(club.id, event.id, [
      [members.lena.id, "PRESENT"],
      [members.ben.id, "EXCUSED"],
      [members.mia.id, "ABSENT"],
    ]);

    const result = await exportAttendanceCsv(ctx.leadF, { period: "12m", type: null }, NOW);
    expect(result.count).toBe(3);
    expect(result.csv).toContain("Läuferin"); // Die Datei selbst enthält die Namen, das Protokoll nicht.

    const audits = await prisma.auditLog.findMany({
      where: { clubId: club.id, action: "event.attendance_exported" },
    });
    expect(audits).toEqual([
      expect.objectContaining({
        actorUserId: people.leadF.user.id,
        actorType: "USER",
        entityType: "Event",
        summary: "Anwesenheitsliste als CSV exportiert (3 Einträge)",
        changes: { anzahl: { to: 3 } },
      }),
    ]);
    const json = JSON.stringify(audits.map((a) => ({ summary: a.summary, changes: a.changes })));
    for (const personal of [
      "Lena",
      "Läuferin",
      "Ben",
      "Beide",
      "Mia",
      "Mitglied",
      "Training Export",
      members.lena.id,
      members.ben.id,
      members.mia.id,
    ])
      expect(json, personal).not.toContain(personal);
  });

  it("nach dem Speichern zählt die Rückmeldung wie Karte und Liste – ohne Mitglieder im Papierkorb", async () => {
    const { club, fussball, members, ctx } = await setup();
    const event = await training(club.id, {
      title: "Training Papierkorb",
      departmentId: fussball.id,
    });
    await record(club.id, event.id, [
      [members.lena.id, "PRESENT"],
      [members.ben.id, "PRESENT"],
    ]);
    await prisma.member.update({ where: { id: members.ben.id }, data: { deletedAt: NOW } });

    expect(
      await saveAttendance(
        ctx.admin,
        { eventId: event.id, entries: entries([members.mia.id, "EXCUSED"]) },
        NOW,
      ),
    ).toEqual({ present: 1, excused: 1, absent: 0, changed: 1 });
    expect(await getEventAttendanceSummary(ctx.admin, event, NOW)).toMatchObject({
      counts: { present: 1, excused: 1, absent: 0 },
      total: 2,
    });
    expect((await attendanceAudits(club.id)).at(-1)?.summary).toBe(
      "Anwesenheit „Training Papierkorb“: 1 anwesend, 1 entschuldigt, 0 gefehlt",
    );
  });

  it("beim Anonymisieren entfällt die Anwesenheit der Person ganz – die Mitgliedsseite zeigt keine mehr", async () => {
    const { club, fussball, members, ctx } = await setup();
    const first = await training(club.id, { departmentId: fussball.id, startsAt: at(-7 * DAY) });
    const second = await training(club.id, { departmentId: fussball.id, startsAt: at(-DAY) });
    await record(club.id, first.id, [
      [members.lena.id, "PRESENT"],
      [members.ben.id, "ABSENT"],
    ]);
    await record(club.id, second.id, [[members.lena.id, "EXCUSED"]]);
    expect(await memberAttendanceSummary(ctx.admin, members.lena.id)).toMatchObject({ total: 2 });

    expect(
      await prisma.$transaction((tx) => anonymizeMemberData(tx, club.id, members.lena.id, NOW)),
    ).toBe(true);

    expect(await prisma.eventAttendance.count({ where: { memberId: members.lena.id } })).toBe(0);
    expect(await memberAttendanceSummary(ctx.admin, members.lena.id)).toBeNull();
    // Die Anwesenheit der anderen bleibt.
    expect(await stored(first.id)).toEqual({
      [members.ben.id]: { status: "ABSENT", recordedById: null, recordedAt: expect.any(Date) },
    });
  });
});
