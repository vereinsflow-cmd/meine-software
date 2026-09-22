import { describe, expect, it } from "vitest";
import { getDashboard } from "@/modules/dashboard/service";
import { listUpcomingBirthdays } from "@/modules/members/service";
import { notifyUsers } from "@/modules/notifications/service";
import { prisma } from "@/server/db/client";
import { berlinYear, calendarDay } from "../helpers/dates";
import {
  addUserToClub,
  contextFor,
  createClub,
  createDepartment,
  createEvent,
  createShift,
} from "../helpers/factories";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const inDays = (n: number) => new Date(Date.now() + n * DAY);

async function setup() {
  const club = await createClub("Dashboardverein");
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

describe("Dashboard: Inhalte je Rolle", () => {
  it("Vereinsadministrator sieht Kennzahlen, Termine, Schichten, Warnungen und Geburtstage", async () => {
    const { ctx, club, fussball } = await setup();
    // Vier Mitglieder zusätzlich zu den fünf Konten: unterschiedliche Status und Eintrittsjahre.
    const year = berlinYear();
    await prisma.member.createMany({
      data: [
        {
          clubId: club.id,
          firstName: "A",
          lastName: "Aktiv",
          status: "ACTIVE",
          joinedAt: new Date(Date.UTC(year, 1, 1)),
        },
        {
          clubId: club.id,
          firstName: "B",
          lastName: "Passiv",
          status: "PASSIVE",
          joinedAt: new Date(Date.UTC(year - 3, 1, 1)),
        },
        {
          clubId: club.id,
          firstName: "C",
          lastName: "Archiviert",
          status: "ACTIVE",
          archivedAt: new Date(),
        },
        {
          clubId: club.id,
          firstName: "D",
          lastName: "Gelöscht",
          status: "ACTIVE",
          deletedAt: new Date(),
        },
      ],
    });
    const soonEvent = await createEvent(club.id, {
      title: "Bald",
      startsAt: inDays(5),
      endsAt: new Date(inDays(5).getTime() + 4 * HOUR),
    });
    const laterEvent = await createEvent(club.id, {
      title: "Später",
      startsAt: inDays(20),
      endsAt: new Date(inDays(20).getTime() + 4 * HOUR),
      departmentId: fussball.id,
    });
    await createEvent(club.id, {
      title: "Weit weg",
      startsAt: inDays(60),
      endsAt: new Date(inDays(60).getTime() + 4 * HOUR),
    });
    await prisma.event.create({
      data: {
        clubId: club.id,
        title: "Entwurf",
        status: "DRAFT",
        startsAt: inDays(6),
        endsAt: new Date(inDays(6).getTime() + HOUR),
      },
    });
    await prisma.event.create({
      data: {
        clubId: club.id,
        title: "Abgesagt",
        status: "CANCELLED",
        startsAt: inDays(7),
        endsAt: new Date(inDays(7).getTime() + HOUR),
      },
    });
    await prisma.event.create({
      data: {
        clubId: club.id,
        title: "Vorbei",
        status: "PUBLISHED",
        startsAt: inDays(-5),
        endsAt: new Date(inDays(-5).getTime() + HOUR),
      },
    });
    await createShift(club.id, soonEvent.id, { startsAt: inDays(5), requiredCount: 3 }); // 0 von 3, in 5 Tagen → "bald"
    await createShift(club.id, laterEvent.id, { startsAt: inDays(20), requiredCount: 2 }); // weit entfernt → keine Warnung

    const data = await getDashboard(ctx.admin);

    expect(data.members).toMatchObject({ scope: "CLUB", joinedThisYear: 1 });
    expect(data.members!.total).toBe(5 + 2); // fünf Konten + aktiv + passiv; ohne Archiv und Papierkorb
    expect(data.members!.byStatus.find((s) => s.status === "PASSIVE")?.count).toBe(1);

    expect(data.events!.upcoming.map((e) => e.title)).toEqual(["Bald", "Später", "Weit weg"]); // nur veröffentlichte, kommende
    expect(data.events!.countNext30Days).toBe(2);

    expect(data.shifts!.freeSpots).toBe(5);
    expect(data.shifts!.open).toHaveLength(2);
    expect(data.shifts!.warnings.map((w) => w.title)).toEqual(["Bald"]);
    expect(data.shifts!.warnings[0]).toMatchObject({ openShifts: 1, worstUrgency: "SOON" });
    expect(data.shifts!.hours).toMatchObject({ scope: "ALL", minutes: 0 });
    expect(data.birthdays).toEqual([]); // Recht vorhanden, aber niemand hat in den nächsten Tagen Geburtstag
  });

  it("Mitglied: nur Termine, freie Plätze, eigene Einsätze und Benachrichtigungen – keine Mitgliederzahlen, Warnungen, Geburtstage", async () => {
    const { ctx, club, people } = await setup();
    const event = await createEvent(club.id, {
      title: "Sommerfest",
      startsAt: inDays(4),
      endsAt: new Date(inDays(4).getTime() + 8 * HOUR),
    });
    const shift = await createShift(club.id, event.id, {
      title: "Aufbau",
      startsAt: inDays(4),
      requiredCount: 3,
    });
    await prisma.shiftAssignment.create({
      data: { clubId: club.id, shiftId: shift.id, memberId: people.member.member.id },
    });
    await prisma.member.create({
      data: {
        clubId: club.id,
        firstName: "Geburtstag",
        lastName: "Kind",
        birthDate: calendarDay(2),
      },
    });
    await notifyUsers(ctx.admin.db, club.id, {
      userIds: [people.member.user.id],
      type: "SYSTEM",
      title: "Hallo",
    });

    const data = await getDashboard(ctx.member);
    expect(data.members).toBeNull();
    expect(data.birthdays).toBeNull(); // Datenschutz: Geburtstage gehören zu den sensiblen Angaben
    expect(data.events!.upcoming.map((e) => e.title)).toEqual(["Sommerfest"]);
    expect(data.shifts!.mine.map((a) => a.title)).toEqual(["Aufbau"]);
    expect(data.shifts!.freeSpots).toBe(2);
    expect(data.shifts!.warnings).toEqual([]); // Warnungen sind für Veranstalter
    expect(data.shifts!.hours.scope).toBe("OWN");
    expect(data.notifications.unread).toBe(1);
    expect(data.notifications.latest.map((n) => n.title)).toEqual(["Hallo"]);
  });

  it("Abteilungsleiter: Kennzahlen und Geburtstage nur für die eigene Abteilung", async () => {
    const { ctx, club, fussball, handball } = await setup();
    const born = (days: number) => {
      const d = calendarDay(days);
      return new Date(Date.UTC(1990, d.getUTCMonth(), d.getUTCDate()));
    };
    const mk = async (firstName: string, departmentId: string, birthDate: Date) => {
      const member = await prisma.member.create({
        data: { clubId: club.id, firstName, lastName: "Test", birthDate },
      });
      await prisma.memberDepartment.create({
        data: { clubId: club.id, memberId: member.id, departmentId },
      });
    };
    await mk("Fritz", fussball.id, born(3));
    await mk("Hanna", handball.id, born(4));

    const data = await getDashboard(ctx.lead);
    expect(data.members).toMatchObject({ scope: "DEPARTMENT" });
    expect(data.members!.total).toBe(2); // Fritz + der Leiter selbst (Mitglied der eigenen Abteilung)
    expect(data.birthdays!.map((b) => b.name)).toEqual(["Fritz Test"]);

    const admin = await getDashboard(ctx.admin);
    expect(admin.birthdays!.map((b) => b.name)).toEqual(["Fritz Test", "Hanna Test"]);
  });

  it("Aufgaben: eigene offene Aufgaben (fällige zuerst) und Kennzahlen im Rahmen der Sichtbarkeit; ohne Aufgabenrecht kein Block", async () => {
    const { ctx, club, people } = await setup();
    await prisma.task.createMany({
      data: [
        {
          clubId: club.id,
          title: "Meine spät",
          assigneeMemberId: people.helper.member.id,
          dueDate: calendarDay(3),
        },
        {
          clubId: club.id,
          title: "Meine überfällig",
          assigneeMemberId: people.helper.member.id,
          dueDate: calendarDay(-1),
        },
        {
          clubId: club.id,
          title: "Erledigt",
          assigneeMemberId: people.helper.member.id,
          status: "DONE",
        },
        { clubId: club.id, title: "Fremde", assigneeMemberId: people.admin.member.id },
      ],
    });

    const helper = await getDashboard(ctx.helper);
    expect(helper.tasks!.mine.map((t) => t.title)).toEqual(["Meine überfällig", "Meine spät"]);
    expect(helper.tasks!.mine[0]!.overdue).toBe(true);
    expect(helper.tasks!.stats).toEqual({ open: 2, overdue: 1, mineOpen: 2 }); // nur, was die Helferin sehen darf

    const admin = await getDashboard(ctx.admin);
    expect(admin.tasks!.stats).toEqual({ open: 3, overdue: 1, mineOpen: 1 });
    expect(admin.tasks!.mine.map((t) => t.title)).toEqual(["Fremde"]);

    expect((await getDashboard(ctx.member)).tasks).toBeNull();
  });

  it("Helfer und Mitglieder sehen die Zahlen ihres Vereins nicht – auch nicht über Umwege (Mitglieder-Block ist null)", async () => {
    const { ctx } = await setup();
    expect((await getDashboard(ctx.helper)).members).toBeNull();
    expect((await getDashboard(ctx.helper)).birthdays).toBeNull();
    expect((await getDashboard(ctx.member)).members).toBeNull();
  });

  it("Trendlinien für Mitglieder und Helferstunden: 12 Wochen, älteste zuerst", async () => {
    const { ctx, club, people } = await setup();
    // Die Testkonten aus setup() haben (wie viele echte Altbestände) kein Eintrittsdatum – sie tauchen in der
    // Trendlinie bewusst nirgends auf (siehe `membersAtBucketEnds`: ohne Eintrittsdatum nicht einordbar), zählen aber
    // bei `total` mit. Nur Mitglieder MIT Eintrittsdatum prägen deshalb hier den Verlauf.
    await prisma.member.create({
      data: {
        clubId: club.id,
        firstName: "Alt",
        lastName: "Eingetreten",
        status: "ACTIVE",
        joinedAt: new Date(Date.now() - 90 * DAY), // vor der Trendlinie (12 Wochen = 84 Tage) beigetreten
      },
    });
    await prisma.member.create({
      data: {
        clubId: club.id,
        firstName: "Neu",
        lastName: "Eingetreten",
        status: "ACTIVE",
        joinedAt: new Date(Date.now() - 14 * DAY), // innerhalb der Trendlinie beigetreten
      },
    });
    const event = await createEvent(club.id, { title: "Fest", startsAt: inDays(-1) });
    const shift = await createShift(club.id, event.id, { title: "Aufbau", startsAt: inDays(-1) });
    await prisma.shiftAssignment.create({
      data: {
        clubId: club.id,
        shiftId: shift.id,
        memberId: people.helper.member.id,
        workedMinutes: 90,
      },
    });

    const data = await getDashboard(ctx.admin);
    expect(data.members!.trend).toHaveLength(12);
    expect(data.members!.trend[0]).toBe(1); // vor 12 Wochen: nur "Alt Eingetreten" war schon dabei
    expect(data.members!.trend.at(-1)).toBe(2); // laufende Woche: beide beigetreten
    expect(Math.min(...data.members!.trend)).toBeGreaterThanOrEqual(1); // steigt, fällt nie unter den Altbestand

    expect(data.shifts!.hours.trend).toHaveLength(12);
    expect(data.shifts!.hours.trend.at(-1)).toBe(1.5); // 90 Minuten, diese Woche geleistet
    expect(data.shifts!.hours.trend.slice(0, -1).every((v) => v === 0)).toBe(true); // sonst nichts dokumentiert
  });

  it("Besetzungsstand (für die Fortschrittsanzeige der Kennzahlenkarte): Summe über alle kommenden Schichten", async () => {
    const { ctx, club, people } = await setup();
    const event = await createEvent(club.id, { title: "Fest", startsAt: inDays(5) });
    const staffed = await createShift(club.id, event.id, {
      title: "Kasse",
      startsAt: inDays(5),
      requiredCount: 2,
    });
    await createShift(club.id, event.id, {
      title: "Aufbau",
      startsAt: inDays(5),
      requiredCount: 3,
    });
    await prisma.shiftAssignment.create({
      data: { clubId: club.id, shiftId: staffed.id, memberId: people.helper.member.id },
    });

    const data = await getDashboard(ctx.admin);
    expect(data.shifts!.staffing).toEqual({ filled: 1, required: 5 }); // 1 von 2 (Kasse) + 0 von 3 (Aufbau)
    expect(data.shifts!.freeSpots).toBe(4);
  });
});

describe("Dashboard: Geburtstage", () => {
  it("nächste 14 Tage, sortiert; ohne Archiv, Papierkorb, Ausgetretene und ohne Geburtsdatum; korrektes Alter", async () => {
    const { ctx, club } = await setup();
    const base = new Date();
    const on = (days: number, year: number) => {
      const d = calendarDay(days);
      return new Date(Date.UTC(year, d.getUTCMonth(), d.getUTCDate()));
    };
    await prisma.member.createMany({
      data: [
        { clubId: club.id, firstName: "Heute", lastName: "Z", birthDate: on(0, 2000) },
        { clubId: club.id, firstName: "Morgen", lastName: "A", birthDate: on(1, 1985) },
        { clubId: club.id, firstName: "In13Tagen", lastName: "M", birthDate: on(13, 1970) },
        { clubId: club.id, firstName: "In30Tagen", lastName: "M", birthDate: on(30, 1970) },
        {
          clubId: club.id,
          firstName: "Archiv",
          lastName: "M",
          birthDate: on(2, 1970),
          archivedAt: new Date(),
        },
        {
          clubId: club.id,
          firstName: "Papierkorb",
          lastName: "M",
          birthDate: on(2, 1970),
          deletedAt: new Date(),
        },
        {
          clubId: club.id,
          firstName: "Ausgetreten",
          lastName: "M",
          birthDate: on(2, 1970),
          status: "LEFT",
        },
        { clubId: club.id, firstName: "OhneDatum", lastName: "M" },
      ],
    });
    const list = await listUpcomingBirthdays(ctx.admin, { days: 14 });
    expect(list.map((b) => b.name)).toEqual(["Heute Z", "Morgen A", "In13Tagen M"]);
    expect(list.map((b) => b.inDays)).toEqual([0, 1, 13]);
    const currentYear = base.getUTCFullYear();
    expect(list[0]!.turns).toBe(
      currentYear - 2000 + (list[0]!.date.getUTCFullYear() - currentYear),
    );
    expect(list[1]!.turns).toBe(list[1]!.date.getUTCFullYear() - 1985);

    // Begrenzung und Zeitraum sind einstellbar.
    expect(await listUpcomingBirthdays(ctx.admin, { days: 60, limit: 2 })).toHaveLength(2);
    expect((await listUpcomingBirthdays(ctx.admin, { days: 60 })).map((b) => b.name)).toContain(
      "In30Tagen M",
    );
  });

  it("ohne Berechtigung für sensible Daten ist die Liste leer", async () => {
    const { ctx, club } = await setup();
    await prisma.member.create({
      data: {
        clubId: club.id,
        firstName: "Bald",
        lastName: "Geburtstag",
        birthDate: calendarDay(1),
      },
    });
    expect(await listUpcomingBirthdays(ctx.helper)).toEqual([]);
    expect(await listUpcomingBirthdays(ctx.member)).toEqual([]);
    expect((await listUpcomingBirthdays(ctx.board)).map((b) => b.name)).toEqual([
      "Bald Geburtstag",
    ]);
  });
});

describe("Dashboard: Mandantentrennung", () => {
  it("enthält nur Daten des eigenen Vereins", async () => {
    const a = await setup();
    const b = await setup();
    await createEvent(a.club.id, { title: "Fest A", startsAt: inDays(3) });
    await createEvent(b.club.id, { title: "Fest B", startsAt: inDays(3) });
    await prisma.member.create({
      data: {
        clubId: b.club.id,
        firstName: "Fremd",
        lastName: "Geburtstag",
        birthDate: calendarDay(1),
      },
    });

    const data = await getDashboard(a.ctx.admin);
    expect(data.events!.upcoming.map((e) => e.title)).toEqual(["Fest A"]);
    expect(data.members!.total).toBe(5);
    expect(data.birthdays).toEqual([]);
    expect(JSON.stringify(data)).not.toContain("Fest B");
    expect(JSON.stringify(data)).not.toContain("Fremd");
  });
});
