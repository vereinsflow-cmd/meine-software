import { LockIcon } from "lucide-react";
import { EmptyState } from "./empty-state";

/** Hinweis, wenn der Benutzer eine Seite ohne die nötige Berechtigung aufruft. */
export function NoAccess({ what = "diese Seite" }: { what?: string }) {
  return (
    <EmptyState
      icon={<LockIcon />}
      title="Kein Zugriff"
      description={`Für ${what} fehlt dir die Berechtigung. Wenn du glaubst, dass das ein Fehler ist, wende dich an den Vorstand deines Vereins.`}
    />
  );
}
