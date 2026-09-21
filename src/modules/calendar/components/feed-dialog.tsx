"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarSyncIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";
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
import { ConfirmAction } from "@/components/shared/confirm-dialog";
import { createFeedLinkAction, revokeFeedLinkAction } from "../actions";

/**
 * Persönlichen Kalender-Abo-Link verwalten. Der Link wird nur direkt nach dem Erzeugen angezeigt (auf dem Server
 * steht nur ein Hash) – danach kann man ihn nur erneuern oder widerrufen.
 */
export function FeedDialog({
  active,
  createdLabel,
  lastUsedLabel,
}: {
  active: boolean;
  createdLabel: string | null;
  lastUsedLabel: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function create() {
    startTransition(async () => {
      const result = await createFeedLinkAction();
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      setUrl(result.data.url);
      router.refresh();
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link kopiert.");
    } catch {
      toast.error("Kopieren ist hier nicht möglich – markiere den Link und kopiere ihn von Hand.");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setUrl(null); // Der Klartext-Link verschwindet beim Schließen.
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <CalendarSyncIcon /> Abonnieren
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Kalender abonnieren</DialogTitle>
          <DialogDescription>
            Zeige alle Termine und deine Helferschichten in Google Kalender, Apple Kalender oder
            Outlook. Der Kalender aktualisiert sich automatisch.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {url ? (
            <div className="grid gap-2">
              <Label htmlFor="abo-link">Dein persönlicher Link</Label>
              <div className="flex gap-2">
                <Input
                  id="abo-link"
                  readOnly
                  value={url}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button type="button" variant="secondary" onClick={copy}>
                  <CopyIcon /> Kopieren
                </Button>
              </div>
              <p className="text-sm" role="note">
                Diesen Link siehst du nur jetzt. Behandle ihn wie ein Passwort: Wer ihn kennt, sieht
                deine Termine. Du kannst ihn jederzeit erneuern – der alte Link funktioniert dann
                nicht mehr.
              </p>
            </div>
          ) : active ? (
            <p className="text-sm">
              Ein Abo-Link ist aktiv{createdLabel ? ` (erzeugt am ${createdLabel}` : ""}
              {createdLabel
                ? lastUsedLabel
                  ? `, zuletzt abgerufen am ${lastUsedLabel})`
                  : ", noch nicht abgerufen)"
                : ""}
              . Aus Sicherheitsgründen wird er nicht erneut angezeigt. Erzeuge einen neuen Link,
              wenn du ihn in einem weiteren Kalender einrichten möchtest.
            </p>
          ) : (
            <p className="text-sm">
              Du hast noch keinen Abo-Link. Erzeuge einen, um deinen Kalender in einer Kalender-App
              zu abonnieren.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button onClick={create} disabled={pending}>
              {pending ? "Einen Moment …" : active || url ? "Neuen Link erzeugen" : "Link erzeugen"}
            </Button>
            {(active || url) && (
              <ConfirmAction
                destructive
                trigger={
                  <Button variant="outline" className="text-destructive">
                    Link widerrufen
                  </Button>
                }
                title="Abo-Link widerrufen?"
                description="Kalender-Apps, die diesen Link nutzen, erhalten keine Termine mehr. Du kannst jederzeit einen neuen Link erzeugen."
                confirmLabel="Widerrufen"
                action={revokeFeedLinkAction}
                successMessage="Der Abo-Link wurde widerrufen."
                onSuccess={() => {
                  setUrl(null);
                  router.refresh();
                }}
              />
            )}
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer font-medium">So richtest du das Abo ein</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Google Kalender: „Weitere Kalender“ (+) → „Per URL“ → Link einfügen.</li>
              <li>Apple Kalender: Ablage → „Neues Kalenderabonnement“ → Link einfügen.</li>
              <li>
                Outlook: „Kalender hinzufügen“ → „Aus dem Internet abonnieren“ → Link einfügen.
              </li>
            </ul>
          </details>
        </div>
      </DialogContent>
    </Dialog>
  );
}
