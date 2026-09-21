"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, PowerIcon, PowerOffIcon } from "lucide-react";
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
import { FormError, SubmitButton, TextField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { createClubAction, setClubStatusAction } from "../actions";
import { createClubSchema } from "../schemas";

export function CreateClubDialog() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: createClubSchema,
    defaultValues: { name: "", slug: "", adminEmail: "" },
    action: createClubAction,
    successMessage: "Verein angelegt. Der erste Administrator wurde eingeladen.",
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
          <PlusIcon /> Verein anlegen
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neuen Verein anlegen</DialogTitle>
          <DialogDescription>
            Der Verein erhält die Standardrollen. Der erste Administrator bekommt eine Einladung per
            E-Mail.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormError message={formError} />
          <TextField form={form} name="name" label="Vereinsname" required />
          <TextField
            form={form}
            name="slug"
            label="Kürzel"
            required
            hint="Eindeutig, nur Kleinbuchstaben, Ziffern und Bindestriche – z. B. tsv-musterstadt."
          />
          <TextField
            form={form}
            name="adminEmail"
            label="E-Mail-Adresse des ersten Administrators"
            type="email"
            required
          />
          <SubmitButton pending={isPending}>Verein anlegen</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ClubStatusButton({
  clubId,
  name,
  active,
}: {
  clubId: string;
  name: string;
  active: boolean;
}) {
  const router = useRouter();
  return (
    <ConfirmAction
      destructive={active}
      trigger={
        <Button size="sm" variant="outline">
          {active ? <PowerOffIcon /> : <PowerIcon />} {active ? "Deaktivieren" : "Reaktivieren"}
        </Button>
      }
      title={active ? "Verein deaktivieren?" : "Verein reaktivieren?"}
      description={
        active
          ? `Alle Mitglieder von „${name}“ verlieren sofort den Zugang. Die Daten bleiben unverändert erhalten und der Verein lässt sich jederzeit reaktivieren.`
          : `„${name}“ und seine Mitglieder erhalten wieder Zugang.`
      }
      confirmLabel={active ? "Deaktivieren" : "Reaktivieren"}
      action={() => setClubStatusAction({ clubId, active: !active })}
      successMessage={active ? "Verein deaktiviert." : "Verein reaktiviert."}
      onSuccess={() => router.refresh()}
    />
  );
}
