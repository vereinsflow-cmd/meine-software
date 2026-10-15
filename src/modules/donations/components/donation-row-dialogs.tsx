"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmAction } from "@/components/shared/confirm-dialog";
import { ALLOWED_EXTENSIONS_TEXT, clientFileError } from "@/lib/uploads";
import { ReceiptPicker } from "@/modules/finance/components/receipt-picker";
import {
  attachDonationNoteAction,
  removeDonationAttachmentAction,
  unassignDonationAction,
  voidDonationAction,
} from "../actions";
import { loadDonationEvidenceAction } from "../dialog-actions";
import type { DonationEvidenceData } from "../dialog-data";
import {
  DialogLoadError,
  DialogLoading,
  ReasonDialog,
  uploadDonationEvidence,
  useDialogData,
} from "./form-parts";

/**
 * Kleine Fenster zu einer Spende (Zeilenaktionen der Liste „Alle Spenden“): stornieren (Sach- und Aufwandsspenden),
 * Kennzeichnung zurücknehmen (Geld) und Nachweise.
 */

/** Sach- oder Aufwandsspende stornieren (mit Grund). Eine Geldspende storniert man über ihre Buchung. */
export function VoidDonationDialog({
  donation,
  open,
  onOpenChange,
  onCloseAutoFocus,
  onDone,
}: {
  /** `label`: „Sachspende 180,00 € von Getränke Jansen e.K.“ o. Ä. */
  donation: { id: string; label: string };
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
      title="Spende stornieren?"
      description={`„${donation.label}“ zählt danach nirgends mehr mit. Gelöscht wird nichts – die Spende bleibt mit dem Grund unter „Storniert“ sichtbar.`}
      placeholder="z. B. doppelt erfasst"
      confirmLabel="Stornieren"
      destructive
      action={(reason) => voidDonationAction({ id: donation.id, reason })}
      successMessage="Spende storniert."
      onDone={onDone}
    />
  );
}

/** Geld: „Kennzeichnung zurücknehmen“ – die Buchung bleibt im Kassenbuch, nur ohne Spender („Spender fehlt“). */
export function UnassignDonationDialog({
  donation,
  open,
  onOpenChange,
  onCloseAutoFocus,
  onDone,
}: {
  donation: { id: string; label: string };
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
      title="Kennzeichnung zurücknehmen?"
      description={`„${donation.label}“ bleibt im Kassenbuch und zählt weiter als Spende – nur ohne Spender („Spender fehlt“). Angehängte Nachweise werden entfernt.`}
      confirmLabel="Zurücknehmen"
      action={() => unassignDonationAction({ id: donation.id })}
      successMessage="Kennzeichnung zurückgenommen."
      onSuccess={() => {
        onDone?.();
        router.refresh();
      }}
    />
  );
}

/**
 * „Nachweise“ einer Spende: Rechnung oder Gutachten zur Bewertung, Abrechnung und Verzichtserklärung – als Datei oder
 * kurzer Vermerk. Ansehen mit `finance:read`; anhängen und entfernen mit `finance:manage` (nicht bei stornierten
 * Spenden). Nachweise werden 10 Jahre aufbewahrt.
 */
