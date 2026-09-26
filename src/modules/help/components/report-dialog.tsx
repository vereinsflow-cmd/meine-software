"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareWarningIcon } from "lucide-react";
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
import { SUPPORT_CATEGORIES, SUPPORT_CATEGORY_LABEL, SUPPORT_LIMITS } from "@/lib/support";
import { createTicketAction } from "../actions";
import { ticketFormSchema } from "../schemas";

/**
 * Meldung an die Vereinsverwaltung: Fehler, Frage oder Vorschlag. `pagePath` ist die Seite, von der die Person kam
 * (wird mitgeschickt, damit die Verwaltung weiß, wo es passierte).
 */
export function ReportDialog({ pagePath }: { pagePath: string | null }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: ticketFormSchema,
    defaultValues: { category: "PROBLEM", subject: "", description: "", pagePath: pagePath ?? "" },
    action: (values) => createTicketAction(values),
    successMessage: "Danke! Deine Meldung wurde an die Vereinsverwaltung gesendet.",
    resetOnSuccess: true,
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <MessageSquareWarningIcon /> Problem melden
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Problem melden</DialogTitle>
          <DialogDescription>
            Beschreibe, was passiert ist oder was du wissen möchtest. Die Vereinsverwaltung wird
            benachrichtigt und antwortet dir hier.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormError message={formError} />
          <SelectField
            form={form}
            name="category"
            label="Worum geht es?"
            options={SUPPORT_CATEGORIES.map((value) => ({
              value,
              label: SUPPORT_CATEGORY_LABEL[value],
            }))}
            required
          />
          <TextField
            form={form}
            name="subject"
            label="Kurze Überschrift"
            required
            hint="z. B. „Ich kann mich nicht in die Schicht eintragen“"
          />
          <TextareaField
            form={form}
            name="description"
            label="Beschreibung"
            rows={6}
            required
            hint={`Was hast du getan, was ist passiert und was hast du erwartet? (höchstens ${SUPPORT_LIMITS.description} Zeichen)`}
          />
          {pagePath && (
            <p className="text-sm text-muted-foreground">
              Betroffene Seite: <code className="rounded bg-muted px-1 py-0.5">{pagePath}</code>{" "}
              (wird mitgesendet)
            </p>
          )}
          <SubmitButton pending={isPending} pendingLabel="Wird gesendet …">
            Meldung senden
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
