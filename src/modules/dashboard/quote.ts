import { sumPerBucket } from "@/lib/charts/aggregate";
import { formatNumber } from "@/lib/charts/geometry";
import { buildBuckets, isoWeek, type TimeBucket } from "@/lib/charts/time-buckets";
import { MONTH_NAMES, berlinParts, formatDate } from "@/lib/dates";

/**
 * Kennzahlen „wie eine Aktie“ (seit 02.10.2026, auf Wunsch: „die Statistiken wie eine Aktie darstellen“, Entwurf 1
 * „Kurs-Karten“): Zu jeder Kennzahlenkarte ein Kursverlauf für mehrere Zeiträume, die Veränderung seit Beginn des Zeitraums
 * („▲ +5 (+26,3 %) in 12 Monaten“) sowie Hoch, Tief und Durchschnitt. Alles aus vorhandenen Vereinsdaten – nichts wird
 * gespeichert oder geschätzt. Der letzte Punkt jedes Verlaufs ist „jetzt“ und genau die Zahl auf der Karte.
 *
 * Bestände (Mitglieder, Termine in 30 Tagen, besetzte Plätze) werden ab heute zurück gemessen: „12 Monate“ heißt vom selben
 * Tag vor einem Jahr bis heute, ein Punkt je Monat (`samplesBack`). So stimmt die Veränderung genau für den genannten Zeitraum.
 *
 * Reine Funktionen ohne Datenbank (einzeln getestet); die Abfragen stehen in `service.ts`.
 */

export interface QuotePoint {
  /** Kurz für die Achse („Okt 26“, „KW 40“, „2026“). */
  label: string;
  /** Ausführlich für das Infofeld („02.10.2025“, „Oktober 2026“, „Heute“). */
  fullLabel: string;
  value: number;
}

export type QuoteStep = "Woche" | "Monat" | "Jahr";

export interface QuotePeriod {
  id: string;
  /** Beschriftung des Knopfs („12 M“). */
  label: string;
  /** Zusatz zur Veränderung („in 12 Monaten“, „seit 01.01.2026“). */
  since: string;
  /** Wie der Zeitraum unterteilt ist – für „Ø je Monat“ bei Summen. */
  step: QuoteStep;
  points: QuotePoint[];
  /**
   * Zu- und Abgänge zwischen zwei Punkten (wie das Handelsvolumen unter einem Kurs), je Punkt; der erste ist immer 0. Die
   * Summe der Zugänge minus der Abgänge ist genau die Veränderung im Zeitraum.
   */
  volume?: { up: number[]; down: number[] };
}

/**
 * `level`: ein Bestand zu jedem Zeitpunkt (Mitglieder, Termine in den folgenden 30 Tagen, besetzte Plätze) – Veränderung mit
 * Prozent. `total`: im Zeitraum aufsummiert, beginnt mit dem Startpunkt 0 (Helferstunden) – Veränderung ohne Prozent (von 0
 * aus sinnlos).
 */
export type QuoteKind = "level" | "total";

export interface Quote {
  kind: QuoteKind;
  unit: { singular: string; plural: string; decimals: number };
  /** Veränderung mit Prozent („+5 (+26,3 %)“) oder mit Einheit („+6 besetzt“, „+9 Std.“). */
  showPercent: boolean;
  periods: QuotePeriod[];
  defaultPeriod: string;
}

export type QuoteDirection = "up" | "down" | "flat";

export interface QuoteChange {
  diff: number;
  /** Veränderung in Prozent des Startwerts; `null` bei Summen oder Startwert 0. */
  percent: number | null;
  direction: QuoteDirection;
}

/** Veränderung vom ersten zum letzten Punkt. Gerundet auf die Nachkommastellen der Einheit, damit „±0“ wirklich null ist. */
export function quoteChange(
  points: readonly QuotePoint[],
  kind: QuoteKind,
  decimals = 0,
): QuoteChange {
  const first = points[0]?.value ?? 0;
  const last = points.at(-1)?.value ?? 0;
  const factor = 10 ** decimals;
  const diff = Math.round((last - first) * factor) / factor;
  const percent = kind === "level" && first !== 0 ? (diff / Math.abs(first)) * 100 : null;
  return { diff, percent, direction: diff > 0 ? "up" : diff < 0 ? "down" : "flat" };
}

