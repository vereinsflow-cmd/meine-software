// Erzeugt die Produkt-Screenshots der Website aus einer laufenden VereinsFlow-Demo (Seed-Daten).
//
//   node tools/capture-screenshots.mjs                    alle Bilder, hell und dunkel
//   node tools/capture-screenshots.mjs --only dashboard   nur ein Bild (mehrere: --only a,b)
//   node tools/capture-screenshots.mjs --scheme light     nur die helle Darstellung
//
// Voraussetzungen: Die Demo-App läuft (Standard http://localhost:3000, `npm run dev:all` im Ordner der App), und im
// App-Ordner sind Playwright und sharp installiert. Ist nur Edge (kein Chromium) installiert, funktioniert das Skript
// trotzdem: es startet standardmäßig den Kanal „msedge“ (änderbar mit VF_BROWSER_CHANNEL).
//
// Umgebungsvariablen (alle optional):
//   VF_APP_DIR         Ordner mit node_modules (Playwright, sharp)  (Standard: der übergeordnete Ordner = Repository-Hauptordner)
//   VF_APP_URL         Adresse der laufenden Demo                 (http://localhost:3000)
//   VF_DEMO_EMAIL      Demo-Benutzer (Vereinsadmin)               (admin@demo-verein.local)
//   VF_DEMO_PASSWORD   Passwort der Demo-Benutzer, siehe SEED_PASSWORD in der .env der App
//   VF_BROWSER_CHANNEL Browserkanal für Playwright                (msedge)
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "assets", "img", "app");
const APP_DIR = process.env.VF_APP_DIR ?? path.resolve(root, "..");
const BASE = (process.env.VF_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.env.VF_DEMO_EMAIL ?? "admin@demo-verein.local";
const PASSWORD = process.env.VF_DEMO_PASSWORD ?? "Vereinsflow-Demo-2026!";
const CHANNEL = process.env.VF_BROWSER_CHANNEL ?? "msedge";

const require = createRequire(path.join(APP_DIR, "package.json"));
const { chromium } = require("playwright");
const sharp = require("sharp");

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const only = flag("only")?.split(",");
const schemes = flag("scheme") ? [flag("scheme")] : ["light", "dark"];

const DESKTOP = { viewport: { width: 1280, height: 800 }, scale: 2, widths: [960, 1920] };
const DETAIL = { width: 1140, height: 855 };
const DETAIL_TALL = { width: 1140, height: 1000 };
const PHONE = { viewport: { width: 390, height: 844 }, scale: 3, widths: [390, 780] };

/** Ein Klick auf den ersten Link mit diesem Text; wartet, bis die neue Seite wirklich da und ruhig ist. */
const followLink = (name) => async (page) => {
  const before = new URL(page.url()).pathname;
  await page.getByRole("link", { name }).first().click();
  await page.waitForURL((url) => url.pathname !== before);
  await page.waitForLoadState("networkidle");
};

/**
 * Bildliste (nur, was die Website tatsächlich zeigt). `path` wird direkt geöffnet; `steps` läuft danach
 * (z. B. Klick auf eine Veranstaltung). `device`: „desktop“ (1280 × 800) oder „phone“ (390 × 844, Touch, mobiles Menü).
 * `scrollY`: Fenster vor der Aufnahme so weit scrollen.
 *
 * Weitere Seiten der Anwendung, die sich für Bilder eignen: /aufgaben, /benutzer, /protokoll (Filter „Mitglieder“),
 * /nachrichten/neu, /datenschutz, /helferplanung, /dashboard?tab=termine. Nicht verwenden: die Detailseite einer
 * Veranstaltung bei 1280 px Breite (der Titel wird dort von den Schaltflächen überdeckt).
 */
/** Klappt eine Gruppe der Seitenleiste auf (alle Gruppen sind sonst zu und die Leiste wirkt im Bild leer). */
const openNavGroup = (label) => async (page) => {
  await page.getByRole("button", { name: label, exact: true }).first().click();
  await page.waitForTimeout(300); // Aufklapp-Animation
};

const shots = [
  { name: "dashboard", path: "/dashboard", steps: openNavGroup("Verein") },
  // Die Detailbilder sind schmaler (1140 px statt 1280 px): Bei gleicher Anzeigegröße auf der Seite wird der Text lesbarer.
  // Der Helferplan ist höher, damit die Ampel-Zustände „Voll besetzt“ und „Teilweise besetzt“ beide zu sehen sind.
  { name: "schichten", path: "/helferplanung", steps: followLink(/Sommerfest 2026/), viewport: DETAIL_TALL },
  { name: "mitglieder", path: "/mitglieder", viewport: DETAIL },
  // Der Oktober ist gefüllter als der September (Sommerfest, Trainings); der Monat steht in der Adresse.
  { name: "kalender", path: "/kalender?ansicht=monat&datum=2026-10-01", viewport: DETAIL },
  // Diagramme („Auswertungen“) liegen weiter unten auf dem Reiter „Mitglieder“
  { name: "auswertung", path: "/dashboard?tab=mitglieder", scrollY: 500, viewport: DETAIL },
  { name: "phone-dashboard", device: "phone", path: "/dashboard" },
  { name: "phone-helferplanung", device: "phone", path: "/helferplanung" },
  { name: "phone-schichten", device: "phone", path: "/helferplanung", steps: followLink(/Sommerfest 2026/) },
  { name: "phone-kalender", device: "phone", path: "/kalender" },
];

/**
 * In der Entwicklungsdatenbank heißt der Demo-Administrator womöglich anders als im Seed („Anna Admin“). Damit die Bilder
 * der Vorführ-Figur entsprechen, wird der Name nur im Browser (nicht in der Datenbank) ersetzt.
 * Von Hand angelegte Einträge, die nicht aus dem Seed stammen, bekommen ebenso einen erfundenen Namen: Das Repository
 * und die Website sind öffentlich, echte Namen gehören nicht ins Bild.
 */
const DEMO_RENAME = [
  [/Luis Admin/g, "Anna Admin"],
  [/\bLuis\b/g, "Anna"],
  [/\bBleckert\b/g, "Brandt"],
];
async function normalizeDemoNames(page) {
  await page.evaluate((rules) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      let text = node.nodeValue ?? "";
      for (const [source, flags, replacement] of rules) text = text.replace(new RegExp(source, flags), replacement);
      if (text !== node.nodeValue) node.nodeValue = text;
    }
    for (const el of document.querySelectorAll("span, div")) {
      if (el.children.length === 0 && el.textContent?.trim() === "LA") el.textContent = "AA";
    }
  }, DEMO_RENAME.map(([re, replacement]) => [re.source, re.flags, replacement]));
}

