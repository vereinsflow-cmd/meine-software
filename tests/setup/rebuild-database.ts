import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { ADMIN_DATABASE_URL, databaseUrlFor } from "./env";
import { applyMigrations, insertPermissionCatalog } from "./migrate";

const root = path.resolve(__dirname, "../..");

/**
 * Baut eine frische Datenbank auf und befüllt sie mit den Demo-Daten (Seed) – Grundlage für alle Tests im Browser
 * (E2E gegen den Dev-Server, Rauchtest gegen den Produktions-Build). Eine vorhandene Datenbank gleichen Namens wird gelöscht.
 * Dateien früherer Läufe (`storageDir`, relativ zum Projekt) gehören zur alten Datenbank und werden entfernt.
 */
export async function rebuildDatabase(name: string, storageDir?: string): Promise<void> {
  const admin = new pg.Client({ connectionString: ADMIN_DATABASE_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
  await admin.end();

  const db = new pg.Client({ connectionString: databaseUrlFor(name) });
  await db.connect();
  await applyMigrations(db);
  await insertPermissionCatalog(db);
  await db.end();

  if (storageDir) fs.rmSync(path.join(root, storageDir), { recursive: true, force: true });

  // Demo-Daten einspielen (gleiches Skript wie `npm run db:seed`).
  execFileSync("npx", ["tsx", "--conditions=react-server", "prisma/seed.ts"], {
    cwd: root,
    stdio: "pipe",
    shell: true,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrlFor(name),
      SEED_PASSWORD: process.env.SEED_PASSWORD ?? "Vereinsflow-Demo-2026!",
      NODE_ENV: "test",
    },
  });
}
