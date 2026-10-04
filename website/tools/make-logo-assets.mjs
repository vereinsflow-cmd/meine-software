// Übernimmt die Logo-Dateien der Website aus dem Logo-Paket (Ordner „02-website“ des Pakets, das die Gestaltung liefert –
// Stand: neues Logo vom Oktober 2026). Die Dateien sind dort fertig gezeichnet (Schrift in Pfade umgewandelt, Favicons in
// der ruhigeren Form für kleine Größen); dieses Skript erzeugt deshalb nichts mehr selbst, sondern kopiert sie an ihren
// Platz, prüft die Bildgrößen und meldet <img>-Angaben, die nicht zum Seitenverhältnis des Logos passen.
//
//   node tools/make-logo-assets.mjs <Ordner des Logo-Pakets>    kopieren und prüfen (oder VF_LOGO_PAKET setzen)
//   node tools/make-logo-assets.mjs --pruefen [<Ordner>]         nur prüfen; mit Ordner auch, ob alles dem Paket entspricht
//
// Danach an den geänderten Dateien `?v=` erhöhen (siehe README „Veröffentlichen“), sonst zeigen Browser bis zu 7 Tage die
// alten Bilder. Ohne Abhängigkeiten (kein sharp, kein Playwright).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const nurPruefen = args.includes("--pruefen");
const paketArg = args.find((a) => !a.startsWith("--")) ?? process.env.VF_LOGO_PAKET;
const paket = paketArg ? path.resolve(paketArg) : null;
if (!paket && !nurPruefen) {
  console.error("Aufruf: node tools/make-logo-assets.mjs <Ordner des Logo-Pakets>   (oder --pruefen)");
  process.exit(2);
}
// Der Ordner „02-website“ darf direkt oder über den Paketordner angegeben werden
const quelle = paket && fs.existsSync(path.join(paket, "02-website")) ? path.join(paket, "02-website") : paket;

/** Dateien der Website aus dem Paket – mit Pixelmaßen, wo es auf sie ankommt. */
const DATEIEN = {
  "favicon.svg": null,
  "favicon.ico": null,
  "apple-touch-icon.png": [180, 180],
  "android-chrome-192.png": [192, 192], // Web-Manifest (site.webmanifest)
  "android-chrome-512.png": [512, 512],
  "assets/img/logo.svg": null, // Kopf- und Fußzeile aller Seiten (auch newsletter.php)
  "assets/img/logo-dark.svg": null,
  "assets/img/og-image.png": [1200, 630], // Vorschaubild beim Teilen (og:image)
  "assets/img/logo-mail.png": [570, 87], // Kopf der Bestätigungs-E-Mail (newsletter.php) – Adresse nie ändern
  "assets/img/logo-mail@2x.png": [1140, 174],
  "assets/brand/logo-horizontal.svg": null, // Vorlagen (Presse, Präsentationen)
  "assets/brand/logo-horizontal-dark.svg": null,
  "assets/brand/logo-stacked.svg": null,
  "assets/brand/logo-stacked-dark.svg": null,
  "assets/brand/logo-stacked.png": null,
};

const pngMasse = (datei) => {
  const b = fs.readFileSync(datei);
  if (b.length < 24 || b.toString("latin1", 1, 4) !== "PNG") return null;
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};

let hinweise = 0;
const melde = (text) => {
  hinweise++;
  console.log(`  ✗ ${text}`);
};

if (quelle) {
  if (!fs.existsSync(path.join(quelle, "assets", "img", "logo.svg"))) {
    console.error(`Kein Logo-Paket gefunden: ${quelle} (erwartet 02-website/assets/img/logo.svg)`);
    process.exit(2);
  }
  console.log(nurPruefen ? `Vergleiche mit ${quelle}` : `Übernehme aus ${quelle}`);
  for (const rel of Object.keys(DATEIEN)) {
    const von = path.join(quelle, rel);
    const nach = path.join(root, rel);
    if (!fs.existsSync(von)) {
      melde(`${rel} fehlt im Paket`);
      continue;
    }
    if (nurPruefen) {
      if (!fs.existsSync(nach) || !fs.readFileSync(von).equals(fs.readFileSync(nach))) melde(`${rel} weicht vom Paket ab`);
      continue;
    }
    fs.mkdirSync(path.dirname(nach), { recursive: true });
    fs.copyFileSync(von, nach);
    console.log(`  ${rel}`);
  }
}

// Bildgrößen
for (const [rel, masse] of Object.entries(DATEIEN)) {
  const datei = path.join(root, rel);
  if (!fs.existsSync(datei)) {
    melde(`${rel} fehlt in der Website`);
    continue;
  }
  if (!masse) continue;
  const ist = pngMasse(datei);
  if (!ist || ist[0] !== masse[0] || ist[1] !== masse[1]) melde(`${rel}: ${ist?.join(" × ") ?? "kein PNG"} statt ${masse.join(" × ")}`);
}

// <img>-Angaben des Logos: width/height müssen zum Seitenverhältnis von logo.svg passen (sonst springt die Seite beim Laden)
const svg = fs.readFileSync(path.join(root, "assets", "img", "logo.svg"), "utf8");
const vb = svg.match(/viewBox="([^"]+)"/)?.[1].trim().split(/[\s,]+/).map(Number);
const verhaeltnis = vb ? vb[2] / vb[3] : null;
const seiten = fs.readdirSync(root).filter((f) => f.endsWith(".html") || f === "newsletter.php");
for (const seite of seiten) {
  const text = fs.readFileSync(path.join(root, seite), "utf8");
  for (const [tag] of text.matchAll(/<img\b[^>]*\blogo\.svg[^>]*>/g)) {
    const w = Number(tag.match(/\bwidth="(\d+)"/)?.[1]);
    const h = Number(tag.match(/\bheight="(\d+)"/)?.[1]);
    if (!w || !h) melde(`${seite}: Logo ohne width/height`);
    else if (verhaeltnis && Math.abs(w / verhaeltnis - h) > 1) {
      melde(`${seite}: Logo ${w} × ${h} – passend wäre ${w} × ${Math.round(w / verhaeltnis)}`);
    }
  }
}

console.log(hinweise ? `${hinweise} Hinweis(e)` : "Logo-Dateien vollständig, Größen und <img>-Angaben stimmen.");
process.exit(hinweise ? 1 : 0);
