import { describe, expect, it } from "vitest";
import type {
  AnalyticsData,
  ChartDataset,
  DistributionDataset,
  TimeDataset,
} from "@/lib/charts/types";
import { listRecentActivity } from "@/modules/audit/service";
import { getAnalytics } from "@/modules/dashboard/analytics";
import { getDashboard } from "@/modules/dashboard/service";
import { prisma } from "@/server/db/client";
import { addUserToClub, contextFor, createClub, createDepartment } from "../helpers/factories";

// Fester Zeitpunkt: Montag, 21.09.2026, 12:00 Uhr Berlin. Alle Testdaten liegen absolut relativ dazu – das Ergebnis hängt nicht vom Testdatum ab.
const NOW = new Date("2026-09-21T10:00:00Z");
const day = (iso: string) => new Date(`${iso}T00:00:00Z`); // reiner Kalendertag wie @db.Date
const at = (iso: string) => new Date(`${iso}T10:00:00Z`);

async function setup() {
  const club = await createClub("Auswertungsverein");
  const fussball = await createDepartment(club.id, "Fußball");
  const handball = await createDepartment(club.id, "Handball");
  const admin = await addUserToClub(club, "CLUB_ADMIN");
  const lead = await addUserToClub(club, "DEPARTMENT_LEAD", { ledDepartmentIds: [fussball.id] });
  const helper = await addUserToClub(club, "HELPER", { firstName: "Hanna", lastName: "Helfer" });
  const member = await addUserToClub(club, "MEMBER");
  return {
    club,
    fussball,
    handball,
    people: { admin, lead, helper, member },
    ctx: {
      admin: await contextFor(admin.user.id, club.id),
      lead: await contextFor(lead.user.id, club.id),
      helper: await contextFor(helper.user.id, club.id),
      member: await contextFor(member.user.id, club.id),
    },
  };
}

const topicOf = (data: AnalyticsData, id: string) => data.topics.find((topic) => topic.id === id);
const datasetOf = <T extends ChartDataset>(data: AnalyticsData, topic: string, id: string): T => {
  const found = topicOf(data, topic)?.datasets.find((dataset) => dataset.id === id);
  if (!found) throw new Error(`Diagramm ${topic}/${id} fehlt`);
  return found as T;
};
const slicesById = (dataset: DistributionDataset, view: "ALL" | "W" | "M" | "Q" | "Y" = "ALL") =>
  Object.fromEntries((dataset.views[view] ?? []).map((slice) => [slice.id, slice.value]));

async function createEvents(clubId: string) {
  const make = (
    title: string,
    startsAt: Date,
    over: {
      type?: "EVENT" | "TRAINING" | "MEETING";
      status?: "PUBLISHED" | "DRAFT" | "CANCELLED" | "ARCHIVED";
    } = {},
  ) =>
    prisma.event.create({
      data: {
        clubId,
        title,
        type: over.type ?? "EVENT",
        status: over.status ?? "PUBLISHED",
        startsAt,
        endsAt: new Date(startsAt.getTime() + 3_600_000),
      },
    });
  return {
    sep1: await make("Sep 1", at("2026-09-10")),
    sepLater: await make("Sep später (geplant)", at("2026-09-28")), // nach „jetzt“, aber im laufenden Monat
    aug1: await make("Aug 1", at("2026-08-15"), { type: "TRAINING" }),
    aug2: await make("Aug 2", at("2026-08-20"), { type: "TRAINING" }),
    may: await make("Mai", at("2026-05-01"), { type: "MEETING" }),
    draft: await make("Entwurf", at("2026-09-12"), { status: "DRAFT" }),
    cancelled: await make("Abgesagt", at("2026-09-13"), { status: "CANCELLED" }),
    archived: await make("Archiv", at("2026-09-14"), { status: "ARCHIVED" }),
    old: await make("Uralt", at("2019-03-01")), // außerhalb aller Zeiträume
  };
}

