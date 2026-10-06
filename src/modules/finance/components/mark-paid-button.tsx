"use client";

import { useTransition } from "react";
import { CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setInvoiceStatusAction } from "../actions";

/**
 * Grün wie „bezahlt“ (auf Wunsch, 27.09.2026) – die einzige Ausnahme von „Blau ist die Aktionsfarbe“. Weiße Schrift auf
 * Emerald 700 (5,5 : 1) bzw. dunkle Schrift auf Emerald 500 im dunklen Modus, beides über 4,5 : 1.
 */
const PAID_BUTTON =
  "bg-emerald-700 text-white hover:bg-emerald-800 focus-visible:ring-emerald-700/40 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400";

/**
 * „Bezahlt“ – markiert eine offene Rechnung als bezahlt. Kein Rückfrage-Dialog: Die Meldung bietet „Rückgängig“ an,
 * falls man sich verklickt hat (die Rechnung ist dann wieder offen).
 */
const CONNECTION_ERROR =
  "Die Verbindung wurde unterbrochen. Bitte lade die Seite neu und prüfe, ob es geklappt hat.";

export function MarkPaidButton({
  invoiceId,
  name,
  className,
  compact = false,
  hint,
}: {
  invoiceId: string;
  name: string;
  className?: string;
  /** Zweite Zeile der Meldung (z. B. wo es weitergeht: „ins Kassenbuch übernehmen“). */
  hint?: string;
  /** In Tabellen: auf kleinen Bildschirmen auch beim Speichern nur das kurze „Bezahlt“ (die volle Beschriftung trägt `aria-label`). */
  compact?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  function mark() {
    startTransition(async () => {
      const result = await setInvoiceStatusAction({ id: invoiceId, status: "PAID" }).catch(
        () => null,
      );
      if (!result) {
        toast.error(CONNECTION_ERROR);
        return;
      }
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`„${name}“ ist als bezahlt markiert.`, {
        description: hint,
        duration: 8000,
        action: { label: "Rückgängig", onClick: () => reopen() },
      });
    });
  }

  function reopen() {
    void setInvoiceStatusAction({ id: invoiceId, status: "OPEN" })
      .then((result) => {
        if (!result.ok) toast.error(result.error.message);
        else toast.success(`„${name}“ ist wieder offen.`);
      })
      .catch(() => toast.error(CONNECTION_ERROR));
  }

  return (
    <Button
      type="button"
      size="sm"
      disabled={pending}
      onClick={mark}
      aria-label={`„${name}“ als bezahlt markieren`}
      className={cn(PAID_BUTTON, className)}
    >
      <CheckIcon />
      {/* Am Handy nur „Bezahlt“ statt des langen Wartetexts – ein Häkchen allein sagt nicht, was der Knopf tut. */}
      <span>
        {pending ? (
          compact ? (
            <>
              <span className="md:hidden">Bezahlt</span>
              <span className="hidden md:inline">Wird gespeichert …</span>
            </>
          ) : (
            "Wird gespeichert …"
          )
        ) : (
          "Bezahlt"
        )}
      </span>
    </Button>
  );
}
