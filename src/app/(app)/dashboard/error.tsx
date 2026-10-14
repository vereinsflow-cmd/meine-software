"use client";

import { AreaError } from "@/components/shared/area-error";

/**
 * Fehler beim Laden des Dashboards: ruhige Meldung mit „Nochmal versuchen“ (`AreaError`). Der Weg zurück führt hier zur
 * Hilfe – „Zur Übersicht“ wäre das Dashboard selbst.
 */
export default function DashboardError(props: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  return (
    <AreaError
      {...props}
      title="Das Dashboard konnte nicht geladen werden."
      homeHref="/hilfe"
      homeLabel="Zur Hilfe"
    />
  );
}
