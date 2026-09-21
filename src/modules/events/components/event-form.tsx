"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CheckboxField,
  FormError,
  SelectField,
  SubmitButton,
  TextField,
  TextareaField,
} from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { EVENT_TYPE_LABEL, options } from "@/lib/labels";
import { FREQUENCY_LABEL } from "@/lib/recurrence";
import { createEventAction, updateEventAction } from "../actions";
import { eventFormSchema, type EventFormInput } from "../schemas";

interface Option {
  id: string;
  name: string;
  selectable?: boolean;
}

export function EventForm({
  mode,
  eventId,
  defaultValues,
  departments,
  members,
  departmentRequired,
}: {
  mode: "create" | "edit";
  eventId?: string;
  defaultValues: EventFormInput;
  departments: Option[];
  members: Option[];
  departmentRequired: boolean;
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: eventFormSchema,
    defaultValues,
    action: (values) =>
      mode === "create" ? createEventAction(values) : updateEventAction(eventId!, values),
    successMessage:
      mode === "create" ? "Veranstaltung angelegt (Entwurf)." : "Änderungen gespeichert.",
    onSuccess: (data) => {
      const id = mode === "create" ? (data as { id: string }).id : eventId!;
      router.push(`/veranstaltungen/${id}`);
      router.refresh();
    },
  });

  const allDay = form.watch("allDay");
  const registrationRequired = form.watch("registrationRequired");
  const repeat = form.watch("repeat");

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      <FormError message={formError} />

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Grunddaten
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="title" label="Titel" required className="sm:col-span-2" />
          <SelectField
            form={form}
            name="type"
            label="Art der Veranstaltung"
            options={options(EVENT_TYPE_LABEL)}
            required
          />
          <SelectField
            form={form}
            name="departmentId"
            label="Abteilung"
            required={departmentRequired}
            placeholder={departmentRequired ? "Bitte wählen" : "Ganzer Verein"}
            options={departments
              .filter((d) => d.selectable !== false)
              .map((d) => ({ value: d.id, label: d.name }))}
          />
          <SelectField
            form={form}
            name="visibility"
            label="Sichtbarkeit"
            options={[
              { value: "INTERNAL", label: "Intern (nur Vereinsmitglieder)" },
              { value: "PUBLIC", label: "Öffentlich (nur Kennzeichnung – eine Gäste-Seite folgt)" },
            ]}
          />
          <TextField
            form={form}
            name="targetAudience"
            label="Zielgruppe"
            hint="z. B. Jugend ab 12 Jahren"
          />
          <TextareaField
            form={form}
            name="description"
            label="Beschreibung"
            rows={5}
            className="sm:col-span-2"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Zeit
          </CardTitle>
          <CardDescription>
            Alle Zeiten gelten für die Zeitzone Europe/Berlin (Sommer-/Winterzeit wird
            berücksichtigt).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <CheckboxField form={form} name="allDay" label="Ganztägig" className="sm:col-span-2" />
          <TextField form={form} name="startDate" label="Beginn – Datum" type="date" required />
          {!allDay && (
            <TextField form={form} name="startTime" label="Beginn – Uhrzeit" type="time" required />
          )}
          <TextField form={form} name="endDate" label="Ende – Datum" type="date" required />
          {!allDay && (
            <TextField form={form} name="endTime" label="Ende – Uhrzeit" type="time" required />
          )}

          {mode === "create" && (
            <>
              <SelectField
                form={form}
                name="repeat"
                label="Wiederholung"
                options={[
                  { value: "none", label: "Einmalig" },
                  ...Object.entries(FREQUENCY_LABEL).map(([value, label]) => ({ value, label })),
                ]}
                hint="Jeder Termin wird als eigene Veranstaltung angelegt."
              />
              {repeat !== "none" && (
                <TextField
                  form={form}
                  name="repeatCount"
                  label="Anzahl der Termine"
                  type="number"
                  inputMode="numeric"
                  hint="Insgesamt inklusive erstem Termin, höchstens 52."
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Ort und Ansprechpartner
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextField
            form={form}
            name="locationName"
            label="Ort"
            hint="z. B. Sportplatz, Vereinsheim"
          />
          <TextField form={form} name="address" label="Adresse" />
          <SelectField
            form={form}
            name="contactMemberId"
            label="Ansprechpartner (Mitglied)"
            placeholder="Keiner"
            options={members.map((m) => ({ value: m.id, label: m.name }))}
            className="sm:col-span-2"
          />
          <TextField form={form} name="contactName" label="… oder externer Ansprechpartner" />
          <TextField form={form} name="contactEmail" label="E-Mail" type="email" />
          <TextField form={form} name="contactPhone" label="Telefon" type="tel" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Anmeldung
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <CheckboxField
            form={form}
            name="registrationRequired"
            label="Anmeldung erforderlich"
            className="sm:col-span-2"
          />
          <TextField
            form={form}
            name="maxParticipants"
            label="Maximale Teilnehmerzahl"
            type="number"
            inputMode="numeric"
            hint="Leer lassen für unbegrenzt."
          />
          <CheckboxField
            form={form}
            name="waitlistEnabled"
            label="Warteliste aktivieren"
            hint="Überzählige Anmeldungen warten und rücken bei Absagen automatisch nach."
            className="self-end"
          />
          {registrationRequired && (
            <>
              <TextField
                form={form}
                name="registrationDeadlineDate"
                label="Anmeldefrist – Datum"
                type="date"
              />
              <TextField
                form={form}
                name="registrationDeadlineTime"
                label="Anmeldefrist – Uhrzeit"
                type="time"
                hint="Ohne Angabe: 23:59 Uhr."
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Interne Notizen
          </CardTitle>
          <CardDescription>Nur für Veranstalter sichtbar.</CardDescription>
        </CardHeader>
        <CardContent>
          <TextareaField form={form} name="internalNotes" label="Notizen" rows={4} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild variant="outline">
          <Link
            href={mode === "edit" && eventId ? `/veranstaltungen/${eventId}` : "/veranstaltungen"}
          >
            Abbrechen
          </Link>
        </Button>
        <SubmitButton pending={isPending}>
          {mode === "create" ? "Als Entwurf speichern" : "Änderungen speichern"}
        </SubmitButton>
      </div>
    </form>
  );
}
