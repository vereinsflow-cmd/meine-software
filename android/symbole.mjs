/**
 * Übernimmt das Logo in die Android-App – aus dem Logo-Paket der Gestalter (Ordner „vereinsflow-logo-paket“, Aufbau in dessen
 * LIESMICH.md). Was das Paket fertig liefert, wird unverändert kopiert; nur was fehlt, entsteht hier aus den SVG-Dateien des Pakets:
 *
 *   app/src/main/res/mipmap-…, values/            ← 05-app-android/res: Startsymbole klassisch (ic_launcher), rund
 *                                                   (ic_launcher_round) und adaptiv (Vordergrund + Hintergrundfarbe Tinte)
 *   app/src/main/res/drawable-…/splash.png          Startbild der App (300–1200 px): Symbol in Weiß/Himmel auf einer Kachel in
 *                                                   Tinte, aufgebaut wie ic_launcher.png des Pakets (aus vereinsflow-symbol-weiss.svg)
 *   app/src/main/res/drawable-…/ic_notification_icon.png   Symbol in der Statusleiste bei Push-Nachrichten (24 dp), nur Weiß
 *   ../public/app-icon-monochrome-512.png           dasselbe in 512 px – Quelle für Bubblewrap (monochromeIconUrl in twa-manifest.json)
 *   ../public/push-badge.png                        dasselbe in 96 px – Web-Push im Browser (PUSH_BADGE in public/sw.js)
 *   ../docs/store/grafiken/icon-512.png             ← 05-app-android/play-store-icon-512.png (als 32-Bit-PNG, wie Google es verlangt)
 *
 * Die einfarbigen Symbole nehmen die ruhigere Form des Pakets für kleine Größen (src/app/icon.svg: zwei statt drei Etappen, ohne
 * Tempo-Striche), ohne Hintergrund und ganz in Weiß: Android wertet nur die Deckkraft aus und färbt das Symbol selbst.
 * Die alten Startsymbole von Bubblewrap (ic_maskable.png) werden entfernt – das adaptive Symbol des Pakets braucht sie nicht.
 *
 *   node android/symbole.mjs [Pfad zum Logo-Paket]     (Standard: ~/Downloads/vereinsflow-logo-paket)
 *
 * Danach die App bauen (android/README.md). Achtung: `bubblewrap update` überschreibt die Startsymbole und das Startbild wieder
 * mit seinen eigenen (aus den Bildern der Website) – anschließend dieses Skript erneut ausführen.
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const sharp = createRequire(path.join(root, "package.json"))("sharp");

const paket = path.resolve(
  process.argv[2] ?? path.join(os.homedir(), "Downloads", "vereinsflow-logo-paket"),
);
const res = path.join(here, "app", "src", "main", "res");
const DICHTEN = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const written = [];

function paketDatei(...teile) {
  const datei = path.join(paket, ...teile);
  if (!fs.existsSync(datei)) throw new Error(`Logo-Paket unvollständig, es fehlt: ${datei}`);
  return datei;
}

/** Zerlegt eine SVG-Datei des Pakets in viewBox und Inhalt (ohne <title>). */
function svgTeile(datei) {
  const text = fs.readFileSync(datei, "utf8");
  const viewBox = /viewBox="([^"]+)"/
    .exec(text)?.[1]
    .split(/[\s,]+/)
    .map(Number);
  const inhalt = /<svg[^>]*>([\s\S]*)<\/svg>/
    .exec(text)?.[1]
    .replace(/<title>[\s\S]*?<\/title>/, "");
  if (viewBox?.length !== 4 || !inhalt) throw new Error(`Unerwarteter Aufbau: ${datei}`);
  return { viewBox, inhalt };
}

function svg(viewBox, inhalt, breite, hoehe = breite) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${breite}" height="${hoehe}" viewBox="${viewBox.join(" ")}">${inhalt}</svg>`;
}

/** Begrenzungsrahmen der sichtbaren Formen (in Einheiten der viewBox), gemessen an einer Darstellung in 2000 px. */
async function rahmen({ viewBox, inhalt }) {
  const px = 2000;
  const massstab = px / Math.max(viewBox[2], viewBox[3]);
  const darstellung = svg(
    viewBox,
    inhalt,
    Math.round(viewBox[2] * massstab),
    Math.round(viewBox[3] * massstab),
  );
  const { data, info } = await sharp(Buffer.from(darstellung))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let [x0, y0, x1, y1] = [info.width, info.height, -1, -1];
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] === 0) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x + 1);
      y1 = Math.max(y1, y + 1);
    }
  }
  if (x1 < 0) throw new Error("Symbol ist leer");
  const zuEinheit = (wert, start) => start + wert / massstab;
  return {
    x: zuEinheit(x0, viewBox[0]),
    y: zuEinheit(y0, viewBox[1]),
    breite: (x1 - x0) / massstab,
    hoehe: (y1 - y0) / massstab,
  };
}

