"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import {
  CheckboxField,
  FormError,
  SubmitButton,
  TextareaField,
  TextField,
} from "@/components/shared/form-fields";
import { SEGMENT_BAR, segmentItem } from "@/components/ui/segment-styles";
import { useActionForm } from "@/hooks/use-action-form";
import type { ActionResult } from "@/lib/action-result";
import { formatCalendarDate, parseCalendarDate } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AMOUNT_HINT } from "@/modules/finance/schemas";
import { uploadReceipt } from "@/modules/finance/components/receipts-dialog";
import { recordDonationAction, updateDonationAction } from "../actions";
import { loadDonationEditAction } from "../dialog-actions";
import type { DonationEditData } from "../dialog-data";
import {
  DONATION_KIND_CHOICE,
  DONATION_KIND_LABEL,
  IN_KIND_ORIGIN_LABEL,
  WAIVER_BASIS_LABEL,
} from "../format";
import {
  DONATION_KINDS,
  IN_KIND_ORIGINS,
  WAIVER_BASES,
  donationFormSchema,
  donationUpdateSchema,
  latestWaiverDay,
  type DonationFormInput,
  type DonationUpdateInput,
} from "../schemas";
import type { DonationFormOptions } from "../service";
import {
  BookingFacts,
  ChoiceField,
  DialogLoadError,
  DialogLoading,
  DonorChoice,
  FilePickList,
  NotADonationHints,
  PAYMENT_CHOICES,
  PAYMENT_HINT,
  ReactiveSelect,
  RECEIPT_WISH_CHOICES,
  ReceiptPreview,
  donorAddressKnownComplete,
  uploadDonationEvidence,
  useDialogData,
  withoutDonorPlaceholder,
  type Choice,
} from "./form-parts";

type Kind = (typeof DONATION_KINDS)[number];

/** Erklärung unter der Umschaltleiste „Art“. */
const KIND_HINT: Record<Kind, string> = {
  MONEY: "Wird gleich im Kassenbuch gebucht (Kategorie „Spenden“).",
  IN_KIND: "Eine Sache statt Geld – ohne Buchung im Kassenbuch, mit Nachweisen zum Wert.",
  EXPENSE_WAIVER:
    "Jemand verzichtet auf Geld, das ihm der Verein für Auslagen schuldet (z. B. Fahrtkosten) – ohne Buchung im Kassenbuch.",
};

const ORIGIN_CHOICES: Choice[] = IN_KIND_ORIGINS.map((value) => ({
  value,
  label: IN_KIND_ORIGIN_LABEL[value],
  description:
    value === "BUSINESS"
      ? "aus einer Firma"
      : value === "PRIVATE"
        ? "aus dem privaten Besitz"
        : "der Spender sagt es nicht",
}));

const BASIS_CHOICES: Choice[] = WAIVER_BASES.map((value) => ({
  value,
  label: WAIVER_BASIS_LABEL[value],
  description:
    value === "STATUTE"
      ? "z. B. Reisekostenordnung"
      : value === "BOARD_DECISION"
        ? "wenn die Satzung es erlaubt"
        : "vor der Tätigkeit geschlossen",
}));

/**
 * „Spende erfassen“: Geld (bucht gleich im Kassenbuch, Kategorie „Spenden“), Sachspende oder Verzicht auf Auslagen
 * (Aufwandsspende, beide ohne Buchung, mit Nachweisen). Von wem, wie viel, wofür und ob der Spender eine
 * Zuwendungsbestätigung braucht – mit Vorschau des Stands. Während des Speichern (samt Hochladen der Dateien) lässt sich
 * das Fenster nicht schließen; sonst ginge dieselbe Spende nach erneutem Öffnen ein zweites Mal durch.
 */
