"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ToneBadge } from "@/components/shared/status-badge";
import {
  CheckboxField,
  FormError,
  SubmitButton,
  TextField,
  TextareaField,
} from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { formatDate, formatDateTime } from "@/lib/dates";
import { CONSENT_TYPE_LABEL } from "@/lib/labels";
import { DELETION_GRACE_DAYS } from "@/lib/privacy";
import type { ConsentType } from "@/generated/prisma/enums";
import { cancelDeletionAction, requestDeletionAction, setConsentAction } from "../actions";
import { deletionRequestSchema } from "../schemas";

export interface ConsentRow {
  type: ConsentType;
  granted: boolean | null;
  recordedAt: string | null;
  source: string | null;
  selfService: boolean;
}

const SOURCE_LABEL: Record<string, string> = {
  app: "online",
  paper: "schriftlich",
  import: "Import",
};

function ConsentSwitch({ row }: { row: ConsentRow }) {
  const id = useId();
  const [checked, setChecked] = useState(row.granted === true);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function change(next: boolean) {
    setChecked(next);
    startTransition(async () => {
      if (row.type !== "NEWSLETTER" && row.type !== "PHOTO_PUBLICATION") return;
      const result = await setConsentAction({ type: row.type, granted: next });
      if (!result.ok) {
        setChecked(!next);
        toast.error(result.error.message);
        return;
      }
      toast.success(next ? "Einwilligung erteilt." : "Einwilligung widerrufen.");
      router.refresh();
    });
  }

  return (
    <li className="flex items-start justify-between gap-3 p-3">
      <div className="grid gap-0.5">
        <Label htmlFor={id} className="text-sm font-medium">
          {CONSENT_TYPE_LABEL[row.type]}
        </Label>
        <p className="text-xs text-muted-foreground">
          {row.granted === null
            ? "Noch nicht erfasst"
            : `${row.granted ? "Erteilt" : "Widerrufen"} am ${formatDate(row.recordedAt)}${row.source ? ` (${SOURCE_LABEL[row.source] ?? row.source})` : ""}`}
        </p>
      </div>
      {row.selfService ? (
        <Switch id={id} checked={checked} disabled={pending} onCheckedChange={change} />
      ) : (
        <ToneBadge tone={row.granted === null ? "neutral" : row.granted ? "success" : "danger"}>
          {row.granted === null ? "offen" : row.granted ? "erteilt" : "widerrufen"}
        </ToneBadge>
      )}
    </li>
  );
}

/** Eigene Einwilligungen. Freiwillige lassen sich hier direkt erteilen und widerrufen; jede Änderung wird nachvollziehbar festgehalten. */
export function OwnConsentPanel({ rows }: { rows: ConsentRow[] }) {
  return (
    <div className="grid gap-2">
      <ul className="divide-y rounded-lg border">
        {rows.map((row) => (
          <ConsentSwitch key={row.type} row={row} />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Die Datenschutzerklärung und die Einwilligung in die Verarbeitung deiner Vereinsdaten
        erfasst der Verein bei der Aufnahme. Ein Widerruf davon bedeutet das Ende der Mitgliedschaft
        bzw. einen Löschantrag (siehe unten).
      </p>
    </div>
  );
}

export function DeletionPanel({
  pending,
}: {
  pending: { requestedAt: string; scheduledFor: string } | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [cancelling, startCancel] = useTransition();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: deletionRequestSchema,
    defaultValues: { password: "", reason: "", confirm: false },
    action: requestDeletionAction,
    successMessage: "Dein Löschantrag wurde gestellt.",
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });

  if (pending) {
    return (
      <Alert variant="destructive">
        <TriangleAlertIcon />
        <AlertTitle>Löschung beantragt</AlertTitle>
        <AlertDescription>
          <p>
            Dein Konto und deine Mitgliedsdaten werden am{" "}
            <strong>{formatDateTime(pending.scheduledFor)} Uhr</strong> automatisch gelöscht bzw.
            anonymisiert. Bis dahin kannst du den Antrag zurückziehen.
          </p>
          <Button
            className="mt-3"
            variant="outline"
            disabled={cancelling}
            onClick={() =>
              startCancel(async () => {
                const result = await cancelDeletionAction();
                if (!result.ok) toast.error(result.error.message);
                else toast.success("Der Löschantrag wurde zurückgezogen.");
                router.refresh();
              })
            }
          >
            {cancelling ? "Einen Moment …" : "Antrag zurückziehen"}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm">
        Du kannst die Löschung deines Kontos und deiner Mitgliedsdaten beantragen. Nach einer
        Bedenkzeit von {DELETION_GRACE_DAYS} Tagen werden deine Daten in{" "}
        <strong>allen deinen Vereinen</strong> anonymisiert und dein Konto endgültig gelöscht. Das
        lässt sich danach nicht rückgängig machen.
      </p>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" className="w-fit text-destructive">
            Konto löschen …
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Konto und Daten löschen?</DialogTitle>
            <DialogDescription>
              Zur Bestätigung gib bitte dein Passwort ein. Du erhältst eine E-Mail und kannst den
              Antrag {DELETION_GRACE_DAYS} Tage lang zurückziehen.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            <FormError message={formError} />
            <TextField
              form={form}
              name="password"
              label="Passwort"
              type="password"
              autoComplete="current-password"
              required
            />
            <TextareaField form={form} name="reason" label="Grund (freiwillig)" rows={2} />
            <CheckboxField
              form={form}
              name="confirm"
              label={`Ich habe verstanden, dass mein Konto und meine Mitgliedsdaten nach ${DELETION_GRACE_DAYS} Tagen endgültig gelöscht bzw. anonymisiert werden.`}
            />
            <SubmitButton pending={isPending} pendingLabel="Wird beantragt …" variant="destructive">
              Löschung beantragen
            </SubmitButton>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
