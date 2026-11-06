// Nimmt das Video Bild für Bild auf (Playwright/Chromium) – oder einzelne Standbilder zum Prüfen.
//
//   node werbevideo/werkzeuge/rendern.mjs --standbild 0.5,10.4,14.8   → ausgabe/standbilder/<t>.png
//   node werbevideo/werkzeuge/rendern.mjs                             → ausgabe/bilder/000000.jpg … (30 Bilder/s)
//   node werbevideo/werkzeuge/rendern.mjs --von 14 --bis 19           → nur ein Abschnitt (zum Prüfen)
//   … --format quer                                                   → Querformat 1920 × 1080 (Ordner …-quer)
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as D from "./drehbuch.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = path.resolve(here, "..");
const require = createRequire(path.resolve(base, "..", "package.json"));
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const stills = opt("standbild")?.split(",").map(Number);
const from = Number(opt("von") ?? 0);
const to = Number(opt("bis") ?? D.DAUER);
const fps = D.BILDER_PRO_SEKUNDE;
const quer = opt("format") === "quer";
const suffix = quer ? "-quer" : "";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: quer ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("Seitenfehler:", e.message));
await page.goto(pathToFileURL(path.join(base, "szenen", "index.html")).href + (quer ? "?format=quer" : ""));
await page.waitForFunction(() => typeof window.seek === "function");

if (stills) {
  const dir = path.join(base, "ausgabe", "standbilder" + suffix);
  fs.mkdirSync(dir, { recursive: true });
  for (const t of stills) {
    await page.evaluate((t) => window.seek(t), t);
    const file = path.join(dir, `${t.toFixed(2).padStart(5, "0")}.png`);
    await page.screenshot({ path: file });
    console.log(file);
  }
} else {
  const dir = path.join(base, "ausgabe", "bilder" + suffix);
  // Ganzer Film: Ordner leeren; nur ein Abschnitt: die übrigen Bilder bleiben (zum Nachbessern einzelner Stellen)
  if (!opt("von") && !opt("bis")) fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const first = Math.round(from * fps);
  const last = Math.round(to * fps);
  const started = Date.now();
  for (let i = first; i < last; i++) {
    await page.evaluate((t) => window.seek(t), i / fps);
    await page.screenshot({ path: path.join(dir, `${String(i).padStart(6, "0")}.jpg`), type: "jpeg", quality: 93 });
    if (i % 150 === 0) console.log(`Bild ${i}/${last} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
  }
  console.log(`✔ ${last - first} Bilder in ${((Date.now() - started) / 1000).toFixed(0)} s`);
}
await browser.close();
