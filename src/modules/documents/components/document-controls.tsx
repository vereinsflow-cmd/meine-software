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
import { cn } from "@/lib/utils";
import { deleteDocumentAction, updateDocumentAction } from "../actions";
import {
  ACCESS_LABEL,
  documentFormSchema,
  type AccessLevel,
  type DocumentFormInput,
} from "../schemas";

const ACCEPT = ALLOWED_TYPES.map((type) => `.${type.ext}`).join(",");
/** Angaben, die für alle Dateien gelten und eine eigene Fehlerzeile haben. */
const SHARED_FIELDS = ["category", "access", "eventId"] as const;

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
}: {
  categories: string[];
  events: { id: string; label: string }[];
  accessLevels: AccessLevel[];
  maxMb: number;
  requireEvent: boolean;
  /** Ist die Liste auf eine Veranstaltung eingegrenzt, gehören neue Dokumente gleich zu ihr. */
  defaultEventId?: string;
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

  const presetEvent = events.some((event) => event.id === defaultEventId) ? defaultEventId : "";
  const ready = files.filter((entry) => !entry.error);

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
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0 || ready.length === 0) return;

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
          uploaded.size === 1 ? "Dokument hochgeladen." : `${uploaded.size} Dokumente hochgeladen.`,
        );
        router.refresh();
      }
      const remaining = files
        .filter((entry) => !uploaded.has(entry.key))
        .map((entry) => ({ ...entry, error: failed.get(entry.key) ?? entry.error }));
      setFiles(remaining);
      if (remaining.length === 0) setOpen(false);
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
          if (!next) {
            setFiles([]);
            setErrors({});
            setFormError(null);
          }
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
                <NativeSelect id="upload-zugriff" name="access" defaultValue="ALL_MEMBERS">
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
  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
