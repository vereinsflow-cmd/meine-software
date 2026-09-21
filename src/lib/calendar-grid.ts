import {
  MONTH_NAMES,
  addBerlinDays,
  berlinParts,
  berlinWeekday,
  parseBerlinDateTime,
  startOfBerlinDay,
  toDateInputValue,
} from "@/lib/dates";

/**
 * Reine Kalender-Berechnungen für Monats-, Wochen-, Tages- und Listenansicht.
 * Alle Tage sind Tage in Europe/Berlin; Rechnen mit Tagen geht über `addBerlinDays` und ist damit auch an
 * Tagen der Zeitumstellung (23 bzw. 25 Stunden) korrekt. Woche = Montag bis Sonntag.
 */
export const CALENDAR_VIEWS = ["monat", "woche", "tag", "liste"] as const;
export type CalendarView = (typeof CALENDAR_VIEWS)[number];

export const VIEW_LABEL: Record<CalendarView, string> = {
  monat: "Monat",
  woche: "Woche",
  tag: "Tag",
  liste: "Liste",
};

export function parseView(value: string | undefined): CalendarView {
  return (CALENDAR_VIEWS as readonly string[]).includes(value ?? "")
    ? (value as CalendarView)
    : "monat";
}

/** Bezugstag aus dem Parameter `datum` (JJJJ-MM-TT). Ungültig, leer oder unsinnig weit entfernt → heute. */
export function parseAnchor(value: string | undefined, now: Date = new Date()): Date {
  const parsed = value ? parseBerlinDateTime(value, "00:00") : null;
  if (!parsed) return startOfBerlinDay(now);
  const { year } = berlinParts(parsed);
  return year >= 2000 && year <= 2100 ? parsed : startOfBerlinDay(now);
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Erster Tag (00:00 Berlin) des Monats, in dem `day` liegt. */
export function firstOfMonth(day: Date): Date {
  const { year, month } = berlinParts(day);
  return parseBerlinDateTime(`${year}-${pad(month)}-01`, "00:00") ?? startOfBerlinDay(day);
}

/** Montag (00:00 Berlin) der Woche, in der `day` liegt. */
export function mondayOf(day: Date): Date {
  return addBerlinDays(startOfBerlinDay(day), -berlinWeekday(day));
}

function daysBetween(from: Date, to: Date): Date[] {
  const days: Date[] = [];
  for (
    let day = from;
    day.getTime() < to.getTime() && days.length < 62;
    day = addBerlinDays(day, 1)
  )
    days.push(day);
  return days;
}

export interface CalendarRange {
  view: CalendarView;
  anchor: Date;
  /** Beginn (einschließlich) und Ende (ausschließlich) des sichtbaren Zeitraums. */
  from: Date;
  to: Date;
  /** Jeder sichtbare Tag als Tagesbeginn (00:00 Berlin). Monatsansicht: volle Wochen von Montag bis Sonntag. */
  days: Date[];
}

export function calendarRange(view: CalendarView, anchor: Date): CalendarRange {
  const day = startOfBerlinDay(anchor);
  if (view === "tag") {
    const to = addBerlinDays(day, 1);
    return { view, anchor: day, from: day, to, days: [day] };
  }
  if (view === "woche") {
    const from = mondayOf(day);
    const to = addBerlinDays(from, 7);
    return { view, anchor: day, from, to, days: daysBetween(from, to) };
  }
  const first = firstOfMonth(day);
  const nextFirst = firstOfMonth(addBerlinDays(first, 32));
  if (view === "liste")
    return { view, anchor: day, from: first, to: nextFirst, days: daysBetween(first, nextFirst) };
  const from = mondayOf(first);
  const to = addBerlinDays(mondayOf(addBerlinDays(nextFirst, -1)), 7);
  return { view, anchor: day, from, to, days: daysBetween(from, to) };
}

/** Bezugstag nach dem Blättern: Monat/Liste = erster des Vor-/Folgemonats, Woche = ±7 Tage, Tag = ±1 Tag. */
export function shiftAnchor(view: CalendarView, anchor: Date, direction: -1 | 1): Date {
  const day = startOfBerlinDay(anchor);
  if (view === "tag") return addBerlinDays(day, direction);
  if (view === "woche") return addBerlinDays(day, 7 * direction);
  const first = firstOfMonth(day);
  return firstOfMonth(addBerlinDays(first, direction === 1 ? 32 : -1));
}

/** ISO-8601-Kalenderwoche (Woche 1 enthält den ersten Donnerstag des Jahres). */
export function isoWeek(day: Date): { week: number; year: number } {
  const { year, month, day: dayOfMonth } = berlinParts(day);
  const date = new Date(Date.UTC(year, month - 1, dayOfMonth));
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7) + 3); // Donnerstag derselben Woche
  const isoYear = date.getUTCFullYear();
  const jan4 = new Date(Date.UTC(isoYear, 0, 4));
  const week =
    1 +
    Math.round(
      ((date.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7,
    );
  return { week, year: isoYear };
}

/** Überschrift der Ansicht, z. B. "September 2026", "KW 39 · 21.–27. September 2026". */
export function viewTitle(view: CalendarView, anchor: Date): string {
  const day = startOfBerlinDay(anchor);
  const { year, month, day: dayOfMonth } = berlinParts(day);
  if (view === "monat" || view === "liste") return `${MONTH_NAMES[month - 1]} ${year}`;
  if (view === "tag") {
    const weekday = [
      "Montag",
      "Dienstag",
      "Mittwoch",
      "Donnerstag",
      "Freitag",
      "Samstag",
      "Sonntag",
    ][berlinWeekday(day)];
    return `${weekday}, ${dayOfMonth}. ${MONTH_NAMES[month - 1]} ${year}`;
  }
  const monday = berlinParts(mondayOf(day));
  const sunday = berlinParts(addBerlinDays(mondayOf(day), 6));
  const kw = isoWeek(day).week;
  if (monday.month === sunday.month)
    return `KW ${kw} · ${monday.day}.–${sunday.day}. ${MONTH_NAMES[sunday.month - 1]} ${sunday.year}`;
  const left =
    monday.year === sunday.year
      ? `${monday.day}. ${MONTH_NAMES[monday.month - 1]}`
      : `${monday.day}. ${MONTH_NAMES[monday.month - 1]} ${monday.year}`;
  return `KW ${kw} · ${left} – ${sunday.day}. ${MONTH_NAMES[sunday.month - 1]} ${sunday.year}`;
}

export interface TimedEntry {
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
}

/**
 * Ordnet Einträge den Tagen zu (Schlüssel = "JJJJ-MM-TT"). Mehrtägige Einträge erscheinen an jedem Tag, den sie
 * berühren. Je Tag: ganztägige zuerst, dann nach Beginn und Titel.
 */
export function entriesByDay<T extends TimedEntry & { title: string }>(
  entries: readonly T[],
  days: readonly Date[],
): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const day of days) {
    const dayStart = day.getTime();
    const dayEnd = addBerlinDays(day, 1).getTime();
    const items = entries.filter((entry) => {
      const start = entry.startsAt.getTime();
      const end = Math.max(entry.endsAt.getTime(), start);
      return start < dayEnd && (end > dayStart || (end === start && start >= dayStart));
    });
    items.sort(
      (a, b) =>
        Number(b.allDay) - Number(a.allDay) ||
        a.startsAt.getTime() - b.startsAt.getTime() ||
        a.title.localeCompare(b.title, "de"),
    );
    result.set(toDateInputValue(day), items);
  }
  return result;
}
