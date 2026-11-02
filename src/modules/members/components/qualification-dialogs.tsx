"use client";

import { useState } from "react";
import { useWatch } from "react-hook-form";
import { PlusIcon } from "lucide-react";
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
import {
  FormError,
  SelectField,
  SubmitButton,
  TextareaField,
  TextField,
} from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import {
  addQualificationAction,
  removeQualificationAction,
  updateQualificationAction,
} from "../actions";
import {
  QUALIFICATION_KIND_LABEL,
  QUALIFICATION_KINDS,
  qualificationSchema,
  type QualificationFormInput,
} from "../qualification-schemas";

const EMPTY: QualificationFormInput = {
  kind: "INSTRUCTOR_LICENSE",
  title: "",
  number: "",
  issuedOn: "",
  validUntil: "",
  issuer: "",
  note: "",
};

/**
 * Qualifikation hinzufügen bzw. (mit `qualification`) bearbeiten – ein Fenster mit denselben Feldern. Daten sind
 * Kalendertage („JJJJ-MM-TT“ aus dem Datumsfeld), geprüft wird im Browser und noch einmal im Dienst.
 */
export function QualificationDialog({
  memberId,
  memberName,
  qualification,
}: {
  memberId: string;
  memberName: string;
  qualification?: { id: string; name: string; values: QualificationFormInput };
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {qualification ? (
          <Button
            variant="ghost"
            size="sm"
            className="px-2"
            aria-label={`${qualification.name} bearbeiten`}
          >
            Bearbeiten
          </Button>
        ) : (
          <Button variant="outline" size="sm">
            <PlusIcon aria-hidden="true" /> Qualifikation hinzufügen
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {qualification ? "Qualifikation bearbeiten" : "Qualifikation hinzufügen"}
          </DialogTitle>
          <DialogDescription>
            Für {memberName}. Mit „Gültig bis“ zeigt die Liste rechtzeitig, wann sie abläuft.
          </DialogDescription>
        </DialogHeader>
        <QualificationForm
          memberId={memberId}
          qualification={qualification}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function QualificationForm({
  memberId,
  qualification,
  onDone,
}: {
  memberId: string;
  qualification?: { id: string; values: QualificationFormInput };
  onDone: () => void;
}) {
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: qualificationSchema,
    defaultValues: qualification?.values ?? EMPTY,
    action: (values) =>
      qualification
        ? updateQualificationAction(qualification.id, values)
        : addQualificationAction(memberId, values),
    successMessage: "Gespeichert.",
    onSuccess: () => {
      onDone();
    },
  });
  const kind = useWatch({ control: form.control, name: "kind" });
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
      <SelectField
        form={form}
        name="kind"
        label="Art"
        options={QUALIFICATION_KINDS.map((value) => ({
          value,
          label: QUALIFICATION_KIND_LABEL[value],
        }))}
        required
      />
      <TextField
        form={form}
        name="title"
        label="Bezeichnung"
        placeholder={kind === "OTHER" ? "z. B. Kampfrichter Leichtathletik" : "z. B. C-Lizenz"}
        hint={kind === "OTHER" ? undefined : "freiwillig"}
        required={kind === "OTHER"}
      />
      <TextField form={form} name="number" label="Nummer" hint="freiwillig" />
      <div className="grid grid-cols-2 gap-4">
        <TextField form={form} name="issuedOn" label="Ausgestellt am" type="date" />
        <TextField
          form={form}
          name="validUntil"
          label="Gültig bis"
          type="date"
          hint="leer = unbefristet"
        />
      </div>
      <TextField
        form={form}
        name="issuer"
        label="Aussteller"
        placeholder="z. B. Landessportbund, DLRG, DRK"
      />
      <TextareaField
        form={form}
        name="note"
        label="Notiz"
        hint="freiwillig – bitte keine Gesundheitsangaben"
        rows={3}
      />
      <FormError message={formError} />
      <SubmitButton pending={isPending} className="justify-self-start">
        Speichern
      </SubmitButton>
    </form>
  );
}

/** Qualifikation entfernen – mit Rückfrage. Im Änderungsverlauf bleibt vermerkt, dass es sie gab. */
export function RemoveQualificationButton({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmAction
      trigger={
        <Button variant="ghost" size="sm" className="px-2" aria-label={`${name} entfernen`}>
          Entfernen
        </Button>
      }
      title="Qualifikation entfernen?"
      description={`„${name}“ wird aus der Liste entfernt. Im Änderungsverlauf bleibt vermerkt, dass es sie gab.`}
      confirmLabel="Entfernen"
      destructive
      action={() => removeQualificationAction({ id })}
      successMessage="Qualifikation entfernt."
    />
  );
}
