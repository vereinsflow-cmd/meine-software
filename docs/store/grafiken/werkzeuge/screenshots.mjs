/**
 * Erzeugt die Telefon-Screenshots für den Google-Play-Eintrag (PNG, genau 1080 × 1920, ohne Alpha-Kanal) aus einer laufenden
 * VereinsFlow-Demo (Seed-Daten). Ergebnis: docs/store/grafiken/screenshots/01-….png bis 08-….png
 *
 *   node docs/store/grafiken/werkzeuge/screenshots.mjs chat      einmalig: legt eine kleine Demo-Unterhaltung im Chat „Alle Mitglieder“ an
 *   node docs/store/grafiken/werkzeuge/screenshots.mjs           alle Screenshots
 *   node docs/store/grafiken/werkzeuge/screenshots.mjs --only 02,04   nur einzelne (Nummern oder Namen)
 *
 * Voraussetzungen: Die Demo läuft (Standard http://localhost:3000, sonst VF_APP_URL) – am besten als Produktions-Build, damit
 * keine Entwickler-Einblendungen im Bild sind (Ablauf: docs/store/README.md, Abschnitt „Screenshots neu erzeugen“). Das Passwort
 * der Demo-Benutzer kommt aus SEED_PASSWORD in der .env (oder VF_DEMO_PASSWORD); es wird nie ausgegeben.
 *
 * So entstehen die Bilder: Ein Handy-Fenster mit 360 × 640 CSS-Pixeln bei dreifacher Pixeldichte ergibt genau 1080 × 1920 Pixel
 * (9 : 16, die Vorgabe von Google Play). Namen der Seed-Personen werden nur im Browser durch gewöhnliche Namen ersetzt (die
 * Datenbank bleibt unverändert) – wie bei den Bildern der Website (website/tools/capture-screenshots.mjs).
 */
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../../..");
const outDir = path.resolve(here, "../screenshots");
const require = createRequire(path.join(root, "package.json"));
require("dotenv").config({ path: path.join(root, ".env"), quiet: true });
const { chromium } = require("@playwright/test");
const sharp = require("sharp");

const BASE = (process.env.VF_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const PASSWORD = process.env.VF_DEMO_PASSWORD ?? process.env.SEED_PASSWORD;
if (!PASSWORD)
  throw new Error("Kein Demo-Passwort: SEED_PASSWORD in der .env oder VF_DEMO_PASSWORD setzen.");

const USERS = {
  admin: "admin@demo-verein.local",
  vorstand: "vorstand@demo-verein.local",
  abteilung: "abteilung@demo-verein.local",
  helfer: "helfer@demo-verein.local",
  mitglied: "mitglied@demo-verein.local",
  mehrfach: "mehrfach@demo-verein.local",
};

/** Handy-Fenster: 360 × 640 CSS-Pixel × Pixeldichte 3 = 1080 × 1920 Pixel. */
const VIEWPORT = { width: 360, height: 640 };
const SCALE = 3;
const TARGET = { width: VIEWPORT.width * SCALE, height: VIEWPORT.height * SCALE };

/** Abstand zwischen den Chat-Nachrichten der Demo-Unterhaltung (Sekunden) – damit die Uhrzeiten in den Blasen verschieden sind. */
const CHAT_GAP_SECONDS = 61;

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1]?.split(",") : undefined;

/**
 * Namen im Bild – nur im Browser ersetzt: Die Seed-Personen tragen ihre Rolle als Nachnamen („Hans Helfer“), das wirkt im Store
 * wie Testdaten. Sie bekommen gewöhnliche Nachnamen mit demselben Anfangsbuchstaben (Initialen und Sortierung bleiben gleich).
 */
const DEMO_RENAME = [
  [/\bAnna Admin\b/g, "Anna Adler"],
  [/\bAdmin, Anna\b/g, "Adler, Anna"],
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
  [/\badmin@demo-verein\.local\b/g, "anna.adler@example.org"],
  [/\bvorstand@demo-verein\.local\b/g, "bernd.vogt@example.org"],
  [/\babteilung@demo-verein\.local\b/g, "claudia.abel@example.org"],
  [/\bhelfer@demo-verein\.local\b/g, "hans.hellwig@example.org"],
  [/\bmitglied@demo-verein\.local\b/g, "maria.mertens@example.org"],
  [/\bmehrfach@demo-verein\.local\b/g, "michael.meier@example.org"],
  [/@demo-verein\.local\b/g, "@example.org"],
];

