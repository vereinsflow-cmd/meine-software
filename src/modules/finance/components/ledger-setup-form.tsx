"use client";

import { useWatch } from "react-hook-form";
import { CheckboxField, FormError, SubmitButton, TextField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { setupLedgerAction } from "../ledger-actions";
import { ledgerSetupSchema } from "../ledger-schemas";

/**
 * „Kassenbuch einrichten“ beim ersten Besuch: Girokonto mit Anfangsbestand, auf Wunsch die Barkasse, und der Tag, ab dem in
 * VereinsFlow gebucht wird (meist der 1. Januar). Die Kategorien kommen als Vorschlag dazu.
 */
export function LedgerSetupForm({ defaultStart }: { defaultStart: string }) {
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: ledgerSetupSchema,
    defaultValues: {
      ledgerStartDate: defaultStart,
      bankName: "Girokonto",
      bankInstitute: "",
      bankOpening: "",
      withCash: true,
      cashName: "Barkasse",
      cashOpening: "",
    },
    action: setupLedgerAction,
    successMessage: "Das Kassenbuch ist eingerichtet.",
  });
  const withCash = useWatch({ control: form.control, name: "withCash" });
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-5">
      <FormError message={formError} />
      <TextField
        form={form}
        name="ledgerStartDate"
        label="Kassenbuch beginnt am"
        type="date"
        hint="Meist der 1. Januar. Die Anfangsbestände gelten für diesen Tag (Kontoauszug vom Vortag)."
        required
        inputClassName="sm:max-w-48"
      />
      <fieldset className="grid gap-4 rounded-xl border p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm font-semibold">Bankkonto</legend>
        <TextField form={form} name="bankName" label="Name" required />
        <TextField
          form={form}
          name="bankInstitute"
          label="Bank"
          hint="z. B. Sparkasse Musterstadt"
        />
        <TextField
          form={form}
          name="bankOpening"
          label="Anfangsbestand in €"
          inputMode="decimal"
          placeholder="0,00"
        />
      </fieldset>
      <fieldset className="grid gap-4 rounded-xl border p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm font-semibold">Barkasse</legend>
        <CheckboxField
          form={form}
          name="withCash"
          label="Der Verein hat eine Barkasse"
          className="sm:col-span-3"
        />
        {withCash && (
          <>
            <TextField form={form} name="cashName" label="Name" required />
            <TextField
              form={form}
              name="cashOpening"
              label="Anfangsbestand in €"
              inputMode="decimal"
              placeholder="0,00"
            />
          </>
        )}
      </fieldset>
      <p className="text-sm text-muted-foreground">
        Dazu kommen Kategorien in Alltagssprache (Mitgliedsbeiträge, Hallenmiete, Spenden …) mit
        ihrem steuerlichen Bereich. Es sind Vorschläge – im Zweifel mit dem Steuerberater abstimmen.
      </p>
      <SubmitButton pending={isPending} className="justify-self-start">
        Kassenbuch einrichten
      </SubmitButton>
    </form>
  );
}
