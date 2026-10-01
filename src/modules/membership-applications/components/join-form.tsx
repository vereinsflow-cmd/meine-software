"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CircleCheckIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClubLogo } from "@/components/shared/club-logo";
import {
  CheckboxField,
  FormError,
  SelectField,
  SubmitButton,
  TextareaField,
  TextField,
} from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { APPLICATION_CONSENT_TEXT } from "@/lib/membership-application";
import { submitApplicationAction } from "../actions";
import { applicationFormSchema } from "../schemas";

/**
 * Öffentliches Antragsformular „Mitglied werden“ – geöffnet meist über den QR-Code am Handy. Deshalb: Felder
 * untereinander, 16-px-Schrift in den Feldern (sonst zoomt iOS beim Antippen), passende Tastaturen (E-Mail, Telefon),
 * Fehlertexte direkt am Feld. Allgemeine Fehler vom Server (Link inzwischen ungültig, zu viele Anträge) stehen direkt über
 * „Antrag senden“: Das Formular ist am Handy höher als der Bildschirm – oben stünde die Meldung außer Sicht und der Knopf
 * schiene nichts zu tun. Nach dem Absenden ersetzt die Bestätigung das Formular.
 */
export function JoinApplicationCard({
  token,
  clubName,
  logoUrl,
  departments,
}: {
  token: string;
  clubName: string;
  logoUrl: string | null;
  departments: { id: string; name: string }[];
}) {
  const [sent, setSent] = useState(false);
  const confirmation = useRef<HTMLDivElement>(null);
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: applicationFormSchema,
    defaultValues: {
      token,
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      birthDate: "",
      departmentId: "",
      message: "",
      consent: false,
      website: "",
    },
    action: submitApplicationAction,
    onSuccess: () => setSent(true),
  });

  // Nach dem Absenden den Fokus auf die Bestätigung setzen – sonst stünde er auf dem verschwundenen Knopf.
  useEffect(() => {
    if (sent) confirmation.current?.focus();
  }, [sent]);

  return (
    <Card className="w-full">
      <CardHeader className="gap-3">
        <div className="flex items-center gap-3">
          <ClubLogo name={clubName} logoUrl={logoUrl} size="lg" />
          <p className="min-w-0 text-base font-semibold break-words">{clubName}</p>
        </div>
        <CardTitle role="heading" aria-level={1} className="text-2xl">
          Mitglied werden
        </CardTitle>
        {!sent && (
          <CardDescription className="text-base">
            Fülle das Formular aus – der Vorstand prüft deinen Antrag und schickt dir dann eine
            Einladung per E-Mail.
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {sent ? (
          <div
            ref={confirmation}
            tabIndex={-1}
            role="status"
            className="grid justify-items-center gap-3 py-4 text-center outline-none"
          >
            <CircleCheckIcon
              className="size-10 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <p className="text-lg font-semibold">Danke! Dein Antrag ist beim Verein angekommen.</p>
            <p className="text-base text-muted-foreground">
              Sobald der Vorstand ihn bestätigt, bekommst du eine E-Mail mit deiner Einladung.
            </p>
          </div>
        ) : (
          <form method="post" onSubmit={onSubmit} noValidate className="relative grid gap-4">
            <p className="text-sm text-muted-foreground">
              Pflichtfelder sind mit <span aria-hidden="true">*</span>
              <span className="sr-only">Stern</span> markiert.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                form={form}
                name="firstName"
                label="Vorname"
                autoComplete="given-name"
                required
              />
              <TextField
                form={form}
                name="lastName"
                label="Nachname"
                autoComplete="family-name"
                required
              />
            </div>
            <TextField
              form={form}
              name="email"
              label="E-Mail-Adresse"
              type="email"
              inputMode="email"
              autoComplete="email"
              hint="Hierhin schickt der Verein deine Einladung."
              required
            />
            <TextField
              form={form}
              name="phone"
              label="Telefon"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              hint="Freiwillig – für Rückfragen des Vereins."
            />
            <TextField
              form={form}
              name="birthDate"
              label="Geburtsdatum"
              type="date"
              autoComplete="bday"
              hint="Freiwillig."
              inputClassName="sm:max-w-48"
            />
            {departments.length > 0 && (
              <SelectField
                form={form}
                name="departmentId"
                label="Abteilung"
                placeholder="Keine Angabe"
                hint="Freiwillig – wofür interessierst du dich?"
                options={departments.map((department) => ({
                  value: department.id,
                  label: department.name,
                }))}
              />
            )}
            <TextareaField
              form={form}
              name="message"
              label="Nachricht an den Verein"
              hint="Freiwillig, höchstens 1000 Zeichen."
              rows={3}
            />
            <CheckboxField
              form={form}
              name="consent"
              required
              label={
                // Eine Hülle um Text und Link: Die Beschriftung ist ein Flex-Container – ohne Hülle stünde der Link als
                // eigene Spalte neben dem Satz.
                <span>
                  {APPLICATION_CONSENT_TEXT} Mehr dazu in der{" "}
                  <Link
                    href="/datenschutzerklaerung"
                    target="_blank"
                    className="text-primary underline underline-offset-4"
                  >
                    Datenschutzerklärung
                  </Link>
                  .
                </span>
              }
            />
            {/* Honigtopf gegen Formular-Roboter: außerhalb des sichtbaren Bereichs, für Screenreader ausgeblendet und nicht
                per Tabulator erreichbar. Menschen lassen das Feld leer; ist es gefüllt, verwirft der Server den Antrag still. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -left-[10000px] size-px overflow-hidden opacity-0"
            >
              <label htmlFor="beitritt-website">Website</label>
              <input
                id="beitritt-website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                {...form.register("website")}
              />
            </div>
            <FormError message={formError} />
            <SubmitButton pending={isPending} pendingLabel="Wird gesendet …" className="w-full">
              Antrag senden
            </SubmitButton>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
