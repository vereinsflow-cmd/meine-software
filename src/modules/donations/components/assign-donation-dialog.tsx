"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useWatch } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FormError,
  SubmitButton,
  TextareaField,
  TextField,
} from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { centsToInput } from "@/lib/money";
import { assignDonationAction } from "../actions";
import { loadAssignDonationAction } from "../dialog-actions";
import type { AssignDonationSetup } from "../dialog-data";
import { assignDonationSchema, type AssignDonationInput } from "../schemas";
import {
  BookingFacts,
  ChoiceField,
  DialogLoadError,
  DialogLoading,
  DonorChoice,
  NEW_DONOR,
  PAYMENT_CHOICES,
  RECEIPT_WISH_CHOICES,
  ReceiptPreview,
  donorAddressKnownComplete,
  useDialogData,
  withoutDonorPlaceholder,
} from "./form-parts";

/**
 * „Als Spende kennzeichnen“ (Kassenbuch „⋯“, „Spender eintragen“ in „Alle Spenden“): ordnet eine Spenden-Buchung ohne
 * Spender zu. Betrag, Tag, Konto, Abteilung und Veranstaltung kommen aus der Buchung; wählbar sind Spender, ein fester
 * Zweck als Text, wie das Geld kam und der Wunsch zur Bestätigung. Der Spender ist vorbelegt (Mitglied an der Buchung bzw.
 * passender Name). Geht auch in abgeschlossenen Monaten – gebucht wird nichts.
 */
export function AssignDonationDialog({
  ledgerLineId,
  open,
  onOpenChange,
  onCloseAutoFocus,
  onSaved,
}: {
  /** Die Zeile der Kategorie „Spenden“ (eine Buchung kann mehrere haben). */
  ledgerLineId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  onSaved?: () => void;
}) {
  // Während des Speicherns lässt sich das Fenster nicht schließen.
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <AssignBody
          ledgerLineId={ledgerLineId}
          onBusy={setBusy}
          onDone={() => {
            onSaved?.();
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function AssignBody({
  ledgerLineId,
  onBusy,
  onDone,
}: {
  ledgerLineId: string;
  onBusy: (busy: boolean) => void;
  onDone: () => void;
}) {
  const { state, retry } = useDialogData(() => loadAssignDonationAction({ ledgerLineId }));
  return (
    <>
      <DialogHeader>
        <DialogTitle>Als Spende kennzeichnen</DialogTitle>
        <DialogDescription>
          {state.status === "ready"
            ? `„${state.data.defaults.line.description}“ – trage ein, von wem das Geld kam. Dann kann der Verein eine Zuwendungsbestätigung ausstellen.`
            : "Die Buchung wird geladen."}
        </DialogDescription>
      </DialogHeader>
      {state.status === "loading" && <DialogLoading />}
      {state.status === "error" && <DialogLoadError message={state.message} onRetry={retry} />}
      {state.status === "ready" && (
        <AssignForm setup={state.data} onBusy={onBusy} onDone={onDone} />
      )}
    </>
  );
}

function AssignForm({
  setup,
  onBusy,
  onDone,
}: {
  setup: AssignDonationSetup;
  onBusy: (busy: boolean) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const { defaults, options } = setup;
  const { line, suggestion } = defaults;
  const initial: AssignDonationInput = {
    ledgerLineId: line.id,
    donorMode: suggestion.donorMode,
    memberId: suggestion.memberId ?? "",
    // Neuer Spender mit Namen aus der Buchung: In der Auswahl steht dann „Neu eintragen …“.
    donorId:
      suggestion.donorMode === "NEW" && options.donors.length > 0
        ? NEW_DONOR
        : (suggestion.donorId ?? ""),
    donorKind: "PERSON",
    donorName: suggestion.donorName ?? "",
    street: "",
    postalCode: "",
    city: "",
    country: "DE",
    anonymousLabel: "",
    purposeText: "",
    paymentMethod: defaults.paymentMethod,
    receiptWish: "AUTO",
    note: "",
  };
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: assignDonationSchema,
    defaultValues: initial,
    onBusy,
    action: async (values) => {
      const result = await assignDonationAction(withoutDonorPlaceholder(values));
      if (result.ok) toast.success(`Buchung ${line.entryLabel} ist jetzt als Spende eingetragen.`);
      return result;
    },
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });
  const [donorMode, donorId, donorName, street, postalCode, city, paymentMethod, receiptWish] =
    useWatch({
      control: form.control,
      name: [
        "donorMode",
        "donorId",
        "donorName",
        "street",
        "postalCode",
        "city",
        "paymentMethod",
        "receiptWish",
      ],
    });
  const anonymous = donorMode === "ANONYMOUS";

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-5">
      <div className="grid gap-1.5">
        <BookingFacts
          amountCents={line.amountCents}
          date={line.bookingDate}
          accountName={line.accountName}
          entryLabel={line.entryLabel}
        />
        {line.counterpartyName && (
          <p className="text-sm wrap-anywhere text-muted-foreground">
            Von wem laut Buchung: {line.counterpartyName}
          </p>
        )}
      </div>

      <DonorChoice form={form} options={options} allowAnonymous />

      <div className="grid gap-3">
        <p className="text-sm">
          <span className="font-medium">Abteilung oder Veranstaltung:</span>{" "}
          {line.purposeLabel ?? "keine (frei verwendbar)"}{" "}
          <span className="text-muted-foreground">– aus der Buchung</span>
        </p>
        <TextField
          form={form}
          name="purposeText"
          label="Fester Zweck (freiwillig)"
          placeholder="z. B. Vereinsheim"
          hint="Nur, wenn der Spender einen Zweck vorgibt – dann darf der Verein das Geld nur dafür ausgeben."
        />
      </div>

      <ChoiceField
        form={form}
        name="paymentMethod"
        legend="Wie kam das Geld?"
        choices={PAYMENT_CHOICES}
        hint={
          line.accountKind === "BANK"
            ? "Vorgabe nach dem Konto. Bar übergeben und vom Verein selbst eingezahlt? Dann „Bar übergeben“ wählen – dann braucht der Spender eine Zuwendungsbestätigung."
            : "Vorgabe nach dem Konto. Bei einer Überweisung bis 300 € genügt dem Spender sein Kontoauszug mit einem Beleg des Vereins."
        }
      />

      {!anonymous && (
        <div className="grid gap-2">
          <ChoiceField
            form={form}
            name="receiptWish"
            legend="Zuwendungsbestätigung"
            choices={RECEIPT_WISH_CHOICES}
          />
          <ReceiptPreview
            kind="MONEY"
            paymentMethod={paymentMethod}
            amount={centsToInput(line.amountCents)}
            wish={receiptWish}
            anonymous={false}
            addressComplete={donorAddressKnownComplete(
              { donorMode, donorId, donorName, street, postalCode, city },
              options.donors,
            )}
          />
        </div>
      )}

      <TextareaField form={form} name="note" label="Notiz (freiwillig)" rows={2} />

      <FormError message={formError} />
      <SubmitButton pending={isPending} className="w-full sm:w-auto sm:justify-self-end">
        Als Spende kennzeichnen
      </SubmitButton>
    </form>
  );
}
