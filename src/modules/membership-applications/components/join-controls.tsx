"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CopyIcon,
  MailIcon,
  QrCodeIcon,
  RefreshCwIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/shared/confirm-dialog";
import { FormError, SubmitButton, TextField } from "@/components/shared/form-fields";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useActionForm } from "@/hooks/use-action-form";
import type { ActionResult } from "@/lib/action-result";
import { APPLICATION_DECIDED_RETENTION_DAYS, JOIN_LIMIT_MAX } from "@/lib/membership-application";
import {
  acceptApplicationAction,
  closeJoinLinkAction,
  enableJoinLinkAction,
  rejectApplicationAction,
  renewJoinLinkAction,
  resendApplicationInvitationAction,
  setJoinLimitAction,
} from "../actions";
import { joinLimitSchema } from "../schemas";
import type { AcceptResult } from "../service";

/**
 * Bedienelemente der Seite „Beitrittsanträge“. Die Seite selbst ist eine Server-Komponente; hier stecken nur die Knöpfe,
 * die etwas auslösen. Entscheidungen (annehmen, ablehnen, neuer Code, schließen) laufen über eine Rückfrage.
 */

type Router = ReturnType<typeof useRouter>;

/**
 * Hat inzwischen jemand anderes entschieden („bereits entschieden“) oder ist der Antrag weg („nicht gefunden“), ist die
 * Karte veraltet: Seite neu laden, damit sie verschwindet und „Zuletzt entschieden“ die andere Entscheidung zeigt. Die
 * Fehlermeldung zeigt `ConfirmAction` weiterhin selbst.
 */
function refreshIfStale<T>(result: ActionResult<T>, router: Router): ActionResult<T> {
  if (!result.ok && (result.error.code === "CONFLICT" || result.error.code === "NOT_FOUND"))
    router.refresh();
  return result;
}

type JoinLimitMode = "setup" | "renew" | "change";

const LIMIT_DIALOG: Record<
  JoinLimitMode,
  { title: string; description: string; submit: string; success: string }
> = {
  setup: {
    title: "QR-Code einrichten",
    description:
      "Wie viele neue Mitglieder sollen sich über diesen QR-Code anmelden können? Danach nimmt er keine Anträge mehr an – die Anzahl kannst du später ändern.",
    submit: "QR-Code einrichten",
    success: "Der QR-Code ist eingerichtet.",
  },
  renew: {
    title: "Neuen QR-Code erzeugen?",
    description:
      "Der alte QR-Code funktioniert danach nicht mehr – bereits gedruckte Aushänge musst du ersetzen. Der neue Code beginnt wieder bei 0 Anmeldungen.",
    submit: "Neuen Code erzeugen",
    success: "Neuer QR-Code erzeugt. Der alte gilt nicht mehr.",
  },
  change: {
    title: "Anzahl der Anmeldungen ändern",
    description:
      "Wie viele Anträge darf der QR-Code insgesamt annehmen? Der Code und die bisherigen Anmeldungen bleiben.",
    submit: "Speichern",
    success: "Anzahl gespeichert.",
  },
};

/**
 * Fenster mit der Frage „Wie viele Anmeldungen?“ – beim Einrichten (Pflicht), beim neuen Code und beim Ändern. Ein
 * abgelehnter Antrag gibt seinen Platz zurück; das steht als Hinweis am Feld.
 */
function JoinLimitDialog({
  mode,
  current,
  used,
  trigger,
}: {
  mode: JoinLimitMode;
  current?: number | null;
  used?: number;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const texts = LIMIT_DIALOG[mode];
  const action =
    mode === "setup"
      ? enableJoinLinkAction
      : mode === "renew"
        ? renewJoinLinkAction
        : setJoinLimitAction;
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: joinLimitSchema,
    defaultValues: { limit: current ?? "" },
    action,
    successMessage: texts.success,
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        if (next) form.reset({ limit: current ?? "" });
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{texts.title}</DialogTitle>
          <DialogDescription>{texts.description}</DialogDescription>
        </DialogHeader>
        <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormError message={formError} />
          <TextField
            form={form}
            name="limit"
            label="Anzahl der Anmeldungen"
            type="number"
            inputMode="numeric"
            required
            inputClassName="sm:max-w-48"
            hint={
              mode === "change" && used !== undefined
                ? `Bisher ${used === 1 ? "ist 1 Antrag" : `sind ${used} Anträge`} eingegangen. Abgelehnte Anträge geben ihren Platz zurück. Höchstens ${JOIN_LIMIT_MAX.toLocaleString("de-DE")}.`
                : `Zum Beispiel 50. Abgelehnte Anträge geben ihren Platz zurück. Höchstens ${JOIN_LIMIT_MAX.toLocaleString("de-DE")}.`
            }
          />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isPending}>
                Abbrechen
              </Button>
            </DialogClose>
            <SubmitButton pending={isPending}>{texts.submit}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Hauptaktion, solange es noch keinen Link gibt – fragt, wie viele Anmeldungen der Code zulässt. */
export function SetupJoinLinkButton() {
  return (
    <JoinLimitDialog
      mode="setup"
      trigger={
        <Button className="w-fit">
          <QrCodeIcon /> QR-Code einrichten
        </Button>
      }
    />
  );
}

/** Anzahl der Anmeldungen ändern (ohne neuen Code). */
export function ChangeJoinLimitButton({
  limit,
  used,
  label = "Anzahl ändern",
}: {
  limit: number | null;
  used: number;
  label?: string;
}) {
  return (
    <JoinLimitDialog
      mode="change"
      current={limit}
      used={used}
      trigger={
        <Button variant="outline">
          <UsersIcon /> {label}
        </Button>
      }
    />
  );
}

export function CopyJoinLinkButton({ url }: { url: string }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link kopiert.");
    } catch {
      toast.error("Kopieren ist hier nicht möglich – markiere den Link und kopiere ihn von Hand.");
    }
  }
  return (
    <Button type="button" variant="outline" onClick={copy}>
      <CopyIcon /> Kopieren
    </Button>
  );
}

