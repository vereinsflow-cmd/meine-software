import { describe, expect, it } from "vitest";
import type { EventStatus, EventType } from "@/generated/prisma/enums";
import { createFeedLink, getFeedStatus, revokeFeedLinks } from "@/modules/calendar/feed";
import {
  CALENDAR_ENTRY_LIMIT,
  getEventIcsEntry,
  getFeedIcsEntries,
  listCalendarEntries,
} from "@/modules/calendar/service";
import { prisma } from "@/server/db/client";
import { hashToken } from "@/server/security/tokens";
import { loadTenantContextForUser } from "@/server/tenancy/context-core";
import { resolveFeedToken } from "@/server/tenancy/feed-token";
import {
  addUserToClub,
  contextFor,
  createClub,
  createDepartment,
  createShift as createShiftRow,
} from "../helpers/factories";

const DAY = 86_400_000;
const at = (days: number, hour = 12) => new Date(Date.now() + days * DAY + (hour - 12) * 3_600_000);
const window = { from: at(-2), to: at(30) };

async function makeEvent(
  clubId: string,
  title: string,
  options: {
    status?: EventStatus;
    type?: EventType;
    departmentId?: string | null;
    startsInDays?: number;
    hours?: number;
    deletedAt?: Date | null;
    description?: string;
    internalNotes?: string;
  } = {},
) {
  const startsAt = at(options.startsInDays ?? 5);
  return prisma.event.create({
    data: {
      clubId,
      title,
      status: options.status ?? "PUBLISHED",
      type: options.type ?? "EVENT",
      departmentId: options.departmentId ?? null,
      startsAt,
      endsAt: new Date(startsAt.getTime() + (options.hours ?? 3) * 3_600_000),
      deletedAt: options.deletedAt ?? null,
      description: options.description ?? null,
      internalNotes: options.internalNotes ?? null,
    },
  });
}

async function setup() {
  const club = await createClub("Kalenderverein");
  const fussball = await createDepartment(club.id, "Fußball");
  const handball = await createDepartment(club.id, "Handball");
  const admin = await addUserToClub(club, "CLUB_ADMIN");
  const board = await addUserToClub(club, "BOARD");
  const lead = await addUserToClub(club, "DEPARTMENT_LEAD", { ledDepartmentIds: [fussball.id] });
  const helper = await addUserToClub(club, "HELPER", { firstName: "Hanna", lastName: "Helfer" });
  const member = await addUserToClub(club, "MEMBER");
  return {
    club,
    fussball,
    handball,
    people: { admin, board, lead, helper, member },
    ctx: {
      admin: await contextFor(admin.user.id, club.id),
      board: await contextFor(board.user.id, club.id),
      lead: await contextFor(lead.user.id, club.id),
      helper: await contextFor(helper.user.id, club.id),
      member: await contextFor(member.user.id, club.id),
    },
  };
}

const titles = (result: { entries: { title: string }[] }) => result.entries.map((e) => e.title);

