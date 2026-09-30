/**
 * Erzeugt die Feature-Grafik für den Google-Play-Eintrag (PNG, genau 1024 × 500, ohne Alpha-Kanal) aus feature-grafik.html.
 *
 *   node docs/store/grafiken/werkzeuge/feature-grafik.mjs
 *
 * Die Vorlage bindet zwei Screenshots aus ../screenshots ein (02-helferplan.png, 04-nachrichten.png) – erst die Screenshots
 * erzeugen (screenshots.mjs), dann diese Grafik. Gezeichnet wird in doppelter Auflösung und dann auf 1024 × 500 verkleinert:
 * das ergibt glattere Schrift und Kanten. Farben und Schrift wie die Website (website/tools/og-template.html).
 *
 * Google Play: „JPEG oder 24-Bit-PNG (ohne Alpha)“, 1024 × 500 Pixel.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const require = createRequire(path.join(root, "package.json"));
const { chromium } = require("@playwright/test");
const sharp = require("sharp");

const WIDTH = 1024;
const HEIGHT = 500;
const target = path.resolve(here, "../feature-grafik-1024x500.png");

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2,
    locale: "de-DE",
  });
  await page.goto(pathToFileURL(path.join(here, "feature-grafik.html")).href, {
    waitUntil: "networkidle",
  });
  await page.evaluate(() => document.fonts.ready);
  const large = await page.screenshot({ type: "png" });
  await sharp(large)
    .resize(WIDTH, HEIGHT, { kernel: "lanczos3" })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(target);
  const meta = await sharp(target).metadata();
  console.log(
    `${path.relative(root, target)}  ${meta.width}×${meta.height}  (${meta.channels} Kanäle)`,
  );
} finally {
  await browser.close();
}