describe("Auswertungen: Mitglieder", () => {
  it("Bestand je Monat (Eintritt/Austritt), Verteilung nach Status – ohne Papierkorb, Archiv nur im Verlauf", async () => {
    const { ctx, club } = await setup();
    await prisma.member.createMany({
      data: [
        { clubId: club.id, firstName: "A", lastName: "Aktiv", joinedAt: day("2025-01-10") },
        { clubId: club.id, firstName: "B", lastName: "Neu", joinedAt: day("2026-09-15") },
        {
          clubId: club.id,
          firstName: "C",
          lastName: "Ausgetreten",
          status: "LEFT",
          joinedAt: day("2024-05-01"),
          leftAt: day("2026-03-31"),
        },
        { clubId: club.id, firstName: "D", lastName: "OhneDatum" },
        {
          clubId: club.id,
          firstName: "E",
          lastName: "Archiviert",
          status: "LEFT",
          joinedAt: day("2025-06-01"),
          leftAt: day("2026-01-15"),
          archivedAt: new Date("2026-02-01T00:00:00Z"),
        },
        {
          clubId: club.id,
          firstName: "F",
          lastName: "Gelöscht",
          joinedAt: day("2025-01-01"),
          deletedAt: new Date("2026-01-01T00:00:00Z"),
        },
      ],
    });

    const data = await getAnalytics(ctx.admin, NOW);
    const trend = datasetOf<TimeDataset>(data, "members", "members-trend");

    // Die vier Konten haben kein Eintrittsdatum und fehlen im Verlauf; D ebenfalls. F liegt im Papierkorb.
    // Monate: Okt 25 … Sep 26. A, C, E zählen zunächst; E geht im Januar, C zum 31.3.; B kommt im September.
    expect(trend.views.M!.values[0]).toEqual([3, 3, 3, 2, 2, 1, 1, 1, 1, 1, 1, 2]);
    expect(trend.views.M!.buckets.at(0)!.label).toBe("Okt 25");
    expect(trend.views.M!.buckets.at(-1)).toMatchObject({ label: "Sep 26", partial: true });
    expect(trend.granularities).toEqual(["M", "Q", "Y"]); // für Bestände sind Wochen nicht sinnvoll
    expect(trend.views.W).toBeUndefined();
    expect(trend.views.Q!.values[0]!.at(-1)).toBe(2);
    expect(trend.views.Y!.values[0]!.at(-1)).toBe(2);
    expect(trend.note).toContain("fehlen"); // offen benennen, wer nicht gezählt werden konnte

    const status = datasetOf<DistributionDataset>(data, "members", "members-status");
    // aktuell, ohne Archiv und Papierkorb: vier Konten + A + B + D aktiv, C ausgetreten
    expect(slicesById(status)).toEqual({ ACTIVE: 4 + 3, LEFT: 1 });
    expect(status.views.ALL!.map((slice) => slice.slot)).toEqual([1, 4]); // feste Farbposition je Status
    expect(status.types).toEqual(["donut", "bar"]);
  });

  it("Abteilungsleiter sieht nur die eigene Abteilung", async () => {
    const { ctx, club, fussball, handball } = await setup();
    const mk = async (firstName: string, departmentId: string, joined: string) => {
      const member = await prisma.member.create({
        data: { clubId: club.id, firstName, lastName: "T", joinedAt: day(joined) },
      });
      await prisma.memberDepartment.create({
        data: { clubId: club.id, memberId: member.id, departmentId },
      });
    };
    await mk("Fritz", fussball.id, "2025-02-01");
    await mk("Franz", fussball.id, "2026-08-01");
    await mk("Hanna", handball.id, "2025-02-01");

    const lead = await getAnalytics(ctx.lead, NOW);
    const trend = datasetOf<TimeDataset>(lead, "members", "members-trend");
    expect(trend.views.M!.values[0]!.at(-1)).toBe(2); // Fritz + Franz, nicht Hanna
    expect(trend.description).toContain("deiner Abteilung");
    const status = datasetOf<DistributionDataset>(lead, "members", "members-status");
    expect(status.description).toContain("Abteilung");
    expect(Object.values(slicesById(status)).reduce((a, b) => a + b, 0)).toBe(3); // Fritz, Franz und der Leiter selbst

    const admin = await getAnalytics(ctx.admin, NOW);
    expect(
      datasetOf<TimeDataset>(admin, "members", "members-trend").views.M!.values[0]!.at(-1),
    ).toBe(3);
  });
});

