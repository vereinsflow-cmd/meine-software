import { describe, expect, it } from "vitest";
import {
  calendarRange,
  entriesByDay,
  isoWeek,
  parseAnchor,
  parseView,
  shiftAnchor,
  viewTitle,
} from "@/lib/calendar-grid";
import { parseBerlinDateTime, toDateInputValue } from "@/lib/dates";

const at = (date: string, time = "00:00") => parseBerlinDateTime(date, time)!;
const keys = (days: Date[]) => days.map(toDateInputValue);

describe("Ansicht und Bezugstag aus der URL", () => {
  it("kennt vier Ansichten und fällt sonst auf den Monat zurück", () => {
    expect(parseView("woche")).toBe("woche");
    expect(parseView("liste")).toBe("liste");
    expect(parseView("unsinn")).toBe("monat");
    expect(parseView(undefined)).toBe("monat");
  });

  it("nimmt gültige Tage an und fällt bei Unsinn auf heute zurück", () => {
    const now = at("2026-09-20", "13:45");
    expect(toDateInputValue(parseAnchor("2026-10-03", now))).toBe("2026-10-03");
    for (const bad of [
      undefined,
      "",
      "abc",
      "2026-02-31",
      "03.10.2026",
      "1999-01-01",
      "2500-01-01",
    ]) {
      expect(toDateInputValue(parseAnchor(bad, now))).toBe("2026-09-20");
    }
    expect(parseAnchor(undefined, now).getTime()).toBe(at("2026-09-20").getTime());
  });
});

describe("Sichtbarer Zeitraum", () => {
  it("Monat: volle Wochen von Montag bis Sonntag (September 2026 = 5 Wochen)", () => {
    const range = calendarRange("monat", at("2026-09-17"));
    expect(toDateInputValue(range.from)).toBe("2026-08-31");
    expect(toDateInputValue(range.to)).toBe("2026-10-05"); // exklusiv
    expect(range.days).toHaveLength(35);
    expect(keys(range.days)[0]).toBe("2026-08-31");
    expect(keys(range.days).at(-1)).toBe("2026-10-04");
  });

  it("Monat: sechs Wochen (August 2026) und vier Wochen (Februar 2027)", () => {
    expect(calendarRange("monat", at("2026-08-15")).days).toHaveLength(42);
    const feb = calendarRange("monat", at("2027-02-10"));
    expect(feb.days).toHaveLength(28);
    expect(toDateInputValue(feb.from)).toBe("2027-02-01");
  });

  it("Woche über die Zeitumstellung im Herbst hat sieben Tage, aber 169 Stunden", () => {
    const range = calendarRange("woche", at("2026-10-22"));
    expect(keys(range.days)).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
    expect(range.to.getTime() - range.from.getTime()).toBe(169 * 3_600_000);
    expect(toDateInputValue(range.to)).toBe("2026-10-26");
  });

  it("Woche über die Zeitumstellung im Frühjahr hat 167 Stunden", () => {
    const range = calendarRange("woche", at("2026-03-29"));
    expect(toDateInputValue(range.from)).toBe("2026-03-23");
    expect(range.to.getTime() - range.from.getTime()).toBe(167 * 3_600_000);
  });

  it("Tag und Liste", () => {
    const day = calendarRange("tag", at("2026-09-20", "17:30"));
    expect(day.days).toHaveLength(1);
    expect(day.from.getTime()).toBe(at("2026-09-20").getTime());
    expect(day.to.getTime()).toBe(at("2026-09-21").getTime());

    const list = calendarRange("liste", at("2026-09-20"));
    expect(toDateInputValue(list.from)).toBe("2026-09-01");
    expect(toDateInputValue(list.to)).toBe("2026-10-01");
    expect(list.days).toHaveLength(30);
  });
});

