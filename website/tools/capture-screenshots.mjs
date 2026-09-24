// Erzeugt die Produkt-Screenshots der Website aus einer laufenden VereinsFlow-Demo (Seed-Daten).
//
//   node tools/capture-screenshots.mjs                    alle Bilder (hell – die Website ist immer hell)
//   node tools/capture-screenshots.mjs --only dashboard   nur ein Bild (mehrere: --only a,b)
//   node tools/capture-screenshots.mjs --scheme dark      dunkle Darstellung (wird derzeit nicht verwendet)
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
// Die Website ist immer hell; dunkle Aufnahmen gibt es nur auf Wunsch (--scheme dark).
const schemes = flag("scheme") ? [flag("scheme")] : ["light"];

const DESKTOP = { viewport: { width: 1280, height: 800 }, scale: 2, widths: [960, 1920] };
/**
 * Telefonbilder: je Bild die 1-, 1,5-, 2- und 3-fache Breite des Bildschirms, in dem es auf der Website steht (siehe
 * .phone in site.css: Abschnitt „Mobil“ 260 CSS-Pixel, Einstieg 221, Kapitel 208, Vorführung 312 – dort je Bild eigene
 * `widths`), dazu 260, 520 und 780 für das Smartphone (dort sind die Bildschirme 260 px breit). So zeichnet der Browser das
 * Bild Pixel für Pixel, statt es selbst unscharf umzurechnen. Geänderte Größen hier, in site.css und in „sizes“ im HTML
 * angleichen. `crisp`: die Breiten, in denen das Bild bei 100 % Skalierung erscheint (siehe encode).
 */
const PHONE = { viewport: { width: 390, height: 844 }, scale: 3, widths: [260, 390, 520, 780], crisp: [260] };

/**
 * Breiten aus `crisp` (das Bild erscheint so groß auf der Seite, die Schrift ist dort nur wenige Pixel hoch) verlustfrei
 * und leicht nachgeschärft – bewusst größer als manche 1,5×-Datei, dafür bei 100 % Skalierung gestochen scharf. Übrige Telefonbilder verlustbehaftet mit voller Farbauflösung (smartSubsample) – bei hoher
 * Pixeldichte fallen Artefakte nicht auf –, übrige Desktop-Bilder wie bisher.
 */
function encode(png, width, shot, spec) {
  const resized = sharp(png).resize({ width, withoutEnlargement: true, kernel: "lanczos3" });
  if ((shot.crisp ?? spec.crisp ?? []).includes(width)) {
    return resized.sharpen({ sigma: 0.5 }).webp({ lossless: true, effort: 6 });
  }
  return spec === PHONE
    ? resized.webp({ quality: 90, smartSubsample: true, effort: 5 })
    : resized.webp({ quality: 82, effort: 5 });
}

/**
 * Detailbilder: Ausschnitt rechts neben der Seitenleiste, 960 × 720 CSS-Pixel (4 : 3, bei doppelter Auflösung
 * 1920 × 1440). Das Fenster ist so breit, dass neben der Seitenleiste (17 rem bei 17 px Grundschrift = 289 px) genau
 * 960 px Inhalt stehen – knapp unter 1280 px, sonst blendet die Mitgliederliste eine zusätzliche Kontaktspalte ein und
 * wird zu breit. Über 820 px Höhe gelten die normalen (nicht die gestauchten) Abstände der Anwendung. So erscheint die
 * Oberfläche auf der Website gut ein Drittel größer als bei einer Aufnahme des ganzen Fensters.
 */
const DETAIL = { width: 1249, height: 900 };
const CONTENT_CROP = { width: 960, height: 720 };

/** Ein Klick auf den ersten Link mit diesem Text; wartet, bis die neue Seite wirklich da und ruhig ist. */
const followLink = (name) => async (page) => {
  const before = new URL(page.url()).pathname;
  await page.getByRole("link", { name }).first().click();
  await page.waitForURL((url) => url.pathname !== before);
  await page.waitForLoadState("networkidle");
};

/** Klappt eine Gruppe der Seitenleiste auf (alle Gruppen sind sonst zu und die Leiste wirkt im Bild leer). */
const openNavGroup = (label) => async (page) => {
  await page.getByRole("button", { name: label, exact: true }).first().click();
  await page.waitForTimeout(300); // Aufklapp-Animation
};

