import { formatCalendarDate, formatEuroFromCents, MONTH_NAMES } from "@/lib/dates";

/**
 * Reine Hilfen für den Kontoverlauf im Kopf der Finanz-Übersicht („Kontostand · alle Konten“, seit 21.10.2026 nach Entwurf 1
 * „Wie eine Banking-App“): Beginn des Verlaufs, Stand am Ende jedes Tages, Hoch und Tief, Veränderung seit Monatsbeginn,
 * Beschriftung der Achse, Stände am Monatsende für die Tabelle und der Satz für Screenreader. Ohne Datenbank und ohne React –
 * im Browser und auf dem Server gleich, einzeln getestet (tests/unit/finance-balance-curve.test.ts).
 *
 * Alle Tage sind Kalendertage um Mitternacht UTC (wie `bookingDate` aus der Datenbank und `todayCalendarDate()`).
 */

const DAY = 86_400_000;

/** So viele Tage zeigt der Verlauf mindestens – im Januar reicht er dafür ins Vorjahr (sonst stünden dort nur drei Punkte). */
export const CURVE_MIN_DAYS = 90;

/** Summe aller Buchungen eines Buchungstags (alle Konten). */
export interface DaySum {
  date: Date;
  cents: number;
}

/** Gesamtstand am Ende jedes Tages: `values[0]` gehört zu `from`, der letzte Wert zu heute. */
export interface BalanceCurve {
  from: Date;
  values: number[];
}

/** Ein markierter Punkt des Verlaufs (Hoch, Tief). */
export interface CurveMark {
  index: number;
  date: Date;
  cents: number;
}

/**
 * Erster Tag des Verlaufs: der 1. Januar – mindestens aber `minDays` Tage bis heute (im Januar also ab Oktober des Vorjahrs) –
 * und nie vor dem Beginn des Kassenbuchs.
 */
export function curveStart(today: Date, ledgerStart: Date, minDays = CURVE_MIN_DAYS): Date {
  const yearStart = Date.UTC(today.getUTCFullYear(), 0, 1);
  const back = today.getTime() - (minDays - 1) * DAY;
  return new Date(Math.max(Math.min(yearStart, back), ledgerStart.getTime()));
}

/**
 * Stand am Ende jedes Tages von `from` bis `to` aus den Tagessummen: Alles vor `from` ergibt den Stand am Morgen des ersten
 * Tages, danach kommt jeder Tag hinzu. Summen nach `to` zählen nicht. Liegt `to` vor `from`, ist der Verlauf leer.
 */
export function dailyBalances(sums: readonly DaySum[], from: Date, to: Date): BalanceCurve {
  const start = from.getTime();
  const end = to.getTime();
  if (end < start) return { from, values: [] };
  let balance = 0;
  const byDay = new Map<number, number>();
  for (const { date, cents } of sums) {
    const time = date.getTime();
    if (time > end) continue;
    if (time < start) balance += cents;
    else byDay.set(time, (byDay.get(time) ?? 0) + cents);
  }
  const values: number[] = [];
  for (let time = start; time <= end; time += DAY) {
    balance += byDay.get(time) ?? 0;
    values.push(balance);
  }
  return { from, values };
}

/** Der Kalendertag eines Punkts. */
export function curveDay(curve: BalanceCurve, index: number): Date {
  return new Date(curve.from.getTime() + index * DAY);
}

/**
 * Höchster und niedrigster Stand (jeweils der erste Tag, an dem er erreicht war) – `null`, wenn es keinen Verlauf gibt oder
 * der Stand die ganze Zeit gleich war (dann gibt es nichts zu markieren).
 */
export function curveExtremes(curve: BalanceCurve): { high: CurveMark; low: CurveMark } | null {
  const { values } = curve;
  if (values.length < 2) return null;
  let high = 0;
  let low = 0;
  values.forEach((value, index) => {
    if (value > values[high]!) high = index;
    if (value < values[low]!) low = index;
  });
  if (values[high] === values[low]) return null;
  const mark = (index: number): CurveMark => ({
    index,
    date: curveDay(curve, index),
    cents: values[index]!,
  });
  return { high: mark(high), low: mark(low) };
}

/**
 * Veränderung seit Monatsbeginn: Stand heute minus Stand am Ende des Vormonats. `null`, wenn der Verlauf erst in diesem Monat
 * beginnt (dann gibt es keinen Vergleich – lieber nichts als eine erfundene Zahl).
 */
export function monthStartChange(
  curve: BalanceCurve,
  today: Date,
): { cents: number; since: Date } | null {
  const monthStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1);
  const before = Math.round((monthStart - DAY - curve.from.getTime()) / DAY);
  const last = curve.values.length - 1;
  if (before < 0 || before >= last) return null;
  return { cents: curve.values[last]! - curve.values[before]!, since: new Date(monthStart) };
}

