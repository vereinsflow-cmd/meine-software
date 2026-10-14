import "server-only";
import { runAction, type ActionResult } from "./action";

/**
 * `runAction` für Änderungen: Nach einer GELUNGENEN Änderung ruft es `refresh` auf – die `revalidatePath`-Aufrufe des
 * Bereichs –, bevor das Ergebnis zurückgeht; so zeigt die Seite sofort den neuen Stand. Schlägt die Änderung fehl
 * (Prüfung, Rechte, Datenbank), bleibt der Seiten-Cache unberührt und `refresh` läuft nicht.
 *
 * Was `fn` liefert, geht unverändert an den Browser – Aktionen ohne Rückgabe schreiben deshalb `return undefined`
 * ausdrücklich hin, damit kein Ergebnis eines Dienstes versehentlich mitgeschickt wird.
 */
export function runActionAndRefresh<T>(
  scope: string,
  refresh: () => void,
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  return runAction(async () => {
    const result = await fn();
    refresh();
    return result;
  }, scope);
}
