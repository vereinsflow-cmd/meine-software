"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormError, SubmitButton, TextField, TextareaField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { updateClubSettingsAction } from "../settings-actions";
import { clubSettingsSchema, type ClubSettingsFormInput } from "../schemas";

export function ClubSettingsForm({ defaults }: { defaults: ClubSettingsFormInput }) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: clubSettingsSchema,
    defaultValues: defaults,
    action: updateClubSettingsAction,
    successMessage: "Einstellungen gespeichert.",
    onSuccess: () => router.refresh(),
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
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
          <TextField form={form} name="contactEmail" label="Kontakt-E-Mail" type="email" />
          <TextField form={form} name="phone" label="Telefon" type="tel" />
          <TextField
            form={form}
            name="street"
            label="Straße und Hausnummer"
            className="sm:col-span-2"
          />
          <TextField form={form} name="postalCode" label="PLZ" inputMode="numeric" />
          <TextField form={form} name="city" label="Ort" />
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
          />
          <TextField
            form={form}
            name="trashDays"
            label="Papierkorb (Tage)"
            type="number"
            inputMode="numeric"
            hint="Gelöschte Mitglieder bleiben so lange wiederherstellbar."
          />
          <TextField
            form={form}
            name="auditMonths"
            label="Änderungsprotokoll (Monate)"
            type="number"
            inputMode="numeric"
            hint="Danach werden alte Protokolleinträge gelöscht."
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <SubmitButton pending={isPending}>Einstellungen speichern</SubmitButton>
      </div>
    </form>
  );
}