/** „1. Oktober“ (ohne Jahr) – für „seit 1. Oktober“. */
export function dayMonthLabel(date: Date): string {
  return `${date.getUTCDate()}. ${MONTH_NAMES[date.getUTCMonth()]}`;
}

/** „Mo., 5. Oktober“ (mit Jahr, wenn es nicht `currentYear` ist) – Infofeld am Zeiger und Tage der Liste „Zuletzt gebucht“. */
export function weekdayLabel(date: Date, currentYear?: number): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    ...(currentYear !== undefined && date.getUTCFullYear() !== currentYear
      ? { year: "numeric" }
      : {}),
  }).format(date);
}

/** „Heute“, „Gestern“ oder „Mo., 5. Oktober“ – die Tage der Liste „Zuletzt gebucht“. */
export function dayHeading(date: Date, today: Date): string {
  const diff = Math.round((today.getTime() - date.getTime()) / DAY);
  if (diff === 0) return "Heute";
  if (diff === 1) return "Gestern";
  return weekdayLabel(date, today.getUTCFullYear());
}

/** Eine Beschriftung der Achse: Monatsanfang an `position` (0 = links, 1 = rechts). */
export interface CurveTick {
  index: number;
  position: number;
  label: string;
  /**
   * Am Handy ausgeblendet, damit sich die Namen nicht drängen: jeder zweite, wenn es mehr als sechs sind, und der Name kurz
   * vor „Heute“ (ab `TICK_PHONE_END`).
   */
  minor: boolean;
}

/** Mindestabstand zweier Beschriftungen und zu „Heute“ am rechten Rand (Anteil der Breite); am Handy braucht „Heute“ mehr. */
const TICK_GAP = 0.07;
const TICK_END = 0.9;
const TICK_PHONE_END = 0.78;

/**
 * Beschriftung der Achse: der erste Tag und jeder Monatsanfang als Kurzname („Jul“, „Aug“), dazu „Heute“ am rechten Rand
 * (steht in der Komponente). Zu dicht aufeinander folgende Namen und solche direkt vor „Heute“ fallen weg.
 */
export function curveTicks(curve: BalanceCurve): CurveTick[] {
  const count = curve.values.length;
  if (count < 2) return [];
  const ticks: Omit<CurveTick, "minor">[] = [];
  for (let index = 0; index < count; index++) {
    const date = curveDay(curve, index);
    if (index !== 0 && date.getUTCDate() !== 1) continue;
    const position = index / (count - 1);
    const previous = ticks.at(-1);
    if (position > TICK_END || (previous && position - previous.position < TICK_GAP)) continue;
    ticks.push({ index, position, label: MONTH_NAMES[date.getUTCMonth()]!.slice(0, 3) });
  }
  return ticks.map((tick, index) => ({
    ...tick,
    minor: (ticks.length > 6 && index % 2 === 1) || tick.position > TICK_PHONE_END,
  }));
}

/** Eine Zeile der Tabelle zum Verlauf: Stand am Ende eines Monats (im laufenden Monat: heute). */
export interface CurveRow {
  key: string;
  label: string;
  cents: number;
  current: boolean;
}

/** Stand am Ende jedes Monats im Verlauf, der laufende Monat mit dem Stand von heute – die Tabelle statt des Diagramms. */
export function monthEndRows(curve: BalanceCurve): CurveRow[] {
  const rows: CurveRow[] = [];
  const last = curve.values.length - 1;
  for (let index = 0; index <= last; index++) {
    const date = curveDay(curve, index);
    const next = curveDay(curve, index + 1);
    if (index !== last && next.getUTCMonth() === date.getUTCMonth()) continue;
    rows.push({
      key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      label: `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`,
      cents: curve.values[index]!,
      current: index === last,
    });
  }
  return rows;
}

/** Der Verlauf in einem Satz (Name der Grafik für Screenreader). */
export function describeCurve(curve: BalanceCurve): string {
  const { values } = curve;
  if (values.length < 2) return "Noch kein Verlauf des Kontostands.";
  const first = `Kontostand vom ${formatCalendarDate(curve.from)} bis heute: von ${formatEuroFromCents(values[0]!)} auf ${formatEuroFromCents(values.at(-1)!)}.`;
  const extremes = curveExtremes(curve);
  if (!extremes) return `${first} Der Stand blieb in dieser Zeit gleich.`;
  return `${first} Höchster Stand ${formatEuroFromCents(extremes.high.cents)} am ${formatCalendarDate(extremes.high.date)}, niedrigster ${formatEuroFromCents(extremes.low.cents)} am ${formatCalendarDate(extremes.low.date)}.`;
}

/** „13.944,47 €“ → „13.944“ und „,47 €“ – die Cent stehen kleiner daneben, wie in Banking-Apps. */
export function splitEuro(cents: number): [string, string] {
  const text = formatEuroFromCents(cents);
  const comma = text.lastIndexOf(",");
  return comma < 0 ? [text, ""] : [text.slice(0, comma), text.slice(comma)];
}
