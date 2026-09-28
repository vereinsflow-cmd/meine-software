import { newEventFormDefaults, type EventFormInput } from "@/modules/events/schemas";

/**
 * „Neuer Termin“ direkt im Kalender (Doppelklick auf einen Tag oder Knopf im Seitenkopf) – reine Hilfsfunktionen für
 * das Fenster in `components/quick-event.tsx`, einzeln getestet. Gespeichert wird wie im großen Formular als Entwurf.
 */
const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Tagesschlüssel wie im Attribut `data-date` der Kalenderzellen (JJJJ-MM-TT). */
export const isDateKey = (value: string | undefined): value is string =>
  value !== undefined && DATE_KEY.test(value);

export interface QuickEventOptions {
  departments: { id: string; name: string; selectable?: boolean }[];
  departmentRequired: boolean;
  /** Darf gleich veröffentlichen (Recht `events:publish`) – dann gibt es das Häkchen „Gleich veröffentlichen“. */
  canPublish?: boolean;
}

/** Startwerte am gewählten Tag. Wer genau eine Abteilung leitet und wählen muss, bekommt sie vorausgewählt. */
export function quickEventDefaults(date: string, options: QuickEventOptions): EventFormInput {
  const own = options.departments.filter((d) => d.selectable !== false);
  return {
    ...newEventFormDefaults(date),
    departmentId: options.departmentRequired && own.length === 1 ? own[0]!.id : "",
  };
}

/**
 * Enddatum, nachdem sich das Beginn-Datum geändert hat: Ein eintägiger Termin bleibt eintägig (das Ende wandert mit),
 * ein mehrtägiger behält sein Ende, solange es nicht vor dem neuen Beginn liegt. Unvollständige Eingaben (während
 * des Tippens) ändern nichts.
 */
export function followStartDate(previousStart: string, nextStart: string, end: string): string {
  if (!isDateKey(nextStart)) return end;
  if (end === previousStart || !isDateKey(end) || end < nextStart) return nextStart;
  return end;
}
