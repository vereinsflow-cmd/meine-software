"use client";

import { AreaError } from "@/components/shared/area-error";

/**
 * Fehler im Einrichtungs-Assistenten: Der Rahmen bleibt, nur der Schritt zeigt die Meldung. „Nochmal versuchen“ lädt den
 * Schritt neu. (Ein Link auf `/einrichtung` hülfe hier nicht: Next.js setzt die Fehlermeldung nur bei einem anderen Pfad
 * zurück, nicht bei anderem `?schritt=`.)
 */
export default function SetupError(props: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  return <AreaError {...props} />;
}
