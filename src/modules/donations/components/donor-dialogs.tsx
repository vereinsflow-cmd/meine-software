"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useWatch } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/shared/form-fields";
import { PostalCodeCity } from "@/components/shared/postal-code-city";
import { useActionForm } from "@/hooks/use-action-form";
import type { DonorKind } from "@/generated/prisma/enums";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { updateDonorAction } from "../actions";
import { DONOR_KIND_LABEL } from "../format";
import { DONOR_KINDS, donorUpdateSchema, type DonorUpdateInput } from "../schemas";

/** Was das Fenster über einen externen Spender braucht (Liste „Spender“, `DonorRowDto`). */
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
 * Name, Art und Anschrift einer anderen Person, Firma, Stiftung oder eines Vereins ändern (Liste „Spender“: „⋯“ →
 * „Anschrift ändern“, „Adresse eintragen“ und `?bearbeiten=<id>`). Mitglieder ändert man beim Mitglied – Name und Anschrift
 * kommen von dort.
 */
export function DonorDialog({
  donor,
  trigger,
  open: openProp,
  onOpenChange,
  onCloseAutoFocus,
}: {
  donor: DonorDialogDonor;
  /** Eigener Auslöser; ohne ihn steuert `open` das Fenster (z. B. aus dem Menü „⋯“). */
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-lg"
        onOpenAutoFocus={(event) => {
          // Gleich bei der Straße weiter – im ersten Feld stünde der Name markiert und ginge beim Tippen verloren.
          const content = event.currentTarget;
          const street =
            content instanceof HTMLElement
              ? content.querySelector<HTMLInputElement>('input[name="street"]')
              : null;
          if (!street) return;
          event.preventDefault();
          street.focus();
        }}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>Spender ändern</DialogTitle>
          <DialogDescription>
            Name und Anschrift stehen so auf der Zuwendungsbestätigung. Mitglieder änderst du beim
            Mitglied.
          </DialogDescription>
        </DialogHeader>
        <DonorForm donor={donor} onBusy={setBusy} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

/** „Adresse eintragen“ unter „Adresse fehlt“ (Spalte Anschrift): öffnet dasselbe Fenster wie „⋯“ → „Anschrift ändern“. */
export function DonorAddressButton({ donor }: { donor: DonorDialogDonor }) {
  return (
    <DonorDialog
      donor={donor}
      trigger={
        <button
          type="button"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Adresse eintragen<span className="sr-only"> für {donor.name}</span>
        </button>
      }
    />
  );
}

function DonorForm({
  donor,
  onBusy,
  onDone,
}: {
  donor: DonorDialogDonor;
  onBusy: (busy: boolean) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: donorUpdateSchema,
    defaultValues: {
      id: donor.id,
      kind: donor.kind,
      name: donor.name,
      street: donor.street ?? "",
      postalCode: donor.postalCode ?? "",
      city: donor.city ?? "",
      country: donor.country ?? "DE",
    } satisfies DonorUpdateInput,
    onBusy,
    action: updateDonorAction,
    successMessage: "Spender gespeichert.",
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
          Speichern
        </SubmitButton>
      </div>
    </form>
  );
}
