"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PencilIcon, PlusIcon } from "lucide-react";
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
  FormError,
  SelectField,
  SubmitButton,
  TextField,
  TextareaField,
} from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import {
  createDepartmentAction,
  createGroupAction,
  updateDepartmentAction,
  updateGroupAction,
} from "../actions";
import {
  DEPARTMENT_COLORS,
  departmentSchema,
  groupSchema,
  type DepartmentFormInput,
  type GroupFormInput,
} from "../schemas";

function DepartmentForm({
  id,
  defaults,
  onDone,
}: {
  id?: string;
  defaults: DepartmentFormInput;
  onDone: () => void;
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: departmentSchema,
    defaultValues: defaults,
    action: (values) => (id ? updateDepartmentAction(id, values) : createDepartmentAction(values)),
    successMessage: id ? "Abteilung gespeichert." : "Abteilung angelegt.",
    onSuccess: (data) => {
      onDone();
      if (!id && data && typeof data === "object" && "id" in data)
        router.push(`/abteilungen/${(data as { id: string }).id}`);
      else router.refresh();
    },
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormError message={formError} />
      <TextField form={form} name="name" label="Name" required />
      <TextareaField form={form} name="description" label="Beschreibung" rows={3} />
      <SelectField
        form={form}
        name="color"
        label="Farbe"
        placeholder="Keine"
        options={DEPARTMENT_COLORS.map((c) => ({ value: c.value, label: c.label }))}
        hint="Erscheint als Markierung in Listen und im Kalender."
      />
      <SubmitButton pending={isPending}>{id ? "Speichern" : "Abteilung anlegen"}</SubmitButton>
    </form>
  );
}

export function DepartmentDialog({
  department,
}: {
  department?: { id: string; name: string; description: string | null; color: string | null };
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {/* „Bearbeiten“ ist die Hauptaktion der Abteilungsseite und steht deshalb in der Markenfarbe. */}
      <DialogTrigger asChild>
        {department ? (
          <Button>
            <PencilIcon /> Bearbeiten
          </Button>
        ) : (
          <Button>
            <PlusIcon /> Neue Abteilung
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{department ? "Abteilung bearbeiten" : "Neue Abteilung"}</DialogTitle>
          <DialogDescription>
            Abteilungen gliedern Mitglieder, Veranstaltungen und Verantwortlichkeiten.
          </DialogDescription>
        </DialogHeader>
        <DepartmentForm
          id={department?.id}
          defaults={{
            name: department?.name ?? "",
            description: department?.description ?? "",
            color: department?.color ?? "",
          }}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function GroupForm({
  id,
  departmentId,
  defaults,
  onDone,
}: {
  id?: string;
  departmentId?: string;
  defaults: GroupFormInput;
  onDone: () => void;
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: groupSchema,
    defaultValues: defaults,
    action: (values) =>
      id
        ? updateGroupAction(id, departmentId, values)
        : createGroupAction({ ...values, departmentId }),
    successMessage: id ? "Gruppe gespeichert." : "Gruppe angelegt.",
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });
  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-4">
      <FormError message={formError} />
      <TextField form={form} name="name" label="Name der Gruppe" required />
      <TextareaField form={form} name="description" label="Beschreibung" rows={3} />
      <SubmitButton pending={isPending}>{id ? "Speichern" : "Gruppe anlegen"}</SubmitButton>
    </form>
  );
}

export function GroupDialog({
  departmentId,
  group,
}: {
  departmentId?: string;
  group?: { id: string; name: string; description: string | null };
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {group ? (
          <Button variant="ghost" size="sm">
            <PencilIcon /> Bearbeiten
          </Button>
        ) : (
          <Button variant="outline">
            <PlusIcon /> Neue Gruppe
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{group ? "Gruppe bearbeiten" : "Neue Gruppe"}</DialogTitle>
          <DialogDescription>
            Gruppen und Teams innerhalb einer Abteilung, z. B. Mannschaften oder Arbeitskreise.
          </DialogDescription>
        </DialogHeader>
        <GroupForm
          id={group?.id}
          departmentId={departmentId}
          defaults={{ name: group?.name ?? "", description: group?.description ?? "" }}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
