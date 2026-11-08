// Nimmt das Video Bild für Bild auf (Playwright/Chromium) – oder einzelne Standbilder zum Prüfen.
//
//   node werbevideo/werkzeuge/rendern.mjs --standbild 0.5,10.4,14.8   → ausgabe/standbilder/<t>.png
//   node werbevideo/werkzeuge/rendern.mjs                             → ausgabe/bilder/000000.jpg … (30 Bilder/s)
//   node werbevideo/werkzeuge/rendern.mjs --von 14 --bis 19           → nur ein Abschnitt (zum Prüfen)
//   … --format quer                                                   → Querformat 1920 × 1080 (Ordner …-quer)
//   … --seite nacht                                                   → Spot szenen/nacht.html (Ordner …-nacht)
//   … --unschaerfe 1                                                  → ohne Bewegungsunschärfe (schneller, zum Prüfen)
//   … --parallel 5                                                    → so viele Browser rendern gleichzeitig (Standard 5)
//
// Bewegungsunschärfe: Nennt die Seite window.UNSCHAERFE (nacht.html: 12), ist jedes Bild der Mittelwert aus so vielen
// Zeitpunkten innerhalb einer halben Bilddauer – wie der Verschluss einer Filmkamera (180°). Schnelle Bewegungen werden
// dadurch weich statt ruckelig. window.UNTERBILDER(t) darf an schnellen Stellen mehr Zeitpunkte verlangen. Das helle
// 60-s-Video (index.html) nennt keine Zahl und wird wie bisher mit einem Bildschirmfoto je Bild aufgenommen.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as D from "./drehbuch.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = path.resolve(here, "..");
const require = createRequire(path.resolve(base, "..", "package.json"));
const { chromium } = require("playwright");
const sharp = require("sharp");

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const stills = opt("standbild")?.split(",").map(Number);
const fps = D.BILDER_PRO_SEKUNDE;
const quer = opt("format") === "quer";
const seite = opt("seite") ?? "index";
const suffix = (seite !== "index" ? `-${seite}` : "") + (quer ? "-quer" : "");
const teilVon = opt("bilder"); // „a:b“: Teil eines parallelen Laufs, von einem anderen rendern.mjs gestartet
const parallel = Math.max(1, Number(opt("parallel") ?? 5));
const unschaerfe = opt("unschaerfe");
const VERSCHLUSS = 0.5; // offen für eine halbe Bilddauer
const [W, H] = quer ? [1920, 1080] : [1080, 1920];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("Seitenfehler:", e.message));
await page.goto(pathToFileURL(path.join(base, "szenen", `${seite}.html`)).href + (quer ? "?format=quer" : ""));
await page.waitForFunction(() => typeof window.seek === "function");
// Länge: der Spot „Nacht“ nennt sie selbst (window.DAUER), sonst das Drehbuch
const dauer = (await page.evaluate(() => window.DAUER)) ?? D.DAUER;

/** Zeitpunkte je Bild: aus --unschaerfe oder aus der Seite (window.UNSCHAERFE, window.UNTERBILDER). */
async function anzahlen(zeiten) {
  const fest = unschaerfe === undefined ? null : Number(unschaerfe);
  if (fest !== null && fest <= 1) return zeiten.map(() => 1);
  return page.evaluate(
    ([zeiten, fest]) => {
      const grund = fest ?? window.UNSCHAERFE ?? 1;
      if (grund <= 1) return zeiten.map(() => 1);
      return zeiten.map((t) => Math.max(grund, window.UNTERBILDER ? window.UNTERBILDER(t) : 0));
    },
    [zeiten, fest],
  );
}

/** Ein Bild zur Zeit t als Datei (.png oder .jpg): Mittelwert aus n Zeitpunkten von t bis t + Verschlusszeit. */
async function bild(t, n, ziel) {
  const png = ziel.endsWith(".png");
  if (n <= 1) {
    await page.evaluate((t) => window.seek(t), t);
    await page.screenshot(png ? { path: ziel } : { path: ziel, type: "jpeg", quality: 93 });
    return;
  }
  let summe = null;
  for (let k = 0; k < n; k++) {
    await page.evaluate((t) => window.seek(t), t + ((k + 0.5) / n) * (VERSCHLUSS / fps));
    const roh = await sharp(await page.screenshot({ type: "jpeg", quality: 95 })).removeAlpha().raw().toBuffer();
    if (!summe) summe = new Uint32Array(roh.length);
    for (let i = 0; i < roh.length; i++) summe[i] += roh[i];
  }
  const mittel = Buffer.alloc(summe.length);
  for (let i = 0; i < summe.length; i++) mittel[i] = Math.round(summe[i] / n);
  const img = sharp(mittel, { raw: { width: W, height: H, channels: 3 } });
  await (png ? img.png() : img.jpeg({ quality: 93 })).toFile(ziel);
}

if (stills) {
  const dir = path.join(base, "ausgabe", "standbilder" + suffix);
  fs.mkdirSync(dir, { recursive: true });
  const ns = await anzahlen(stills);
  for (const [j, t] of stills.entries()) {
    const file = path.join(dir, `${t.toFixed(2).padStart(5, "0")}.png`);
    await bild(t, ns[j], file);
    console.log(file);
  }
  await browser.close();
} else {
  const dir = path.join(base, "ausgabe", "bilder" + suffix);
  let first, last;
  if (teilVon) [first, last] = teilVon.split(":").map(Number);
  else {
    first = Math.round(Number(opt("von") ?? 0) * fps);
    last = Math.round((opt("bis") !== undefined ? Number(opt("bis")) : dauer) * fps);
    // Ganzer Film: Ordner leeren; nur ein Abschnitt: die übrigen Bilder bleiben (zum Nachbessern einzelner Stellen)
    if (opt("von") === undefined && opt("bis") === undefined) fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }
  const started = Date.now();
  if (!teilVon && parallel > 1 && last - first > 60) {
    // Mehrere Browser nehmen je einen Abschnitt auf
    await browser.close();
    const teil = Math.ceil((last - first) / parallel);
    const laeufe = [];
    for (let j = 0; j < parallel; j++) {
      const a = first + j * teil, b = Math.min(last, a + teil);
      if (a >= b) break;
      laeufe.push(
        new Promise((ok, fehler) => {
          const p = spawn(process.execPath, [fileURLToPath(import.meta.url), ...args, "--bilder", `${a}:${b}`], { stdio: "inherit" });
          p.on("exit", (code) => (code === 0 ? ok() : fehler(new Error(`Abschnitt ${a}–${b} endete mit Code ${code}`))));
        }),
      );
    }
    await Promise.all(laeufe);
    console.log(`✔ ${last - first} Bilder in ${((Date.now() - started) / 1000).toFixed(0)} s (${laeufe.length} Browser)`);
  } else {
    const ns = await anzahlen(Array.from({ length: last - first }, (_, k) => (first + k) / fps));
    for (let i = first; i < last; i++) {
      await bild(i / fps, ns[i - first], path.join(dir, `${String(i).padStart(6, "0")}.jpg`));
      if ((i - first) % 150 === 0) console.log(`${teilVon ? `[${first}–${last}] ` : ""}Bild ${i}/${last} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
    }
    if (!teilVon) console.log(`✔ ${last - first} Bilder in ${((Date.now() - started) / 1000).toFixed(0)} s`);
    await browser.close();
  }
}
