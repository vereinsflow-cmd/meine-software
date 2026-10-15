"use client";

import { AreaError } from "@/components/shared/area-error";

/** Fehler beim Laden von „Mein Profil“: Menü und Kopfzeile bleiben, nur dieser Bereich zeigt die Meldung. */
export default function ProfileError(props: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  return <AreaError {...props} />;
}
