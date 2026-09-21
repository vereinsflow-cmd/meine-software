// Erzeugt das Vorschaubild für soziale Netzwerke und Messenger (assets/img/og-image.png, 1200 × 630) aus tools/og-template.html.
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
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(path.join(root, "tools", "og-template.html")).href, { waitUntil: "networkidle" });
  const png = await page.screenshot({ type: "png" });
  const target = path.join(root, "assets", "img", "og-image.png");
  await sharp(png).png({ palette: true, quality: 92, effort: 8 }).toFile(target);
  console.log(`Geschrieben: ${path.relative(root, target)}`);
} finally {
  await browser.close();
}
