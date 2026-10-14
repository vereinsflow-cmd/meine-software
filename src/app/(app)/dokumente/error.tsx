"use client";

import { AreaError } from "@/components/shared/area-error";

/** Fehler im Bereich Dokumente: Menü und Kopfzeile bleiben stehen, nur der Bereich zeigt die Meldung (siehe `AreaError`). */
export default function DokumenteError(props: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  return <AreaError {...props} title="Die Dokumente konnten nicht geladen werden." />;
}
