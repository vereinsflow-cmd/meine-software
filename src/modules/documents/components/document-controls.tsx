"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { InfoIcon, PencilIcon, Trash2Icon, UploadIcon } from "lucide-react";
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
import { FormError, SelectField, SubmitButton, TextField } from "@/components/shared/form-fields";
import { useActionForm } from "@/hooks/use-action-form";
import { ALLOWED_EXTENSIONS_TEXT, ALLOWED_TYPES, extensionOf, formatBytes } from "@/lib/uploads";
import { deleteDocumentAction, updateDocumentAction } from "../actions";
import {
  ACCESS_LABEL,
  documentFormSchema,
  type AccessLevel,
  type DocumentFormInput,
} from "../schemas";

const ACCEPT = ALLOWED_TYPES.map((type) => `.${type.ext}`).join(",");

/**
 * Dokument hochladen. Die Prüfungen im Browser (Größe, Endung) sind nur eine Bequemlichkeit – verbindlich prüft der
 * Server anhand des Dateiinhalts (Typ, Größe, Speicherplatz, Berechtigung).
 */
export function UploadDialog({
  categories,
  events,
  accessLevels,
  maxMb,
  requireEvent,
}: {
  categories: string[];
  events: { id: string; label: string }[];
  accessLevels: AccessLevel[];
  maxMb: number;
  requireEvent: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    const next: Record<string, string> = {};
    if (!(file instanceof File) || file.size === 0) next.file = "Bitte wähle eine Datei aus.";
    else if (file.size > maxMb * 1024 * 1024)
      next.file = `Die Datei ist zu groß (höchstens ${maxMb} MB, deine hat ${formatBytes(file.size)}).`;
    else if (!ALLOWED_TYPES.some((type) => type.ext === extensionOf(file.name)))
      next.file = `Dieser Dateityp ist nicht erlaubt. Erlaubt sind: ${ALLOWED_EXTENSIONS_TEXT}.`;
    if (requireEvent && !form.get("eventId"))
      next.eventId = "Bitte wähle eine Veranstaltung deiner Abteilung.";
    setErrors(next);
    setFormError(null);
    if (Object.keys(next).length > 0) return;

    startTransition(async () => {
      try {
        const response = await fetch("/api/dokumente", { method: "POST", body: form });
        const body = (await response.json().catch(() => null)) as {
          ok: boolean;
          error?: { message: string; fieldErrors?: Record<string, string[]> };
        } | null;
        if (response.ok && body?.ok) {
          toast.success("Dokument hochgeladen.");
          setOpen(false);
          router.refresh();
          return;
        }
        const fieldErrors = body?.error?.fieldErrors ?? {};
        setErrors(
          Object.fromEntries(
            Object.entries(fieldErrors).map(([key, messages]) => [key, messages.join(" ")]),
          ),
        );
        setFormError(
          Object.keys(fieldErrors).length === 0
            ? (body?.error?.message ?? "Der Upload ist fehlgeschlagen. Bitte versuche es erneut.")
            : null,
        );
      } catch {
        setFormError("Die Verbindung wurde unterbrochen. Bitte versuche es erneut.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dokument hochladen</DialogTitle>
          <DialogDescription>
            Erlaubt: {ALLOWED_EXTENSIONS_TEXT}. Höchstens {maxMb} MB. Die Datei wird auf Inhalt und
            Typ geprüft.
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
              <Label htmlFor="upload-datei">
                Datei{" "}
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              </Label>
              <Input
                id="upload-datei"
                type="file"
                name="file"
                accept={ACCEPT}
                aria-invalid={errors.file ? true : undefined}
                aria-describedby={errors.file ? "upload-datei-fehler" : undefined}
              />
              {errors.file && (
                <p id="upload-datei-fehler" role="alert" className="text-sm text-destructive">
                  {errors.file}
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="upload-kategorie">Kategorie</Label>
              <Input
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
                <NativeSelect id="upload-veranstaltung" name="eventId" defaultValue="">
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
            <SubmitButton pending={pending} pendingLabel="Wird hochgeladen …">
              Hochladen
            </SubmitButton>
          </form>
        )}
      </DialogContent>
    </Dialog>
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
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`${defaults.name} bearbeiten`}
        >
          <PencilIcon />
        </Button>
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
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-destructive"
          aria-label={`${name} löschen`}
        >
          <Trash2Icon />
        </Button>
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