/**
 * Quadratische viewBox, in der das Symbol mittig sitzt und `anteil` der Kantenlänge einnimmt (gemessen an der längeren Seite
 * seines Begrenzungsrahmens).
 */
function quadratUm(r, anteil) {
  const kante = Math.max(r.breite, r.hoehe) / anteil;
  return [r.x + r.breite / 2 - kante / 2, r.y + r.hoehe / 2 - kante / 2, kante, kante].map((wert) =>
    Number(wert.toFixed(3)),
  );
}

async function schreibePng(ziel, svgText) {
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  await sharp(Buffer.from(svgText)).ensureAlpha().png({ compressionLevel: 9 }).toFile(ziel);
  written.push(path.relative(root, ziel));
}

function kopiere(quelle, ziel) {
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.copyFileSync(quelle, ziel);
  written.push(path.relative(root, ziel));
}

// 1) Startsymbole unverändert aus dem Paket (05-app-android/res → app/src/main/res)
const paketRes = paketDatei("05-app-android", "res");
for (const eintrag of fs.readdirSync(paketRes, { recursive: true, withFileTypes: true })) {
  if (!eintrag.isFile() || eintrag.name.startsWith(".")) continue;
  const quelle = path.join(eintrag.parentPath, eintrag.name);
  kopiere(quelle, path.join(res, path.relative(paketRes, quelle)));
}
for (const dichte of Object.keys(DICHTEN)) {
  const alt = path.join(res, `mipmap-${dichte}`, "ic_maskable.png");
  if (fs.existsSync(alt)) {
    fs.rmSync(alt);
    console.log(`entfernt: ${path.relative(root, alt)}`);
  }
}

// 2) Startbild: Kachel in Tinte (Hintergrundfarbe des adaptiven Symbols im Paket) mit dem Symbol in Weiß/Himmel – Aufbau wie
//    ic_launcher.png bzw. app-icon-512.png des Pakets: Symbol mittig, 74 % der Kachelbreite, Ecken mit 20 % Radius.
const tinte = /<color name="ic_launcher_background">(#[0-9A-Fa-f]{6})<\/color>/.exec(
  fs.readFileSync(
    paketDatei("05-app-android", "res", "values", "ic_launcher_background.xml"),
    "utf8",
  ),
)?.[1];
if (!tinte) throw new Error("Hintergrundfarbe ic_launcher_background fehlt im Logo-Paket");
const symbol = svgTeile(paketDatei("01-logo", "svg", "vereinsflow-symbol-weiss.svg"));
const kachel = quadratUm(await rahmen(symbol), 0.74);
const kachelInhalt = `<rect x="${kachel[0]}" y="${kachel[1]}" width="${kachel[2]}" height="${kachel[3]}" rx="${(kachel[2] * 0.2).toFixed(3)}" fill="${tinte}"/>${symbol.inhalt}`;
for (const [dichte, faktor] of Object.entries(DICHTEN)) {
  await schreibePng(
    path.join(res, `drawable-${dichte}`, "splash.png"),
    svg(kachel, kachelInhalt, 300 * faktor),
  );
}

// 3) Einfarbige Symbole: kleine Form aus dem Paket, ohne Kachel, alles Weiß. Das Symbol nimmt 80 % der Fläche ein (bei 24 dp
//    rund 19 dp – innerhalb der 20 dp, die Android für Symbole der Statusleiste vorsieht).
const klein = svgTeile(paketDatei("03-software", "src", "app", "icon.svg"));
klein.inhalt = klein.inhalt
  .replace(/<rect\b[^>]*\/>/, "") // Kachel im Hintergrund
  .replace(/(fill|stroke)="#[0-9A-Fa-f]{3,8}"/g, '$1="#FFFFFF"');
const einfarbig = quadratUm(await rahmen(klein), 0.8);
for (const [dichte, faktor] of Object.entries(DICHTEN)) {
  await schreibePng(
    path.join(res, `drawable-${dichte}`, "ic_notification_icon.png"),
    svg(einfarbig, klein.inhalt, 24 * faktor),
  );
}
await schreibePng(
  path.join(root, "public", "app-icon-monochrome-512.png"),
  svg(einfarbig, klein.inhalt, 512),
);
await schreibePng(path.join(root, "public", "push-badge.png"), svg(einfarbig, klein.inhalt, 96));

// 4) Symbol für den Play Store: Datei des Pakets, nur als 32-Bit-PNG (undurchsichtiger Alpha-Kanal) gespeichert.
const storeIcon = path.join(root, "docs", "store", "grafiken", "icon-512.png");
await sharp(paketDatei("05-app-android", "play-store-icon-512.png"))
  .ensureAlpha(1)
  .png({ compressionLevel: 9 })
  .toFile(storeIcon);
written.push(path.relative(root, storeIcon));

console.log(`aus ${paket}\ngeschrieben:\n  ${written.join("\n  ")}`);
