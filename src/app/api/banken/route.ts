import type { NextRequest } from "next/server";
import { normalizeBankQuery } from "@/lib/bank-search";
import {
  BANK_QUERY_MAX_LENGTH,
  BANK_QUERY_MIN_LENGTH,
  bankSearchQuery,
  type BankSuggestionsResponse,
} from "@/lib/bank-suggestions";
import { apiHandler, jsonOk } from "@/server/api";
import { searchBanks } from "@/server/banks/bank-codes";
import { validationFailed } from "@/server/errors";

const CACHE = { "Cache-Control": "public, max-age=86400, stale-while-revalidate=604800" };

/**
 * Vorschläge für das Feld „Bank“: `GET /api/banken?q=sparkasse vest` → `{ banks: [...] }` (höchstens 8, beste zuerst;
 * unter 2 Zeichen leer). Gesucht wird nach Name, Ort, Bankleitzahl, BIC oder der Bankleitzahl in einer IBAN.
 *
 * Öffentliche Verzeichnisdaten der Bundesbank ohne Bezug zu Personen oder Vereinen – deshalb ohne Anmeldung und gut
 * zwischenspeicherbar. Bewusst ohne Begrenzung je IP-Adresse (wie `/api/postleitzahlen`): Die Suche läuft im Speicher
 * und kostet weniger als eine Datenbank-Abfrage; eine Begrenzung über die Datenbank bei jedem Tastendruck wäre teurer als
 * die Suche selbst, und ohne `TRUST_PROXY` landen alle Vereine in einem gemeinsamen Topf.
 *
 * Die Eingabe wird nie protokolliert – sie könnte eine IBAN sein. Gesucht wird wie im Feld (`bankSearchQuery`): von einer
 * IBAN nur die Bankleitzahl, eine Kontonummer gar nicht. Antworten darauf werden auch nicht zwischengespeichert (die
 * Adresse enthielte die Kontonummer).
 */
export const GET = apiHandler(async (request: NextRequest) => {
  const query = normalizeBankQuery(request.nextUrl.searchParams.get("q") ?? "");
  if (query.length > BANK_QUERY_MAX_LENGTH) {
    throw validationFailed({
      q: [`Bitte gib höchstens ${BANK_QUERY_MAX_LENGTH} Zeichen ein.`],
    });
  }
  const search = bankSearchQuery(query);
  const banks = search === null || query.length < BANK_QUERY_MIN_LENGTH ? [] : searchBanks(search);
  return jsonOk<BankSuggestionsResponse>(
    { banks },
    { headers: search !== query ? { "Cache-Control": "private, no-store" } : CACHE },
  );
}, "bank-codes");
