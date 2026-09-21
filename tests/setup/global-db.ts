import pg from "pg";
import { ADMIN_DATABASE_URL, databaseUrlFor } from "./env";
import { applyMigrations, insertPermissionCatalog } from "./migrate";

/**
 * Wird einmal vor allen Integrationstests ausgeführt: baut eine Vorlagen-Datenbank auf
 * (alle Migrationen + Berechtigungskatalog). Jede Testdatei kopiert sie danach in Millisekunden.
 */
export const TEMPLATE_DB = "vf_test_template";

export async function setup(): Promise<void> {
  const admin = new pg.Client({ connectionString: ADMIN_DATABASE_URL });
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(
      `Keine Verbindung zur Test-Datenbank (${ADMIN_DATABASE_URL.replace(/:[^:@/]+@/, ":***@")}).\n` +
        `Starte PostgreSQL mit "docker compose up -d" oder "npm run db:embedded" – siehe README.\n` +
        `Ursache: ${(error as Error).message}`,
    );
  }

  await admin.query(`DROP DATABASE IF EXISTS ${TEMPLATE_DB} WITH (FORCE)`);
  // Kodierung ausdrücklich UTF8 (nicht die Standardkodierung des Clusters): Vereinsdaten enthalten beliebige Namen.
  await admin.query(`CREATE DATABASE ${TEMPLATE_DB} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();

  const template = new pg.Client({ connectionString: databaseUrlFor(TEMPLATE_DB) });
  await template.connect();
  await applyMigrations(template);
  await insertPermissionCatalog(template);
  await template.end();
}
