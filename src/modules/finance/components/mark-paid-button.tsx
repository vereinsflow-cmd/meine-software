"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
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
  /** In Tabellen: auf kleinen Bildschirmen nur das Häkchen (die volle Beschriftung trägt `aria-label`). */
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function mark() {
    startTransition(async () => {
      const result = await setInvoiceStatusAction({ id: invoiceId, status: "PAID" });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`„${name}“ ist als bezahlt markiert.`, {
        description: hint,
        duration: 8000,
        action: { label: "Rückgängig", onClick: () => reopen() },
      });
      router.refresh();
    });
  }

  function reopen() {
    void setInvoiceStatusAction({ id: invoiceId, status: "OPEN" }).then((result) => {
      if (!result.ok) toast.error(result.error.message);
      router.refresh();
    });
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
      <span className={compact ? "hidden md:inline" : undefined}>
        {pending ? "Wird gespeichert …" : "Bezahlt"}
      </span>
    </Button>
  );
}