/**
 * Blendet Textzeilen mit genau diesem Inhalt aus (der Platz bleibt frei, nichts verrutscht). Für die Kennzahl
 * „Helferstunden“: Sind in den letzten zwei Wochen keine Stunden dazugekommen, steht unter der Jahressumme „Noch keine
 * Stunden erfasst“ – im Bild wirkt das wie ein Widerspruch zu „9 Std.“.
 */
const hideText = (text) => async (page) => {
  await page.evaluate((wanted) => {
    for (const el of document.querySelectorAll("p, span, div")) {
      if (el.children.length === 0 && el.textContent?.trim() === wanted) el.style.setProperty("visibility", "hidden");
    }
  }, text);
};

/**
 * Scrollt so, dass die Karte mit dieser Überschrift direkt unter Kopfzeile und fester Reiterleiste beginnt
 * (statt eines festen Werts, der je nach Inhalt mitten durch eine Karte schneidet).
 */
const scrollToCard = (title) => async (page) => {
  await page.getByText(title, { exact: true }).first().waitFor();
  await page.evaluate((text) => {
    const heading = [...document.querySelectorAll("h1, h2, h3, [data-slot='card-title']")].find(
      (el) => el.textContent?.trim() === text,
    );
    const card = heading?.closest("[data-slot='card']") ?? heading;
    if (!card) throw new Error(`Karte „${text}“ nicht gefunden`);
    const header = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
    const tabs = document.querySelector("[role='tablist']")?.getBoundingClientRect().height ?? 0;
    const top = card.getBoundingClientRect().top + window.scrollY - header - tabs - 20;
    window.scrollTo(0, Math.max(0, top));
  }, title);
  await page.waitForTimeout(200);
};

/** Öffnet die zentrale Suche (Strg+K) und tippt einen Suchbegriff; wartet, bis die Treffer aus der Datenbank da sind. */
const openSearch = (query, { viaButton = false } = {}) => async (page) => {
  if (viaButton) await page.getByRole("button", { name: "Suche öffnen", exact: true }).click();
  else await page.keyboard.press("Control+k");
  const input = page.getByRole("combobox", { name: "Suchen" }).or(page.getByLabel("Suchen", { exact: true }));
  await input.first().waitFor();
  await input.first().pressSequentially(query, { delay: 60 });
  await page.waitForLoadState("networkidle");
  await page.getByRole("status").filter({ hasText: "Suche" }).waitFor({ state: "detached" }).catch(() => {});
  await page.waitForTimeout(600);
};

/**
 * Bildliste (nur, was die Website tatsächlich zeigt). `path` wird direkt geöffnet; `steps` läuft danach
 * (z. B. Klick auf eine Veranstaltung). `device`: „desktop“ (1280 × 800) oder „phone“ (390 × 844, Touch, mobiles Menü).
 * `crop`: „content“ = Ausschnitt ohne Seitenleiste (siehe DETAIL), „dialog“ = Ausschnitt um den geöffneten Dialog.
 * `media: "print"` zeigt die Seite so, wie sie gedruckt wird.
 *
 * Weitere Seiten der Anwendung, die sich für Bilder eignen: /aufgaben, /benutzer, /protokoll (Filter „Mitglieder“),
 * /nachrichten/neu, /datenschutz, /hilfe, /dashboard?tab=termine. Nicht verwenden: die Detailseite einer
 * Veranstaltung bei 1280 px Breite (der Titel wird dort von den Schaltflächen überdeckt).
 */
