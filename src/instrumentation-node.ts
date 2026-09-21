import { parseEnv } from "@/server/env";

/**
 * Prüft die Konfiguration beim Start des Servers. Ist sie unvollständig oder unsicher (Platzhalter-Geheimnisse, kein
 * https, Mail nur ins Protokoll), wird der Prozess mit einer klaren Meldung beendet.
 *
 * Ein bloßer Fehler im Start-Hook genügt nicht: Next.js meldet ihn nur als "unhandledRejection" und läuft weiter –
 * der Server bliebe erreichbar, aber in einem halb gestarteten Zustand. Deshalb der harte Abbruch.
 */
export function validateConfigurationOrExit(): void {
  try {
    parseEnv();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n[VereinsFlow] Der Server wird nicht gestartet.\n${message}\n`);
    process.exit(1);
  }
}