export function RenewJoinLinkButton({ limit }: { limit: number | null }) {
  return (
    <JoinLimitDialog
      mode="renew"
      current={limit}
      trigger={
        <Button variant="outline">
          <RefreshCwIcon /> Neuen Code erzeugen
        </Button>
      }
    />
  );
}

export function CloseJoinLinkButton() {
  const router = useRouter();
  return (
    <ConfirmAction
      destructive
      trigger={
        <Button variant="outline" className="text-destructive">
          Beitritt schließen
        </Button>
      }
      title="Beitritt per QR-Code schließen?"
      description="QR-Code und Link funktionieren danach nicht mehr, neue Anträge sind nicht möglich. Offene Anträge bleiben erhalten. Du kannst den Beitritt jederzeit wieder einrichten – dann mit einem neuen QR-Code."
      confirmLabel="Beitritt schließen"
      action={closeJoinLinkAction}
      successMessage="Der Beitritt per QR-Code ist geschlossen."
      onSuccess={() => router.refresh()}
    />
  );
}

/** „Annehmen“ – Hauptknopf der Antragskarte (wie „Eintragen“ in Listen). */
export function AcceptApplicationButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  // ConfirmAction meldet nur „erledigt“; das Ergebnis (Einladung verschickt?) merken wir uns für die Erfolgsmeldung.
  const outcome = useRef<AcceptResult | null>(null);
  return (
    <ConfirmAction
      trigger={
        <Button>
          <UserPlusIcon /> Annehmen
        </Button>
      }
      title={`${name} annehmen?`}
      description={`${name} wird als Mitglied angelegt und bekommt eine Einladung per E-Mail.`}
      confirmLabel="Annehmen"
      action={async () => {
        const result = await acceptApplicationAction({ id });
        if (result.ok) outcome.current = result.data;
        return refreshIfStale(result, router);
      }}
      onSuccess={() => {
        const result = outcome.current;
        if (result?.invitationSent === false)
          // Länger stehen lassen: Die Meldung sagt, was noch zu tun ist. Der Knopf dafür steht danach unter „Zuletzt
          // entschieden“ – dieselbe Berechtigung wie das Annehmen, also auch für den Vorstand ohne Einladungsrecht.
          toast.warning(
            `${name} ist jetzt Mitglied. Die Einladung konnte aber nicht verschickt werden – sende sie unter „Zuletzt entschieden“ mit „Einladung erneut senden“.`,
            { duration: 20_000 },
          );
        else toast.success(`${name} ist jetzt Mitglied und bekommt eine Einladung per E-Mail.`);
        router.refresh();
      }}
    />
  );
}

export function RejectApplicationButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      destructive
      trigger={<Button variant="outline">Ablehnen</Button>}
      title={`Antrag von ${name} ablehnen?`}
      description={`Der Antrag wird abgelehnt und nach ${APPLICATION_DECIDED_RETENTION_DAYS} Tagen gelöscht. ${name} bekommt keine E-Mail – sag bei Bedarf selbst Bescheid.`}
      confirmLabel="Ablehnen"
      action={async () => refreshIfStale(await rejectApplicationAction({ id }), router)}
      successMessage="Antrag abgelehnt."
      onSuccess={() => router.refresh()}
    />
  );
}

/**
 * Einladung zu einem angenommenen Antrag noch einmal schicken – wenn sie nicht verschickt werden konnte oder abgelaufen ist.
 * Ohne Rückfrage wie „Erneut senden“ unter „Benutzer und Rollen“: Es entsteht nur ein neuer Link an dieselbe Person.
 */
export function ResendInvitationButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await resendApplicationInvitationAction({ id });
          if (!result.ok) {
            toast.error(result.error.message);
            refreshIfStale(result, router);
            return;
          }
          toast.success(`Einladung an ${result.data.email} verschickt.`);
          router.refresh();
        })
      }
    >
      <MailIcon /> {pending ? "Wird gesendet …" : "Einladung erneut senden"}
      <span className="sr-only"> an {name}</span>
    </Button>
  );
}
