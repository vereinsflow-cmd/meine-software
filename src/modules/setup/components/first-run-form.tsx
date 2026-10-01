"use client";

import Link from "next/link";
import { CheckboxField, FormError, SubmitButton, TextField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { firstRunAction } from "../actions";
import { firstRunSchema } from "../schemas";

/** Ersteinrichtung: Verein und erstes Administrator-Konto in einem Schritt. */
export function FirstRunForm() {
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: firstRunSchema,
    defaultValues: {
      clubName: "",
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      passwordRepeat: "",
      acceptTerms: false,
    },
    action: firstRunAction,
  });

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormError message={formError} />
      <TextField
        form={form}
        name="clubName"
        label="Name des Vereins"
        autoComplete="organization"
        placeholder="z. B. TSV Musterstadt 1920 e. V."
        required
      />
      <p className="-mb-1 pt-2 text-sm font-medium">Dein Konto als Administrator</p>
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
        autoComplete="email"
        hint="Damit meldest du dich künftig an."
        required
      />
      <TextField
        form={form}
        name="password"
        label="Passwort"
        type="password"
        autoComplete="new-password"
        hint="Mindestens 10 Zeichen. Ein längerer Satz ist sicherer als ein kurzes, kompliziertes Wort."
        required
      />
      <TextField
        form={form}
        name="passwordRepeat"
        label="Passwort wiederholen"
        type="password"
        autoComplete="new-password"
        required
      />
      <CheckboxField
        form={form}
        name="acceptTerms"
        label={
          <>
            Ich habe die{" "}
            <Link
              href="/datenschutzerklaerung"
              target="_blank"
              className="text-primary underline underline-offset-4"
            >
              Datenschutzerklärung
            </Link>{" "}
            zur Kenntnis genommen.
          </>
        }
      />
      <SubmitButton pending={isPending} pendingLabel="Verein wird angelegt …" className="w-full">
        Verein anlegen und loslegen
      </SubmitButton>
    </form>
  );
}
