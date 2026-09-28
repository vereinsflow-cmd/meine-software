"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileIcon, InfoIcon, PencilIcon, TrashIcon, UploadIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ConfirmAction } from "@/components/shared/confirm-dialog";
import { FileDropOverlay, FileDropZone, useWindowFileDrop } from "@/components/shared/file-drop";
import { IconButton } from "@/components/shared/icon-button";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import {
  ALLOWED_EXTENSIONS_TEXT,
  ALLOWED_TYPES,
  clientFileError,
  formatBytes,
} from "@/lib/uploads";
import { parseEuroToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AMOUNT_HINT, INVOICE_STATUSES, INVOICE_STATUS_LABEL } from "@/modules/finance/schemas";
import { deleteDocumentAction, updateDocumentAction } from "../actions";
import {
  ACCESS_LABEL,
  documentFormSchema,
  type AccessLevel,
  type DocumentFormInput,
} from "../schemas";

const ACCEPT = ALLOWED_TYPES.map((type) => `.${type.ext}`).join(",");
/** Angaben, die für alle Dateien gelten und eine eigene Fehlerzeile haben. */
const SHARED_FIELDS = ["category", "access", "eventId", "amount", "dueDate"] as const;
/** Die beiden Antworten zum Zahlungsstand einer hochgeladenen Rechnung. */
const PAYMENT_CHOICES = [
  { due: true, label: "Muss noch bezahlt werden" },
  { due: false, label: "Ist schon bezahlt" },
] as const;

interface ChosenFile {
  key: number;
  file: File;
  /** Warum die Datei (noch) nicht hochgeladen ist – aus der Vorprüfung im Browser oder vom Server. */
  error: string | null;
}

type UploadOutcome =
  { ok: true } | { ok: false; fieldErrors: Record<string, string>; message: string };

/** Schickt eine Datei samt Angaben an den Server (eine Anfrage je Datei). */
async function uploadOne(body: FormData): Promise<UploadOutcome> {
  try {
    const response = await fetch("/api/dokumente", { method: "POST", body });
    const json = (await response.json().catch(() => null)) as {
      ok: boolean;
      error?: { message: string; fieldErrors?: Record<string, string[]> };
    } | null;
    if (response.ok && json?.ok) return { ok: true };
    return {
      ok: false,
      fieldErrors: Object.fromEntries(
        Object.entries(json?.error?.fieldErrors ?? {}).map(([key, messages]) => [
          key,
          messages.join(" "),
        ]),
      ),
      message: json?.error?.message ?? "Der Upload ist fehlgeschlagen. Bitte versuche es erneut.",
    };
  } catch {
    return {
      ok: false,
      fieldErrors: {},
      message: "Die Verbindung wurde unterbrochen. Bitte versuche es erneut.",
    };
  }
}

/**
 * Dokumente hochladen – über den Knopf oder indem man Dateien irgendwo auf die Seite zieht: Dann öffnet sich dieses
 * Fenster mit den Dateien. Mehrere Dateien auf einmal gehen; jede wird einzeln hochgeladen und bekommt dieselben Angaben
 * (Kategorie, Zugriff, Veranstaltung). Was klappt, verschwindet aus der Liste – was übrig bleibt, nennt den Grund.
 * Eine neue Auswahl ersetzt die bisherige, wie bei einem normalen Dateifeld.
 * Die Prüfungen im Browser (Größe, Endung) sind nur eine Bequemlichkeit – verbindlich prüft der Server anhand des
 * Dateiinhalts (Typ, Größe, Speicherplatz, Berechtigung).
 */
