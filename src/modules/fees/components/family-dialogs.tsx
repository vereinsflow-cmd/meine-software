"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import { EllipsisIcon, PlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NativeSelect } from "@/components/ui/native-select";
import { ConfirmAction } from "@/components/shared/confirm-dialog";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/shared/form-fields";
import { useMoreActions } from "@/components/shared/more-actions";
import { useActionForm } from "@/hooks/use-action-form";
import {
  addFamilyMemberAction,
  createFamilyAction,
  deleteFamilyMemberAction,
  dissolveFamilyAction,
  endFamilyMemberAction,
  updateFamilyAction,
} from "../actions";
import {
  familyCreateSchema,
  familyDissolveSchema,
  familyMemberAddSchema,
  familyMemberEndSchema,
  familyUpdateSchema,
} from "../schemas";

type Option = { value: string; label: string };

export interface FamilyFormOptions {
  feeTypes: Option[];
  /** Alle wählbaren Mitglieder („Nachname, Vorname“). */
  members: Option[];
  /** Mögliche Zahler (ohne eigenen abweichenden Zahler). */
  payers: Option[];
}

const PAYER_HINT =
  "Zahlt den Familienbeitrag und – solange nichts anderes eingestellt ist – auch die übrigen Beiträge der Familienmitglieder.";

