// Schlussbild des Finales (Kapitel 10): Laptop und Telefon als Standbild mit durchsichtigem Hintergrund (WebP mit Alpha).
// Gerendert aus dem Markup der Startseite (index.html: Laptop aus dem Einstieg, Telefon aus „Unterwegs“) und der
// wörtlichen Gerätebewegung in site.css: Die Web Animations API hält jede Animation an – der Laptop steht bei 1,08 s
// (zugeklappt, das Zeichen auf dem Deckel), das Telefon in der Endlage mit ausgeschaltetem Bildschirm. Die Pose kommt wie
// auf der Seite über die Hülle .pose; Lage und Licht stehen in site.css (.finale-bild). So lebt auf der Seite kein drittes
// Gerätepaar, und an der Gerätebewegung ändert sich nichts.
//   node tools/geraete-standbild.mjs [--zeit 1080] [--vorschau <Ordner>]
// Schreibt assets/img/finale-geraete-{720,1080,1440}.webp (eine Datei je Pixeldichte, eigens gezeichnet) und meldet die
// Lage des Zeichens auf dem Deckel in Prozent des Bildes (für .zeichen-ziel und .zeichen-licht in site.css). Mit
// --vorschau nur PNG-Bilder in den Ordner (zum Ansehen). Playwright und sharp kommen aus dem Hauptordner (VF_APP_DIR).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDir = process.env.VF_APP_DIR ?? path.resolve(root, "..");
const require = createRequire(path.join(appDir, "package.json"));
const { chromium } = require("playwright");
const sharp = require("sharp");

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : d);
const ZEIT = Number(opt("zeit", 1080));
const vorschau = opt("vorschau", null);
const BREITEN = [720, 1080, 1440]; // Dateien; jede in ihrer Breite eigens gezeichnet (Pixeldichte = Breite / Bildbreite)

// Ein Element samt Inhalt aus dem HTML schneiden (zählt öffnende und schließende <div>)
function block(html, start) {
  const i = html.indexOf(start);
  if (i < 0) throw new Error(`nicht gefunden: ${start}`);
  const re = /<\/?div\b/g;
  re.lastIndex = i;
  let tiefe = 0;
  let m;
  while ((m = re.exec(html))) {
    tiefe += m[0] === "<div" ? 1 : -1;
    if (tiefe === 0) return html.slice(i, html.indexOf(">", m.index) + 1);
  }
  throw new Error(`nicht geschlossen: ${start}`);
}

const index = fs.readFileSync(path.join(root, "index.html"), "utf8");
const sprite = index.slice(index.indexOf('<svg class="sprite"'), index.indexOf("</svg>", index.indexOf("<symbol id=\"pin-punkt\"")) + 6);
const laptop = block(index, '<div class="laptop">');
const iphone = block(index.slice(index.indexOf('data-geraet="unterwegs"')), '<div class="iphone">');

const seite = `<!doctype html>
<html lang="de" class="js"><head><meta charset="utf-8">
<base href="${pathToFileURL(root).href}/">
<link rel="stylesheet" href="assets/css/site.css">
<style>
  html, body { background: transparent !important; margin: 0; }
  .stand { position: relative; display: flex; align-items: flex-end; width: max-content; padding: 40px 40px 80px 160px; }
  .stand .geraet { position: relative; }
  .stand .showcase-laptop { --sw: 440px; }
  .stand .showcase-phone .showcase-scene { --pw: 140px; }
  .stand .geraet-laptop { margin-right: 20px; translate: 0 86px; }
  /* Blick von schräg oben wie im Entwurf (Fluchtpunkt über dem Gerät); Pose über die Hülle .pose */
  .stand .showcase-laptop .showcase-scene { perspective: 1500px; perspective-origin: 50% 0%; }
  .stand .showcase-phone .showcase-scene { perspective: 1300px; perspective-origin: 10% 20%; }
  .stand .pose { display: grid; place-items: center; transform-style: preserve-3d; }
  .stand .pose-laptop { transform-origin: 50% var(--lh) calc(var(--lh) / 2); transform: rotateY(14deg); }
  .stand .pose-handy { transform: rotateY(-24deg); }
  .stand .showcase-floor { display: none; }
  .stand .geraet-handy { -webkit-box-reflect: below 6px linear-gradient(transparent 72%, rgb(255 255 255 / 18%)); }
  .stand .iphone-rim { display: block; }
  /* Bildschirm aus: schwarzes Glas mit einer schrägen Spiegelung statt App-Bild und Statusleiste */
  .ruhend .phone-screen { background: #05070b; }
  .ruhend .phone-screen picture, .ruhend .phone-status, .ruhend .phone-screen::after { visibility: hidden; }
  .ruhend .phone-screen::before { background: linear-gradient(122deg, rgb(255 255 255 / 13%) 0%, rgb(255 255 255 / 3%) 30%, rgb(255 255 255 / 0%) 46%, rgb(143 176 255 / 6%) 70%, rgb(255 138 94 / 8%) 100%); }
</style></head><body>
${sprite}
<div class="stand">
  <div class="geraet geraet-laptop"><div class="showcase showcase-laptop" data-t="${ZEIT}"><div class="showcase-scene"><div class="pose pose-laptop">
${laptop}
  </div><span class="showcase-floor" aria-hidden="true"></span></div></div></div>
  <div class="geraet geraet-handy"><div class="showcase showcase-phone ruhend"><div class="showcase-scene"><div class="pose pose-handy">
${iphone}
  </div><span class="showcase-floor" aria-hidden="true"></span></div></div></div>
</div>
</body></html>`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vf-standbild-"));
const datei = path.join(tmp, "standbild.html");
fs.writeFileSync(datei, seite);