describe("Auswertungen: Veranstaltungen", () => {
  it("zählt veröffentlichte und abgeschlossene Termine je Zeitraum; Entwürfe, Abgesagte, Archivierte und Uraltes nicht", async () => {
    const { ctx, club } = await setup();
    await createEvents(club.id);
    const data = await getAnalytics(ctx.admin, NOW);
    const trend = datasetOf<TimeDataset>(data, "events", "events-trend");

    // Monate: Mai = 1, Aug = 2, Sep = 2 (der geplante Termin nach „jetzt“ gehört zum laufenden Monat)
    const months = trend.views.M!.values[0]!;
    expect(months.at(-1)).toBe(2);
    expect(months.at(-2)).toBe(2);
    expect(months.at(-5)).toBe(1); // Mai 2026
    expect(months.reduce((a, b) => a + b, 0)).toBe(5);
    // Quartale: Q3 = 4 (Aug + Sep), Q2 = 1 (Mai); Jahre: 2026 = 5, das Jahr 2019 liegt außerhalb
    expect(trend.views.Q!.values[0]!.slice(-2)).toEqual([1, 4]);
    expect(trend.views.Y!.values[0]!.at(-1)).toBe(5);
    expect(trend.views.Y!.values[0]!.reduce((a, b) => a + b, 0)).toBe(5);
    expect(trend.granularities).toEqual(["W", "M", "Q", "Y"]);
    expect(trend.types).toEqual(["bar", "line", "area"]);
    // Wochen: die letzten zwölf Wochen enthalten 10.9. (KW 37) und 20.8./15.8.; nichts wird doppelt gezählt
    expect(trend.views.W!.values[0]!.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(5);

    const byType = datasetOf<DistributionDataset>(data, "events", "events-type");
    expect(slicesById(byType, "M")).toEqual({ EVENT: 2, TRAINING: 2, MEETING: 1 });
    expect(slicesById(byType, "Y")).toEqual({ EVENT: 2, TRAINING: 2, MEETING: 1 });
    expect(byType.views.M!.map((slice) => slice.slot).sort()).toEqual([1, 2, 3]); // feste Farbpositionen
  });

  it("Mitglied sieht dieselben veröffentlichten Termine, aber keine Entwürfe", async () => {
    const { ctx, club } = await setup();
    await createEvents(club.id);
    const trend = datasetOf<TimeDataset>(
      await getAnalytics(ctx.member, NOW),
      "events",
      "events-trend",
    );
    expect(trend.views.M!.values[0]!.reduce((a, b) => a + b, 0)).toBe(5);
  });
});

describe("Auswertungen: Helferstunden", () => {
  async function work(
    clubId: string,
    shiftDate: string,
    entries: { memberId: string; minutes: number | null; status?: "CONFIRMED" | "CANCELLED" }[],
  ) {
    const event = await prisma.event.create({
      data: {
        clubId,
        title: `Einsatz ${shiftDate}`,
        status: "PUBLISHED",
        startsAt: at(shiftDate),
        endsAt: new Date(at(shiftDate).getTime() + 4 * 3_600_000),
      },
    });
    const shift = await prisma.eventShift.create({
      data: {
        clubId,
        eventId: event.id,
        title: "Schicht",
        startsAt: at(shiftDate),
        endsAt: new Date(at(shiftDate).getTime() + 3 * 3_600_000),
        requiredCount: 5,
      },
    });
    for (const entry of entries) {
      await prisma.shiftAssignment.create({
        data: {
          clubId,
          shiftId: shift.id,
          memberId: entry.memberId,
          status: entry.status ?? "CONFIRMED",
          workedMinutes: entry.minutes,
        },
      });
    }
  }

  it("Veranstalter sehen alle dokumentierten Stunden in Stunden je Zeitraum; Stornierte und Undokumentierte zählen nicht", async () => {
    const { ctx, club, people } = await setup();
    await work(club.id, "2026-09-05", [
      { memberId: people.helper.member.id, minutes: 120 },
      { memberId: people.member.member.id, minutes: 60 },
      { memberId: people.admin.member.id, minutes: null }, // nicht dokumentiert
    ]);
    await work(club.id, "2026-07-10", [
      { memberId: people.helper.member.id, minutes: 90 },
      { memberId: people.member.member.id, minutes: 45, status: "CANCELLED" }, // storniert
    ]);
    const trend = datasetOf<TimeDataset>(
      await getAnalytics(ctx.admin, NOW),
      "hours",
      "hours-trend",
    );
    expect(trend.title).toBe("Helferstunden");
    expect(trend.unit).toEqual({ singular: "Std.", plural: "Std.", decimals: 1 });
    const months = trend.views.M!.values[0]!;
    expect(months.at(-1)).toBe(3); // 120 + 60 Minuten im September
    expect(months.at(-3)).toBe(1.5); // 90 Minuten im Juli
    expect(months.reduce((a, b) => a + b, 0)).toBe(4.5);
    expect(trend.views.Y!.values[0]!.at(-1)).toBe(4.5);
  });

  it("Helferin sieht nur die eigenen Stunden", async () => {
    const { ctx, club, people } = await setup();
    await work(club.id, "2026-09-05", [
      { memberId: people.helper.member.id, minutes: 120 },
      { memberId: people.member.member.id, minutes: 600 },
    ]);
    const trend = datasetOf<TimeDataset>(
      await getAnalytics(ctx.helper, NOW),
      "hours",
      "hours-trend",
    );
    expect(trend.title).toBe("Meine Helferstunden");
    expect(trend.views.M!.values[0]!.at(-1)).toBe(2); // die 10 Stunden des Mitglieds bleiben verborgen
  });
});

describe("Auswertungen: Aufgaben", () => {
  it("Verteilung nach Status im Rahmen der Sichtbarkeit", async () => {
    const { ctx, club, people } = await setup();
    await prisma.task.createMany({
      data: [
        { clubId: club.id, title: "a", status: "OPEN", assigneeMemberId: people.helper.member.id },
        { clubId: club.id, title: "b", status: "OPEN" },
        { clubId: club.id, title: "c", status: "DONE", assigneeMemberId: people.helper.member.id },
        { clubId: club.id, title: "d", status: "DONE" },
        { clubId: club.id, title: "e", status: "DONE" },
        { clubId: club.id, title: "f", status: "BLOCKED" },
        { clubId: club.id, title: "gelöscht", status: "OPEN", deletedAt: new Date() },
      ],
    });
    const admin = datasetOf<DistributionDataset>(
      await getAnalytics(ctx.admin, NOW),
      "tasks",
      "tasks-status",
    );
    expect(slicesById(admin)).toEqual({ OPEN: 2, DONE: 3, BLOCKED: 1 });
    expect(admin.views.ALL!.map((slice) => slice.id)).toEqual(["DONE", "OPEN", "BLOCKED"]); // nach Größe sortiert
    expect(admin.views.ALL!.find((slice) => slice.id === "OPEN")!.slot).toBe(1);

    const helper = datasetOf<DistributionDataset>(
      await getAnalytics(ctx.helper, NOW),
      "tasks",
      "tasks-status",
    );
    expect(slicesById(helper)).toEqual({ OPEN: 1, DONE: 1 }); // nur die eigenen
  });
});

describe("Auswertungen: Berechtigungen, Mandanten, leerer Verein", () => {
  it("jede Rolle bekommt nur die Themen, die sie sehen darf", async () => {
    const { ctx } = await setup();
    const topics = async (context: typeof ctx.admin) =>
      (await getAnalytics(context, NOW)).topics.map((topic) => topic.id);
    expect(await topics(ctx.admin)).toEqual(["members", "events", "hours", "tasks"]);
    expect(await topics(ctx.lead)).toEqual(["members", "events", "hours", "tasks"]);
    const helper = await topics(ctx.helper);
    expect(helper).not.toContain("members"); // Mitgliederzahlen sind nicht für Helfer
    expect(helper).toContain("events");
    const member = await topics(ctx.member);
    expect(member).not.toContain("members");
    expect(member).not.toContain("tasks"); // kein Aufgabenrecht
    expect(member).toEqual(expect.arrayContaining(["events", "hours"]));
  });

  it("Mandantentrennung: Daten eines anderen Vereins fließen nie ein", async () => {
    const { ctx, club } = await setup();
    const other = await createClub("Anderer Verein");
    await createEvents(other.id);
    await prisma.member.create({
      data: { clubId: other.id, firstName: "X", lastName: "Fremd", joinedAt: day("2025-01-01") },
    });
    await prisma.task.create({ data: { clubId: other.id, title: "fremd", status: "OPEN" } });
    await createEvents(club.id); // eigene Daten zum Vergleich

    const data = await getAnalytics(ctx.admin, NOW);
    expect(
      datasetOf<TimeDataset>(data, "events", "events-trend").views.M!.values[0]!.reduce(
        (a, b) => a + b,
        0,
      ),
    ).toBe(5);
    expect(
      datasetOf<TimeDataset>(data, "members", "members-trend").views.M!.values[0]!.at(-1),
    ).toBe(0);
    expect(datasetOf<DistributionDataset>(data, "tasks", "tasks-status").views.ALL).toEqual([]);
  });

  it("leerer Verein: alles 0 bzw. leer, nichts bricht", async () => {
    const { ctx } = await setup();
    const data = await getAnalytics(ctx.admin, NOW);
    for (const topic of data.topics) {
      for (const dataset of topic.datasets) {
        if (dataset.kind === "time") {
          for (const view of Object.values(dataset.views)) {
            expect(view!.values.every((row) => row.every((value) => value === 0))).toBe(true);
            expect(view!.buckets).toHaveLength(view!.values[0]!.length);
          }
        }
      }
    }
    expect(datasetOf<DistributionDataset>(data, "tasks", "tasks-status").views.ALL).toEqual([]);
    // Die Konten selbst sind Mitglieder (aktiv) – die Statusverteilung ist also nie leer.
    expect(
      slicesById(datasetOf<DistributionDataset>(data, "members", "members-status")).ACTIVE,
    ).toBe(4);
  });

  it("alle Auflösungen liefern die richtige Anzahl Zeiträume", async () => {
    const { ctx } = await setup();
    const trend = datasetOf<TimeDataset>(
      await getAnalytics(ctx.admin, NOW),
      "events",
      "events-trend",
    );
    expect(
      Object.fromEntries(Object.entries(trend.views).map(([g, v]) => [g, v!.buckets.length])),
    ).toEqual({ W: 12, M: 12, Q: 8, Y: 5 });
  });
});

describe("Dashboard: letzte Aktivitäten", () => {
  it("nur mit Zugriff auf das Änderungsprotokoll; ohne Anmeldungen; nur der eigene Verein; neueste zuerst", async () => {
    const { ctx, club, people } = await setup();
    const other = await createClub("Fremder Verein");
    const log = (clubId: string, action: string, summary: string, createdAt: string) =>
      prisma.auditLog.create({
        data: {
          clubId,
          actorUserId: people.admin.user.id,
          action,
          entityType: "X",
          summary,
          createdAt: new Date(createdAt),
        },
      });
    await log(club.id, "event.created", "Sommerfest angelegt", "2026-09-01T10:00:00Z");
    await log(club.id, "auth.login", "Anmeldung", "2026-09-02T10:00:00Z"); // zählt nicht als Vereinsgeschehen
    await log(club.id, "member.created", "Max Muster angelegt", "2026-09-03T10:00:00Z");
    await log(other.id, "event.created", "Geheimes Fest", "2026-09-04T10:00:00Z");

    const entries = await listRecentActivity(ctx.admin, 10);
    expect(entries.map((entry) => entry.summary)).toEqual([
      "Max Muster angelegt",
      "Sommerfest angelegt",
    ]);
    expect(entries[0]!.actor).toMatchObject({ kind: "USER" });

    expect((await getDashboard(ctx.admin)).activity).toHaveLength(2);
    expect((await getDashboard(ctx.member)).activity).toBeNull(); // kein Recht auf das Protokoll
    expect((await getDashboard(ctx.helper)).activity).toBeNull();
    await expect(listRecentActivity(ctx.member)).rejects.toThrow();
  });
});