export function DonationDialog({
  options,
  trigger,
  triggerLabel,
  defaults,
  open: openProp,
  onOpenChange,
  onCloseAutoFocus,
  onSaved,
}: {
  options: DonationFormOptions;
  /** Eigener Auslöser (nur aus Client-Komponenten); ohne Angabe der blaue Knopf „Spende erfassen“. */
  trigger?: React.ReactNode;
  /**
   * Andere Beschriftung des blauen Knopfs – für Server-Seiten (ein dort gebautes Element als `trigger` käme beim Streamen
   * manchmal „lazy“ an, und `DialogTrigger asChild` scheitert dann; siehe `EntryDialog`).
   */
  triggerLabel?: string;
  /** Vorbelegung, z. B. `{ kind: "IN_KIND" }` oder ein Mitglied. */
  defaults?: Partial<DonationFormInput>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  /** Nach erfolgreichem Speichern (vor dem Schließen). */
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
          {trigger ?? <Button>{triggerLabel ?? "Spende erfassen"}</Button>}
        </DialogTrigger>
      )}
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>Spende erfassen</DialogTitle>
          <DialogDescription>
            Geldspenden landen gleich im Kassenbuch. Sach- und Aufwandsspenden stehen nur hier –
            mit ihren Nachweisen.
          </DialogDescription>
        </DialogHeader>
        {/* Das Formular entsteht bei jedem Öffnen neu – nach dem Speichern beginnt die nächste Spende leer. */}
        <DonationForm
          options={options}
          defaults={defaults}
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

/**
 * „Spende ändern“ (Liste „Alle Spenden“, Kassenbuch „⋯“): lädt die Spende beim Öffnen. Geld: Betrag, Tag, Konto,
 * Abteilung und Veranstaltung kommen aus der Buchung (ändern über „Korrigieren“) – änderbar sind Spender, Zahlart, Text-Zweck,
 * Wunsch und Notiz. Sach- und Aufwandsspenden: alles außer der Art.
 */
