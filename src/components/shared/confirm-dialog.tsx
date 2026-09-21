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
import type { ActionResult } from "@/lib/action-result";

/**
 * Bestätigungsdialog für folgenreiche Aktionen (Löschen, Absagen, …).
 * Barrierefrei: Fokus wird gefangen, Escape bricht ab, Titel und Beschreibung sind für Screenreader verknüpft.
 * Die Aktion wird erst nach der Bestätigung ausgeführt; Fehler erscheinen als Hinweis.
 */
export function ConfirmAction({
  trigger,
  title,
  description,
  confirmLabel,
  destructive = false,
  action,
  successMessage,
  onSuccess,
}: {
  trigger: React.ReactNode;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  action: () => Promise<ActionResult<unknown>>;
  successMessage?: string;
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Abbrechen</AlertDialogCancel>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await action();
                if (!result.ok) {
                  toast.error(result.error.message);
                  return;
                }
                if (successMessage) toast.success(successMessage);
                setOpen(false);
                onSuccess?.();
              })
            }
          >
            {pending ? "Einen Moment …" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
