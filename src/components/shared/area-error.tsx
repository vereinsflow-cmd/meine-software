"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlertIcon } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

/**
 * Fehlermeldung eines Bereichs – für alle `error.tsx`-Dateien, damit jeder Fehler gleich aussieht und dasselbe anbietet:
 * ein ruhiger Satz (keine technischen Details), „Nochmal versuchen“ und ein Weg zurück. Menü und Kopfzeile bleiben stehen,
 * nur der Bereich wird ersetzt. Die `digest`-Kennung steht klein darunter: Mit ihr findet der Betreiber den Eintrag im
 * Server-Protokoll (Next.js entfernt Fehlertexte von Server-Komponenten in Produktion selbst).
 *
 * Aussehen wie leere Listen (`EmptyState` – dieselbe Karte, derselbe Symbolkreis, hier in Bernstein). „Nochmal versuchen“
 * ruft `retry` (lädt die Daten des Bereichs neu und zeichnet ihn neu) und nur ohne sie `reset` (zeichnet neu, ohne neu zu
 * laden). Der Text steht in einer `role="alert"`-Fläche: Screenreader hören sofort, was passiert ist. Die beiden Knöpfe sind
 * mit dem Finger 44 px hoch.
 */
export function AreaError({
  error,
  retry,
  reset,
  title = "Dieser Bereich konnte nicht geladen werden.",
  homeHref = "/dashboard",
  homeLabel = "Zur Übersicht",
  className,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset?: () => void;
  title?: string;
  /** Ziel des Wegs zurück – z. B. die Übersicht des Bereichs („/finanzen“). */
  homeHref?: string;
  homeLabel?: string;
  className?: string;
}) {
  useEffect(() => {
    console.error("Seitenfehler", error.digest ?? "");
  }, [error]);

  return (
    <EmptyState
      icon={<TriangleAlertIcon />}
      tone="amber"
      role="alert"
      title={title}
      description="Bitte versuche es gleich noch einmal. Klappt es weiterhin nicht, wende dich an den Vereinsadministrator."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            className="pointer-coarse:h-11"
            onClick={() => (retry ?? reset)?.()}
          >
            Nochmal versuchen
          </Button>
          <Button asChild variant="outline" className="pointer-coarse:h-11">
            <Link href={homeHref}>{homeLabel}</Link>
          </Button>
        </div>
      }
      footer={
        error.digest && (
          <p className="mt-3 text-xs text-muted-foreground">
            Kennung für den Support: <code className="rounded bg-muted px-1">{error.digest}</code>
          </p>
        )
      }
      className={className}
    />
  );
}
