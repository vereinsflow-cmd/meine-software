// Nimmt die App-Bilder für das Werbevideo auf – aus einer laufenden Demo mit EIGENER Datenbank (siehe README).
//
//   node werbevideo/werkzeuge/aufnehmen.mjs                 alle Bilder
//   node werbevideo/werkzeuge/aufnehmen.mjs --only a,b      nur diese (Namen siehe SHOTS)
//
// Ergebnis: werbevideo/szenen/app/<name>.png (Rechner 1280 × 800 bei doppelter, Telefon 390 × 844 bei dreifacher
// Pixeldichte) und werbevideo/szenen/app/lage.json mit der Lage der Karten und Zahlen in CSS-Pixeln – daraus baut die
// Szene ihre Bewegungen (Karten ploppen auf, Zahlen zählen hoch).
//
// ACHTUNG: Das Skript ändert Daten (legt ein Mitglied an, richtet Kassenbuch und Beitragsarten ein, erstellt einen
// Beitragslauf, markiert Rechnungen als bezahlt, trägt Anna in eine Schicht ein). Deshalb nur gegen eine Kopie der
// Demo-Datenbank laufen lassen (vf_video), nie gegen die eigene Entwicklungsdatenbank.
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const OUT = path.resolve(here, "..", "szenen", "app");
const require = createRequire(path.join(root, "package.json"));
const { chromium } = require("playwright");

const BASE = (process.env.VF_APP_URL ?? "http://localhost:3200").replace(/\/$/, "");
const EMAIL = process.env.VF_DEMO_EMAIL ?? "admin@demo-verein.local";
const PASSWORD = process.env.VF_DEMO_PASSWORD ?? "Vereinsflow-Demo-2026!";
const SOMMERFEST = "Sommerfest 2027";
// Das Mitglied, das die Szene „Mitglieder“ anlegt (erfunden; das Repository ist öffentlich)
const NEW_MEMBER = { first: "Mia", last: "Schröder", email: "mia.schroeder@example.org" };
const ARCHIVE_AFTER = ["Mia Schröder", "Lena Schröder"];
const FEST_MONTH = "2027-06-09";

const args = process.argv.slice(2);
const onlyIndex = args.indexOf("--only");
const only = onlyIndex >= 0 ? args[onlyIndex + 1].split(",") : null;
const wanted = (name) => !only || only.includes(name);
// --dunkel: Bilder für den dunklen Kurzspot (szenen/nacht.html) – App im Dunkelmodus
const DUNKEL = args.includes("--dunkel");

// Seed-Namen tragen ihre Rolle als Nachnamen – im Bild gewöhnliche Namen (wie website/tools/capture-screenshots.mjs).
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
  [/\badmin@demo-verein\.local\b/g, "anna.adler@example.org"],
  [/\bvorstand@demo-verein\.local\b/g, "bernd.vogt@example.org"],
  [/\babteilung@demo-verein\.local\b/g, "claudia.abel@example.org"],
  [/\bhelfer@demo-verein\.local\b/g, "hans.hellwig@example.org"],
  [/\bmitglied@demo-verein\.local\b/g, "maria.mertens@example.org"],
  [/@demo-verein\.local\b/g, "@example.org"],
  // Das Video zeigt den Tag, nicht den Abend der Aufnahme
  [/\bGuten (?:Morgen|Abend)\b/g, "Guten Tag"],
];

const HIDE_DEV_UI =
  "nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button] { display: none !important; } * { caret-color: transparent !important; }";

const lage = await fs.readFile(path.join(OUT, "lage.json"), "utf8").then(JSON.parse).catch(() => ({}));

