import { describe, expect, it } from "vitest";
import {
  ANNIVERSARY_LEVELS,
  anniversaryDate,
  anniversaryInYear,
  anniversaryToday,
  groupByLevel,
  isMemberOn,
  joinedRanges,
  levelsText,
  referenceYear,
  upcomingAnniversary,
  yearsLabel,
  type AnniversaryCandidate,
} from "@/lib/anniversaries";
import { parseCalendarDate } from "@/lib/dates";

const day = (value: string) => parseCalendarDate(value)!;
const iso = (date: Date) => date.toISOString().slice(0, 10);
const member = (overrides: Partial<AnniversaryCandidate> = {}): AnniversaryCandidate => ({
  joinedAt: day("2001-06-15"),
  leftAt: null,
  status: "ACTIVE",
  archivedAt: null,
  deletedAt: null,
  ...overrides,
});

describe("Ehrungen: Jubiläumstag", () => {
  it("ist das Eintrittsdatum plus N Jahre", () => {
    expect(iso(anniversaryDate(day("2001-06-15"), 25))).toBe("2026-06-15");
    expect(iso(anniversaryDate(day("1976-01-01"), 50))).toBe("2026-01-01");
    expect(iso(anniversaryDate(day("1951-12-31"), 75))).toBe("2026-12-31");
  });

  it("29. Februar: im Schaltjahr am 29., sonst am 28. Februar (§ 188 Abs. 3 BGB)", () => {
    const joined = day("2000-02-29");
    expect(iso(anniversaryDate(joined, 25))).toBe("2025-02-28"); // 2025: kein Schaltjahr
    expect(iso(anniversaryDate(joined, 28))).toBe("2028-02-29"); // 2028: Schaltjahr
    expect(iso(anniversaryDate(joined, 100))).toBe("2100-02-28"); // 2100: durch 100 teilbar, kein Schaltjahr
    expect(iso(anniversaryDate(day("1600-02-29"), 400))).toBe("2000-02-29"); // durch 400 teilbar: Schaltjahr
    // Wer am 28. Februar eingetreten ist, bleibt immer am 28.
    expect(iso(anniversaryDate(day("2004-02-28"), 10))).toBe("2014-02-28");
  });
});

describe("Ehrungen: Jubiläum in einem Jahr", () => {
  it("nur für die Stufen 10, 25, 40, 50, 60, 70 und 75 Jahre", () => {
    expect(ANNIVERSARY_LEVELS).toEqual([10, 25, 40, 50, 60, 70, 75]);
    for (const level of ANNIVERSARY_LEVELS) {
      const hit = anniversaryInYear(member({ joinedAt: day(`${2026 - level}-03-01`) }), 2026);
      expect(hit, String(level)).toEqual({ years: level, date: day("2026-03-01") });
    }
    for (const years of [0, 1, 5, 9, 11, 20, 30, 45, 80])
      expect(
        anniversaryInYear(member({ joinedAt: day(`${2026 - years}-03-01`) }), 2026),
        String(years),
      ).toBeNull();
  });

  it("in diesem Jahr eingetreten: kein Jubiläum; ohne Eintrittsdatum: keins", () => {
    expect(anniversaryInYear(member({ joinedAt: day("2026-10-14") }), 2026)).toBeNull();
    expect(anniversaryInYear(member({ joinedAt: null }), 2026)).toBeNull();
    // Eintritt in der Zukunft (Tippfehler): nie ein Jubiläum
    expect(anniversaryInYear(member({ joinedAt: day("2036-01-01") }), 2026)).toBeNull();
  });

  it("vor dem Jubiläum ausgetreten: fehlt; erst danach ausgetreten oder am Tag selbst: zählt", () => {
    const joinedAt = day("2001-06-15");
    expect(
      anniversaryInYear(member({ joinedAt, leftAt: day("2026-06-14"), status: "LEFT" }), 2026),
    ).toBeNull();
    expect(
      anniversaryInYear(member({ joinedAt, leftAt: day("2026-06-15"), status: "LEFT" }), 2026),
    ).toEqual({ years: 25, date: day("2026-06-15") });
    expect(
      anniversaryInYear(member({ joinedAt, leftAt: day("2026-12-31"), status: "LEFT" }), 2026),
    ).not.toBeNull();
    // Kündigung zum Jahresende, Status noch aktiv: Jubiläum davor zählt
    expect(anniversaryInYear(member({ joinedAt, leftAt: day("2026-12-31") }), 2026)).not.toBeNull();
    // „Ausgetreten“ ohne Datum lässt sich nicht prüfen
    expect(anniversaryInYear(member({ joinedAt, status: "LEFT" }), 2026)).toBeNull();
  });

  it("archiviert, im Papierkorb oder gesperrt: fehlt; passiv und Ehrenmitglied zählen", () => {
    const joinedAt = day("2001-06-15");
    expect(anniversaryInYear(member({ joinedAt, archivedAt: new Date() }), 2026)).toBeNull();
    expect(anniversaryInYear(member({ joinedAt, deletedAt: new Date() }), 2026)).toBeNull();
    expect(anniversaryInYear(member({ joinedAt, status: "BLOCKED" }), 2026)).toBeNull();
    expect(anniversaryInYear(member({ joinedAt, status: "PASSIVE" }), 2026)).not.toBeNull();
    expect(anniversaryInYear(member({ joinedAt, status: "HONORARY" }), 2026)).not.toBeNull();
  });

  it("Mitglied an einem Tag: ab dem Eintritt, bis einschließlich zum Austrittstag", () => {
    const m = member({ joinedAt: day("2001-06-15"), leftAt: day("2026-06-30") });
    expect(isMemberOn(m, day("2001-06-14"))).toBe(false);
    expect(isMemberOn(m, day("2001-06-15"))).toBe(true);
    expect(isMemberOn(m, day("2026-06-30"))).toBe(true);
    expect(isMemberOn(m, day("2026-07-01"))).toBe(false);
  });
});

