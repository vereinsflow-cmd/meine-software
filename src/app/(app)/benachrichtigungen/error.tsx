"use client";

import { AreaError } from "@/components/shared/area-error";

/** Fehler im Bereich Benachrichtigungen: Menü und Kopfzeile bleiben stehen, nur der Bereich zeigt die Meldung (siehe `AreaError`). */
export default function BenachrichtigungenError(props: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  return <AreaError {...props} title="Die Benachrichtigungen konnten nicht geladen werden." />;
}
