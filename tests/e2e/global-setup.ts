import { rebuildDatabase } from "../setup/rebuild-database";

const E2E_DATABASE = "vf_e2e";
// Ort der hochgeladenen Test-Dateien, siehe STORAGE_DIR in playwright.config.ts.
const E2E_STORAGE_DIR = ".local/e2e-storage";

/**
 * Baut vor dem E2E-Lauf eine frische Datenbank auf und befüllt sie mit den Demo-Daten (Seed).
 */
export default async function globalSetup(): Promise<void> {
  await rebuildDatabase(E2E_DATABASE, E2E_STORAGE_DIR);
}
