"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import type { EntryFormOptions } from "../ledger";
import type { EntryInput } from "../ledger-schemas";
import { EntryDialog } from "./entry-dialog";

/** Ziel des Fokus nach „Ins Kassenbuch“ – der Knopf selbst verschwindet, sobald die Rechnung gebucht ist. */
export const INVOICE_LIST_FOCUS_ID = "rechnungen-liste";

/**
 * „Ins Kassenbuch“ an einer bezahlten Rechnung: öffnet „Neue Buchung“ vorausgefüllt (Ausgabe, Betrag, Tag der Zahlung); die
 * Rechnung hängt danach als Beleg an der Buchung. Am Handy heißt der Knopf kurz „Buchen“.
 */
export function BookInvoiceButton({
  options,
  invoice,
  defaults,
}: {
  options: EntryFormOptions;
  invoice: { name: string };
  defaults: Partial<EntryInput>;
}) {
  const saved = useRef(false);
  return (
    <EntryDialog
      options={options}
      invoice={invoice}
      defaults={defaults}
      onSaved={() => (saved.current = true)}
      onCloseAutoFocus={(event) => {
        if (!saved.current) return;
        saved.current = false;
        event.preventDefault();
        document.getElementById(INVOICE_LIST_FOCUS_ID)?.focus();
      }}
      trigger={
        <Button
          variant="outline"
          size="sm"
          aria-label={`„${invoice.name}“ ins Kassenbuch übernehmen`}
        >
          <span className="md:hidden">Buchen</span>
          <span className="hidden md:inline">Ins Kassenbuch</span>
        </Button>
      }
    />
  );
}
