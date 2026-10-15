"use client";

import { useId, useState, useTransition } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MenuDialogProps } from "@/components/shared/more-actions";
import type { ActionResult } from "@/lib/action-result";

/**
 * Rückfrage mit Pflicht-Grund (3–200 Zeichen) für „Stornieren“ einer Sach-/Aufwandsspende und „Sperren“ eines Spenders –
 * wie „Buchung stornieren“ im Kassenbuch. Jedes Öffnen beginnt leer; während des Speicherns schließt das Fenster nicht.
 */
export function ReasonDialog({
  title,
  description,
  placeholder,
  confirmLabel,
  successMessage,
  action,
  onDone,
  open,
  onOpenChange,
  onCloseAutoFocus,
}: MenuDialogProps & {
  title: string;
  description: React.ReactNode;
  placeholder: string;
  confirmLabel: string;
  successMessage: string;
  action: (reason: string) => Promise<ActionResult<unknown>>;
  onDone?: () => void;
}) {
  const id = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function change(next: boolean) {
    if (pending) return;
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
      let result: ActionResult<unknown>;
      try {
        result = await action(reason.trim());
      } catch {
        setError(
          "Die Verbindung wurde unterbrochen. Bitte lade die Seite neu und prüfe, ob es geklappt hat.",
        );
        return;
      }
      if (!result.ok) {
        setError(result.error.fieldErrors?.reason?.[0] ?? result.error.message);
        return;
      }
      toast.success(successMessage);
      onDone?.();
      onOpenChange(false);
    });
  }
  const errorId = `${id}-fehler`;
  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form method="post" onSubmit={submit} noValidate className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-grund`}>Grund</Label>
            <Input
              id={`${id}-grund`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={placeholder}
              maxLength={200}
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
              {pending ? "Einen Moment …" : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
