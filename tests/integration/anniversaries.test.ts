import { describe, expect, it } from "vitest";
import type { MemberStatus } from "@/generated/prisma/enums";
import { parseCalendarDate } from "@/lib/dates";
import { getDashboard } from "@/modules/dashboard/service";
import {
  canSeeAnniversaries,
  exportAnniversariesCsv,
  listAnniversaries,
  listUpcomingAnniversaries,
} from "@/modules/members/anniversaries";
import { prisma } from "@/server/db/client";
import { addUserToClub, contextFor, createClub, createDepartment } from "../helpers/factories";

const day = (value: string) => parseCalendarDate(value)!;
/** Fester Zeitpunkt: 14.10.2026, 12:00 Uhr in Berlin. */
const NOW = new Date("2026-10-14T10:00:00Z");

async function setup(name = "Jubiläumsverein") {
  const club = await createClub(name);
  const fussball = await createDepartment(club.id, "Fußball");
  const handball = await createDepartment(club.id, "Handball");
  const admin = await addUserToClub(club, "CLUB_ADMIN");
  const lead = await addUserToClub(club, "DEPARTMENT_LEAD", { ledDepartmentIds: [fussball.id] });
  const helper = await addUserToClub(club, "HELPER");
  const member = await addUserToClub(club, "MEMBER");

  const add = async (
    firstName: string,
    data: {
      joinedAt?: Date | null;
      leftAt?: Date | null;
      status?: MemberStatus;
      archivedAt?: Date | null;
      deletedAt?: Date | null;
      memberNumber?: string;
      departmentIds?: string[];
    } = {},
  ) => {
    const created = await prisma.member.create({
      data: {
        clubId: club.id,
        firstName,
        lastName: "Jubilar",
        joinedAt: data.joinedAt ?? null,
        leftAt: data.leftAt ?? null,
        status: data.status ?? "ACTIVE",
        archivedAt: data.archivedAt ?? null,
        deletedAt: data.deletedAt ?? null,
        memberNumber: data.memberNumber ?? null,
      },
    });
    for (const departmentId of data.departmentIds ?? [])
      await prisma.memberDepartment.create({
        data: { clubId: club.id, memberId: created.id, departmentId },
      });
    return created;
  };

  return {
    club,
    fussball,
    handball,
    add,
    ctx: {
      admin: await contextFor(admin.user.id, club.id),
      lead: await contextFor(lead.user.id, club.id),
      helper: await contextFor(helper.user.id, club.id),
      member: await contextFor(member.user.id, club.id),
    },
  };
}

