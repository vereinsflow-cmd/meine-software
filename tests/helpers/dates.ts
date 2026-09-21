import { addBerlinDays, berlinParts, parseCalendarDate, toDateInputValue } from "@/lib/dates";

/**
 * Kalendertage für Tests – IMMER in Europe/Berlin gerechnet, wie es das Produkt tut. Wer stattdessen `toISOString()` oder
 * `getUTC…()` auf `Date.now()` verwendet, bekommt zwischen 0 und 2 Uhr Berliner Zeit (Sommer) bzw. 0 und 1 Uhr (Winter)
 * noch das Datum des Vortags – und damit Tests, die nur nachts fehlschlagen.
 */

/** Berliner Kalendertag `offset` Tage ab heute als "JJJJ-MM-TT". */
export const berlinDay = (offset = 0): string =>
  toDateInputValue(addBerlinDays(new Date(), offset));

/** Wie ein `@db.Date`-Wert: UTC-Mitternacht des Berliner Kalendertags `offset` Tage ab heute. */
export const calendarDay = (offset = 0): Date => parseCalendarDate(berlinDay(offset))!;

/** Aktuelles Jahr in Berlin. */
export const berlinYear = (): number => berlinParts(new Date()).year;
