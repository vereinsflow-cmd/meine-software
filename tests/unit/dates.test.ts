import { describe, expect, it } from "vitest";
import {
  addBerlinDays,
  ageOn,
  berlinWeekday,
  calendarDateToInputValue,
  daysUntil,
  formatCalendarDate,
  formatDate,
  formatDateTime,
  formatDuration,
  formatEuroFromCents,
  formatTime,
  formatTimeRange,
  parseBerlinDateTime,
  parseCalendarDate,
  startOfBerlinDay,
  startOfNextBerlinDay,
  toDateInputValue,
  toTimeInputValue,
} from "@/lib/dates";

describe("Zeitpunkte in Europe/Berlin", () => {
  it("formatiert als TT.MM.JJJJ und 24-Stunden-Zeit", () => {
    const winter = new Date("2026-01-15T17:30:00Z"); // MEZ = UTC+1
    expect(formatDate(winter)).toBe("15.01.2026");
    expect(formatTime(winter)).toBe("18:30");
    expect(formatDateTime(winter)).toBe("15.01.2026 18:30");
  });

  it("berücksichtigt die Sommerzeit (UTC+2)", () => {
    expect(formatTime(new Date("2026-07-15T17:30:00Z"))).toBe("19:30");
  });

  it("zeigt Mitternacht als 00:00 (nicht 24:00)", () => {
    expect(formatTime(new Date("2026-01-14T23:00:00Z"))).toBe("00:00");
  });

  it("wechselt das Datum nach Berliner Ortszeit, nicht nach UTC", () => {
    // 23:30 UTC ist in Berlin schon der nächste Tag.
    expect(formatDate(new Date("2026-01-15T23:30:00Z"))).toBe("16.01.2026");
  });

  it("zeigt bei fehlenden oder ungültigen Werten einen Strich", () => {
    expect(formatDate(null)).toBe("–");
    expect(formatDateTime(undefined)).toBe("–");
    expect(formatTime("kein-datum")).toBe("–");
  });

  it("formatiert Zeiträume, auch über Mitternacht", () => {
    expect(
      formatTimeRange(new Date("2026-06-01T07:00:00Z"), new Date("2026-06-01T09:30:00Z")),
    ).toBe("09:00 – 11:30 Uhr");
    expect(
      formatTimeRange(new Date("2026-06-01T20:00:00Z"), new Date("2026-06-02T01:00:00Z")),
    ).toBe("01.06.2026 22:00 – 02.06.2026 03:00 Uhr");
  });
});

describe("daysUntil", () => {
  it("zählt Kalendertage in Berliner Zeit, nicht die reine Millisekunden-Differenz", () => {
    const now = new Date("2026-06-01T21:00:00Z"); // 23:00 Uhr Berlin (Sommerzeit)
    // Nur 3 Stunden später, aber schon der nächste Berliner Kalendertag.
    expect(daysUntil(new Date("2026-06-02T00:00:00Z"), now)).toBe(1);
  });

  it("heute ist 0, gestern ist -1", () => {
    const now = new Date("2026-06-01T10:00:00Z"); // 12:00 Uhr Berlin (Sommerzeit)
    expect(daysUntil(new Date("2026-06-01T19:00:00Z"), now)).toBe(0); // 21:00 Uhr, noch derselbe Berliner Tag
    expect(daysUntil(new Date("2026-05-31T10:00:00Z"), now)).toBe(-1);
  });

  it("zählt mehrere Tage in beide Richtungen", () => {
    const now = new Date("2026-06-01T10:00:00Z");
    expect(daysUntil(new Date("2026-06-05T10:00:00Z"), now)).toBe(4);
    expect(daysUntil(new Date("2026-05-25T10:00:00Z"), now)).toBe(-7);
  });
});

