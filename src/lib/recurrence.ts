import { TZDate } from "@date-fns/tz";
import { APP_TIME_ZONE, addBerlinDays, berlinParts, startOfBerlinDay } from "./dates";

/**
 * Wiederkehrende Termine. Jeder Termin einer Serie wird als eigene Veranstaltung angelegt (mit gemeinsamer
 * Serien-ID) – so hat jeder Termin eigene Teilnehmer und Schichten und lässt sich einzeln ändern oder absagen.
 *
 * Die Ortszeit bleibt erhalten: Ein Training um 18:30 Uhr findet auch nach der Zeitumstellung um 18:30 Uhr statt.
 */
export type Frequency = "weekly" | "biweekly" | "monthly";

export const MAX_SERIES_OCCURRENCES = 52;

export interface Occurrence {
  startsAt: Date;
  endsAt: Date;
}

/** Addiert Monate in Ortszeit; existiert der Tag im Zielmonat nicht (z. B. 31.), gilt der letzte Tag des Monats. */
function addBerlinMonths(value: Date, months: number, anchorDay: number): Date {
  const { year, month, hour, minute } = berlinParts(value);
  const targetMonthIndex = month - 1 + months;
  const lastDay = new Date(Date.UTC(year, targetMonthIndex + 1, 0)).getUTCDate();
  return new Date(
    new TZDate(
      year,
      targetMonthIndex,
      Math.min(anchorDay, lastDay),
      hour,
      minute,
      0,
      APP_TIME_ZONE,
    ).getTime(),
  );
}

/**
 * Berechnet alle Termine einer Serie (der erste Termin ist der Ausgangstermin selbst).
 * Abbruch nach `count` Terminen oder nach dem Datum `until` (einschließlich), höchstens 52 Termine.
 */
export function expandSeries(input: {
  startsAt: Date;
  endsAt: Date;
  frequency: Frequency;
  count?: number;
  until?: Date;
}): Occurrence[] {
  const durationMs = input.endsAt.getTime() - input.startsAt.getTime();
  const limit = Math.min(input.count ?? MAX_SERIES_OCCURRENCES, MAX_SERIES_OCCURRENCES);
  const untilEnd = input.until
    ? startOfBerlinDay(addBerlinDays(input.until, 1)).getTime()
    : Number.POSITIVE_INFINITY;
  const anchorDay = berlinParts(input.startsAt).day;

  const result: Occurrence[] = [];
  for (let index = 0; index < limit; index++) {
    const startsAt =
      input.frequency === "monthly"
        ? addBerlinMonths(input.startsAt, index, anchorDay)
        : addBerlinDays(input.startsAt, index * (input.frequency === "weekly" ? 7 : 14));
    if (startsAt.getTime() >= untilEnd) break;
    // Die Dauer bleibt in absoluter Zeit gleich; nur der Beginn folgt der Ortszeit.
    result.push({ startsAt, endsAt: new Date(startsAt.getTime() + durationMs) });
  }
  return result;
}

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: "Jede Woche",
  biweekly: "Alle zwei Wochen",
  monthly: "Jeden Monat (am selben Tag)",
};
