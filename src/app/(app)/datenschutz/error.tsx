"use client";

import { AreaError } from "@/components/shared/area-error";

/** Fehler beim Laden der Datenschutzseite: Menü und Kopfzeile bleiben, nur dieser Bereich zeigt die Meldung. */
export default function PrivacyError(props: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  return <AreaError {...props} />;
}
