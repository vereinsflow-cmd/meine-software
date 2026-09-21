import {
  addBerlinDays,
  berlinParts,
  berlinWeekday,
  MONTH_NAMES,
  startOfBerlinDate,
  startOfBerlinDay,
} from "@/lib/dates";
import type { BucketLabel, Granularity } from "./types";

/**
 * Zeiträume ("Buckets") für die Diagramme: die letzten N Wochen, Monate, Quartale oder Jahre bis einschließlich des laufenden,
 * alles in der Zeitzone Europe/Berlin (Wochen beginnen am Montag, Zählung nach ISO 8601). Ein Bucket reicht von `start`
 * (einschließlich) bis `end` (ausschließlich); Buckets schließen lückenlos aneinander an.
 */
export const GRANULARITIES: readonly Granularity[] = ["W", "M", "Q", "Y"];

export const GRANULARITY_COUNT: Record<Granularity, number> = { W: 12, M: 12, Q: 8, Y: 5 };

export { GRANULARITY_LABEL } from "./labels";

export interface TimeBucket extends BucketLabel {
  start: Date;
  end: Date;
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
] as const;

const pad = (n: number) => String(n).padStart(2, "0");
const shortYear = (year: number) => pad(year % 100);

/** ISO-8601-Kalenderwoche des (Berliner) Kalendertags; die Woche gehört zu dem Jahr, in dem ihr Donnerstag liegt. */
export function isoWeek(year: number, month: number, day: number): { year: number; week: number } {
  const weekday = (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7; // 0 = Montag
  const thursday = new Date(Date.UTC(year, month - 1, day + (3 - weekday)));
  const isoYear = thursday.getUTCFullYear();
  const dayOfYear = Math.round((thursday.getTime() - Date.UTC(isoYear, 0, 1)) / 86_400_000);
  return { year: isoYear, week: Math.floor(dayOfYear / 7) + 1 };
}

const dayMonth = (date: Date) => {
  const { day, month } = berlinParts(date);
  return `${pad(day)}.${pad(month)}.`;
};

function weekBucket(now: Date, back: number): Omit<TimeBucket, "partial"> {
  const thisWeekStart = addBerlinDays(startOfBerlinDay(now), -berlinWeekday(now));
  const start = addBerlinDays(thisWeekStart, -7 * back);
  const end = addBerlinDays(start, 7);
  const { year, month, day } = berlinParts(start);
  const iso = isoWeek(year, month, day);
  const last = addBerlinDays(end, -1);
  return {
    key: `${iso.year}-W${pad(iso.week)}`,
    label: `KW ${iso.week}`,
    fullLabel: `KW ${iso.week} (${dayMonth(start)}–${dayMonth(last)}${berlinParts(last).year})`,
    start,
    end,
  };
}

function monthBucket(now: Date, back: number): Omit<TimeBucket, "partial"> {
  const { year, month } = berlinParts(now);
  const index = year * 12 + (month - 1) - back;
  const y = Math.floor(index / 12);
  const m = index % 12; // 0-basiert
  return {
    key: `${y}-${pad(m + 1)}`,
    label: `${MONTH_SHORT[m]} ${shortYear(y)}`,
    fullLabel: `${MONTH_NAMES[m]} ${y}`,
    start: startOfBerlinDate(y, m + 1, 1),
    end: startOfBerlinDate(y, m + 2, 1),
  };
}

function quarterBucket(now: Date, back: number): Omit<TimeBucket, "partial"> {
  const { year, month } = berlinParts(now);
  const index = year * 4 + Math.floor((month - 1) / 3) - back;
  const y = Math.floor(index / 4);
  const q = index % 4; // 0-basiert
  return {
    key: `${y}-Q${q + 1}`,
    label: `Q${q + 1} ${shortYear(y)}`,
    fullLabel: `${q + 1}. Quartal ${y}`,
    start: startOfBerlinDate(y, q * 3 + 1, 1),
    end: startOfBerlinDate(y, q * 3 + 4, 1),
  };
}

function yearBucket(now: Date, back: number): Omit<TimeBucket, "partial"> {
  const y = berlinParts(now).year - back;
  return {
    key: String(y),
    label: String(y),
    fullLabel: String(y),
    start: startOfBerlinDate(y, 1, 1),
    end: startOfBerlinDate(y + 1, 1, 1),
  };
}

const MAKE = {
  W: weekBucket,
  M: monthBucket,
  Q: quarterBucket,
  Y: yearBucket,
} satisfies Record<Granularity, (now: Date, back: number) => Omit<TimeBucket, "partial">>;

/** Die letzten N Zeiträume, ältester zuerst; der letzte ist der laufende (`partial`). */
export function buildBuckets(granularity: Granularity, now: Date): TimeBucket[] {
  const count = GRANULARITY_COUNT[granularity];
  const buckets: TimeBucket[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const bucket = MAKE[granularity](now, back);
    buckets.push({ ...bucket, partial: bucket.end.getTime() > now.getTime() });
  }
  return buckets;
}

/** Index des Zeitraums, in den `instant` fällt – oder -1, wenn davor oder danach. */
export function bucketIndexOf(buckets: readonly TimeBucket[], instant: Date): number {
  const time = instant.getTime();
  const first = buckets[0];
  const last = buckets[buckets.length - 1];
  if (!first || !last || time < first.start.getTime() || time >= last.end.getTime()) return -1;
  return buckets.findIndex((bucket) => time < bucket.end.getTime());
}

/** Nur die Beschriftungen (ohne Zeitpunkte) – das, was die Oberfläche braucht. */
export function toLabels(buckets: readonly TimeBucket[]): BucketLabel[] {
  return buckets.map(({ key, label, fullLabel, partial }) => ({ key, label, fullLabel, partial }));
}
