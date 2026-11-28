/**
 * Termine der Demo-Daten relativ zum „Heute“ des Seeds (`seedToday` in seed.ts) – ohne Datenbank, damit ein Unit-Test sie
 * für jeden Wochentag und jede Uhrzeit nachrechnen kann (tests/unit/seed-dates.test.ts).
 */
import {
  addBerlinDays,
  berlinWeekday,
  parseBerlinDateTime,
  toDateInputValue,
} from "../src/lib/dates";

/** Uhrzeit `time` („HH:MM“, Berliner Zeit) am Kalendertag von `day`. */
export const at = (day: Date, time: string): Date => {
  const value = parseBerlinDateTime(toDateInputValue(day), time);
  if (!value) throw new Error(`Ungültige Zeit ${time}`);
  return value;
};

/**
 * - `festDay`: Sommerfest am übernächsten Samstag – der nächste Samstag (1–7 Tage), dann eine Woche später, also 8–14 Tage
 *   nach dem Seed (so rechnen auch kalender.spec.ts und helferplan-drucken.spec.ts).
 * - `workAssignment`: Arbeitseinsatz Vereinsheim mit der unbesetzten Schicht „Malerarbeiten“, 9–13 Uhr, immer drei Tage
 *   nach dem Seed. Sie beginnt also 2 Tage 9 Stunden bis 3 Tage 9 Stunden (± 1 Stunde Zeitumstellung) später: „Beginnt
 *   bald“ (unter 7 Tagen, mehr als 48 Stunden, siehe shift-health.ts) an jedem Wochentag und zu jeder Uhrzeit – davon lebt
 *   der Hinweis „Helferschichten sind noch nicht besetzt“ auf dem Dashboard. Geht ein Testlauf über Mitternacht, wird es
 *   „Dringend“; der Hinweis bleibt. Bis 28.11.2026 lag der Arbeitseinsatz am nächsten Samstag – samstags also erst in
 *   sieben Tagen, vor 9 Uhr mehr als 7 × 24 Stunden entfernt: kein Hinweis (CI-Lauf samstags um 2:53 Uhr).
 */
export function demoEventDates(today: Date): {
  festDay: Date;
  workAssignment: { startsAt: Date; endsAt: Date };
} {
  const daysUntilSaturday = (5 - berlinWeekday(today) + 7) % 7;
  const nextSaturday = addBerlinDays(today, daysUntilSaturday === 0 ? 7 : daysUntilSaturday);
  const workDay = addBerlinDays(today, 3);
  return {
    festDay: addBerlinDays(nextSaturday, 7),
    workAssignment: { startsAt: at(workDay, "09:00"), endsAt: at(workDay, "13:00") },
  };
}
