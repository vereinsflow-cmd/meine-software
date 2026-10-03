import { describe, expect, it } from "vitest";
import { formatDayMonth } from "@/lib/dates";
import { joinTitles, staffingText } from "@/modules/shifts/staffing-text";

const shift = (
  filled: number,
  requiredCount: number,
  over: Partial<Parameters<typeof staffingText>[0]> = {},
) => ({
  filled,
  requiredCount,
  status: "OPEN" as const,
  started: false,
  health: {
    fill:
      filled >= requiredCount
        ? ("FULL" as const)
        : filled === 0
          ? ("EMPTY" as const)
          : ("PARTIAL" as const),
    urgency: "NONE" as const,
    freeSpots: Math.max(0, requiredCount - filled),
  },
  ...over,
});

describe("staffingText", () => {
  it("teilweise besetzt: freie Plätze, ohne Farbe; noch niemand: bernstein", () => {
    expect(staffingText(shift(3, 4))).toEqual({ count: "3 von 4", note: "1 frei", tone: "none" });
    expect(staffingText(shift(0, 3))).toEqual({ count: "0 von 3", note: "3 frei", tone: "amber" });
  });

  it("voll ist grün – auch überbucht", () => {
    expect(staffingText(shift(5, 5))).toMatchObject({ note: "voll", tone: "green" });
    expect(staffingText(shift(3, 2))).toMatchObject({ count: "3 von 2", note: "voll" });
  });

  it("Dringlichkeit vor „Anmeldung geschlossen“; laufende Schichten heißen „läuft“", () => {
    const critical = { ...shift(0, 4).health, urgency: "CRITICAL" as const };
    expect(staffingText(shift(0, 4, { health: critical }))).toMatchObject({
      note: "dringend",
      tone: "red",
    });
    const soon = { ...shift(1, 3).health, urgency: "SOON" as const };
    expect(staffingText(shift(1, 3, { health: soon, status: "CLOSED" }))).toMatchObject({
      note: "beginnt bald",
      tone: "amber",
    });
    expect(staffingText(shift(0, 2, { status: "CLOSED" }))).toMatchObject({
      note: "Anmeldung geschlossen",
      tone: "none",
    });
    expect(staffingText(shift(1, 3, { started: true, health: critical }))).toMatchObject({
      note: "läuft",
    });
  });

  it("vorbei, ohne voll gewesen zu sein", () => {
    const overdue = { ...shift(1, 3).health, urgency: "OVERDUE" as const };
    expect(staffingText(shift(1, 3, { started: true, health: overdue }))).toMatchObject({
      note: "vorbei",
      tone: "none",
    });
  });

  it("abgesagt", () => {
    expect(staffingText(shift(2, 3, { status: "CANCELLED" })).note).toBe("abgesagt");
  });
});

describe("joinTitles / formatDayMonth", () => {
  it("verbindet Titel wie im Satz", () => {
    expect(joinTitles([])).toBe("");
    expect(joinTitles(["Malerarbeiten"])).toBe("Malerarbeiten");
    expect(joinTitles(["Malerarbeiten", "Verpflegung"])).toBe("Malerarbeiten und Verpflegung");
    expect(joinTitles(["A", "B", "C"])).toBe("A, B und C");
  });

  it("Tag mit kurzem Monatsnamen in Berliner Zeit", () => {
    expect(formatDayMonth(new Date("2026-10-10T07:00:00Z"))).toBe("Sa., 10. Okt.");
    expect(formatDayMonth(new Date("2026-10-31T23:30:00Z"))).toBe("So., 1. Nov.");
  });
});
