import { formatDateShort, formatTime, toDateInputValue } from "@/lib/dates";
import type { PrintPlanEvent, PrintShiftDto } from "@/modules/shifts/service";

/**
 * Reine Rechnungen für den Helferplan-Ausdruck (`components/print-plan.tsx`) – ohne Oberfläche, einzeln getestet
 * (`tests/unit/print-plan.test.ts`).
 */

/** Was gedruckt wird: Aushang und Anwesenheitsliste (Standard) oder nur eins von beiden (URL-Parameter `inhalt`). */
export type PrintContent = "beides" | "aushang" | "anwesenheit";
export const PRINT_CONTENTS = ["beides", "aushang", "anwesenheit"] as const;

/** Höchstens so viele Zeilen im Kasten „Noch frei“ – sonst wird er länger als der Kopf des Aushangs. */
export const MAX_NEED_ROWS = 8;

type Places = Pick<PrintShiftDto, "requiredCount" | "filled" | "closed">;

/** Freie Plätze einer Schicht; mehr Eingetragene als nötig zählen nicht als „minus frei“. */
export const freePlaces = (shift: Pick<Places, "requiredCount" | "filled">) =>
  Math.max(0, shift.requiredCount - shift.filled);

/**
 * Plätze, in die man sich auf dem Aushang eintragen darf: die freien – außer bei geschlossenen Schichten, dort teilt nur
 * der Veranstalter ein (wie in der App, `checkEligibility`).
 */
export const signUpPlaces = (shift: Places) => (shift.closed ? 0 : freePlaces(shift));

/** Wie viele Helfer sich noch eintragen können („Wir brauchen noch N Helfer – trag dich ein!“). */
export const openPlaces = (shifts: readonly Places[]) =>
  shifts.reduce((sum, shift) => sum + signUpPlaces(shift), 0);

/**
 * Zeilen für den Kasten „Noch frei“: bis `max` Schichten alle (auch volle und geschlossene), sonst nur die, in die man sich
 * eintragen kann – höchstens `max`, der Rest als Anzahl („+ 2 weitere Schichten mit freien Plätzen“, „1 Schicht
 * geschlossen“, „3 Schichten ohne freie Plätze“).
 */
export function needRows<T extends Places>(
  shifts: readonly T[],
  max: number = MAX_NEED_ROWS,
): { shown: T[]; moreOpen: number; closedFree: number; withoutNeed: number } {
  const listed =
    shifts.length <= max ? [...shifts] : shifts.filter((shift) => signUpPlaces(shift) > 0);
  const shown = listed.slice(0, max);
  const hidden = shifts.filter((shift) => !listed.includes(shift));
  const closedFree = hidden.filter((shift) => shift.closed && freePlaces(shift) > 0).length;
  return {
    shown,
    moreOpen: listed.length - shown.length,
    closedFree,
    withoutNeed: hidden.length - closedFree,
  };
}

/** Belegte Plätze mit Namen, danach die freien (`null`). Mehr Eingetragene als nötig bleiben alle sichtbar. */
export const slotsOf = (shift: Pick<PrintShiftDto, "requiredCount" | "helperNames">) =>
  Array.from(
    { length: Math.max(shift.requiredCount, shift.helperNames.length) },
    (_, index) => shift.helperNames[index] ?? null,
  );

/** Endet die Veranstaltung an einem anderen Tag (Berliner Zeit), als sie beginnt? Dann stehen beide Tage im Kopf. */
export const eventSpansDays = (event: Pick<PrintPlanEvent, "startsAt" | "endsAt">) =>
  toDateInputValue(event.startsAt) !== toDateInputValue(event.endsAt);

/** Tag (Berliner Zeit) als fortlaufende Zahl, um Abstände in Tagen zu rechnen. */
const dayNumber = (value: Date) => Date.parse(`${toDateInputValue(value)}T00:00:00Z`) / 86_400_000;

/**
 * Wie der Tag an den Schichten steht: `"none"`, wenn alle am Tag der Veranstaltung beginnen; sonst `"weekday"` – im
 * Kasten „Noch frei“ reicht dann der Wochentag („Sa 10:00“) – oder `"date"`, sobald die Schichten eine Woche oder mehr
 * auseinanderliegen (zweimal „Mo“ wäre sonst nicht zu unterscheiden). Kacheln und Liste zeigen immer das Datum.
 */
export function shiftDays(
  event: Pick<PrintPlanEvent, "startsAt"> & { shifts: { startsAt: Date }[] },
): "none" | "weekday" | "date" {
  const days = [event.startsAt, ...event.shifts.map((shift) => shift.startsAt)].map(dayNumber);
  const span = Math.max(...days) - Math.min(...days);
  return span === 0 ? "none" : span < 7 ? "weekday" : "date";
}

/** Ende der Schicht für „bis … Uhr“: nur die Uhrzeit, über Mitternacht hinaus mit Tag („So., 04.10. 02:00“). */
export const shiftEndLabel = (shift: Pick<PrintShiftDto, "startsAt" | "endsAt">) =>
  toDateInputValue(shift.startsAt) === toDateInputValue(shift.endsAt)
    ? formatTime(shift.endsAt)
    : `${formatDateShort(shift.endsAt)} ${formatTime(shift.endsAt)}`;

/**
 * Was die Vorschau zeigt, in Worten: „2 Aushänge und 2 Anwesenheitslisten“. Bewusst keine Seitenzahl – ein langer Plan
 * (oder das Querformat) füllt beim Drucken mehr Seiten als Blätter in der Vorschau.
 */
export function previewLabel(events: number, content: PrintContent): string {
  const posters = `${events} ${events === 1 ? "Aushang" : "Aushänge"}`;
  const lists = `${events} ${events === 1 ? "Anwesenheitsliste" : "Anwesenheitslisten"}`;
  if (content === "aushang") return posters;
  if (content === "anwesenheit") return lists;
  return `${posters} und ${lists}`;
}
