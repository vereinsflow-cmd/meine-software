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
 * Läuft VereinsFlow schon (in einem anderen Fenster oder in der Vorschau von Claude), wird nichts ein zweites Mal
 * gestartet – ein zweites `next dev` im selben Ordner bricht ohnehin ab. Mit `--open` öffnet sich dann nur der Browser.
 *
 *   npm run dev:all              alles starten
 *   npm run dev:all -- --open    … und danach den Browser öffnen
 *   npm run dev:all -- --seed    … und die Demo-Daten (nochmals) einspielen, falls sie fehlen
 *   npm run dev:all -- --leer    die LEERE Version, wie sie ein neuer Verein bekommt (siehe unten)
 *
 * Leere Version (`--leer`, Doppelklick auf `Start-VereinsFlow-leer.command`): ohne Demo-Daten, mit eigener Datenbank
 * (`.local/pgdata-leer`, Port 5433), eigenen Dateien und eigenem Build-Ordner auf Port 3001 – sie läuft neben der
 * Vorschau, ohne sie zu berühren. Sie beginnt bei JEDEM Start wieder ganz leer, wie bei einem neuen Kunden: Die Daten
 * vom letzten Mal werden gelöscht (auch wenn sie in einem anderen Fenster noch läuft). Man legt Verein und
 * Administrator-Konto an (/einrichten), danach führt der Assistent „Verein einrichten“ Schritt für Schritt durch den Start.
 *
 * Hängt eine schon laufende Kopie (antwortet nicht oder nur mit Fehler 500), wird sie beendet und neu gestartet – aber
 * nur, wenn sie aus diesem Projektordner stammt; fremde Programme werden nie angefasst.
 *
 * Protokoll: Was im Fenster steht, landet mit Uhrzeit auch in `.local/start.log` (leere Version: `.local/start-leer.log`)
 * – so lässt sich später nachlesen, warum ein Start nicht geklappt hat. Jeder Start beginnt das Protokoll neu.
 *
 * Beenden mit Strg+C: Anwendung UND die von diesem Skript gestartete Datenbank werden sauber gestoppt.
 * Unter Windows genügt ein Doppelklick auf `Start-VereinsFlow.cmd`, auf dem Mac auf `Start-VereinsFlow.command`.
 */
import { spawn, spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { isPortOpen, startEmbeddedDatabase } from "./lib/embedded-db.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root); // die Datenbankdateien werden relativ zum Projektordner gesucht

const args = new Set(process.argv.slice(2));
const leer = args.has("--leer");
const dbPort = leer ? 5433 : Number(process.env.PGPORT ?? 5432);
const dbName = process.env.PGDATABASE ?? "vereinsflow";
const appPort = leer ? 3001 : Number(process.env.PORT ?? 3000);
const appUrl = `http://localhost:${appPort}`;

// Protokoll des letzten Starts (siehe oben). Die Anwendung schreibt jede Anfrage mit – nach 5 MB wird nichts mehr angehängt.
const logFile = path.resolve(".local", leer ? "start-leer.log" : "start.log");
const logHint = path.relative(root, logFile);
const LOG_LIMIT_BYTES = 5 * 1024 * 1024;
let logBytes = 0;
function writeLog(text) {
  if (logBytes > LOG_LIMIT_BYTES) return;
  const time = new Date().toLocaleTimeString("de-DE");
  const lines = text
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "") // Farbcodes des Terminals
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => `${time}  ${line}`)
    .join("\n");
  if (!lines) return;
  try {
    appendFileSync(logFile, `${lines}\n`);
    logBytes += lines.length + 1;
  } catch {
    // Ohne Protokoll geht es auch – der Start darf daran nicht scheitern.
  }
}
try {
  mkdirSync(path.dirname(logFile), { recursive: true });
  writeFileSync(
    logFile,
    `VereinsFlow-Start am ${new Date().toLocaleString("de-DE")} (${process.argv.slice(2).join(" ") || "ohne Zusätze"})\n`,
  );
} catch {
  // siehe oben
}
for (const method of ["log", "error"]) {
  const original = console[method].bind(console);
  console[method] = (...values) => {
    original(...values);
    writeLog(
      values.map((value) => (value instanceof Error ? value.stack : String(value))).join(" "),
    );
  };
}

/** Ausgabe eines gestarteten Programms: ins Fenster (mit Farben) und ins Protokoll. */
function forwardOutput(child) {
  child.stdout?.on("data", (chunk) => {
    process.stdout.write(chunk);
    writeLog(chunk.toString());
  });
  child.stderr?.on("data", (chunk) => {
    process.stderr.write(chunk);
    writeLog(chunk.toString());
  });
}
/** Für gestartete Programme: im Fenster Farben behalten, obwohl ihre Ausgabe über dieses Skript läuft. */
const childEnv = {
  ...process.env,
  ...(process.stdout.isTTY && { FORCE_COLOR: "1" }),
  PRISMA_HIDE_UPDATE_MESSAGE: "1", // kein Werbehinweis für neue Prisma-Versionen im Startfenster
};

