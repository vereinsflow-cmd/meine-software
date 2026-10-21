"use client";

import { useTransition } from "react";
import { CheckIcon, Loader2Icon } from "lucide-react";
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
 * Zartgrün (seit 20.10.2026, Dokumentenliste „Ruhige Liste“): getönt wie die Nebenknöpfe (`BUTTON_ACCENT` in
 * components/shared/accent.ts) – Grund 50, Rand 200, Schrift 800, im Dunkeln Grund 400/10 %, Schrift 300 (nachgerechnet in
 * tests/unit/document-display.test.ts). Für Listen, in denen der Knopf in vielen Zeilen steht und nicht lauter sein soll als
 * der Inhalt.
 */
const PAID_BUTTON_SOFT =
  "border border-emerald-200 bg-emerald-50 text-emerald-800 shadow-none hover:bg-emerald-100 hover:text-emerald-900 focus-visible:ring-emerald-700/40 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300 dark:hover:bg-emerald-400/20 dark:hover:text-emerald-200";

const CONNECTION_ERROR =
  "Die Verbindung wurde unterbrochen. Bitte lade die Seite neu und prüfe, ob es geklappt hat.";

/**
 * Als bezahlt markieren – für den Knopf „Bezahlt“ und für Menüpunkte (z. B. „Als bezahlt markieren“ im Menü „…“ eines
 * Dokuments am Handy). Kein Rückfrage-Dialog: Die Meldung bietet „Rückgängig“ an, falls man sich verklickt hat (die
 * Rechnung ist dann wieder offen).
 */
export function useMarkPaid({
  invoiceId,
  name,
  hint,
}: {
  invoiceId: string;
  name: string;
  /** Zweite Zeile der Meldung (z. B. wo es weitergeht: „ins Kassenbuch übernehmen“). */
  hint?: string;
}) {
  const [pending, startTransition] = useTransition();

  function reopen() {
    void setInvoiceStatusAction({ id: invoiceId, status: "OPEN" })
      .then((result) => {
        if (!result.ok) toast.error(result.error.message);
        else toast.success(`„${name}“ ist wieder offen.`);
      })
      .catch(() => toast.error(CONNECTION_ERROR));
  }

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

  return { pending, mark };
}

/** „Bezahlt“ – markiert eine offene Rechnung als bezahlt (siehe `useMarkPaid`). */
export function MarkPaidButton({
  invoiceId,
  name,
  className,
  compact = false,
  soft = false,
  hint,
}: {
  invoiceId: string;
  name: string;
  className?: string;
  /** Zweite Zeile der Meldung (z. B. wo es weitergeht: „ins Kassenbuch übernehmen“). */
  hint?: string;
  /** In Tabellen: auf kleinen Bildschirmen auch beim Speichern nur das kurze „Bezahlt“ (die volle Beschriftung trägt `aria-label`). */
  compact?: boolean;
  /**
   * Zartgrün statt kräftig gefüllt (Listen mit vielen Zeilen). Beim Speichern dreht sich dann das Symbol, die Beschriftung
   * bleibt „Bezahlt“ – der Knopf steht in einer schmalen Spalte und darf nicht breiter werden.
   */
  soft?: boolean;
}) {
  const { pending, mark } = useMarkPaid({ invoiceId, name, hint });

  return (
    <Button
      type="button"
      size="sm"
      disabled={pending}
      onClick={mark}
      aria-label={`„${name}“ als bezahlt markieren`}
      className={cn(soft ? PAID_BUTTON_SOFT : PAID_BUTTON, className)}
    >
      {soft && pending ? (
        <Loader2Icon className="motion-safe:animate-spin" aria-hidden="true" />
      ) : (
        <CheckIcon />
      )}
      {/* Am Handy nur „Bezahlt“ statt des langen Wartetexts – ein Häkchen allein sagt nicht, was der Knopf tut. */}
      <span>
        {pending && !soft ? (
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
