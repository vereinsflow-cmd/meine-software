"use client";

import { useEffect } from "react";
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

/**
 * Fängt unerwartete Fehler beim Darstellen einer Seite ab. Benutzer sehen eine verständliche Meldung –
 * niemals technische Details. (Next.js entfernt Fehlertexte von Server-Komponenten in Produktion selbst; die
 * `digest`-Kennung erlaubt dem Betreiber, den Eintrag im Server-Protokoll zu finden.)
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Seitenfehler", error.digest ?? "");
  }, [error]);

  return (
    <EmptyState
      icon={<TriangleAlertIcon />}
      title="Etwas ist schiefgelaufen"
      description={
        <>
          Die Seite konnte nicht geladen werden. Bitte versuche es erneut. Besteht das Problem
          weiter, informiere den Vereinsadministrator
          {error.digest && (
            <>
              {" "}
              und nenne diese Kennung: <code className="rounded bg-muted px-1">{error.digest}</code>
            </>
          )}
          .
        </>
      }
      action={<Button onClick={reset}>Erneut versuchen</Button>}
    />
  );
}
