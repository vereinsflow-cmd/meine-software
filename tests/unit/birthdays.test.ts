import { describe, expect, it } from "vitest";
import { nextBirthday } from "@/lib/birthdays";
import { ageOn, parseCalendarDate } from "@/lib/dates";

const day = (value: string) => parseCalendarDate(value)!;
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe("Nächster Geburtstag", () => {
  it("liegt der Geburtstag noch vor uns, ist es dieses Jahr", () => {
    const next = nextBirthday(day("1990-10-05"), day("2026-09-20"));
    expect(iso(next.date)).toBe("2026-10-05");
    expect(next.turns).toBe(36);
    expect(next.inDays).toBe(15);
  });

  it("heute zählt mit (0 Tage)", () => {
    const next = nextBirthday(day("2000-09-20"), day("2026-09-20"));
    expect(iso(next.date)).toBe("2026-09-20");
    expect(next.inDays).toBe(0);
    expect(next.turns).toBe(26);
  });

  it("war der Geburtstag schon, ist es nächstes Jahr (auch über den Jahreswechsel)", () => {
    const next = nextBirthday(day("1985-01-03"), day("2026-12-28"));
    expect(iso(next.date)).toBe("2027-01-03");
    expect(next.turns).toBe(42);
    expect(next.inDays).toBe(6);
    expect(iso(nextBirthday(day("1985-09-19"), day("2026-09-20")).date)).toBe("2027-09-19");
  });

  it("29. Februar: Schaltjahr am 29.2., sonst am 1. März – konsistent mit der Altersberechnung", () => {
    const born = day("2004-02-29");
    expect(iso(nextBirthday(born, day("2027-01-10")).date)).toBe("2027-03-01"); // 2027: kein Schaltjahr
    expect(iso(nextBirthday(born, day("2028-01-10")).date)).toBe("2028-02-29"); // 2028: Schaltjahr
    expect(iso(nextBirthday(born, day("2027-03-02")).date)).toBe("2028-02-29");

    // An dem berechneten Tag ist die Person tatsächlich ein Jahr älter geworden.
    const on = nextBirthday(born, day("2027-01-10"));
    expect(ageOn(born, on.date)).toBe(on.turns);
    expect(ageOn(born, new Date(on.date.getTime() - 86_400_000))).toBe(on.turns - 1);
  });

  it("das ausgegebene Alter stimmt mit ageOn am Geburtstag überein (Stichprobe über viele Tage)", () => {
    const born = day("1996-07-14");
    for (let offset = 0; offset < 800; offset += 7) {
      const today = new Date(Date.UTC(2026, 0, 1) + offset * 86_400_000);
      const next = nextBirthday(born, today);
      expect(ageOn(born, next.date)).toBe(next.turns);
      expect(next.inDays).toBeGreaterThanOrEqual(0);
      expect(next.inDays).toBeLessThan(367);
    }
  });
});
