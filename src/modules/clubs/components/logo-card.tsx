"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ClubLogo } from "@/components/shared/club-logo";
import { ConfirmAction } from "@/components/shared/confirm-dialog";
import { FormError } from "@/components/shared/form-fields";
import {
  CLUB_LOGO_ACCEPT,
  CLUB_LOGO_MAX_BYTES,
  CLUB_LOGO_TYPES,
  CLUB_LOGO_TYPES_TEXT,
  checkClubLogo,
  clubInitials,
} from "@/lib/club-logo";
import { formatDateTime } from "@/lib/dates";
import { formatBytes } from "@/lib/uploads";
import { removeClubLogoAction } from "../settings-actions";

export interface ClubLogoCardProps {
  clubId: string;
  clubName: string;
  logo: { url: string; mimeType: string; sizeBytes: number; updatedAt: Date } | null;
}

/**
 * Vereinslogo hochladen, ersetzen oder entfernen. Die Prüfung im Browser (Format, Größe, Bildmaße – dieselben Regeln
 * wie auf dem Server) ist nur eine Bequemlichkeit; verbindlich prüft der Server anhand des Inhalts.
 * Eigenes Formular (nicht in den Vereinsdaten), weil Dateien nicht als Formularwerte der Vereinsdaten übertragen werden.
 */
export function ClubLogoCard({ clubId, clubName, logo }: ClubLogoCardProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  // Vorschau-Adresse freigeben, sobald sie nicht mehr gebraucht wird (sonst bleibt das Bild im Speicher).
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const typeLabel = CLUB_LOGO_TYPES.find((type) => type.mime === logo?.mimeType)?.label;

  async function check(file: File | null): Promise<string | null> {
    if (!file || file.size === 0) return "Bitte wähle eine Datei aus.";
    // Vor dem Einlesen: sehr große Dateien gar nicht erst in den Speicher holen.
    if (file.size > CLUB_LOGO_MAX_BYTES)
      return `Das Logo ist zu groß (höchstens ${formatBytes(CLUB_LOGO_MAX_BYTES)}, deine Datei hat ${formatBytes(file.size)}).`;
    const result = checkClubLogo(file.name, new Uint8Array(await file.arrayBuffer()));
    return result.ok ? null : result.reason;
  }

  async function choose(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    setFormError(null);
    const problem = file ? await check(file) : null;
    setError(problem);
    setPreview(file && !problem ? URL.createObjectURL(file) : null);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    startTransition(async () => {
      const problem = await check(file instanceof File ? file : null);
      setError(problem);
      setFormError(null);
      if (problem) return;
      try {
        const response = await fetch(`/api/vereine/${clubId}/logo`, { method: "POST", body: form });
        const body = (await response.json().catch(() => null)) as {
          ok: boolean;
          error?: { message: string; fieldErrors?: Record<string, string[]> };
        } | null;
        if (response.ok && body?.ok) {
          toast.success(logo ? "Logo ersetzt." : "Logo gespeichert.");
          formRef.current?.reset();
          setPreview(null);
          router.refresh();
          return;
        }
        const fileError = body?.error?.fieldErrors?.file?.join(" ");
        setError(fileError ?? null);
        setFormError(
          fileError
            ? null
            : (body?.error?.message ?? "Der Upload ist fehlgeschlagen. Bitte versuche es erneut."),
        );
      } catch {
        setFormError("Die Verbindung wurde unterbrochen. Bitte versuche es erneut.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={2}>
          Vereinslogo
        </CardTitle>
        <CardDescription>
          Erscheint neben dem Vereinsnamen in der Kopfzeile, im Vereinswechsler und auf gedruckten
          Helferplänen. {CLUB_LOGO_TYPES_TEXT}, höchstens {formatBytes(CLUB_LOGO_MAX_BYTES)} – am
          besten quadratisch und mindestens 128 × 128 Pixel groß.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="flex items-center gap-4">
          <ClubLogo name={clubName} logoUrl={preview ?? logo?.url ?? null} size="lg" />
          <div className="grid gap-0.5 text-sm">
            {preview ? (
              <p className="font-medium">Vorschau – noch nicht gespeichert</p>
            ) : logo ? (
              <>
                <p className="font-medium">Aktuelles Logo</p>
                <p className="text-muted-foreground">
                  {typeLabel ?? "Bild"}, {formatBytes(logo.sizeBytes)} · geändert am{" "}
                  {formatDateTime(logo.updatedAt)} Uhr
                </p>
              </>
            ) : (
              <>
                <p className="font-medium">Noch kein Logo</p>
                <p className="text-muted-foreground">
                  Bis dahin erscheinen die Anfangsbuchstaben „{clubInitials(clubName)}“.
                </p>
              </>
            )}
          </div>
        </div>

        <form ref={formRef} onSubmit={submit} noValidate className="grid gap-4">
          <FormError message={formError} />
          <div className="grid max-w-md gap-1.5">
            <Label htmlFor="vereinslogo-datei">{logo ? "Neues Logo" : "Logo auswählen"}</Label>
            <Input
              id="vereinslogo-datei"
              type="file"
              name="file"
              accept={CLUB_LOGO_ACCEPT}
              onChange={choose}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "vereinslogo-datei-fehler" : undefined}
            />
            {error && (
              <p id="vereinslogo-datei-fehler" role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              <UploadIcon />
              {pending ? "Wird hochgeladen …" : logo ? "Logo ersetzen" : "Logo hochladen"}
            </Button>
            {logo && (
              <ConfirmAction
                destructive
                trigger={
                  <Button type="button" variant="outline" disabled={pending}>
                    <Trash2Icon /> Logo entfernen
                  </Button>
                }
                title="Logo entfernen?"
                description="Statt des Logos erscheinen wieder die Anfangsbuchstaben des Vereinsnamens. Du kannst jederzeit ein neues Logo hochladen."
                confirmLabel="Entfernen"
                action={() => removeClubLogoAction()}
                successMessage="Logo entfernt."
                onSuccess={() => router.refresh()}
              />
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
