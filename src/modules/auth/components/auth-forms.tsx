"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2Icon, InfoIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckboxField, FormError, SubmitButton, TextField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import {
  acceptInvitationAction,
  acceptInvitationExistingAction,
  forgotPasswordAction,
  loginAction,
  resetPasswordAction,
} from "../actions";
import {
  acceptInvitationSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from "../schemas";

export function LoginForm({
  next,
  notice,
}: {
  next?: string;
  notice?: "expired" | "reset" | null;
}) {
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: loginSchema,
    defaultValues: { email: "", password: "", next },
    action: loginAction,
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      {notice === "expired" && (
        <Alert>
          <InfoIcon />
          <AlertDescription>
            Du wurdest aus Sicherheitsgründen abgemeldet (Inaktivität oder abgelaufene Sitzung).
            Bitte melde dich erneut an.
          </AlertDescription>
        </Alert>
      )}
      {notice === "reset" && (
        <Alert>
          <CheckCircle2Icon />
          <AlertDescription>
            Dein Passwort wurde geändert. Bitte melde dich mit dem neuen Passwort an.
          </AlertDescription>
        </Alert>
      )}
      <FormError message={formError} />
      <TextField
        form={form}
        name="email"
        label="E-Mail-Adresse"
        type="email"
        autoComplete="username"
        required
      />
      <TextField
        form={form}
        name="password"
        label="Passwort"
        type="password"
        autoComplete="current-password"
        required
      />
      <SubmitButton pending={isPending} pendingLabel="Anmeldung läuft …" className="w-full">
        Anmelden
      </SubmitButton>
      <p className="text-center text-sm">
        <Link
          href="/passwort-vergessen"
          className="text-primary underline-offset-4 hover:underline"
        >
          Passwort vergessen?
        </Link>
      </p>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: forgotPasswordSchema,
    defaultValues: { email: "" },
    action: forgotPasswordAction,
    onSuccess: () => setSent(true),
  });

  if (sent) {
    return (
      <Alert>
        <CheckCircle2Icon />
        <AlertDescription>
          Falls für diese E-Mail-Adresse ein Konto existiert, haben wir dir soeben einen Link zum
          Zurücksetzen des Passworts gesendet. Bitte prüfe auch deinen Spam-Ordner. Der Link ist 60
          Minuten gültig.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormError message={formError} />
      <TextField
        form={form}
        name="email"
        label="E-Mail-Adresse"
        type="email"
        autoComplete="email"
        required
      />
      <SubmitButton pending={isPending} pendingLabel="Wird gesendet …" className="w-full">
        Link anfordern
      </SubmitButton>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: resetPasswordSchema,
    defaultValues: { token, password: "", passwordRepeat: "" },
    action: resetPasswordAction,
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormError message={formError} />
      <TextField
        form={form}
        name="password"
        label="Neues Passwort"
        type="password"
        autoComplete="new-password"
        hint="Mindestens 10 Zeichen. Ein längerer Satz ist sicherer als ein kurzes, kompliziertes Wort."
        required
      />
      <TextField
        form={form}
        name="passwordRepeat"
        label="Neues Passwort wiederholen"
        type="password"
        autoComplete="new-password"
        required
      />
      <SubmitButton pending={isPending} className="w-full">
        Passwort speichern
      </SubmitButton>
    </form>
  );
}

export function AcceptInvitationForm({ token }: { token: string }) {
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: acceptInvitationSchema,
    defaultValues: {
      token,
      firstName: "",
      lastName: "",
      password: "",
      passwordRepeat: "",
      acceptTerms: false,
    },
    action: acceptInvitationAction,
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormError message={formError} />
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
      <SubmitButton pending={isPending} pendingLabel="Konto wird angelegt …" className="w-full">
        Konto anlegen und beitreten
      </SubmitButton>
    </form>
  );
}

/** Für bereits registrierte Personen, die mit dem passenden Konto angemeldet sind. */
export function AcceptExistingInvitationButton({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function accept() {
    setPending(true);
    setError(null);
    const result = await acceptInvitationExistingAction({ token });
    // Bei Erfolg leitet die Action weiter; hierher gelangen wir nur bei einem Fehler.
    if (!result.ok) setError(result.error.message);
    setPending(false);
  }

  return (
    <div className="grid gap-3">
      <FormError message={error} />
      <Button onClick={accept} disabled={pending} className="w-full">
        {pending ? "Einen Moment …" : "Einladung annehmen"}
      </Button>
    </div>
  );
}
