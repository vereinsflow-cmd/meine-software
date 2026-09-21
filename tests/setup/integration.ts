import { randomBytes } from "node:crypto";
import pg from "pg";
import { afterAll } from "vitest";
import { ADMIN_DATABASE_URL, applyTestEnv, databaseUrlFor } from "./env";

/**
 * Jede Testdatei erhält eine eigene Datenbank (Kopie der Vorlage). Das läuft VOR dem Import
 * der Anwendungsmodule, damit `DATABASE_URL` schon auf die richtige Datenbank zeigt.
 */
const TEMPLATE_DB = "vf_test_template";
const databaseName = `vf_test_${randomBytes(6).toString("hex")}`;

const admin = new pg.Client({ connectionString: ADMIN_DATABASE_URL });
await admin.connect();
await admin.query(`CREATE DATABASE ${databaseName} TEMPLATE ${TEMPLATE_DB}`);
await admin.end();

applyTestEnv({ DATABASE_URL: databaseUrlFor(databaseName) });

afterAll(async () => {
  // Datenbank-Verbindung der Anwendung schließen, dann die Test-Datenbank entfernen.
  try {
    const { prisma } = await import("@/server/db/client");
    await prisma.$disconnect();
  } catch {
    // Modul wurde von diesem Test nie geladen – nichts zu schließen.
  }
  const cleaner = new pg.Client({ connectionString: ADMIN_DATABASE_URL });
  await cleaner.connect();
  await cleaner.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
  await cleaner.end();
});
