// Bilder der Pro-Gestaltung (Startseite seit 16.11.2026): erzeugt aus den Original-Aufnahmen der Anwendung (PNG,
// Rechner 2880 × 1800, Handy 1170 × 2532; Liste und Herkunft in _bilder/LISTE.md des Entwurfs „apple-pro“) die
// WebP-Dateien in assets/img/app/ – je Bild genau die Breiten, die index.html in srcset nennt.
//   node tools/bilder-pro.mjs [--quelle <Ordner mit den PNG>] [--nur <Name>] [--pruefen]
// Quelle: VF_BILDER oder ~/VereinsFlow-Medien/website-entwurf/apple-pro/_bilder. sharp kommt aus dem Hauptordner des
// Repositories (VF_APP_DIR). --pruefen schreibt nichts und meldet nur, welche Dateien fehlen oder nicht mehr gebraucht
// werden. Die Ausschnitte der Ebenen (Kapitel 1) entsprechen denen des Entwurfs 02 „Explosion“ (im Original gemessen).
// Datum und Zahlen in den Bildern sind die des Aufnahmetags (16.11.2026, Seed-Daten: „Sommerfest 2026“, 24 Mitglieder).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = process.env.VF_APP_DIR ?? path.resolve(root, "..");
const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const quelle = opt("quelle", process.env.VF_BILDER ?? path.join(os.homedir(), "VereinsFlow-Medien/website-entwurf/apple-pro/_bilder"));
const nur = opt("nur", null);
const pruefen = args.includes("--pruefen");
const ziel = path.join(root, "assets/img/app");

/** name → Quelle, Ausschnitt im Original (x, y, Breite, Höhe; ohne = ganzes Bild), Breiten, Qualität */
const BILDER = {
  // Kapitel 1 · Explosion: fünf Glas-Ebenen (Seitenverhältnis 1,867 : 1) und die Grundplatte (16 : 10, im Laptop)
  "ebene-mitglieder-light": { datei: "rechner-mitglieder-hell.png", aus: [280, 408, 2548, 1365], breiten: [480, 720, 960] },
  "ebene-termine-light": { datei: "rechner-kalender-termine-hell.png", aus: [296, 440, 2535, 1358], breiten: [480, 720, 960] },
  "ebene-schichten-light": { datei: "rechner-helferplanung-hell.png", aus: [288, 280, 2535, 1358], breiten: [480, 720, 960] },
  "ebene-finanzen-light": { datei: "rechner-finanzen-beitraege-hell.png", aus: [288, 200, 2535, 1358], breiten: [480, 720, 960] },
  "ebene-nachrichten-light": { datei: "rechner-chat-hell.png", aus: [1144, 616, 1664, 891], breiten: [480, 720, 960] },
  "uebersicht-light": { datei: "rechner-dashboard-hell.png", breiten: [720, 960, 1440, 1920], q: 86 },
  // Kapitel 4 · große Kachel „Helferschichten“: die Schichtkarte aus der Übersicht der Helferplanung
  "schichtkarte-light": { datei: "rechner-ausschnitt-schichtkarte-hell.png", breiten: [600, 900, 1200], q: 86 },
  // Kapitel 5 · Helferplanung: der Helferplan des Sommerfests (Neue Schicht, Drucken, Tagesablauf, Eintragen)
  "helferplan-light": { datei: "rechner-helferplanung-hell.png", breiten: [720, 1080, 1440, 2048], q: 86 },
  // Kapitel 6 · großes Telefon (dunkel): Tagesablauf, dann die Schichtliste
  "handy-tagesablauf-dark": { datei: "handy-schichten-dunkel.png", breiten: [390, 585, 780], q: 86 },
  "handy-schichtliste-dark": { datei: "handy-schichten-liste-dunkel.png", breiten: [390, 585, 780], q: 86 },
};

const dateien = Object.entries(BILDER).flatMap(([name, b]) => b.breiten.map((w) => `${name}-${w}.webp`));

if (pruefen) {
  const fehlen = dateien.filter((f) => !fs.existsSync(path.join(ziel, f)));
  console.log(fehlen.length ? `Es fehlen ${fehlen.length}: ${fehlen.join(", ")}` : `Alle ${dateien.length} Dateien vorhanden.`);
  process.exit(fehlen.length ? 1 : 0);
}

const sharp = createRequire(path.join(appDir, "package.json"))("sharp");
let summe = 0;
for (const [name, b] of Object.entries(BILDER)) {
  if (nur && name !== nur) continue;
  const datei = path.join(quelle, b.datei);
  if (!fs.existsSync(datei)) throw new Error(`Quelle fehlt: ${datei}`);
  for (const w of b.breiten) {
    let bild = sharp(datei);
    if (b.aus) {
      const [left, top, width, height] = b.aus;
      bild = bild.extract({ left, top, width, height });
    }
    const aus = path.join(ziel, `${name}-${w}.webp`);
    // Verkleinern mit Lanczos, danach leicht geschärft (kleine Schrift bleibt lesbar); WebP mit voller Farbauflösung
    await bild
      .resize({ width: w, kernel: "lanczos3" })
      .sharpen({ sigma: 0.5 })
      .webp({ quality: b.q ?? 82, effort: 6, smartSubsample: true })
      .toFile(aus);
    const { size } = fs.statSync(aus);
    const { width, height } = await sharp(aus).metadata();
    summe += size;
    console.log(`${path.relative(root, aus)}  ${width} × ${height}  ${(size / 1024).toFixed(1)} KB`);
  }
}
console.log(`zusammen ${(summe / 1024).toFixed(0)} KB`);