/** „Familie anlegen“: Name, Familienbeitrag, Mitglieder, Zahler, ab wann. */
export function CreateFamilyDialog({
  options,
  firstOfMonth,
}: {
  options: FamilyFormOptions;
  firstOfMonth: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon /> Familie anlegen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Familie anlegen</DialogTitle>
          <DialogDescription>
            Statt der einzelnen Grundbeiträge zahlt die Familie den Familienbeitrag – an einen
            Zahler.
          </DialogDescription>
        </DialogHeader>
        <CreateFamilyForm
          options={options}
          firstOfMonth={firstOfMonth}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function CreateFamilyForm({
  options,
  firstOfMonth,
  onDone,
}: {
  options: FamilyFormOptions;
  firstOfMonth: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: familyCreateSchema,
    defaultValues: {
      name: "",
      feeTypeId: options.feeTypes.length === 1 ? options.feeTypes[0]!.value : "",
      payerMemberId: "",
      memberIds: [],
      validFrom: firstOfMonth,
    },
    action: createFamilyAction,
    successMessage: "Familie angelegt.",
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });
  const memberIds = useWatch({ control: form.control, name: "memberIds" }) ?? [];
  const labelOf = new Map(options.members.map((m) => [m.value, m.label]));
  const membersError = form.formState.errors.memberIds?.message;
  const pickerId = useId();
  const pickerRef = useRef<HTMLSelectElement>(null);
  const { submitCount } = form.formState;
  // Nach dem Absenden mit Fehler bei den Mitgliedern: dorthin (das Feld ist kein registriertes Eingabefeld).
  useEffect(() => {
    if (submitCount > 0 && form.getFieldState("memberIds").error) pickerRef.current?.focus();
  }, [form, submitCount]);

  function addMember(id: string) {
    if (!id || memberIds.includes(id)) return;
    const next = [...memberIds, id];
    form.setValue("memberIds", next, { shouldDirty: true, shouldValidate: !!membersError });
    // Erstes Mitglied: Name und Zahler vorschlagen („Familie Krüger“, Sophie zahlt).
    if (memberIds.length === 0) {
      const lastName = labelOf.get(id)?.split(",")[0]?.trim();
      if (lastName && !form.getValues("name")) form.setValue("name", `Familie ${lastName}`);
      if (!form.getValues("payerMemberId") && options.payers.some((p) => p.value === id))
        form.setValue("payerMemberId", id);
    }
  }
  function removeMember(id: string) {
    form.setValue(
      "memberIds",
      memberIds.filter((m) => m !== id),
      { shouldDirty: true },
    );
  }

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">
          Mitglieder{" "}
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        </legend>
        {memberIds.length > 0 && (
          <ul className="grid gap-1" aria-label="Ausgewählte Mitglieder">
            {memberIds.map((id) => (
              <li
                key={id}
                className="flex items-center justify-between gap-2 rounded-md bg-muted/60 py-0.5 pr-0.5 pl-3 text-sm"
              >
                {labelOf.get(id) ?? id}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${labelOf.get(id) ?? "Mitglied"} entfernen`}
                  onClick={() => removeMember(id)}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <NativeSelect
          ref={pickerRef}
          aria-label="Mitglied hinzufügen"
          value=""
          onChange={(event) => addMember(event.target.value)}
          aria-invalid={membersError ? true : undefined}
          aria-describedby={membersError ? `${pickerId}-error` : undefined}
        >
          <option value="">Mitglied hinzufügen …</option>
          {options.members
            .filter((m) => !memberIds.includes(m.value))
            .map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
        </NativeSelect>
        {membersError && (
          <p id={`${pickerId}-error`} role="alert" className="text-sm text-destructive">
            {membersError}
          </p>
        )}
      </fieldset>
      <TextField form={form} name="name" label="Name" required placeholder="z. B. Familie Krüger" />
      <SelectField
        form={form}
        name="payerMemberId"
        label="Wer zahlt?"
        hint={PAYER_HINT}
        placeholder="Bitte wählen"
        options={options.payers}
        required
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          form={form}
          name="feeTypeId"
          label="Familienbeitrag"
          placeholder="Bitte wählen"
          options={options.feeTypes}
          required
        />
        <TextField form={form} name="validFrom" label="Gilt ab" type="date" required />
      </div>
      <FormError message={formError} />
      <SubmitButton pending={isPending} className="justify-self-start">
        Familie anlegen
      </SubmitButton>
    </form>
  );
}

export interface FamilyRow {
  id: string;
  name: string;
  feeTypeId: string;
  feeTypeName: string;
  payerMemberId: string;
  payerName: string;
  /** Mitglieder, die heute oder künftig dabei sind (nicht noch einmal hinzufügen). */
  memberIds: string[];
}

/** „⋯“ einer Familie: bearbeiten, Mitglied hinzufügen, auflösen (aufgelöst: nur bearbeiten, z. B. den Zahler). */
export function FamilyActions({
  family,
  options,
  today,
  dissolved = false,
}: {
  family: FamilyRow;
  options: FamilyFormOptions;
  today: string;
  dissolved?: boolean;
}) {
  const { triggerRef, show, dialog } = useMoreActions<"edit" | "add" | "dissolve">();
  const edit = dialog("edit");
  const add = dialog("add");
  const dissolve = dialog("dissolve");
  // Der bisherige Zahler bleibt wählbar, auch wenn er nicht mehr in der Liste der möglichen Zahler steht.
  const payers = options.payers.some((p) => p.value === family.payerMemberId)
    ? options.payers
    : [
        ...options.payers,
        {
          value: family.payerMemberId,
          label:
            options.members.find((m) => m.value === family.payerMemberId)?.label ??
            `${family.payerName} (nicht mehr aktiv)`,
        },
      ];
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon-sm"
            aria-label={`Weitere Aktionen für ${family.name}`}
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          collisionPadding={16}
          className="min-w-56 [&>[data-slot=dropdown-menu-item]]:py-2"
        >
          {!dissolved && (
            <DropdownMenuItem onSelect={() => show("add")}>Mitglied hinzufügen</DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => show("edit")}>Bearbeiten</DropdownMenuItem>
          {!dissolved && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => show("dissolve")}>
                Familie auflösen
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={edit.open} onOpenChange={edit.onOpenChange}>
        <DialogContent onCloseAutoFocus={edit.onCloseAutoFocus}>
          <DialogHeader>
            <DialogTitle>{family.name} bearbeiten</DialogTitle>
            <DialogDescription>
              Mitglieder fügst du über „Mitglied hinzufügen“ hinzu bzw. trägst sie in der Liste aus.
            </DialogDescription>
          </DialogHeader>
          <EditFamilyForm
            family={family}
            options={{ ...options, payers }}
            onDone={() => edit.onOpenChange(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={add.open} onOpenChange={add.onOpenChange}>
        <DialogContent onCloseAutoFocus={add.onCloseAutoFocus}>
          <DialogHeader>
            <DialogTitle>Mitglied hinzufügen</DialogTitle>
            <DialogDescription>
              Ab dem gewählten Tag gehört es zu „{family.name}“; frühere Zeiträume bleiben, wie sie
              waren.
            </DialogDescription>
          </DialogHeader>
          <AddMemberForm
            familyId={family.id}
            members={options.members.filter((m) => !family.memberIds.includes(m.value))}
            today={today}
            onDone={() => add.onOpenChange(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={dissolve.open} onOpenChange={dissolve.onOpenChange}>
        <DialogContent onCloseAutoFocus={dissolve.onCloseAutoFocus}>
          <DialogHeader>
            <DialogTitle>{family.name} auflösen</DialogTitle>
            <DialogDescription>
              Bis zum gewählten Tag zahlt die Familie noch den Familienbeitrag, danach zahlt jedes
              Mitglied einzeln. Frühere Zeiträume bleiben, wie sie waren.
            </DialogDescription>
          </DialogHeader>
          <DateForm
            schema={familyDissolveSchema}
            id={family.id}
            today={today}
            action={dissolveFamilyAction}
            submitLabel="Familie auflösen"
            successMessage="Familie aufgelöst."
            onDone={() => dissolve.onOpenChange(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditFamilyForm({
  family,
  options,
  onDone,
}: {
  family: FamilyRow;
  options: FamilyFormOptions;
  onDone: () => void;
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: familyUpdateSchema,
    defaultValues: {
      id: family.id,
      name: family.name,
      feeTypeId: family.feeTypeId,
      payerMemberId: family.payerMemberId,
    },
    action: updateFamilyAction,
    successMessage: "Gespeichert.",
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });
  // Der bisherige Familienbeitrag bleibt wählbar, auch wenn er archiviert ist.
  const feeTypes = options.feeTypes.some((t) => t.value === family.feeTypeId)
    ? options.feeTypes
    : [
        ...options.feeTypes,
        { value: family.feeTypeId, label: `${family.feeTypeName} (archiviert)` },
      ];
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
      <TextField form={form} name="name" label="Name" required />
      <SelectField
        form={form}
        name="payerMemberId"
        label="Wer zahlt?"
        hint={PAYER_HINT}
        options={options.payers}
        required
      />
      <SelectField
        form={form}
        name="feeTypeId"
        label="Familienbeitrag"
        options={feeTypes}
        required
      />
      <FormError message={formError} />
      <SubmitButton pending={isPending} className="justify-self-start">
        Speichern
      </SubmitButton>
    </form>
  );
}

function AddMemberForm({
  familyId,
  members,
  today,
  onDone,
}: {
  familyId: string;
  members: Option[];
  today: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: familyMemberAddSchema,
    defaultValues: { familyId, memberId: "", validFrom: today },
    action: addFamilyMemberAction,
    successMessage: "Hinzugefügt.",
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
      <SelectField
        form={form}
        name="memberId"
        label="Mitglied"
        placeholder="Bitte wählen"
        options={members}
        required
      />
      <TextField
        form={form}
        name="validFrom"
        label="Ab"
        type="date"
        required
        inputClassName="sm:max-w-48"
      />
      <FormError message={formError} />
      <SubmitButton pending={isPending} className="justify-self-start">
        Hinzufügen
      </SubmitButton>
    </form>
  );
}

/** Ein Datum („letzter Tag“) für Austragen bzw. Auflösen. */
function DateForm({
  schema,
  id,
  today,
  action,
  submitLabel,
  successMessage,
  onDone,
}: {
  schema: typeof familyMemberEndSchema | typeof familyDissolveSchema;
  id: string;
  today: string;
  action: typeof endFamilyMemberAction | typeof dissolveFamilyAction;
  submitLabel: string;
  successMessage: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema,
    defaultValues: { id, validTo: today },
    action,
    successMessage,
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
        {submitLabel}
      </SubmitButton>
    </form>
  );
}

/** Mitglied austragen: letzter Tag in der Familie. */
export function EndFamilyMemberDialog({
  id,
  name,
  familyName,
  today,
}: {
  id: string;
  name: string;
  familyName: string;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2" aria-label={`${name} austragen`}>
          Austragen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{name} austragen</DialogTitle>
          <DialogDescription>
            Bis einschließlich zum gewählten Tag gehört {name} zu „{familyName}“, danach zahlt{" "}
            {name.split(" ")[0]} einzeln.
          </DialogDescription>
        </DialogHeader>
        <DateForm
          schema={familyMemberEndSchema}
          id={id}
          today={today}
          action={endFamilyMemberAction}
          submitLabel="Austragen"
          successMessage="Ausgetragen."
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Versehentlich hinzugefügt: ganz entfernen (nur heute bzw. solange es noch nicht gilt). */
export function RemoveFamilyMemberButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      trigger={
        <Button variant="ghost" size="sm" className="h-7 px-2" aria-label={`${name} entfernen`}>
          Entfernen
        </Button>
      }
      title={`${name} entfernen?`}
      description="Der Eintrag wird entfernt, als hätte es ihn nie gegeben. Das geht nur am Tag der Eingabe oder solange er noch nicht gilt."
      confirmLabel="Entfernen"
      destructive
      action={() => deleteFamilyMemberAction({ id })}
      successMessage="Entfernt."
      onSuccess={() => router.refresh()}
    />
  );
}
