// Erzeugt Logo- und Favicon-Dateien aus den Vektordaten der App (src/components/shared/brand-logo*.ts[x]).
// Die Maße und Farben stammen aus docs/brand/README.md der App; ändert sich das Logo dort, dieses Skript erneut ausführen:
//
//   node tools/make-logo-assets.mjs
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = process.env.VF_APP_DIR ?? path.resolve(root, ".."); // Repository-Hauptordner (Anwendung)
const sharp = createRequire(path.join(APP_DIR, "package.json"))("sharp");

const source = await fs.readFile(path.join(APP_DIR, "src/components/shared/brand-logo-paths.ts"), "utf8");
const pathData = (key) => {
  const match = source.match(new RegExp(`\\b${key}\\s*:\\s*(["'\`])([\\s\\S]*?)\\1`));
  if (!match) throw new Error(`Pfad „${key}“ nicht in brand-logo-paths.ts gefunden`);
  return match[2].replace(/\s+/g, " ").trim();
};
const paths = { vereins: pathData("vereins"), flow: pathData("flow"), tagline: pathData("tagline") };

// Farben wie in globals.css (--logo-*), hell und dunkel
const palettes = {
  light: { dark: "#1c4a7a", light: "#5b9cd6", overlap: "#112e4f", ink: "#12253b", muted: "#78827a" },
  dark: { dark: "#4a8ccf", light: "#8dbbe8", overlap: "#2b5f98", ink: "#eef3f9", muted: "#9aa5a0" },
};

const symbol = (c) => `<circle cx="785.5" cy="420.5" r="130.5" fill="${c.dark}"/>
    <circle cx="975.5" cy="420.5" r="130.5" fill="${c.light}"/>
    <path d="M880.5 331.03A130.5 130.5 0 0 0 880.5 509.97A130.5 130.5 0 0 0 880.5 331.03Z" fill="${c.overlap}"/>`;
const wordmark = (c) => `<path d="${paths.vereins}" fill="${c.ink}"/>
    <path d="${paths.flow}" fill="${c.dark}"/>`;

const TITLE = "VereinsFlow – Bringt Vereinsarbeit in Fluss";
const horizontal = (c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1005 162" role="img" aria-label="${TITLE}">
  <title>${TITLE}</title>
  <g transform="scale(0.62) translate(-655 -290)">
    ${symbol(c)}
  </g>
  <g transform="translate(-216.4 -613.4)">
    ${wordmark(c)}
  </g>
</svg>
`;
const stacked = (c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="536 286 689 515" role="img" aria-label="${TITLE}">
  <title>${TITLE}</title>
  ${symbol(c)}
  ${wordmark(c)}
  <path d="${paths.tagline}" fill="${c.muted}"/>
</svg>
`;

// Favicon: Symbol auf dunklem, abgerundetem Grund – auch in 16 px noch lesbar. Skaliert vom Original (Radius 130,5; Abstand 190).
const s = 44 / 451;
const r = 130.5 * s;
const half = (190 * s) / 2;
const lens = 89.47 * s;
const iconBody = (c) => `<circle cx="${(32 - half).toFixed(2)}" cy="32" r="${r.toFixed(2)}" fill="${c.dark}"/>
  <circle cx="${(32 + half).toFixed(2)}" cy="32" r="${r.toFixed(2)}" fill="${c.light}"/>
  <path d="M32 ${(32 - lens).toFixed(2)}A${r.toFixed(2)} ${r.toFixed(2)} 0 0 0 32 ${(32 + lens).toFixed(2)}A${r.toFixed(2)} ${r.toFixed(2)} 0 0 0 32 ${(32 - lens).toFixed(2)}Z" fill="${c.overlap}"/>`;
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#12253b"/>
  ${iconBody(palettes.dark)}
</svg>
`;
const touchIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="180" height="180">
  <rect width="64" height="64" fill="#12253b"/>
  ${iconBody(palettes.dark)}
</svg>`;

const img = path.join(root, "assets", "img"); // von den Seiten verwendet
const brand = path.join(root, "assets", "brand"); // Vorlagen für Profilbilder, Präsentationen, Pressematerial
await fs.mkdir(img, { recursive: true });
await fs.mkdir(brand, { recursive: true });
const write = (file, data) => fs.writeFile(file, data, "utf8");

await write(path.join(img, "logo.svg"), horizontal(palettes.light));
await write(path.join(img, "logo-dark.svg"), horizontal(palettes.dark));
await write(path.join(brand, "logo-horizontal.svg"), horizontal(palettes.light));
await write(path.join(brand, "logo-horizontal-dark.svg"), horizontal(palettes.dark));
await write(path.join(brand, "logo-stacked.svg"), stacked(palettes.light));
await write(path.join(brand, "logo-stacked-dark.svg"), stacked(palettes.dark));
await sharp(Buffer.from(stacked(palettes.light)), { density: 144 }).resize({ width: 1200 }).png().toFile(path.join(brand, "logo-stacked.png"));
await write(path.join(root, "favicon.svg"), favicon);

await sharp(Buffer.from(touchIcon)).resize(180, 180).png().toFile(path.join(root, "apple-touch-icon.png"));

// favicon.ico: ein ICO-Container mit einem eingebetteten 48-px-PNG (Browser und Crawler, die /favicon.ico anfragen)
const png = await sharp(Buffer.from(favicon)).resize(48, 48).png().toBuffer();
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); // reserviert
header.writeUInt16LE(1, 2); // Typ: Symbol
header.writeUInt16LE(1, 4); // Anzahl Bilder
header.writeUInt8(48, 6); // Breite
header.writeUInt8(48, 7); // Höhe
header.writeUInt16LE(1, 10); // Farbebenen
header.writeUInt16LE(32, 12); // Bit pro Pixel
header.writeUInt32LE(png.length, 14); // Größe der Bilddaten
header.writeUInt32LE(22, 18); // Offset der Bilddaten
await fs.writeFile(path.join(root, "favicon.ico"), Buffer.concat([header, png]));

console.log("Logo- und Favicon-Dateien geschrieben: assets/img/logo(.svg|-dark.svg), assets/brand/*, favicon.svg/.ico, apple-touch-icon.png");
