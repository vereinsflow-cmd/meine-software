/**
 * Erzeugt die App-Symbole von VereinsFlow – das Bild im Browser-Tab, in Lesezeichen und auf dem Startbildschirm von Smartphones:
 *
 *   src/app/icon.svg                  Vektor-Favicon für aktuelle Browser (scharf in jeder Größe)
 *   src/app/favicon.ico               16, 32 und 48 px für Safari, Windows und ältere Browser
 *   src/app/apple-icon.png            180 px für den Home-Bildschirm von iPhone und iPad (randlos, iOS rundet selbst ab)
 *   public/app-icon-192.png           Android und Chrome (Web-App-Manifest, src/app/manifest.ts)
 *   public/app-icon-512.png
 *   public/app-icon-maskable-512.png  randlos, für Android-Startbildschirme mit runden oder tropfenförmigen Symbolen
 *
 * Gestaltung wie das Favicon der Website (website/tools/make-logo-assets.mjs): die beiden Kreise des Logos in der dunklen
 * Farbfassung auf dunklem Marineblau – so bleibt das Symbol auf hellen wie dunklen Tab-Leisten erkennbar. Kreise und Farben
 * stammen vom Original (Radius 130,5, Abstand 190; siehe README.md in diesem Ordner). Nur für 16 px wird das Symbol größer
 * gezeichnet, sonst wären die Kreise kaum mehr als ein Fleck.
 *
 * sharp (zum Umwandeln in PNG) bringt Next.js mit; fehlt es: npm install --no-save sharp
 *
 *   node docs/brand/generate-app-icons.mjs
 */
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sharp = createRequire(path.join(root, "package.json"))("sharp");

// Dunkle Farbfassung des Logos (--logo-* in globals.css) und der Grund der Kachel („Vereins“-Schrift des Originals)
const COLORS = { dark: "#4a8ccf", light: "#8dbbe8", overlap: "#2b5f98", tile: "#12253b" };

/**
 * Das Symbol auf einer 64 × 64 großen Kachel. `symbolWidth` ist die Breite der beiden Kreise zusammen (im Original 451);
 * `rounded`: abgerundete Ecken wie bei einem App-Symbol, sonst randlos (für Systeme, die selbst eine Form ausstanzen).
 */
function tile({ symbolWidth = 44, rounded = true } = {}) {
  const scale = symbolWidth / 451;
  const r = (130.5 * scale).toFixed(2);
  const offset = (95 * scale).toFixed(2); // halber Abstand der Kreismittelpunkte (190 / 2)
  const lens = (89.47 * scale).toFixed(2); // halbe Höhe des Überschnitts: √(130,5² − 95²)
  const top = (32 - lens).toFixed(2);
  const bottom = (32 + Number(lens)).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64"${rounded ? ' rx="14"' : ""} fill="${COLORS.tile}"/>
  <circle cx="${(32 - offset).toFixed(2)}" cy="32" r="${r}" fill="${COLORS.dark}"/>
  <circle cx="${(32 + Number(offset)).toFixed(2)}" cy="32" r="${r}" fill="${COLORS.light}"/>
  <path d="M32 ${top}A${r} ${r} 0 0 0 32 ${bottom}A${r} ${r} 0 0 0 32 ${top}Z" fill="${COLORS.overlap}"/>
</svg>
`;
}

/** Zeichnet in achtfacher Auflösung und verkleinert dann – das ergibt sauberere Kanten als direktes Zeichnen in 16 px. */
function png(svg, size) {
  return sharp(Buffer.from(svg), { density: 72 * 8 })
    .resize(size, size, { kernel: "lanczos3" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** ICO-Container mit eingebetteten PNG-Bildern (von allen Browsern und Windows ab Vista gelesen). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); // reserviert
  header.writeUInt16LE(1, 2); // Typ: Symbol
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + 16 * index;
    header.writeUInt8(size, entry); // Breite
    header.writeUInt8(size, entry + 1); // Höhe
    header.writeUInt16LE(1, entry + 4); // Farbebenen
    header.writeUInt16LE(32, entry + 6); // Bit pro Pixel
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.data)]);
}

const app = path.join(root, "src", "app");
const pub = path.join(root, "public");
const written = [];
async function write(file, data) {
  await fs.writeFile(file, data);
  written.push(path.relative(root, file));
}

await write(path.join(app, "icon.svg"), tile());
await write(
  path.join(app, "favicon.ico"),
  ico([
    { size: 16, data: await png(tile({ symbolWidth: 54 }), 16) },
    { size: 32, data: await png(tile(), 32) },
    { size: 48, data: await png(tile(), 48) },
  ]),
);
await write(path.join(app, "apple-icon.png"), await png(tile({ rounded: false }), 180));
await write(path.join(pub, "app-icon-192.png"), await png(tile(), 192));
await write(path.join(pub, "app-icon-512.png"), await png(tile(), 512));
// Randlos: Android stanzt selbst Kreis, Tropfen oder Quadrat aus. Die Kreise reichen bis 34 % vom Mittelpunkt und liegen damit
// sicher in der Schutzzone (Kreis mit 40 % Radius), die jede dieser Formen stehen lässt.
await write(path.join(pub, "app-icon-maskable-512.png"), await png(tile({ rounded: false }), 512));

console.log(`geschrieben:\n  ${written.join("\n  ")}`);
