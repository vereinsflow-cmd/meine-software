"use client";

import { AreaError } from "@/components/shared/area-error";

/** Fehler im Bereich Nachrichten: Menü und Kopfzeile bleiben stehen, nur der Bereich zeigt die Meldung (siehe `AreaError`). */
export default function NachrichtenError(props: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  return <AreaError {...props} title="Die Nachrichten konnten nicht geladen werden." />;
}
