import { rebuildDatabase } from "../setup/rebuild-database";

export const PROD_SMOKE_DATABASE = "vf_prod_smoke";
export const PROD_SMOKE_STORAGE_DIR = ".local/prod-smoke-storage";

/** Frische Datenbank mit Demo-Daten für den Rauchtest gegen den Produktions-Build. */
export default async function globalSetup(): Promise<void> {
  await rebuildDatabase(PROD_SMOKE_DATABASE, PROD_SMOKE_STORAGE_DIR);
}
