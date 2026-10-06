"use client";

import type { FieldValues } from "react-hook-form";
import type { BaseProps } from "@/components/shared/form-fields";
import { SuggestField, type Suggestion } from "@/components/shared/suggest-field";
import type { ApiResponse } from "@/lib/action-result";
import {
  BANK_QUERY_MAX_LENGTH,
  BANK_QUERY_MIN_LENGTH,
  bankCodeFromIban,
  type BankSuggestionsResponse,
} from "@/lib/bank-suggestions";

/**
 * Was an den Server geht: Eine IBAN (auch erst halb getippt) gehört nicht in eine Such-URL oder ein Server-Protokoll – von ihr
 * wird nur die Bankleitzahl gesucht, sobald sie vollständig ist (Stellen 5–12). `null`: (noch) nichts suchen.
 */
function bankQuery(query: string): string | null {
  const bankCode = bankCodeFromIban(query);
  if (bankCode) return bankCode;
  const compact = query.replace(/\s+/g, "").toUpperCase();
  if (!/^DE\d{2}/.test(compact)) return query;
  return /^DE\d{10}/.test(compact) ? compact.slice(4, 12) : null;
}

/** Vorschläge von `GET /api/banken`; `null` bei Fehlern (z. B. offline, zu viele Anfragen) – dann einfach keine Liste. */
async function loadBanks(query: string, signal: AbortSignal): Promise<Suggestion[] | null> {
  const search = bankQuery(query);
  if (search === null) return null;
  const response = await fetch(`/api/banken?q=${encodeURIComponent(search)}`, { signal });
  if (!response.ok) return null;
  const body = (await response.json()) as ApiResponse<BankSuggestionsResponse>;
  if (!body.ok) return null;
  return body.data.banks.map((bank) => ({
    id: bank.id,
    label: bank.name,
    detail: bank.detail,
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
  enterKeyHint,
  ...props
}: BaseProps<T> & {
  /** Vorschläge an oder aus (nur für Bankkonten). */
  enabled?: boolean;
  enterKeyHint?: "enter" | "done" | "next";
}) {
  return (
    <SuggestField
      {...props}
      enabled={enabled}
      enterKeyHint={enterKeyHint}
      load={loadBanks}
      minLength={BANK_QUERY_MIN_LENGTH}
      maxLength={BANK_QUERY_MAX_LENGTH}
      footer="Quelle: Deutsche Bundesbank"
      noMatchMessage="Keine passende Bank gefunden – du kannst den Namen trotzdem eintragen."
    />
  );
}
