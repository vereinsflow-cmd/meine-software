"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setInvoiceStatusAction } from "../actions";

/**
 * „Bezahlt“ – markiert eine offene Rechnung als bezahlt. Kein Rückfrage-Dialog: Die Meldung bietet „Rückgängig“ an,
 * falls man sich verklickt hat (die Rechnung ist dann wieder offen).
 */
export function MarkPaidButton({
  invoiceId,
  name,
  className,
  compact = false,
}: {
  invoiceId: string;
  name: string;
  className?: string;
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
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={mark}
      aria-label={`„${name}“ als bezahlt markieren`}
      className={className}
    >
      <CheckIcon />
      <span className={compact ? "hidden md:inline" : undefined}>
        {pending ? "Wird gespeichert …" : "Bezahlt"}
      </span>
    </Button>
  );
}
