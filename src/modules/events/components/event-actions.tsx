"use client";

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
} from "@/components/ui/dialog";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { ConfirmAction } from "@/components/shared/confirm-dialog";
import { FormError, SubmitButton, TextField, TextareaField } from "@/components/shared/form-fields";
import {
  MoreActions,
  useMoreActions,
  type MenuDialogProps,
} from "@/components/shared/more-actions";
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
import { availableEventActions, type EventActionRights } from "../available-actions";
import { cancelEventSchema, duplicateSchema } from "../schemas";

function CancelDialog({
  id,
  title,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: { id: string; title: string } & MenuDialogProps) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: cancelEventSchema,
    defaultValues: { id, reason: "" },
    action: cancelEventAction,
    successMessage: "Veranstaltung abgesagt. Teilnehmer und Helfer werden benachrichtigt.",
    onSuccess: () => {
      onOpenChange(false);
      router.refresh();
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
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

function DuplicateDialog({
  id,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: { id: string } & MenuDialogProps) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: duplicateSchema,
    defaultValues: { id, startDate: "" },
    action: duplicateEventAction,
    successMessage: "Veranstaltung dupliziert (Entwurf).",
    onSuccess: (data) => {
      onOpenChange(false);
      router.push(`/veranstaltungen/${(data as { id: string }).id}`);
    },
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
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

type MenuDialog = "complete" | "duplicate" | "archive" | "restore" | "cancel" | "delete";

/**
 * Verwaltungsschaltflächen der Veranstaltungsseite (der Server prüft jede Aktion erneut). Als Knöpfe stehen nur
 * „Bearbeiten“ und beim Entwurf „Veröffentlichen“ da, alles Übrige liegt in „Weitere Aktionen“ – Absagen und Löschen
 * zuletzt, abgesetzt und rot. Jeder Menüpunkt öffnet dieselbe Rückfrage wie zuvor der eigene Knopf.
 */
export function EventActions({
  id,
  title,
  status,
  can,
}: {
  id: string;
  title: string;
  status: EventStatus;
  can: EventActionRights;
}) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const more = useMoreActions<MenuDialog>();
  const show = availableEventActions(status, can);
  const routine = show.complete || show.duplicate || show.archive || show.restore;
  const dangerous = show.cancel || show.delete;

  return (
    <>
      {show.edit && (
        <Button asChild>
          <Link href={`/veranstaltungen/${id}/bearbeiten`}>
            <PencilIcon /> Bearbeiten
          </Link>
        </Button>
      )}
      {show.publish && (
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
      {(routine || dangerous) && (
        <MoreActions triggerRef={more.triggerRef}>
          {show.complete && (
            <DropdownMenuItem onSelect={() => more.show("complete")}>
              <CheckCheckIcon /> Abschließen
            </DropdownMenuItem>
          )}
          {show.duplicate && (
            <DropdownMenuItem onSelect={() => more.show("duplicate")}>
              <CopyIcon /> Duplizieren
            </DropdownMenuItem>
          )}
          {show.archive && (
            <DropdownMenuItem onSelect={() => more.show("archive")}>
              <ArchiveIcon /> Archivieren
            </DropdownMenuItem>
          )}
          {show.restore && (
            <DropdownMenuItem onSelect={() => more.show("restore")}>
              <ArchiveRestoreIcon /> Wiederherstellen
            </DropdownMenuItem>
          )}
          {routine && dangerous && <DropdownMenuSeparator />}
          {show.cancel && (
            <DropdownMenuItem variant="destructive" onSelect={() => more.show("cancel")}>
              <BanIcon /> Absagen
            </DropdownMenuItem>
          )}
          {show.delete && (
            <DropdownMenuItem variant="destructive" onSelect={() => more.show("delete")}>
              <Trash2Icon /> Löschen
            </DropdownMenuItem>
          )}
        </MoreActions>
      )}

      {/* Die Rückfragen der Menüpunkte liegen außerhalb des Menüs (siehe useMoreActions). */}
      {show.complete && (
        <ConfirmAction
          {...more.dialog("complete")}
          title="Veranstaltung abschließen?"
          description="Sie gilt als durchgeführt. Danach sind keine Anmeldungen mehr möglich; Helferstunden lassen sich weiter dokumentieren."
          confirmLabel="Abschließen"
          action={() => completeEventAction({ id })}
          successMessage="Veranstaltung abgeschlossen."
          onSuccess={refresh}
        />
      )}
      {show.duplicate && <DuplicateDialog id={id} {...more.dialog("duplicate")} />}
      {show.archive && (
        <ConfirmAction
          {...more.dialog("archive")}
          title="Veranstaltung archivieren?"
          description="Sie verschwindet aus den normalen Listen und dem Kalender, bleibt aber erhalten."
          confirmLabel="Archivieren"
          action={() => archiveEventAction({ id })}
          successMessage="Veranstaltung archiviert."
          onSuccess={refresh}
        />
      )}
      {show.restore && (
        <ConfirmAction
          {...more.dialog("restore")}
          title="Veranstaltung wiederherstellen?"
          description="Sie erscheint wieder in den Listen."
          confirmLabel="Wiederherstellen"
          action={() => restoreEventAction({ id })}
          successMessage="Veranstaltung wiederhergestellt."
          onSuccess={refresh}
        />
      )}
      {show.cancel && <CancelDialog id={id} title={title} {...more.dialog("cancel")} />}
      {show.delete && (
        <ConfirmAction
          destructive
          {...more.dialog("delete")}
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
