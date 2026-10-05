"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { executeFeeRunAction, revertFeeRunAction, voidChargeAction } from "../actions";
import { chargeVoidSchema, feeRunRevertSchema } from "../schemas";

/**
 * Schritt 3 „Erstellen“: Rückfrage mit Anzahl und Summe, dann genau die gezeigte Vorschau erstellen. Hat sich die Vorschau
 * inzwischen geändert, sagt das der Server – die Seite lädt dann neu.
 */
export function CreateRunButton({
  periodStart,
  dueDate,
  inputHash,
  count,
  totalText,
  periodLabel,
}: {
  periodStart: string;
  dueDate: string;
  inputHash: string;
  count: number;
  totalText: string;
  periodLabel: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const label = `${count} ${count === 1 ? "Beitrag" : "Beiträge"} erstellen`;
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button>{label}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}?</AlertDialogTitle>
          <AlertDialogDescription>
            Für {periodLabel} entstehen {count} {count === 1 ? "Beitrag" : "Beiträge"} über{" "}
            {totalText}, jeweils mit Nummer. Rückgängig machen geht, solange noch nichts bezahlt
            ist.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Abbrechen</AlertDialogCancel>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await executeFeeRunAction({ periodStart, dueDate, inputHash });
                if (!result.ok) {
                  toast.error(result.error.message);
                  setOpen(false);
                  router.refresh();
                  return;
                }
                toast.success(result.data.existed ? "Schon erstellt." : "Beiträge erstellt.");
                setOpen(false);
                router.push(`/finanzen/beitraege/laeufe/${result.data.id}`);
              })
            }
          >
            {pending ? "Wird erstellt …" : label}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** „Beitragslauf rückgängig“: alle Beiträge werden gestrichen (mit Grund), die Tage sind wieder frei. */
export function RevertRunDialog({ id, label }: { id: string; label: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: feeRunRevertSchema,
    defaultValues: { id, reason: "" },
    action: revertFeeRunAction,
    successMessage: "Beitragslauf rückgängig gemacht.",
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Beitragslauf rückgängig</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{label} rückgängig machen?</DialogTitle>
          <DialogDescription>
            Alle Beiträge dieses Laufs werden gestrichen; ihre Nummern bleiben als „gestrichen“
            sichtbar. Danach lässt sich der Zeitraum neu erstellen.
          </DialogDescription>
        </DialogHeader>
        <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
          <TextField
            form={form}
            name="reason"
            label="Grund"
            required
            placeholder="z. B. falscher Betrag bei den Passiven"
          />
          <FormError message={formError} />
          <SubmitButton pending={isPending} variant="destructive" className="justify-self-start">
            Rückgängig machen
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** „Beitrag streichen“ – nur offen und unbezahlt, mit Grund. */
export function VoidChargeDialog({
  id,
  number,
  variant = "outline",
}: {
  id: string;
  number: string;
  variant?: "outline" | "ghost";
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: chargeVoidSchema,
    defaultValues: { id, reason: "" },
    action: voidChargeAction,
    successMessage: "Beitrag gestrichen.",
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={variant}
          size={variant === "ghost" ? "sm" : "default"}
          aria-label={`Beitrag ${number} streichen`}
        >
          Streichen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Beitrag {number} streichen?</DialogTitle>
          <DialogDescription>
            Der Beitrag gilt dann als nicht erhoben; seine Nummer bleibt als „gestrichen“ sichtbar.
            Ein neuer Beitragslauf für den Zeitraum würde ihn neu berechnen.
          </DialogDescription>
        </DialogHeader>
        <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
          <TextField
            form={form}
            name="reason"
            label="Grund"
            required
            placeholder="z. B. doppelt erfasst"
          />
          <FormError message={formError} />
          <SubmitButton pending={isPending} variant="destructive" className="justify-self-start">
            Streichen
          </SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}