describe("Ehrungen: anstehende Jubiläen", () => {
  it("heute zählt mit (0 Tage), das Fenster schließt den letzten Tag ein", () => {
    const today = day("2026-10-14");
    expect(upcomingAnniversary(member({ joinedAt: day("2016-10-14") }), today, 60)).toEqual({
      years: 10,
      date: day("2026-10-14"),
      inDays: 0,
    });
    expect(upcomingAnniversary(member({ joinedAt: day("2001-12-13") }), today, 60)?.inDays).toBe(
      60,
    );
    expect(upcomingAnniversary(member({ joinedAt: day("2001-12-14") }), today, 60)).toBeNull();
    // Gestern war es: nicht mehr anstehend
    expect(upcomingAnniversary(member({ joinedAt: day("2016-10-13") }), today, 60)).toBeNull();
  });

  it("über den Jahreswechsel: im Dezember erscheinen Jubiläen aus dem Januar", () => {
    const hit = upcomingAnniversary(member({ joinedAt: day("1977-01-10") }), day("2026-12-20"), 60);
    expect(hit).toEqual({ years: 50, date: day("2027-01-10"), inDays: 21 });
  });

  it("29. Februar im Jahr ohne Schalttag: am 28. Februar anstehend", () => {
    const hit = upcomingAnniversary(member({ joinedAt: day("2000-02-29") }), day("2025-02-20"), 60);
    expect(hit).toEqual({ years: 25, date: day("2025-02-28"), inDays: 8 });
  });

  it("wer vor dem Jubiläum austreten wird, fehlt schon vorher", () => {
    const today = day("2026-10-14");
    const joinedAt = day("2001-11-20"); // 25 Jahre am 20.11.2026
    expect(upcomingAnniversary(member({ joinedAt, leftAt: day("2026-10-31") }), today, 60)).toBe(
      null,
    );
    expect(
      upcomingAnniversary(member({ joinedAt, leftAt: day("2026-12-31") }), today, 60),
    ).not.toBeNull();
  });

  it("Zeitzone: kurz nach Mitternacht in Berlin gilt schon der neue Tag (in UTC noch der alte)", () => {
    // 14.03.2026, 23:30 UTC = 15.03.2026, 00:30 Uhr in Berlin (Winterzeit, UTC+1)
    const now = new Date("2026-03-14T23:30:00Z");
    const today = anniversaryToday(now);
    expect(iso(today)).toBe("2026-03-15");
    expect(upcomingAnniversary(member({ joinedAt: day("2016-03-15") }), today, 60)?.inDays).toBe(0);
    expect(upcomingAnniversary(member({ joinedAt: day("2016-03-14") }), today, 60)).toBeNull();
    // Sommerzeit (UTC+2): 22:30 UTC ist schon der nächste Tag
    expect(iso(anniversaryToday(new Date("2026-06-30T22:30:00Z")))).toBe("2026-07-01");
  });

  it("Bezugsjahr: in der Silvesternacht nach Mitternacht schon das neue Jahr", () => {
    expect(referenceYear(new Date("2025-12-31T22:59:00Z"))).toBe(2025); // 23:59 Uhr in Berlin
    expect(referenceYear(new Date("2025-12-31T23:30:00Z"))).toBe(2026); // 00:30 Uhr in Berlin
  });
});

describe("Ehrungen: Hilfsfunktionen", () => {
  it("Eintrittszeiträume für die Abfrage: je Stufe ein ganzes Jahr, über mehrere Bezugsjahre ohne Doppelte", () => {
    expect(joinedRanges([2026]).map((r) => [iso(r.gte), iso(r.lt)])).toEqual([
      ["1951-01-01", "1952-01-01"],
      ["1956-01-01", "1957-01-01"],
      ["1966-01-01", "1967-01-01"],
      ["1976-01-01", "1977-01-01"],
      ["1986-01-01", "1987-01-01"],
      ["2001-01-01", "2002-01-01"],
      ["2016-01-01", "2017-01-01"],
    ]);
    expect(joinedRanges([2026, 2027])).toHaveLength(14); // zwei Jahre nebeneinander: nichts doppelt
    // Zehn Jahre Abstand: 1966, 1976 und 1986 kommen in beiden Jahren vor (60/50/40 bzw. 70/60/50) – je nur einmal.
    expect(joinedRanges([2026, 2036])).toHaveLength(11);
  });

  it("Texte", () => {
    expect(yearsLabel(1)).toBe("1 Jahr");
    expect(yearsLabel(25)).toBe("25 Jahre");
    expect(levelsText([10, 25, 40, 50, 60, 70, 75])).toBe("10, 25, 40, 50, 60, 70 und 75");
    expect(levelsText([25])).toBe("25");
    expect(levelsText([25, 50])).toBe("25 und 50");
    expect(levelsText([10, 25, 75], "oder")).toBe("10, 25 oder 75");
  });

  it("Gruppen: höchste Stufe zuerst, darin nach Datum und Name", () => {
    const entry = (years: number, date: string, lastName: string) => ({
      years,
      date: day(date),
      lastName,
      firstName: "A",
    });
    const groups = groupByLevel([
      entry(10, "2026-05-01", "Zander"),
      entry(50, "2026-08-01", "Becker"),
      entry(10, "2026-05-01", "Arndt"),
      entry(10, "2026-02-01", "Özdemir"),
    ]);
    expect(groups.map((g) => g.years)).toEqual([50, 10]);
    expect(groups[1]!.entries.map((e) => e.lastName)).toEqual(["Özdemir", "Arndt", "Zander"]);
  });
});
