import { describe, expect, it } from "vitest";
import {
  parseBerlinDateTime,
  toDateInputValue,
  toTimeInputValue,
  parseCalendarDate,
} from "@/lib/dates";
import { expandSeries, MAX_SERIES_OCCURRENCES } from "@/lib/recurrence";

const at = (date: string, time: string) => parseBerlinDateTime(date, time)!;
const local = (d: Date) => `${toDateInputValue(d)} ${toTimeInputValue(d)}`;

describe("Terminserien (expandSeries)", () => {
  it("wöchentlich: erster Termin ist der Ausgangstermin, danach im 7-Tage-Abstand", () => {
    const result = expandSeries({
      startsAt: at("2026-09-22", "18:30"),
      endsAt: at("2026-09-22", "20:00"),
      frequency: "weekly",
      count: 4,
    });
    expect(result.map((o) => local(o.startsAt))).toEqual([
      "2026-09-22 18:30",
      "2026-09-29 18:30",
      "2026-10-06 18:30",
      "2026-10-13 18:30",
    ]);
    expect(result.map((o) => local(o.endsAt))).toEqual([
      "2026-09-22 20:00",
      "2026-09-29 20:00",
      "2026-10-06 20:00",
      "2026-10-13 20:00",
    ]);
  });

  it("zweiwöchentlich", () => {
    const result = expandSeries({
      startsAt: at("2026-09-01", "10:00"),
      endsAt: at("2026-09-01", "11:00"),
      frequency: "biweekly",
      count: 3,
    });
    expect(result.map((o) => toDateInputValue(o.startsAt))).toEqual([
      "2026-09-01",
      "2026-09-15",
      "2026-09-29",
    ]);
  });

  it("behält die Ortszeit über die Zeitumstellung (Sommer → Winter am 25.10.2026)", () => {
    const result = expandSeries({
      startsAt: at("2026-10-20", "18:30"),
      endsAt: at("2026-10-20", "20:00"),
      frequency: "weekly",
      count: 3,
    });
    expect(result.map((o) => local(o.startsAt))).toEqual([
      "2026-10-20 18:30",
      "2026-10-27 18:30",
      "2026-11-03 18:30",
    ]);
    // In UTC verschiebt sich der Beginn um eine Stunde – in Ortszeit nicht.
    expect(result[0]!.startsAt.toISOString()).toBe("2026-10-20T16:30:00.000Z");
    expect(result[1]!.startsAt.toISOString()).toBe("2026-10-27T17:30:00.000Z");
  });

  it("behält die Ortszeit über die Zeitumstellung (Winter → Sommer am 29.03.2026)", () => {
    const result = expandSeries({
      startsAt: at("2026-03-24", "19:00"),
      endsAt: at("2026-03-24", "21:00"),
      frequency: "weekly",
      count: 2,
    });
    expect(result.map((o) => toTimeInputValue(o.startsAt))).toEqual(["19:00", "19:00"]);
  });

  it("monatlich: am selben Tag; in kürzeren Monaten gilt der letzte Tag, danach wieder der Ankertag", () => {
    const result = expandSeries({
      startsAt: at("2026-01-31", "12:00"),
      endsAt: at("2026-01-31", "13:00"),
      frequency: "monthly",
      count: 5,
    });
    expect(result.map((o) => toDateInputValue(o.startsAt))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
    ]);
  });

  it("monatlich über den Jahreswechsel", () => {
    const result = expandSeries({
      startsAt: at("2026-11-15", "09:00"),
      endsAt: at("2026-11-15", "10:00"),
      frequency: "monthly",
      count: 4,
    });
    expect(result.map((o) => toDateInputValue(o.startsAt))).toEqual([
      "2026-11-15",
      "2026-12-15",
      "2027-01-15",
      "2027-02-15",
    ]);
  });

  it("endet am Datum 'bis' (einschließlich)", () => {
    const result = expandSeries({
      startsAt: at("2026-09-01", "18:00"),
      endsAt: at("2026-09-01", "19:00"),
      frequency: "weekly",
      until: parseCalendarDate("2026-09-22")!,
    });
    expect(result.map((o) => toDateInputValue(o.startsAt))).toEqual([
      "2026-09-01",
      "2026-09-08",
      "2026-09-15",
      "2026-09-22",
    ]);
  });

  it("liefert auch bei 'bis' vor dem zweiten Termin nur den Ausgangstermin", () => {
    const result = expandSeries({
      startsAt: at("2026-09-01", "18:00"),
      endsAt: at("2026-09-01", "19:00"),
      frequency: "weekly",
      until: parseCalendarDate("2026-09-03")!,
    });
    expect(result).toHaveLength(1);
  });

  it("begrenzt die Serie auf höchstens 52 Termine", () => {
    const base = {
      startsAt: at("2026-01-05", "18:00"),
      endsAt: at("2026-01-05", "19:00"),
      frequency: "weekly" as const,
    };
    expect(expandSeries({ ...base, count: 500 })).toHaveLength(MAX_SERIES_OCCURRENCES);
    expect(expandSeries({ ...base })).toHaveLength(MAX_SERIES_OCCURRENCES);
    expect(expandSeries({ ...base, until: parseCalendarDate("2040-01-01")! })).toHaveLength(
      MAX_SERIES_OCCURRENCES,
    );
  });

  it("behält die Dauer bei, auch über Mitternacht hinweg", () => {
    const result = expandSeries({
      startsAt: at("2026-09-04", "22:00"),
      endsAt: at("2026-09-05", "02:00"),
      frequency: "weekly",
      count: 2,
    });
    expect(result.map((o) => o.endsAt.getTime() - o.startsAt.getTime())).toEqual([
      4 * 3_600_000,
      4 * 3_600_000,
    ]);
    expect(local(result[1]!.endsAt)).toBe("2026-09-12 02:00");
  });
});
