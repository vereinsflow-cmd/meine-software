import "server-only";

/**
 * Erweiterungspunkt für einen Virenscanner (z. B. ClamAV) für Uploads.
 *
 * TODO (Betrieb, vor dem Produktivbetrieb entscheiden): Standardmäßig ist KEIN Scanner angebunden – `scanUpload` meldet
 * dann "unbedenklich", ohne etwas zu prüfen. Die Positivliste der Dateitypen, die Inhaltsprüfung und die Auslieferung als
 * Anhang mit `nosniff` und `sandbox`-CSP begrenzen das Risiko, ersetzen aber keinen Scanner. Wer einen betreibt, registriert
 * beim Start `registerUploadScanner(...)`; abgelehnte Dateien werden nie gespeichert.
 *
 * Damit das nicht unbemerkt bleibt, gibt es beim ersten Upload ohne Scanner eine Warnung im Server-Protokoll.
 */
export interface ScanResult {
  clean: boolean;
  /** Anzeige für den Benutzer, wenn die Datei abgelehnt wird (ohne technische Details). */
  reason?: string;
}

export type UploadScanner = (bytes: Uint8Array, meta: { name: string; mime: string }) => Promise<ScanResult>;

let scanner: UploadScanner | null = null;
let warned = false;

export function registerUploadScanner(next: UploadScanner | null): void {
  scanner = next;
}

export const hasUploadScanner = (): boolean => scanner !== null;

export async function scanUpload(bytes: Uint8Array, meta: { name: string; mime: string }): Promise<ScanResult> {
  if (!scanner) {
    if (!warned && process.env.NODE_ENV === "production") {
      warned = true;
      console.warn("[storage] Es ist kein Virenscanner für Uploads konfiguriert (siehe src/server/storage/scan.ts).");
    }
    return { clean: true };
  }
  return scanner(bytes, meta);
}
