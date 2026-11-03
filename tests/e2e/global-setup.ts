import { dropDatabase, rebuildDatabase } from "../setup/rebuild-database";
import { berlinToday } from "./dates";
import { E2E_DATABASE, E2E_DEFAULT_DATABASE } from "./environment";

// Ort der hochgeladenen Test-Dateien, siehe STORAGE_DIR in playwright.config.ts.
const E2E_STORAGE_DIR = ".local/e2e-storage";

/**
 * Baut vor dem E2E-Lauf eine frische Datenbank auf und befüllt sie mit den Demo-Daten (Seed).
 * Die eigene Datenbank eines parallelen Laufs (E2E_DATABASE) wird danach wieder gelöscht – Playwright ruft die
 * zurückgegebene Funktion nach dem letzten Test auf. `vf_e2e` bleibt stehen, damit man nach einem Fehler hineinschauen kann.
 *
 * Der Tag des Seeds steht danach in E2E_SEED_DAY – Playwright gibt die hier gesetzten Umgebungsvariablen an die Testprozesse
 * weiter (`seedDay()` in dates.ts). Wer ihn vorgibt (z. B. E2E_SEED_DAY=<gestern>), stellt einen Lauf nach, der vor
 * Mitternacht begann.
 */
export default async function globalSetup(): Promise<(() => Promise<void>) | undefined> {
  const seedDay = process.env.E2E_SEED_DAY?.trim() || berlinToday();
  const parsed = new Date(`${seedDay}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== seedDay) {
    throw new Error(`E2E_SEED_DAY muss ein Datum „JJJJ-MM-TT“ sein (ist: "${seedDay}").`);
  }
  process.env.E2E_SEED_DAY = seedDay;
  await rebuildDatabase(E2E_DATABASE, E2E_STORAGE_DIR, seedDay);
  if (E2E_DATABASE === E2E_DEFAULT_DATABASE) return undefined;
  return () => dropDatabase(E2E_DATABASE);
}
