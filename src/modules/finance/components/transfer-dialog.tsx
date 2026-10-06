"use client";

import { useState } from "react";
import { ArrowLeftRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import type { EntryFormOptions } from "../ledger";
import { createTransferAction } from "../ledger-actions";
import { transferSchema } from "../ledger-schemas";
import { AMOUNT_HINT } from "../schemas";

/** Umbuchung zwischen zwei eigenen Konten (z. B. Bargeld zur Bank gebracht) – weder Einnahme noch Ausgabe. */
export function TransferDialog({ options }: { options: EntryFormOptions }) {
  const [open, setOpen] = useState(false);
  // Während des Speicherns bleibt das Fenster offen – sonst ließe sich dieselbe Umbuchung zweimal absenden.
  const [busy, setBusy] = useState(false);
  if (options.accounts.length < 2) return null;
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <ArrowLeftRightIcon /> Umbuchung
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Umbuchung</DialogTitle>
          <DialogDescription>
            Geld zwischen zwei eigenen Konten, z. B. Bargeld aus der Kasse zur Bank gebracht. Das
            ist weder Einnahme noch Ausgabe.
          </DialogDescription>
        </DialogHeader>
        <TransferForm options={options} onBusy={setBusy} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function TransferForm({
  options,
  onBusy,
  onDone,
}: {
  options: EntryFormOptions;
  onBusy: (busy: boolean) => void;
  onDone: () => void;
}) {
  const cash = options.accounts.find((a) => a.kind === "CASH");
  const bank = options.accounts.find((a) => a.kind === "BANK");
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: transferSchema,
    defaultValues: {
      fromAccountId: cash?.value ?? options.accounts[0]!.value,
      toAccountId: bank?.value ?? options.accounts[1]!.value,
      bookingDate: options.today,
      amount: "",
      description: "",
    },
    onBusy,
    action: createTransferAction,
    successMessage: "Umgebucht.",
    onSuccess: () => {
      onDone();
    },
  });
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormError message={formError} />
      </div>
      <SelectField
        form={form}
        name="fromAccountId"
        label="Von"
        options={options.accounts}
        required
      />
      <SelectField
        form={form}
        name="toAccountId"
        label="Nach"
        options={options.accounts}
        required
      />
      <TextField
        form={form}
        name="amount"
        label="Betrag in €"
        inputMode="decimal"
        placeholder={AMOUNT_HINT}
        required
      />
      <TextField form={form} name="bookingDate" label="Datum" type="date" required />
      <TextField
        form={form}
        name="description"
        label="Beschreibung"
        hint="Freiwillig, z. B. „Kasse Sommerfest zur Bank“"
        className="sm:col-span-2"
      />
      <SubmitButton pending={isPending} className="sm:col-span-2 sm:justify-self-end">
        Umbuchen
      </SubmitButton>
    </form>
  );
}
