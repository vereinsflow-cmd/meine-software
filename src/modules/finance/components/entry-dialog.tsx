"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useFieldArray, useWatch } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { IconButton } from "@/components/shared/icon-button";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/shared/form-fields";
import { SEGMENT_BAR, segmentItem } from "@/components/ui/segment-styles";
import { useActionForm } from "@/hooks/use-action-form";
import { formatEuroFromCents } from "@/lib/dates";
import { parseEuroToCents } from "@/lib/money";
import { ALLOWED_EXTENSIONS_TEXT, clientFileError } from "@/lib/uploads";
import { cn } from "@/lib/utils";
import type { EntryFormOptions } from "../ledger";
import { correctEntryAction, createEntryAction } from "../ledger-actions";
import {
  ENTRY_KIND_LABEL,
  ENTRY_KINDS,
  correctionFormSchema,
  entrySchema,
  type CorrectionFormInput,
  type EntryInput,
} from "../ledger-schemas";
import { AMOUNT_HINT } from "../schemas";
import { ReceiptPicker } from "./receipt-picker";
import { uploadReceipt } from "./receipts-dialog";

/**
 * „Neue Buchung“ bzw. „Korrigieren“: Einnahme oder Ausgabe mit Betrag, Datum, Konto, Kategorie und Beschreibung, auf Wunsch
 * einer Abteilung oder Veranstaltung zugeordnet und auf mehrere Kategorien aufgeteilt. Beträge tippt man immer positiv – ob
 * Geld herein- oder hinausgeht, sagt die Wahl oben. Beim Korrigieren storniert der Server die alte Buchung und legt die neue
 * an (beides oder keins).
 */
