"use client";

import { AreaError } from "@/components/shared/area-error";

/**
 * Fehler in einem Bereich der Finanzen (Übersicht, Beiträge, Kassenbuch, Rechnungen, Abschluss, Einstellungen): ruhige
 * Meldung mit „Nochmal versuchen“ und dem Weg zur Finanzübersicht (`AreaError`).
 */
export default function FinanzenError(props: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  return <AreaError {...props} homeHref="/finanzen" homeLabel="Zur Finanzübersicht" />;
}
