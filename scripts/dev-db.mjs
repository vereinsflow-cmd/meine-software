#!/usr/bin/env node
/**
 * Startet eine lokale, eingebettete PostgreSQL-Instanz OHNE Docker.
 *
 * Gedacht als Ausweichlösung für Rechner, auf denen Docker nicht installiert ist.
 * Die empfohlene Variante bleibt `docker compose up -d` (siehe README).
 *
 *   npm run db:embedded
 *
 * Wer nur "loslegen" will, nimmt stattdessen `npm run dev:all`: Das startet Datenbank UND Anwendung in einem Schritt.
 *
 * - Daten liegen persistent in `.local/pgdata` (nicht im Repository).
 * - Zugangsdaten entsprechen denen aus `.env.example`
 *   (postgresql://vereinsflow:vereinsflow@localhost:5432/vereinsflow).
 * - Beenden mit Strg+C.
 */
import { isPortOpen, startEmbeddedDatabase } from "./lib/embedded-db.mjs";

const port = Number(process.env.PGPORT ?? 5432);
const dbName = process.env.PGDATABASE ?? "vereinsflow";

if (await isPortOpen(port)) {
  console.log(`Auf Port ${port} läuft bereits eine Datenbank – es wird keine zweite gestartet.`);
  console.log("(Vermutlich läuft die eingebettete Datenbank schon in einem anderen Fenster.)");
  process.exit(0);
}

const { pg } = await startEmbeddedDatabase({ port, dbName });

console.log(`\nPostgreSQL läuft auf localhost:${port}`);
console.log(`DATABASE_URL=postgresql://vereinsflow:vereinsflow@localhost:${port}/${dbName}`);
console.log("Beenden mit Strg+C.\n");

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log("\nStoppe PostgreSQL …");
  try {
    await pg.stop();
  } finally {
    process.exit(0);
  }
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Prozess am Leben halten.
setInterval(() => {}, 1 << 30);
