import { describe, expect, it } from "vitest";
import { overlaps, shiftHealth } from "@/lib/shift-health";

const H = 3_600_000;
const now = new Date("2026-09-01T12:00:00Z");
const at = (hoursFromNow: number, durationHours = 3) => ({
  startsAt: new Date(now.getTime() + hoursFromNow * H),
  endsAt: new Date(now.getTime() + (hoursFromNow + durationHours) * H),
});
const shift = (overrides: Partial<Parameters<typeof shiftHealth>[0]> = {}) => ({
  status: "OPEN" as const,
  ...at(24 * 30),
  requiredCount: 4,
  filled: 0,
  ...overrides,
});

describe("shiftHealth", () => {
  it("bewertet die Besetzung", () => {
    expect(shiftHealth(shift({ filled: 0 }), now)).toMatchObject({
      fill: "EMPTY",
      freeSpots: 4,
      ratio: 0,
    });
    expect(shiftHealth(shift({ filled: 2 }), now)).toMatchObject({
      fill: "PARTIAL",
      freeSpots: 2,
      ratio: 0.5,
    });
    expect(shiftHealth(shift({ filled: 4 }), now)).toMatchObject({
      fill: "FULL",
      freeSpots: 0,
      ratio: 1,
    });
  });

  it("zählt Überbesetzung nie als negative freie Plätze", () => {
    expect(shiftHealth(shift({ filled: 6 }), now)).toMatchObject({
      fill: "FULL",
      freeSpots: 0,
      ratio: 1,
    });
  });

  it("abgesagte Schichten sind nie problematisch", () => {
    expect(shiftHealth(shift({ status: "CANCELLED", filled: 0, ...at(2) }), now)).toEqual({
      fill: "CANCELLED",
      urgency: "NONE",
      freeSpots: 0,
      ratio: 0,
    });
  });

  it("voll besetzte Schichten haben nie Dringlichkeit", () => {
    for (const hours of [-100, 1, 30, 24 * 3, 24 * 30]) {
      expect(shiftHealth(shift({ filled: 4, ...at(hours) }), now).urgency).toBe("NONE");
    }
  });

  it("stuft nicht besetzte Schichten nach Nähe zum Beginn ein", () => {
    expect(shiftHealth(shift(at(24 * 30)), now).urgency).toBe("NONE"); // weit entfernt
    expect(shiftHealth(shift(at(24 * 6.9)), now).urgency).toBe("SOON");
    expect(shiftHealth(shift(at(24 * 7.1)), now).urgency).toBe("NONE");
    expect(shiftHealth(shift(at(47)), now).urgency).toBe("CRITICAL");
    expect(shiftHealth(shift(at(0.5)), now).urgency).toBe("CRITICAL"); // läuft gerade an
    expect(shiftHealth(shift(at(-1, 3)), now).urgency).toBe("CRITICAL"); // läuft seit einer Stunde
  });

  it("markiert vergangene, nicht voll besetzte Schichten als überfällig", () => {
    expect(shiftHealth(shift({ filled: 2, ...at(-48, 3) }), now).urgency).toBe("OVERDUE");
  });
});

describe("overlaps", () => {
  const r = (start: number, end: number) => ({ startsAt: new Date(start), endsAt: new Date(end) });
  it("erkennt Überschneidungen", () => {
    expect(overlaps(r(0, 10), r(5, 15))).toBe(true);
    expect(overlaps(r(0, 10), r(2, 4))).toBe(true); // enthalten
    expect(overlaps(r(5, 15), r(0, 10))).toBe(true);
  });
  it("direkt aufeinanderfolgende Zeiträume überschneiden sich nicht", () => {
    expect(overlaps(r(0, 10), r(10, 20))).toBe(false);
    expect(overlaps(r(10, 20), r(0, 10))).toBe(false);
    expect(overlaps(r(0, 10), r(11, 20))).toBe(false);
  });
});
