"use client";

import { AreaError } from "@/components/shared/area-error";

/** Fehler bei den Abteilungen (Übersicht oder eine Abteilung): der Weg zurück führt zu allen Abteilungen. */
export default function DepartmentsError(props: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  return <AreaError {...props} homeHref="/abteilungen" homeLabel="Zu allen Abteilungen" />;
}
