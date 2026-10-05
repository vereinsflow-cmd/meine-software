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
import { ConfirmAction } from "@/components/shared/confirm-dialog";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/shared/form-fields";
import { IconButton } from "@/components/shared/icon-button";
import { useActionForm } from "@/hooks/use-action-form";
import {
  archiveAccountAction,
  archiveCategoryAction,
  createAccountAction,
  createCategoryAction,
  updateAccountAction,
  updateCategoryAction,
} from "../closing-actions";
import { SPHERE_LABEL } from "../ledger-format";
import {
  accountCreateSchema,
  accountUpdateSchema,
  categoryCreateSchema,
  categoryUpdateSchema,
} from "../ledger-schemas";

const SPHERE_OPTIONS = (
  ["NON_PROFIT", "ASSET_MANAGEMENT", "PURPOSE_OPERATION", "COMMERCIAL"] as const
).map((value) => ({ value, label: SPHERE_LABEL[value] }));

/** „Konto hinzufügen“: Name, Art, Bank, Anfangsbestand (nur solange der Beginn des Kassenbuchs offen ist). */
export function AddAccountDialog({ openingAllowed }: { openingAllowed: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PlusIcon /> Konto hinzufügen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Konto hinzufügen</DialogTitle>
          <DialogDescription>
            Zum Beispiel ein Tagesgeldkonto oder die Kasse der Jugendabteilung.
          </DialogDescription>
        </DialogHeader>
        <AddAccountForm openingAllowed={openingAllowed} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AddAccountForm({
  openingAllowed,
  onDone,
}: {
  openingAllowed: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: accountCreateSchema,
    defaultValues: { name: "", kind: "BANK", bankName: "", opening: "" },
    action: createAccountAction,
    successMessage: "Konto angelegt.",
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
      <TextField form={form} name="name" label="Name" required />
      <SelectField
        form={form}
        name="kind"
        label="Art"
        options={[
          { value: "BANK", label: "Bankkonto" },
          { value: "CASH", label: "Barkasse" },
          { value: "OTHER", label: "Sonstiges Konto" },
        ]}
        required
      />
      <TextField form={form} name="bankName" label="Bank oder Beschreibung" hint="freiwillig" />
      {openingAllowed ? (
        <TextField
          form={form}
          name="opening"
          label="Anfangsbestand in €"
          inputMode="decimal"
          placeholder="0,00"
          hint="Stand am Beginn des Kassenbuchs."
          inputClassName="sm:max-w-48"
        />
      ) : (
        <p className="text-sm text-muted-foreground">
          Das neue Konto beginnt mit 0,00 €. Geld kommt per Umbuchung oder Einnahme darauf.
        </p>
      )}
      <FormError message={formError} />
      <SubmitButton pending={isPending} className="justify-self-start">
        Konto anlegen
      </SubmitButton>
    </form>
  );
}

/** Konto umbenennen bzw. Bank ändern. */
export function EditAccountDialog({
  account,
}: {
  account: { id: string; name: string; bankName: string | null };
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <IconButton label={`Konto ${account.name} bearbeiten`} size="icon-sm">
          <PencilIcon />
        </IconButton>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Konto bearbeiten</DialogTitle>
          <DialogDescription>
            Der neue Name gilt überall – auch bei früheren Buchungen.
          </DialogDescription>
        </DialogHeader>
        <EditAccountForm account={account} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EditAccountForm({
  account,
  onDone,
}: {
  account: { id: string; name: string; bankName: string | null };
  onDone: () => void;
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: accountUpdateSchema,
    defaultValues: { id: account.id, name: account.name, bankName: account.bankName ?? "" },
    action: updateAccountAction,
    successMessage: "Gespeichert.",
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
      <TextField form={form} name="name" label="Name" required />
      <TextField form={form} name="bankName" label="Bank oder Beschreibung" hint="freiwillig" />
      <FormError message={formError} />
      <SubmitButton pending={isPending} className="justify-self-start">
        Speichern
      </SubmitButton>
    </form>
  );
}

/** Archivieren bzw. wieder aktivieren (Konto oder Kategorie) – mit Rückfrage beim Archivieren. */
export function ArchiveButton({
  kind,
  id,
  name,
  archived,
}: {
  kind: "account" | "category";
  id: string;
  name: string;
  archived: boolean;
}) {
  const router = useRouter();
  const action = kind === "account" ? archiveAccountAction : archiveCategoryAction;
  if (archived)
    return (
      <ConfirmAction
        trigger={
          <Button variant="ghost" size="sm">
            Wieder aktivieren
          </Button>
        }
        title={`„${name}“ wieder aktivieren?`}
        description="Danach lässt es sich beim Buchen wieder auswählen."
        confirmLabel="Aktivieren"
        action={() => action({ id, archived: false })}
        successMessage="Wieder aktiv."
        onSuccess={() => router.refresh()}
      />
    );
  return (
    <ConfirmAction
      trigger={
        <Button variant="ghost" size="sm">
          Archivieren
        </Button>
      }
      title={`„${name}“ archivieren?`}
      description={
        kind === "account"
          ? "Das Konto verschwindet aus der Auswahl beim Buchen; frühere Buchungen bleiben. Geht nur, wenn der Kontostand 0,00 € ist."
          : "Die Kategorie verschwindet aus der Auswahl beim Buchen; frühere Buchungen behalten sie."
      }
      confirmLabel="Archivieren"
      action={() => action({ id, archived: true })}
      successMessage="Archiviert."
      onSuccess={() => router.refresh()}
    />
  );
}

/** „Kategorie hinzufügen“: Name, Einnahme oder Ausgabe (steht danach fest), steuerlicher Bereich. */
export function AddCategoryDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <PlusIcon /> Kategorie hinzufügen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kategorie hinzufügen</DialogTitle>
          <DialogDescription>
            Ob Einnahme oder Ausgabe, steht danach fest. Den Bereich kannst du später ändern.
          </DialogDescription>
        </DialogHeader>
        <AddCategoryForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function AddCategoryForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: categoryCreateSchema,
    defaultValues: { name: "", direction: "EXPENSE", sphere: "NON_PROFIT", hint: "" },
    action: createCategoryAction,
    successMessage: "Kategorie angelegt.",
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
      <TextField
        form={form}
        name="name"
        label="Name"
        required
        placeholder="z. B. Trainerlizenzen"
      />
      <SelectField
        form={form}
        name="direction"
        label="Art"
        options={[
          { value: "EXPENSE", label: "Ausgabe" },
          { value: "INCOME", label: "Einnahme" },
        ]}
        required
      />
      <SelectField form={form} name="sphere" label="Bereich" options={SPHERE_OPTIONS} required />
      <TextField
        form={form}
        name="hint"
        label="Kurzer Hinweis"
        hint="freiwillig – steht beim Buchen hinter dem Namen"
      />
      <FormError message={formError} />
      <SubmitButton pending={isPending} className="justify-self-start">
        Kategorie anlegen
      </SubmitButton>
    </form>
  );
}

/** Kategorie umbenennen, Bereich ändern (gilt für neue Buchungen), Hinweis. */
export function EditCategoryDialog({
  category,
}: {
  category: {
    id: string;
    name: string;
    sphere: "NON_PROFIT" | "ASSET_MANAGEMENT" | "PURPOSE_OPERATION" | "COMMERCIAL";
    hint: string | null;
  };
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <IconButton label={`Kategorie ${category.name} bearbeiten`} size="icon-sm">
          <PencilIcon />
        </IconButton>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Kategorie bearbeiten</DialogTitle>
          <DialogDescription>
            Ein geänderter Bereich gilt für neue Buchungen – frühere behalten ihren.
          </DialogDescription>
        </DialogHeader>
        <EditCategoryForm category={category} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function EditCategoryForm({
  category,
  onDone,
}: {
  category: {
    id: string;
    name: string;
    sphere: "NON_PROFIT" | "ASSET_MANAGEMENT" | "PURPOSE_OPERATION" | "COMMERCIAL";
    hint: string | null;
  };
  onDone: () => void;
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: categoryUpdateSchema,
    defaultValues: {
      id: category.id,
      name: category.name,
      sphere: category.sphere,
      hint: category.hint ?? "",
    },
    action: updateCategoryAction,
    successMessage: "Gespeichert.",
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
      <TextField form={form} name="name" label="Name" required />
      <SelectField form={form} name="sphere" label="Bereich" options={SPHERE_OPTIONS} required />
      <TextField form={form} name="hint" label="Kurzer Hinweis" hint="freiwillig" />
      <FormError message={formError} />
      <SubmitButton pending={isPending} className="justify-self-start">
        Speichern
      </SubmitButton>
    </form>
  );
}