describe("Ehrungen: Jubiläen eines Jahres", () => {
  it("nach Stufe gruppiert (höchste zuerst), mit Abteilungen; Archiv, Papierkorb, Gesperrte und vorher Ausgetretene fehlen", async () => {
    const { ctx, add, fussball, handball } = await setup();
    await add("Fünfzig", {
      joinedAt: day("1976-05-01"),
      memberNumber: "M-50",
      departmentIds: [handball.id, fussball.id],
    });
    await add("ZehnSpät", { joinedAt: day("2016-11-20") });
    await add("ZehnFrüh", { joinedAt: day("2016-02-03") });
    await add("Schalttag", { joinedAt: day("2000-02-29"), status: "PASSIVE" }); // 26 Jahre: keine Stufe
    await add("Ehren", { joinedAt: day("1951-12-31"), status: "HONORARY" }); // 75 Jahre am 31.12.
    await add("Elf", { joinedAt: day("2015-06-01") }); // 11 Jahre: keine Stufe
    await add("Archiv", { joinedAt: day("2001-03-01"), archivedAt: new Date() });
    await add("Papierkorb", { joinedAt: day("2001-03-01"), deletedAt: new Date() });
    await add("Gesperrt", { joinedAt: day("2001-03-01"), status: "BLOCKED" });
    await add("Vorher", {
      joinedAt: day("2001-08-01"),
      leftAt: day("2026-07-31"),
      status: "LEFT",
    });
    await add("Danach", { joinedAt: day("2001-08-01"), leftAt: day("2026-09-30"), status: "LEFT" });
    await add("OhneDatumLeft", { joinedAt: day("2001-08-01"), status: "LEFT" });
    await add("OhneEintritt");
    await add("OhneEintrittArchiv", { archivedAt: new Date() });

    const overview = await listAnniversaries(ctx.admin, { year: 2026 });
    expect(overview).toMatchObject({ year: 2026, scope: "CLUB", total: 5 });
    expect(overview.groups.map((g) => g.years)).toEqual([75, 50, 25, 10]);
    expect(overview.groups.map((g) => g.entries.map((e) => e.firstName))).toEqual([
      ["Ehren"],
      ["Fünfzig"],
      ["Danach"],
      ["ZehnFrüh", "ZehnSpät"],
    ]);
    const fifty = overview.groups[1]!.entries[0]!;
    expect(fifty).toMatchObject({
      memberNumber: "M-50",
      departments: ["Fußball", "Handball"],
      years: 50,
      date: day("2026-05-01"),
    });
    expect(overview.groups[2]!.entries[0]!.leftAt).toEqual(day("2026-09-30"));
    // Die vier Konten aus dem Aufbau haben kein Eintrittsdatum, dazu „OhneEintritt“; das archivierte zählt nicht.
    expect(overview.withoutJoinDate).toBe(5);

    // Ohne Jahresangabe: das laufende Jahr in Berlin
    expect((await listAnniversaries(ctx.admin, { now: NOW })).year).toBe(2026);
    // Ein anderes Jahr: der Schalttag-Eintritt hat 2025 seine 25 Jahre – am 28. Februar; „Elf“ hatte 2025 seine 10.
    const in2025 = await listAnniversaries(ctx.admin, { year: 2025 });
    expect(in2025.groups.map((g) => [g.years, g.entries.map((e) => e.firstName)])).toEqual([
      [25, ["Schalttag"]],
      [10, ["Elf"]],
    ]);
    expect(in2025.groups[0]!.entries[0]!.date).toEqual(day("2025-02-28"));
  });

  it("Abteilungsleiter sieht nur Mitglieder der eigenen Abteilungen", async () => {
    const { ctx, add, fussball, handball } = await setup();
    await add("Fritz", { joinedAt: day("2001-03-01"), departmentIds: [fussball.id] });
    await add("Hanna", { joinedAt: day("2001-03-01"), departmentIds: [handball.id] });
    await add("Ohne", { joinedAt: day("2001-03-01") });
    await add("FritzOhneEintritt", { departmentIds: [fussball.id] });

    const lead = await listAnniversaries(ctx.lead, { year: 2026 });
    expect(lead.scope).toBe("DEPARTMENT");
    expect(lead.groups.flatMap((g) => g.entries.map((e) => e.firstName))).toEqual(["Fritz"]);
    // Der Leiter selbst (Mitglied der Abteilung, ohne Eintritt) und „FritzOhneEintritt“
    expect(lead.withoutJoinDate).toBe(2);

    const admin = await listAnniversaries(ctx.admin, { year: 2026 });
    expect(admin.groups.flatMap((g) => g.entries.map((e) => e.firstName))).toEqual([
      "Fritz",
      "Hanna",
      "Ohne",
    ]);

    const upcoming = await listUpcomingAnniversaries(ctx.lead, {
      now: new Date("2026-02-20T10:00:00Z"),
    });
    expect(upcoming.map((u) => u.name)).toEqual(["Fritz Jubilar"]);
  });

  it("Helfer und Mitglieder (nur eigener Datensatz) sehen keine Ehrungen", async () => {
    const { ctx, add } = await setup();
    await add("Bald", { joinedAt: day("2016-10-20") });
    for (const role of [ctx.helper, ctx.member]) {
      expect(canSeeAnniversaries(role)).toBe(false);
      await expect(listAnniversaries(role, { year: 2026 })).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(await listUpcomingAnniversaries(role, { now: NOW })).toEqual([]);
    }
    expect(canSeeAnniversaries(ctx.admin)).toBe(true);
    expect(canSeeAnniversaries(ctx.lead)).toBe(true);
  });

  it("Mandantentrennung: Mitglieder eines anderen Vereins erscheinen nie", async () => {
    const a = await setup("Verein A");
    const b = await setup("Verein B");
    await a.add("Eigen", { joinedAt: day("2001-11-01") });
    await b.add("Fremd", { joinedAt: day("2001-11-01") });

    const overview = await listAnniversaries(a.ctx.admin, { year: 2026 });
    expect(overview.groups.flatMap((g) => g.entries.map((e) => e.firstName))).toEqual(["Eigen"]);
    const upcoming = await listUpcomingAnniversaries(a.ctx.admin, { now: NOW });
    expect(upcoming.map((u) => u.name)).toEqual(["Eigen Jubilar"]);
    const csv = (await exportAnniversariesCsv(a.ctx.admin, { year: 2026 })).csv;
    expect(csv).toContain("Eigen");
    expect(csv).not.toContain("Fremd");
  });
});