/** Übrig gebliebene Seed-Namen (Regeln oben greifen nicht) – das Ergebnis wäre öffentlich sichtbar. */
const SEED_LEFTOVERS =
  /Anna Admin|Bernd Vorstand|Hans Helfer|Claudia Abteilungsleiterin|Maria Mitglied|Michael Mehrfach|\.local\b/;

/** Entwickler-Einblendungen von Next.js (nur im Entwicklungsmodus vorhanden) gehören nicht ins Bild. */
const HIDE_DEV_UI =
  "nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button] { display: none !important; }";

async function openSession(browser, email) {
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    isMobile: true,
    hasTouch: true,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    colorScheme: "light",
  });
  context.setDefaultTimeout(45_000);
  const page = await context.newPage();
  await page.goto("/anmelden", { waitUntil: "networkidle" });
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort").fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/anmelden"));
  await page.waitForLoadState("networkidle");
  return { context, page };
}

/** Wartet, bis Schriften geladen und alle endlichen Animationen und Übergänge zu Ende sind (Endlosschleifen zählen nicht). */
async function settle(page) {
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .every(
            (animation) =>
              animation.playState !== "running" ||
              animation.effect?.getComputedTiming().iterations === Infinity,
          ),
      undefined,
      { timeout: 10_000 },
    )
    .catch(() => {});
  await page.waitForTimeout(700);
}

/**
 * Ersetzt die Seed-Namen im Text der Seite (nur im Browser). React setzt „Nachname, Vorname“ aus mehreren Textknoten zusammen,
 * beim Rendern auf dem Server durch leere Kommentare getrennt – ohne die Kommentare lassen sich die Knoten zusammenfassen.
 * Danach nichts mehr anklicken: React kennt die entfernten Knoten nicht mehr.
 */
async function renameDemoNames(page) {
  await page.evaluate(
    (rules) => {
      const comments = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
      const markers = [];
      for (let node = comments.nextNode(); node; node = comments.nextNode()) markers.push(node);
      for (const node of markers) node.remove();
      document.body.normalize();
      const texts = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = texts.nextNode(); node; node = texts.nextNode()) {
        let text = node.nodeValue ?? "";
        for (const [source, flags, replacement] of rules) {
          text = text.replace(new RegExp(source, flags), replacement);
        }
        if (text !== node.nodeValue) node.nodeValue = text;
      }
    },
    DEMO_RENAME.map(([pattern, replacement]) => [pattern.source, pattern.flags, replacement]),
  );
}

/**
 * Scrollt so, dass die Karte mit dieser Überschrift (oder das Element mit diesem Text) direkt unter den festen Leisten beginnt.
 * `text`: genauer Text oder ein regulärer Ausdruck (z. B. /^Offen\s*\d+$/, nur Muster, keine Flags).
 */
async function scrollToText(page, text, { gap = 12 } = {}) {
  await page.evaluate(
    ([wanted, space]) => {
      const pattern = wanted.startsWith("/")
        ? new RegExp(wanted.slice(1, wanted.lastIndexOf("/")))
        : null;
      const matches = (el) => {
        const own = el.textContent?.trim() ?? "";
        return pattern ? pattern.test(own) : own === wanted;
      };
      const candidates = [
        ...document.querySelectorAll("h1, h2, h3, [data-slot='card-title'], a, button, span, p"),
      ];
      const heading = candidates.find(matches);
      if (!heading) throw new Error(`Text „${wanted}“ nicht gefunden`);
      const target = heading.closest("[data-slot='card']") ?? heading;
      const header = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
      // Feste Reiterleiste (Dashboard): der nächste Vorfahre der Reiter mit position: sticky
      let bar = document.querySelector("[role='tablist']");
      while (bar && getComputedStyle(bar).position !== "sticky") bar = bar.parentElement;
      const sticky = bar?.getBoundingClientRect().height ?? 0;
      window.scrollTo(
        0,
        Math.max(0, target.getBoundingClientRect().top + window.scrollY - header - sticky - space),
      );
    },
    [text instanceof RegExp ? text.toString() : text, gap],
  );
  await page.waitForTimeout(300);
}

