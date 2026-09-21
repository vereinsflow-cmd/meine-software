"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  BanIcon,
  CheckCheckIcon,
  CopyIcon,
  MegaphoneIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ConfirmAction } from "@/components/shared/confirm-dialog";
import { FormError, SubmitButton, TextField, TextareaField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import type { EventStatus } from "@/generated/prisma/enums";
import {
  archiveEventAction,
  cancelEventAction,
  completeEventAction,
  deleteEventAction,
  duplicateEventAction,
  publishEventAction,
  restoreEventAction,
} from "../actions";
import { cancelEventSchema, duplicateSchema } from "../schemas";

function CancelDialog({ id, title }: { id: string; title: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: cancelEventSchema,
    defaultValues: { id, reason: "" },
    action: cancelEventAction,
    successMessage: "Veranstaltung abgesagt. Teilnehmer und Helfer werden benachrichtigt.",
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-destructive">
          <BanIcon /> Absagen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>„{title}“ absagen?</DialogTitle>
          <DialogDescription>
            Alle Zugesagten und eingeteilten Helfer werden benachrichtigt (auch per E-Mail). Die
            Schichten werden storniert.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormError message={formError} />
          <TextareaField
            form={form}
            name="reason"
            label="Grund der Absage"
            rows={3}
            required
            hint="Wird in der Benachrichtigung angezeigt."
          />
          <SubmitButton pending={isPending} variant="destructive" pendingLabel="Wird abgesagt …">
            Veranstaltung absagen
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DuplicateDialog({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: duplicateSchema,
    defaultValues: { id, startDate: "" },
    action: duplicateEventAction,
    successMessage: "Veranstaltung dupliziert (Entwurf).",
    onSuccess: (data) => {
      setOpen(false);
      router.push(`/veranstaltungen/${(data as { id: string }).id}`);
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <CopyIcon /> Duplizieren
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Veranstaltung duplizieren</DialogTitle>
          <DialogDescription>
            Kopiert alle Angaben und Schichten (ohne Teilnehmer und Einteilungen) als neuen Entwurf.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormError message={formError} />
          <TextField
            form={form}
            name="startDate"
            label="Datum der neuen Veranstaltung"
            type="date"
            required
          />
          <SubmitButton pending={isPending}>Duplizieren</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Verwaltungsschaltflächen der Veranstaltungsseite (der Server prüft jede Aktion erneut). */
export function EventActions({
  id,
  title,
  status,
  can,
}: {
  id: string;
  title: string;
  status: EventStatus;
  can: { update: boolean; publish: boolean; archive: boolean; duplicate: boolean };
}) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <>
      {can.update && (
        <Button asChild>
          <Link href={`/veranstaltungen/${id}/bearbeiten`}>
            <PencilIcon /> Bearbeiten
          </Link>
        </Button>
      )}
      {can.publish && status === "DRAFT" && (
        <ConfirmAction
          trigger={
            <Button>
              <MegaphoneIcon /> Veröffentlichen
            </Button>
          }
          title="Veranstaltung veröffentlichen?"
          description="Sie wird für alle Mitglieder sichtbar und Mitglieder werden benachrichtigt. Anmeldungen sind danach möglich."
          confirmLabel="Veröffentlichen"
          action={() => publishEventAction({ id })}
          successMessage="Veranstaltung veröffentlicht."
          onSuccess={refresh}
        />
      )}
      {can.publish && status === "PUBLISHED" && (
        <ConfirmAction
          trigger={
            <Button variant="outline">
              <CheckCheckIcon /> Abschließen
            </Button>
          }
          title="Veranstaltung abschließen?"
          description="Sie gilt als durchgeführt. Danach sind keine Anmeldungen mehr möglich; Helferstunden lassen sich weiter dokumentieren."
          confirmLabel="Abschließen"
          action={() => completeEventAction({ id })}
          successMessage="Veranstaltung abgeschlossen."
          onSuccess={refresh}
        />
      )}
      {can.publish && (status === "PUBLISHED" || status === "DRAFT") && (
        <CancelDialog id={id} title={title} />
      )}
      {can.duplicate && <DuplicateDialog id={id} />}
      {can.archive && status !== "ARCHIVED" && (
        <ConfirmAction
          trigger={
            <Button variant="outline">
              <ArchiveIcon /> Archivieren
            </Button>
          }
          title="Veranstaltung archivieren?"
          description="Sie verschwindet aus den normalen Listen und dem Kalender, bleibt aber erhalten."
          confirmLabel="Archivieren"
          action={() => archiveEventAction({ id })}
          successMessage="Veranstaltung archiviert."
          onSuccess={refresh}
        />
      )}
      {can.archive && status === "ARCHIVED" && (
        <ConfirmAction
          trigger={
            <Button variant="outline">
              <ArchiveRestoreIcon /> Wiederherstellen
            </Button>
          }
          title="Veranstaltung wiederherstellen?"
          description="Sie erscheint wieder in den Listen."
          confirmLabel="Wiederherstellen"
          action={() => restoreEventAction({ id })}
          successMessage="Veranstaltung wiederhergestellt."
          onSuccess={refresh}
        />
      )}
      {can.archive && (status === "DRAFT" || status === "ARCHIVED") && (
        <ConfirmAction
          destructive
          trigger={
            <Button variant="outline" className="text-destructive">
              <Trash2Icon /> Löschen
            </Button>
          }
          title="Veranstaltung löschen?"
          description="Die Veranstaltung wird gelöscht und ist nicht mehr auffindbar."
          confirmLabel="Löschen"
          action={() => deleteEventAction({ id })}
          successMessage="Veranstaltung gelöscht."
          onSuccess={() => router.push("/veranstaltungen")}
        />
      )}
    </>
  );
}