export function EvidenceDialog({
  donation,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: {
  donation: { id: string; label: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  // Während des Hochladens lässt sich das Fenster nicht schließen.
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto" onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Nachweise zur Spende</DialogTitle>
          <DialogDescription>
            {donation.label} – zum Beispiel Rechnung, Gutachten, Abrechnung oder Verzichtserklärung.
            Nachweise werden 10 Jahre aufbewahrt.
          </DialogDescription>
        </DialogHeader>
        <EvidenceBody donationId={donation.id} onBusy={setBusy} />
      </DialogContent>
    </Dialog>
  );
}

function EvidenceBody({
  donationId,
  onBusy,
}: {
  donationId: string;
  onBusy: (busy: boolean) => void;
}) {
  const { state, retry, refresh } = useDialogData(() => loadDonationEvidenceAction({ donationId }));
  if (state.status === "loading") return <DialogLoading />;
  if (state.status === "error") return <DialogLoadError message={state.message} onRetry={retry} />;
  return (
    <EvidenceList donationId={donationId} data={state.data} onBusy={onBusy} onChanged={refresh} />
  );
}

function EvidenceList({
  donationId,
  data,
  onBusy,
  onChanged,
}: {
  donationId: string;
  data: DonationEvidenceData;
  onBusy: (busy: boolean) => void;
  onChanged: () => void;
}) {
  const router = useRouter();
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  /** Nachweis, bei dem „Entfernen“ einmal gedrückt wurde und jetzt „Wirklich entfernen?“ fragt. */
  const [confirmId, setConfirmId] = useState<string | null>(null);

  function run(task: () => Promise<boolean>, success: string) {
    setError(null);
    onBusy(true);
    startTransition(async () => {
      try {
        if (await task()) {
          toast.success(success);
          onChanged();
          router.refresh();
        }
      } catch {
        setError("Die Verbindung wurde unterbrochen. Bitte versuche es erneut.");
      } finally {
        onBusy(false);
        setUploading(null);
      }
    });
  }

  function upload(file: File) {
    const problem = clientFileError(file, data.maxUploadMb);
    if (problem) {
      setError(problem);
      return;
    }
    setUploading(file.name);
    run(async () => {
      const result = await uploadDonationEvidence(donationId, file);
      if (!result.ok) setError(result.message);
      return result.ok;
    }, `„${file.name}“ angehängt.`);
  }

  function saveNote(event: React.FormEvent) {
    event.preventDefault();
    if (note.trim().length < 3) {
      setError("Bitte beschreibe den Nachweis kurz.");
      return;
    }
    run(async () => {
      const result = await attachDonationNoteAction({ donationId, note });
      if (!result.ok) {
        setError(result.error.fieldErrors?.note?.join(" ") ?? result.error.message);
        return false;
      }
      setNote("");
      return true;
    }, "Vermerk gespeichert.");
  }

  function remove(item: DonationEvidenceData["items"][number]) {
    // Erst nachfragen: Der Knopf steht direkt neben dem Link zur Datei.
    if (confirmId !== item.id) {
      setConfirmId(item.id);
      return;
    }
    setConfirmId(null);
    run(
      async () => {
        const result = await removeDonationAttachmentAction({ id: item.id });
        if (!result.ok) setError(result.error.message);
        return result.ok;
      },
      item.name ? `„${item.name}“ entfernt.` : "Vermerk entfernt.",
    );
  }

  const errorId = `${id}-fehler`;
  return (
    <div className="grid gap-5">
      {data.items.length > 0 ? (
        <ul className="grid gap-2" aria-label="Angehängte Nachweise">
          {data.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
              {item.documentId ? (
                <a
                  href={`/api/finanzen/spenden/nachweise/${item.id}`}
                  className="min-w-0 font-medium break-words text-primary underline-offset-4 hover:underline"
                >
                  <span className="sr-only">Nachweis herunterladen: </span>
                  {item.name}
                </a>
              ) : (
                <span className="min-w-0 break-words">
                  <span className="font-medium">Vermerk:</span> {item.note}
                </span>
              )}
              {data.canManage && (
                <Button
                  type="button"
                  variant={confirmId === item.id ? "destructive" : "ghost"}
                  size="sm"
                  className="-my-1 shrink-0"
                  disabled={pending}
                  onClick={() => remove(item)}
                  onBlur={() => setConfirmId((current) => (current === item.id ? null : current))}
                  aria-label={
                    confirmId === item.id
                      ? "Wirklich entfernen? Zum Bestätigen noch einmal drücken."
                      : item.name
                        ? `„${item.name}“ entfernen`
                        : "Vermerk entfernen"
                  }
                >
                  {confirmId === item.id ? "Wirklich entfernen?" : "Entfernen"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Noch kein Nachweis angehängt.</p>
      )}

      {data.canManage && (
        <>
          <div className="grid gap-1.5">
            <p id={`${id}-datei-titel`} className="text-sm font-medium">
              Datei anhängen
            </p>
            <ReceiptPicker
              id={`${id}-datei`}
              label="Datei hochladen"
              labelledBy={`${id}-datei-titel`}
              describedBy={`${id}-hinweis`}
              disabled={pending}
              onFile={upload}
            />
            {uploading ? (
              <p role="status" className="text-sm">
                „{uploading}“ wird hochgeladen …
              </p>
            ) : (
              <p id={`${id}-hinweis`} className="text-xs text-muted-foreground">
                {ALLOWED_EXTENSIONS_TEXT}, höchstens {data.maxUploadMb} MB. Ein Foto genügt.
              </p>
            )}
          </div>
          <form method="post" onSubmit={saveNote} noValidate className="grid gap-1.5">
            <Label htmlFor={`${id}-vermerk`}>Oder ein Vermerk</Label>
            <Textarea
              id={`${id}-vermerk`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              maxLength={500}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
              placeholder="z. B. Fahrtenbuch liegt beim Kassenwart"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={pending}
              className="justify-self-start"
            >
              Vermerk speichern
            </Button>
          </form>
        </>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