describe("Eingabe in Europe/Berlin", () => {
  it("wandelt Ortszeit in UTC um (Winter und Sommer)", () => {
    expect(parseBerlinDateTime("2026-01-15", "18:30")?.toISOString()).toBe(
      "2026-01-15T17:30:00.000Z",
    );
    expect(parseBerlinDateTime("2026-07-15", "18:30")?.toISOString()).toBe(
      "2026-07-15T16:30:00.000Z",
    );
  });

  it("lehnt ungültige Werte ab", () => {
    expect(parseBerlinDateTime("2026-02-31", "10:00")).toBeNull();
    expect(parseBerlinDateTime("2026-13-01", "10:00")).toBeNull();
    expect(parseBerlinDateTime("2026-01-01", "25:00")).toBeNull();
    expect(parseBerlinDateTime("2026-01-01", "10:60")).toBeNull();
    expect(parseBerlinDateTime("15.01.2026", "10:00")).toBeNull();
    expect(parseBerlinDateTime("", "")).toBeNull();
  });

  it("Hin- und Rückumwandlung ist verlustfrei", () => {
    for (const [date, time] of [
      ["2026-03-28", "23:45"],
      ["2026-10-25", "01:30"],
      ["2026-12-31", "00:00"],
    ] as const) {
      const instant = parseBerlinDateTime(date, time);
      expect(instant).not.toBeNull();
      expect(toDateInputValue(instant!)).toBe(date);
      expect(toTimeInputValue(instant!)).toBe(time);
    }
  });

  it("kennt die Länge von Tagen mit Zeitumstellung (23 und 25 Stunden)", () => {
    const hours = (day: string) => {
      const start = startOfBerlinDay(parseBerlinDateTime(day, "12:00")!);
      return (startOfNextBerlinDay(start).getTime() - start.getTime()) / 3_600_000;
    };
    expect(hours("2026-03-29")).toBe(23); // Umstellung auf Sommerzeit
    expect(hours("2026-10-25")).toBe(25); // Umstellung auf Winterzeit
    expect(hours("2026-06-10")).toBe(24);
  });

  it("addBerlinDays behält die Ortszeit über die Zeitumstellung hinweg", () => {
    const saturday = parseBerlinDateTime("2026-03-28", "18:00")!;
    expect(toTimeInputValue(addBerlinDays(saturday, 1))).toBe("18:00");
    expect(toDateInputValue(addBerlinDays(saturday, 1))).toBe("2026-03-29");
  });

  it("berechnet den Wochentag (Montag = 0)", () => {
    expect(berlinWeekday(parseBerlinDateTime("2026-09-21", "12:00")!)).toBe(0); // Montag
    expect(berlinWeekday(parseBerlinDateTime("2026-09-27", "12:00")!)).toBe(6); // Sonntag
  });
});

describe("Reine Kalendertage (@db.Date)", () => {
  it("verrutschen nie um einen Tag", () => {
    const birthday = parseCalendarDate("1990-05-17")!;
    expect(formatCalendarDate(birthday)).toBe("17.05.1990");
    expect(calendarDateToInputValue(birthday)).toBe("1990-05-17");
    // Auch ein Zeitpunkt kurz nach Mitternacht UTC bleibt derselbe Kalendertag.
    expect(formatCalendarDate(new Date("1990-05-17T00:00:00.000Z"))).toBe("17.05.1990");
  });

  it("lehnt ungültige Kalendertage ab", () => {
    expect(parseCalendarDate("2026-02-30")).toBeNull();
    expect(parseCalendarDate("2026-2-3")).toBeNull();
    expect(parseCalendarDate("morgen")).toBeNull();
    expect(parseCalendarDate("2024-02-29")).not.toBeNull(); // Schaltjahr
    expect(parseCalendarDate("2025-02-29")).toBeNull();
  });

  it("berechnet das Alter korrekt am Geburtstag und davor", () => {
    const birth = parseCalendarDate("2010-06-15")!;
    expect(ageOn(birth, parseCalendarDate("2026-06-14")!)).toBe(15);
    expect(ageOn(birth, parseCalendarDate("2026-06-15")!)).toBe(16);
    expect(ageOn(birth, parseCalendarDate("2026-12-31")!)).toBe(16);
  });
});

describe("Zahlen", () => {
  it("formatiert Euro-Beträge im deutschen Format", () => {
    expect(formatEuroFromCents(123456).replace(/\s/g, " ")).toBe("1.234,56 €");
    expect(formatEuroFromCents(0).replace(/\s/g, " ")).toBe("0,00 €");
  });

  it("formatiert Dauern", () => {
    expect(formatDuration(45)).toBe("45 Min.");
    expect(formatDuration(120)).toBe("2 Std.");
    expect(formatDuration(150)).toBe("2 Std. 30 Min.");
  });
});