/**
 * Macht die festen, leicht durchscheinenden Leisten (Kopfzeile, Dashboard-Reiter) undurchsichtig: Im Betrieb scheint der
 * Inhalt darunter verwaschen durch – auf einem Werbebild wirkt das wie ein Fleck. Farbe und Aussehen sonst unverändert.
 */
async function opaqueStickyBars(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("*")) {
      const style = getComputedStyle(el);
      if (style.position !== "sticky" && style.position !== "fixed") continue;
      if (el.getBoundingClientRect().top > 200) continue;
      const opaque = style.backgroundColor
        .replace(/\s*\/\s*[\d.]+%?\s*\)$/, ")")
        .replace(/^rgba\(([^)]+),\s*[\d.]+\)$/, "rgb($1)");
      el.style.setProperty("background-color", opaque, "important");
      el.style.setProperty("backdrop-filter", "none", "important");
      el.style.setProperty("-webkit-backdrop-filter", "none", "important");
    }
  });
}

/** Speichert die Ansicht als PNG in genau 1080 × 1920 Pixeln ohne Alpha-Kanal (Vorgabe von Google Play: 24-Bit-PNG). */
async function save(page, file) {
  await page.addStyleTag({ content: HIDE_DEV_UI });
  await opaqueStickyBars(page);
  await settle(page);
  const leftovers = await page.evaluate(
    (source) => new RegExp(source).exec(document.body.innerText)?.[0],
    SEED_LEFTOVERS.source,
  );
  if (leftovers) {
    console.error(`WARNUNG ${file}: Seed-Name im Bild: ${leftovers}`);
    process.exitCode = 1;
  }
  const png = await page.screenshot({ type: "png" });
  const meta = await sharp(png).metadata();
  if (meta.width !== TARGET.width || meta.height !== TARGET.height) {
    throw new Error(`${file}: ${meta.width}×${meta.height} statt ${TARGET.width}×${TARGET.height}`);
  }
  await sharp(png).removeAlpha().png({ compressionLevel: 9 }).toFile(path.join(outDir, file));
  console.log(`${file}  ${TARGET.width}×${TARGET.height}`);
}

/** Klickt auf einen Link und wartet, bis die neue Seite da und ruhig ist. */
async function followLink(page, name) {
  const before = new URL(page.url()).pathname;
  await page.getByRole("link", { name }).first().click();
  await page.waitForURL((url) => url.pathname !== before);
  await page.waitForLoadState("networkidle");
}

/** Reihenfolge = Reihenfolge im Store. `user`: Demo-Benutzer, `prepare`: Seite öffnen und Ausschnitt wählen. */
const SHOTS = [
  {
    file: "01-dashboard.png",
    user: "helfer",
    async prepare(page) {
      await page.goto("/dashboard?tab=termine", { waitUntil: "networkidle" });
      await renameDemoNames(page);
      await scrollToText(page, "Anstehend", { gap: 14 });
    },
  },
  {
    file: "02-helferplan.png",
    user: "helfer",
    async prepare(page) {
      await page.goto("/helferplanung", { waitUntil: "networkidle" });
      await followLink(page, /Sommerfest 2026/);
      await renameDemoNames(page);
      await page.evaluate(() => window.scrollTo(0, 0));
    },
  },
  {
    file: "03-kalender.png",
    user: "admin",
    async prepare(page) {
      await page.goto("/kalender?ansicht=monat&datum=2026-10-01", { waitUntil: "networkidle" });
      await renameDemoNames(page);
      await scrollToText(page, "Heute", { gap: 22 });
    },
  },
  {
    file: "04-nachrichten.png",
    user: "helfer",
    async prepare(page) {
      await page.goto("/nachrichten?chat=alle", { waitUntil: "networkidle" });
      await renameDemoNames(page);
      // Der Verlauf scrollt in seinem Rahmen: ans Ende, wie es ein Nutzer beim Öffnen sieht
      await page.evaluate(() => {
        for (const el of document.querySelectorAll("*")) {
          if (
            el.scrollHeight > el.clientHeight + 8 &&
            ["auto", "scroll"].includes(getComputedStyle(el).overflowY)
          ) {
            el.scrollTop = el.scrollHeight;
          }
        }
      });
    },
  },
  {
    file: "05-mitglieder.png",
    user: "admin",
    async prepare(page) {
      await page.goto("/mitglieder", { waitUntil: "networkidle" });
      await renameDemoNames(page);
      await page.evaluate(() => {
        const search = document.querySelector(
          "input[type='search'], input[name='q'], input[placeholder*='Name']",
        );
        const header = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
        if (search)
          window.scrollTo(0, search.getBoundingClientRect().top + window.scrollY - header - 16);
      });
    },
  },
  {
    file: "06-aufgaben.png",
    user: "admin",
    async prepare(page) {
      await page.goto("/aufgaben", { waitUntil: "networkidle" });
      await renameDemoNames(page);
      await scrollToText(page, /^Offen\s*\d+$/, { gap: 16 });
    },
  },
  {
    file: "07-offene-schichten.png",
    user: "helfer",
    async prepare(page) {
      await page.goto("/helferplanung", { waitUntil: "networkidle" });
      await renameDemoNames(page);
      await scrollToText(page, "Offene Schichten", { gap: 16 });
    },
  },
  {
    file: "08-datenschutz.png",
    user: "helfer",
    async prepare(page) {
      await page.goto("/datenschutz", { waitUntil: "networkidle" });
      await renameDemoNames(page);
      await scrollToText(page, "Meine Daten herunterladen", { gap: 16 });
    },
  },
];

