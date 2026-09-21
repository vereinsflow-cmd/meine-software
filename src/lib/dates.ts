import { TZDate } from "@date-fns/tz";

/**
 * Datums- und Zeitfunktionen.
 *
 * Grundsätze:
 *  - Zeitpunkte (Beginn einer Veranstaltung …) werden als UTC gespeichert und immer in der
 *    Zeitzone Europe/Berlin angezeigt und eingegeben (Sommer-/Winterzeit wird berücksichtigt).
 *  - Reine Kalendertage (Geburtsdatum, Eintritt …) sind `@db.Date`-Werte und liegen als UTC-Mitternacht
 *    vor. Sie werden NIE in eine Zeitzone umgerechnet, sonst würden sie um einen Tag verrutschen.
 *  - Anzeigeformat: TT.MM.JJJJ, Uhrzeit 24-Stunden-Format (HH:mm).
 */
export const APP_TIME_ZONE = "Europe/Berlin";
export const APP_LOCALE = "de-DE";

type DateInput = Date | string | number;

const toDate = (value: DateInput): Date => (value instanceof Date ? value : new Date(value));
const isValid = (date: Date) => !Number.isNaN(date.getTime());

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(APP_LOCALE, options);
    formatters.set(key, cached);
  }
  return cached;
}

const EMPTY = "–";

// ---------------------------------------------------------------------------
// Zeitpunkte (Europe/Berlin)
// ---------------------------------------------------------------------------

