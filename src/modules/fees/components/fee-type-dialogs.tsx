"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWatch, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { ArrowDownIcon, ArrowUpIcon, EllipsisIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
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
import { ConfirmAction } from "@/components/shared/confirm-dialog";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/shared/form-fields";
import { useMoreActions } from "@/components/shared/more-actions";
import { useActionForm } from "@/hooks/use-action-form";
import { centsToInput } from "@/lib/money";
import {
  addFeeRateAction,
  archiveFeeTypeAction,
  createFeeTypeAction,
  deleteFeeRateAction,
  moveFeeTypeAction,
  updateFeeTypeAction,
} from "../actions";
import {
  FEE_INTERVAL_LABEL,
  FEE_INTERVALS,
  FEE_KIND_LABEL,
  FEE_KINDS,
  feeRateSchema,
  feeTypeCreateSchema,
  feeTypeUpdateSchema,
  kindWithoutRules,
  MEMBER_STATUSES,
  type FeeTypeCreateInput,
} from "../schemas";

const STATUS_LABEL: Record<(typeof MEMBER_STATUSES)[number], string> = {
  ACTIVE: "Aktive",
  PASSIVE: "Passive",
  HONORARY: "Ehrenmitglieder",
  BLOCKED: "Gesperrte",
};

const INTERVAL_OPTIONS = FEE_INTERVALS.map((value) => ({
  value,
  label: FEE_INTERVAL_LABEL[value].replace(/^im /, "pro "),
}));

type Departments = { value: string; label: string }[];

