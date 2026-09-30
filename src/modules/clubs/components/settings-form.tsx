"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormError, SubmitButton, TextField, TextareaField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { saveClubSetupDataAction, updateClubSettingsAction } from "../settings-actions";
import { clubSettingsSchema, clubSetupSchema, type ClubSettingsFormInput } from "../schemas";

/**
 * Vereinsdaten und Datenschutz-Einstellungen. `setup`: im Assistenten „Verein einrichten“ – Kontakt-E-Mail und Anschrift
 * sind dann Pflicht, und nach dem Speichern geht es direkt zum nächsten Schritt.
 */
export function ClubSettingsForm({
  defaults,
  setup,
}: {
  defaults: ClubSettingsFormInput;
  setup?: { nextHref: string };
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: setup ? clubSetupSchema : clubSettingsSchema,
    defaultValues: defaults,
    action: setup ? saveClubSetupDataAction : updateClubSettingsAction,
    successMessage: setup ? "Vereinsdaten gespeichert." : "Einstellungen gespeichert.",
    onSuccess: () => (setup ? router.push(setup.nextHref) : router.refresh()),
  });
  const required = Boolean(setup);

  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-4xl gap-6">
      <FormError message={formError} />
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Vereinsdaten
          </CardTitle>
          <CardDescription>
            Erscheinen in E-Mails, Datenschutzhinweisen und im Kalender.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextField
            form={form}
            name="name"
            label="Vereinsname"
            required
            className="sm:col-span-2"
          />
          <TextField
            form={form}
            name="contactEmail"
            label="Kontakt-E-Mail"
            type="email"
            required={required}
          />
          <TextField form={form} name="phone" label="Telefon" type="tel" />
          <TextField
            form={form}
            name="street"
            label="Straße und Hausnummer"
            required={required}
            className="sm:col-span-2"
          />
          <TextField
            form={form}
            name="postalCode"
            label="PLZ"
            inputMode="numeric"
            required={required}
            inputClassName="sm:max-w-48"
          />
          <TextField form={form} name="city" label="Ort" required={required} />
          <TextField
            form={form}
            name="website"
            label="Website"
            type="url"
            placeholder="https://"
            className="sm:col-span-2"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Datenschutz
          </CardTitle>
          <CardDescription>
            Ansprechpartner und Aufbewahrungsfristen (Grundsatz der Speicherbegrenzung nach DSGVO).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <TextareaField
            form={form}
            name="privacyContact"
            label="Ansprechpartner für Datenschutzanfragen"
            rows={3}
            className="sm:col-span-3"
            hint="Name und Kontakt der Person, die Auskunfts- und Löschanfragen bearbeitet."
          />
          <TextField
            form={form}
            name="leftMembersMonths"
            label="Ausgetretene Mitglieder (Monate)"
            type="number"
            inputMode="numeric"
            hint="Danach werden ihre Daten anonymisiert. 0 = nie automatisch."
            inputClassName="sm:max-w-48"
          />
          <TextField
            form={form}
            name="trashDays"
            label="Papierkorb (Tage)"
            type="number"
            inputMode="numeric"
            hint="Gelöschte Mitglieder bleiben so lange wiederherstellbar."
            inputClassName="sm:max-w-48"
          />
          <TextField
            form={form}
            name="auditMonths"
            label="Änderungsprotokoll (Monate)"
            type="number"
            inputMode="numeric"
            hint="Danach werden alte Protokolleinträge gelöscht."
            inputClassName="sm:max-w-48"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <SubmitButton pending={isPending}>
          {setup ? "Speichern und weiter" : "Einstellungen speichern"}
        </SubmitButton>
      </div>
    </form>
  );
}
