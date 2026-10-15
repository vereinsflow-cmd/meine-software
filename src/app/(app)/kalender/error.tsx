"use client";

import { AreaError } from "@/components/shared/area-error";

/** Fehler im Kalender: verständliche Meldung statt leerer Seite, „Nochmal versuchen“ und der Weg zur Übersicht. */
export default function KalenderError(props: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  return <AreaError {...props} />;
}
