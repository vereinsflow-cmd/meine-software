"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LaptopIcon, LogOutIcon, SmartphoneIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToneBadge } from "@/components/shared/status-badge";
import { ConfirmAction } from "@/components/shared/confirm-dialog";
import { FormError, SubmitButton, TextField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { formatDateTime } from "@/lib/dates";
import { changePasswordAction } from "@/modules/auth/actions";
import { changePasswordSchema } from "@/modules/auth/schemas";
import {
  revokeOtherSessionsAction,
  revokeSessionAction,
  setEmailNotificationsAction,
  updateProfileAction,
} from "../actions";
import { profileNameSchema } from "../schemas";

export function ProfileNameForm({ firstName, lastName }: { firstName: string; lastName: string }) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: profileNameSchema,
    defaultValues: { firstName, lastName },
    action: updateProfileAction,
    successMessage: "Dein Name wurde gespeichert.",
    onSuccess: () => router.refresh(),
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-xl gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormError message={formError} />
      </div>
      <TextField form={form} name="firstName" label="Vorname" required autoComplete="given-name" />
      <TextField form={form} name="lastName" label="Nachname" required autoComplete="family-name" />
      <div className="sm:col-span-2">
        <SubmitButton pending={isPending}>Speichern</SubmitButton>
      </div>
    </form>
  );
}

export function EmailNotificationsSwitch({ enabled }: { enabled: boolean }) {
  const id = useId();
  const [checked, setChecked] = useState(enabled);
  const [pending, startTransition] = useTransition();

  function change(next: boolean) {
    setChecked(next);
    startTransition(async () => {
      const result = await setEmailNotificationsAction({ enabled: next });
      if (!result.ok) {
        setChecked(!next);
        toast.error(result.error.message);
        return;
      }
      toast.success(
        next
          ? "E-Mail-Benachrichtigungen sind eingeschaltet."
          : "E-Mail-Benachrichtigungen sind ausgeschaltet.",
      );
    });
  }

  return (
    <div className="flex items-start gap-3">
      <Switch
        id={id}
        checked={checked}
        disabled={pending}
        onCheckedChange={change}
        aria-describedby={`${id}-hint`}
      />
      <div className="grid gap-0.5">
        <Label htmlFor={id}>E-Mail-Benachrichtigungen</Label>
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          Erinnerungen an Schichten und Veranstaltungen sowie neue Zuweisungen zusätzlich per
          E-Mail. Die Benachrichtigungen in der Anwendung bleiben immer aktiv.
        </p>
      </div>
    </div>
  );
}

export function ChangePasswordForm() {
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: changePasswordSchema,
    defaultValues: { currentPassword: "", newPassword: "", newPasswordRepeat: "" },
    action: changePasswordAction,
    successMessage: "Dein Passwort wurde geändert. Andere Geräte wurden abgemeldet.",
    resetOnSuccess: true,
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid max-w-md gap-4">
      <FormError message={formError} />
      <TextField
        form={form}
        name="currentPassword"
        label="Aktuelles Passwort"
        type="password"
        autoComplete="current-password"
        required
      />
      <TextField
        form={form}
        name="newPassword"
        label="Neues Passwort"
        type="password"
        autoComplete="new-password"
        required
        hint="Mindestens 12 Zeichen. Ein langer Satz ist besser als ein kurzes, kompliziertes Passwort."
      />
      <TextField
        form={form}
        name="newPasswordRepeat"
        label="Neues Passwort wiederholen"
        type="password"
        autoComplete="new-password"
        required
      />
      <div>
        <SubmitButton pending={isPending}>Passwort ändern</SubmitButton>
      </div>
    </form>
  );
}

export interface SessionRow {
  id: string;
  current: boolean;
  device: string;
  ipPrefix: string | null;
  createdAt: string;
  lastSeenAt: string;
}

export function SessionList({ sessions }: { sessions: SessionRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const others = sessions.filter((session) => !session.current);

  function revoke(sessionId: string) {
    startTransition(async () => {
      const result = await revokeSessionAction({ sessionId });
      if (!result.ok) toast.error(result.error.message);
      else toast.success("Das Gerät wurde abgemeldet.");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-3">
      <ul className="divide-y rounded-lg border">
        {sessions.map((session) => {
          const Icon = /Android|iOS/.test(session.device) ? SmartphoneIcon : LaptopIcon;
          return (
            <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 items-start gap-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {session.device}
                    {session.current && <ToneBadge tone="success">Dieses Gerät</ToneBadge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Zuletzt aktiv: {formatDateTime(session.lastSeenAt)} Uhr · Angemeldet seit{" "}
                    {formatDateTime(session.createdAt)} Uhr
                    {session.ipPrefix ? ` · IP ${session.ipPrefix}` : ""}
                  </p>
                </div>
              </div>
              {!session.current && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => revoke(session.id)}
                  aria-label={`${session.device} abmelden`}
                >
                  <LogOutIcon /> Abmelden
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {others.length > 0 && (
        <div>
          <ConfirmAction
            destructive
            trigger={<Button variant="outline">Auf allen anderen Geräten abmelden</Button>}
            title="Auf allen anderen Geräten abmelden?"
            description={`${others.length} ${others.length === 1 ? "weiteres Gerät wird" : "weitere Geräte werden"} abgemeldet. Dieses Gerät bleibt angemeldet.`}
            confirmLabel="Abmelden"
            action={revokeOtherSessionsAction}
            successMessage="Alle anderen Geräte wurden abgemeldet."
            onSuccess={() => router.refresh()}
          />
        </div>
      )}
    </div>
  );
}