/** Status-Auswahl als Kästchen; nichts angekreuzt = aktive, passive und gesperrte Mitglieder. */
function StatusChoice({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: (typeof MEMBER_STATUSES)[number][]) => void;
}) {
  return (
    <fieldset className="grid gap-1.5">
      <legend className="mb-1 text-sm font-medium">Für wen?</legend>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {MEMBER_STATUSES.map((status) => (
          <label key={status} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded accent-primary"
              checked={value.includes(status)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...(value as (typeof MEMBER_STATUSES)[number][]), status]
                    : (value as (typeof MEMBER_STATUSES)[number][]).filter((s) => s !== status),
                )
              }
            />
            {STATUS_LABEL[status]}
          </label>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Nichts angekreuzt: aktive, passive und gesperrte Mitglieder.
      </p>
    </fieldset>
  );
}

/** Familienbeitrag: ab wie vielen zahlenden Familienmitgliedern er statt der einzelnen Grundbeiträge gilt. */
function FamilyMinField<T extends FieldValues>({ form }: { form: UseFormReturn<T> }) {
  return (
    <TextField
      form={form}
      name={"familyMinMembers" as Path<T>}
      label="Gilt ab wie vielen Mitgliedern?"
      inputMode="numeric"
      required
      inputClassName="sm:max-w-24"
      hint="Sobald so viele Familienmitglieder einen Grundbeitrag zahlen würden, zahlt die Familie stattdessen diesen Betrag – sonst jedes einzeln."
    />
  );
}

/** „Beitragsart anlegen“: Art, Name, für wen (Status, Alter, Abteilung), erster Betrag ab einem Tag. */
export function CreateFeeTypeDialog({
  departments,
  today,
}: {
  departments: Departments;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon /> Beitragsart anlegen
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Beitragsart anlegen</DialogTitle>
          <DialogDescription>
            Zum Beispiel „Erwachsene“, „Jugend bis 17 Jahre“ oder „Passive“. Wer zu welcher
            Beitragsart gehört, ergibt sich aus Status, Alter und Abteilung.
          </DialogDescription>
        </DialogHeader>
        <CreateFeeTypeForm departments={departments} today={today} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CreateFeeTypeForm({
  departments,
  today,
  onDone,
}: {
  departments: Departments;
  today: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const initial: FeeTypeCreateInput = {
    kind: "BASE",
    name: "",
    departmentId: "",
    statuses: [],
    minAge: "",
    maxAge: "",
    familyMinMembers: "3",
    description: "",
    amount: "",
    interval: "MONTHLY",
    validFrom: `${today.slice(0, 4)}-01-01`,
  };
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: feeTypeCreateSchema,
    defaultValues: initial,
    action: createFeeTypeAction,
    successMessage: "Beitragsart angelegt.",
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });
  const kind = useWatch({ control: form.control, name: "kind" });
  const statuses = useWatch({ control: form.control, name: "statuses" }) ?? [];
  const noRules = kindWithoutRules(kind);
  // Aufnahmegebühr ist einmalig; bei den anderen Arten gibt es „einmalig“ nicht.
  useEffect(() => {
    if (kindWithoutRules(kind)) {
      // Ausgeblendete Felder leeren – sonst würden sie unsichtbar mitgespeichert.
      form.setValue("departmentId", "");
      form.setValue("statuses", []);
      form.setValue("minAge", "");
      form.setValue("maxAge", "");
    }
    if (kind === "ADMISSION") form.setValue("interval", "ONCE");
    else if (form.getValues("interval") === "ONCE") form.setValue("interval", "MONTHLY");
  }, [form, kind]);
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
      <SelectField
        form={form}
        name="kind"
        label="Art"
        options={FEE_KINDS.map((value) => ({ value, label: FEE_KIND_LABEL[value] }))}
        required
      />
      <TextField
        form={form}
        name="name"
        label="Name"
        required
        placeholder={kind === "FAMILY" ? "z. B. Familienbeitrag" : "z. B. Erwachsene"}
      />
      {kind === "FAMILY" && <FamilyMinField form={form} />}
      {!noRules && (
        <>
          <StatusChoice
            value={statuses}
            onChange={(next) => form.setValue("statuses", next, { shouldDirty: true })}
          />
          <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
            <TextField form={form} name="minAge" label="Alter von" inputMode="numeric" />
            <TextField form={form} name="maxAge" label="Alter bis" inputMode="numeric" />
          </div>
        </>
      )}
      {!noRules && (
        <SelectField
          form={form}
          name="departmentId"
          label={kind === "ADDITIONAL" ? "Abteilung" : "Nur für die Abteilung"}
          placeholder={kind === "ADDITIONAL" ? "Bitte wählen" : "Alle Abteilungen"}
          options={departments}
          required={kind === "ADDITIONAL"}
        />
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField
          form={form}
          name="amount"
          label="Betrag in €"
          inputMode="decimal"
          placeholder="12,00"
          required
        />
        {kind !== "ADMISSION" && (
          <SelectField
            form={form}
            name="interval"
            label="Rhythmus"
            options={INTERVAL_OPTIONS}
            required
          />
        )}
        <TextField form={form} name="validFrom" label="Gilt ab" type="date" required />
      </div>
      <TextField
        form={form}
        name="description"
        label="Notiz"
        hint="freiwillig, z. B. Beschluss der Mitgliederversammlung"
      />
      <FormError message={formError} />
      <SubmitButton pending={isPending} className="justify-self-start">
        Beitragsart anlegen
      </SubmitButton>
    </form>
  );
}

export interface FeeTypeRow {
  id: string;
  name: string;
  kind: "BASE" | "ADDITIONAL" | "ADMISSION" | "FAMILY";
  departmentId: string | null;
  statuses: string[];
  minAge: number | null;
  maxAge: number | null;
  familyMinMembers: number | null;
  description: string | null;
  archived: boolean;
  /** Sätze, die sich zurücknehmen lassen (noch nicht gültig oder heute eingegeben, und nicht der einzige). */
  removableRates: { id: string; label: string }[];
  currentInterval: "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY" | "ONCE";
  currentAmountCents: number | null;
}

/** „⋯“ einer Beitragsart: Regeln bearbeiten, neuer Betrag ab …, Reihenfolge, archivieren. */
export function FeeTypeActions({
  type,
  departments,
  today,
  canMoveUp,
  canMoveDown,
}: {
  type: FeeTypeRow;
  departments: Departments;
  today: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const router = useRouter();
  const { triggerRef, show, dialog } = useMoreActions<"edit" | "rate" | "archive">();
  const edit = dialog("edit");
  const rate = dialog("rate");
  const archive = dialog("archive");

  async function move(direction: "up" | "down") {
    const result = await moveFeeTypeAction({ id: type.id, direction });
    if (!result.ok) toast.error(result.error.message);
    router.refresh();
  }
  async function dropRate(id: string, label: string) {
    const result = await deleteFeeRateAction({ id });
    if (!result.ok) toast.error(result.error.message);
    else toast.success(`Betrag ab ${label} zurückgenommen.`);
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon-sm"
            aria-label={`Weitere Aktionen für ${type.name}`}
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          collisionPadding={16}
          className="min-w-56 [&>[data-slot=dropdown-menu-item]]:py-2"
        >
          {!type.archived && (
            <>
              <DropdownMenuItem onSelect={() => show("rate")}>Neuer Betrag ab …</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => show("edit")}>Regeln bearbeiten</DropdownMenuItem>
              {type.removableRates.map((rate) => (
                <DropdownMenuItem key={rate.id} onSelect={() => dropRate(rate.id, rate.label)}>
                  Betrag ab {rate.label} zurücknehmen
                </DropdownMenuItem>
              ))}
              {type.kind === "BASE" && (canMoveUp || canMoveDown) && <DropdownMenuSeparator />}
              {type.kind === "BASE" && canMoveUp && (
                <DropdownMenuItem onSelect={() => move("up")}>
                  <ArrowUpIcon /> Früher prüfen
                </DropdownMenuItem>
              )}
              {type.kind === "BASE" && canMoveDown && (
                <DropdownMenuItem onSelect={() => move("down")}>
                  <ArrowDownIcon /> Später prüfen
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem onSelect={() => show("archive")}>
            {type.archived ? "Wieder aktivieren" : "Archivieren"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={edit.open} onOpenChange={edit.onOpenChange}>
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
          onCloseAutoFocus={edit.onCloseAutoFocus}
        >
          <DialogHeader>
            <DialogTitle>{type.name}: Regeln</DialogTitle>
            <DialogDescription>
              Gilt ab sofort für alle Zeiträume, die noch nicht abgerechnet sind. Beträge änderst du
              über „Neuer Betrag ab …“.
            </DialogDescription>
          </DialogHeader>
          <EditFeeTypeForm
            type={type}
            departments={departments}
            onDone={() => edit.onOpenChange(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={rate.open} onOpenChange={rate.onOpenChange}>
        <DialogContent onCloseAutoFocus={rate.onCloseAutoFocus}>
          <DialogHeader>
            <DialogTitle>{type.name}: neuer Betrag</DialogTitle>
            <DialogDescription>
              Der bisherige Betrag gilt bis zum Vortag weiter – frühere Zeiträume bleiben, wie sie
              waren.
            </DialogDescription>
          </DialogHeader>
          <RateForm type={type} today={today} onDone={() => rate.onOpenChange(false)} />
        </DialogContent>
      </Dialog>

      <ConfirmAction
        open={archive.open}
        onOpenChange={archive.onOpenChange}
        onCloseAutoFocus={archive.onCloseAutoFocus}
        title={type.archived ? `„${type.name}“ wieder aktivieren?` : `„${type.name}“ archivieren?`}
        description={
          type.archived
            ? "Danach wird sie wieder berechnet; als Grundbeitrag kommt sie ans Ende der Reihenfolge."
            : "Sie wird dann nicht mehr berechnet. Frühere Zeiträume bleiben, wie sie waren."
        }
        confirmLabel={type.archived ? "Aktivieren" : "Archivieren"}
        action={() => archiveFeeTypeAction({ id: type.id, archived: !type.archived })}
        successMessage={type.archived ? "Wieder aktiv." : "Archiviert."}
        onSuccess={() => router.refresh()}
      />
    </>
  );
}

function EditFeeTypeForm({
  type,
  departments,
  onDone,
}: {
  type: FeeTypeRow;
  departments: Departments;
  onDone: () => void;
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: feeTypeUpdateSchema,
    defaultValues: {
      id: type.id,
      name: type.name,
      departmentId: type.departmentId ?? "",
      statuses: type.statuses as (typeof MEMBER_STATUSES)[number][],
      minAge: type.minAge === null ? "" : String(type.minAge),
      maxAge: type.maxAge === null ? "" : String(type.maxAge),
      familyMinMembers: type.familyMinMembers === null ? "" : String(type.familyMinMembers),
      description: type.description ?? "",
    },
    action: updateFeeTypeAction,
    successMessage: "Gespeichert.",
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });
  const statuses = useWatch({ control: form.control, name: "statuses" }) ?? [];
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
      <TextField form={form} name="name" label="Name" required />
      {type.kind === "FAMILY" && <FamilyMinField form={form} />}
      {!kindWithoutRules(type.kind) && (
        <>
          <StatusChoice
            value={statuses}
            onChange={(next) => form.setValue("statuses", next, { shouldDirty: true })}
          />
          <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
            <TextField form={form} name="minAge" label="Alter von" inputMode="numeric" />
            <TextField form={form} name="maxAge" label="Alter bis" inputMode="numeric" />
          </div>
          <SelectField
            form={form}
            name="departmentId"
            label={type.kind === "ADDITIONAL" ? "Abteilung" : "Nur für die Abteilung"}
            placeholder={type.kind === "ADDITIONAL" ? "Bitte wählen" : "Alle Abteilungen"}
            options={departments}
            required={type.kind === "ADDITIONAL"}
          />
        </>
      )}
      <TextField form={form} name="description" label="Notiz" hint="freiwillig" />
      <FormError message={formError} />
      <SubmitButton pending={isPending} className="justify-self-start">
        Speichern
      </SubmitButton>
    </form>
  );
}

function RateForm({
  type,
  today,
  onDone,
}: {
  type: FeeTypeRow;
  today: string;
  onDone: () => void;
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: feeRateSchema,
    defaultValues: {
      feeTypeId: type.id,
      amount: type.currentAmountCents === null ? "" : centsToInput(type.currentAmountCents),
      interval: type.currentInterval,
      validFrom: today,
    },
    action: addFeeRateAction,
    successMessage: "Neuer Betrag gespeichert.",
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField form={form} name="amount" label="Betrag in €" inputMode="decimal" required />
        {type.kind !== "ADMISSION" && (
          <SelectField
            form={form}
            name="interval"
            label="Rhythmus"
            options={INTERVAL_OPTIONS}
            required
          />
        )}
        <TextField form={form} name="validFrom" label="Gilt ab" type="date" required />
      </div>
      <FormError message={formError} />
      <SubmitButton pending={isPending} className="justify-self-start">
        Betrag speichern
      </SubmitButton>
    </form>
  );
}
