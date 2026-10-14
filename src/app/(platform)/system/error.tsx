"use client";

import { AreaError } from "@/components/shared/area-error";

/**
 * Fehler in der Systemadministration: Die Kopfzeile bleibt, nur die Seite zeigt die Meldung. „Nochmal versuchen“ lädt die
 * Kennzahlen neu; „Zur Übersicht“ führt zum Dashboard des Vereins (ohne Verein leitet es zurück zur Systemseite).
 */
export default function SystemError(props: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  return <AreaError {...props} />;
}
