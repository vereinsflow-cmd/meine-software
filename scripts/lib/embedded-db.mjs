/**
 * Gemeinsame Bausteine für die eingebettete PostgreSQL (ohne Docker) – genutzt von `dev-db.mjs` (nur die Datenbank)
 * und `dev-start.mjs` (alles auf einmal).
 *
 * Die Datenbankdateien liegen in `.local/pgdata` relativ zum Ordner, in dem der Befehl läuft (dem Projektordner).
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";

const dataDir = () => path.resolve(".local", "pgdata");

/** Prüft, ob auf localhost:port jemand Verbindungen annimmt (läuft dort also schon eine Datenbank?). */
export function isPortOpen(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "localhost" });
    const finish = (open) => {
      socket.destroy();
      resolve(open);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

/**
 * Startet die eingebettete Datenbank (legt sie beim allerersten Mal an) und sorgt dafür, dass die Datenbank `dbName`
 * existiert. `fresh` ist true, wenn die Datenbankdateien gerade neu angelegt wurden (also noch leer sind).
 */
export async function startEmbeddedDatabase({ port, dbName }) {
  const dir = dataDir();
  const pg = new EmbeddedPostgres({
    databaseDir: dir,
    user: "vereinsflow",
    password: "vereinsflow",
    port,
    persistent: true,
    // WICHTIG: UTF-8 und deutsche Sortierung erzwingen. Ohne diese Angabe übernimmt initdb unter Windows die
    // Systemkodierung (WIN1252) – Zeichen wie "→", "Ş", "Ż" oder Emojis ließen sich dann nicht speichern.
    initdbFlags: ["--encoding=UTF8", "--locale=de-DE"],
    onLog: () => {},
    onError: (message) => console.error(String(message)),
  });

  const fresh = !existsSync(path.join(dir, "PG_VERSION"));
  if (fresh) {
    console.log("Initialisiere neue Datenbank in", dir);
    await pg.initialise();
  }

  await pg.start();

  try {
    await pg.createDatabase(dbName);
    console.log(`Datenbank "${dbName}" angelegt.`);
  } catch {
    // Datenbank existiert bereits – das ist der Normalfall bei jedem weiteren Start.
  }

  return { pg, fresh };
}
