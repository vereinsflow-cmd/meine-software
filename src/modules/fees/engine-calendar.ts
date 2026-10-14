import { ageOn, formatCalendarDate } from "@/lib/dates";
import { add, divInt, mulInt, ZERO, type Rational } from "@/lib/finance/rational";
import type { EngineMember } from "./engine-types";

/**
 * Kalendertage und Texte des Beitrags-Rechenkerns (`engine.ts`): Tage als fortlaufende Nummern, Datums-, Prozent- und
 * Namenstexte (Grenzen auf einem Geburtstag nur mit Monat) und der genaue Wert eines Abschnitts.
 */

const DAY_MS = 86_400_000;

export const collator = new Intl.Collator("de");

// ---------------------------------------------------------------------------
// Kalendertage als fortlaufende Nummern (Tage seit 01.01.1970) – schnell zu zählen und zu vergleichen
// ---------------------------------------------------------------------------

export type DayNo = number;

export const dayNo = (date: Date): DayNo => Math.floor(date.getTime() / DAY_MS);
export const dayDate = (day: DayNo): Date => new Date(day * DAY_MS);
export const utcDay = (year: number, month: number, day: number): DayNo =>
  dayNo(new Date(Date.UTC(year, month, day)));

const pad2 = (n: number) => String(n).padStart(2, "0");
/** „15.11.“ */
export function dayMonth(day: DayNo): string {
  const date = dayDate(day);
  return `${pad2(date.getUTCDate())}.${pad2(date.getUTCMonth() + 1)}.`;
}
/** „15.11.2026“ */
export const fullDate = (day: DayNo) => formatCalendarDate(dayDate(day));
const MONTH_LONG = new Intl.DateTimeFormat("de-DE", { month: "long", timeZone: "UTC" });
/** „November“ – für Grenzen, die aus dem Geburtstag folgen (das genaue Datum verrät das Geburtsdatum). */
export const monthName = (day: DayNo) => MONTH_LONG.format(dayDate(day));
export const paren = (text: string | null) => (text ? ` (${text})` : "");
export const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Basispunkte als Prozent: 5000 → „50“, 2550 → „25,5“. */
export function percentText(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const rest = Math.abs(bp % 100);
  return rest === 0 ? `${whole}` : `${whole},${pad2(rest).replace(/0$/, "")}`;
}

/** „am 01.10.2026“ bzw. „an 12 Tagen ab dem 01.10.2026“. */
export const daysText = (count: number, first: DayNo) =>
  count === 1 ? `am ${fullDate(first)}` : `an ${count} Tagen ab dem ${fullDate(first)}`;

/** Ist `day` ein Geburtstag, an dem sich das Alter ändert (nur beim Alter „genau ab dem Geburtstag“ eine Grenze)? */
export const isBirthday = (birth: Date | null, day: DayNo) =>
  birth !== null && ageOn(birth, dayDate(day)) !== ageOn(birth, dayDate(day - 1));

/**
 * Wie `daysText`, aber ohne das Geburtsdatum zu verraten: Beginnt die Lücke an einem Geburtstag oder endet sie direkt
 * davor, steht nur der Monat da („ab Geburtstag im November“) und keine Tageszahl (aus Anzahl und erstem Tag ließe sich
 * sonst der Geburtstag ausrechnen).
 */
export function maskedDaysText(
  count: number,
  first: DayNo,
  last: DayNo,
  periodEnd: DayNo,
  birthday: (day: DayNo) => boolean,
): string {
  const startMasked = birthday(first);
  const endMasked = last < periodEnd && birthday(last + 1);
  if (!startMasked && !endMasked) return daysText(count, first);
  const from = startMasked ? `ab Geburtstag im ${monthName(first)}` : `ab dem ${fullDate(first)}`;
  return endMasked ? `${from} bis Geburtstag im ${monthName(last + 1)}` : from;
}

/**
 * Genauer Wert eines Abschnitts: für jeden Monat, den er berührt, der Monatsbeitrag – ganz für volle Monate, sonst
 * anteilig nach Tagen (Monatsbeitrag × Tage im Abschnitt / Tage des Monats).
 */
export function segmentValue(monthly: Rational, from: DayNo, to: DayNo): Rational {
  let total = ZERO;
  let cursor = from;
  while (cursor <= to) {
    const date = dayDate(cursor);
    const monthLast = utcDay(date.getUTCFullYear(), date.getUTCMonth() + 1, 0);
    const monthDays = dayDate(monthLast).getUTCDate();
    const last = Math.min(to, monthLast);
    const covered = last - cursor + 1;
    total = add(
      total,
      covered === monthDays ? monthly : divInt(mulInt(monthly, covered), monthDays),
    );
    cursor = last + 1;
  }
  return total;
}

/**
 * Tage als Text, wobei Grenzen, die auf einen Geburtstag fallen (`masked`), nur den Monat zeigen – das genaue Datum
 * verriete das Geburtsdatum. Gilt auch für Grenzen, die aus dem Geburtstag eines anderen Familienmitglieds folgen.
 */
export function dayTexts(masked: ReadonlySet<DayNo>, periodStart: DayNo, periodEnd: DayNo) {
  const fromText = (day: DayNo) =>
    masked.has(day) ? `ab Geburtstag im ${monthName(day)}` : dayMonth(day);
  const toText = (day: DayNo) =>
    masked.has(day + 1) ? `bis Geburtstag im ${monthName(day + 1)}` : dayMonth(day);
  /** „01.10.–14.11.“, „bis Geburtstag im November“, „ab Geburtstag im November bis 31.12.“ */
  const spanText = (from: DayNo, to: DayNo) => {
    const start = fromText(from);
    const end = toText(to);
    if (!start.startsWith("ab ") && !end.startsWith("bis ")) return `${start}–${end}`;
    return `${start.startsWith("ab ") ? start : `ab ${start}`} ${end.startsWith("bis ") ? end : `bis ${end}`}`;
  };
  /** Wie `spanText` mit führendem Komma; leer für den ganzen Zeitraum. */
  const rangeText = (from: DayNo, to: DayNo) =>
    from === periodStart && to === periodEnd ? "" : `, ${spanText(from, to)}`;
  return { fromText, toText, spanText, rangeText };
}

/** Name in Aufzählungen: Vorname, sonst der ganze Name. */
export const shortNameOf = (member: EngineMember) => member.shortName || member.name;

/** „Sophie“, „Sophie und Lena“, „Sophie, Lena und Mia“. */
export function listText(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} und ${names[names.length - 1]}`;
}
