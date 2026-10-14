"use client";

import { AreaError } from "@/components/shared/area-error";

/** Fehler in „Benutzer und Rollen“: Die Seite hat keine Unterseiten – der Weg zurück führt zur Übersicht (Dashboard). */
export default function UsersError(props: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  return <AreaError {...props} />;
}
