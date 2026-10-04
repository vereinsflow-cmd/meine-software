// Erzeugt eine zweite Fassung des Vorschaubilds für soziale Netzwerke und Messenger (1200 × 630) aus tools/og-template.html:
// Logo und Kernaussage zwischen zwei Telefonen (nutzt site.css, assets/img/logo.svg und die Telefonbilder phone-dashboard und
// phone-helferplanung). Das Vorschaubild der Seite (assets/img/og-image.png) stammt seit dem neuen Logo aus dem Logo-Paket
// (siehe tools/make-logo-assets.mjs) – ersetzt wird es nur auf ausdrücklichen Wunsch:
//
//   node tools/make-og-image.mjs <ziel.png>    nur ansehen (z. B. außerhalb des Website-Ordners)
//   node tools/make-og-image.mjs --ersetzen    assets/img/og-image.png ersetzen (danach ?v= am og:image erhöhen)
//
// Braucht wie die anderen Werkzeuge Playwright und sharp aus dem Hauptordner des Repositories (VF_APP_DIR, Standard: ein Ordner höher)
// und – wie capture-screenshots.mjs – den Browserkanal „msedge“ (VF_BROWSER_CHANNEL).
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const zielArg = process.argv.slice(2).find((a) => !a.startsWith("--"));
if (!zielArg && !process.argv.includes("--ersetzen")) {
  console.error("Aufruf: node tools/make-og-image.mjs <ziel.png>  oder  node tools/make-og-image.mjs --ersetzen");
  process.exit(2);
}
const target = zielArg ? path.resolve(zielArg) : path.join(root, "assets", "img", "og-image.png");

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
  await sharp(png).resize({ width: 1200, kernel: "lanczos3" }).png({ palette: true, quality: 92, effort: 8 }).toFile(target);
  console.log(`Geschrieben: ${target}`);
} finally {
  await browser.close();
}