export function EntryDialog({
  options,
  trigger,
  defaults,
  correct,
  invoice,
  open: openProp,
  onOpenChange,
  onCloseAutoFocus,
  onSaved,
}: {
  options: EntryFormOptions;
  /** Eigener Auslöser; ohne Angabe der blaue Knopf „Neue Buchung“. */
  trigger?: React.ReactNode;
  defaults?: Partial<EntryInput>;
  /** Korrektur einer vorhandenen Buchung (Storno + neue Buchung). */
  correct?: { id: string; label: string };
  /** Bezahlte Rechnung ins Kassenbuch übernehmen (`defaults.invoiceId` verweist auf sie). */
  invoice?: { name: string };
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Wohin der Fokus nach dem Schließen geht (aus `useMoreActions`, wenn ein Menü das Fenster öffnet). */
  onCloseAutoFocus?: (event: Event) => void;
  /** Nach erfolgreichem Speichern (vor dem Schließen). */
  onSaved?: () => void;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;
  // Während des Speicherns (samt Beleg-Upload) lässt sich das Fenster nicht schließen – sonst ginge dieselbe Buchung nach
  // erneutem Öffnen ein zweites Mal durch.
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && setOpen(next)}>
      {openProp === undefined && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button>
              <PlusIcon /> Neue Buchung
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>
            {correct
              ? `Buchung ${correct.label} korrigieren`
              : invoice
                ? "Rechnung ins Kassenbuch"
                : "Neue Buchung"}
          </DialogTitle>
          <DialogDescription>
            {correct
              ? "Die alte Buchung wird storniert und die korrigierte neu angelegt – so bleibt alles nachvollziehbar."
              : invoice
                ? `„${invoice.name}“ wird als Ausgabe gebucht und hängt als Beleg an der Buchung.`
                : "Einnahmen und Ausgaben werden nicht geändert, sondern bei Bedarf storniert – so bleibt alles nachvollziehbar."}
          </DialogDescription>
        </DialogHeader>
        {/* Das Formular entsteht bei jedem Öffnen neu – nach dem Speichern beginnt die nächste Buchung leer. */}
        <EntryForm
          options={options}
          defaults={defaults}
          correct={correct}
          withInvoice={Boolean(invoice)}
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

function EntryForm({
  options,
  defaults,
  correct,
  withInvoice,
  onBusy,
  onDone,
}: {
  options: EntryFormOptions;
  defaults?: Partial<EntryInput>;
  correct?: { id: string; label: string };
  /** Die Rechnung ist schon der Beleg – kein eigenes Belegfeld. */
  withInvoice: boolean;
  onBusy: (busy: boolean) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  // Beleg (freiwillig): wird nach dem Buchen hochgeladen und an die neue Buchung gehängt.
  const [receipt, setReceipt] = useState<File | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const initial: CorrectionFormInput = {
    kind: defaults?.kind ?? "EXPENSE",
    accountId: defaults?.accountId ?? options.accounts[0]?.value ?? "",
    bookingDate: defaults?.bookingDate ?? options.today,
    description: defaults?.description ?? "",
    counterparty: defaults?.counterparty ?? "",
    invoiceId: defaults?.invoiceId,
    lines: defaults?.lines?.length
      ? defaults.lines
      : [{ categoryId: "", amount: "", target: "", note: "" }],
    reason: "",
  };
  const { form, onSubmit, isPending, formError } = useActionForm({
    // Beim Korrigieren gehört der Grund dazu; sonst dasselbe Schema wie auf dem Server.
    schema: correct
      ? correctionFormSchema
      : (entrySchema as unknown as typeof correctionFormSchema),
    defaultValues: initial,
    onBusy,
    action: async (values) => {
      const result = correct
        ? await correctEntryAction(correct.id, values.reason, values)
        : await createEntryAction(values);
      if (!result.ok) return result;
      // Eine Meldung, die stehen bleibt, wenn der Beleg nicht hochging – sonst verdeckte „Gebucht.“ den Hinweis.
      const upload = receipt ? await uploadReceipt(result.data.id, receipt) : null;
      if (upload && !upload.ok)
        toast.warning(`Gebucht als Nr. ${result.data.label} – der Beleg fehlt aber noch.`, {
          description: `${upload.message} Nachreichen über „⋯“ → „Beleg anhängen“.`,
          duration: Infinity,
          closeButton: true,
        });
      else toast.success(correct ? "Buchung korrigiert." : `Gebucht als Nr. ${result.data.label}.`);
      return result;
    },
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });
  // Rechnung („Ins Kassenbuch“, auch beim Korrigieren einer solchen Buchung): immer eine Ausgabe.
  const invoiceLocked = Boolean(initial.invoiceId);
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });
  const kind = useWatch({ control: form.control, name: "kind" });
  const lines = useWatch({ control: form.control, name: "lines" });
  const split = fields.length > 1;
  const categories = options.categories.filter(
    (c) => c.direction === "BOTH" || c.direction === kind,
  );
  const categoryOptions = categories.map((c) => ({
    value: c.value,
    label: c.hint ? `${c.label} (${c.hint})` : c.label,
  }));
  const targetOptions = [
    ...options.targets
      .filter((t) => t.group === "Abteilung")
      .map((t) => ({ value: t.value, label: `Abteilung: ${t.label}` })),
    ...options.targets
      .filter((t) => t.group === "Veranstaltung")
      .map((t) => ({ value: t.value, label: `Veranstaltung: ${t.label}` })),
  ];
  const total = (lines ?? []).reduce(
    (sum, line) => sum + (line?.amount ? (parseEuroToCents(line.amount) ?? 0) : 0),
    0,
  );

  /** Bei „Einnahme“/„Ausgabe“ passen nicht alle Kategorien – unpassende werden geleert. */
  function chooseKind(next: (typeof ENTRY_KINDS)[number]) {
    form.setValue("kind", next);
    (form.getValues("lines") ?? []).forEach((line, index) => {
      const category = options.categories.find((c) => c.value === line.categoryId);
      if (category && category.direction !== "BOTH" && category.direction !== next)
        form.setValue(`lines.${index}.categoryId`, "");
    });
  }

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-4">
      <fieldset hidden={invoiceLocked}>
        <legend className="mb-1.5 text-sm font-medium">Art</legend>
        {/* Echte Auswahlknöpfe einer Gruppe (Pfeiltasten wechseln); der Fokusrahmen sitzt an der sichtbaren Kachel. */}
        <div className={SEGMENT_BAR}>
          {ENTRY_KINDS.map((value) => (
            <label
              key={value}
              className={cn(
                segmentItem(kind === value),
                "cursor-pointer px-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
              )}
            >
              <input
                type="radio"
                name="kind"
                value={value}
                checked={kind === value}
                onChange={() => chooseKind(value)}
                className="sr-only"
              />
              {ENTRY_KIND_LABEL[value]}
            </label>
          ))}
        </div>
        {form.formState.errors.kind?.message && (
          <p role="alert" className="mt-1.5 text-sm text-destructive">
            {form.formState.errors.kind.message}
          </p>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        {!split && (
          <TextField
            form={form}
            name="lines.0.amount"
            label="Betrag in €"
            inputMode="decimal"
            placeholder={AMOUNT_HINT}
            required
            inputClassName="sm:max-w-48"
          />
        )}
        <TextField
          form={form}
          name="bookingDate"
          label="Datum"
          type="date"
          required
          inputClassName="sm:max-w-48"
        />
        <SelectField
          form={form}
          name="accountId"
          label="Konto"
          options={options.accounts}
          required
          className={split ? "" : "sm:col-span-2"}
        />
      </div>

      <TextField
        form={form}
        name="description"
        label="Beschreibung"
        placeholder={
          kind === "INCOME" ? "z. B. Zuschuss Stadt Musterstadt" : "z. B. Hallenmiete Oktober"
        }
        required
      />
      <TextField
        form={form}
        name="counterparty"
        label={kind === "INCOME" ? "Von wem?" : "An wen?"}
        hint="Firma, Person oder Stelle – freiwillig"
      />

      {!split ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            form={form}
            name="lines.0.categoryId"
            label="Kategorie"
            placeholder="Bitte wählen"
            options={categoryOptions}
            required
          />
          <SelectField
            form={form}
            name="lines.0.target"
            label="Abteilung oder Veranstaltung"
            placeholder="Keine"
            options={targetOptions}
          />
        </div>
      ) : (
        <fieldset className="grid gap-3 rounded-xl border p-3 sm:p-4">
          <legend className="px-1 text-sm font-medium">Aufteilung</legend>
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="grid gap-3 border-b pb-3 last:border-b-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end"
            >
              <SelectField
                form={form}
                name={`lines.${index}.categoryId`}
                label={`Kategorie ${index + 1}`}
                placeholder="Bitte wählen"
                options={categoryOptions}
                required
              />
              <TextField
                form={form}
                name={`lines.${index}.amount`}
                label={`Betrag ${index + 1} in €`}
                inputMode="decimal"
                required
              />
              <IconButton
                label={`Zeile ${index + 1} entfernen`}
                variant="ghost"
                className="mb-0.5 justify-self-end"
                onClick={() => remove(index)}
              >
                <Trash2Icon />
              </IconButton>
              <SelectField
                form={form}
                name={`lines.${index}.target`}
                label={`Abteilung oder Veranstaltung ${index + 1}`}
                placeholder="Keine"
                options={targetOptions}
                className="sm:col-span-3"
              />
            </div>
          ))}
          <p className="text-sm tabular-nums" aria-live="polite">
            Zusammen: <span className="font-semibold">{formatEuroFromCents(total)}</span>
          </p>
        </fieldset>
      )}
      {fields.length < 20 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-mt-2 justify-self-start text-primary hover:text-primary"
          onClick={() => append({ categoryId: "", amount: "", target: "", note: "" })}
        >
          <PlusIcon /> {split ? "Weitere Kategorie" : "Auf mehrere Kategorien aufteilen"}
        </Button>
      )}

      {!withInvoice && (
        <div className="grid gap-1.5">
          <p id="buchung-beleg-titel" className="text-sm font-medium">
            Beleg (freiwillig)
          </p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <ReceiptPicker
              id="buchung-beleg"
              label={receipt ? "Andere Datei" : "Datei auswählen"}
              labelledBy="buchung-beleg-titel"
              describedBy={receiptError ? "buchung-beleg-fehler" : "buchung-beleg-hinweis"}
              invalid={Boolean(receiptError)}
              disabled={isPending}
              onFile={(file) => {
                const problem = clientFileError(file, options.maxUploadMb);
                setReceiptError(problem);
                setReceipt(problem ? null : file);
              }}
            />
            {receipt && (
              <span className="flex min-w-0 items-center gap-1 text-sm">
                <span className="min-w-0 break-all">{receipt.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="px-2"
                  disabled={isPending}
                  onClick={() => setReceipt(null)}
                >
                  Entfernen
                </Button>
              </span>
            )}
          </div>
          {receiptError ? (
            <p id="buchung-beleg-fehler" role="alert" className="text-sm text-destructive">
              {receiptError}
            </p>
          ) : (
            <p id="buchung-beleg-hinweis" className="text-xs text-muted-foreground">
              Foto der Quittung oder PDF ({ALLOWED_EXTENSIONS_TEXT}, höchstens {options.maxUploadMb}{" "}
              MB). Geht auch später über „⋯“.
            </p>
          )}
        </div>
      )}

      {correct && (
        <TextField
          form={form}
          name="reason"
          label="Grund der Korrektur"
          placeholder="z. B. Betrag falsch abgetippt"
          required
        />
      )}

      {/* Fehlermeldungen des Servers (Barkasse im Minus, Zeitraum abgeschlossen …) direkt über dem Knopf – oben im langen
          Fenster sähe man sie am Handy nicht. */}
      <FormError message={formError} />
      <SubmitButton pending={isPending} className="w-full sm:w-auto sm:justify-self-end">
        {correct ? "Korrigieren" : kind === "INCOME" ? "Einnahme buchen" : "Ausgabe buchen"}
      </SubmitButton>
    </form>
  );
}