/**
 * Hoch, Tief und Durchschnitt eines Zeitraums. Bei Beständen über die Punkte selbst; bei Summen über den Zuwachs je Abschnitt
 * („bester Monat“, „Ø je Monat“) – die aufsummierte Linie selbst steigt ja nur. Der Startpunkt 0 der Summen ist kein
 * Abschnitt und zählt nicht mit.
 */
export function quoteStats(
  points: readonly QuotePoint[],
  kind: QuoteKind,
): { high: number; low: number; average: number } {
  const values =
    kind === "level"
      ? points.map((point) => point.value)
      : points.slice(1).map((point, index) => point.value - points[index]!.value);
  if (values.length === 0) return { high: 0, low: 0, average: 0 };
  return {
    high: Math.max(...values),
    low: Math.min(...values),
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
  };
}

/** „+5“, „−2“ (echtes Minuszeichen), „±0“ – mit deutschem Komma. */
export function formatSigned(value: number, decimals = 0): string {
  if (value === 0) return "±0";
  return `${value > 0 ? "+" : "−"}${formatNumber(Math.abs(value), decimals)}`;
}

/** „+26,3 %“, „−8,0 %“, „±0,0 %“ – immer eine Nachkommastelle, wie bei Kursen. */
export function formatPercentSigned(percent: number): string {
  const rounded = Math.round(percent * 10) / 10;
  if (rounded === 0) return "±0,0 %";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toLocaleString("de-DE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} %`;
}

const DAY = 86_400_000;

/**
 * Stichtage ab heute zurück: `count` Schritte (Wochen, Monate, Jahre) vor jetzt bis jetzt, ältester zuerst (`count + 1`
 * Zeitpunkte). Monate und Jahre am selben Kalendertag – am 31. eines Monats in einem kürzeren Monat am letzten Tag.
 */
export function samplesBack(now: Date, step: QuoteStep, count: number): Date[] {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const timeOfDay = now.getTime() - Date.UTC(year, month, day);
  const back = (y: number, m: number) => {
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(day, lastDay)) + timeOfDay);
  };
  return Array.from({ length: count + 1 }, (_, index) => {
    const k = count - index;
    if (k === 0) return now;
    if (step === "Woche") return new Date(now.getTime() - k * 7 * DAY);
    if (step === "Monat") return back(year, month - k);
    return back(year - k, month);
  });
}

/** Beschriftung eines Stichtags: kurz für die Achse („KW 40“, „Okt 26“, „2026“), ausführlich als Datum („02.10.2025“). */
function sampled(times: readonly Date[], step: QuoteStep, valueAt: (time: Date) => number) {
  return times.map((time, index): QuotePoint => {
    const { year, month, day } = berlinParts(time);
    const label =
      step === "Woche"
        ? `KW ${isoWeek(year, month, day).week}`
        : step === "Monat"
          ? `${MONTH_NAMES[month - 1]!.slice(0, 3)} ${String(year).slice(2)}`
          : String(year);
    return {
      label,
      fullLabel: index === times.length - 1 ? "Heute" : formatDate(time),
      value: valueAt(time),
    };
  });
}

/** Ein Mitglied im Bestand – für den Verlauf der Mitgliederzahl. */
export interface MemberRecord {
  joinedAt: Date | null;
  createdAt: Date;
  archivedAt: Date | null;
  deletedAt: Date | null;
}

/**
 * Seit wann und bis wann ein Mitglied in der Zahl auf der Karte steckt (alle Mitglieder im Bestand, ohne Archiv und
 * Papierkorb, unabhängig vom Status): ab dem Eintritt – bzw. ab dem Anlegen, wenn kein Eintrittsdatum eingetragen ist oder
 * der Eintritt erst bevorsteht (die Karte zählt solche Mitglieder schon) – bis zum Archivieren oder Löschen.
 */
function memberSpan(record: MemberRecord, now: number): { start: number; end: number } {
  const joined = record.joinedAt?.getTime();
  const start = joined !== undefined && joined <= now ? joined : record.createdAt.getTime();
  const end = Math.min(
    record.archivedAt?.getTime() ?? Number.POSITIVE_INFINITY,
    record.deletedAt?.getTime() ?? Number.POSITIVE_INFINITY,
  );
  return { start, end: Math.max(start, end) };
}