const browser = await chromium.launch();
const ergebnisse = [];
let box = null; // Ausschnitt in CSS-Pixeln (aus der Deckkraft bei einfacher Dichte)
let zeichen = null;

async function aufnehmen(dichte) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: dichte, reducedMotion: "no-preference" });
  const fehler = [];
  page.on("console", (m) => m.type() === "error" && fehler.push(m.text()));
  page.on("pageerror", (e) => fehler.push(String(e)));
  await page.goto(pathToFileURL(datei).href, { waitUntil: "load" });
  const info = await page.evaluate(async () => {
    await Promise.all([...document.images].map((img) => img.decode().catch(() => null)));
    for (const s of document.querySelectorAll(".showcase")) s.classList.add("is-playing");
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (const s of document.querySelectorAll(".showcase")) {
      const t = s.dataset.t ? Number(s.dataset.t) : 100000;
      for (const a of s.getAnimations({ subtree: true })) {
        a.pause();
        a.currentTime = t;
      }
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const st = document.querySelector(".stand").getBoundingClientRect();
    const m = document.querySelector(".laptop-cover .device-mark").getBoundingClientRect();
    return { stand: { x: st.x, y: st.y, w: st.width, h: st.height }, mark: { x: m.x + m.width / 2 - st.x, y: m.y + m.height / 2 - st.y } };
  });
  if (fehler.length) throw new Error(fehler.join(" | "));
  const png = await page.screenshot({ omitBackground: true, clip: { x: info.stand.x, y: info.stand.y, width: info.stand.w, height: info.stand.h } });
  await page.close();
  return { png, info };
}

try {
  {
    const { png, info } = await aufnehmen(1);
    const { data, info: r } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let x0 = r.width, y0 = r.height, x1 = 0, y1 = 0;
    for (let y = 0; y < r.height; y++) {
      for (let x = 0; x < r.width; x++) {
        if (data[(y * r.width + x) * 4 + 3] > 2) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    const l = Math.max(0, x0 - 4);
    const o = Math.max(0, y0 - 4);
    box = { x: l, y: o, w: Math.min(r.width, x1 + 5) - l, h: Math.min(r.height, y1 + 5) - o };
    zeichen = { x: ((info.mark.x - box.x) / box.w) * 100, y: ((info.mark.y - box.y) / box.h) * 100 };
  }
  for (const breite of BREITEN) {
    const dichte = breite / box.w;
    const { png } = await aufnehmen(dichte);
    const meta = await sharp(png).metadata();
    const ex = { left: Math.round(box.x * dichte), top: Math.round(box.y * dichte) };
    ex.width = Math.min(meta.width - ex.left, Math.round(box.w * dichte));
    ex.height = Math.min(meta.height - ex.top, Math.round(box.h * dichte));
    const hoehe = Math.round((breite * box.h) / box.w);
    // höchstens ein Pixel Rundung: auf die Nennbreite gebracht, damit srcset und width/height stimmen
    const bild = sharp(png).extract(ex).resize({ width: breite, height: hoehe, fit: "fill" });
    if (vorschau) {
      fs.mkdirSync(vorschau, { recursive: true });
      const ziel = path.join(vorschau, `finale-geraete-${breite}.png`);
      await bild.png().toFile(ziel);
      ergebnisse.push(`${ziel} (${breite} × ${hoehe})`);
    } else {
      const ziel = path.join(root, "assets/img", `finale-geraete-${breite}.webp`);
      await bild.webp({ quality: 88, alphaQuality: 90, effort: 6, smartSubsample: true }).toFile(ziel);
      ergebnisse.push(`${path.relative(root, ziel)} (${breite} × ${hoehe}, ${(fs.statSync(ziel).size / 1024).toFixed(0)} KB)`);
    }
  }
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(ergebnisse.join("\n"));
console.log(`Bild ${box.w} × ${box.h} CSS-Pixel (Seitenverhältnis ${(box.w / box.h).toFixed(4)})`);
console.log(`Zeichen auf dem Deckel: ${zeichen.x.toFixed(1)} % / ${zeichen.y.toFixed(1)} % des Bildes`);
