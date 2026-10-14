"use client";

import { AreaError } from "@/components/shared/area-error";

/** Fehler im Bereich Aufgaben: Menü und Kopfzeile bleiben stehen, nur der Bereich zeigt die Meldung (siehe `AreaError`). */
export default function AufgabenError(props: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  return <AreaError {...props} title="Die Aufgaben konnten nicht geladen werden." />;
}
