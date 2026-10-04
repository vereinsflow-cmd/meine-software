"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormError, SubmitButton, TextField } from "@/components/shared/form-fields";
import { IconButton } from "@/components/shared/icon-button";
import { useActionForm } from "@/hooks/use-action-form";
import { formatCalendarDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { correctOpeningAction } from "../ledger-actions";
import { openingSchema } from "../ledger-schemas";

/**
 * „Anfangsbestand korrigieren“ bzw. „… eintragen“: vertippt, vergessen oder ein überzogenes Girokonto („-250,00“). Der alte
 * Anfangsbestand wird storniert, der neue gilt ab Beginn des Kassenbuchs – das ist weder Einnahme noch Ausgabe.
 */
export function OpeningDialog({
  account,
  currentInput,
  ledgerStartDate,
  trigger,
}: {
  account: { id: string; name: string; kind: "BANK" | "CASH" | "OTHER" };
  /** Bisheriger Anfangsbestand als Eingabetext („11200,00“), leer ohne. */
  currentInput: string;
  ledgerStartDate: Date;
  /**
   * „text“: kleiner Textknopf „Anfangsbestand eintragen“ (Kontokarte); „icon“: Stift in der Zeile des Anfangsbestands. Der
   * Knopf entsteht hier im Browser – ein auf dem Server gebauter `IconButton` käme als Hinweis-Hülle an, die den Klick nicht
   * an den Knopf weiterreicht.
   */
  trigger: "text" | "icon";
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger === "icon" ? (
          <IconButton label={`Anfangsbestand ${account.name} korrigieren`} size="icon-sm">
            <PencilIcon />
          </IconButton>
        ) : (
          <OpeningTrigger>Anfangsbestand eintragen</OpeningTrigger>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Anfangsbestand {account.name}</DialogTitle>
          <DialogDescription>
            Stand am {formatCalendarDate(ledgerStartDate)}, als das Kassenbuch begann. Der bisherige
            Anfangsbestand wird storniert, der neue eingetragen – das ist weder Einnahme noch
            Ausgabe.
          </DialogDescription>
        </DialogHeader>
        <OpeningForm account={account} currentInput={currentInput} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function OpeningForm({
  account,
  currentInput,
  onDone,
}: {
  account: { id: string; kind: "BANK" | "CASH" | "OTHER" };
  currentInput: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: openingSchema,
    defaultValues: { accountId: account.id, amount: currentInput },
    action: correctOpeningAction,
    successMessage: "Anfangsbestand gespeichert.",
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
      <TextField
        form={form}
        name="amount"
        label="Anfangsbestand in €"
        inputMode="decimal"
        hint={
          account.kind === "CASH" ? "0 ist erlaubt." : "Überzogen? Mit Minus davor, z. B. -250,00."
        }
        required
        inputClassName="sm:max-w-48"
      />
      <FormError message={formError} />
      <SubmitButton pending={isPending} className="justify-self-start">
        Speichern
      </SubmitButton>
    </form>
  );
}

/** Kleiner Textknopf als Auslöser (Kontokarte). */
function OpeningTrigger({ className, ...props }: React.ComponentProps<typeof Button>) {
  // Props und Referenz weiterreichen – sonst öffnet `DialogTrigger asChild` den Dialog nicht.
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("-ml-2 h-8 px-2 text-primary hover:text-primary", className)}
      {...props}
    />
  );
}
