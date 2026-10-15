import { describe, expect, it } from "vitest";
import { parseBerlinDateTime, startOfBerlinDate } from "@/lib/dates";
import {
  ATTENDANCE_LEAD_MINUTES,
  attendanceFilterQuery,
  attendanceFiltersFromParams,
  attendanceRate,
  attendanceWindow,
  averageAttendance,
  countStatuses,
  countsText,
  pendingAttendance,
  pendingAttendanceText,
  periodRange,
  saveAttendanceSchema,
} from "@/modules/events/attendance-schemas";

const MINUTE = 60_000;

describe("Anwesenheitsquote", () => {
  it("anwesend geteilt durch alle erfassten Termine der Person – entschuldigt zählt nicht als da", () => {
    expect(attendanceRate({ present: 3, excused: 1, absent: 0 })).toBe(0.75);
    expect(attendanceRate({ present: 5, excused: 0, absent: 0 })).toBe(1);
    expect(attendanceRate({ present: 0, excused: 2, absent: 2 })).toBe(0);
  });

  it("ohne einen einzigen erfassten Termin gibt es keine Quote (keine Division durch null)", () => {
    expect(attendanceRate({ present: 0, excused: 0, absent: 0 })).toBeNull();
  });

  it("Durchschnitt je erfasstem Termin; ohne Termin keiner", () => {
    expect(averageAttendance(19, 2)).toBe(9.5);
    expect(averageAttendance(0, 3)).toBe(0);
    expect(averageAttendance(0, 0)).toBeNull();
  });

  it("zählt die Auswahl einer Liste; offene Zeilen zählen nicht mit", () => {
    expect(countStatuses(["PRESENT", "PRESENT", "EXCUSED", null, "ABSENT"])).toEqual({
      present: 2,
      excused: 1,
      absent: 1,
    });
    expect(countsText({ present: 14, excused: 2, absent: 1 })).toBe(
      "14 anwesend, 2 entschuldigt, 1 gefehlt",
    );
  });
});

describe("Zeitfenster fürs Erfassen", () => {
  const startsAt = new Date("2026-10-20T16:30:00.000Z");

  it("ab 60 Minuten vor Beginn, danach ohne Grenze (Nachtragen und Korrigieren)", () => {
    const before = new Date(startsAt.getTime() - (ATTENDANCE_LEAD_MINUTES + 1) * MINUTE);
    const exactly = new Date(startsAt.getTime() - ATTENDANCE_LEAD_MINUTES * MINUTE);
    expect(attendanceWindow({ status: "PUBLISHED", startsAt }, before)).toMatchObject({
      open: false,
      opensAt: exactly,
    });
    expect(attendanceWindow({ status: "PUBLISHED", startsAt }, before).reason).toMatch(
      /60 Minuten vor Beginn/,
    );
    expect(attendanceWindow({ status: "PUBLISHED", startsAt }, exactly)).toMatchObject({
      open: true,
      reason: null,
    });
    const muchLater = new Date(startsAt.getTime() + 400 * 24 * 60 * MINUTE);
    expect(attendanceWindow({ status: "COMPLETED", startsAt }, muchLater).open).toBe(true);
  });

  it("nur veröffentlichte und abgeschlossene Termine", () => {
    const later = new Date(startsAt.getTime() + MINUTE);
    for (const status of ["DRAFT", "CANCELLED", "ARCHIVED"] as const) {
      const window = attendanceWindow({ status, startsAt }, later);
      expect(window.open, status).toBe(false);
      expect(window.reason, status).toBeTruthy();
    }
  });
});

describe("Zeiträume der Auswertung (Berliner Zeit)", () => {
  const now = parseBerlinDateTime("2026-10-15", "09:00")!;

  it("„Letzte …“ endet mit dem heutigen Tag, „Letztes Jahr“ ist das ganze Vorjahr", () => {
    const tomorrow = startOfBerlinDate(2026, 10, 16);
    expect(periodRange("4w", now)).toEqual({ from: startOfBerlinDate(2026, 9, 18), to: tomorrow });
    expect(periodRange("3m", now)).toEqual({ from: startOfBerlinDate(2026, 7, 16), to: tomorrow });
    expect(periodRange("12m", now)).toEqual({
      from: startOfBerlinDate(2025, 10, 16),
      to: tomorrow,
    });
    expect(periodRange("jahr", now)).toEqual({ from: startOfBerlinDate(2026, 1, 1), to: tomorrow });
    expect(periodRange("vorjahr", now)).toEqual({
      from: startOfBerlinDate(2025, 1, 1),
      to: startOfBerlinDate(2026, 1, 1),
    });
  });

  it("„Letzte 4 Wochen“ umfasst genau 28 Kalendertage", () => {
    const { from, to } = periodRange("4w", now);
    expect(Math.round((to.getTime() - from.getTime()) / 86_400_000)).toBe(28);
  });
});

