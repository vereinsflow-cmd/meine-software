"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
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
import { FormError, SelectField, SubmitButton, TextField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import {
  addAssignmentAction,
  deleteAssignmentAction,
  endAssignmentAction,
  updateMemberFinanceAction,
} from "../actions";
import {
  ASSIGNMENT_KIND_LABEL,
  ASSIGNMENT_KINDS,
  assignmentEndSchema,
  assignmentSchema,
  memberFinanceSchema,
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
} from "../schemas";

type Option = { value: string; label: string };

/** „Zahler und Zahlweg“: wer zahlt (selbst oder z. B. ein Elternteil) und wie. */
export function MemberFinanceDialog({
  memberId,
  memberName,
  defaults,
  payers,
}: {
  memberId: string;
  memberName: string;
  defaults: {
    payerMemberId: string;
    paymentMethod: (typeof PAYMENT_METHODS)[number];
    note: string;
  };
  /** Mögliche Zahler (andere Mitglieder). */
  payers: Option[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Zahler und Zahlweg
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Zahler und Zahlweg</DialogTitle>
          <DialogDescription>
            Wer den Beitrag von {memberName} bezahlt – bei Kindern oft ein Elternteil – und wie.
          </DialogDescription>
        </DialogHeader>
        <MemberFinanceForm
          memberId={memberId}
          defaults={defaults}
          payers={payers}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function MemberFinanceForm({
  memberId,
  defaults,
  payers,
  onDone,
}: {
  memberId: string;
  defaults: {
    payerMemberId: string;
    paymentMethod: (typeof PAYMENT_METHODS)[number];
    note: string;
  };
  payers: Option[];
  onDone: () => void;
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: memberFinanceSchema,
    defaultValues: { memberId, ...defaults },
    action: updateMemberFinanceAction,
    successMessage: "Gespeichert.",
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
      <SelectField
        form={form}
        name="payerMemberId"
        label="Wer zahlt?"
        placeholder="Das Mitglied selbst"
        options={payers}
      />
      <SelectField
        form={form}
        name="paymentMethod"
        label="Zahlweg"
        hint="Bei einem anderen Zahler gilt dessen Zahlweg."
        options={PAYMENT_METHODS.map((value) => ({ value, label: PAYMENT_METHOD_LABEL[value] }))}
        required
      />
      <TextField form={form} name="note" label="Notiz" hint="freiwillig" />
      <FormError message={formError} />
      <SubmitButton pending={isPending} className="justify-self-start">
        Speichern
      </SubmitButton>
    </form>
  );
}

/** „Ermäßigung oder Befreiung“: Prozent, beitragsfrei, fester Betrag oder feste Beitragsart – mit Zeitraum und Grund. */
export function AssignmentDialog({
  memberId,
  memberName,
  feeTypes,
  today,
}: {
  memberId: string;
  memberName: string;
  feeTypes: Option[];
  today: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Ermäßigung oder Befreiung
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Beitrag anpassen</DialogTitle>
          <DialogDescription>
            Für {memberName}. Gilt ab dem gewählten Tag; frühere Zeiträume bleiben, wie sie waren.
          </DialogDescription>
        </DialogHeader>
        <AssignmentForm
          memberId={memberId}
          feeTypes={feeTypes}
          today={today}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function AssignmentForm({
  memberId,
  feeTypes,
  today,
  onDone,
}: {
  memberId: string;
  feeTypes: Option[];
  today: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: assignmentSchema,
    defaultValues: {
      memberId,
      kind: "DISCOUNT_PERCENT",
      feeTypeId: "",
      percent: "",
      amount: "",
      validFrom: today,
      validTo: "",
      reason: "",
    },
    action: addAssignmentAction,
    successMessage: "Gespeichert.",
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });
  const kind = useWatch({ control: form.control, name: "kind" });
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
      <SelectField
        form={form}
        name="kind"
        label="Was gilt?"
        options={ASSIGNMENT_KINDS.map((value) => ({ value, label: ASSIGNMENT_KIND_LABEL[value] }))}
        required
      />
      {kind === "DISCOUNT_PERCENT" && (
        <TextField
          form={form}
          name="percent"
          label="Ermäßigung in %"
          inputMode="decimal"
          placeholder="50"
          required
          inputClassName="sm:max-w-32"
        />
      )}
      {kind === "FIXED_AMOUNT" && (
        <TextField
          form={form}
          name="amount"
          label="Betrag je Monat in €"
          inputMode="decimal"
          placeholder="8,00"
          required
          inputClassName="sm:max-w-40"
        />
      )}
      {kind === "ASSIGN" && (
        <SelectField
          form={form}
          name="feeTypeId"
          label="Beitragsart"
          hint="Statt der üblichen Regeln (Alter, Status) gilt immer diese."
          placeholder="Bitte wählen"
          options={feeTypes}
          required
        />
      )}
      <div className="grid grid-cols-2 gap-4">
        <TextField form={form} name="validFrom" label="Ab" type="date" required />
        <TextField form={form} name="validTo" label="Bis" type="date" hint="leer = unbefristet" />
      </div>
      {kind !== "ASSIGN" && (
        <TextField
          form={form}
          name="reason"
          label="Grund"
          placeholder="z. B. Übungsleiterin, Härtefall, Schüler"
          required
        />
      )}
      <FormError message={formError} />
      <SubmitButton pending={isPending} className="justify-self-start">
        Speichern
      </SubmitButton>
    </form>
  );
}

/** Regel beenden: letzter Tag, an dem sie gilt. */
export function EndAssignmentDialog({
  id,
  text,
  today,
}: {
  id: string;
  text: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2" aria-label={`${text} beenden`}>
          Beenden
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Regel beenden</DialogTitle>
          <DialogDescription>„{text}“ gilt bis einschließlich zum gewählten Tag.</DialogDescription>
        </DialogHeader>
        <EndAssignmentForm id={id} today={today} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EndAssignmentForm({
  id,
  today,
  onDone,
}: {
  id: string;
  today: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: assignmentEndSchema,
    defaultValues: { id, validTo: today },
    action: endAssignmentAction,
    successMessage: "Gespeichert.",
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
      <TextField
        form={form}
        name="validTo"
        label="Letzter Tag"
        type="date"
        required
        inputClassName="sm:max-w-48"
      />
      <FormError message={formError} />
      <SubmitButton pending={isPending} className="justify-self-start">
        Beenden
      </SubmitButton>
    </form>
  );
}

/** Regel ganz entfernen – nur am Tag der Eingabe oder solange sie noch nicht gilt (z. B. falsches Mitglied erwischt). */
export function RemoveAssignmentButton({ id, text }: { id: string; text: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      trigger={
        <Button variant="ghost" size="sm" className="h-7 px-2" aria-label={`${text} entfernen`}>
          Entfernen
        </Button>
      }
      title="Regel entfernen?"
      description={`„${text}“ wird entfernt, als hätte es sie nie gegeben. Das geht nur am Tag der Eingabe oder solange sie noch nicht gilt.`}
      confirmLabel="Entfernen"
      destructive
      action={() => deleteAssignmentAction({ id })}
      successMessage="Regel entfernt."
      onSuccess={() => router.refresh()}
    />
  );
}
