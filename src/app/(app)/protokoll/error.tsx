"use client";

import { AreaError } from "@/components/shared/area-error";

/** Fehler beim Laden des Änderungsprotokolls: Menü und Kopfzeile bleiben, nur dieser Bereich zeigt die Meldung. */
export default function AuditLogError(props: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  return <AreaError {...props} />;
}
