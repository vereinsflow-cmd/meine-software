"use client";

import { AreaError } from "@/components/shared/area-error";

/**
 * Fehler beim Laden von „Hilfe & Support“ (auch „Eingegangene Meldungen“): Menü und Kopfzeile bleiben, nur dieser Bereich
 * zeigt die Meldung.
 */
export default function HelpError(props: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  return <AreaError {...props} />;
}
