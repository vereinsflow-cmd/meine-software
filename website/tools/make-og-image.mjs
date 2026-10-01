// Erzeugt das Vorschaubild für soziale Netzwerke und Messenger (assets/img/og-image.png, 1200 × 630) aus tools/og-template.html
// (nutzt site.css und die Telefonbilder phone-dashboard und phone-helferplanung – nach neuen Aufnahmen neu erzeugen).
//
//   node tools/make-og-image.mjs
//
// Braucht wie die anderen Werkzeuge Playwright und sharp aus dem Hauptordner des Repositories (VF_APP_DIR, Standard: ein Ordner höher)
// und – wie capture-screenshots.mjs – den Browserkanal „msedge“ (VF_BROWSER_CHANNEL).
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = process.env.VF_APP_DIR ?? path.resolve(root, "..");
const require = createRequire(path.join(APP_DIR, "package.json"));
const { chromium } = require("playwright");
const sharp = require("sharp");

const browser = await chromium.launch({ channel: process.env.VF_BROWSER_CHANNEL ?? "msedge" });
try {
  // Doppelte Auflösung und danach verkleinert: feinere Kanten an Schrift und Telefonrahmen. Ohne Bewegung (die Vorlage
  // nutzt site.css, dort blenden Unterstrich und Hinweise sonst erst ein).
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
  await page.goto(pathToFileURL(path.join(root, "tools", "og-template.html")).href, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: "png" });
  const target = path.join(root, "assets", "img", "og-image.png");
  await sharp(png).resize({ width: 1200, kernel: "lanczos3" }).png({ palette: true, quality: 92, effort: 8 }).toFile(target);
  console.log(`Geschrieben: ${path.relative(root, target)}`);
} finally {
  await browser.close();
}