const shots = [
  // 880/1760: Bildschirm des Laptops in der Vorführung unter dem Einstieg (.laptop-screen, 880 CSS-Pixel breit)
  {
    name: "dashboard",
    path: "/dashboard",
    steps: async (page) => {
      await openNavGroup("Verein")(page);
      await hideText("Noch keine Stunden erfasst")(page);
    },
    widths: [880, 960, 1760, 1920],
    crisp: [880],
  },
  // Der Helferplan behält die Seitenleiste (Kapitelbild in voller Breite); höher, damit die Ampel-Zustände
  // „Voll besetzt“, „Teilweise besetzt“ und „Unbesetzt“ zu sehen sind.
  { name: "schichten", path: "/helferplanung", steps: followLink(/Sommerfest 2026/), viewport: { width: 1140, height: 1000 } },
  { name: "mitglieder", path: "/mitglieder", viewport: DETAIL, crop: "content" },
  // Der Oktober ist gefüllter als der September (Sommerfest, Trainings); der Monat steht in der Adresse.
  { name: "kalender", path: "/kalender?ansicht=monat&datum=2026-10-01", viewport: DETAIL, crop: "content" },
  // Diagramme („Auswertungen“) liegen weiter unten auf dem Reiter „Mitglieder“: Verlauf statt Donut, und ein
  // niedrigeres Fenster (720 px), damit die Seite weit genug scrollt, um mit der Karte zu beginnen.
  {
    name: "auswertung",
    path: "/dashboard?tab=mitglieder",
    steps: async (page) => {
      await page.getByText("Entwicklung", { exact: true }).first().click(); // Umschalter „Ansicht“ (SegmentedControl)
      await scrollToCard("Auswertungen")(page);
    },
    viewport: { width: DETAIL.width, height: 720 },
    crop: "content",
  },
  // Zentrale Suche: Treffer aus mehreren Gruppen (Aktionen, Seiten, Mitglieder) – nur lesen, nichts auswählen
  { name: "suche", path: "/dashboard", steps: openSearch(process.env.VF_SEARCH ?? "Hel"), crop: "dialog" },
  // Der Helferplan zum Aushängen, so wie er gedruckt wird (A4 hoch, 794 px = 210 mm bei 96 dpi). Papier ist in beiden
  // Darstellungen weiß, deshalb nur hell.
  {
    name: "helferplan-druck",
    path: "/helferplanung/drucken",
    viewport: { width: 794, height: 1123 },
    media: "print",
    widths: [640, 1280],
    schemes: ["light"],
  },
  { name: "phone-dashboard", device: "phone", path: "/dashboard" },
  {
    name: "phone-helferplanung",
    device: "phone",
    path: "/helferplanung",
    widths: [221, 260, 312, 332, 442, 468, 520, 624, 663, 780],
    crisp: [221, 260, 312],
  },
  {
    name: "phone-schichten",
    device: "phone",
    path: "/helferplanung",
    steps: followLink(/Sommerfest 2026/),
    widths: [208, 260, 312, 416, 520, 624, 780],
    crisp: [208, 260],
  },
  { name: "phone-kalender", device: "phone", path: "/kalender" },
  { name: "phone-suche", device: "phone", path: "/dashboard", steps: openSearch(process.env.VF_SEARCH ?? "Hel", { viaButton: true }) },
];

/**
 * Namen im Bild – nur im Browser ersetzt, die Datenbank bleibt unverändert:
 * - In der Entwicklungsdatenbank heißt der Demo-Administrator womöglich anders als im Seed („Luis“ statt „Anna“).
 * - Die Seed-Personen tragen ihre Rolle als Nachnamen („Hans Helfer“, „Claudia Abteilungsleiterin“). Auf der Website
 *   wirkt das wie Testdaten; sie bekommen gewöhnliche Nachnamen mit demselben Anfangsbuchstaben (Sortierung und
 *   Initialen bleiben gleich). Ersetzt wird nur zusammen mit dem Vornamen – „Helfer“ oder „Vorstand“ allein sind
 *   Begriffe der Oberfläche.
 * - Von Hand angelegte Einträge, die nicht aus dem Seed stammen, bekommen ebenso einen erfundenen Namen: Das Repository
 *   und die Website sind öffentlich, echte Namen gehören nicht ins Bild.
 */