async function normalize(page, { gentle = false } = {}) {
  await page.evaluate(
    ([rules, gentle]) => {
      if (!gentle) {
        const comments = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
        const marks = [];
        for (let n = comments.nextNode(); n; n = comments.nextNode()) marks.push(n);
        for (const n of marks) n.remove();
        document.body.normalize();
      }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        let text = node.nodeValue ?? "";
        for (const [source, flags, replacement] of rules) text = text.replace(new RegExp(source, flags), replacement);
        if (text !== node.nodeValue) node.nodeValue = text;
      }
      for (const el of document.querySelectorAll("span, div")) {
        if (el.children.length === 0 && el.textContent?.trim() === "LA") el.textContent = "AA";
      }
    },
    [DEMO_RENAME.map(([re, rep]) => [re.source, re.flags, rep]), gentle],
  );
}

/** Karten (gerundete Flächen) im sichtbaren Bereich mit Text und Lage – die Szene sucht sich daraus, was sie braucht. */
async function cards(page) {
  return page.evaluate(() => {
    const out = [];
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 24 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) continue;
      const radius = parseFloat(cs.borderTopLeftRadius) || 0;
      const bg = cs.backgroundColor;
      const filled = (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") || cs.backgroundImage !== "none";
      const lined = cs.boxShadow !== "none" || (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== "none");
      if (radius < 6 || !(filled || lined)) continue;
      const text = (el.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 90);
      out.push({ text, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(radius), tag: el.tagName.toLowerCase() });
    }
    return out;
  });
}

/** Blätter (Elemente ohne Kinder) mit genau diesem Text: Lage und Schrift – für hochzählende Zahlen. */
async function textBoxes(page, texts) {
  return page.evaluate((texts) => {
    const out = {};
    for (const el of document.body.querySelectorAll("*")) {
      if (el.children.length) continue;
      const t = (el.textContent ?? "").trim();
      if (!texts.includes(t)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > innerHeight) continue;
      const cs = getComputedStyle(el);
      (out[t] ??= []).push({
        x: r.x, y: r.y, w: r.width, h: r.height,
        font: { size: cs.fontSize, weight: cs.fontWeight, family: cs.fontFamily, color: cs.color, spacing: cs.letterSpacing, line: cs.lineHeight, features: cs.fontFeatureSettings, numeric: cs.fontVariantNumeric },
      });
    }
    return out;
  }, texts);
}

/** Versteckt Elemente: Text einer Karte (die kleinste gerundete Fläche, die ihn enthält) bzw. nur die Zahl. */
async function hide(page, { cardsWith = [], textsExact = [] }) {
  await page.evaluate(
    ([cardsWith, textsExact]) => {
      const rounded = (el) => {
        const cs = getComputedStyle(el);
        const bg = cs.backgroundColor;
        const filled = (bg && bg !== "rgba(0, 0, 0, 0)") || cs.backgroundImage !== "none" || cs.boxShadow !== "none";
        return (parseFloat(cs.borderTopLeftRadius) || 0) >= 10 && filled;
      };
      for (const needle of cardsWith) {
        let best = null;
        for (const el of document.body.querySelectorAll("*")) {
          if (!rounded(el)) continue;
          if (!(el.innerText ?? "").includes(needle)) continue;
          const r = el.getBoundingClientRect();
          if (!best || r.width * r.height < best.area) best = { el, area: r.width * r.height };
        }
        if (best) best.el.style.setProperty("visibility", "hidden", "important");
      }
      for (const el of document.body.querySelectorAll("*")) {
        if (el.children.length) continue;
        if (textsExact.includes((el.textContent ?? "").trim())) el.style.setProperty("color", "transparent", "important");
      }
    },
    [cardsWith, textsExact],
  );
}

async function settle(page, ms = 600) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
}

async function shot(page, name, extra = {}, { fullPage = false } = {}) {
  await page.addStyleTag({ content: HIDE_DEV_UI });
  await page.waitForTimeout(150);
  const file = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: file, fullPage });
  lage[name] = { ...(lage[name] ?? {}), viewport: page.viewportSize(), cards: await cards(page), ...extra };
  console.log("✔", name);
}

