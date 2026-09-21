import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";
import { PERMISSIONS, PERMISSION_KEYS } from "../../src/server/permissions/catalog";

/**
 * Baut das Datenbankschema aus den SQL-Migrationen auf und füllt den Berechtigungskatalog.
 * Gemeinsam genutzt von den Integrationstests (Vorlagen-Datenbank) und den E2E-Tests.
 */
export async function applyMigrations(client: pg.Client): Promise<void> {
  const migrationsDir = path.resolve(__dirname, "../../prisma/migrations");
  const folders = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const folder of folders) {
    const sql = readFileSync(path.join(migrationsDir, folder, "migration.sql"), "utf8");
    await client.query(sql);
  }
}

export async function insertPermissionCatalog(client: pg.Client): Promise<void> {
  for (const key of PERMISSION_KEYS) {
    await client.query(
      `INSERT INTO "Permission" ("key", "module", "description") VALUES ($1, $2, $3)`,
      [key, PERMISSIONS[key].module, PERMISSIONS[key].label],
    );
  }
}