if (leer) {
  // Gilt für alle Programme, die dieses Skript startet (Prisma, Next.js). Werte aus `.env` überschreiben sie nicht.
  const leerDatabaseUrl = `postgresql://vereinsflow:vereinsflow@localhost:${dbPort}/${dbName}`;
  Object.assign(process.env, {
    DATABASE_URL: leerDatabaseUrl,
    MIGRATION_DATABASE_URL: leerDatabaseUrl, // sonst liefen Migrationen ggf. gegen die Datenbank der Vorschau
    APP_URL: appUrl,
    NEXT_DIST_DIR: ".next-leer",
    STORAGE_DIR: "./.local/leer-storage",
    FIRST_RUN_SETUP: "true",
    // Der Browser trennt Cookies nicht nach Port – mit gleichem Namen würde jede Anmeldung die andere Version abmelden.
    SESSION_COOKIE_NAME: "vf_session_leer",
  });
}

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
    const child = spawn(process.execPath, [script, ...scriptArgs], {
      stdio: ["inherit", "pipe", "pipe"],
      cwd: root,
      env: childEnv,
    });
    forwardOutput(child);
    child.on("error", () => resolve(1));
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Antwortet die laufende Anwendung? Eine hängende oder kaputte (Fehler 500) zählt als „antwortet nicht“. */
async function appResponds(timeoutMs) {
  try {
    const response = await fetch(`${appUrl}/anmelden`, {
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

/** Elternprozess und Befehlszeile eines Prozesses (macOS/Linux); `null`, wenn es ihn nicht (mehr) gibt. */
function processInfo(pid) {
  const result = spawnSync("ps", ["-o", "ppid=,command=", "-p", String(pid)], { encoding: "utf8" });
  const match = /^\s*(\d+)\s+(.*)$/.exec(result.stdout?.trim() ?? "");
  return match ? { ppid: Number(match[1]), command: match[2] } : null;
}

/** Arbeitsordner eines Prozesses – daran erkennt man, ob eine Kopie aus diesem Projektordner stammt. */
function processCwd(pid) {
  const result = spawnSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], {
    encoding: "utf8",
  });
  const line = (result.stdout ?? "").split("\n").find((entry) => entry.startsWith("n"));
  return line ? line.slice(1) : null;
}

/** Prozesse, die auf dem Port auf Verbindungen warten. */
function listenerPids(port) {
  const result = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
    encoding: "utf8",
  });
  return [...new Set((result.stdout ?? "").split("\n").map(Number).filter(Boolean))];
}

async function waitUntil(condition, timeoutMs) {
  for (let waited = 0; waited < timeoutMs; waited += 500) {
    if (await condition()) return true;
    await sleep(500);
  }
  return condition();
}

/**
 * Beendet eine hängende VereinsFlow-Kopie auf dem Anwendungs-Port – nur, wenn alle Prozesse dort aus DIESEM Projektordner
 * stammen und Next.js sind. Wurde sie über dieses Skript gestartet, bekommt das Skript Strg+C (stoppt Anwendung und seine
 * Datenbank sauber, darauf wird gewartet); hilft das nicht, werden die Prozesse hart beendet. Ergebnis: Port ist frei.
 */
async function stopHungApp() {
  if (process.platform === "win32") return false;
  const listeners = listenerPids(appPort);
  const ours = listeners.filter(
    (pid) => processCwd(pid) === root && /next/.test(processInfo(pid)?.command ?? ""),
  );
  if (ours.length === 0 || ours.length !== listeners.length) return false;

  // Kette nach oben: next-server → next dev → scripts/dev-start.mjs (falls so gestartet).
  const nextProcesses = new Set(ours);
  const starters = new Set();
  for (const pid of ours) {
    let parent = processInfo(pid)?.ppid;
    for (let depth = 0; parent && parent > 1 && depth < 4; depth++) {
      const info = processInfo(parent);
      if (!info) break;
      if (/scripts\/dev-start\.mjs/.test(info.command)) {
        starters.add(parent);
        break;
      }
      if (/next/.test(info.command)) nextProcesses.add(parent);
      parent = info.ppid;
    }
  }
  const send = (pid, signal) => {
    try {
      process.kill(pid, signal);
    } catch {
      // schon beendet
    }
  };
  const gone = (pids) => () => [...pids].every((pid) => !processInfo(pid));
  const portFree = async () => !(await isPortOpen(appPort));

  if (starters.size > 0) {
    for (const pid of starters) send(pid, "SIGINT");
    // Erst wenn das alte Skript ganz fertig ist, ist auch seine Datenbank gestoppt – sonst würde sie gleich mitbenutzt.
    if ((await waitUntil(gone(starters), 20_000)) && (await waitUntil(portFree, 5_000)))
      return true;
  }
  for (const pid of nextProcesses) {
    send(pid, "SIGTERM");
    send(pid, "SIGCONT"); // ein angehaltener Prozess bekommt SIGTERM erst, wenn er weiterläuft
  }
  if (await waitUntil(portFree, 8_000)) return true;
  for (const pid of [...starters, ...nextProcesses, ...listenerPids(appPort)]) send(pid, "SIGKILL");
  return waitUntil(portFree, 5_000);
}