describe("Blättern", () => {
  it("Monat springt auf den Ersten des Vor-/Folgemonats – auch über Monatsenden und Jahresgrenzen", () => {
    expect(toDateInputValue(shiftAnchor("monat", at("2026-01-31"), 1))).toBe("2026-02-01");
    expect(toDateInputValue(shiftAnchor("monat", at("2026-03-31"), -1))).toBe("2026-02-01");
    expect(toDateInputValue(shiftAnchor("monat", at("2026-01-15"), -1))).toBe("2025-12-01");
    expect(toDateInputValue(shiftAnchor("liste", at("2026-12-15"), 1))).toBe("2027-01-01");
  });

  it("Woche ±7 Tage, Tag ±1 Tag (auch über die Zeitumstellung)", () => {
    expect(toDateInputValue(shiftAnchor("woche", at("2026-10-22"), 1))).toBe("2026-10-29");
    expect(toDateInputValue(shiftAnchor("woche", at("2026-10-22"), -1))).toBe("2026-10-15");
    expect(toDateInputValue(shiftAnchor("tag", at("2026-10-25"), 1))).toBe("2026-10-26");
    expect(toDateInputValue(shiftAnchor("tag", at("2026-03-29"), -1))).toBe("2026-03-28");
  });
});

describe("Kalenderwoche und Überschrift", () => {
  it("berechnet ISO-Wochen (auch an Jahreswechseln)", () => {
    expect(isoWeek(at("2026-09-21"))).toEqual({ week: 39, year: 2026 });
    expect(isoWeek(at("2026-01-01"))).toEqual({ week: 1, year: 2026 });
    expect(isoWeek(at("2027-01-01"))).toEqual({ week: 53, year: 2026 });
    expect(isoWeek(at("2024-12-30"))).toEqual({ week: 1, year: 2025 });
    expect(isoWeek(at("2021-01-03"))).toEqual({ week: 53, year: 2020 });
  });

  it("beschriftet die Ansichten auf Deutsch", () => {
    expect(viewTitle("monat", at("2026-09-20"))).toBe("September 2026");
    expect(viewTitle("liste", at("2026-03-02"))).toBe("März 2026");
    expect(viewTitle("tag", at("2026-09-21"))).toBe("Montag, 21. September 2026");
    expect(viewTitle("woche", at("2026-09-23"))).toBe("KW 39 · 21.–27. September 2026");
    expect(viewTitle("woche", at("2026-09-30"))).toBe("KW 40 · 28. September – 4. Oktober 2026");
    expect(viewTitle("woche", at("2026-12-30"))).toBe("KW 53 · 28. Dezember 2026 – 3. Januar 2027");
  });
});

describe("Einträge den Tagen zuordnen", () => {
  const entry = (title: string, from: string, to: string, allDay = false) => ({
    title,
    startsAt: at(from.slice(0, 10), from.slice(11)),
    endsAt: at(to.slice(0, 10), to.slice(11)),
    allDay,
  });
  const days = calendarRange("woche", at("2026-09-21")).days;

  it("mehrtägige Einträge erscheinen an jedem berührten Tag", () => {
    const map = entriesByDay([entry("Zeltlager", "2026-09-22T18:00", "2026-09-24T10:00")], days);
    expect(map.get("2026-09-21")).toHaveLength(0);
    expect(map.get("2026-09-22")).toHaveLength(1);
    expect(map.get("2026-09-23")).toHaveLength(1);
    expect(map.get("2026-09-24")).toHaveLength(1);
    expect(map.get("2026-09-25")).toHaveLength(0);
  });

  it("ein Eintrag, der genau um Mitternacht endet, gehört nicht zum Folgetag", () => {
    const map = entriesByDay([entry("Spätschicht", "2026-09-21T20:00", "2026-09-22T00:00")], days);
    expect(map.get("2026-09-21")).toHaveLength(1);
    expect(map.get("2026-09-22")).toHaveLength(0);
  });

  it("sortiert ganztägige zuerst, dann nach Beginn und Titel", () => {
    const map = entriesByDay(
      [
        entry("B spät", "2026-09-21T19:00", "2026-09-21T20:00"),
        entry("A früh", "2026-09-21T09:00", "2026-09-21T10:00"),
        entry("Feiertag", "2026-09-21T00:00", "2026-09-21T23:59", true),
        entry("A früh", "2026-09-21T09:00", "2026-09-21T09:30"),
      ],
      days,
    );
    expect(map.get("2026-09-21")!.map((e) => e.title)).toEqual([
      "Feiertag",
      "A früh",
      "A früh",
      "B spät",
    ]);
  });

  it("Einträge ohne Dauer (Beginn = Ende) werden am Tag angezeigt", () => {
    const map = entriesByDay([entry("Termin", "2026-09-23T12:00", "2026-09-23T12:00")], days);
    expect(map.get("2026-09-23")).toHaveLength(1);
    expect(map.get("2026-09-24")).toHaveLength(0);
  });
});
