"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useController, type Control } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  FormError,
  SelectField,
  SubmitButton,
  TextField,
  TextareaField,
} from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { MEMBER_STATUS_LABEL, options } from "@/lib/labels";
import { createMemberAction, updateMemberAction } from "../actions";
import { memberFormSchema, type MemberFormInput } from "../schemas";

interface DepartmentOption {
  id: string;
  name: string;
  assignable: boolean;
  isActive: boolean;
}

/**
 * Zuordnung zu Abteilungen. Nicht zuweisbare Abteilungen (z. B. fremde Abteilungen für einen Abteilungsleiter)
 * bleiben sichtbar, sind aber gesperrt. Das Festlegen von Abteilungsleitern erfordert die Berechtigung dazu.
 */
function DepartmentAssignment({
  control,
  departments,
  canSetLeaders,
}: {
  control: Control<MemberFormInput>;
  departments: DepartmentOption[];
  canSetLeaders: boolean;
}) {
  const ids = useController({ control, name: "departmentIds" });
  const leaders = useController({ control, name: "leaderDepartmentIds" });
  const selected = new Set(ids.field.value);
  const leading = new Set(leaders.field.value);

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(id);
    else {
      next.delete(id);
      // Wer die Abteilung verlässt, ist dort auch kein Leiter mehr.
      leaders.field.onChange([...leading].filter((l) => l !== id));
    }
    ids.field.onChange([...next]);
  };
  const toggleLeader = (id: string, checked: boolean) => {
    const next = new Set(leading);
    if (checked) next.add(id);
    else next.delete(id);
    leaders.field.onChange([...next]);
  };

  if (departments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Es sind noch keine Abteilungen angelegt.</p>
    );
  }

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">Abteilungen</legend>
      {departments.map((department) => (
        <div key={department.id} className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <div className="flex items-center gap-2.5">
            <input
              id={`dept-${department.id}`}
              type="checkbox"
              className="size-4 accent-primary"
              checked={selected.has(department.id)}
              disabled={!department.assignable}
              onChange={(event) => toggle(department.id, event.target.checked)}
            />
            <Label htmlFor={`dept-${department.id}`} className="font-normal">
              {department.name}
              {!department.isActive && (
                <span className="text-muted-foreground"> (deaktiviert)</span>
              )}
            </Label>
          </div>
          {canSetLeaders && selected.has(department.id) && (
            <div className="flex items-center gap-2.5">
              <input
                id={`lead-${department.id}`}
                type="checkbox"
                className="size-4 accent-primary"
                checked={leading.has(department.id)}
                onChange={(event) => toggleLeader(department.id, event.target.checked)}
              />
              <Label
                htmlFor={`lead-${department.id}`}
                className="font-normal text-muted-foreground"
              >
                Abteilungsleiter
              </Label>
            </div>
          )}
        </div>
      ))}
      {ids.fieldState.error && (
        <p role="alert" className="text-sm text-destructive">
          {ids.fieldState.error.message}
        </p>
      )}
    </fieldset>
  );
}

export function MemberForm({
  mode,
  memberId,
  defaultValues,
  departments,
  editable,
}: {
  mode: "create" | "edit";
  memberId?: string;
  defaultValues: MemberFormInput;
  departments: DepartmentOption[];
  /** Welche Feldgruppen der Benutzer für dieses Mitglied sehen und ändern darf. */
  editable: { contact: boolean; private: boolean; leaders: boolean };
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: memberFormSchema,
    defaultValues,
    action: (values) =>
      mode === "create" ? createMemberAction(values) : updateMemberAction(memberId!, values),
    successMessage: mode === "create" ? "Mitglied angelegt." : "Änderungen gespeichert.",
    onSuccess: (data) => {
      const id = mode === "create" ? (data as { id: string }).id : memberId!;
      router.push(`/mitglieder/${id}`);
      router.refresh();
    },
  });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6">
      <FormError message={formError} />

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Stammdaten
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <TextField form={form} name="firstName" label="Vorname" autoComplete="off" required />
          <TextField form={form} name="lastName" label="Nachname" autoComplete="off" required />
          <TextField
            form={form}
            name="memberNumber"
            label="Mitgliedsnummer"
            hint="Eindeutig im Verein, z. B. M-0042."
          />
          <SelectField
            form={form}
            name="status"
            label="Status"
            options={options(MEMBER_STATUS_LABEL)}
            required
          />
          <TextField
            form={form}
            name="clubFunction"
            label="Funktion im Verein"
            hint="z. B. Kassenwart, Trainer"
          />
          <div className="hidden sm:block" />
          <TextField form={form} name="joinedAt" label="Eintrittsdatum" type="date" />
          <TextField form={form} name="leftAt" label="Austrittsdatum" type="date" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>
            Abteilungen
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DepartmentAssignment
            control={form.control}
            departments={departments}
            canSetLeaders={editable.leaders}
          />
        </CardContent>
      </Card>

      {editable.contact && (
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              Kontakt und Anschrift
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <TextField
              form={form}
              name="email"
              label="E-Mail-Adresse"
              type="email"
              autoComplete="off"
            />
            <TextField form={form} name="phone" label="Telefon" type="tel" autoComplete="off" />
            <TextField
              form={form}
              name="street"
              label="Straße und Hausnummer"
              className="sm:col-span-2"
            />
            <TextField form={form} name="postalCode" label="PLZ" inputMode="numeric" />
            <TextField form={form} name="city" label="Ort" />
            <TextField form={form} name="country" label="Land" hint="Standard: DE" />
          </CardContent>
        </Card>
      )}

      {editable.private && (
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              Sensible Angaben
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <TextField
              form={form}
              name="birthDate"
              label="Geburtsdatum"
              type="date"
              className="sm:max-w-xs"
              hint="Wird für Altersgrenzen bei Helferschichten und Jugendarbeit genutzt."
            />
            <TextareaField
              form={form}
              name="internalNotes"
              label="Interne Notizen"
              hint="Nur für berechtigte Personen sichtbar. Bitte nur notieren, was für die Vereinsarbeit nötig ist (Datensparsamkeit)."
            />
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild variant="outline">
          <Link href={mode === "edit" && memberId ? `/mitglieder/${memberId}` : "/mitglieder"}>
            Abbrechen
          </Link>
        </Button>
        <SubmitButton pending={isPending}>
          {mode === "create" ? "Mitglied anlegen" : "Änderungen speichern"}
        </SubmitButton>
      </div>
    </form>
  );
}