/**
 * Demo-Unterhaltung im Chat „Alle Mitglieder“ – geschrieben über die Oberfläche, von verschiedenen Demo-Benutzern, jeweils mit
 * einer Minute Abstand. Zum Schluss öffnen alle den Chat, damit die Nachrichten als gelesen gelten (Häkchen bei eigenen Blasen).
 */
const CHAT = [
  {
    user: "vorstand",
    announce: true,
    text: "Sommerfest am 10.10. – Helfer gesucht\nFür Aufbau, Getränkestand und Grillstand brauchen wir noch Verstärkung. Bitte tragt euch in der Helferplanung ein.",
  },
  { user: "helfer", text: "Bin beim Aufbau dabei – ab 9 Uhr am Vereinsheim." },
  { user: "mitglied", text: "Ich backe zwei Kuchen fürs Buffet." },
  { user: "abteilung", text: "Die Fußballjugend übernimmt die Hüpfburg-Aufsicht." },
  {
    user: "admin",
    text: "Danke euch, das hilft enorm! Die Schichten stehen in der Helferplanung.",
  },
];

async function seedChat(browser) {
  for (const [index, message] of CHAT.entries()) {
    if (index > 0) await new Promise((resolve) => setTimeout(resolve, CHAT_GAP_SECONDS * 1000));
    const { context, page } = await openSession(browser, USERS[message.user]);
    await page.goto("/nachrichten?chat=alle", { waitUntil: "networkidle" });
    await page.getByRole("textbox", { name: "Nachricht an Alle Mitglieder" }).fill(message.text);
    if (message.announce) await page.getByRole("checkbox", { name: "Als Ankündigung" }).check();
    await page.getByRole("button", { name: "Senden" }).click();
    await page
      .getByRole("alertdialog", { name: "Nachricht senden?" })
      .getByRole("button", { name: "Senden" })
      .click();
    await page.getByText(/Nachricht an \d+ Personen gesendet\./).waitFor();
    console.log(`Nachricht ${index + 1} von ${CHAT.length} gesendet (${message.user})`);
    await context.close();
  }
  for (const email of Object.values(USERS)) {
    const { context, page } = await openSession(browser, email);
    await page.goto("/nachrichten?chat=alle", { waitUntil: "networkidle" });
    await context.close();
  }
}

const browser = await chromium.launch();
try {
  if (args[0] === "chat") {
    await seedChat(browser);
  } else {
    await fs.mkdir(outDir, { recursive: true });
    const wanted = SHOTS.filter(({ file }) => !only || only.some((key) => file.includes(key)));
    if (wanted.length === 0) throw new Error(`Kein Screenshot passt zu: ${only?.join(", ")}`);
    for (const user of new Set(wanted.map((shot) => shot.user))) {
      const { context, page } = await openSession(browser, USERS[user]);
      for (const shot of wanted.filter((entry) => entry.user === user)) {
        try {
          await shot.prepare(page);
          await save(page, shot.file);
        } catch (error) {
          console.error(`FEHLER ${shot.file}: ${String(error.message).split("\n")[0]}`);
          process.exitCode = 1;
        }
      }
      await context.close();
    }
  }
} finally {
  await browser.close();
}
