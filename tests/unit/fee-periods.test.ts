import { describe, expect, it } from "vitest";
import {
  addDays,
  daysInMonth,
  dueDate,
  endOfMonth,
  monthsOfInterval,
  nextPeriod,
  periodFor,
  previousPeriod,
  startOfMonth,
  type BillingInterval,
} from "@/modules/fees/periods";

/** Kalendertag (UTC-Mitternacht), Monat ab 1. */
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const iso = (date: Date) => date.toISOString().slice(0, 10);
const span = (p: { start: Date; end: Date; label: string }) =>
  `${iso(p.start)}..${iso(p.end)} ${p.label}`;

describe("Abrechnungszeiträume", () => {
  it.each<[BillingInterval, Date, string]>([
    ["MONTHLY", day(2026, 10, 5), "2026-10-01..2026-10-31 Oktober 2026"],
    ["MONTHLY", day(2026, 3, 31), "2026-03-01..2026-03-31 März 2026"],
    ["MONTHLY", day(2028, 2, 10), "2028-02-01..2028-02-29 Februar 2028"],
    ["MONTHLY", day(2027, 2, 28), "2027-02-01..2027-02-28 Februar 2027"],
    ["QUARTERLY", day(2026, 10, 1), "2026-10-01..2026-12-31 4. Quartal 2026"],
    ["QUARTERLY", day(2026, 12, 31), "2026-10-01..2026-12-31 4. Quartal 2026"],
    ["QUARTERLY", day(2028, 2, 29), "2028-01-01..2028-03-31 1. Quartal 2028"],
    ["QUARTERLY", day(2026, 6, 30), "2026-04-01..2026-06-30 2. Quartal 2026"],
    ["QUARTERLY", day(2026, 7, 1), "2026-07-01..2026-09-30 3. Quartal 2026"],
    ["HALF_YEARLY", day(2026, 6, 30), "2026-01-01..2026-06-30 1. Halbjahr 2026"],
    ["HALF_YEARLY", day(2026, 7, 1), "2026-07-01..2026-12-31 2. Halbjahr 2026"],
    ["YEARLY", day(2026, 10, 5), "2026-01-01..2026-12-31 2026"],
  ])("%s um %o", (interval, at, expected) => {
    expect(span(periodFor(interval, at))).toBe(expected);
  });

  it("blättert vor und zurück – auch über den Jahreswechsel", () => {
    const q4 = periodFor("QUARTERLY", day(2026, 11, 15));
    expect(span(nextPeriod("QUARTERLY", q4))).toBe("2027-01-01..2027-03-31 1. Quartal 2027");
    expect(span(previousPeriod("QUARTERLY", q4))).toBe("2026-07-01..2026-09-30 3. Quartal 2026");
    expect(span(nextPeriod("MONTHLY", day(2026, 12, 24)))).toBe(
      "2027-01-01..2027-01-31 Januar 2027",
    );
    expect(span(previousPeriod("MONTHLY", day(2028, 3, 1)))).toBe(
      "2028-02-01..2028-02-29 Februar 2028",
    );
    expect(span(nextPeriod("HALF_YEARLY", day(2026, 8, 1)))).toBe(
      "2027-01-01..2027-06-30 1. Halbjahr 2027",
    );
    expect(span(previousPeriod("YEARLY", day(2026, 1, 1)))).toBe("2025-01-01..2025-12-31 2025");
  });

  it("Monate je Abrechnung", () => {
    expect(monthsOfInterval("MONTHLY")).toBe(1);
    expect(monthsOfInterval("QUARTERLY")).toBe(3);
    expect(monthsOfInterval("HALF_YEARLY")).toBe(6);
    expect(monthsOfInterval("YEARLY")).toBe(12);
    // @ts-expect-error einmalige Beiträge haben keinen Zeitraum
    expect(() => monthsOfInterval("ONCE")).toThrow(RangeError);
  });
});

describe("Kalendertage", () => {
  it("Tage im Monat – mit Schaltjahren", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2026, 11)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
    expect(daysInMonth(day(2028, 2, 15))).toBe(29);
    expect(() => daysInMonth(2026, 13)).toThrow(RangeError);
  });

  it("Monatsanfang, Monatsende, Tage weiterzählen", () => {
    expect(iso(startOfMonth(day(2026, 11, 15)))).toBe("2026-11-01");
    expect(iso(endOfMonth(day(2028, 2, 3)))).toBe("2028-02-29");
    expect(iso(addDays(day(2026, 12, 31), 1))).toBe("2027-01-01");
    expect(iso(addDays(day(2028, 3, 1), -1))).toBe("2028-02-29");
  });

  it("Fälligkeit: der n-te Tag ab Beginn des Zeitraums", () => {
    expect(iso(dueDate(day(2026, 10, 1), 1))).toBe("2026-10-01");
    expect(iso(dueDate(day(2026, 10, 1), 15))).toBe("2026-10-15");
    expect(iso(dueDate(day(2027, 2, 1), 28))).toBe("2027-02-28");
    for (const bad of [0, 29, 1.5, -1]) expect(() => dueDate(day(2026, 10, 1), bad)).toThrow();
  });
});
