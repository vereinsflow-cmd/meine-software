/**
 * Vorschläge für das Feld „Bank“ (Konten der Finanzen): gemeinsamer Vertrag zwischen `GET /api/banken` und dem Eingabefeld.
 * Nur Typen und reine Hilfsfunktionen – darf auch im Browser-Code importiert werden.
 *
 * Daten: Bankleitzahlendatei der Deutschen Bundesbank (Quelle: Deutsche Bundesbank), aufbereitet mit
 * `scripts/build-bank-codes.mjs`.
 */

/** Höchstlänge der Suche – gleich der Höchstlänge des Feldes (`bankName` max. 60 Zeichen). */
export const BANK_QUERY_MAX_LENGTH = 60;
/** Erst ab so vielen Zeichen wird gesucht. */
export const BANK_QUERY_MIN_LENGTH = 2;
/** Höchstens so viele Vorschläge – die Liste kommt meist ohne Scrollen aus (fehlt am Handy der Platz, scrollt sie in sich). */
export const BANK_SUGGESTION_LIMIT = 8;

/** Ein Vorschlag, wie ihn `GET /api/banken?q=…` liefert (`ApiResponse<BankSuggestionsResponse>`). */
export interface BankSuggestion {
  /** Stabil und eindeutig (z. B. die erste Bankleitzahl der Gruppe) – Schlüssel in Listen und Element-ID. */
  id: string;
  /** Bezeichnung laut Bundesbank, unverändert, z. B. „Sparkasse Vest Recklinghausen“. */
  name: string;
  /** Ort laut Bundesbank, z. B. „Recklinghausen“; leer, wenn eine Bank unter diesem Namen an vielen Orten sitzt. */
  place: string;
  /** Zweite Zeile, z. B. „Recklinghausen · BLZ 426 501 50“. */
  detail: string;
  /** Was ins Feld geschrieben wird (höchstens `BANK_QUERY_MAX_LENGTH` Zeichen). */
  value: string;
}

export interface BankSuggestionsResponse {
  banks: BankSuggestion[];
}

/**
 * Eine deutsche IBAN (auch mit Leerzeichen) – sie gehört nicht in eine Such-URL oder ein Server-Protokoll. Statt ihrer wird
 * nur die enthaltene Bankleitzahl gesucht.
 */
export function bankCodeFromIban(text: string): string | null {
  const compact = text.replace(/\s+/g, "").toUpperCase();
  const match = /^DE\d{20}$/.exec(compact);
  return match ? compact.slice(4, 12) : null;
}
