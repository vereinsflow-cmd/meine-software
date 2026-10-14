"use client";

import { AreaError } from "@/components/shared/area-error";

/**
 * Fängt unerwartete Fehler beim Darstellen einer Seite ab. Benutzer sehen eine verständliche Meldung –
 * niemals technische Details. Aussehen und Text kommen aus `AreaError`, wie in den `error.tsx` der einzelnen Bereiche.
 */
export default function AppError({
  error,
  retry,
  reset,
}: {
  error: Error & { digest?: string };
  retry?: () => void;
  reset: () => void;
}) {
  return <AreaError error={error} retry={retry} reset={reset} />;
}
