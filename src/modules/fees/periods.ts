import { MONTH_NAMES } from "@/lib/dates";
import type { FeeIntervalValue } from "./engine-types";

/**
 * Abrechnungszeiträume für Mitgliedsbeiträge: Monat, Quartal, Halbjahr oder Jahr. Alle Tage sind reine Kalendertage
 * (`Date` um UTC-Mitternacht wie `@db.Date`), gerechnet wird nur mit `getUTC*` – nie mit einer Zeitzone, sonst würde
 * ein Tag verrutschen. Reine Funktionen ohne Datenbank.
 */

/** Wiederkehrende Abrechnung (einmalige Beiträge haben keinen Zeitraum). */
export type BillingInterval = Exclude<FeeIntervalValue, "ONCE">;

export interface FeePeriod {
  /** Erster Tag (einschließlich). */
  start: Date;
  /** Letzter Tag (einschließlich). */
  end: Date;
  /** „Oktober 2026“, „4. Quartal 2026“, „2. Halbjahr 2026“ oder „2026“. */
  label: string;
}

const DAY_MS = 86_400_000;

const MONTHS: Record<BillingInterval, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  HALF_YEARLY: 6,
  YEARLY: 12,
};

/** Monate je Abrechnung: monatlich 1, vierteljährlich 3, halbjährlich 6, jährlich 12. */
export function monthsOfInterval(interval: BillingInterval): number {
  const months = MONTHS[interval];
  if (!months) throw new RangeError(`Kein wiederkehrender Abrechnungszeitraum: ${interval}`);
  return months;
}

/** Tag `n` Tage später (negativ = früher). */
export function addDays(day: Date, days: number): Date {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + days));
}

/** Erster Tag des Monats, in dem `day` liegt. */
export function startOfMonth(day: Date): Date {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
}

/** Letzter Tag des Monats, in dem `day` liegt. */
export function endOfMonth(day: Date): Date {
  return new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0));
}

/**
 * Anzahl der Tage eines Monats – entweder für den Monat, in dem ein Tag liegt, oder für Jahr und Monat (Monat ab 1,
 * also 2 = Februar). Schaltjahre zählen mit (Februar 2028: 29 Tage).
 */
export function daysInMonth(day: Date): number;
export function daysInMonth(year: number, month: number): number;
export function daysInMonth(dayOrYear: Date | number, month?: number): number {
  if (dayOrYear instanceof Date) return endOfMonth(dayOrYear).getUTCDate();
  if (month === undefined || !Number.isInteger(month) || month < 1 || month > 12)
    throw new RangeError(`Ungültiger Monat: ${month}`);
  return new Date(Date.UTC(dayOrYear, month, 0)).getUTCDate();
}

function label(interval: BillingInterval, year: number, firstMonth: number): string {
  switch (interval) {
    case "MONTHLY":
      return `${MONTH_NAMES[firstMonth]} ${year}`;
    case "QUARTERLY":
      return `${firstMonth / 3 + 1}. Quartal ${year}`;
    case "HALF_YEARLY":
      return `${firstMonth / 6 + 1}. Halbjahr ${year}`;
    case "YEARLY":
      return `${year}`;
  }
}

/** Der Abrechnungszeitraum, in dem `day` liegt (z. B. Quartal: 01.10.–31.12.2026, „4. Quartal 2026“). */
export function periodFor(interval: BillingInterval, day: Date): FeePeriod {
  const months = monthsOfInterval(interval);
  const year = day.getUTCFullYear();
  const firstMonth = Math.floor(day.getUTCMonth() / months) * months; // ab 0
  return {
    start: new Date(Date.UTC(year, firstMonth, 1)),
    end: new Date(Date.UTC(year, firstMonth + months, 0)),
    label: label(interval, year, firstMonth),
  };
}

type PeriodRef = Date | Pick<FeePeriod, "start" | "end">;

/** Der Zeitraum nach dem angegebenen (ein Tag darin oder der Zeitraum selbst). */
export function nextPeriod(interval: BillingInterval, current: PeriodRef): FeePeriod {
  const end = current instanceof Date ? periodFor(interval, current).end : current.end;
  return periodFor(interval, new Date(end.getTime() + DAY_MS));
}

/** Der Zeitraum vor dem angegebenen (ein Tag darin oder der Zeitraum selbst). */
export function previousPeriod(interval: BillingInterval, current: PeriodRef): FeePeriod {
  const start = current instanceof Date ? periodFor(interval, current).start : current.start;
  return periodFor(interval, new Date(start.getTime() - DAY_MS));
}

/**
 * Fälligkeit: der `dueDay`-te Tag ab Beginn des Zeitraums (1 = am ersten Tag, 15 = am 15.). Höchstens der 28., damit es
 * den Tag in jedem Monat gibt.
 */
export function dueDate(periodStart: Date, dueDay: number): Date {
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 28)
    throw new RangeError(`Fälligkeitstag muss zwischen 1 und 28 liegen: ${dueDay}`);
  return addDays(periodStart, dueDay - 1);
}
