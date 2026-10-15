"use client";

import { AreaError } from "@/components/shared/area-error";

/**
 * Fehler in den Veranstaltungen (Liste, Detailseite, Formular): verständliche Meldung, „Nochmal versuchen“ und der Weg
 * zurück zur Liste.
 */
export default function VeranstaltungenError(props: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  return <AreaError {...props} homeHref="/veranstaltungen" homeLabel="Alle Veranstaltungen" />;
}