describe("Kalender: Sichtbarkeit", () => {
  it("zeigt veröffentlichte und abgesagte Termine im Zeitraum – nicht Entwürfe, Archivierte, Gelöschte, Vergangene oder Termine anderer Vereine", async () => {
    const { club, ctx } = await setup();
    await makeEvent(club.id, "Sommerfest");
    await makeEvent(club.id, "Abgesagtes Turnier", { status: "CANCELLED", startsInDays: 6 });
    await makeEvent(club.id, "Abgeschlossen", { status: "COMPLETED", startsInDays: 7 });
    await makeEvent(club.id, "Entwurf", { status: "DRAFT", startsInDays: 8 });
    await makeEvent(club.id, "Archiviert", { status: "ARCHIVED", startsInDays: 9 });
    await makeEvent(club.id, "Gelöscht", { startsInDays: 10, deletedAt: new Date() });
    await makeEvent(club.id, "Zu spät", { startsInDays: 90 });
    await makeEvent(club.id, "Zu früh", { startsInDays: -40 });
    const other = await createClub("Fremdverein");
    await makeEvent(other.id, "Fremdes Fest");

    const asMember = await listCalendarEntries(ctx.member, window);
    expect(titles(asMember)).toEqual(["Sommerfest", "Abgesagtes Turnier", "Abgeschlossen"]);
    expect(asMember.truncated).toBe(false);
    expect(asMember.entries[1]).toMatchObject({
      status: "CANCELLED",
      kind: "event",
      href: expect.stringMatching(/^\/veranstaltungen\//),
    });
  });

  it("Entwürfe sehen nur Berechtigte; Abteilungsleiter nur die ihrer Abteilung; Archivierte niemand im Kalender", async () => {
    const { club, ctx, fussball, handball } = await setup();
    await makeEvent(club.id, "Vereinsweiter Entwurf", { status: "DRAFT", startsInDays: 3 });
    await makeEvent(club.id, "Fußball-Entwurf", {
      status: "DRAFT",
      startsInDays: 4,
      departmentId: fussball.id,
    });
    await makeEvent(club.id, "Handball-Entwurf", {
      status: "DRAFT",
      startsInDays: 5,
      departmentId: handball.id,
    });
    await makeEvent(club.id, "Archiviert", { status: "ARCHIVED", startsInDays: 6 });

    expect(titles(await listCalendarEntries(ctx.admin, window))).toEqual([
      "Vereinsweiter Entwurf",
      "Fußball-Entwurf",
      "Handball-Entwurf",
    ]);
    expect(titles(await listCalendarEntries(ctx.board, window))).toHaveLength(3);
    expect(titles(await listCalendarEntries(ctx.lead, window))).toEqual(["Fußball-Entwurf"]);
    expect(titles(await listCalendarEntries(ctx.helper, window))).toEqual([]);
    expect(titles(await listCalendarEntries(ctx.member, window))).toEqual([]);
  });

  it("nimmt Termine auf, die vor dem Zeitraum beginnen und hineinreichen – nicht aber solche, die erst am Ende beginnen", async () => {
    const { club, ctx } = await setup();
    const from = new Date("2027-03-01T00:00:00Z");
    const to = new Date("2027-04-01T00:00:00Z");
    const make = (title: string, startsAt: Date, endsAt: Date) =>
      prisma.event.create({
        data: { clubId: club.id, title, startsAt, endsAt, status: "PUBLISHED" },
      });
    await make(
      "Beginnt davor, endet drin",
      new Date("2027-02-28T20:00:00Z"),
      new Date("2027-03-01T03:00:00Z"),
    );
    await make("Endet davor", new Date("2027-02-28T20:00:00Z"), new Date("2027-02-28T23:00:00Z"));
    await make(
      "Beginnt genau am Ende",
      new Date("2027-04-01T00:00:00Z"),
      new Date("2027-04-01T02:00:00Z"),
    );
    await make(
      "Beginnt kurz davor",
      new Date("2027-03-31T22:00:00Z"),
      new Date("2027-04-01T02:00:00Z"),
    );
    expect(titles(await listCalendarEntries(ctx.member, { from, to }))).toEqual([
      "Beginnt davor, endet drin",
      "Beginnt kurz davor",
    ]);
  });

  it("begrenzt die Zahl der Einträge und meldet das (Kürzung statt endloser Antwort)", async () => {
    const { club, ctx } = await setup();
    const startsAt = at(3);
    await prisma.event.createMany({
      data: Array.from({ length: CALENDAR_ENTRY_LIMIT + 1 }, (_, index) => ({
        clubId: club.id,
        title: `Termin ${String(index).padStart(3, "0")}`,
        startsAt: new Date(startsAt.getTime() + index * 60_000),
        endsAt: new Date(startsAt.getTime() + index * 60_000 + 30 * 60_000),
        status: "PUBLISHED" as const,
      })),
    });
    const result = await listCalendarEntries(ctx.member, window);
    expect(result.entries).toHaveLength(CALENDAR_ENTRY_LIMIT);
    expect(result.truncated).toBe(true);
    expect(result.entries[0]!.title).toBe("Termin 000");
  });
});

describe("Kalender: Filter", () => {
  it("filtert nach Art und Abteilung", async () => {
    const { club, ctx, fussball, handball } = await setup();
    await makeEvent(club.id, "Training Fußball", {
      type: "TRAINING",
      departmentId: fussball.id,
      startsInDays: 3,
    });
    await makeEvent(club.id, "Training Handball", {
      type: "TRAINING",
      departmentId: handball.id,
      startsInDays: 4,
    });
    await makeEvent(club.id, "Sitzung", { type: "MEETING", startsInDays: 5 });

    expect(titles(await listCalendarEntries(ctx.member, window, { type: "TRAINING" }))).toEqual([
      "Training Fußball",
      "Training Handball",
    ]);
    expect(
      titles(await listCalendarEntries(ctx.member, window, { departmentId: handball.id })),
    ).toEqual(["Training Handball"]);
    expect(
      titles(
        await listCalendarEntries(ctx.member, window, {
          type: "MEETING",
          departmentId: handball.id,
        }),
      ),
    ).toEqual([]);
    const withDept = await listCalendarEntries(ctx.member, window, { departmentId: fussball.id });
    expect(withDept.entries[0]).toMatchObject({ departmentName: "Fußball", type: "TRAINING" });
  });

  it("'Nur meine Termine': Zusagen und Warteliste, keine Absagen; eigene Anmeldung wird mitgeliefert", async () => {
    const { club, ctx, people } = await setup();
    const zugesagt = await makeEvent(club.id, "Zugesagt", { startsInDays: 3 });
    const warteliste = await makeEvent(club.id, "Warteliste", { startsInDays: 4 });
    const abgesagt = await makeEvent(club.id, "Selbst abgesagt", { startsInDays: 5 });
    await makeEvent(club.id, "Keine Anmeldung", { startsInDays: 6 });
    const memberId = people.member.member.id;
    await prisma.eventParticipant.createMany({
      data: [
        { clubId: club.id, eventId: zugesagt.id, memberId, status: "ACCEPTED" },
        { clubId: club.id, eventId: warteliste.id, memberId, status: "WAITLISTED" },
        { clubId: club.id, eventId: abgesagt.id, memberId, status: "DECLINED" },
      ],
    });

    const mine = await listCalendarEntries(ctx.member, window, { mine: true });
    expect(titles(mine)).toEqual(["Zugesagt", "Warteliste"]);
    const all = await listCalendarEntries(ctx.member, window);
    expect(all.entries.map((e) => [e.title, e.myStatus])).toEqual([
      ["Zugesagt", "ACCEPTED"],
      ["Warteliste", "WAITLISTED"],
      ["Selbst abgesagt", "DECLINED"],
      ["Keine Anmeldung", null],
    ]);
    // Wer nur der Verwaltung angehört und kein Mitglied ist, hat keine eigenen Termine (statt "alle").
    expect(
      (await listCalendarEntries({ ...ctx.member, memberId: null }, window, { mine: true }))
        .entries,
    ).toEqual([]);
  });
});

describe("Kalender: eigene Helferschichten", () => {
  it("zeigt nur die eigenen bestätigten Schichten (nicht die anderer, keine abgesagten, keine aus Entwürfen)", async () => {
    const { club, ctx, people } = await setup();
    const event = await makeEvent(club.id, "Sommerfest", { startsInDays: 5, hours: 8 });
    const draft = await makeEvent(club.id, "Entwurfs-Fest", { status: "DRAFT", startsInDays: 6 });
    const mine = await createShiftRow(club.id, event.id, {
      title: "Aufbau",
      startsAt: at(5, 8),
      endsAt: at(5, 10),
    });
    const others = await createShiftRow(club.id, event.id, {
      title: "Getränke",
      startsAt: at(5, 12),
      endsAt: at(5, 15),
    });
    const cancelled = await createShiftRow(club.id, event.id, {
      title: "Abgesagte Schicht",
      startsAt: at(5, 16),
      endsAt: at(5, 18),
    });
    const draftShift = await createShiftRow(club.id, draft.id, {
      title: "Entwurfsschicht",
      startsAt: at(6, 9),
      endsAt: at(6, 11),
    });
    await prisma.eventShift.update({ where: { id: cancelled.id }, data: { status: "CANCELLED" } });
    const helperId = people.helper.member.id;
    const memberId = people.member.member.id;
    for (const shiftId of [mine.id, cancelled.id, draftShift.id])
      await prisma.shiftAssignment.create({
        data: { clubId: club.id, shiftId, memberId: helperId },
      });
    await prisma.shiftAssignment.create({
      data: { clubId: club.id, shiftId: others.id, memberId },
    });

    const result = await listCalendarEntries(ctx.helper, window);
    const shifts = result.entries.filter((e) => e.kind === "shift");
    expect(shifts).toHaveLength(1);
    expect(shifts[0]).toMatchObject({
      title: "Schicht: Aufbau",
      subtitle: "Sommerfest",
      href: `/helferplanung/${event.id}`,
      id: mine.id,
    });

    // Die andere Person sieht ihre eigene, nicht die des Helfers.
    expect(
      (await listCalendarEntries(ctx.member, window)).entries
        .filter((e) => e.kind === "shift")
        .map((e) => e.title),
    ).toEqual(["Schicht: Getränke"]);
    // Bei Filter nach Art gibt es keine Schichten (sie haben keine Art).
    expect(
      (await listCalendarEntries(ctx.helper, window, { type: "EVENT" })).entries.filter(
        (e) => e.kind === "shift",
      ),
    ).toHaveLength(0);
  });
});

describe("iCal-Einträge", () => {
  it("einzelner Termin: nur wenn sichtbar; ohne interne Hinweise; fremder Verein und Entwürfe sind 'nicht gefunden'", async () => {
    const { club, ctx } = await setup();
    const event = await makeEvent(club.id, "Sommerfest", {
      description: "Grillen und Musik",
      internalNotes: "Strom beim Hausmeister abholen",
    });
    const draft = await makeEvent(club.id, "Entwurf", { status: "DRAFT" });
    const other = await createClub("Fremdverein");
    const foreign = await makeEvent(other.id, "Fremdes Fest");

    const entry = await getEventIcsEntry(ctx.member, event.id, "https://verein.example");
    expect(entry).toMatchObject({
      uid: `event-${event.id}`,
      title: "Sommerfest",
      status: "PUBLISHED",
      url: `https://verein.example/veranstaltungen/${event.id}`,
    });
    expect(JSON.stringify(entry)).not.toContain("Hausmeister");
    expect(entry.description).toBe("Grillen und Musik");

    await expect(getEventIcsEntry(ctx.member, draft.id, "https://x")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(getEventIcsEntry(ctx.admin, draft.id, "https://x")).resolves.toMatchObject({
      status: "DRAFT",
    });
    await expect(getEventIcsEntry(ctx.member, foreign.id, "https://x")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      getEventIcsEntry(ctx.member, "00000000-0000-0000-0000-000000000000", "https://x"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("Feed: 30 Tage zurück bis 12 Monate voraus, ohne Entwürfe; eigene Schichten dabei", async () => {
    const { club, ctx, people } = await setup();
    const now = new Date();
    await makeEvent(club.id, "Kürzlich", { startsInDays: -10 });
    await makeEvent(club.id, "Zu alt", { startsInDays: -60 });
    await makeEvent(club.id, "Nächstes Jahr", { startsInDays: 300 });
    await makeEvent(club.id, "Zu weit", { startsInDays: 400 });
    await makeEvent(club.id, "Entwurf", { status: "DRAFT", startsInDays: 3 });
    await makeEvent(club.id, "Abgesagt", { status: "CANCELLED", startsInDays: 4 });
    const fest = await makeEvent(club.id, "Fest", { startsInDays: 5, hours: 8 });
    const shift = await createShiftRow(club.id, fest.id, {
      title: "Aufbau",
      startsAt: at(5, 8),
      endsAt: at(5, 10),
    });
    await prisma.shiftAssignment.create({
      data: { clubId: club.id, shiftId: shift.id, memberId: people.helper.member.id },
    });

    const entries = await getFeedIcsEntries(ctx.helper, "https://verein.example", now);
    expect(entries.map((e) => e.title).sort()).toEqual([
      "Abgesagt",
      "Fest",
      "Helferschicht: Aufbau (Fest)",
      "Kürzlich",
      "Nächstes Jahr",
    ]);
    expect(entries.find((e) => e.title === "Abgesagt")!.status).toBe("CANCELLED");
    expect(entries.find((e) => e.uid === `shift-${shift.id}`)).toBeTruthy();
    // Andere Person: keine fremden Schichten.
    expect(
      (await getFeedIcsEntries(ctx.member, "https://verein.example", now)).some((e) =>
        e.uid.startsWith("shift-"),
      ),
    ).toBe(false);
  });
});

describe("Kalender-Abo-Link", () => {
  it("Token wird nur als Hash gespeichert und löst in den Kontext der Person auf", async () => {
    const { ctx, people, club } = await setup();
    expect((await getFeedStatus(ctx.helper)).active).toBe(false);

    const { token } = await createFeedLink(ctx.helper);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const rows = await prisma.calendarFeedToken.findMany({
      where: { userId: people.helper.user.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(rows)).not.toContain(token);

    const resolved = await resolveFeedToken(token);
    expect(resolved).toMatchObject({
      userId: people.helper.user.id,
      clubId: club.id,
      roleKey: "HELPER",
    });
    const status = await getFeedStatus(ctx.helper);
    expect(status.active).toBe(true);
    expect(status.lastUsedAt).toBeInstanceOf(Date);

    const audit = await prisma.auditLog.findMany({
      where: { clubId: club.id, action: "calendar.feed_created" },
    });
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain(token);
  });

  it("neuer Link macht den alten ungültig; Widerruf sperrt sofort", async () => {
    const { ctx, club } = await setup();
    const first = await createFeedLink(ctx.member);
    const second = await createFeedLink(ctx.member);
    expect(second.token).not.toBe(first.token);
    expect(await resolveFeedToken(first.token)).toBeNull();
    expect(await resolveFeedToken(second.token)).not.toBeNull();
    expect(
      await prisma.calendarFeedToken.count({
        where: { userId: ctx.member.userId, revokedAt: null },
      }),
    ).toBe(1);

    await revokeFeedLinks(ctx.member);
    expect(await resolveFeedToken(second.token)).toBeNull();
    expect((await getFeedStatus(ctx.member)).active).toBe(false);
    expect(
      await prisma.auditLog.count({ where: { clubId: club.id, action: "calendar.feed_revoked" } }),
    ).toBe(1);
    await revokeFeedLinks(ctx.member); // erneutes Widerrufen ist harmlos und erzeugt keinen weiteren Eintrag
    expect(
      await prisma.auditLog.count({ where: { clubId: club.id, action: "calendar.feed_revoked" } }),
    ).toBe(1);
  });

  it("ungültige, unbekannte oder manipulierte Token liefern nichts", async () => {
    const { ctx } = await setup();
    const { token } = await createFeedLink(ctx.member);
    for (const bad of [
      "",
      "abc",
      "x".repeat(43),
      `${token}x`,
      token.slice(0, -1),
      token.toUpperCase(),
      `${token}\n`,
      "../../etc/passwd",
      "a".repeat(500),
    ]) {
      expect(await resolveFeedToken(bad)).toBeNull();
    }
    expect(await resolveFeedToken(token)).not.toBeNull();
  });

  it("wird die Mitgliedschaft beendet, der Benutzer gesperrt oder der Verein deaktiviert, wirkt der Link nicht mehr", async () => {
    const { ctx, people, club } = await setup();
    const { token } = await createFeedLink(ctx.helper);
    expect(await resolveFeedToken(token)).not.toBeNull();

    await prisma.user.update({
      where: { id: people.helper.user.id },
      data: { disabledAt: new Date() },
    });
    expect(await resolveFeedToken(token)).toBeNull();
    await prisma.user.update({ where: { id: people.helper.user.id }, data: { disabledAt: null } });
    expect(await resolveFeedToken(token)).not.toBeNull();

    await prisma.clubMembership.update({
      where: { id: people.helper.membershipId },
      data: { status: "SUSPENDED" },
    });
    expect(await resolveFeedToken(token)).toBeNull();
    await prisma.clubMembership.update({
      where: { id: people.helper.membershipId },
      data: { status: "ACTIVE" },
    });
    expect(await resolveFeedToken(token)).not.toBeNull();

    await prisma.club.update({ where: { id: club.id }, data: { status: "DEACTIVATED" } });
    expect(await resolveFeedToken(token)).toBeNull();
  });

  it("Feed und Kontext gehören immer zum Verein des Tokens (kein Ausweichen in einen anderen Verein)", async () => {
    const a = await setup();
    const b = await setup();
    await makeEvent(a.club.id, "Fest Verein A");
    await makeEvent(b.club.id, "Fest Verein B");

    const { token } = await createFeedLink(a.ctx.member);
    const ctxFromToken = (await resolveFeedToken(token))!;
    expect(ctxFromToken.clubId).toBe(a.club.id);
    expect((await getFeedIcsEntries(ctxFromToken, "https://x")).map((e) => e.title)).toEqual([
      "Fest Verein A",
    ]);

    // Ein Benutzer, der in Verein B kein Mitglied ist, bekommt dort keinen Kontext – auch nicht als Ausweichlösung.
    expect(await loadTenantContextForUser(a.people.member.user.id, b.club.id)).toBeNull();
    expect(
      await loadTenantContextForUser("00000000-0000-0000-0000-000000000000", a.club.id),
    ).toBeNull();
    expect((await loadTenantContextForUser(a.people.member.user.id, a.club.id))?.clubId).toBe(
      a.club.id,
    );
  });

  it("die Rechte im Feed entsprechen der aktuellen Rolle: wird der Entwurf freigegeben, ändert sich der Feed nicht für Mitglieder", async () => {
    const { ctx, club } = await setup();
    await makeEvent(club.id, "Entwurf", { status: "DRAFT", startsInDays: 3 });
    const member = await createFeedLink(ctx.member);
    const admin = await createFeedLink(ctx.admin);
    const memberEntries = await getFeedIcsEntries(
      (await resolveFeedToken(member.token))!,
      "https://x",
    );
    expect(memberEntries).toHaveLength(0);
    // Auch der Verwalter-Feed enthält keine Entwürfe (Kalender-Apps sind kein Ort für unveröffentlichte Planung).
    const adminEntries = await getFeedIcsEntries(
      (await resolveFeedToken(admin.token))!,
      "https://x",
    );
    expect(adminEntries).toHaveLength(0);
  });
});
