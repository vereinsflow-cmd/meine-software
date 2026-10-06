"use client";

import type { FieldValues } from "react-hook-form";
import type { BaseProps } from "@/components/shared/form-fields";
import { SuggestField, type Suggestion } from "@/components/shared/suggest-field";
import type { ApiResponse } from "@/lib/action-result";
import {
  BANK_QUERY_MAX_LENGTH,
  BANK_QUERY_MIN_LENGTH,
  bankSearchQuery,
  type BankSuggestionsResponse,
} from "@/lib/bank-suggestions";

/** Leerzeichen ab „BLZ“ fest – die Bankleitzahl bricht am schmalen Handy nicht mitten durch („694 400“ / „07“). */
const keepBankCodeTogether = (detail: string) =>
  detail.replace(/BLZ( \d+)+$/, (code) => code.replaceAll(" ", "\u00a0"));

/**
 * Vorschläge von `GET /api/banken`; `null` bei Fehlern (z. B. offline, zu viele Anfragen) – dann einfach keine Liste. Eine
 * IBAN oder Kontonummer geht nicht in die Such-URL, nur ihre Bankleitzahl (`bankSearchQuery`).
 */
async function loadBanks(query: string, signal: AbortSignal): Promise<Suggestion[] | null> {
  const search = bankSearchQuery(query);
  if (search === null) return null;
  const response = await fetch(`/api/banken?q=${encodeURIComponent(search)}`, { signal });
  if (!response.ok) return null;
  const body = (await response.json()) as ApiResponse<BankSuggestionsResponse>;
  if (!body.ok) return null;
  return body.data.banks.map((bank) => ({
    id: bank.id,
    label: bank.name,
    detail: keepBankCodeTogether(bank.detail),
    value: bank.value,
  }));
}

/**
 * Feld „Bank“ mit Vorschlägen aller deutschen Banken (Bankleitzahlendatei der Deutschen Bundesbank): „sparkasse vest“ →
 * „Sparkasse Vest Recklinghausen“. Freitext bleibt erlaubt („Vereinsheim“, „PayPal“). Die Bundesbank verlangt die Angabe der
 * Quelle – sie steht klein unter den Vorschlägen.
 */
export function BankNameField<T extends FieldValues>({
  enabled,
  ...props
}: BaseProps<T> & {
  /** Vorschläge an oder aus (nur für Bankkonten). */
  enabled?: boolean;
}) {
  return (
    <SuggestField
      {...props}
      enabled={enabled}
      load={loadBanks}
      minLength={BANK_QUERY_MIN_LENGTH}
      maxLength={BANK_QUERY_MAX_LENGTH}
      footer="Quelle: Deutsche Bundesbank"
      noMatchMessage="Keine passende Bank gefunden – du kannst den Namen trotzdem eintragen."
    />
  );
}
