import type { MemberStatus } from "@/generated/prisma/enums";
import { berlinParts, todayCalendarDate } from "@/lib/dates";

/**
 * Ehrungen: runde Mitgliedsjubiläen – reine Kalenderrechnung mit `@db.Date`-Werten (UTC-Mitternacht), ohne Datenbank und im
 * Browser nutzbar. Die Seite `/mitglieder/ehrungen` und die Dashboard-Karte „Jubiläen“ rechnen beide hiermit.
 *
 * Regeln:
 *  - **Stufen:** 10, 25, 40, 50, 60, 70 und 75 Jahre (`ANNIVERSARY_LEVELS`) – für alle Vereine gleich.
 *  - **Jubiläumstag** = Eintrittsdatum + N Jahre. Wer am 29. Februar eingetreten ist, hat das Jubiläum in Jahren ohne
 *    Schalttag am **28. Februar** – so endet eine Frist nach Jahren auch nach § 188 Abs. 3 BGB, wenn es den Tag im letzten
 *    Monat nicht gibt (anders als beim Geburtstag, `src/lib/birthdays.ts`, der dann auf den 1. März fällt).
 *  - **Wer zählt:** Mitglieder mit Eintrittsdatum, nicht archiviert, nicht im Papierkorb und nicht gesperrt – **am Jubiläumstag**
 *    gerechnet: Wer vorher ausgetreten ist (Austrittsdatum vor dem Jubiläum), fehlt; wer erst danach austritt, hat das Jubiläum
 *    erreicht. Am Austrittstag selbst ist man noch Mitglied („Austritt zum 31.12.“). Steht „Ausgetreten“ ohne Austrittsdatum
 *    im Datensatz, lässt sich der Tag nicht prüfen – die Person zählt nicht.
 *  - **Heute** ist immer der Kalendertag in Europe/Berlin (`todayCalendarDate`), auch das Bezugsjahr (`referenceYear`) – kurz
 *    nach Mitternacht am 1. Januar gilt also schon das neue Jahr, obwohl in UTC noch Silvester ist.
 */

/** Die Stufen in Jahren, aufsteigend. */
export const ANNIVERSARY_LEVELS: readonly number[] = [10, 25, 40, 50, 60, 70, 75];

const DAY = 86_400_000;

const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** Tag, an dem jemand `years` Jahre Mitglied ist (UTC-Mitternacht). 29. Februar → in Jahren ohne Schalttag der 28. Februar. */
export function anniversaryDate(joinedAt: Date, years: number): Date {
  const year = joinedAt.getUTCFullYear() + years;
  const month = joinedAt.getUTCMonth();
  const day = joinedAt.getUTCDate();
  if (month === 1 && day === 29 && !isLeapYear(year)) return new Date(Date.UTC(year, 1, 28));
  return new Date(Date.UTC(year, month, day));
}

/** Was es über ein Mitglied für die Jubiläen braucht (Felder wie im Datensatz). */
export interface AnniversaryCandidate {
  joinedAt: Date | null;
  leftAt: Date | null;
  status: MemberStatus;
  archivedAt?: Date | null;
  deletedAt?: Date | null;
}

/** Ist die Person an diesem Kalendertag Mitglied im Sinne der Ehrungen? (Regeln siehe oben.) */
export function isMemberOn(member: AnniversaryCandidate, day: Date): boolean {
  if (member.archivedAt || member.deletedAt) return false;
  if (!member.joinedAt || member.joinedAt.getTime() > day.getTime()) return false;
  if (member.status === "BLOCKED") return false;
  if (member.leftAt && member.leftAt.getTime() < day.getTime()) return false;
  if (member.status === "LEFT" && !member.leftAt) return false;
  return true;
}

export interface Anniversary {
  /** Erreichte Stufe in Jahren. */
  years: number;
  /** Jubiläumstag (UTC-Mitternacht, `@db.Date`-Konvention). */
  date: Date;
}

/** Das runde Jubiläum eines Mitglieds im Kalenderjahr `year` – oder `null`, wenn es keins hat (oder dann kein Mitglied ist). */
export function anniversaryInYear(member: AnniversaryCandidate, year: number): Anniversary | null {
  if (!member.joinedAt) return null;
  const years = year - member.joinedAt.getUTCFullYear();
  if (!ANNIVERSARY_LEVELS.includes(years)) return null;
  const date = anniversaryDate(member.joinedAt, years);
  return isMemberOn(member, date) ? { years, date } : null;
}

