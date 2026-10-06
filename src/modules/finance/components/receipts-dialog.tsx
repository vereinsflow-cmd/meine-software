"use client";

import { useState, useTransition } from "react";
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
import { ALLOWED_EXTENSIONS_TEXT, clientFileError } from "@/lib/uploads";
import type { LedgerAttachmentDto } from "../ledger";
import { attachReceiptNoteAction, removeAttachmentAction } from "../ledger-actions";
import { ReceiptPicker } from "./receipt-picker";

/** Lädt eine Belegdatei zu einer Buchung hoch (eigene Anfrage, wie bei „Dokumente“). */
export async function uploadReceipt(
  entryId: string,
  file: File,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const body = new FormData();
  body.set("entryId", entryId);
  body.set("file", file);
  try {
    const response = await fetch("/api/finanzen/belege", { method: "POST", body });
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
        "Der Beleg ließ sich nicht hochladen. Bitte versuche es erneut.",
    };
  } catch {
    return { ok: false, message: "Die Verbindung wurde unterbrochen. Bitte versuche es erneut." };
  }
}

/**
 * „Belege“ einer Buchung: angehängte Dateien und Eigenbeleg ansehen, eine Datei anhängen oder – wenn es keinen Beleg gibt –
 * einen Eigenbeleg schreiben. Entfernen geht nur im offenen Zeitraum (sonst blendet die Seite den Knopf aus).
 */
