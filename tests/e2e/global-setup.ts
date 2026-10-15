import { dropDatabase, rebuildDatabase } from "../setup/rebuild-database";
import { E2E_DATABASE, E2E_DEFAULT_DATABASE } from "./environment";

// Ort der hochgeladenen Test-Dateien, siehe STORAGE_DIR in playwright.config.ts.
const E2E_STORAGE_DIR = ".local/e2e-storage";

/**
 * Baut vor dem E2E-Lauf eine frische Datenbank auf und befüllt sie mit den Demo-Daten (Seed).
 * Die eigene Datenbank eines parallelen Laufs (E2E_DATABASE) wird danach wieder gelöscht – Playwright ruft die
 * zurückgegebene Funktion nach dem letzten Test auf. `vf_e2e` bleibt stehen, damit man nach einem Fehler hineinschauen kann.
 */
export default async function globalSetup(): Promise<(() => Promise<void>) | undefined> {
  await rebuildDatabase(E2E_DATABASE, E2E_STORAGE_DIR);
  if (E2E_DATABASE === E2E_DEFAULT_DATABASE) return undefined;
  return () => dropDatabase(E2E_DATABASE);
}
