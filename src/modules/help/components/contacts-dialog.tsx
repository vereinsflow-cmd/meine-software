"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFieldArray } from "react-hook-form";
import { PencilIcon, PlusIcon, TrashIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormError, SubmitButton, TextField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import type { SupportContact } from "@/lib/club-settings";
import { SUPPORT_LIMITS } from "@/lib/support";
import { saveContactsAction } from "../actions";
import { contactsFormSchema } from "../schemas";

/** Ansprechpartner der Hilfeseite bearbeiten (nur Vereinsverwaltung). Alle Mitglieder sehen diese Angaben. */
export function ContactsDialog({ contacts }: { contacts: SupportContact[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: contactsFormSchema,
    defaultValues: {
      contacts: contacts.map((contact) => ({
        name: contact.name,
        role: contact.role ?? "",
        email: contact.email ?? "",
        phone: contact.phone ?? "",
      })),
    },
    action: (values) => saveContactsAction(values),
    successMessage: "Ansprechpartner gespeichert.",
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "contacts" });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PencilIcon /> Ansprechpartner bearbeiten
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Ansprechpartner bearbeiten</DialogTitle>
          <DialogDescription>
            Diese Personen sehen alle Mitglieder unter „Hilfe & Support“. Trage nur Kontaktdaten
            ein, die veröffentlicht werden dürfen (z. B. Vereinsadresse statt privater Handynummer).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormError message={formError} />
          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Noch keine Ansprechpartner. Ohne Einträge zeigt die Hilfeseite die allgemeinen
              Kontaktdaten des Vereins.
            </p>
          )}
          {fields.map((field, index) => (
            <fieldset key={field.id} className="grid gap-3 rounded-lg border p-3">
              <legend className="px-1 text-sm font-medium">Ansprechpartner {index + 1}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  form={form}
                  name={`contacts.${index}.name`}
                  label={`Name (Ansprechpartner ${index + 1})`}
                  required
                />
                <TextField
                  form={form}
                  name={`contacts.${index}.role`}
                  label={`Zuständigkeit (Ansprechpartner ${index + 1})`}
                  placeholder="z. B. Technische Fragen"
                />
                <TextField
                  form={form}
                  name={`contacts.${index}.email`}
                  label={`E-Mail (Ansprechpartner ${index + 1})`}
                  type="email"
                  autoComplete="off"
                />
                <TextField
                  form={form}
                  name={`contacts.${index}.phone`}
                  label={`Telefon (Ansprechpartner ${index + 1})`}
                  type="tel"
                  autoComplete="off"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-fit text-destructive"
                onClick={() => remove(index)}
              >
                <TrashIcon /> Ansprechpartner {index + 1} entfernen
              </Button>
            </fieldset>
          ))}
          <Button
            type="button"
            variant="outline"
            className="w-fit"
            disabled={fields.length >= SUPPORT_LIMITS.contacts}
            onClick={() => append({ name: "", role: "", email: "", phone: "" })}
          >
            <PlusIcon /> Ansprechpartner hinzufügen
          </Button>
          <SubmitButton pending={isPending}>Speichern</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
