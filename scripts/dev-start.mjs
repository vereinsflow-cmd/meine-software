#!/usr/bin/env node
/**
 * Startet VereinsFlow für die lokale Entwicklung mit EINEM Befehl – in der richtigen Reihenfolge:
 *
 *   1. Datenbank: Läuft auf dem Datenbank-Port schon eine (Docker, ein anderes Fenster), wird sie mitbenutzt.
 *      Sonst startet die eingebettete PostgreSQL (`.local/pgdata`, wird beim ersten Mal angelegt).
 *   2. Tabellen: `prisma migrate deploy` (legt fehlende Tabellen an, löscht nichts).
 *   3. Demo-Daten: nur beim allerersten Start einer neuen Datenbank oder mit `--seed`.
 *   4. Anwendung: `next dev` auf Port 3000.
 *
 *   npm run dev:all              alles starten
 *   npm run dev:all -- --open    … und danach den Browser öffnen
 *   npm run dev:all -- --seed    … und die Demo-Daten (nochmals) einspielen, falls sie fehlen
 *
 * Beenden mit Strg+C: Anwendung UND die von diesem Skript gestartete Datenbank werden sauber gestoppt.
 * Unter Windows genügt ein Doppelklick auf `Start-VereinsFlow.cmd`.
 */
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isPortOpen, startEmbeddedDatabase } from "./lib/embedded-db.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root); // die Datenbankdateien werden relativ zum Projektordner gesucht

const args = new Set(process.argv.slice(2));
const dbPort = Number(process.env.PGPORT ?? 5432);
const dbName = process.env.PGDATABASE ?? "vereinsflow";
const appPort = Number(process.env.PORT ?? 3000);
const appUrl = `http://localhost:${appPort}`;

const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
const nextCli = path.join(root, "node_modules", "next", "dist", "bin", "next");

/** Nur gesetzt, wenn DIESES Skript die Datenbank gestartet hat – nur dann wird sie beim Beenden auch gestoppt. */
let database = null;
let app = null;
let stopping = false;

function killTree(pid) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(pid);
    } catch {
      // Prozess ist schon beendet
    }
  }
}

async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  console.log("\nVereinsFlow wird beendet …");
  if (app && app.exitCode === null) killTree(app.pid);
  if (database) {
    console.log("Datenbank wird gestoppt …");
    try {
      await database.pg.stop();
    } catch (error) {
      console.error("Die Datenbank ließ sich nicht sauber stoppen:", String(error));
    }
  }
  process.exit(exitCode);
}
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  process.on(signal, () => void stop(0));
}

/** Führt ein Node-Programm aus und wartet auf sein Ende; Ergebnis ist der Exit-Code. */
function run(script, scriptArgs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...scriptArgs], { stdio: "inherit", cwd: root });
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

/** Öffnet den Browser, sobald die Anwendung antwortet (höchstens ~2 Minuten warten). */
async function openBrowserWhenReady() {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(`${appUrl}/anmelden`, { redirect: "manual" });
      if (response.status < 500) break;
    } catch {
      // noch nicht bereit
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const [command, commandArgs] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", appUrl]]
      : process.platform === "darwin"
        ? ["open", [appUrl]]
        : ["xdg-open", [appUrl]];
  spawn(command, commandArgs, { stdio: "ignore", detached: true })
    .on("error", () => {})
    .unref();
}

async function main() {
  console.log("\n=== VereinsFlow: lokaler Start ===\n");

  // 1. Datenbank
  if (await isPortOpen(dbPort)) {
    console.log(`✔ Datenbank läuft bereits auf Port ${dbPort} – wird mitbenutzt.`);
  } else {
    console.log("Datenbank wird gestartet (beim allerersten Mal dauert das etwas länger) …");
    database = await startEmbeddedDatabase({ port: dbPort, dbName });
    console.log(`✔ Datenbank bereit (localhost:${dbPort}).`);
  }

  // 2. Tabellen
  console.log("\nTabellen prüfen und aktualisieren …");
  if ((await run(prismaCli, ["migrate", "deploy"])) !== 0) {
    console.error(
      "\n✘ Die Tabellen konnten nicht angelegt werden (siehe Meldung oben).\n" +
        "  Prüfe DATABASE_URL in der Datei .env – sie muss zur laufenden Datenbank passen:\n" +
        `  postgresql://vereinsflow:vereinsflow@localhost:${dbPort}/${dbName}`,
    );
    return stop(1);
  }
  console.log("✔ Tabellen sind aktuell.");

  // 3. Demo-Daten (das Skript ist idempotent: sind sie schon da, meldet es das nur)
  if (database?.fresh || args.has("--seed")) {
    console.log("\nDemo-Daten einspielen …");
    if ((await run(prismaCli, ["db", "seed"])) !== 0) {
      console.error("✘ Die Demo-Daten konnten nicht eingespielt werden (siehe Meldung oben).");
    }
  }

  // 4. Anwendung
  console.log(`\n✔ VereinsFlow startet – gleich erreichbar unter ${appUrl}`);
  console.log("  Dieses Fenster offen lassen. Beenden mit Strg+C.\n");
  app = spawn(process.execPath, [nextCli, "dev", "-p", String(appPort)], {
    stdio: "inherit",
    cwd: root,
  });
  app.on("error", () => void stop(1));
  app.on("exit", (code) => void stop(code ?? 0));
  if (args.has("--open")) void openBrowserWhenReady();
}

main().catch((error) => {
  console.error("\n✘ Start fehlgeschlagen:", error instanceof Error ? error.message : error);
  void stop(1);
});