export interface UpcomingAnniversary extends Anniversary {
  /** Tage ab heute (0 = heute). */
  inDays: number;
}

/**
 * Das nächste runde Jubiläum innerhalb von `days` Tagen ab `today` (Kalendertag, heute zählt mit) – auch über den
 * Jahreswechsel. `null`, wenn keins in den Zeitraum fällt.
 */
export function upcomingAnniversary(
  member: AnniversaryCandidate,
  today: Date,
  days: number,
): UpcomingAnniversary | null {
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  for (const year of [today.getUTCFullYear(), today.getUTCFullYear() + 1]) {
    const hit = anniversaryInYear(member, year);
    if (!hit) continue;
    const inDays = Math.round((hit.date.getTime() - todayUtc) / DAY);
    if (inDays >= 0 && inDays <= days) return { ...hit, inDays };
  }
  return null;
}

/** Bezugsjahr: das laufende Kalenderjahr in Berlin. */
export function referenceYear(now: Date = new Date()): number {
  return berlinParts(now).year;
}

/** Wie weit die Auswahl des Jahres (Seite, Druckansicht, Export) zurück- und vorausreicht – das laufende Jahr in der Mitte. */
export const ANNIVERSARY_YEAR_SPAN = 3;

/** Die wählbaren Jahre, aufsteigend: laufendes Jahr ± `ANNIVERSARY_YEAR_SPAN`. */
export function anniversaryYearChoices(currentYear: number): number[] {
  return Array.from(
    { length: ANNIVERSARY_YEAR_SPAN * 2 + 1 },
    (_, index) => currentYear - ANNIVERSARY_YEAR_SPAN + index,
  );
}

/** Heutiger Kalendertag in Berlin (UTC-Mitternacht) – wie überall bei Geburtstagen und Altersangaben. */
export const anniversaryToday = (now: Date = new Date()): Date => todayCalendarDate(now);

/**
 * Eintrittszeiträume (je ein ganzes Kalenderjahr, UTC), in denen jemand eingetreten sein muss, um in einem der Jahre `years`
 * eine der Stufen zu erreichen – damit die Datenbank nur in Frage kommende Mitglieder liefert.
 */
export function joinedRanges(years: readonly number[]): { gte: Date; lt: Date }[] {
  const joinYears = [
    ...new Set(years.flatMap((year) => ANNIVERSARY_LEVELS.map((level) => year - level))),
  ];
  return joinYears
    .sort((a, b) => a - b)
    .map((year) => ({
      gte: new Date(Date.UTC(year, 0, 1)),
      lt: new Date(Date.UTC(year + 1, 0, 1)),
    }));
}

/** „1 Jahr“, „25 Jahre“. */
export function yearsLabel(years: number): string {
  return years === 1 ? "1 Jahr" : `${years} Jahre`;
}

/**
 * „10, 25, 40, 50, 60, 70 und 75“ – die Stufen als Satzteil. Im Satz über eine Person passt „oder“ („Wer 10, 25 … oder 75
 * Jahre Mitglied ist“), in einer Aufzählung „und“.
 */
export function levelsText(levels: readonly number[], conjunction: "und" | "oder" = "und"): string {
  if (levels.length <= 1) return levels.join("");
  return `${levels.slice(0, -1).join(", ")} ${conjunction} ${levels.at(-1)}`;
}

/**
 * Fasst Einträge nach Stufe zusammen: höchste Stufe zuerst (die seltensten Ehrungen oben), darin nach Jubiläumstag und Name.
 */
export function groupByLevel<T extends Anniversary & { lastName: string; firstName: string }>(
  entries: readonly T[],
): { years: number; entries: T[] }[] {
  const groups = new Map<number, T[]>();
  for (const entry of entries) {
    const list = groups.get(entry.years) ?? [];
    list.push(entry);
    groups.set(entry.years, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([years, list]) => ({
      years,
      entries: list.sort(
        (a, b) =>
          a.date.getTime() - b.date.getTime() ||
          a.lastName.localeCompare(b.lastName, "de") ||
          a.firstName.localeCompare(b.firstName, "de"),
      ),
    }));
}
