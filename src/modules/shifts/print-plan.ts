import {
  formatDateLong,
  formatDateShort,
  formatTime,
  formatTimeRange,
  toDateInputValue,
} from "@/lib/dates";
import type { PrintPlanEvent, PrintShiftDto } from "@/modules/shifts/service";

/**
 * Reine Rechnungen und Sätze für den Helferplan-Ausdruck (`components/print-plan.tsx`) – ohne Oberfläche, einzeln
 * getestet (`tests/unit/print-plan.test.ts`). Die Sätze sind bewusst schlicht, wie von Hand getippt.
 */

/** Was gedruckt wird: Aushang und Anwesenheitsliste (Standard) oder nur eins von beiden (URL-Parameter `inhalt`). */
export type PrintContent = "beides" | "aushang" | "anwesenheit";
export const PRINT_CONTENTS = ["beides", "aushang", "anwesenheit"] as const;

type Places = Pick<PrintShiftDto, "requiredCount" | "filled" | "closed">;

const places = (count: number) => (count === 1 ? "1 Platz" : `${count} Plätze`);

/** Schließt einen Satz mit einem Punkt ab – außer er endet schon mit einem („Lindenstr.“, „e.V.“), sonst stünde „..“ da. */
export const endSentence = (text: string) => (/[.!?]$/.test(text) ? text : `${text}.`);

/** Freie Plätze einer Schicht; mehr Eingetragene als nötig zählen nicht als „minus frei“. */
export const freePlaces = (shift: Pick<Places, "requiredCount" | "filled">) =>
  Math.max(0, shift.requiredCount - shift.filled);

/**
 * Plätze, in die man sich auf dem Aushang eintragen darf: die freien – außer bei geschlossenen Schichten, dort teilt nur
 * der Veranstalter ein (wie in der App, `checkEligibility`).
 */
export const signUpPlaces = (shift: Places) => (shift.closed ? 0 : freePlaces(shift));

/** Wie viele Plätze man sich auf dem Aushang noch nehmen kann („Es sind noch 12 Plätze frei.“). */
export const openPlaces = (shifts: readonly Places[]) =>
  shifts.reduce((sum, shift) => sum + signUpPlaces(shift), 0);

/** Belegte Plätze mit Namen, danach die freien (`null`). Mehr Eingetragene als nötig bleiben alle sichtbar. */
export const slotsOf = (shift: Pick<PrintShiftDto, "requiredCount" | "helperNames">) =>
  Array.from(
    { length: Math.max(shift.requiredCount, shift.helperNames.length) },
    (_, index) => shift.helperNames[index] ?? null,
  );

/** Endet die Veranstaltung an einem anderen Tag (Berliner Zeit), als sie beginnt? */
export const eventSpansDays = (event: Pick<PrintPlanEvent, "startsAt" | "endsAt">) =>
  toDateInputValue(event.startsAt) !== toDateInputValue(event.endsAt);

/** Beginnt eine Schicht an einem anderen Tag (Berliner Zeit) als die Veranstaltung? Dann steht bei jeder ihr Tag dabei. */
export const shiftsSpanDays = (
  event: Pick<PrintPlanEvent, "startsAt"> & { shifts: { startsAt: Date }[] },
) => {
  const day = toDateInputValue(event.startsAt);
  return event.shifts.some((shift) => toDateInputValue(shift.startsAt) !== day);
};

/** Ende der Schicht: nur die Uhrzeit, über Mitternacht hinaus mit Tag („So., 04.10. 02:00“). */
export const shiftEndLabel = (shift: Pick<PrintShiftDto, "startsAt" | "endsAt">) =>
  toDateInputValue(shift.startsAt) === toDateInputValue(shift.endsAt)
    ? formatTime(shift.endsAt)
    : `${formatDateShort(shift.endsAt)} ${formatTime(shift.endsAt)}`;

/** „12:00 – 15:00 Uhr“, über Mitternacht „20:00 – So., 11.10. 02:30 Uhr“. */
export const shiftTimeText = (shift: Pick<PrintShiftDto, "startsAt" | "endsAt">) =>
  `${formatTime(shift.startsAt)} – ${shiftEndLabel(shift)} Uhr`;

