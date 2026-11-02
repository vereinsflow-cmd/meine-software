"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/shared/form-fields";
import type { ActionResult } from "@/lib/action-result";

/**
 * Bestätigungsdialog für folgenreiche Aktionen (Löschen, Absagen, …).
 * Barrierefrei: Fokus wird gefangen, Escape bricht ab, Titel und Beschreibung sind für Screenreader verknüpft.
 * Die Aktion wird erst nach der Bestätigung ausgeführt. Scheitert sie, bleibt das Fenster offen und die Meldung steht darin
 * (`role="alert"`), bis man erneut bestätigt oder abbricht – ein Toast wäre nach wenigen Sekunden weg und läge am Handy
 * hinter dem Fenster.
 * Ohne `trigger` wird der Dialog von außen geöffnet (`open`/`onOpenChange`, z. B. aus „Weitere Aktionen“,
 * siehe `useMoreActions`); `onCloseAutoFocus` bestimmt dann, wohin der Fokus nach dem Schließen zurückkehrt.
 */
export function ConfirmAction({
  trigger,
  open: openProp,
  onOpenChange,
  onCloseAutoFocus,
  title,
  description,
  confirmLabel,
  destructive = false,
  action,
  successMessage,
  onSuccess,
  children,
}: {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  action: () => Promise<ActionResult<unknown>>;
  successMessage?: string;
  onSuccess?: () => void;
  /** Zusätzliche Wahl im Fenster, z. B. „Alle Termine dieser Serie veröffentlichen“. */
  children?: React.ReactNode;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = openProp ?? ownOpen;
  const setOpenOutside = onOpenChange ?? setOwnOpen;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const setOpen = (next: boolean) => {
    if (!next) setError(null);
    setOpenOutside(next);
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger && <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>}
      <AlertDialogContent onCloseAutoFocus={onCloseAutoFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <FormError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Abbrechen</AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={() => {
              setError(null); // Die alte Meldung verschwindet sofort, eine neue wird wieder vorgelesen.
              startTransition(async () => {
                let result: Awaited<ReturnType<typeof action>>;
                try {
                  result = await action();
                } catch {
                  // Offline oder neue App-Version: Meldung statt Fehlerseite.
                  setError(
                    "Die Verbindung wurde unterbrochen. Bitte lade die Seite neu und prüfe, ob es geklappt hat.",
                  );
                  return;
                }
                if (!result.ok) {
                  setError(result.error.message);
                  return;
                }
                if (successMessage) toast.success(successMessage);
                setOpen(false);
                onSuccess?.();
              });
            }}
          >
            {pending ? "Einen Moment …" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
