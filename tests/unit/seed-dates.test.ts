import { describe, expect, it } from "vitest";
import { berlinWeekday, daysUntil, parseBerlinDateTime } from "@/lib/dates";
import { shiftHealth } from "@/lib/shift-health";
import { demoEventDates } from "../../prisma/seed-dates";

/**
 * Termine der Demo-Daten (Seed) hängen vom Tag und der Uhrzeit des Seeds ab. Die Ende-zu-Ende-Tests erwarten an jedem
 * Wochentag und zu jeder Uhrzeit dasselbe – etwa den Hinweis „Helferschichten sind noch nicht besetzt“ auf dem Dashboard
 * (dashboard.spec.ts). Samstags vor 9 Uhr fehlte er (CI am 28.11.2026 um 2:53 Uhr): Der Arbeitseinsatz lag damals am
 * nächsten Samstag, eine Woche später, mehr als 7 × 24 Stunden entfernt.
 */
const HOUR = 3_600_000;

/** `count` Kalendertage ab `first` („JJJJ-MM-TT“). */
function days(first: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(`${first}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}

// Je zwei Wochen um beide Zeitumstellungen 2026 (29.03. und 25.10.) und die Woche des CI-Fehlers; jede volle Stunde und
// jeweils eine Minute vor der nächsten.
const DAYS = [...days("2026-03-23", 14), ...days("2026-10-19", 14), ...days("2026-11-23", 7)];
const TIMES = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0")).flatMap(
  (hour) => [`${hour}:00`, `${hour}:59`],
);
const MOMENTS = DAYS.flatMap((day) =>
  TIMES.map((time) => ({ label: `${day} ${time}`, now: parseBerlinDateTime(day, time)! })),
);

/** Warnstufe der unbesetzten Schicht „Malerarbeiten“ (0 von 4) zum Zeitpunkt `now`. */
const urgency = (shift: { startsAt: Date; endsAt: Date }, now: Date) =>
  shiftHealth({ status: "OPEN", requiredCount: 4, filled: 0, ...shift }, now).urgency;

describe("Demo-Daten: Termine relativ zum Tag des Seeds", () => {
  it("deckt jeden Wochentag ab", () => {
    expect(new Set(MOMENTS.map(({ now }) => berlinWeekday(now))).size).toBe(7);
  });

  it("die leere Schicht des Arbeitseinsatzes „beginnt bald“ – an jedem Wochentag und zu jeder Uhrzeit des Seeds", () => {
    for (const { label, now } of MOMENTS) {
      const { workAssignment } = demoEventDates(now);
      expect(urgency(workAssignment, now), label).toBe("SOON");
      // Ein Testlauf über Mitternacht (bis zu einem Tag nach dem Seed) sieht den Hinweis weiterhin – dann „Dringend“.
      expect(["SOON", "CRITICAL"], label).toContain(
        urgency(workAssignment, new Date(now.getTime() + 24 * HOUR)),
      );
    }
  });

  it("Arbeitseinsatz in drei Tagen, Sommerfest am übernächsten Samstag (8–14 Tage) – „Bis“ 7 Tage trennt beide", () => {
    for (const { label, now } of MOMENTS) {
      const { festDay, workAssignment } = demoEventDates(now);
      expect(daysUntil(workAssignment.startsAt, now), label).toBe(3);
      expect(berlinWeekday(festDay), label).toBe(5);
      expect(daysUntil(festDay, now), label).toBeGreaterThanOrEqual(8);
      expect(daysUntil(festDay, now), label).toBeLessThanOrEqual(14);
    }
  });

  it("Samstag, 28.11.2026, 2:53 Uhr (CI-Lauf ohne Hinweis): jetzt „bald“, am alten Termin (nächster Samstag) noch nicht", () => {
    const now = parseBerlinDateTime("2026-11-28", "02:53")!;
    expect(urgency(demoEventDates(now).workAssignment, now)).toBe("SOON");
    const oldSaturday = {
      startsAt: parseBerlinDateTime("2026-12-05", "09:00")!,
      endsAt: parseBerlinDateTime("2026-12-05", "13:00")!,
    };
    expect(urgency(oldSaturday, now)).toBe("NONE");
  });
});