export function formatDate(value: DateInput | null | undefined): string {
  if (value == null) return EMPTY;
  const date = toDate(value);
  if (!isValid(date)) return EMPTY;
  return formatter("date", {
    timeZone: APP_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatTime(value: DateInput | null | undefined): string {
  if (value == null) return EMPTY;
  const date = toDate(value);
  if (!isValid(date)) return EMPTY;
  return formatter("time", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatDateTime(value: DateInput | null | undefined): string {
  if (value == null) return EMPTY;
  const date = toDate(value);
  if (!isValid(date)) return EMPTY;
  return `${formatDate(date)} ${formatTime(date)}`;
}

/** z. B. "Samstag, 20. September 2026" */
export function formatDateLong(value: DateInput | null | undefined): string {
  if (value == null) return EMPTY;
  const date = toDate(value);
  if (!isValid(date)) return EMPTY;
  return formatter("long", {
    timeZone: APP_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** z. B. "Sa., 20.09." */
export function formatDateShort(value: DateInput | null | undefined): string {
  if (value == null) return EMPTY;
  const date = toDate(value);
  if (!isValid(date)) return EMPTY;
  return formatter("short", {
    timeZone: APP_TIME_ZONE,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

/** "18:00 – 20:30 Uhr" bzw. mit Datum, wenn der Zeitraum über Mitternacht hinausgeht. */
export function formatTimeRange(start: DateInput, end: DateInput): string {
  const s = toDate(start);
  const e = toDate(end);
  if (toDateInputValue(s) === toDateInputValue(e)) {
    return `${formatTime(s)} – ${formatTime(e)} Uhr`;
  }
  return `${formatDateTime(s)} – ${formatDateTime(e)} Uhr`;
}

/** Zerlegt einen Zeitpunkt in seine Bestandteile in Europe/Berlin. */
export function berlinParts(value: DateInput): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = formatter("parts", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(toDate(value));
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
  };
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** "2026-09-20" – Wert für `<input type="date">` (Tag in Europe/Berlin). */
export function toDateInputValue(value: DateInput): string {
  const { year, month, day } = berlinParts(value);
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

/** "18:30" – Wert für `<input type="time">` (Uhrzeit in Europe/Berlin). */
export function toTimeInputValue(value: DateInput): string {
  const { hour, minute } = berlinParts(value);
  return `${pad(hour)}:${pad(minute)}`;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Wandelt Datum ("2026-09-20") und Uhrzeit ("18:30") als Ortszeit in Europe/Berlin in einen
 * UTC-Zeitpunkt um. Gibt `null` bei ungültigen Werten zurück (auch bei Daten wie 31.02.).
 */
export function parseBerlinDateTime(date: string, time: string): Date | null {
  const d = DATE_RE.exec(date);
  const t = TIME_RE.exec(time);
  if (!d || !t) return null;
  const [year, month, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const [hour, minute] = [Number(t[1]), Number(t[2])];

  const local = new TZDate(year, month - 1, day, hour, minute, 0, APP_TIME_ZONE);
  // Ungültige Kalendertage (z. B. 31.02.) rollen im Date-Objekt über – das erkennen wir am Rückvergleich.
  if (local.getFullYear() !== year || local.getMonth() !== month - 1 || local.getDate() !== day)
    return null;
  return new Date(local.getTime());
}

/** Beginn (00:00 Uhr Berlin) des Tages, in dem `value` liegt, als UTC-Zeitpunkt. */
export function startOfBerlinDay(value: DateInput): Date {
  const { year, month, day } = berlinParts(value);
  return new Date(new TZDate(year, month - 1, day, 0, 0, 0, APP_TIME_ZONE).getTime());
}

/**
 * Beginn (00:00 Uhr Berlin) eines Kalendertags als UTC-Zeitpunkt. `month` zählt ab 1; Überläufe rollen wie bei `Date`
 * (Monat 13 = Januar des Folgejahres, Tag 0 = letzter Tag des Vormonats).
 */
export function startOfBerlinDate(year: number, month: number, day: number): Date {
  return new Date(new TZDate(year, month - 1, day, 0, 0, 0, APP_TIME_ZONE).getTime());
}

/** Beginn des Folgetags (00:00 Uhr Berlin). Berücksichtigt 23- und 25-Stunden-Tage bei Zeitumstellung. */
export function startOfNextBerlinDay(value: DateInput): Date {
  const { year, month, day } = berlinParts(value);
  return new Date(new TZDate(year, month - 1, day + 1, 0, 0, 0, APP_TIME_ZONE).getTime());
}

export function addBerlinDays(value: DateInput, days: number): Date {
  const { year, month, day, hour, minute } = berlinParts(value);
  return new Date(
    new TZDate(year, month - 1, day + days, hour, minute, 0, APP_TIME_ZONE).getTime(),
  );
}

/** Ergibt Wochentag (0 = Montag … 6 = Sonntag) in Europe/Berlin. */
export function berlinWeekday(value: DateInput): number {
  const { year, month, day } = berlinParts(value);
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = Sonntag
  return (utcDay + 6) % 7;
}

export const WEEKDAY_SHORT = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
export const WEEKDAY_LONG = [
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
  "Sonntag",
] as const;
export const MONTH_NAMES = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
] as const;

// ---------------------------------------------------------------------------
// Reine Kalendertage (@db.Date) – ohne Zeitzonen-Umrechnung
// ---------------------------------------------------------------------------

/** Formatiert einen `@db.Date`-Wert (UTC-Mitternacht) als TT.MM.JJJJ. */
export function formatCalendarDate(value: DateInput | null | undefined): string {
  if (value == null) return EMPTY;
  const date = toDate(value);
  if (!isValid(date)) return EMPTY;
  return `${pad(date.getUTCDate())}.${pad(date.getUTCMonth() + 1)}.${pad(date.getUTCFullYear(), 4)}`;
}

/** "2026-09-20" für `<input type="date">` aus einem `@db.Date`-Wert. */
export function calendarDateToInputValue(value: DateInput | null | undefined): string {
  if (value == null) return "";
  const date = toDate(value);
  if (!isValid(date)) return "";
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Wandelt "2026-09-20" in einen `@db.Date`-Wert (UTC-Mitternacht). `null` bei ungültigen Daten. */
export function parseCalendarDate(value: string): Date | null {
  const match = DATE_RE.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    return null;
  return date;
}

/** Heutiges Datum in Europe/Berlin als `@db.Date`-Wert. */
export function todayCalendarDate(now: Date = new Date()): Date {
  const { year, month, day } = berlinParts(now);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Alter in vollen Jahren an einem Stichtag (Kalendertage). */
export function ageOn(birthDate: Date, on: Date = todayCalendarDate()): number {
  let age = on.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    on.getUTCMonth() < birthDate.getUTCMonth() ||
    (on.getUTCMonth() === birthDate.getUTCMonth() && on.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

// ---------------------------------------------------------------------------
// Währung und Zahlen
// ---------------------------------------------------------------------------

const euro = new Intl.NumberFormat(APP_LOCALE, { style: "currency", currency: "EUR" });

/** Formatiert einen Betrag in Cent als Euro, z. B. 123456 → "1.234,56 €". */
export function formatEuroFromCents(cents: number): string {
  return euro.format(cents / 100);
}

/** Dauer in Minuten als "2 Std. 30 Min." */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m} Min.`;
  if (m === 0) return `${h} Std.`;
  return `${h} Std. ${m} Min.`;
}
