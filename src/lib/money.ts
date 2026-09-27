export { formatEuroFromCents } from "./dates";

/**
 * Geldbeträge: immer ganze Cent (nie Fließkommazahlen, siehe docs/ROADMAP.md „Finanzen“). Reine Funktionen, im Browser
 * und auf dem Server nutzbar, einzeln getestet.
 */

/** Höchster Betrag einer Rechnung: 10 Millionen Euro (passt sicher in eine Ganzzahl-Spalte). */
export const MAX_AMOUNT_CENTS = 1_000_000_000;

/**
 * Liest einen Betrag, wie man ihn in Deutschland eintippt, und liefert ganze Cent – oder `null`, wenn es kein gültiger
 * Betrag ist. Erlaubt: „12“, „12,5“, „12,50“, „1.234,56“, „1 234,56 €“ und – weil es viele so tippen – „12.50“ (ein
 * Punkt mit ein oder zwei Nachkommastellen gilt als Komma). „1.234“ sind 1.234 Euro (Tausenderpunkt). Nicht erlaubt:
 * negative Beträge, mehr als zwei Nachkommastellen, gemischte Schreibweisen wie „1,234.56“.
 * Gerechnet wird mit den Ziffern selbst, nicht mit Kommazahlen – so entstehen keine Rundungsfehler.
 */
export function parseEuroToCents(input: string): number | null {
  const text = input
    .replace(/[\s  ]/g, "")
    .replace(/^€/, "")
    .replace(/€$/, "");
  const german = /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/.exec(text);
  const dotted = german ? null : /^(\d+)\.(\d{1,2})$/.exec(text);
  const match = german ?? dotted;
  if (!match) return null;
  const euros = Number(match[1]!.replace(/\./g, ""));
  const cents = match[2] ? Number(match[2].padEnd(2, "0")) : 0;
  const total = euros * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}

/** Cent als Eingabetext für ein Formularfeld, z. B. 123456 → „1234,56“ (ohne Tausenderpunkt, gut zu bearbeiten). */
export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return `${Math.floor(cents / 100)},${String(cents % 100).padStart(2, "0")}`;
}