async function session(browser, phone = false) {
  const context = await browser.newContext({
    baseURL: BASE,
    viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 },
    deviceScaleFactor: phone ? 3 : 2,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    reducedMotion: "reduce",
    colorScheme: DUNKEL ? "dark" : "light",
    ...(phone ? { isMobile: true, hasTouch: true } : {}),
  });
  context.setDefaultTimeout(120_000);
  const page = await context.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vf:sidebar-breit", "0");
    } catch {}
  });
  await page.goto("/anmelden", { waitUntil: "networkidle" });
  await page.waitForFunction(() => {
    const f = document.querySelector("form");
    return f !== null && Object.keys(f).some((k) => k.startsWith("__react"));
  });
  await page.getByLabel("E-Mail-Adresse").fill(EMAIL);
  await page.getByLabel("Passwort").fill(PASSWORD);
  await page.getByRole("button", { name: "Anmelden" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/anmelden"));
  await settle(page);
  return { context, page };
}

async function hydrated(page) {
  await page.waitForFunction(() => {
    const f = document.querySelector("main form");
    return f !== null && Object.keys(f).some((k) => k.startsWith("__react"));
  });
}

async function go(page, url) {
  await page.goto(url, { waitUntil: "networkidle" });
  await settle(page);
}

async function sommerfestId(page) {
  await go(page, "/helferplanung");
  const href = await page.getByRole("link", { name: `Helferplan ${SOMMERFEST}` }).first().getAttribute("href");
  return href.split("/").pop().split("?")[0];
}

// ---------------------------------------------------------------------------------------------------------------
// Rechner
// ---------------------------------------------------------------------------------------------------------------
async function desktop(browser) {
  const { context, page } = await session(browser);

  if (wanted("dashboard")) {
    await go(page, "/dashboard");
    await normalize(page);
    const numbers = await textBoxes(page, ["233", "17", "18", "15", "5"]);
    await shot(page, "dashboard", { numbers });
    await hide(page, { textsExact: ["233"] });
    await shot(page, "dashboard-ohne-zahl");
  }

  if (wanted("mitglieder")) {
    await go(page, "/mitglieder");
    await normalize(page);
    await shot(page, "mitglieder");
  }

  if (wanted("mitglied-neu")) {
    await go(page, `/mitglieder?q=${encodeURIComponent(NEW_MEMBER.last)}`);
    const exists = await page.getByText(`${NEW_MEMBER.first} ${NEW_MEMBER.last}`).first().isVisible().catch(() => false);
    await go(page, "/mitglieder/neu");
    await hydrated(page);
    await normalize(page, { gentle: true });
    await shot(page, "mitglied-neu-leer", {
      fields: await page.evaluate(() => {
        const out = {};
        for (const label of ["Vorname", "Nachname", "Geburtsdatum", "Funktion im Verein"]) {
          const l = [...document.querySelectorAll("label")].find((x) => x.textContent.replace("*", "").trim() === label);
          const input = l && document.getElementById(l.htmlFor);
          if (input) {
            const r = input.getBoundingClientRect();
            out[label] = { x: r.x, y: r.y, w: r.width, h: r.height };
          }
        }
        return out;
      }),
    });
    await page.getByLabel("Vorname").fill(NEW_MEMBER.first);
    await page.getByLabel("Nachname").fill(NEW_MEMBER.last);
    await page.getByLabel("Geburtsdatum").fill("1998-03-14");
    await page.getByLabel("Funktion im Verein").fill("Spielerin");
    await page.locator("main").click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.waitForTimeout(300);
    await shot(page, "mitglied-neu-voll");
    if (!exists) {
      // Pflichtfelder weiter unten (nicht im Bild)
      await page.getByLabel("Handball", { exact: true }).check();
      await page.getByLabel("E-Mail-Adresse").fill(NEW_MEMBER.email);
      await page.getByLabel("Telefon").fill("0151 23456789");
      await page.getByLabel("Straße und Hausnummer").fill("Lindenweg 4");
      await page.getByLabel("PLZ").fill("12345");
      await page.getByLabel(/^Ort\b/).first().fill("Musterstadt");
      await page.getByRole("button", { name: "Mitglied anlegen" }).click();
      await page.waitForURL((u) => !u.pathname.endsWith("/neu"), { timeout: 60_000 });
      await page.waitForLoadState("networkidle");
      await page.locator("[data-sonner-toast]").first().waitFor({ timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(500);
      await normalize(page, { gentle: true });
      await shot(page, "mitglied-gespeichert");
    }
    // Wieder archivieren: Die Mitgliederzahl soll überall 233 bleiben wie auf der Website.
    for (const name of ARCHIVE_AFTER) {
      await go(page, `/mitglieder?q=${encodeURIComponent(name)}`);
      const entry = page.getByRole("link", { name: new RegExp(name) }).first();
      if (!(await entry.isVisible().catch(() => false))) continue;
      await entry.click();
      await page.waitForTimeout(1500);
      const archive = page.getByRole("button", { name: "Archivieren", exact: true }).first();
      if (!(await archive.isVisible().catch(() => false))) continue;
      await archive.click();
      const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
      await dialog.getByRole("button", { name: /Archivieren/ }).last().click();
      await page.waitForTimeout(2000);
      console.log("  archiviert:", name);
    }
  }

  if (wanted("finanzen")) {
    // Kassenbuch einrichten (wie ensureLedger in tests/e2e/helpers.ts)
    await go(page, "/finanzen/kassenbuch");
    const setup = page.getByRole("button", { name: "Kassenbuch einrichten" });
    if (await setup.isVisible().catch(() => false)) {
      await hydrated(page);
      await page.getByLabel("Kassenbuch beginnt am").fill("2026-01-01");
      await page.getByLabel("Bank").fill("Sparkasse Musterstadt");
      await page.getByLabel("Anfangsbestand in €").first().fill("11.200,00");
      await page.getByLabel("Anfangsbestand in €").nth(1).fill("239,80");
      await setup.click();
      await page.getByRole("button", { name: "Neue Buchung" }).waitFor({ timeout: 60_000 });
      console.log("  Kassenbuch eingerichtet");
    }
    // Beitragsarten wie im heutigen Seed (Erwachsene 12 €, Jugend 6 €, Passiv 4 € im Monat)
    await go(page, "/finanzen/beitraege/arten");
    if (await page.getByText("Noch keine Beitragsarten").isVisible().catch(() => false)) {
      for (const [name, amount, maxAge] of [["Jugend bis 17 Jahre", "6,00", "17"], ["Erwachsene", "12,00", ""], ["Passiv", "4,00", ""]]) {
        await page.getByRole("button", { name: "Beitragsart anlegen" }).first().click();
        const dialog = page.getByRole("dialog");
        await dialog.getByLabel("Name").fill(name);
        if (maxAge) await dialog.getByLabel("Alter bis").fill(maxAge);
        await dialog.getByLabel("Betrag in €").fill(amount);
        const from = dialog.getByLabel("Gilt ab");
        if (!(await from.inputValue())) await from.fill("2026-01-01");
        await dialog.getByRole("button", { name: "Beitragsart anlegen" }).click();
        await dialog.waitFor({ state: "hidden", timeout: 30_000 });
        await page.waitForTimeout(400);
        console.log("  Beitragsart", name);
      }
    }
    await go(page, "/finanzen/beitraege/lauf");
    await normalize(page, { gentle: true });
    const toPreview = page.getByRole("link", { name: "Weiter zur Vorschau" });
    if (await toPreview.isVisible().catch(() => false)) {
      await toPreview.click();
      await page.getByRole("heading", { name: /^Vorschau: \d+ Beiträge?$/ }).waitFor({ timeout: 60_000 });
      await settle(page);
      await normalize(page, { gentle: true });
      const create = page.getByRole("button", { name: /^\d+ Beiträge? erstellen$/ });
      const label = (await create.textContent()).trim();
      await shot(page, "beitragslauf-vorschau", { button: await create.boundingBox(), label });
      await create.click();
      await page.getByRole("alertdialog").getByRole("button", { name: label }).click();
      await page.waitForURL(/\/finanzen\/beitraege\/laeufe\//, { timeout: 60_000 });
      await page.locator("[data-sonner-toast]").first().waitFor({ timeout: 10_000 }).catch(() => {});
      await page.waitForTimeout(700);
      await normalize(page, { gentle: true });
      await shot(page, "beitragslauf-fertig");
    }
    await go(page, "/finanzen/rechnungen");
    await normalize(page, { gentle: true });
    await shot(page, "rechnungen-offen");
    for (let i = 0; i < 4; i++) {
      const paid = page.getByRole("button", { name: /als bezahlt markieren$/ }).first();
      if (!(await paid.isVisible().catch(() => false))) break;
      await paid.click();
      await page.waitForTimeout(1500);
      const confirm = page.getByRole("alertdialog").getByRole("button", { name: /bezahlt/i });
      if (await confirm.isVisible().catch(() => false)) await confirm.click();
      await page.waitForTimeout(1500);
    }
    await settle(page, 1200);
    await normalize(page, { gentle: true });
    await shot(page, "rechnungen-bezahlt");
  }

  if (wanted("kalender")) {
    await go(page, `/kalender?ansicht=monat&datum=${FEST_MONTH}`);
    await normalize(page);
    await shot(page, "kalender");
    await page.evaluate(() => {
      for (const a of document.querySelectorAll("main a[href^='/veranstaltungen/'], main a[href^='/helferplanung/']")) {
        if (a.closest("table, [role='grid'], [data-calendar], .grid")) a.style.setProperty("visibility", "hidden", "important");
      }
    });
    await shot(page, "kalender-leer");
  }

  if (wanted("sommerfest")) {
    const id = await sommerfestId(page);
    await go(page, `/veranstaltungen/${id}`);
    await normalize(page);
    const numbers = await textBoxes(page, ["12", "10"]);
    await shot(page, "sommerfest", { numbers });
    await hide(page, { textsExact: ["12", "10"] });
    await shot(page, "sommerfest-ohne-zahl");
  }

  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------
// Telefon
// ---------------------------------------------------------------------------------------------------------------
async function phone(browser) {
  const { context, page } = await session(browser, true);

  if (wanted("phone-dashboard")) {
    await go(page, "/dashboard");
    await normalize(page);
    await shot(page, "phone-dashboard");
  }

  if (wanted("phone-benachrichtigungen")) {
    await go(page, "/benachrichtigungen");
    await normalize(page);
    await shot(page, "phone-benachrichtigungen");
  }

  if (wanted("phone-helfer")) {
    const id = await sommerfestId(page);
    await go(page, `/helferplanung/${id}`);
    // Die Benachrichtigung nennt Grillstand und Abbau – die Szene trägt Anna in den Abbau ein.
    const signUp = page.getByRole("button", { name: "In Abbau eintragen" });
    const signOut = page.getByRole("button", { name: "Aus Abbau austragen" });
    if (await signOut.isVisible().catch(() => false)) {
      await signOut.click();
      const confirm = page.getByRole("alertdialog").getByRole("button", { name: /austragen/i });
      if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) await confirm.click();
      await page.waitForTimeout(2000);
      await go(page, `/helferplanung/${id}`);
    }
    // Ganze Seite (das Video scrollt darin bis zum Abbau); Lage des Knopfs in Seitenkoordinaten
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(400);
    await normalize(page, { gentle: true });
    const pageBox = async (locator) => {
      await locator.scrollIntoViewIfNeeded();
      const b = await locator.boundingBox();
      const y = await page.evaluate(() => scrollY);
      await page.evaluate(() => scrollTo(0, 0));
      return { ...b, y: b.y + y };
    };
    const button = await pageBox(signUp);
    await page.waitForTimeout(300);
    await shot(page, "phone-helfer-vorher", { button }, { fullPage: true });
    await signUp.click();
    const confirm = page.getByRole("alertdialog").getByRole("button", { name: /eintragen/i });
    if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) await confirm.click();
    await page.waitForTimeout(2500);
    await go(page, `/helferplanung/${id}`);
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(400);
    await normalize(page, { gentle: true });
    await shot(page, "phone-helfer-nachher", { button: await pageBox(signOut) }, { fullPage: true });
  }

  await context.close();
}

// ---------------------------------------------------------------------------------------------------------------
// Dunkelmodus für den Kurzspot (nacht-…)
// ---------------------------------------------------------------------------------------------------------------
async function nacht(browser) {
  const { context, page } = await session(browser, true);
  const pageBox = async (locator) => {
    await locator.scrollIntoViewIfNeeded();
    const b = await locator.boundingBox();
    const y = await page.evaluate(() => scrollY);
    await page.evaluate(() => scrollTo(0, 0));
    return { ...b, y: b.y + y };
  };
  if (wanted("nacht-phone-dashboard")) {
    await go(page, "/dashboard");
    await normalize(page);
    await shot(page, "nacht-phone-dashboard");
  }
  if (wanted("nacht-phone-fest")) {
    const id = await sommerfestId(page);
    await go(page, `/veranstaltungen/${id}`);
    // Anna hat seit dem Seed zugesagt – erst abmelden, damit die Szene das Zusagen zeigen kann
    const abmelden = page.getByRole("button", { name: /^Abmelden/ }).first();
    if (await abmelden.isVisible().catch(() => false)) {
      await abmelden.click();
      const confirm = page.getByRole("alertdialog").getByRole("button", { name: /Abmelden/ });
      if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) await confirm.click();
      await page.waitForTimeout(2000);
      await go(page, `/veranstaltungen/${id}`);
    }
    const zusagen = page.getByRole("button", { name: /^Zusagen/ }).first();
    await normalize(page, { gentle: true });
    const karte = await pageBox(page.getByText("Deine Teilnahme", { exact: true }).first());
    const knopf = await pageBox(zusagen);
    await page.waitForTimeout(300);
    await shot(page, "nacht-phone-fest-vorher", { karte, knopf }, { fullPage: true });
    await zusagen.click();
    const confirm = page.getByRole("dialog").getByRole("button", { name: /Zusagen|Bestätigen/ });
    if (await confirm.isVisible({ timeout: 3000 }).catch(() => false)) await confirm.click();
    await page.waitForTimeout(2500);
    await go(page, `/veranstaltungen/${id}`);
    await normalize(page, { gentle: true });
    await shot(page, "nacht-phone-fest-nachher", { karte: await pageBox(page.getByText("Deine Teilnahme", { exact: true }).first()) }, { fullPage: true });
  }
  await context.close();
  if (wanted("nacht-dashboard")) {
    const d = await session(browser, false);
    await go(d.page, "/dashboard");
    await normalize(d.page);
    await shot(d.page, "nacht-dashboard");
    await d.context.close();
  }
}

await fs.mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--lang=de-DE"] });
try {
  if (DUNKEL) await nacht(browser);
  else {
    await desktop(browser);
    await phone(browser);
  }
} finally {
  await browser.close();
  await fs.writeFile(path.join(OUT, "lage.json"), JSON.stringify(lage, null, 1) + "\n");
  // dieselben Daten für die Szene (file:// darf kein JSON nachladen)
  await fs.writeFile(
    path.join(OUT, "lage.js"),
    `// Erzeugt von werkzeuge/aufnehmen.mjs – Lage der Karten und Zahlen in den App-Bildern (CSS-Pixel).\nwindow.LAGE = ${JSON.stringify(lage)};\n`,
  );
}