/**
 * Datum und Uhrzeit der Veranstaltung in einer Zeile: „Samstag, 3. Oktober 2026, 14:00 – 22:00 Uhr“; mehrtägig mit
 * beiden Tagen, ganztägig ohne Uhrzeit.
 */
export function eventWhenText(
  event: Pick<PrintPlanEvent, "startsAt" | "endsAt" | "allDay">,
): string {
  const start = formatDateLong(event.startsAt);
  const end = formatDateLong(event.endsAt);
  if (!eventSpansDays(event))
    return `${start}, ${event.allDay ? "ganztägig" : formatTimeRange(event.startsAt, event.endsAt)}`;
  if (event.allDay) return `${start} bis ${end}`;
  return `${start}, ${formatTime(event.startsAt)} Uhr bis ${end}, ${formatTime(event.endsAt)} Uhr`;
}

/**
 * Stand einer Schicht für den Aushang, als Satz: „4 Plätze, noch 2 frei. Ab 16 Jahren.“ – ist noch niemand eingetragen,
 * kommt davor fett „Hier hat sich noch niemand eingetragen.“ (`emphasis`). Geschlossene Schichten sagen, dass der
 * Veranstalter einteilt.
 */
export function shiftStatusText(shift: Places & Pick<PrintShiftDto, "minAge">): {
  emphasis: string | null;
  text: string;
} {
  const age = shift.minAge !== null ? ` Ab ${shift.minAge} Jahren.` : "";
  if (shift.requiredCount === 0)
    return { emphasis: null, text: `Für diese Schicht sind keine Helfer nötig.${age}` };
  const free = freePlaces(shift);
  if (free === 0)
    return {
      emphasis: null,
      text: `${places(shift.requiredCount)}, ${shift.requiredCount === 1 ? "besetzt" : "alle besetzt"}.${age}`,
    };
  if (shift.closed)
    return {
      emphasis: null,
      text: `${places(shift.requiredCount)}, noch ${free} frei. Die Plätze vergibt der Veranstalter, bitte nicht selbst eintragen.${age}`,
    };
  if (shift.filled === 0)
    return {
      emphasis: "Hier hat sich noch niemand eingetragen.",
      text: `${places(free)} frei.${age}`,
    };
  return { emphasis: null, text: `${places(shift.requiredCount)}, noch ${free} frei.${age}` };
}

/** Der Hinweis oben auf dem Aushang: wie man sich einträgt und wie viele Plätze noch frei sind. */
export function signUpHint(shifts: readonly Places[]): string {
  const open = openPlaces(shifts);
  if (open > 0)
    return `Wer helfen kann, trägt sich bitte mit Vor- und Nachnamen in eine freie Zeile ein, eine Zeile pro Person. ${
      open === 1 ? "Es ist noch 1 Platz frei." : `Es sind noch ${open} Plätze frei.`
    }`;
  if (shifts.some((shift) => freePlaces(shift) > 0))
    return "Die freien Plätze vergibt der Veranstalter, bitte nicht selbst eintragen.";
  return "Alle Plätze sind besetzt. Vielen Dank an alle, die helfen.";
}

/**
 * „Fragen an Bernd Vorstand (Tel. 0170 1234567, bernd@example.org).“ – nur der Ansprechpartner der Veranstaltung, nie
 * Kontaktdaten der Helfer. `null`, wenn nichts hinterlegt ist.
 */
export function contactSentence(
  event: Pick<PrintPlanEvent, "contactName" | "contactPhone" | "contactEmail">,
): string | null {
  const ways = [event.contactPhone && `Tel. ${event.contactPhone}`, event.contactEmail]
    .filter(Boolean)
    .join(", ");
  if (event.contactName)
    return endSentence(`Fragen an ${event.contactName}${ways ? ` (${ways})` : ""}`);
  return ways ? endSentence(`Fragen: ${ways}`) : null;
}

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