describe("Filter aus der Adresse", () => {
  it("Standard: Training, letzte 3 Monate; „alle“ heißt alle Arten; Unbekanntes fällt weg", () => {
    expect(attendanceFiltersFromParams({})).toEqual({
      departmentId: undefined,
      groupId: undefined,
      seriesId: undefined,
      period: "3m",
      type: "TRAINING",
    });
    expect(attendanceFiltersFromParams({ art: "alle", zeitraum: "jahr" })).toMatchObject({
      type: null,
      period: "jahr",
    });
    expect(attendanceFiltersFromParams({ art: "QUATSCH", zeitraum: "ewig" })).toMatchObject({
      type: "TRAINING",
      period: "3m",
    });
  });

  it("hin und zurück: Standardwerte stehen nicht in der Adresse", () => {
    expect(attendanceFilterQuery(attendanceFiltersFromParams({}))).toEqual({
      abteilung: undefined,
      gruppe: undefined,
      serie: undefined,
      zeitraum: undefined,
      art: undefined,
    });
    const params = { gruppe: "g1", art: "alle", zeitraum: "12m" };
    expect(attendanceFilterQuery(attendanceFiltersFromParams(params))).toMatchObject(params);
  });
});

describe("Eingabe beim Speichern", () => {
  it("nimmt Status oder `null` (entfernen) je Person – jede Person nur einmal", () => {
    expect(
      saveAttendanceSchema.safeParse({
        eventId: "e1",
        entries: [
          { memberId: "m1", status: "PRESENT" },
          { memberId: "m2", status: null },
        ],
      }).success,
    ).toBe(true);
    expect(
      saveAttendanceSchema.safeParse({
        eventId: "e1",
        entries: [
          { memberId: "m1", status: "PRESENT" },
          { memberId: "m1", status: "ABSENT" },
        ],
      }).success,
    ).toBe(false);
    expect(
      saveAttendanceSchema.safeParse({
        eventId: "e1",
        entries: [{ memberId: "m1", status: "LATE" }],
      }).success,
    ).toBe(false);
  });
});

describe("Erfassungsliste: was „Speichern“ mitnimmt", () => {
  // Wie die Liste geladen wird: gespeicherte Zeilen, eine Absage (vorausgefüllt „entschuldigt“), eine Zusage (offen).
  const loaded = [
    { status: "PRESENT", saved: "PRESENT", proposed: "PRESENT" },
    { status: "EXCUSED", saved: null, proposed: "EXCUSED" },
    { status: null, saved: null, proposed: null },
  ] as const;

  it("vorausgefüllte Absagen werden gespeichert, sind aber keine eigene Änderung (keine Rückfrage beim Verlassen)", () => {
    expect(pendingAttendance(loaded)).toEqual({ toSave: 1, prefilled: 1, edited: 0 });
    expect(pendingAttendanceText({ toSave: 1, prefilled: 1, edited: 0 })).toBe(
      "1 Absage als „Entschuldigt“ vorausgefüllt – noch nicht gespeichert",
    );
  });

  it("selbst geänderte Zeilen zählen als Änderung – auch eine geänderte Absage; zurück zum Vorschlag wieder nicht", () => {
    const [stored, declined, accepted] = loaded;
    expect(
      pendingAttendance([
        { ...stored, status: "ABSENT" },
        declined,
        { ...accepted, status: "PRESENT" },
      ]),
    ).toEqual({ toSave: 3, prefilled: 1, edited: 2 });
    expect(pendingAttendance([stored, { ...declined, status: "PRESENT" }, accepted])).toEqual({
      toSave: 1,
      prefilled: 0,
      edited: 1,
    });
    // Vorausgefüllte Absage geleert: Nichts zu speichern, nichts zu verlieren.
    expect(pendingAttendance([stored, { ...declined, status: null }, accepted])).toEqual({
      toSave: 0,
      prefilled: 0,
      edited: 0,
    });
    // Gespeicherten Eintrag entfernt (null): wird beim Speichern gelöscht – eine eigene Änderung.
    expect(pendingAttendance([{ ...stored, status: null }])).toEqual({
      toSave: 1,
      prefilled: 0,
      edited: 1,
    });
  });

  it("der Hinweis neben „Speichern (n)“ erklärt, wenn vorausgefüllte Absagen mitzählen", () => {
    expect(pendingAttendanceText({ toSave: 3, prefilled: 0, edited: 3 })).toBe(
      "3 Änderungen noch nicht gespeichert",
    );
    expect(pendingAttendanceText({ toSave: 1, prefilled: 0, edited: 1 })).toBe(
      "1 Änderung noch nicht gespeichert",
    );
    expect(pendingAttendanceText({ toSave: 3, prefilled: 2, edited: 1 })).toBe(
      "1 Änderung und 2 Absagen als „Entschuldigt“ noch nicht gespeichert",
    );
  });
});