describe("Ehrungen: anstehende Jubiläen (Dashboard)", () => {
  it("nächste 60 Tage, heute zählt mit, sortiert, höchstens fünf; über den Jahreswechsel", async () => {
    const { ctx, add } = await setup();
    await add("Heute", { joinedAt: day("2016-10-14") });
    await add("Gestern", { joinedAt: day("2016-10-13") });
    await add("In60", { joinedAt: day("2001-12-13") });
    await add("In61", { joinedAt: day("2001-12-14") });
    await add("Morgen", { joinedAt: day("1976-10-15") });
    await add("Austritt", { joinedAt: day("2001-11-01"), leftAt: day("2026-10-31") });
    await add("Archiv", { joinedAt: day("2001-11-01"), archivedAt: new Date() });

    const list = await listUpcomingAnniversaries(ctx.admin, { now: NOW });
    expect(list.map((u) => [u.name, u.years, u.inDays])).toEqual([
      ["Heute Jubilar", 10, 0],
      ["Morgen Jubilar", 50, 1],
      ["In60 Jubilar", 25, 60],
    ]);
    expect(list[0]!.date).toEqual(day("2026-10-14"));

    // Im Dezember: Jubiläen im Januar des Folgejahres
    await add("Januar", { joinedAt: day("1977-01-10") });
    const december = await listUpcomingAnniversaries(ctx.admin, {
      now: new Date("2026-12-20T10:00:00Z"),
    });
    expect(december.map((u) => [u.name, u.years, u.inDays])).toContainEqual([
      "Januar Jubilar",
      50,
      21,
    ]);

    // Begrenzung
    for (const first of ["A", "B", "C", "D", "E", "F"])
      await add(first, { joinedAt: day("2016-11-01") });
    expect(await listUpcomingAnniversaries(ctx.admin, { now: NOW })).toHaveLength(5);
    expect(await listUpcomingAnniversaries(ctx.admin, { now: NOW, limit: 20 })).toHaveLength(9);
  });

  it("das Dashboard liefert die Karte nur mit Berechtigung", async () => {
    const { ctx, add } = await setup();
    await add("Bald", { joinedAt: day("2016-10-20") });
    const admin = await getDashboard(ctx.admin, NOW);
    expect(admin.anniversaries!.map((a) => a.name)).toEqual(["Bald Jubilar"]);
    expect(admin.anniversaries![0]).toMatchObject({ years: 10, inDays: 6 });
    expect((await getDashboard(ctx.lead, NOW)).anniversaries).toEqual([]); // „Bald“ ist in keiner Abteilung
    expect((await getDashboard(ctx.helper, NOW)).anniversaries).toBeNull();
    expect((await getDashboard(ctx.member, NOW)).anniversaries).toBeNull();
  });
});

describe("Ehrungen: CSV-Export", () => {
  it("mit Exportrecht: Spalten und Werte, protokolliert; ohne Exportrecht verboten", async () => {
    const { ctx, add, club, fussball } = await setup();
    await add("Erika", {
      joinedAt: day("1976-05-01"),
      memberNumber: "M-7",
      departmentIds: [fussball.id],
    });

    const result = await exportAnniversariesCsv(ctx.admin, { year: 2026 });
    expect(result.filename).toBe("ehrungen-2026.csv");
    expect(result.count).toBe(1);
    const lines = result.csv.replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe(
      "Jubiläum (Jahre);Jubiläum am;Mitgliedsnummer;Vorname;Nachname;Status;Abteilungen;Eintrittsdatum;Austrittsdatum",
    );
    expect(lines[1]).toBe("50;01.05.2026;M-7;Erika;Jubilar;Aktiv;Fußball;01.05.1976;");

    const audit = await prisma.auditLog.findFirst({
      where: { clubId: club.id, action: "members.exported" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.summary).toBe("Ehrungen 2026: 1 Jubiläum als CSV exportiert");

    // Abteilungsleiter dürfen Ehrungen sehen, aber nicht exportieren (Standardrolle ohne `members:export`).
    await expect(exportAnniversariesCsv(ctx.lead, { year: 2026 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(exportAnniversariesCsv(ctx.member, { year: 2026 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
