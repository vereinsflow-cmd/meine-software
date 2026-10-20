import { describe, expect, it } from "vitest";
import { parseCalendarDate } from "@/lib/dates";
import {
  birthdayText,
  groupByLetter,
  initials,
  letterOf,
  membershipDuration,
  safeColor,
  splitLastCharacter,
  tint,
} from "@/modules/members/display";

/** Anzeige-Hilfen der Mitgliederliste mit Detailbereich (src/modules/members/display.ts). */

const day = (value: string) => parseCalendarDate(value)!;

describe("Abteilungsfarben", () => {
  it("lässt nur #rrggbb durch – nichts, was als CSS-Ausdruck in `style` landen könnte", () => {
    expect(safeColor("#1baf7a")).toBe("#1baf7a");
    expect(safeColor("#ABCDEF")).toBe("#ABCDEF");
    for (const bad of [
      null,
      undefined,
      "",
      "#fff",
      "red",
      "#12345g",
      "#123456; color: red",
      "url(x)",
    ])
      expect(safeColor(bad)).toBeNull();
  });

  it("mischt Flächen auf die Kartenfarbe", () => {
    expect(tint("#2a78d6", 26)).toBe("color-mix(in oklab, #2a78d6 26%, var(--card))");
  });
});

describe("Initialen und Buchstaben-Trenner", () => {
  it("Initialen aus Vor- und Nachname, ohne Namen ein Fragezeichen", () => {
    expect(initials("Elias", "Becker")).toBe("EB");
    expect(initials(" ömer", "  özdemir")).toBe("ÖÖ");
    expect(initials("", "")).toBe("?");
    // Zeichen außerhalb der Basisebene (Surrogatpaar) bleiben ganz – kein halbes Zeichen „�“ im Kreis
    expect(initials("𠮷子", "山田")).toBe("𠮷山");
  });

  it("Umlaute zählen zum Grundbuchstaben, Ziffern und Sonstiges unter #", () => {
    expect(letterOf("Becker")).toBe("B");
    expect(letterOf("Özdemir")).toBe("O");
    expect(letterOf("ärger")).toBe("A");
    // Buchstaben ohne Zerlegung stehen beim Grundbuchstaben, wie die Datenbank sie sortiert – nicht unter „#“
    expect(letterOf("Łukasz")).toBe("L");
    expect(letterOf("Østergaard")).toBe("O");
    expect(letterOf("Đorđević")).toBe("D");
    expect(letterOf("Æsir")).toBe("A");
    expect(letterOf("1. FC")).toBe("#");
    expect(letterOf("")).toBe("#");
  });

  it("gruppiert in der vorgegebenen Reihenfolge – auch absteigend", () => {
    const people = ["Admin", "Abteilungsleiterin", "Becker", "Braun", "Helfer"].map((lastName) => ({
      lastName,
    }));
    expect(groupByLetter(people).map((g) => [g.letter, g.items.length])).toEqual([
      ["A", 2],
      ["B", 2],
      ["H", 1],
    ]);
    expect(groupByLetter([...people].reverse()).map((g) => g.letter)).toEqual(["H", "B", "A"]);
    expect(groupByLetter([])).toEqual([]);
    // Nicht nebeneinander (Sortierfolge der Datenbank): zwei Abschnitte mit demselben Buchstaben, Reihenfolge bleibt.
    expect(
      groupByLetter(["Adler", "Zander", "Ärger"].map((lastName) => ({ lastName }))).map(
        (g) => g.letter,
      ),
    ).toEqual(["A", "Z", "A"]);
  });
});

