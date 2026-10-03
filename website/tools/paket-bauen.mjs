// Baut das Upload-Paket für den IONOS-Webspace (upload/vereinsflow-website.zip) – ohne Abhängigkeiten, ohne zip-Programm:
//
//   node tools/paket-bauen.mjs                 schreibt upload/vereinsflow-website.zip
//   node tools/paket-bauen.mjs <Zieldatei>     schreibt das Paket woandershin (z. B. zum Ausprobieren)
//
// Enthalten ist genau das, was auch tools/hochladen.mjs hochlädt (siehe tools/paket.mjs): alles außer tools/, upload/,
// README.md, den Vorschau-Startern und _headers, aber mit .htaccess. Die Stildatei kommt ohne Entwicklerkommentare ins
// Paket; der Quelltext im Ordner bleibt, wie er ist. Das ZIP entspricht dem früheren „zip -r -X“: Ordner als eigene
// Einträge, Dateirechte wie im Ordner, keine Zusatzfelder.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { paketInhalt, sammlePaket, wirdBereinigt } from "./paket.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ziel = path.resolve(process.argv[2] ?? path.join(root, "upload", "vereinsflow-website.zip"));

// CRC-32 (wie im ZIP-Format verlangt)
const CRC_TABELLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(daten) {
  let c = 0xffffffff;
  for (const byte of daten) c = CRC_TABELLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Datum und Uhrzeit im MS-DOS-Format (Ortszeit, auf 2 Sekunden genau) – so speichert es auch zip
function dosZeit(datum) {
  const jahr = Math.max(1980, datum.getFullYear());
  return {
    zeit: (datum.getHours() << 11) | (datum.getMinutes() << 5) | (datum.getSeconds() >> 1),
    tag: ((jahr - 1980) << 9) | ((datum.getMonth() + 1) << 5) | datum.getDate(),
  };
}

const { ordner, dateien } = sammlePaket(root);
const eintraege = [...ordner.map((pfad) => ({ pfad, ordner: true })), ...dateien.map((pfad) => ({ pfad, ordner: false }))];
eintraege.sort((a, b) => (a.pfad < b.pfad ? -1 : a.pfad > b.pfad ? 1 : 0));
if (eintraege.length >= 0xffff) throw new Error("Zu viele Dateien für ein ZIP ohne Zip64");

const teile = [];
const verzeichnis = [];
let versatz = 0;
let cssVorher = 0;
let cssNachher = 0;

for (const eintrag of eintraege) {
  const status = fs.statSync(path.join(root, eintrag.pfad));
  const name = Buffer.from(eintrag.ordner ? `${eintrag.pfad}/` : eintrag.pfad, "utf8");
  const daten = eintrag.ordner ? Buffer.alloc(0) : paketInhalt(root, eintrag.pfad);
  if (!eintrag.ordner && wirdBereinigt(eintrag.pfad)) {
    cssVorher += status.size;
    cssNachher += daten.length;
  }
  // Komprimieren, wenn es sich lohnt (wie zip: bereits gepackte Bilder werden oft nur gespeichert)
  const gepackt = daten.length ? zlib.deflateRawSync(daten, { level: 9 }) : daten;
  const methode = gepackt.length < daten.length ? 8 : 0;
  const inhalt = methode === 8 ? gepackt : daten;
  const crc = crc32(daten);
  const { zeit, tag } = dosZeit(status.mtime);
  const flags = /[^\x20-\x7e]/.test(eintrag.pfad) ? 0x0800 : 0; // Bit 11: Name in UTF-8
  const version = methode === 8 ? 20 : 10;
  if (versatz + 30 + name.length + inhalt.length > 0xffffffff) throw new Error("Paket zu groß für ein ZIP ohne Zip64");

  const kopf = Buffer.alloc(30);
  kopf.writeUInt32LE(0x04034b50, 0);
  kopf.writeUInt16LE(version, 4);
  kopf.writeUInt16LE(flags, 6);
  kopf.writeUInt16LE(methode, 8);
  kopf.writeUInt16LE(zeit, 10);
  kopf.writeUInt16LE(tag, 12);
  kopf.writeUInt32LE(crc, 14);
  kopf.writeUInt32LE(inhalt.length, 18);
  kopf.writeUInt32LE(daten.length, 22);
  kopf.writeUInt16LE(name.length, 26);
  kopf.writeUInt16LE(0, 28);
  teile.push(kopf, name, inhalt);

  // Rechte wie im Ordner (Unix), Ordner zusätzlich mit dem MS-DOS-Ordnerbit
  const rechte = (eintrag.ordner ? 0o040755 : 0o100000 | (status.mode & 0o777)) >>> 0;
  const zentral = Buffer.alloc(46);
  zentral.writeUInt32LE(0x02014b50, 0);
  zentral.writeUInt16LE((3 << 8) | 30, 4); // erstellt unter Unix, ZIP-Version 3.0
  zentral.writeUInt16LE(version, 6);
  zentral.writeUInt16LE(flags, 8);
  zentral.writeUInt16LE(methode, 10);
  zentral.writeUInt16LE(zeit, 12);
  zentral.writeUInt16LE(tag, 14);
  zentral.writeUInt32LE(crc, 16);
  zentral.writeUInt32LE(inhalt.length, 20);
  zentral.writeUInt32LE(daten.length, 24);
  zentral.writeUInt16LE(name.length, 28);
  zentral.writeUInt16LE(0, 30); // Zusatzfelder
  zentral.writeUInt16LE(0, 32); // Kommentar
  zentral.writeUInt16LE(0, 34); // Datenträger
  zentral.writeUInt16LE(0, 36); // interne Attribute
  zentral.writeUInt32LE(((rechte << 16) | (eintrag.ordner ? 0x10 : 0)) >>> 0, 38);
  zentral.writeUInt32LE(versatz, 42);
  verzeichnis.push(zentral, name);

  versatz += kopf.length + name.length + inhalt.length;
}

const verzeichnisGroesse = verzeichnis.reduce((summe, teil) => summe + teil.length, 0);
const ende = Buffer.alloc(22);
ende.writeUInt32LE(0x06054b50, 0);
ende.writeUInt16LE(0, 4);
ende.writeUInt16LE(0, 6);
ende.writeUInt16LE(eintraege.length, 8);
ende.writeUInt16LE(eintraege.length, 10);
ende.writeUInt32LE(verzeichnisGroesse, 12);
ende.writeUInt32LE(versatz, 16);
ende.writeUInt16LE(0, 20);

// Erst vollständig schreiben, dann umbenennen – so liegt nie ein halbes Paket im Ordner upload/
fs.mkdirSync(path.dirname(ziel), { recursive: true });
const zwischendatei = `${ziel}.${process.pid}.tmp`;
fs.writeFileSync(zwischendatei, Buffer.concat([...teile, ...verzeichnis, ende]));
fs.renameSync(zwischendatei, ziel);

const kb = (bytes) => `${(bytes / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} KB`;
const anzeige = path.relative(process.cwd(), ziel);
console.log(`${anzeige.startsWith("..") ? ziel : anzeige}: ${dateien.length} Dateien in ${ordner.length} Ordnern, ${kb(fs.statSync(ziel).size)}`);
if (cssVorher) console.log(`Stildatei ohne Kommentare: ${kb(cssVorher)} → ${kb(cssNachher)}`);