export function EditDonationDialog({
  donationId,
  open,
  onOpenChange,
  onCloseAutoFocus,
  onSaved,
}: {
  donationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  onSaved?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <EditDonationBody
          donationId={donationId}
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

function EditDonationBody({
  donationId,
  onBusy,
  onDone,
}: {
  donationId: string;
  onBusy: (busy: boolean) => void;
  onDone: () => void;
}) {
  const { state, retry } = useDialogData(() => loadDonationEditAction({ id: donationId }));
  return (
    <>
      <DialogHeader>
        <DialogTitle>Spende ändern</DialogTitle>
        <DialogDescription>
          {state.status === "ready"
            ? state.data.booking
              ? `${state.data.label}. Betrag, Tag und Konto kommen aus der Buchung.`
              : `${state.data.label}. Die Art lässt sich nicht ändern – dafür stornieren und neu erfassen.`
            : "Die Angaben der Spende werden geladen."}
        </DialogDescription>
      </DialogHeader>
      {state.status === "loading" && <DialogLoading />}
      {state.status === "error" && <DialogLoadError message={state.message} onRetry={retry} />}
      {state.status === "ready" && (
        <DonationForm
          options={state.data.options}
          edit={state.data}
          onBusy={onBusy}
          onDone={onDone}
        />
      )}
    </>
  );
}

const EMPTY: DonationUpdateInput = {
  id: "",
  kind: "MONEY",
  donorMode: "MEMBER",
  memberId: "",
  donorId: "",
  donorKind: "PERSON",
  donorName: "",
  street: "",
  postalCode: "",
  city: "",
  country: "DE",
  anonymousLabel: "",
  amount: "",
  receivedOn: "",
  paymentMethod: "",
  accountId: "",
  target: "frei",
  purposeText: "",
  receiptWish: "AUTO",
  description: "",
  note: "",
  itemDescription: "",
  inKindOrigin: "",
  valuationDocs: false,
  activityText: "",
  waiverBasis: "",
  claimGrantedOn: "",
  activityFrom: "",
  activityTo: "",
  claimDueOn: "",
  regularActivity: false,
  claimConfirmed: false,
};

function DonationForm({
  options,
  defaults,
  edit,
  onBusy,
  onDone,
}: {
  options: DonationFormOptions;
  defaults?: Partial<DonationFormInput>;
  /** Ändern statt erfassen (Daten aus `loadDonationEditAction`). */
  edit?: DonationEditData;
  onBusy: (busy: boolean) => void;
  onDone: () => void;
}) {
  const router = useRouter();
  const formId = useId();
  const accountMethod = (accountId: string | undefined) =>
    options.accounts.find((account) => account.value === accountId)?.paymentMethod ?? "TRANSFER";
  const startAccount =
    defaults?.accountId ?? options.defaultAccountId ?? options.accounts[0]?.value ?? "";
  const initial: DonationUpdateInput = edit?.defaults ?? {
    ...EMPTY,
    receivedOn: options.today,
    accountId: startAccount,
    paymentMethod: accountMethod(startAccount),
    ...defaults,
  };
  // Hat der Kassenwart Konto bzw. Zahlart selbst gewählt, setzt das Fenster sie nicht mehr von sich aus um.
  const accountTouched = useRef(Boolean(defaults?.accountId));
  const methodTouched = useRef(Boolean(edit) || Boolean(defaults?.paymentMethod));
  // Freiwillige Dateien: Beleg (Geld → an die Buchung) bzw. Nachweise (Sach/Aufwand → an die Spende), nach dem Speichern.
  const [receipt, setReceipt] = useState<File[]>([]);
  const [evidence, setEvidence] = useState<File[]>([]);

  const { form, onSubmit, isPending, formError } = useActionForm({
    // Beim Ändern gehört die Kennung dazu; sonst dasselbe Schema wie auf dem Server.
    schema: edit
      ? donationUpdateSchema
      : (donationFormSchema as unknown as typeof donationUpdateSchema),
    defaultValues: initial,
    onBusy,
    action: async (values): Promise<ActionResult<null>> => {
      const payload = withoutDonorPlaceholder(values);
      if (edit) {
        const result = await updateDonationAction(payload);
        if (!result.ok) return result;
        toast.success("Spende gespeichert.");
        return { ok: true, data: null };
      }
      const result = await recordDonationAction(payload);
      if (!result.ok) return result;
      const problems: string[] = [];
      if (values.kind === "MONEY" && result.data.entryId && receipt[0]) {
        const upload = await uploadReceipt(result.data.entryId, receipt[0]);
        if (!upload.ok)
          problems.push(
            `Der Beleg fehlt noch (${upload.message}) – nachreichen im Kassenbuch über „⋯“ → „Beleg anhängen“.`,
          );
      }
      if (values.kind !== "MONEY") {
        const failed: string[] = [];
        for (const file of evidence) {
          const upload = await uploadDonationEvidence(result.data.donationId, file);
          if (!upload.ok) failed.push(`„${file.name}“ (${upload.message})`);
        }
        if (failed.length > 0)
          problems.push(
            `Nicht hochgeladen: ${failed.join(", ")} – nachreichen unter „Alle Spenden“ → „Nachweise“.`,
          );
      }
      const saved =
        values.kind === "MONEY"
          ? `Spende gespeichert und gebucht als Nr. ${result.data.label}.`
          : `${DONATION_KIND_LABEL[values.kind]} gespeichert.`;
      // Eine Meldung, die stehen bleibt, wenn eine Datei nicht hochging – sonst verdeckte „gespeichert“ den Hinweis.
      if (problems.length > 0)
        toast.warning(saved, {
          description: problems.join(" "),
          duration: Infinity,
          closeButton: true,
        });
      else toast.success(saved);
      return { ok: true, data: null };
    },
    onSuccess: () => {
      onDone();
      router.refresh();
    },
  });

  const [
    kind,
    donorMode,
    donorId,
    donorName,
    street,
    postalCode,
    city,
    amount,
    paymentMethod,
    target,
    purposeText,
    receiptWish,
    inKindOrigin,
    valuationDocs,
    claimDueOn,
    regularActivity,
  ] = useWatch({
    control: form.control,
    name: [
      "kind",
      "donorMode",
      "donorId",
      "donorName",
      "street",
      "postalCode",
      "city",
      "amount",
      "paymentMethod",
      "target",
      "purposeText",
      "receiptWish",
      "inKindOrigin",
      "valuationDocs",
      "claimDueOn",
      "regularActivity",
    ],
  });
  const money = kind === "MONEY";
  const anonymous = donorMode === "ANONYMOUS";
  const lockedBooking = edit?.booking ?? null;

  /** Art wechseln: „Ohne Namen“ gibt es nur bei Geld; alte Fehlermeldungen der anderen Art passen nicht mehr. */
  function chooseKind(next: Kind) {
    form.setValue("kind", next);
    if (next !== "MONEY" && form.getValues("donorMode") === "ANONYMOUS")
      form.setValue("donorMode", "MEMBER");
    form.clearErrors();
  }

  /** „Ohne Namen“ (Spendendose) kommt meist in die Barkasse – solange niemand das Konto selbst gewählt hat. */
  function donorModeChanged(mode: string) {
    if (edit || accountTouched.current || !options.cashAccountId) return;
    const account =
      mode === "ANONYMOUS"
        ? options.cashAccountId
        : (options.defaultAccountId ?? options.accounts[0]?.value ?? "");
    form.setValue("accountId", account);
    if (!methodTouched.current) form.setValue("paymentMethod", accountMethod(account));
  }

  const targetOptions = [
    { value: "frei", label: "Frei verwendbar" },
    ...options.targets
      .filter((t) => t.group === "Abteilung")
      .map((t) => ({ value: t.value, label: `Abteilung: ${t.label}` })),
    ...options.targets
      .filter((t) => t.group === "Veranstaltung")
      .map((t) => ({ value: t.value, label: `Veranstaltung: ${t.label}` })),
    { value: "andere", label: "Anderer fester Zweck …" },
  ];
  const targetName =
    target === "andere"
      ? purposeText?.trim()
      : options.targets.find((t) => t.value === target)?.label;
  const dueDate = claimDueOn ? parseCalendarDate(claimDueOn) : null;
  const amountLabel =
    kind === "IN_KIND"
      ? "Wert in €"
      : kind === "EXPENSE_WAIVER"
        ? "Vereinbarter Erstattungsbetrag in €"
        : "Betrag in €";

  return (
    <form method="post" onSubmit={onSubmit} noValidate className="grid gap-5">
      {!edit && (
        <fieldset className="min-w-0">
          <legend className="mb-1.5 text-sm font-medium">Art</legend>
          {/* Echte Auswahlknöpfe einer Gruppe (Pfeiltasten wechseln); der Fokusrahmen sitzt an der sichtbaren Kachel. */}
          <div className={SEGMENT_BAR}>
            {DONATION_KINDS.map((value) => (
              <label
                key={value}
                className={cn(
                  segmentItem(kind === value),
                  "cursor-pointer px-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                )}
              >
                <input
                  type="radio"
                  name={`${formId}-art`}
                  value={value}
                  checked={kind === value}
                  onChange={() => chooseKind(value)}
                  className="sr-only"
                />
                {DONATION_KIND_CHOICE[value]}
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">{KIND_HINT[kind]}</p>
        </fieldset>
      )}

      <DonorChoice
        form={form}
        options={options}
        allowAnonymous={money}
        onModeChange={donorModeChanged}
      />

      {kind === "IN_KIND" && (
        <fieldset className="grid min-w-0 gap-4 rounded-xl border p-3 sm:p-4">
          <legend className="px-1 text-sm font-medium">Sachspende</legend>
          <TextareaField
            form={form}
            name="itemDescription"
            label="Was genau? (mit Alter, Zustand, Kaufpreis)"
            hint="So steht es auf der Zuwendungsbestätigung, z. B. „12 Kisten Mineralwasser, neu“."
            rows={3}
            required
          />
          <ChoiceField
            form={form}
            name="inKindOrigin"
            legend="Woher stammt die Sache? (nach Angabe des Spenders)"
            choices={ORIGIN_CHOICES}
            required
            hint={
              inKindOrigin === "PRIVATE"
                ? "Als Wert gilt, was die Sache heute wert ist (gemeiner Wert) – nicht der alte Kaufpreis."
                : undefined
            }
          />
          <CheckboxField
            form={form}
            name="valuationDocs"
            label="Unterlagen zur Wertermittlung liegen vor (z. B. Rechnung, Gutachten)"
          />
          {inKindOrigin === "PRIVATE" && !valuationDocs && (
            <p className="text-sm text-amber-800 dark:text-amber-300">
              Für die Zuwendungsbestätigung braucht der Verein Unterlagen, die den Wert belegen –
              zum Beispiel die Kaufrechnung oder ein Gutachten.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Nutzungen und Leistungen (z. B. ein kostenlos geliehener Bus, Arbeitszeit) sind keine
            Spenden.
          </p>
        </fieldset>
      )}

      {kind === "EXPENSE_WAIVER" && (
        <fieldset className="grid min-w-0 gap-4 rounded-xl border p-3 sm:p-4">
          <legend className="px-1 text-sm font-medium">Verzicht auf Auslagen</legend>
          <TextField
            form={form}
            name="activityText"
            label="Wofür entstand der Aufwand?"
            placeholder="z. B. Fahrten zu Auswärtsspielen der D-Jugend, 800 km × 0,30 €"
            required
          />
          <ChoiceField
            form={form}
            name="waiverBasis"
            legend="Der Anspruch auf Erstattung beruht auf"
            choices={BASIS_CHOICES}
            required
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              form={form}
              name="claimGrantedOn"
              label="Anspruch eingeräumt am"
              type="date"
              hint="vor Beginn der Tätigkeit"
              required
            />
            <TextField
              form={form}
              name="activityFrom"
              label="Tätigkeit von"
              type="date"
              required
            />
            <TextField form={form} name="activityTo" label="bis" type="date" required />
            <TextField
              form={form}
              name="claimDueOn"
              label="Erstattung fällig am"
              type="date"
              required
            />
            <TextField
              form={form}
              name="receivedOn"
              label="Verzicht erklärt am"
              type="date"
              hint="nach der Tätigkeit"
              required
            />
          </div>
          <CheckboxField
            form={form}
            name="regularActivity"
            label="Regelmäßige Tätigkeit (gewöhnlich jeden Monat)"
            hint="Dann darf der Verzicht bis zu einem Jahr nach Fälligkeit kommen, sonst bis zu 3 Monate."
          />
          {dueDate && (
            <p className="text-sm text-muted-foreground">
              Verzicht spätestens am{" "}
              <span className="font-medium text-foreground tabular-nums">
                {formatCalendarDate(latestWaiverDay(dueDate, Boolean(regularActivity)))}
              </span>
              .
            </p>
          )}
          <CheckboxField
            form={form}
            name="claimConfirmed"
            required
            label="Der Anspruch stand vor der Tätigkeit fest (Satzung, Beschluss oder schriftlicher Vertrag), war nicht an den Verzicht gebunden, und der Verein hätte zahlen können."
            hint="Ein Anspruch, der erst nachträglich oder nur für den Fall des Verzichts eingeräumt wird, zählt nicht."
          />
        </fieldset>
      )}

      {lockedBooking ? (
        <div className="grid gap-1.5">
          <BookingFacts
            amountCents={lockedBooking.amountCents}
            date={lockedBooking.receivedOn}
            accountName={lockedBooking.accountName}
            entryLabel={lockedBooking.entryLabel}
          />
          <p className="text-xs text-muted-foreground">
            Andere Werte? Im Kassenbuch über „⋯“ → „Korrigieren“ – die Spende wandert mit.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            form={form}
            name="amount"
            label={amountLabel}
            inputMode="decimal"
            placeholder={AMOUNT_HINT}
            hint={
              kind === "EXPENSE_WAIVER"
                ? "So viel hätte der Verein erstattet (z. B. 800 km × 0,30 €)."
                : kind === "IN_KIND" && inKindOrigin === "BUSINESS"
                  ? "Entnahmewert einschließlich Umsatzsteuer (§ 10b Abs. 3 Satz 2 EStG)."
                  : undefined
            }
            required
            inputClassName="sm:max-w-48"
          />
          {kind !== "EXPENSE_WAIVER" && (
            <TextField
              form={form}
              name="receivedOn"
              label={money ? "Tag der Gutschrift bzw. Übergabe" : "Tag der Übergabe"}
              type="date"
              required
              inputClassName="sm:max-w-48"
            />
          )}
          {money && (
            <ReactiveSelect
              form={form}
              name="accountId"
              label="Konto"
              options={options.accounts}
              required
              className="sm:col-span-2"
              onValue={(value) => {
                accountTouched.current = true;
                if (!methodTouched.current) form.setValue("paymentMethod", accountMethod(value));
              }}
            />
          )}
        </div>
      )}

      {money && (
        <ChoiceField
          form={form}
          name="paymentMethod"
          legend="Wie kam das Geld?"
          choices={PAYMENT_CHOICES}
          onValue={() => (methodTouched.current = true)}
          hint={PAYMENT_HINT}
        />
      )}

      {lockedBooking ? (
        <div className="grid gap-3">
          <p className="text-sm">
            <span className="font-medium">Abteilung oder Veranstaltung:</span>{" "}
            {lockedBooking.targetLabel ?? "keine (frei verwendbar)"}{" "}
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
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <ReactiveSelect
            form={form}
            name="target"
            label="Wofür?"
            options={targetOptions}
            hint="Gibt der Spender einen Zweck vor, darf der Verein das Geld nur dafür ausgeben."
            onValue={(value) => {
              if (value === "frei") form.setValue("purposeText", "");
            }}
          />
          {target === "andere" && (
            <TextField
              form={form}
              name="purposeText"
              label="Zweck"
              placeholder="z. B. Vereinsheim"
              required
            />
          )}
          {(target?.startsWith("a:") || target?.startsWith("v:")) && (
            <TextField
              form={form}
              name="purposeText"
              label="Genauer (freiwillig)"
              placeholder="z. B. neue Trikots"
            />
          )}
        </div>
      )}

      {!money && !edit && (
        <FilePickList
          id={`${formId}-nachweise`}
          title="Nachweise (freiwillig)"
          hint={
            kind === "IN_KIND"
              ? "Rechnung, Gutachten oder Foto – werden 10 Jahre aufbewahrt."
              : "Abrechnung und Verzichtserklärung – werden 10 Jahre aufbewahrt."
          }
          files={evidence}
          onChange={setEvidence}
          maxMb={options.maxUploadMb}
          disabled={isPending}
        />
      )}

      {!anonymous && (
        <div className="grid gap-2">
          <ChoiceField
            form={form}
            name="receiptWish"
            legend="Zuwendungsbestätigung"
            choices={RECEIPT_WISH_CHOICES}
          />
          <ReceiptPreview
            kind={kind}
            paymentMethod={paymentMethod}
            amount={lockedBooking ? centsToInput(lockedBooking.amountCents) : amount}
            wish={receiptWish}
            anonymous={false}
            addressComplete={donorAddressKnownComplete(
              { donorMode, donorId, donorName, street, postalCode, city },
              options.donors,
            )}
          />
        </div>
      )}

      {money && !edit && (
        <div className="grid gap-4">
          <TextField
            form={form}
            name="description"
            label="Text im Kassenbuch"
            placeholder={targetName ? `Spende für ${targetName}` : "Spende"}
            hint="Leer lassen für den Vorschlag."
          />
          <FilePickList
            id={`${formId}-beleg`}
            title="Beleg (freiwillig)"
            hint="Foto der Quittung oder der Überweisung – geht auch später im Kassenbuch über „⋯“."
            files={receipt}
            onChange={setReceipt}
            max={1}
            maxMb={options.maxUploadMb}
            disabled={isPending}
          />
        </div>
      )}

      <TextareaField form={form} name="note" label="Notiz (freiwillig)" rows={2} />

      {!edit && <NotADonationHints />}

      {/* Fehlermeldungen des Servers direkt über dem Knopf – oben im langen Fenster sähe man sie am Handy nicht. */}
      <FormError message={formError} />
      <div className="grid gap-3 sm:flex sm:flex-row-reverse sm:items-center sm:justify-between">
        <SubmitButton pending={isPending} className="w-full sm:w-auto">
          {edit ? "Änderungen speichern" : "Spende speichern"}
        </SubmitButton>
        {!edit && money && (
          <p className="text-xs text-muted-foreground">
            Schon im Kassenbuch gebucht? Dort über „⋯“ → „Als Spende kennzeichnen“.
          </p>
        )}
      </div>
    </form>
  );
}