export function UploadDialog({
  categories,
  events,
  accessLevels,
  maxMb,
  requireEvent,
  defaultEventId,
  invoiceName = null,
}: {
  categories: string[];
  events: { id: string; label: string }[];
  accessLevels: AccessLevel[];
  maxMb: number;
  requireEvent: boolean;
  /** Ist die Liste auf eine Veranstaltung eingegrenzt, gehören neue Dokumente gleich zu ihr. */
  defaultEventId?: string;
  /**
   * Name, den eine heute hochgeladene Rechnung bekommt („Rechnung vom 27.09.2026“) – nur für Berechtigte
   * (`finance:manage`); sonst `null`, und die Rechnungs-Angaben fehlen im Fenster.
   */
  invoiceName?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [files, setFiles] = useState<ChosenFile[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const nextKey = useRef(0);
  const categoryRef = useRef<HTMLInputElement>(null);
  // Rechnung: Der Name entsteht auf dem Server; Rechnungen sind zunächst „Nur Vorstand“ (Beträge, Kontodaten).
  const [isInvoice, setIsInvoice] = useState(false);
  const [paymentDue, setPaymentDue] = useState(true);
  const [access, setAccess] = useState<AccessLevel>("ALL_MEMBERS");
  // Hat das Häkchen „Rechnung“ die Zugriffsstufe angehoben? Dann nimmt es sie beim Abwählen wieder zurück.
  const [accessRaised, setAccessRaised] = useState(false);

  const presetEvent = events.some((event) => event.id === defaultEventId) ? defaultEventId : "";
  const ready = files.filter((entry) => !entry.error);

  /** Alles zurück auf Anfang – beim Schließen von Hand und nach dem erfolgreichen Hochladen. */
  function reset() {
    setFiles([]);
    setErrors({});
    setFormError(null);
    setIsInvoice(false);
    setPaymentDue(true);
    setAccess("ALL_MEMBERS");
    setAccessRaised(false);
  }

  function choose(list: File[]) {
    if (pending) return;
    setFiles(
      list.map((file) => ({ key: nextKey.current++, file, error: clientFileError(file, maxMb) })),
    );
    setErrors({});
    setFormError(null);
  }

  // Dateien, die irgendwo auf die Seite fallen, öffnen das Fenster (oder ersetzen die Auswahl darin).
  const dragging = useWindowFileDrop((list) => {
    if (pending) return;
    choose(list);
    setOpen(true);
  });

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget); // Kategorie, Zugriff, Veranstaltung – die Dateien kommen einzeln dazu
    const next: Record<string, string> = {};
    if (files.length === 0) next.file = "Bitte wähle eine Datei aus.";
    if (requireEvent && !fields.get("eventId"))
      next.eventId = "Bitte wähle eine Veranstaltung deiner Abteilung.";
    if (isInvoice && paymentDue) {
      const amount = String(fields.get("amount") ?? "").trim();
      const cents = amount ? parseEuroToCents(amount) : null;
      if (!amount) next.amount = "Bitte gib den Betrag ein.";
      else if (cents === null || cents <= 0)
        next.amount = `Bitte gib einen gültigen Betrag ein (${AMOUNT_HINT}).`;
    }
    setErrors(next);
    // Jede Rechnung hat ihren eigenen Betrag – mehrere Dateien auf einmal würden alle denselben bekommen.
    const oneInvoice = !isInvoice || ready.length <= 1;
    setFormError(
      oneInvoice ? null : "Rechnungen lädst du bitte einzeln hoch – jede mit ihrem eigenen Betrag.",
    );
    if (Object.keys(next).length > 0 || ready.length === 0 || !oneInvoice) return;

    startTransition(async () => {
      const uploaded = new Set<number>();
      const failed = new Map<number, string>();
      for (const [index, entry] of ready.entries()) {
        setProgress({ done: index, total: ready.length });
        const body = new FormData();
        for (const [key, value] of fields) body.append(key, value);
        body.set("file", entry.file);
        const outcome = await uploadOne(body);
        if (outcome.ok) {
          uploaded.add(entry.key);
          continue;
        }
        if (outcome.fieldErrors.file) {
          failed.set(entry.key, outcome.fieldErrors.file);
          continue;
        }
        // Ein Fehler, der jede weitere Datei genauso träfe (Angaben, Berechtigung, Verbindung, zu viele Uploads).
        setErrors(outcome.fieldErrors);
        if (!SHARED_FIELDS.some((field) => outcome.fieldErrors[field]))
          setFormError(outcome.message);
        break;
      }
      setProgress(null);
      if (uploaded.size > 0) {
        toast.success(
          isInvoice
            ? paymentDue
              ? "Rechnung hochgeladen – sie steht jetzt bei den offenen Zahlungen."
              : "Rechnung hochgeladen – als schon bezahlt abgelegt."
            : uploaded.size === 1
              ? "Dokument hochgeladen."
              : `${uploaded.size} Dokumente hochgeladen.`,
        );
        router.refresh();
      }
      const remaining = files
        .filter((entry) => !uploaded.has(entry.key))
        .map((entry) => ({ ...entry, error: failed.get(entry.key) ?? entry.error }));
      if (remaining.length === 0) {
        reset(); // sonst wäre das nächste Dokument wieder als Rechnung angekreuzt
        setOpen(false);
      } else setFiles(remaining);
    });
  }

  return (
    <>
      <FileDropOverlay
        show={dragging && !open}
        title="Dateien hier ablegen"
        hint="Danach wählst du, wer sie sehen darf, und lädst sie hoch."
      />
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return; // erst fertig hochladen
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogTrigger asChild>
          <Button>
            <UploadIcon /> Dokument hochladen
          </Button>
        </DialogTrigger>
        <DialogContent
          className="sm:max-w-lg"
          onOpenAutoFocus={(event) => {
            // Mit abgelegten Dateien geht es gleich bei den Angaben weiter.
            if (files.length > 0 && categoryRef.current) {
              event.preventDefault();
              categoryRef.current.focus();
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Dokument hochladen</DialogTitle>
            <DialogDescription>
              Erlaubt: {ALLOWED_EXTENSIONS_TEXT}. Jede Datei wird auf Inhalt und Typ geprüft.
            </DialogDescription>
          </DialogHeader>
          {requireEvent && events.length === 0 ? (
            <Alert>
              <InfoIcon />
              <AlertDescription>
                Als Abteilungsleiter lädst du Dokumente zu Veranstaltungen deiner Abteilung hoch.
                Aktuell gibt es keine – lege zuerst eine Veranstaltung an.
              </AlertDescription>
            </Alert>
          ) : (
            <form onSubmit={submit} noValidate className="grid gap-4">
              <FormError message={formError} />
              <div className="grid gap-1.5">
                <Label id="upload-datei-titel" htmlFor="upload-datei">
                  Dateien{" "}
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>
                </Label>
                <FileDropZone
                  id="upload-datei"
                  active={dragging}
                  invalid={Boolean(errors.file)}
                  disabled={pending}
                  accept={ACCEPT}
                  multiple
                  labelledBy="upload-datei-titel"
                  describedBy={errors.file ? "upload-datei-fehler" : "upload-datei-hinweis"}
                  onFiles={choose}
                >
                  {dragging ? (
                    <span className="font-medium text-primary">Dateien hier ablegen</span>
                  ) : (
                    <span className="font-medium">
                      <span className="hidden sm:inline">Dateien hierher ziehen oder </span>
                      <span className="text-primary underline underline-offset-4">
                        <span className="sm:hidden">Dateien </span>auswählen
                      </span>
                    </span>
                  )}
                  <span id="upload-datei-hinweis" className="text-xs text-muted-foreground">
                    Auch mehrere auf einmal · höchstens {maxMb} MB je Datei
                  </span>
                </FileDropZone>
                {files.length > 0 && (
                  <ul aria-label="Ausgewählte Dateien" className="grid gap-1.5">
                    {files.map((entry) => (
                      <li
                        key={entry.key}
                        className={cn(
                          "flex items-start gap-2 rounded-md border px-2.5 py-1.5",
                          entry.error && "border-destructive/60",
                        )}
                      >
                        <FileIcon
                          className="mt-1 size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <span className="grid min-w-0 flex-1 gap-0.5">
                          <span className="text-sm font-medium break-words">{entry.file.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatBytes(entry.file.size)}
                          </span>
                          {entry.error && (
                            <span role="alert" className="text-sm text-destructive">
                              {entry.error}
                            </span>
                          )}
                        </span>
                        <IconButton
                          type="button"
                          className="size-7 shrink-0"
                          label={`„${entry.file.name}“ entfernen`}
                          disabled={pending}
                          onClick={() =>
                            setFiles((current) => current.filter((item) => item.key !== entry.key))
                          }
                        >
                          <XIcon />
                        </IconButton>
                      </li>
                    ))}
                  </ul>
                )}
                <p aria-live="polite" className="sr-only">
                  {files.length === 0
                    ? ""
                    : files.length === 1
                      ? "1 Datei ausgewählt."
                      : `${files.length} Dateien ausgewählt.`}
                </p>
                {errors.file && (
                  <p id="upload-datei-fehler" role="alert" className="text-sm text-destructive">
                    {errors.file}
                  </p>
                )}
              </div>
              {invoiceName && (
                <fieldset className="grid gap-3 rounded-lg border p-3">
                  <legend className="sr-only">Rechnung</legend>
                  <label className="flex items-start gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      name="isInvoice"
                      checked={isInvoice}
                      onChange={(event) => {
                        const checked = event.target.checked;
                        setIsInvoice(checked);
                        // Rechnungen enthalten Beträge und oft Kontodaten: zunächst nur für den Vorstand – aber nur
                        // statt „Alle Mitglieder“, eine engere Wahl („Nur Verwaltung“) bleibt stehen.
                        if (checked && access === "ALL_MEMBERS" && accessLevels.includes("BOARD")) {
                          setAccess("BOARD");
                          setAccessRaised(true);
                        } else if (!checked && accessRaised) {
                          if (access === "BOARD") setAccess("ALL_MEMBERS");
                          setAccessRaised(false);
                        }
                        setErrors({});
                        setFormError(null);
                      }}
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                    />
                    <span>
                      <span className="font-medium">Das ist eine Rechnung</span>
                      <span className="block text-muted-foreground">
                        Sie heißt dann automatisch „{invoiceName}“.
                      </span>
                    </span>
                  </label>
                  {isInvoice && (
                    <>
                      {/* Zwei Antworten statt eines vorab angehakten Kästchens: Ein Klick auf die gewünschte Antwort wählt sie
                          immer aus. Das Kästchen ließ sich versehentlich abwählen – die Rechnung landete dann ohne Betrag als
                          bezahlt. Der Server liest `paymentDue` wie bisher („true“ = offen, „false“ = bezahlt). */}
                      <fieldset className="grid gap-2 sm:grid-cols-2">
                        <legend className="sr-only">Ist die Rechnung schon bezahlt?</legend>
                        {PAYMENT_CHOICES.map((choice) => (
                          <label
                            key={choice.label}
                            className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm font-medium has-checked:border-primary has-checked:bg-primary/5"
                          >
                            <input
                              type="radio"
                              name="paymentDue"
                              value={String(choice.due)}
                              checked={paymentDue === choice.due}
                              onChange={() => setPaymentDue(choice.due)}
                              className="size-4 shrink-0 accent-primary"
                            />
                            {choice.label}
                          </label>
                        ))}
                      </fieldset>
                      {paymentDue ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="grid content-start gap-1.5">
                            <Label htmlFor="upload-betrag">
                              Betrag in €{" "}
                              <span aria-hidden="true" className="text-destructive">
                                *
                              </span>
                            </Label>
                            <Input
                              id="upload-betrag"
                              name="amount"
                              inputMode="decimal"
                              autoComplete="off"
                              placeholder={AMOUNT_HINT}
                              aria-required="true"
                              aria-invalid={errors.amount ? true : undefined}
                              aria-describedby={errors.amount ? "upload-betrag-fehler" : undefined}
                            />
                            {errors.amount && (
                              <p
                                id="upload-betrag-fehler"
                                role="alert"
                                className="text-sm text-destructive"
                              >
                                {errors.amount}
                              </p>
                            )}
                          </div>
                          <div className="grid content-start gap-1.5">
                            <Label htmlFor="upload-faellig">Fällig am</Label>
                            <Input
                              id="upload-faellig"
                              name="dueDate"
                              type="date"
                              aria-invalid={errors.dueDate ? true : undefined}
                            />
                            {errors.dueDate && (
                              <p role="alert" className="text-sm text-destructive">
                                {errors.dueDate}
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Die Rechnung wird als bezahlt abgelegt und erscheint nicht bei den offenen
                          Zahlungen.
                        </p>
                      )}
                    </>
                  )}
                </fieldset>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor="upload-kategorie">Kategorie</Label>
                <Input
                  ref={categoryRef}
                  id="upload-kategorie"
                  name="category"
                  list="upload-kategorien"
                  maxLength={60}
                  placeholder="z. B. Protokolle, Satzung, Formulare"
                  autoComplete="off"
                />
                <datalist id="upload-kategorien">
                  {categories.map((category) => (
                    <option key={category} value={category} />
                  ))}
                </datalist>
                {errors.category && (
                  <p role="alert" className="text-sm text-destructive">
                    {errors.category}
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="upload-zugriff">Wer darf es sehen?</Label>
                <NativeSelect
                  id="upload-zugriff"
                  name="access"
                  value={access}
                  onChange={(event) => {
                    setAccess(event.target.value as AccessLevel);
                    setAccessRaised(false); // selbst gewählt – bleibt, auch wenn „Rechnung“ abgewählt wird
                  }}
                >
                  {accessLevels.map((level) => (
                    <option key={level} value={level}>
                      {ACCESS_LABEL[level]}
                    </option>
                  ))}
                </NativeSelect>
                {errors.access && (
                  <p role="alert" className="text-sm text-destructive">
                    {errors.access}
                  </p>
                )}
              </div>
              {events.length > 0 && (
                <div className="grid gap-1.5">
                  <Label htmlFor="upload-veranstaltung">
                    Veranstaltung
                    {requireEvent && (
                      <span aria-hidden="true" className="text-destructive">
                        {" "}
                        *
                      </span>
                    )}
                  </Label>
                  <NativeSelect id="upload-veranstaltung" name="eventId" defaultValue={presetEvent}>
                    <option value="">
                      {requireEvent ? "Bitte wählen" : "Keine (allgemeines Dokument)"}
                    </option>
                    {events.map((event) => (
                      <option key={event.id} value={event.id}>
                        {event.label}
                      </option>
                    ))}
                  </NativeSelect>
                  {errors.eventId && (
                    <p role="alert" className="text-sm text-destructive">
                      {errors.eventId}
                    </p>
                  )}
                </div>
              )}
              <SubmitButton
                pending={pending}
                pendingLabel={
                  progress && progress.total > 1
                    ? `Wird hochgeladen … (${progress.done + 1} von ${progress.total})`
                    : "Wird hochgeladen …"
                }
              >
                {ready.length > 1 ? `${ready.length} Dateien hochladen` : "Hochladen"}
              </SubmitButton>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EditDocumentDialog({
  id,
  defaults,
  accessLevels,
}: {
  id: string;
  defaults: DocumentFormInput;
  accessLevels: AccessLevel[];
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { form, onSubmit, isPending, formError } = useActionForm({
    schema: documentFormSchema,
    defaultValues: defaults,
    action: (values) => updateDocumentAction(id, values),
    successMessage: "Dokument gespeichert.",
    onSuccess: () => {
      setOpen(false);
      router.refresh();
    },
  });
  const invoiceStatus = form.watch("invoice.status");
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Beim Öffnen den aktuellen Stand übernehmen: „Bezahlt“ in derselben Zeile ändert die Rechnung, ohne dass das
        // Formular es mitbekommt – sonst würde Speichern sie wieder öffnen.
        if (next) form.reset(defaults);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <IconButton className="size-8" label={`${defaults.name} bearbeiten`}>
          <PencilIcon />
        </IconButton>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dokument bearbeiten</DialogTitle>
          <DialogDescription>
            Die Dateiendung bleibt erhalten. Die Datei selbst lässt sich nicht ersetzen – lade dafür
            eine neue Fassung hoch.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <FormError message={formError} />
          <TextField form={form} name="name" label="Name" required />
          <TextField form={form} name="category" label="Kategorie" />
          <SelectField
            form={form}
            name="access"
            label="Wer darf es sehen?"
            options={accessLevels.map((level) => ({ value: level, label: ACCESS_LABEL[level] }))}
          />
          {/* Rechnung: nur für Berechtigte (`finance:manage`) – sonst fehlt der Teil in den Startwerten. */}
          {defaults.invoice && (
            <fieldset className="grid gap-4 rounded-lg border p-3 sm:grid-cols-2">
              <legend className="px-1 text-sm font-medium">Rechnung</legend>
              <SelectField
                form={form}
                name="invoice.status"
                label="Zahlungsstand"
                options={INVOICE_STATUSES.map((status) => ({
                  value: status,
                  label: INVOICE_STATUS_LABEL[status],
                }))}
                className="sm:col-span-2"
              />
              <TextField
                form={form}
                name="invoice.amount"
                label="Betrag in €"
                inputMode="decimal"
                placeholder={AMOUNT_HINT}
                required={invoiceStatus === "OPEN"}
              />
              <TextField form={form} name="invoice.dueDate" label="Fällig am" type="date" />
            </fieldset>
          )}
          <SubmitButton pending={isPending}>Speichern</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteDocumentButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      destructive
      trigger={
        <IconButton className="size-8 text-destructive" label={`${name} löschen`}>
          <TrashIcon />
        </IconButton>
      }
      title="Dokument löschen?"
      description={`„${name}“ wird gelöscht und ist danach für niemanden mehr sichtbar. Nach 30 Tagen wird die Datei endgültig entfernt.`}
      confirmLabel="Löschen"
      action={() => deleteDocumentAction({ id })}
      successMessage="Dokument gelöscht."
      onSuccess={() => router.refresh()}
    />
  );
}
