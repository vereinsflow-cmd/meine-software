"use client";

import { useRef, useState, useTransition } from "react";
import { EllipsisIcon, PaperclipIcon, PencilIcon, Undo2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMoreActions } from "@/components/shared/more-actions";
import { formatCalendarDate } from "@/lib/dates";
import type { EntryFormOptions, LedgerAttachmentDto } from "../ledger";
import { reverseEntryAction } from "../ledger-actions";
import type { EntryInput } from "../ledger-schemas";
import { EntryDialog } from "./entry-dialog";
import { ReceiptsDialog } from "./receipts-dialog";

/** Ziel des Fokus, nachdem eine Buchung storniert oder korrigiert wurde (ihr „⋯“ gibt es danach nicht mehr). */
export const LEDGER_FOCUS_ID = "kassenbuch-anzahl";

/**
 * Menü „⋯“ einer Buchung: „Belege“ (ansehen, anhängen, Eigenbeleg), „Korrigieren“ (Storno und neue Buchung, vorausgefüllt)
 * und „Stornieren“ (mit Grund). Gelöscht wird nie – das Kassenbuch bleibt lückenlos.
 */
export function EntryActions({
  entry,
  options,
  maxUploadMb,
}: {
  entry: {
    id: string;
    label: string;
    description: string;
    /** Datum, das das Storno bekommt (das der Buchung, solange ihr Zeitraum offen ist). */
    reversalDate: Date;
    transfer: boolean;
    defaults: Partial<EntryInput>;
    attachments: LedgerAttachmentDto[];
    /** Belege dürfen entfernt werden (Zeitraum der Buchung offen). */
    receiptsRemovable: boolean;
  };
  options: EntryFormOptions | null;
  maxUploadMb: number;
}) {
  const { triggerRef, show, dialog } = useMoreActions<"receipts" | "reverse" | "correct">();
  // Nach Erfolg verschwindet „⋯“ (die Buchung ist storniert bzw. fällt aus „Ohne Beleg“) – der Fokus geht dann zur Zeile
  // über der Tabelle. Bleibt die Zeile stehen, ist das genauso gut erreichbar.
  const done = useRef(false);
  const closeFocus = (fallback: (event: Event) => void) => (event: Event) => {
    if (!done.current) return fallback(event);
    done.current = false;
    event.preventDefault();
    document.getElementById(LEDGER_FOCUS_ID)?.focus();
  };
  const receipts = dialog("receipts");
  const reverse = dialog("reverse");
  const correct = dialog("correct");
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            ref={triggerRef}
            variant="ghost"
            size="icon-sm"
            aria-label={`Weitere Aktionen für Buchung ${entry.label}`}
          >
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          collisionPadding={16}
          className="min-w-52 [&>[data-slot=dropdown-menu-item]]:gap-2 [&>[data-slot=dropdown-menu-item]]:py-2"
        >
          <DropdownMenuItem onSelect={() => show("receipts")}>
            <PaperclipIcon />{" "}
            {entry.attachments.length > 0
              ? `Belege (${entry.attachments.length})`
              : "Beleg anhängen"}
          </DropdownMenuItem>
          {options && (
            <DropdownMenuItem onSelect={() => show("correct")}>
              <PencilIcon /> Korrigieren
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => show("reverse")}>
            <Undo2Icon /> Stornieren
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ReceiptsDialog
        entry={entry}
        attachments={entry.attachments}
        removable={entry.receiptsRemovable}
        maxMb={maxUploadMb}
        open={receipts.open}
        onOpenChange={receipts.onOpenChange}
        onCloseAutoFocus={closeFocus(receipts.onCloseAutoFocus)}
        onAdded={() => (done.current = true)}
      />
      <ReverseDialog
        entry={entry}
        open={reverse.open}
        onOpenChange={reverse.onOpenChange}
        onCloseAutoFocus={closeFocus(reverse.onCloseAutoFocus)}
        onDone={() => (done.current = true)}
      />
      {options && (
        <EntryDialog
          options={options}
          defaults={entry.defaults}
          correct={{ id: entry.id, label: entry.label }}
          open={correct.open}
          onOpenChange={correct.onOpenChange}
          onCloseAutoFocus={closeFocus(correct.onCloseAutoFocus)}
          onSaved={() => (done.current = true)}
        />
      )}
    </>
  );
}

function ReverseDialog({
  entry,
  open,
  onOpenChange,
  onCloseAutoFocus,
  onDone,
}: {
  entry: { id: string; label: string; description: string; reversalDate: Date; transfer: boolean };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus: (event: Event) => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function change(next: boolean) {
    if (pending) return;
    // Jedes Öffnen beginnt leer – ein abgebrochener Grund oder alter Fehler bleibt nicht stehen.
    if (next) {
      setReason("");
      setError(null);
    }
    onOpenChange(next);
  }
  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (reason.trim().length < 3) {
      setError("Bitte gib kurz den Grund an.");
      return;
    }
    startTransition(async () => {
      const result = await reverseEntryAction({ id: entry.id, reason });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(`Buchung ${entry.label} storniert (Storno ${result.data.label}).`);
      onDone();
      onOpenChange(false);
    });
  }
  const errorId = `storno-${entry.id}-fehler`;
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>Buchung {entry.label} stornieren?</DialogTitle>
          <DialogDescription>
            „{entry.description}“ wird durch eine Gegenbuchung vom{" "}
            {formatCalendarDate(entry.reversalDate)} aufgehoben
            {entry.transfer ? " – bei einer Umbuchung beide Hälften" : ""}. Beide bleiben im
            Kassenbuch sichtbar.
          </DialogDescription>
        </DialogHeader>
        <form method="post" onSubmit={submit} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`storno-${entry.id}`}>Grund</Label>
            <Input
              id={`storno-${entry.id}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="z. B. doppelt erfasst"
              maxLength={140}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
            {error && (
              <p id={errorId} role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => change(false)}
              disabled={pending}
            >
              Abbrechen
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? "Einen Moment …" : "Stornieren"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
