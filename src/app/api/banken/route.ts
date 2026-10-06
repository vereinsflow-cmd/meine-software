import type { NextRequest } from "next/server";
import { bankCodeFromIbanStart, normalizeBankQuery } from "@/lib/bank-search";
import {
  BANK_QUERY_MAX_LENGTH,
  BANK_QUERY_MIN_LENGTH,
  bankCodeFromIban,
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
 * Die Eingabe wird nie protokolliert – sie könnte eine IBAN sein. Antworten auf eine IBAN werden deshalb auch nicht
 * zwischengespeichert (die Adresse enthielte die Kontonummer).
 */
export const GET = apiHandler(async (request: NextRequest) => {
  const query = normalizeBankQuery(request.nextUrl.searchParams.get("q") ?? "");
  if (query.length > BANK_QUERY_MAX_LENGTH) {
    throw validationFailed({
      q: [`Bitte gib höchstens ${BANK_QUERY_MAX_LENGTH} Zeichen ein.`],
    });
  }
  const banks = query.length < BANK_QUERY_MIN_LENGTH ? [] : searchBanks(query);
  const iban = bankCodeFromIban(query) !== null || bankCodeFromIbanStart(query) !== null;
  return jsonOk<BankSuggestionsResponse>(
    { banks },
    { headers: iban ? { "Cache-Control": "private, no-store" } : CACHE },
  );
}, "bank-codes");
