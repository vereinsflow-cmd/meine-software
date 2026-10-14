"use client";

import { AreaError } from "@/components/shared/area-error";

/** Fehler in der Mitgliederverwaltung (Liste, Mitglied, Formulare, Import, Anträge): der Weg zurück führt zur Liste. */
export default function MembersError(props: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  return <AreaError {...props} homeHref="/mitglieder" homeLabel="Zur Mitgliederliste" />;
}