/**
 * Leere Version: alles vom letzten Mal löschen – Datenbank neu anlegen, hochgeladene Dateien entfernen. Nur für die
 * eigene Datenbank der leeren Version (Port 5433); die Vorschau (Port 5432) wird nie angefasst. `WITH (FORCE)` trennt
 * eine noch laufende leere Version von der alten Datenbank; ihre nächste Anfrage findet die neue, leere vor.
 */
async function resetLeer() {
  if (!leer || dbPort === 5432) throw new Error("Zurücksetzen gibt es nur für die leere Version.");
  console.log("Leere Version: Die Daten vom letzten Mal werden gelöscht …");
  const client = new pg.Client({
    connectionString: `postgresql://vereinsflow:vereinsflow@localhost:${dbPort}/postgres`,
  });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await client.end();
  }
  await rm(path.resolve(".local", "leer-storage"), { recursive: true, force: true });
  console.log("✔ Alles wieder leer.");
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
  console.log(
    leer
      ? "\n=== VereinsFlow: leere Version (für einen neuen Verein) ===\n"
      : "\n=== VereinsFlow: lokaler Start ===\n",
  );

  // 0. Läuft die Anwendung schon, genügt der Browser – die leere Version wird vorher trotzdem geleert. Hängt sie, wird sie
  //    beendet und unten neu gestartet. (Die erste Seite nach dem Start wird erst übersetzt – deshalb großzügig warten.)
  if ((await isPortOpen(appPort)) && !(await appResponds(30_000))) {
    console.log(
      `! VereinsFlow unter ${appUrl} läuft, antwortet aber nicht – die hängende Kopie wird beendet und neu gestartet …`,
    );
    if (!(await stopHungApp())) {
      console.error(
        `\n✘ Port ${appPort} ist belegt und ließ sich nicht freimachen (vielleicht ein anderes Programm).\n` +
          "  Am einfachsten: den Mac neu starten und VereinsFlow danach wieder per Doppelklick starten.\n" +
          `  Was genau passiert ist, steht im Protokoll ${logHint}.`,
      );
      process.exitCode = 1;
      return;
    }
    console.log("✔ Die hängende Kopie ist beendet.\n");
  }
  if (await isPortOpen(appPort)) {
    console.log(
      `✔ VereinsFlow läuft bereits unter ${appUrl} – es wird keine zweite Kopie gestartet.`,
    );
    if (leer) {
      await resetLeer();
      if ((await run(prismaCli, ["migrate", "deploy"])) !== 0) {
        console.error("✘ Die Tabellen konnten nicht neu angelegt werden (siehe Meldung oben).");
        return;
      }
    }
    if (args.has("--open")) {
      console.log("  Der Browser wird geöffnet.");
      await openBrowserWhenReady();
    }
    return;
  }

  // 1. Datenbank
  if (await isPortOpen(dbPort)) {
    console.log(`✔ Datenbank läuft bereits auf Port ${dbPort} – wird mitbenutzt.`);
  } else {
    console.log("Datenbank wird gestartet (beim allerersten Mal dauert das etwas länger) …");
    database = await startEmbeddedDatabase({
      port: dbPort,
      dbName,
      ...(leer && { dir: path.resolve(".local", "pgdata-leer") }),
    });
    console.log(`✔ Datenbank bereit (localhost:${dbPort}).`);
  }
  if (leer) await resetLeer();

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
  if (!leer && (database?.fresh || args.has("--seed"))) {
    console.log("\nDemo-Daten einspielen …");
    if ((await run(prismaCli, ["db", "seed"])) !== 0) {
      console.error("✘ Die Demo-Daten konnten nicht eingespielt werden (siehe Meldung oben).");
    }
  }

  // 4. Anwendung
  console.log(`\n✔ VereinsFlow startet – gleich erreichbar unter ${appUrl}`);
  console.log("  Dieses Fenster offen lassen. Beenden mit Strg+C.\n");
  app = spawn(process.execPath, [nextCli, "dev", "-p", String(appPort)], {
    stdio: ["inherit", "pipe", "pipe"],
    cwd: root,
    env: childEnv,
  });
  forwardOutput(app);
  app.on("error", () => void stop(1));
  app.on("exit", (code) => void stop(code ?? 0));
  if (args.has("--open")) void openBrowserWhenReady();
}

main().catch((error) => {
  console.error("\n✘ Start fehlgeschlagen:", error instanceof Error ? error.message : error);
  console.error(`  Einzelheiten stehen im Protokoll ${logHint}.`);
  void stop(1);
});
