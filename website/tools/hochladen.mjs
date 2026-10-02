// Lädt die Website per SFTP auf den Webspace (Ordner public) – ohne ZIP und ohne Entpack-Helfer:
//
//   node tools/hochladen.mjs <Server> <Benutzer> [Zielordner]      (Zielordner: Standard public)
//   node tools/hochladen.mjs <Server> <Benutzer> --anzeigen          (nur die SFTP-Befehle zeigen, nichts hochladen)
//
// Server und Benutzer stehen bei IONOS unter Hosting → SFTP; ein anderer Port geht als server:port. Das Passwort fragt
// sftp selbst im Terminal ab, es wird nirgends gespeichert. Hochgeladen wird genau das, was auch ins Upload-Paket kommt
// (tools/paket.mjs) – auch die Stildatei wie dort ohne Entwicklerkommentare (eine bereinigte Kopie in einem temporären
// Ordner, die danach wieder gelöscht wird). Vorhandene Dateien werden überschrieben, auf dem Server wird nichts gelöscht.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { paketInhalt, sammlePaket, wirdBereinigt } from "./paket.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const nurAnzeigen = args.includes("--anzeigen");
const [serverMitPort, benutzer, zielordner = "public"] = args.filter((arg) => arg !== "--anzeigen");
const [server, port] = (serverMitPort ?? "").split(":");
const erlaubt = /^[A-Za-z0-9._@+-]+$/;

if (!server || !benutzer || !erlaubt.test(server) || !erlaubt.test(benutzer) || !/^[A-Za-z0-9._\/-]+$/.test(zielordner) || (port && !/^\d+$/.test(port))) {
  console.error("Aufruf: node tools/hochladen.mjs <Server> <Benutzer> [Zielordner, Standard: public]");
  process.exit(1);
}

// Wie beim Upload-Paket: Werkzeuge, Paket, README, Vorschau-Starter und Netlify-Header bleiben lokal.
const { ordner, dateien } = sammlePaket(root);

// Bereinigte Stildatei(en) in einen temporären Ordner schreiben; hochgeladen wird diese Kopie statt des Quelltexts.
const bereinigtOrdner = fs.mkdtempSync(path.join(os.tmpdir(), "vereinsflow-upload-"));
const aufraeumen = () => fs.rmSync(bereinigtOrdner, { recursive: true, force: true });
const quelle = new Map();
process.on("SIGINT", () => {
  aufraeumen();
  process.exit(130);
});
for (const pfad of dateien.filter(wirdBereinigt)) {
  const kopie = path.join(bereinigtOrdner, ...pfad.split("/"));
  fs.mkdirSync(path.dirname(kopie), { recursive: true });
  fs.writeFileSync(kopie, paketInhalt(root, pfad));
  quelle.set(pfad, kopie);
}

const zitiert = (wert) => `"${wert.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
// „-“ vor mkdir: Fehler bei schon vorhandenen Ordnern ignorieren; jeder andere Fehler bricht ab.
const befehle = [
  `cd ${zitiert(zielordner)}`,
  ...ordner.map((pfad) => `-mkdir ${zitiert(pfad)}`),
  ...dateien.map((pfad) => `put ${zitiert(quelle.get(pfad) ?? path.join(root, pfad))} ${zitiert(pfad)}`),
];

if (nurAnzeigen) {
  console.log(befehle.join("\n"));
  // Die bereinigte Kopie bleibt hier liegen, damit die gezeigten Befehle funktionieren (temporärer Ordner des Systems).
  if (quelle.size) console.log(`\n# Bereinigte Stildatei: ${[...quelle.values()].join(", ")}`);
  process.exit(0);
}

console.log(`Lade ${dateien.length} Dateien in ${ordner.length} Ordnern nach ${server}:${zielordner} …`);
console.log("Beim ersten Mal nach der Server-Kennung mit „yes“ antworten, danach das SFTP-Passwort eingeben.\n");

// -b - liest die Befehle von stdin und bricht beim ersten Fehler ab; BatchMode=no (vor -b!) erlaubt trotzdem die
// Passwortabfrage im Terminal.
const sftp = spawn(
  "sftp",
  ["-o", "BatchMode=no", "-o", `User=${benutzer}`, ...(port ? ["-P", port] : []), "-b", "-", server],
  { stdio: ["pipe", "ignore", "pipe"] },
);
sftp.stdin.end(befehle.join("\n") + "\n");
// Meldungen zu schon vorhandenen Ordnern sind erwartet und werden ausgeblendet; alles andere erscheint.
let rest = "";
sftp.stderr.on("data", (teil) => {
  const zeilen = (rest + teil).split("\n");
  rest = zeilen.pop();
  for (const zeile of zeilen) if (!/^remote mkdir "/.test(zeile)) process.stderr.write(zeile + "\n");
});
sftp.on("error", (fehler) => {
  aufraeumen();
  console.error(`sftp ließ sich nicht starten: ${fehler.message}`);
  process.exit(1);
});
sftp.on("close", (code) => {
  aufraeumen();
  if (code === 0) {
    console.log(`\nFertig: ${dateien.length} Dateien hochgeladen.`);
  } else {
    console.error(`\nAbgebrochen (sftp-Code ${code}). Nichts wurde gelöscht; einfach erneut starten.`);
  }
  process.exit(code ?? 1);
});
