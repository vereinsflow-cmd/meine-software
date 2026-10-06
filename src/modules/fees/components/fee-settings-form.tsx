"use client";

import {
  CheckboxField,
  FormError,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { updateFeeSettingsAction } from "../actions";
import {
  AGE_RULE_LABEL,
  FEE_INTERVALS,
  feeSettingsSchema,
  PRO_RATA_ENTRY_LABEL,
  PRO_RATA_EXIT_LABEL,
  type FeeSettingsInput,
} from "../schemas";

const options = <T extends string>(labels: Record<T, string>) =>
  (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));

/** Einstellungen für Beiträge: wie oft abgerechnet wird, wann fällig, wie bei Eintritt, Austritt und Alter gerechnet wird. */
export function FeeSettingsForm({ defaults }: { defaults: FeeSettingsInput }) {
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: feeSettingsSchema,
    defaultValues: defaults,
    action: updateFeeSettingsAction,
    successMessage: "Gespeichert.",
  });
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          form={form}
          name="feeInterval"
          label="Beiträge abrechnen"
          options={FEE_INTERVALS.map((value) => ({
            value,
            label: {
              MONTHLY: "monatlich",
              QUARTERLY: "vierteljährlich",
              HALF_YEARLY: "halbjährlich",
              YEARLY: "jährlich",
            }[value],
          }))}
          hint="Beträge je Monat oder Jahr werden auf diesen Zeitraum umgerechnet."
          required
        />
        <TextField
          form={form}
          name="dueDay"
          label="Fällig am … des ersten Monats"
          inputMode="numeric"
          hint="1 bis 28, z. B. 15"
          required
          inputClassName="sm:max-w-24"
        />
        <SelectField
          form={form}
          name="proRataEntry"
          label="Beim Eintritt"
          options={options(PRO_RATA_ENTRY_LABEL)}
          required
        />
        <SelectField
          form={form}
          name="proRataExit"
          label="Beim Austritt"
          options={options(PRO_RATA_EXIT_LABEL)}
          required
        />
        <SelectField
          form={form}
          name="ageRule"
          label="Altersgrenzen"
          options={options(AGE_RULE_LABEL)}
          required
        />
      </div>
      <CheckboxField
        form={form}
        name="missingBirthDateAsAdult"
        label="Ohne Geburtsdatum als Erwachsene berechnen (mit Hinweis)"
        hint="Sonst wird für diese Mitglieder kein Beitrag berechnet, bis das Geburtsdatum eingetragen ist."
      />
      <FormError message={formError} />
      <SubmitButton pending={isPending} className="justify-self-start">
        Speichern
      </SubmitButton>
    </form>
  );
}