export function ReceiptsDialog({
  entry,
  attachments,
  removable,
  maxMb,
  open,
  onOpenChange,
  onCloseAutoFocus,
  onAdded,
}: {
  entry: { id: string; label: string; description: string };
  attachments: LedgerAttachmentDto[];
  removable: boolean;
  maxMb: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  /**
   * Nach dem Anhängen schließt das Fenster: In der Ansicht „Ohne Beleg“ verschwindet die Zeile samt „⋯“ – der Fokus geht
   * dann zur Zeile über der Tabelle (siehe `EntryActions`).
   */
  onAdded?: () => void;
}) {
  // Ein offenes Fenster lässt sich während des Speicherns nicht schließen.
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Belege zu Buchung {entry.label}</DialogTitle>
          <DialogDescription>
            „{entry.description}“ – Quittung, Rechnung oder Kontoauszug. Belege werden 8 Jahre
            aufbewahrt.
          </DialogDescription>
        </DialogHeader>
        {/* Der Inhalt entsteht bei jedem Öffnen neu – ein alter Fehler oder halber Text bleibt nicht stehen. */}
        <ReceiptsBody
          entry={entry}
          attachments={attachments}
          removable={removable}
          maxMb={maxMb}
          onBusy={setBusy}
          onAdded={() => {
            onAdded?.();
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function ReceiptsBody({
  entry,
  attachments,
  removable,
  maxMb,
  onBusy,
  onAdded,
}: {
  entry: { id: string; label: string };
  attachments: LedgerAttachmentDto[];
  removable: boolean;
  maxMb: number;
  onBusy: (busy: boolean) => void;
  onAdded: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  /** Datei, die gerade hochgeladen wird (für „Wird hochgeladen …“). */
  const [uploading, setUploading] = useState<string | null>(null);
  /** Beleg, bei dem „Entfernen“ einmal gedrückt wurde und jetzt „Wirklich entfernen?“ fragt. */
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const hasNote = attachments.some((a) => a.note !== null);

  function run(task: () => Promise<void>) {
    setError(null);
    onBusy(true);
    startTransition(async () => {
      try {
        await task();
      } finally {
        onBusy(false);
        setUploading(null);
      }
    });
  }

  function upload(file: File) {
    const problem = clientFileError(file, maxMb);
    if (problem) {
      setError(problem);
      return;
    }
    setUploading(file.name);
    run(async () => {
      const result = await uploadReceipt(entry.id, file);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast.success(`Beleg an Buchung ${entry.label} angehängt.`);
      onAdded();
      router.refresh();
    });
  }

  function saveNote(event: React.FormEvent) {
    event.preventDefault();
    if (note.trim().length < 3) {
      setError("Bitte beschreibe kurz, was bezahlt wurde und warum es keinen Beleg gibt.");
      return;
    }
    run(async () => {
      const result = await attachReceiptNoteAction({ entryId: entry.id, note });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(`Eigenbeleg zu Buchung ${entry.label} gespeichert.`);
      onAdded();
      router.refresh();
    });
  }

  function remove(attachment: LedgerAttachmentDto) {
    // Erst nachfragen: ein Eigenbeleg ist danach weg, und der Knopf steht direkt neben dem Link zum Beleg.
    if (confirmId !== attachment.id) {
      setConfirmId(attachment.id);
      return;
    }
    setConfirmId(null);
    run(async () => {
      const result = await removeAttachmentAction({ id: attachment.id });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(attachment.name ? `„${attachment.name}“ entfernt.` : "Eigenbeleg entfernt.");
      router.refresh();
    });
  }

  const errorId = `beleg-${entry.id}-fehler`;
  return (
    <div className="grid gap-5">
      {attachments.length > 0 ? (
        <ul className="grid gap-2" aria-label="Angehängt">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex items-start justify-between gap-3 text-sm">
              {attachment.documentId ? (
                <a
                  href={`/api/finanzen/belege/${attachment.id}`}
                  className="min-w-0 font-medium break-words text-primary underline-offset-4 hover:underline"
                >
                  {attachment.name}
                </a>
              ) : (
                <span className="min-w-0">
                  <span className="font-medium">Eigenbeleg:</span> {attachment.note}
                </span>
              )}
              {removable && !attachment.locked && (
                <Button
                  type="button"
                  variant={confirmId === attachment.id ? "destructive" : "ghost"}
                  size="sm"
                  className="-my-1 shrink-0"
                  disabled={pending}
                  onClick={() => remove(attachment)}
                  onBlur={() => setConfirmId((id) => (id === attachment.id ? null : id))}
                  aria-label={
                    confirmId === attachment.id
                      ? "Wirklich entfernen? Zum Bestätigen noch einmal drücken."
                      : attachment.name
                        ? `„${attachment.name}“ entfernen`
                        : "Eigenbeleg entfernen"
                  }
                >
                  {confirmId === attachment.id ? "Wirklich entfernen?" : "Entfernen"}
                </Button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Noch kein Beleg angehängt.</p>
      )}

      <div className="grid gap-1.5">
        <p id={`beleg-${entry.id}-datei-titel`} className="text-sm font-medium">
          Datei anhängen
        </p>
        <ReceiptPicker
          id={`beleg-${entry.id}-datei`}
          label="Datei hochladen"
          labelledBy={`beleg-${entry.id}-datei-titel`}
          describedBy={`beleg-${entry.id}-hinweis`}
          disabled={pending}
          onFile={upload}
        />
        {uploading ? (
          <p role="status" className="text-sm">
            „{uploading}“ wird hochgeladen …
          </p>
        ) : (
          <p id={`beleg-${entry.id}-hinweis`} className="text-xs text-muted-foreground">
            {ALLOWED_EXTENSIONS_TEXT}, höchstens {maxMb} MB. Ein Foto vom Kassenbon genügt.
          </p>
        )}
      </div>

      {!hasNote && (
        <form method="post" onSubmit={saveNote} noValidate className="grid gap-1.5">
          <Label htmlFor={`beleg-${entry.id}-text`}>Kein Beleg vorhanden? Eigenbeleg</Label>
          <Textarea
            id={`beleg-${entry.id}-text`}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            maxLength={500}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            placeholder="z. B. Parkgebühr Turnier Kassel, Automat gab keine Quittung"
          />
          <Button
            type="submit"
            variant="outline"
            size="sm"
            disabled={pending}
            className="justify-self-start"
          >
            Eigenbeleg speichern
          </Button>
        </form>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
