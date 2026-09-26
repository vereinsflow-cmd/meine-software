import { formatDateWithWeekday, formatTime, toDateInputValue } from "./dates";

/**
 * Veranstaltungen in Auswahllisten (Aufgabe, Checkliste, Nachricht, Dokument) – reine Funktion, damit alle Listen
 * gleich beschriftet sind.
 *
 * Der Titel allein reicht nicht: Ein wöchentliches Training stünde sonst mehrmals gleich da („Fußball-Training
 * Herren“), und man verknüpft oder benachrichtigt leicht den falschen Termin. Deshalb immer mit Datum in Berliner Zeit.
 */
export interface EventChoice {
  id: string;
  title: string;
  startsAt: Date;
}

export interface EventOption {
  value: string;
  label: string;
}

/** Gleicher Titel am selben Kalendertag (Berlin)? Groß-/Kleinschreibung und Leerzeichen am Rand zählen nicht. */
const sameDayKey = (event: EventChoice) =>
  `${toDateInputValue(event.startsAt)} ${event.title.trim().toLocaleLowerCase("de-DE")}`;

/**
 * „Fußball-Training Herren · Di., 29.09.2026“. Gibt es denselben Titel mehrmals am selben Tag, kommt die Uhrzeit dazu
 * („Jugendturnier · Sa., 03.10.2026, 10:00 Uhr“). Die Reihenfolge bleibt, wie der Dienst sie liefert.
 */
export function eventOptions(events: readonly EventChoice[]): EventOption[] {
  const keyed = events.map((event) => ({ event, key: sameDayKey(event) }));
  const perDay = new Map<string, number>();
  for (const { key } of keyed) perDay.set(key, (perDay.get(key) ?? 0) + 1);

  return keyed.map(({ event, key }) => {
    const day = formatDateWithWeekday(event.startsAt);
    const when = (perDay.get(key) ?? 0) > 1 ? `${day}, ${formatTime(event.startsAt)} Uhr` : day;
    return { value: event.id, label: `${event.title} · ${when}` };
  });
}