/** Mitgliederzahl zu jedem Stichtag (wie die Karte), dazu Zu- und Abgänge seit dem vorigen Stichtag. */
function memberSeries(
  records: readonly MemberRecord[],
  now: Date,
  step: QuoteStep,
  count: number,
): { points: QuotePoint[]; up: number[]; down: number[] } {
  const spans = records.map((record) => memberSpan(record, now.getTime()));
  const times = samplesBack(now, step, count);
  const points = sampled(
    times,
    step,
    (time) =>
      spans.filter((span) => span.start <= time.getTime() && span.end > time.getTime()).length,
  );
  const between = (pick: (span: { start: number; end: number }) => number) =>
    times.map((time, index) => {
      if (index === 0) return 0;
      const from = times[index - 1]!.getTime();
      return spans.filter((span) => pick(span) > from && pick(span) <= time.getTime()).length;
    });
  return { points, up: between((span) => span.start), down: between((span) => span.end) };
}

/** Mitglieder: Mitgliederzahl wie auf der Karte, je Monat bzw. Jahr ab heute zurück, dazu Zu- und Abgänge. 6 M, 12 M, 5 J. */
export function membersQuote(records: readonly MemberRecord[], now: Date): Quote {
  const period = (id: string, label: string, since: string, step: QuoteStep, count: number) => {
    const series = memberSeries(records, now, step, count);
    return {
      id,
      label,
      since,
      step,
      points: series.points,
      volume: { up: series.up, down: series.down },
    };
  };
  return {
    kind: "level",
    unit: { singular: "Mitglied", plural: "Mitglieder", decimals: 0 },
    showPercent: true,
    defaultPeriod: "12M",
    periods: [
      period("6M", "6 M", "in 6 Monaten", "Monat", 6),
      period("12M", "12 M", "in 12 Monaten", "Monat", 12),
      period("5J", "5 J", "in 5 Jahren", "Jahr", 5),
    ],
  };
}

/**
 * Termine: zu jedem Stichtag die Zahl der Termine in den folgenden 30 Tagen – derselbe Wert wie die Kennzahl, nur
 * rückblickend (nach heutigem Stand: gezählt werden Termine, die heute veröffentlicht oder abgeschlossen sind). Der letzte
 * Punkt ist „jetzt“ (`countNow` – genau die Zahl auf der Karte). 12 W, 6 M und 12 M.
 */
export function eventsQuote(starts: readonly Date[], now: Date, countNow: number): Quote {
  const times = starts.map((start) => start.getTime());
  const ahead = (time: Date) =>
    times.filter((start) => start >= time.getTime() && start < time.getTime() + 30 * DAY).length;
  const period = (id: string, label: string, since: string, step: QuoteStep, count: number) => {
    const points = sampled(samplesBack(now, step, count), step, ahead);
    points.at(-1)!.value = countNow;
    return { id, label, since, step, points };
  };
  return {
    kind: "level",
    unit: { singular: "Termin", plural: "Termine", decimals: 0 },
    showPercent: true,
    defaultPeriod: "12W",
    periods: [
      period("12W", "12 W", "in 12 Wochen", "Woche", 12),
      period("6M", "6 M", "in 6 Monaten", "Monat", 6),
      period("12M", "12 M", "in 12 Monaten", "Monat", 12),
    ],
  };
}

/** Aufsummiert: jeder Punkt ist die Summe bis zum Ende seines Abschnitts. */
function cumulative(values: readonly number[]): number[] {
  let sum = 0;
  return values.map((value) => (sum += value));
}

const pointsOf = (buckets: readonly TimeBucket[], values: readonly number[]): QuotePoint[] =>
  buckets.map((bucket, index) => ({
    label: bucket.label,
    fullLabel: bucket.fullLabel,
    value: values[index] ?? 0,
  }));

/**
 * Helferstunden: im Zeitraum aufsummiert (wie ein Kurs, der nur steigen kann), beginnend mit dem Startpunkt 0 am Beginn des
 * ersten Abschnitts. „12 W“ je Woche, das laufende Jahr je Monat seit dem 1. Januar (der letzte Punkt ist die Zahl auf der
 * Karte, `minutesThisYear`), „5 J“ je Kalenderjahr.
 */
