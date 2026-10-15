"use client";

import { AreaError } from "@/components/shared/area-error";

/** Fehler beim Laden der Vereinseinstellungen: Menü und Kopfzeile bleiben, nur dieser Bereich zeigt die Meldung. */
export default function SettingsError(props: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  return <AreaError {...props} />;
}