const DEMO_RENAME = [
  [/\b(?:Luis|Anna) Admin\b/g, "Anna Adler"],
  [/\bAdmin, (?:Luis|Anna)\b/g, "Adler, Anna"],
  [/\bLuis\b/g, "Anna"],
  [/\bClaudia Abteilungsleiterin\b/g, "Claudia Abel"],
  [/\bAbteilungsleiterin, Claudia\b/g, "Abel, Claudia"],
  [/\bBernd Vorstand\b/g, "Bernd Vogt"],
  [/\bVorstand, Bernd\b/g, "Vogt, Bernd"],
  [/\bHans Helfer\b/g, "Hans Hellwig"],
  [/\bHelfer, Hans\b/g, "Hellwig, Hans"],
  [/\bMaria Mitglied\b/g, "Maria Mertens"],
  [/\bMitglied, Maria\b/g, "Mertens, Maria"],
  [/\bMichael Mehrfach\b/g, "Michael Meier"],
  [/\bMehrfach, Michael\b/g, "Meier, Michael"],
  [/\bBleckert\b/g, "Brandt"],
  // Anmeldeadressen der Seed-Konten (…@demo-verein.local) wirken im Bild technisch
  [/\badmin@demo-verein\.local\b/g, "anna.adler@example.org"],
  [/\bvorstand@demo-verein\.local\b/g, "bernd.vogt@example.org"],
  [/\babteilung@demo-verein\.local\b/g, "claudia.abel@example.org"],
  [/\bhelfer@demo-verein\.local\b/g, "hans.hellwig@example.org"],
  [/\bmitglied@demo-verein\.local\b/g, "maria.mertens@example.org"],
  [/\bmehrfach@demo-verein\.local\b/g, "michael.meier@example.org"],
  [/@demo-verein\.local\b/g, "@example.org"],
];
async function normalizeDemoNames(page) {
  await page.evaluate((rules) => {
    // React setzt „{Nachname}, {Vorname}“ aus mehreren Textknoten zusammen, beim Rendern auf dem Server getrennt durch
    // leere Kommentare (<!-- -->). Ohne die Kommentare lassen sich die Knoten zusammenfassen, dann greifen die Regeln.
    const comments = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
    const markers = [];
    for (let node = comments.nextNode(); node; node = comments.nextNode()) markers.push(node);
    for (const node of markers) node.remove();
    document.body.normalize();
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

/** Bildausschnitt in Fensterkoordinaten (Playwright `clip`) – oder undefined für das ganze Fenster. */
async function cropArea(page, crop) {
  if (crop === "content") {
    const x = await page.evaluate(() => Math.ceil(document.querySelector("aside")?.getBoundingClientRect().right ?? 0));
    return { x, y: 0, ...CONTENT_CROP };
  }
  if (crop === "dialog") {
    const box = await page.getByRole("dialog").first().boundingBox();
    if (!box) throw new Error("Kein geöffneter Dialog");
    const viewport = page.viewportSize();
    const { width, height } = CONTENT_CROP;
    const x = Math.round(Math.min(Math.max(0, box.x + box.width / 2 - width / 2), viewport.width - width));
    const y = Math.round(Math.min(Math.max(0, box.y - 56), viewport.height - height));
    return { x, y, width, height };
  }
  return undefined;
}

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
        const list = selected.filter(
          (s) => (s.device ?? "desktop") === device && (!s.schemes || s.schemes.includes(scheme)),
        );
        if (!list.length) continue;
        const { context, page, spec } = await newSession(browser, scheme, device);
        for (const shot of list) {
          try {
            await page.setViewportSize(shot.viewport ?? spec.viewport);
            await page.emulateMedia({ media: shot.media ?? "screen" });
            await page.goto(shot.path, { waitUntil: "networkidle" });
            await shot.steps?.(page);
            await page.addStyleTag({ content: HIDE_DEV_UI }); // nach den Schritten: ein Link-Klick lädt eine neue Seite
            await page.evaluate(() => document.fonts.ready);
            await normalizeDemoNames(page);
            await page.mouse.move(0, 0); // kein Hover-Zustand im Bild
            await page.waitForTimeout(500); // Übergänge und Diagramm-Animationen abwarten
            const clip = await cropArea(page, shot.crop);
            const png = await page.screenshot({ type: "png", clip });
            for (const width of shot.widths ?? spec.widths) {
              const file = path.join(out, `${shot.name}-${scheme}-${width}.webp`);
              await encode(png, width, shot, spec).toFile(file);
            }
            const { width, height } = await sharp(png).metadata();
            console.log(`${scheme.padEnd(5)} ${shot.name}  ${width}×${height}  (${page.url().replace(BASE, "")})`);
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
