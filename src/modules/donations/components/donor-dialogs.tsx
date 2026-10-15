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
import {
  FormError,
  SelectField,
  SubmitButton,
  TextField,
} from "@/components/shared/form-fields";
import { PostalCodeCity } from "@/components/shared/postal-code-city";
import { useActionForm } from "@/hooks/use-action-form";
import type { DonorKind } from "@/generated/prisma/enums";
import type { ActionResult } from "@/lib/action-result";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import {
  createDonorAction,
  deleteDonorAction,
  restrictDonorAction,
  updateDonorAction,
} from "../actions";
import { DONOR_KIND_LABEL } from "../format";
import { DONOR_KINDS, donorUpdateSchema, donorSchema, type DonorUpdateInput } from "../schemas";
import { ReasonDialog } from "./form-parts";

/** Was die Fenster über einen externen Spender brauchen (Liste „Spender“, `DonorRowDto`). */
export interface DonorDialogDonor {
  id: string;
  kind: DonorKind;
  name: string;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  /** ISO-Code, leer = Deutschland. */
  country: string | null;
}

/**
 * Andere Person, Firma, Stiftung oder Verein anlegen bzw. Name und Anschrift ändern (Liste „Spender“, auch als Ziel von
 * „Adresse eintragen“). Mitglieder ändert man beim Mitglied – Name und Anschrift kommen von dort.
 */
export function DonorDialog({
  donor,
  trigger,
  triggerLabel,
  open: openProp,
  onOpenChange,
  onCloseAutoFocus,
  onSaved,
}: {
  /** Ohne Angabe: neuen Spender anlegen. */
  donor?: DonorDialogDonor;
  /** Eigener Auslöser (nur aus Client-Komponenten); sonst ein Knopf mit `triggerLabel`. */
  trigger?: React.ReactNode;
  triggerLabel?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  onSaved?: () => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      {openProp === undefined && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button variant={donor ? "outline" : "default"}>
              {triggerLabel ?? (donor ? "Anschrift ändern" : "Spender anlegen")}
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{donor ? "Spender ändern" : "Spender anlegen"}</DialogTitle>
          <DialogDescription>
            Name und Anschrift stehen so auf der Zuwendungsbestätigung. Mitglieder änderst du beim
            Mitglied.
          </DialogDescription>
        </DialogHeader>
        <DonorForm
          donor={donor}
          onBusy={setBusy}
          onDone={() => {
            onSaved?.();
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function DonorForm({
  donor,
  onBusy,
  onDone,
}: {
  donor?: DonorDialogDonor;
  onBusy: (busy: boolean) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    // Beim Anlegen gibt es noch keine Kennung; sonst dasselbe Schema wie auf dem Server.
    schema: donor ? donorUpdateSchema : (donorSchema as unknown as typeof donorUpdateSchema),
    defaultValues: {
      id: donor?.id ?? "",
      kind: donor?.kind ?? "PERSON",
      name: donor?.name ?? "",
      street: donor?.street ?? "",
      postalCode: donor?.postalCode ?? "",
      city: donor?.city ?? "",
      country: donor?.country ?? "DE",
    } satisfies DonorUpdateInput,
    onBusy,
    action: async (values): Promise<ActionResult<unknown>> =>
      donor ? updateDonorAction(values) : createDonorAction(values),
    successMessage: donor ? "Spender gespeichert." : "Spender angelegt.",
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });
  const [postalCode, city, country] = useWatch({
    control: form.control,
    name: ["postalCode", "city", "country"],
  });
  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
      <TextField
        form={form}
        name="name"
        label="Name"
        placeholder="z. B. Autohaus Brinkmann GmbH oder Erika Muster"
        hint="So, wie er auf der Zuwendungsbestätigung stehen soll."
        autoComplete="off"
        required
        className="sm:col-span-2"
      />
      <SelectField
        form={form}
        name="kind"
        label="Art"
        options={DONOR_KINDS.map((value) => ({ value, label: DONOR_KIND_LABEL[value] }))}
        required
      />
      <SelectField form={form} name="country" label="Land" options={COUNTRY_OPTIONS} />
      <TextField
        form={form}
        name="street"
        label="Straße und Hausnummer"
        autoComplete="off"
        className="sm:col-span-2"
      />
      <TextField
        form={form}
        name="postalCode"
        label="PLZ"
        inputMode="numeric"
        autoComplete="off"
        inputClassName="sm:max-w-48"
      />
      <TextField form={form} name="city" label="Ort" autoComplete="off" />
      <PostalCodeCity
        postalCode={postalCode}
        city={city}
        enabled={!country || country === "DE"}
        onCity={(value, { picked }) => {
          form.setValue("city", value, {
            shouldDirty: true,
            shouldValidate: form.formState.isSubmitted,
          });
          if (picked) requestAnimationFrame(() => form.setFocus("city"));
        }}
      />
      <p className="text-sm text-muted-foreground sm:col-span-2">
        Ohne Straße, PLZ und Ort lässt sich keine Zuwendungsbestätigung ausstellen.
      </p>
      <div className="grid gap-3 sm:col-span-2">
        <FormError message={formError} />
        <SubmitButton pending={isPending} className="w-full sm:w-auto sm:justify-self-end">
          {donor ? "Speichern" : "Spender anlegen"}
        </SubmitButton>
      </div>
    </form>
  );
}

/**
 * Spender sperren (Art. 18 DSGVO, z. B. auf Wunsch): keine neuen Spenden und keine Zuwendungsbestätigungen mehr. Die
 * bisherigen Spenden bleiben gespeichert, solange die Aufbewahrungspflicht läuft.
 */
export function RestrictDonorDialog({
  donor,
  open,
  onOpenChange,
  onCloseAutoFocus,
  onDone,
}: {
  donor: { id: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  onDone?: () => void;
}) {
  return (
    <ReasonDialog
      open={open}
      onOpenChange={onOpenChange}
      onCloseAutoFocus={onCloseAutoFocus}
      title={`${donor.name} sperren?`}
      description="Danach lassen sich für diesen Spender keine Spenden und keine Zuwendungsbestätigungen mehr eintragen. Die bisherigen Spenden bleiben 10 Jahre gespeichert – so lange muss der Verein sie aufbewahren."
      placeholder="z. B. auf Wunsch des Spenders"
      confirmLabel="Sperren"
      destructive
      action={(reason) => restrictDonorAction({ id: donor.id, reason })}
      successMessage="Spender gesperrt."
      onDone={onDone}
    />
  );
}

/** Spender löschen – nur ohne Spenden (sonst sind es Aufzeichnungen, die der Verein aufbewahren muss; dann sperren). */
export function DeleteDonorDialog({
  donor,
  open,
  onOpenChange,
  onCloseAutoFocus,
  onDone,
}: {
  donor: { id: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  onDone?: () => void;
}) {
  const router = useRouter();
  return (
    <ConfirmAction
      open={open}
      onOpenChange={onOpenChange}
      onCloseAutoFocus={onCloseAutoFocus}
      title={`${donor.name} löschen?`}
      description="Der Spender hat keine Spenden – Name und Anschrift werden gelöscht."
      confirmLabel="Löschen"
      destructive
      action={() => deleteDonorAction({ id: donor.id })}
      successMessage="Spender gelöscht."
      onSuccess={() => {
        onDone?.();
        router.refresh();
      }}
    />
  );
}