describe("Letztes Schriftzeichen (Symbol untrennbar hinter dem Nachnamen)", () => {
  it("teilt genau ein Zeichen ab – auch Umlaute aus zwei Codepunkten und Emoji bleiben ganz", () => {
    expect(splitLastCharacter("Becker")).toEqual({ head: "Becke", tail: "r" });
    expect(splitLastCharacter("Schröder-Müller")).toEqual({ head: "Schröder-Mülle", tail: "r" });
    expect(splitLastCharacter("Baa\u0308")).toEqual({ head: "Ba", tail: "a\u0308" }); // ä als a + Trema
    expect(splitLastCharacter("Lee 👍🏽")).toEqual({ head: "Lee ", tail: "👍🏽" });
    expect(splitLastCharacter("X")).toEqual({ head: "", tail: "X" });
    expect(splitLastCharacter("")).toEqual({ head: "", tail: "" });
  });
});

describe("Dauer der Mitgliedschaft", () => {
  const today = day("2026-10-20");

  it("in Jahren, ab einem Jahr", () => {
    expect(membershipDuration(day("2009-07-01"), { today })).toBe("seit 17 Jahren");
    expect(membershipDuration(day("2025-10-20"), { today })).toBe("seit 1 Jahr");
  });

  it("darunter in Monaten bzw. „seit diesem Monat“", () => {
    expect(membershipDuration(day("2025-10-21"), { today })).toBe("seit 11 Monaten");
    expect(membershipDuration(day("2026-09-20"), { today })).toBe("seit 1 Monat");
    expect(membershipDuration(day("2026-09-21"), { today })).toBe("seit diesem Monat");
    expect(membershipDuration(today, { today })).toBe("seit diesem Monat");
  });

  it("ohne Eintritt nichts, künftiger Eintritt ausdrücklich", () => {
    expect(membershipDuration(null, { today })).toBeNull();
    expect(membershipDuration(day("2026-11-01"), { today })).toBe("Eintritt steht noch bevor");
  });

  it("nach dem Austritt bis zum Austrittstag – kein „seit …“ über dem Austrittsdatum", () => {
    const joined = day("2009-07-01");
    const until = (leftAt: string) => membershipDuration(joined, { leftAt: day(leftAt), today });
    expect(until("2020-06-30")).toBe("10 Jahre Mitglied");
    expect(until("2020-07-01")).toBe("11 Jahre Mitglied");
    expect(until("2010-07-01")).toBe("1 Jahr Mitglied");
    expect(until("2010-03-15")).toBe("8 Monate Mitglied");
    expect(until("2009-08-01")).toBe("1 Monat Mitglied");
    expect(until("2009-07-20")).toBe("weniger als einen Monat Mitglied");
    // Austritt heute zählt schon als Austritt – auch bei Status „Ausgetreten“.
    expect(membershipDuration(day("2016-10-20"), { leftAt: today, ended: true, today })).toBe(
      "10 Jahre Mitglied",
    );
  });

  it("angekündigter Austritt (in der Zukunft): Die Mitgliedschaft läuft noch", () => {
    expect(membershipDuration(day("2009-07-01"), { leftAt: day("2026-12-31"), today })).toBe(
      "seit 17 Jahren",
    );
  });

  it("ausgetreten oder archiviert ohne Austrittsdatum, Austritt vor Eintritt: keine Angabe", () => {
    expect(membershipDuration(day("2009-07-01"), { ended: true, today })).toBeNull();
    expect(
      membershipDuration(day("2009-07-01"), { leftAt: day("2026-12-31"), ended: true, today }),
    ).toBeNull();
    expect(membershipDuration(day("2009-07-01"), { leftAt: day("2008-01-01"), today })).toBeNull();
  });
});

describe("Geburtstag mit Alter", () => {
  it("Datum ausgeschrieben, Alter am Stichtag", () => {
    expect(birthdayText(day("1995-02-09"), day("2026-10-20"))).toBe("9. Februar 1995 · 31 Jahre");
    expect(birthdayText(day("1988-10-21"), day("2026-10-20"))).toBe("21. Oktober 1988 · 37 Jahre");
    expect(birthdayText(day("2025-01-01"), day("2026-10-20"))).toBe("1. Januar 2025 · 1 Jahr");
  });
});
