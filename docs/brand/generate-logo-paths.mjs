/**
 * Erzeugt src/components/shared/brand-logo-paths.ts: die Umrisse von Wortmarke und Slogan des VereinsFlow-Logos.
 *
 * Das Original-Logo (vereinsflow-logo-original.png, 1760 × 1120 Pixel) ist in der Schrift Poppins (SIL Open Font License) gesetzt.
 * Dieses Skript setzt die Texte aus den Schriftdateien und wandelt sie in Pfade um, mit den am Original gemessenen Werten:
 *
 *   "Vereins"  Poppins Regular,  Größe 114     Tintenrand links x = 540,  Grundlinie y = 734
 *   "Flow"     Poppins SemiBold, Größe 115,2   Tintenrand links x = 966,  Grundlinie y = 734
 *   Slogan     Poppins Medium,   Größe 29, Zeichenabstand 0,54 px, Tintenrand links x = 650, Grundlinie y = 797,7
 *
 * Die Werte wurden so angepasst, dass jeder Buchstabe höchstens 1–2 Pixel vom Original abweicht.
 * Poppins und opentype.js braucht nur dieses Skript, nicht die Anwendung:
 *
 *   npm install --no-save @fontsource/poppins opentype.js
 *   node docs/brand/generate-logo-paths.mjs
 *
 * Danach prettier ausführen (npx prettier --write src/components/shared/brand-logo-paths.ts).
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const opentype = require("opentype.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fontsDir = path.join(root, "node_modules", "@fontsource", "poppins", "files");
const target = path.join(root, "src", "components", "shared", "brand-logo-paths.ts");

const loadFont = (weight) => {
  const buffer = fs.readFileSync(path.join(fontsDir, `poppins-latin-${weight}-normal.woff`));
  return opentype.parse(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );
};

/** Setzt Text Glyph für Glyph (mit Kerning und Zeichenabstand) und verschiebt ihn so, dass der linke Tintenrand bei `inkLeft` liegt. */
function setText(font, text, size, letterSpacing, inkLeft, baseline) {
  const scale = size / font.unitsPerEm;
  const glyphs = font.stringToGlyphs(text);
  const parts = [];
  let x = 0;
  glyphs.forEach((glyph, index) => {
    parts.push(glyph.getPath(x, baseline, size));
    const next = glyphs[index + 1];
    x += glyph.advanceWidth * scale + letterSpacing;
    if (next) x += font.getKerningValue(glyph, next) * scale;
  });
  const inked = parts.filter((part) => part.commands.length > 0);
  const shift = inkLeft - Math.min(...inked.map((part) => part.getBoundingBox().x1));
  const merged = new opentype.Path();
  for (const part of parts) {
    for (const command of part.commands) {
      const moved = { ...command };
      for (const key of ["x", "x1", "x2"]) if (key in moved) moved[key] += shift;
      merged.commands.push(moved);
    }
  }
  return merged.toPathData(1);
}

const paths = {
  vereins: setText(loadFont(400), "Vereins", 114, 0, 540, 734),
  flow: setText(loadFont(600), "Flow", 115.2, 0, 966, 734),
  tagline: setText(loadFont(500), "BRINGT VEREINSARBEIT IN FLUSS", 29, 0.54, 650, 797.7),
};

const source = `/**
 * Umrisse des VereinsFlow-Logos (Wortmarke und Slogan) als Pfaddaten.
 *
 * Die Schrift des Logos ist Poppins (SIL Open Font License); die Umrisse sind aus den Schriftdateien erzeugt und auf die Maße des
 * Original-Logos (docs/brand/vereinsflow-logo-original.png, 1760 × 1120 Pixel) abgestimmt: "Vereins" in Regular, "Flow" in SemiBold,
 * der Slogan in Medium mit leichtem Zeichenabstand. Alle Koordinaten liegen im Pixelraster des Originals, Grundlinie der Wortmarke y = 734.
 * Erzeugt mit docs/brand/generate-logo-paths.mjs – nicht von Hand ändern.
 *
 * Als Pfade (nicht als Schrift) eingebettet, damit das Logo überall gleich aussieht, ohne dass eine Schriftdatei geladen werden muss.
 */
export const LOGO_PATHS = {
  vereins: "${paths.vereins}",
  flow: "${paths.flow}",
  tagline: "${paths.tagline}",
} as const;
`;
fs.writeFileSync(target, source, "utf8");
console.log(`geschrieben: ${path.relative(root, target)} (${source.length} Zeichen)`);