/** Das Symbol der Next.js-Entwicklungsumgebung und Einblendungen gehören nicht ins Bild. */
const HIDE_DEV_UI = "nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button] { display: none !important; }";

async function newSession(browser, scheme, device) {
  const spec = device === "phone" ? PHONE : DESKTOP;
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: spec.viewport,
    deviceScaleFactor: spec.scale,
    colorScheme: scheme,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    ...(device === "phone" ? { isMobile: true, hasTouch: true } : {}),
  });
  context.setDefaultTimeout(45_000);
  const page = await context.newPage();
  await page.goto("/anmelden", { waitUntil: "networkidle" });
  await page.getByLabel("E-Mail-Adresse").fill(EMAIL);
  await page.getByLabel("Passwort").fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/anmelden"));
  await page.waitForLoadState("networkidle");
  return { context, page, spec };
}

async function main() {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: CHANNEL });
  const selected = shots.filter((s) => !only || only.includes(s.name));
  if (!selected.length) throw new Error(`Kein Bild mit diesem Namen: ${only?.join(", ")}`);

  try {
    for (const scheme of schemes) {
      for (const device of ["desktop", "phone"]) {
        const list = selected.filter((s) => (s.device ?? "desktop") === device);
        if (!list.length) continue;
        const { context, page, spec } = await newSession(browser, scheme, device);
        for (const shot of list) {
          try {
            await page.setViewportSize(shot.viewport ?? spec.viewport);
            await page.goto(shot.path, { waitUntil: "networkidle" });
            await shot.steps?.(page);
            await page.addStyleTag({ content: HIDE_DEV_UI });
            await page.evaluate(() => document.fonts.ready);
            await normalizeDemoNames(page);
            await page.evaluate((y) => window.scrollTo(0, y), shot.scrollY ?? 0);
            await page.mouse.move(0, 0); // kein Hover-Zustand im Bild
            await page.waitForTimeout(500); // Übergänge und Diagramm-Animationen abwarten
            const png = await page.screenshot({ type: "png" });
            for (const width of spec.widths) {
              const file = path.join(out, `${shot.name}-${scheme}-${width}.webp`);
              await sharp(png).resize({ width, withoutEnlargement: true }).webp({ quality: 82, effort: 5 }).toFile(file);
            }
            console.log(`${scheme.padEnd(5)} ${shot.name}  (${page.url().replace(BASE, "")})`);
          } catch (error) {
            console.error(`FEHLER ${scheme} ${shot.name}: ${String(error.message).split("\n")[0]}`);
            process.exitCode = 1;
          }
        }
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
