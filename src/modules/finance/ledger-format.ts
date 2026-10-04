import type { FinanceAccountKind, Sphere } from "@/generated/prisma/enums";
import { formatEuroFromCents } from "@/lib/dates";

/**
 * Anzeige rund ums Kassenbuch – reine Funktionen (Browser und Server), einzeln getestet (`tests/unit/finance-format.test.ts`).
 */

/** Buchungsnummer, wie sie auf Belegen und im Kassenbuch steht: „2026-0042“. */
export function entryNumber(year: number, number: number): string {
  return `${year}-${String(number).padStart(4, "0")}`;
}

/** Steuerlicher Bereich in Alltagssprache (klein in Klammern hinter der Kategorie). */
export const SPHERE_LABEL: Record<Sphere, string> = {
  NEUTRAL: "neutral",
  NON_PROFIT: "ideeller Bereich",
  ASSET_MANAGEMENT: "Vermögensverwaltung",
  PURPOSE_OPERATION: "Zweckbetrieb",
  COMMERCIAL: "wirtschaftlicher Geschäftsbetrieb",
};

/** Ein Satz je Bereich für die Einstellungen – ohne Fachsprache, mit dem Hinweis auf den Steuerberater. */
export const SPHERE_EXPLANATION: Record<Exclude<Sphere, "NEUTRAL">, string> = {
  NON_PROFIT: "Das, wofür der Verein da ist: Beiträge, Spenden, Zuschüsse, Training, Hallenmiete.",
  ASSET_MANAGEMENT: "Geld und Besitz verwalten: Zinsen, Vermietung des Vereinsheims.",
  PURPOSE_OPERATION:
    "Einnahmen aus dem Vereinszweck selbst, z. B. Startgelder, Kursgebühren, Eintritt zu Sportveranstaltungen.",
  COMMERCIAL:
    "Wie ein Geschäft: Getränke- und Speiseverkauf, Werbung, Sponsoring. Hier können ab 50.000 € Einnahmen im Jahr Steuern anfallen.",
};

export const ACCOUNT_KIND_LABEL: Record<FinanceAccountKind, string> = {
  BANK: "Bankkonto",
  CASH: "Barkasse",
  OTHER: "Sonstiges Konto",
};

/** „+36,00 €“ bzw. „−36,00 €“ (echtes Minuszeichen). Null ohne Vorzeichen. */
export function formatSignedEuro(cents: number): string {
  if (cents === 0) return formatEuroFromCents(0);
  return `${cents > 0 ? "+" : "−"}${formatEuroFromCents(Math.abs(cents))}`;
}

/** Monat als Text: „2026-09“ → „September 2026“. */
export function monthLabel(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year!, m! - 1, 1)));
}
