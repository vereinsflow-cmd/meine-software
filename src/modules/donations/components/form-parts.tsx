"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useWatch, type FieldValues, type Path, type UseFormReturn } from "react-hook-form";
import { LoaderCircleIcon, TriangleAlertIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import {
  errorOf,
  FieldShell,
  initialText,
  SelectField,
  TextField,
  type SelectOption,
} from "@/components/shared/form-fields";
import { PostalCodeCity } from "@/components/shared/postal-code-city";
import type { ActionResult } from "@/lib/action-result";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { formatCalendarDate, formatEuroFromCents } from "@/lib/dates";
import { parseEuroToCents } from "@/lib/money";
import { ALLOWED_EXTENSIONS_TEXT, clientFileError } from "@/lib/uploads";
import { cn } from "@/lib/utils";
import { ReceiptPicker } from "@/modules/finance/components/receipt-picker";
import {
  DONOR_KIND_LABEL,
  PAYMENT_METHOD_LABEL,
  RECEIPT_WISH_LABEL,
  receiptBadge,
} from "../format";
import { addressComplete, donationReceiptState } from "../receipt-status";
import { DONOR_KINDS, PAYMENT_METHODS, RECEIPT_WISHES, type DonorMode } from "../schemas";
import type { DonationFormOptions } from "../service";

/**
 * Bausteine der Spenden-Fenster („Spende erfassen“, „Spende ändern“, „Als Spende kennzeichnen“): Auswahl als Kacheln,
 * „Von wem?“, „Zuwendungsbestätigung“ mit Vorschau des Stands, Nachweis-Dateien und das Laden beim Öffnen.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Formulare mit unterschiedlichen Schemas teilen diese Felder
type AnyForm<T extends FieldValues> = UseFormReturn<T, any, any>;

/** Eintrag „Neu eintragen …“ in der Auswahl der Spender (wird vor dem Absenden entfernt). */
export const NEW_DONOR = "neu";

// ---------------------------------------------------------------------------------------------
// Auswahl als Kacheln und Auswahlfeld mit Rückmeldung
// ---------------------------------------------------------------------------------------------

export interface Choice {
  value: string;
  label: string;
  /** Zweite Zeile in kleiner Schrift. */
  description?: string;
}

/**
 * Auswahlknöpfe einer Gruppe als Kacheln (gut treffbar am Handy, Pfeiltasten wechseln). Fehler und Hinweis hängen über
 * `aria-describedby` an der Gruppe; der Fokusrahmen sitzt an der sichtbaren Kachel.
 */
export function ChoiceField<T extends FieldValues>({
  form,
  name,
  legend,
  choices,
  hint,
  required,
  columns = 3,
  onValue,
  className,
}: {
  form: AnyForm<T>;
  name: Path<T>;
  legend: string;
  choices: readonly Choice[];
  hint?: React.ReactNode;
  required?: boolean;
  columns?: 1 | 2 | 3;
  /** Nach jeder Wahl (z. B. „Zahlart selbst gewählt“ merken). */
  onValue?: (value: string) => void;
  className?: string;
}) {
  const id = useId();
  const error = errorOf(form, name);
  const initial = initialText(form, name);
  return (
    <fieldset
      className={cn("min-w-0", className)}
      aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
    >
      <legend className="mb-1.5 text-sm font-medium">
        {legend}
        {required && (
          <span aria-hidden="true" className="text-destructive">
            {" "}
            *
          </span>
        )}
      </legend>
      <div
        className={cn(
          "grid gap-2",
          columns === 2 && "sm:grid-cols-2",
          columns === 3 && "sm:grid-cols-3",
        )}
      >
        {choices.map((choice) => (
          <label
            key={choice.value}
            className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
          >
            <input
              type="radio"
              value={choice.value}
              defaultChecked={initial === choice.value}
              className="mt-0.5 size-4 shrink-0 accent-primary"
              {...form.register(name, {
                onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                  onValue?.(event.target.value),
              })}
            />
            <span className="grid min-w-0 gap-0.5">
              <span className="font-medium">{choice.label}</span>
              {choice.description && (
                <span className="text-xs text-muted-foreground">{choice.description}</span>
              )}
            </span>
          </label>
        ))}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-sm text-destructive">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Auswahlfeld wie `SelectField`, das jede Wahl meldet (z. B. Konto → Vorgabe „Wie kam das Geld?“). */
export function ReactiveSelect<T extends FieldValues>({
  form,
  name,
  label,
  hint,
  required,
  className,
  options,
  placeholder,
  leading,
  onValue,
}: {
  form: AnyForm<T>;
  name: Path<T>;
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  options: readonly SelectOption[];
  placeholder?: string;
  /** Einträge vor der Liste (nach dem Platzhalter), z. B. „Neu eintragen …“. */
  leading?: readonly SelectOption[];
  onValue: (value: string) => void;
}) {
  const id = useId();
  const error = errorOf(form, name);
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      required={required}
      error={error}
      className={className}
    >
      <NativeSelect
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        defaultValue={initialText(form, name)}
        {...form.register(name, {
          onChange: (event: React.ChangeEvent<HTMLSelectElement>) => onValue(event.target.value),
        })}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {[...(leading ?? []), ...options].map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </FieldShell>
  );
}

// ---------------------------------------------------------------------------------------------
// Von wem?
// ---------------------------------------------------------------------------------------------

/** Felder „Von wem?“ – in allen Spenden-Fenstern gleich benannt (wie im Schema). */
interface DonorFields {
  donorMode: DonorMode;
  memberId?: string;
  donorId?: string;
  donorKind?: unknown;
  donorName?: string;
  street?: string;
  postalCode?: string;
  city?: string;
  country?: string;
  anonymousLabel?: string;
}

type Who = "MEMBER" | "OTHER" | "ANONYMOUS";

const whoOf = (mode: DonorMode | undefined): Who =>
  mode === "ANONYMOUS" ? "ANONYMOUS" : mode === "DONOR" || mode === "NEW" ? "OTHER" : "MEMBER";

const WHO_CHOICES: { value: Who; label: string; description: string }[] = [
  { value: "MEMBER", label: "Mitglied", description: "Name und Anschrift aus der Mitgliederliste" },
  { value: "OTHER", label: "Andere Person oder Firma", description: "auch Stiftung oder Verein" },
  { value: "ANONYMOUS", label: "Ohne Namen", description: "z. B. Spendendose, Sammlung" },
];

/**
 * „Von wem?“: Mitglied (Auswahl „Nachname, Vorname“), andere Person oder Firma (vorhandene Spender oder „Neu eintragen …“
 * mit Anschrift) oder – nur bei Geld – ohne Namen (Spendendose). Technisch `donorMode` MEMBER · DONOR · NEW · ANONYMOUS.
 */
export function DonorChoice<T extends FieldValues>({
  form: anyForm,
  options,
  allowAnonymous,
  onModeChange,
}: {
  form: AnyForm<T>;
  options: Pick<DonationFormOptions, "members" | "donors">;
  /** „Ohne Namen“ gibt es nur bei Geld. */
  allowAnonymous: boolean;
  onModeChange?: (mode: DonorMode) => void;
}) {
  const form = anyForm as unknown as AnyForm<DonorFields>;
  const groupId = useId();
  const [mode, donorId, postalCode, city, country] = useWatch({
    control: form.control,
    name: ["donorMode", "donorId", "postalCode", "city", "country"],
  });
  const who = whoOf(mode);
  const hasDonors = options.donors.length > 0;
  const chosenDonor =
    mode === "DONOR" ? options.donors.find((donor) => donor.value === donorId) : undefined;
  const modeError = errorOf(form, "donorMode");

  function setMode(next: DonorMode) {
    form.setValue("donorMode", next, { shouldValidate: form.formState.isSubmitted });
    onModeChange?.(next);
  }

  function choose(next: Who) {
    if (next === "MEMBER") setMode("MEMBER");
    else if (next === "ANONYMOUS") setMode("ANONYMOUS");
    else setMode(hasDonors && form.getValues("donorId") !== NEW_DONOR ? "DONOR" : "NEW");
  }

  const choices = WHO_CHOICES.filter((choice) => allowAnonymous || choice.value !== "ANONYMOUS");
  return (
    <fieldset
      className="grid min-w-0 gap-3"
      aria-describedby={modeError ? `${groupId}-error` : undefined}
    >
      <legend className="mb-1.5 text-sm font-medium">Von wem?</legend>
      <div className={cn("grid gap-2", choices.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
        {choices.map((choice) => (
          <label
            key={choice.value}
            className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
          >
            <input
              type="radio"
              name={`${groupId}-wer`}
              value={choice.value}
              checked={who === choice.value}
              onChange={() => choose(choice.value)}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span className="grid min-w-0 gap-0.5">
              <span className="font-medium">{choice.label}</span>
              <span className="text-xs text-muted-foreground">{choice.description}</span>
            </span>
          </label>
        ))}
      </div>
      {modeError && (
        <p id={`${groupId}-error`} role="alert" className="text-sm text-destructive">
          {modeError}
        </p>
      )}

      {who === "MEMBER" &&
        (options.members.length > 0 ? (
          <SelectField
            form={form}
            name="memberId"
            label="Mitglied"
            placeholder="Bitte wählen"
            options={options.members}
            required
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Es gibt noch keine Mitglieder – wähle „Andere Person oder Firma“.
          </p>
        ))}

      {who === "OTHER" && hasDonors && (
        <ReactiveSelect
          form={form}
          name="donorId"
          label="Person oder Firma"
          placeholder="Bitte wählen"
          leading={[{ value: NEW_DONOR, label: "Neu eintragen …" }]}
          options={options.donors}
          required
          onValue={(value) => setMode(value === NEW_DONOR ? "NEW" : "DONOR")}
        />
      )}
      {chosenDonor && !chosenDonor.addressComplete && (
        <p className="text-sm text-amber-800 dark:text-amber-300">
          Für diesen Spender fehlt die Anschrift – ohne sie lässt sich keine Zuwendungsbestätigung
          ausstellen. Ergänzen kannst du sie unter Finanzen → Spenden → Spender.
        </p>
      )}
      {mode === "NEW" && (
        <div className="grid gap-4 rounded-xl border p-3 sm:grid-cols-2 sm:p-4">
          <TextField
            form={form}
            name="donorName"
            label="Name"
            placeholder="z. B. Autohaus Brinkmann GmbH oder Erika Muster"
            hint="So, wie er auf der Zuwendungsbestätigung stehen soll."
            autoComplete="off"
            required
            className="sm:col-span-2"
          />
          <SelectField
            form={form}
            name="donorKind"
            label="Art"
            options={DONOR_KINDS.map((value) => ({ value, label: DONOR_KIND_LABEL[value] }))}
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
            Die Anschrift brauchst du für die Zuwendungsbestätigung. Fehlt sie noch, lässt sie sich
            später ergänzen.
          </p>
        </div>
      )}

      {who === "ANONYMOUS" && (
        <TextField
          form={form}
          name="anonymousLabel"
          label="Bezeichnung"
          placeholder="z. B. Spendendose Theke"
          hint="Für Spenden ohne Namen gibt es keine Zuwendungsbestätigung."
          required
        />
      )}
    </fieldset>
  );
}

/** Ist die Anschrift des gewählten Spenders vollständig? Bei Mitgliedern unbekannt (dann „ja“ – die Liste prüft später). */
export function donorAddressKnownComplete(
  values: {
    donorMode: DonorMode | undefined;
    donorId?: string;
    donorName?: string;
    street?: string;
    postalCode?: string;
    city?: string;
  },
  donors: DonationFormOptions["donors"],
): boolean {
  if (values.donorMode === "DONOR")
    return donors.find((donor) => donor.value === values.donorId)?.addressComplete ?? true;
  if (values.donorMode === "NEW")
    return addressComplete({
      name: values.donorName,
      street: values.street,
      postalCode: values.postalCode,
      city: values.city,
    });
  return true;
}

/** Vor dem Absenden: „Neu eintragen …“ ist kein Spender – die Auswahl zählt nur bei einem vorhandenen Spender. */
export function withoutDonorPlaceholder<V extends { donorMode: DonorMode; donorId?: string }>(
  values: V,
): V {
  return { ...values, donorId: values.donorMode === "DONOR" ? values.donorId : undefined };
}

// ---------------------------------------------------------------------------------------------
// Zuwendungsbestätigung
// ---------------------------------------------------------------------------------------------

/** „Wie kam das Geld?“ – entscheidet über den vereinfachten Nachweis bis 300 €, nicht das Konto der Buchung (K1). */
export const PAYMENT_CHOICES: Choice[] = PAYMENT_METHODS.map((value) => ({
  value,
  label: PAYMENT_METHOD_LABEL[value].replace(/^b/, "B"),
  description:
    value === "TRANSFER"
      ? "auch Lastschrift"
      : value === "CASH"
        ? "auch wenn der Verein es danach einzahlt"
        : "andere Bezahldienste",
}));

export const PAYMENT_HINT =
  "Bei einer Überweisung bis 300 € genügt dem Spender sein Kontoauszug mit einem Beleg des Vereins. Bargeld braucht immer eine Zuwendungsbestätigung – auch wenn der Verein es danach selbst zur Bank bringt.";

export const RECEIPT_WISH_CHOICES: Choice[] = RECEIPT_WISHES.map((value) => ({
  value,
  label: RECEIPT_WISH_LABEL[value],
  description:
    value === "AUTO"
      ? "nötig bei Bargeld, über 300 €, Sach- und Aufwandsspenden"
      : value === "WANTED"
        ? "auch bei einer Überweisung bis 300 €"
        : "der Spender verzichtet darauf",
}));

/**
 * Was für diese Spende gilt – so, wie sie gerade eingetragen ist (dieselbe Regel wie in den Listen). Erst mit einem
 * Betrag; die Anschrift eines Mitglieds kennt das Fenster nicht (dann „nötig“ – die Liste zeigt „Adresse fehlt“).
 */
export function ReceiptPreview({
  kind,
  paymentMethod,
  amount,
  wish,
  anonymous,
  addressComplete: complete,
}: {
  kind: "MONEY" | "IN_KIND" | "EXPENSE_WAIVER";
  paymentMethod: unknown;
  amount: string | undefined;
  wish: "AUTO" | "WANTED" | "NOT_WANTED" | undefined;
  anonymous: boolean;
  addressComplete: boolean;
}) {
  const cents = parseEuroToCents(amount ?? "");
  if (!cents || cents <= 0) return null;
  const method =
    paymentMethod === "TRANSFER" || paymentMethod === "CASH" || paymentMethod === "OTHER"
      ? paymentMethod
      : null;
  const state = donationReceiptState({
    void: false,
    issuedOn: null,
    hasDonor: !anonymous,
    anonymous,
    restricted: false,
    kind,
    paymentMethod: kind === "MONEY" ? method : null,
    amountCents: cents,
    wish: wish ?? "AUTO",
    addressComplete: complete,
  });
  const badge = receiptBadge(state);
  return (
    <p className="rounded-md bg-muted/60 px-3 py-2 text-sm">
      Zuwendungsbestätigung: <span className="font-semibold">{badge.label}</span> –{" "}
      {badge.explanation}
    </p>
  );
}

// ---------------------------------------------------------------------------------------------
// Nachweise (Dateien, die nach dem Speichern hochgeladen werden)
// ---------------------------------------------------------------------------------------------

export const MAX_EVIDENCE_FILES = 5;

/** Lädt eine Nachweisdatei zu einer Spende hoch (eigene Anfrage, wie Belege im Kassenbuch). */
export async function uploadDonationEvidence(
  donationId: string,
  file: File,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const body = new FormData();
  body.set("donationId", donationId);
  body.set("file", file);
  try {
    const response = await fetch("/api/finanzen/spenden/nachweise", { method: "POST", body });
    const json = (await response.json().catch(() => null)) as {
      ok: boolean;
      error?: { message: string; fieldErrors?: Record<string, string[]> };
    } | null;
    if (response.ok && json?.ok) return { ok: true };
    return {
      ok: false,
      message:
        json?.error?.fieldErrors?.file?.join(" ") ??
        json?.error?.message ??
        "Die Datei ließ sich nicht hochladen. Bitte versuche es erneut.",
    };
  } catch {
    return { ok: false, message: "Die Verbindung wurde unterbrochen. Bitte versuche es erneut." };
  }
}

/**
 * Dateien auswählen, die nach dem Speichern an die Spende bzw. Buchung gehen (Rechnung, Gutachten, Abrechnung,
 * Verzichtserklärung). Geprüft wird hier nur Typ und Größe – den Rest prüft der Server beim Hochladen.
 */
export function FilePickList({
  id,
  title,
  hint,
  files,
  onChange,
  maxMb,
  max = MAX_EVIDENCE_FILES,
  disabled,
}: {
  id: string;
  title: string;
  hint: string;
  files: File[];
  onChange: (files: File[]) => void;
  maxMb: number;
  max?: number;
  disabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-1.5">
      <p id={`${id}-titel`} className="text-sm font-medium">
        {title}
      </p>
      {files.length > 0 && (
        <ul className="grid gap-1" aria-label="Ausgewählte Dateien">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex min-w-0 items-center justify-between gap-2 text-sm"
            >
              <span className="min-w-0 break-all">{file.name}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 px-2"
                disabled={disabled}
                aria-label={`„${file.name}“ entfernen`}
                onClick={() => onChange(files.filter((_, i) => i !== index))}
              >
                Entfernen
              </Button>
            </li>
          ))}
        </ul>
      )}
      {files.length < max && (
        <ReceiptPicker
          id={id}
          label={files.length > 0 ? "Weitere Datei" : "Datei auswählen"}
          labelledBy={`${id}-titel`}
          describedBy={error ? `${id}-fehler` : `${id}-hinweis`}
          invalid={Boolean(error)}
          disabled={disabled}
          onFile={(file) => {
            const problem = clientFileError(file, maxMb);
            setError(problem);
            if (!problem) onChange([...files, file]);
          }}
        />
      )}
      {error ? (
        <p id={`${id}-fehler`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p id={`${id}-hinweis`} className="text-xs text-muted-foreground">
          {hint} {ALLOWED_EXTENSIONS_TEXT}, höchstens {maxMb} MB je Datei.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Laden beim Öffnen
// ---------------------------------------------------------------------------------------------

export type Loaded<T> =
  { status: "loading" } | { status: "error"; message: string } | { status: "ready"; data: T };

/**
 * Holt die Daten eines Fensters, sobald sein Inhalt erscheint (Radix baut ihn bei jedem Öffnen neu auf – so sind sie
 * immer frisch). Eine unterbrochene Verbindung wird zur Meldung mit „Erneut versuchen“.
 */
export function useDialogData<T>(load: () => Promise<ActionResult<T>>): {
  state: Loaded<T>;
  retry: () => void;
  /** Neu laden, ohne die Anzeige vorher zu leeren (nach einer Änderung im Fenster). */
  refresh: () => void;
} {
  const [state, setState] = useState<Loaded<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  useEffect(() => {
    let cancelled = false;
    loadRef
      .current()
      .then((result) => {
        if (cancelled) return;
        setState(
          result.ok
            ? { status: "ready", data: result.data }
            : { status: "error", message: result.error.message },
        );
      })
      .catch(() => {
        if (!cancelled)
          setState({
            status: "error",
            message: "Die Verbindung wurde unterbrochen. Bitte versuche es erneut.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);
  return {
    state,
    retry: () => {
      setState({ status: "loading" });
      setAttempt((value) => value + 1);
    },
    refresh: () => setAttempt((value) => value + 1),
  };
}

/** Platzhalter, solange das Fenster lädt (vorgelesen als Status). */
export function DialogLoading() {
  return (
    <p role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <LoaderCircleIcon className="size-4 animate-spin" aria-hidden="true" /> Wird geladen …
    </p>
  );
}

export function DialogLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="grid gap-3">
      <Alert variant="destructive">
        <TriangleAlertIcon />
        <AlertDescription>{message}</AlertDescription>
      </Alert>
      <Button type="button" variant="outline" className="justify-self-start" onClick={onRetry}>
        Erneut versuchen
      </Button>
    </div>
  );
}

/** Was bei einer Geldspende aus der Buchung kommt (fest): Betrag, Tag, Konto, Nummer. */
export function BookingFacts({
  amountCents,
  date,
  accountName,
  entryLabel,
}: {
  amountCents: number;
  date: Date;
  accountName: string;
  entryLabel: string;
}) {
  const facts = [
    { label: "Betrag", value: formatEuroFromCents(amountCents), strong: true },
    { label: "Tag", value: formatCalendarDate(date) },
    { label: "Konto", value: accountName },
    { label: "Buchung", value: `Nr. ${entryLabel}` },
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md bg-muted/60 px-3 py-2 text-sm sm:grid-cols-4">
      {facts.map((fact) => (
        <div key={fact.label} className="min-w-0">
          <dt className="text-xs text-muted-foreground">{fact.label}</dt>
          <dd className={cn("wrap-anywhere tabular-nums", fact.strong && "font-semibold")}>
            {fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Ruhige Hinweise gegen eine unrichtige Bestätigung (H 10b.1, R 10b.1) – kein Entgelt, keine Pflichtzahlung. */
export function NotADonationHints() {
  return (
    <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
      <p className="font-medium text-foreground">Keine abziehbare Spende ist:</p>
      <ul className="mt-1 grid list-disc gap-0.5 pl-4">
        <li>
          Geld, für das der Geber etwas bekommt (Werbung, Banner, Eintritt) – das ist Sponsoring.
        </li>
        <li>Geld, das an eine bestimmte Person weitergegeben werden soll.</li>
        <li>Was ein Mitglied zahlen muss (Umlage, Aufnahmegebühr).</li>
      </ul>
    </div>
  );
}