export function hoursQuote(
  rows: readonly { at: Date; minutes: number }[],
  now: Date,
  year: number,
  minutesThisYear: number,
): Quote {
  const hours = rows.map((row) => ({ at: row.at, value: row.minutes / 60 }));
  const round = (value: number) => Math.round(value * 10) / 10;
  const series = (buckets: readonly TimeBucket[]): QuotePoint[] => [
    { label: "Start", fullLabel: formatDate(buckets[0]!.start), value: 0 },
    ...pointsOf(buckets, cumulative(sumPerBucket(hours, buckets)).map(round)),
  ];
  const months = buildBuckets("M", now).filter((bucket) => bucket.key.startsWith(`${year}-`));
  const yearPoints = series(months);
  // Genau die Zahl der Karte als letzter Punkt.
  yearPoints.at(-1)!.value = round(minutesThisYear / 60);
  return {
    kind: "total",
    unit: { singular: "Std.", plural: "Std.", decimals: 1 },
    showPercent: false,
    defaultPeriod: "Y0",
    periods: [
      {
        id: "12W",
        label: "12 W",
        since: "in 12 Wochen",
        step: "Woche",
        points: series(buildBuckets("W", now)),
      },
      {
        id: "Y0",
        label: String(year),
        since: `seit 01.01.${year}`,
        step: "Monat",
        points: yearPoints,
      },
      {
        id: "5J",
        label: "5 J",
        since: "in 5 Jahren",
        step: "Jahr",
        points: series(buildBuckets("Y", now)),
      },
    ],
  };
}

/** Eine Helferschicht mit ihren Eintragungen – für den Verlauf der Besetzung. */
export interface StaffingShift {
  requiredCount: number;
  assignments: { assignedAt: Date; cancelledAt: Date | null; status: "CONFIRMED" | "CANCELLED" }[];
}

/**
 * Besetzte Plätze der heute offenen Schichten zum Zeitpunkt `at`: Eintragungen, die schon bestanden und noch nicht abgesagt
 * waren, je Schicht höchstens so viele wie benötigt (wie die Kennzahl). Eine Absage ohne Zeitpunkt zählt nie. Trägt sich
 * jemand nach einer Absage erneut ein, wird dieselbe Eintragung wiederverwendet – die frühere Zeit fehlt dann im Verlauf.
 */
export function filledAt(shifts: readonly StaffingShift[], at: Date): number {
  const time = at.getTime();
  let filled = 0;
  for (const shift of shifts) {
    let count = 0;
    for (const assignment of shift.assignments) {
      if (assignment.assignedAt.getTime() > time) continue;
      if (assignment.status === "CANCELLED" && !assignment.cancelledAt) continue;
      if (assignment.cancelledAt && assignment.cancelledAt.getTime() <= time) continue;
      count += 1;
    }
    filled += Math.min(count, shift.requiredCount);
  }
  return filled;
}

/**
 * Freie Helferplätze: wie sich die Besetzung der heute offenen Schichten entwickelt hat – besetzte Plätze je Woche ab heute
 * zurück, der letzte Punkt ist „jetzt“ (`filledNow`). Die Einheit heißt „besetzt“: Auf der Karte steht die Zahl der FREIEN
 * Plätze, die Veränderung („▲ +9 besetzt in 6 Wochen“) betrifft die besetzten. 6 W und 12 W.
 */
export function staffingQuote(
  shifts: readonly StaffingShift[],
  now: Date,
  filledNow: number,
): Quote {
  const period = (id: string, label: string, since: string, count: number) => {
    const points = sampled(samplesBack(now, "Woche", count), "Woche", (time) =>
      filledAt(shifts, time),
    );
    points.at(-1)!.value = filledNow;
    return { id, label, since, step: "Woche" as const, points };
  };
  return {
    kind: "level",
    unit: { singular: "besetzt", plural: "besetzt", decimals: 0 },
    showPercent: false,
    defaultPeriod: "6W",
    periods: [period("6W", "6 W", "in 6 Wochen", 6), period("12W", "12 W", "in 12 Wochen", 12)],
  };
}
