// Nimmt die Handy-Bilder für das 60-s-Reel aus der lokal laufenden Demo-App auf (Datenbank vf_website) und schreibt
// video/public/screens/manifest.json mit den Bildpunkten der Elemente, die der Spot antippt oder hervorhebt.
//
//   node werkzeuge/handy-aufnehmen.mjs                 alle Bilder
//   node werkzeuge/handy-aufnehmen.mjs --only kalender,termin-detail
//
// Voraussetzungen (Reihenfolge): Demo-App mit vf_website (website/README.md „Hinweise zu den Aufnahmen“),
// website/tools/demo-vorbereiten.mjs, dann werkzeuge/finanzen-demo.mjs und werkzeuge/termin-zusagen.mjs.
//
// Gerät wie ein iPhone: 390 × 844 Punkte, dreifache Pixeldichte (Bilder 1170 × 2532), Touch, helle Darstellung, de-DE,
// Europe/Berlin. Je Seite ein Bild ab Seitenanfang (<name>.png), bei längeren Seiten zusätzlich die ganze Seite
// (<name>-ganz.png) und, wo es hilft, ein Bild ab der wichtigen Stelle (gescrollt, direkt unter der Kopfzeile).
// Namen werden nur im Bild ersetzt (dieselben DEMO_RENAME-Regeln wie website/tools/capture-screenshots.mjs, zur Laufzeit
// von dort gelesen), die Entwicklungsanzeige von Next.js ist ausgeblendet. Die Zugangsdaten des Demo-Administrators
// kommen zur Laufzeit aus capture-screenshots.mjs (oder VF_DEMO_EMAIL / VF_DEMO_PASSWORD) – nie ausgegeben, nie gespeichert.
//
// Daten ändern sich nur an einer Stelle und nur kurz: Für „schichten“ trägt sich der Demo-Administrator wie bei den
// Website-Aufnahmen aus der Schicht „Getränkestand“ aus (damit überall „Eintragen“ steht) und danach wieder ein.
// Der Mitglieder-Import zeigt nur die Vorschau (die App speichert dabei nichts); „importieren“ wird nie geklickt.
// Zu-/Absage-Knöpfe werden nie geklickt.
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(HERE, "..", "video", "public", "screens");
const APP_DIR = process.env.VF_APP_DIR ?? path.resolve(HERE, "../../..");
const BASE = (process.env.VF_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const require = createRequire(path.join(APP_DIR, "package.json"));
const { chromium } = require("playwright");

const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1]?.split(",") : null;

const VIEW = { width: 390, height: 844 };
const SCALE = 3;
/** Sommerfest des Demo-Vereins (demo-vorbereiten.mjs, FEST_DAY 2027-06-12) und der Donnerstag davor. */
const FEST_WEEK = "2027-06-09";
const THURSDAY = "Donnerstag, 3. Juni 2027";
const FEST_LINK = /Sommerfest 20\d\d/;

const captureSrc = await fs.readFile(path.join(APP_DIR, "website/tools/capture-screenshots.mjs"), "utf8");
const pickCredential = (name) =>
  captureSrc.match(new RegExp(`const ${name} = process\\.env\\.VF_DEMO_${name} \\?\\? "([^"]*)"`))?.[1];
const EMAIL = process.env.VF_DEMO_EMAIL ?? pickCredential("EMAIL");
const PASSWORD = process.env.VF_DEMO_PASSWORD ?? pickCredential("PASSWORD");
if (!EMAIL || !PASSWORD) throw new Error("Demo-Zugangsdaten nicht gefunden");
const renameStart = captureSrc.indexOf("const DEMO_RENAME = [");
const renameSrc = captureSrc.slice(renameStart, captureSrc.indexOf("];", renameStart) + 2);
const DEMO_RENAME = new Function(`${renameSrc}; return DEMO_RENAME;`)();
const RULES = DEMO_RENAME.map(([re, replacement]) => [re.source, re.flags, replacement]);
const HIDE_DEV_UI = "nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button] { display: none !important; }";

// ---------------------------------------------------------------------------------------------------------------------
// Hilfen im Browser
// ---------------------------------------------------------------------------------------------------------------------

/** Namen im Bild ersetzen (wie normalizeDemoNames in capture-screenshots.mjs). */
async function normalizeNames(page) {
  await page.evaluate((rules) => {
    const comments = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
    const marks = [];
    for (let n = comments.nextNode(); n; n = comments.nextNode()) marks.push(n);
    for (const n of marks) n.remove();
    document.body.normalize();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      let t = n.nodeValue ?? "";
      for (const [s, f, r] of rules) t = t.replace(new RegExp(s, f), r);
      if (t !== n.nodeValue) n.nodeValue = t;
    }
    for (const el of document.querySelectorAll("span, div")) {
      if (el.children.length === 0 && el.textContent?.trim() === "LA") el.textContent = "AA";
    }
  }, RULES);
}

/** Was im sichtbaren Text noch nach Seed-Namen, Testadressen oder Fehlern aussieht (wird gemeldet). */
async function findProblems(page) {
  return page.evaluate((rules) => {
    const text = document.body.innerText;
    const problems = [];
    for (const [s, f] of rules) {
      const m = new RegExp(s, f.replace("g", "")).exec(text);
      if (m) problems.push(`Seed-Name: ${m[0]}`);
    }
    for (const word of ["Lastschrift", "SEPA", "Application error", "Unhandled Runtime Error", "Internal Server Error", "Etwas ist schiefgelaufen", "404"]) {
      if (text.includes(word)) problems.push(`Text: ${word}`);
    }
    if (document.querySelector("nextjs-portal")?.shadowRoot?.querySelector("[data-nextjs-dialog], [data-nextjs-error-overlay]"))
      problems.push("Next.js-Fehleranzeige");
    return problems;
  }, RULES);
}

/** Blendet Textzeilen mit genau diesem Inhalt aus (Platz bleibt, nichts verrutscht) – wie hideText der Website. */
const hideText = (pattern) => async (page) => {
  await page.evaluate(([source, flags]) => {
    const re = new RegExp(source, flags);
    for (const el of document.querySelectorAll("p, span, div, li")) {
      const own = el.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (re.test(own) && ![...el.children].some((c) => re.test(c.textContent?.replace(/\s+/g, " ").trim() ?? "")))
        el.style.setProperty("visibility", "hidden");
    }
  }, [pattern.source, pattern.flags]);
};

/**
 * Sucht ein Element (Bildschirmkoordinaten in CSS-Pixeln): `text` (genau) oder `regex` (über den ganzen Text eines
 * Elements, das kleinste passende), `nth`, `within` (nur innerhalb des kleinsten Vorfahren, dessen Text darauf passt),
 * `card` (statt des Elements den kleinsten Vorfahren, dessen Text darauf passt).
 */
async function locateByText(page, spec) {
  return page.evaluate((s) => {
    // Silbentrennung (weiches Trennzeichen) und Unicode-Formen dürfen den Vergleich nicht stören
    const norm = (el) => (el.innerText ?? el.textContent ?? "").normalize("NFC").replace(/[\u00ad\u200b]/g, "").replace(/\s+/g, " ").trim();
    const re = s.regex ? new RegExp(s.regex[0], s.regex[1]) : null;
    const hit = (t) => (re ? re.test(t) : t === s.text);
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return r.width > 2 && r.height > 2 && st.visibility !== "hidden" && st.display !== "none" && Number(st.opacity) > 0.05;
    };
    let scope = document.body;
    if (s.within) {
      const wre = new RegExp(s.within[0], s.within[1]);
      const all = [...document.querySelectorAll("body *")].filter((el) => !["SCRIPT", "STYLE"].includes(el.tagName) && wre.test(norm(el)) && visible(el));
      const smallest = all.filter((el) => !all.some((o) => o !== el && el.contains(o)));
      scope = smallest[s.withinNth ?? 0] ?? null;
      if (!scope) return null;
    }
    const matches = [];
    for (const el of scope.querySelectorAll("*")) {
      if (["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT"].includes(el.tagName)) continue;
      if (!hit(norm(el)) || !visible(el)) continue;
      if ([...el.children].some((c) => hit(norm(c)) && visible(c))) continue;
      matches.push(el);
    }
    let el = matches[s.nth ?? 0];
    if (!el) return null;
    if (s.card) {
      const cre = new RegExp(s.card[0], s.card[1]);
      let a = el;
      while (a && !cre.test(norm(a))) a = a.parentElement;
      if (a) el = a;
    }
    if (s.frame) {
      // bis zur sichtbaren Karte: abgerundet und mit eigenem Hintergrund (Farbe oder Verlauf)
      const isFrame = (node) => {
        const st = getComputedStyle(node);
        const bg = st.backgroundImage !== "none" || !/rgba\(0, 0, 0, 0\)|transparent/.test(st.backgroundColor);
        return bg && Number.parseFloat(st.borderTopLeftRadius) >= 8;
      };
      let a = el;
      for (let i = 0; a && i < 6 && !isFrame(a); i++) a = a.parentElement;
      if (a && isFrame(a)) el = a;
    }
    if (s.tight) {
      // nur der Text selbst (ein Block-Element ist oft so breit wie die Karte)
      // tight: "first" = nur der erste Textknoten (z. B. das Datum vor den Badges im selben Element)
      const range = document.createRange();
      const node = s.tight === "first" ? [...el.childNodes].find((n) => n.nodeType === 3 && n.nodeValue.trim()) : null;
      if (node) range.selectNode(node);
      else range.selectNodeContents(el);
      const b = range.getBoundingClientRect();
      const text = node ? node.nodeValue.replace(/\s+/g, " ").trim() : norm(el);
      if (b.width > 0 && b.height > 0) return { x: b.x, y: b.y, width: b.width, height: b.height, text: text.slice(0, 160) };
    }
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, text: norm(el).slice(0, 160) };
  }, { ...spec, regex: spec.regex ? [spec.regex.source, spec.regex.flags] : null, within: spec.within ? [spec.within.source, spec.within.flags] : null, card: spec.card ? [spec.card.source, spec.card.flags] : null });
}

/** Bounding-Box eines Playwright-Locators (Bildschirmkoordinaten) samt Text. */
async function locateBy(locator, tight = false) {
  const first = locator.first();
  if (!(await first.count())) return null;
  const box = tight
    ? await first.evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        const b = range.getBoundingClientRect();
        return b.width ? { x: b.x, y: b.y, width: b.width, height: b.height } : null;
      })
    : await first.boundingBox();
  if (!box) return null;
  const text = ((await first.evaluate((el) => el.innerText || el.textContent || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "")) ?? "").replace(/\s+/g, " ").trim();
  return { ...box, text: text.slice(0, 160) };
}

/** Scrollt so, dass `locator` direkt unter der fest stehenden Kopfzeile beginnt (wie scrollBelowHeader der Website). */
async function scrollBelowHeader(page, locator, gap = 12) {
  const target = locator.first();
  await target.waitFor();
  const top = await target.evaluate((node, space) => {
    const y = node.getBoundingClientRect().top + window.scrollY;
    let covered = 0;
    for (const bar of document.querySelectorAll("body *")) {
      const style = getComputedStyle(bar);
      if (style.position !== "sticky" && style.position !== "fixed") continue;
      const box = bar.getBoundingClientRect();
      if (!box.height || box.height > innerHeight / 3 || bar.contains(node)) continue;
      if (style.position === "sticky" && (style.top === "auto" || box.top + window.scrollY > y)) continue;
      const stuck = style.position === "fixed" ? box.top : Number.parseFloat(style.top);
      if (stuck > 8 + covered) continue;
      covered = Math.max(covered, stuck + box.height);
    }
    return y - covered - space;
  }, gap);
  await page.evaluate((y) => window.scrollTo(0, Math.max(0, y)), top);
  await page.waitForTimeout(500);
  return page.evaluate(() => window.scrollY);
}

/** Kopfzeile deckend (beim gescrollten Bild schiene sonst die Seite darunter durch) – wie solidHeader der Website. */
async function solidHeader(page) {
  await page.evaluate(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const color = getComputedStyle(header).backgroundColor.replace(/\s*\/\s*[\d.]+%?\)$/, ")").replace(/^rgba\((.+),\s*[\d.]+\)$/, "rgb($1)");
    header.style.setProperty("background-color", color, "important");
    header.style.setProperty("backdrop-filter", "none", "important");
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Markierungen je Seite (was der Spot antippt, hervorhebt oder ausmaskiert)
// ---------------------------------------------------------------------------------------------------------------------

const t = (id, label, spec) => ({ id, label, ...spec });
const role = (id, label, roleName, name, extra = {}) => ({ id, label, loc: (page) => page.getByRole(roleName, { name, exact: true, ...extra }) });

const FINANCE_TABS = ["Übersicht", "Beiträge", "Kassenbuch", "Rechnungen", "Abschluss"].map((name) =>
  t(`reiter-${name.toLowerCase().replace("ü", "ue").replace("ä", "ae")}`, `Reiter „${name}“ der Finanzen (Reiterleiste ist am Handy breiter als das Bild)`, {
    regex: new RegExp(`^${name}(\\s*\\d+\\s*überfällig)?$`),
    within: /^Übersicht\s*Beiträge\s*Kassenbuch\s*Rechnungen/,
  }),
);
const FINANCE_TABBAR = t("reiterleiste", "Reiterleiste der Finanzen (Übersicht · Beiträge · Kassenbuch · Rechnungen · Abschluss)", {
  regex: /^Übersicht\s*Beiträge\s*Kassenbuch\s*Rechnungen/,
});

const SHOTS = [
  {
    name: "dashboard",
    path: "/dashboard",
    description: "Dashboard „Willkommen, Anna!“ mit der Kennzahl Mitglieder (233) – Startbild der Lösung „Mitglieder“.",
    steps: async (page) => {
      for (const title of ["Erste Schritte", "Offene Zahlungen"]) {
        if (await page.getByText(title, { exact: true }).count()) throw new Error(`„${title}“ im Dashboard – zuerst website/tools/demo-vorbereiten.mjs`);
      }
      await hideText(/^Noch keine Stunden erfasst$/)(page);
      await page.waitForTimeout(1200); // Verlaufskurven
    },
    marks: [
      t("begruessung", "Überschrift „Willkommen, Anna!“", { text: "Willkommen, Anna!", tight: true }),
      t("kennzahl-mitglieder", "Karte „Mitglieder“ (Kennzahl, Verlauf über 12 Monate)", { regex: /^\d{3}$/, card: /Mitglieder.*\d{3}.*in 12 Monaten.*jetzt/, frame: true }),
      t("kennzahl-mitglieder-zahl", "Zahl der Mitglieder (233)", { regex: /^\d{3}$/, tight: true }),
      t("chip-wachstum-12-monate", "Chip „+23 (+11,0 %)“ – im Spot ausmaskiert (keine Wirkungsbehauptung)", { regex: /\(\+[\d,]+\s*%\)$/, card: /\+\d+\s*\(\+[\d,]+\s*%\)/ }),
      t("chip-vormonat", "Chip „+x gegenüber dem Vormonat“ – im Spot ausmaskiert", { regex: /^\+\d+ gegenüber dem Vormonat$/ }),
      t("reiter-dashboard", "Reiter des Dashboards (Übersicht · Termine & Helfer · Mitglieder …)", { regex: /^Übersicht\s*Termine & Helfer\s*Mitglieder/ }),
    ],
  },
  {
    name: "mitglieder",
    path: "/mitglieder",
    description: "Mitgliederliste (233 Einträge, alphabetisch: Abel, Claudia · Adler, Anna · …).",
    marks: [
      t("anzahl", "„233 Einträge“", { regex: /^\d+ Einträge$/, tight: true }),
      t("erste-zeile", "Erste Zeile „Abel, Claudia“", { text: "Abel, Claudia", card: /Abel, Claudia.*Aktiv/ }),
      t("zweite-zeile", "Zweite Zeile „Adler, Anna“", { text: "Adler, Anna", card: /Adler, Anna.*Aktiv/ }),
      role("knopf-import", "Knopf „Import“", "link", "Import"),
      role("knopf-neues-mitglied", "Knopf „Neues Mitglied“", "link", "Neues Mitglied"),
    ],
  },
  {
    name: "mitglieder-import-vorschau",
    path: "/mitglieder/import",
    description:
      "Mitglieder-Import mit erfundener CSV „mitglieder.csv“ (6 Zeilen, Zeile 4 mit ungültiger E-Mail): Schritt „2. Vorschau prüfen“ – NUR Vorschau, nichts gespeichert.",
    steps: async (page) => {
      const csv = [
        "Vorname;Nachname;E-Mail;Geburtsdatum;Eintritt",
        "Mila;Brockmann;mila.brockmann@example.org;12.05.2015;01.10.2026",
        "Jonte;Albers;jonte.albers@example.org;03.09.2014;01.10.2026",
        "Lasse;Meinert;lasse.meinert(at)example.org;08.11.2015;01.10.2026",
        "Greta;Hinrichs;greta.hinrichs@example.org;21.01.2016;01.10.2026",
        "Ida;Kortmann;ida.kortmann@example.org;30.06.2015;01.10.2026",
        "Bastian;Rehbein;bastian.rehbein@example.org;17.02.1988;01.10.2026",
        "",
      ].join("\r\n");
      await page.locator("input[type=file]").setInputFiles({ name: "mitglieder.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
      await page.getByText("2. Vorschau prüfen", { exact: true }).waitFor();
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(600);
    },
    scrolled: { suffix: "tabelle", to: (page) => page.getByText("2. Vorschau prüfen", { exact: true }) },
    extras: [
      {
        suffix: "hinweis",
        description: "dieselbe Vorschau, Tabelle ganz nach rechts gescrollt: Spalte „Hinweis“ mit „Bitte gib eine gültige E-Mail-Adresse ein.“ in der Fehlerzeile (Spalte „Ergebnis“ dafür links angeschnitten)",
        setup: async (page) => {
          const y = await scrollBelowHeader(page, page.getByText("2. Vorschau prüfen", { exact: true }));
          await page.evaluate(() => {
            const table = document.querySelector("main table");
            let el = table?.parentElement;
            while (el && !(el.scrollWidth > el.clientWidth + 2)) el = el.parentElement;
            // ganz nach rechts: Der Hinweis steht ganz im Bild (Ergebnis und Hinweis passen am Handy nicht zusammen hinein)
            if (el) el.scrollLeft = el.scrollWidth;
          });
          await page.waitForTimeout(400);
          return y;
        },
      },
    ],
    marks: [
      t("datei", "Gewählte Datei „mitglieder.csv“", { text: "mitglieder.csv", tight: true }),
      t("schritt-vorschau", "Karte „2. Vorschau prüfen“ mit den Zählern", { text: "2. Vorschau prüfen", card: /2\. Vorschau prüfen.*fehlerhaft/, frame: true }),
      t("badge-gueltig", "Badge „5 gültig“", { regex: /^\d+ gültig$/ }),
      t("badge-duplikate", "Badge „0 Duplikate“", { regex: /^\d+ Duplikate$/ }),
      t("badge-fehlerhaft", "Badge „1 fehlerhaft“", { regex: /^\d+ fehlerhaft$/ }),
      t("fehlerzeile", "Fehlerzeile (Zeile 4: Meinert, Lasse) mit Badge „Fehler“", { text: "Fehler", card: /^4\s/ }),
      t("fehler-badge", "Badge „Fehler“", { text: "Fehler" }),
      t("fehler-hinweis", "Hinweis zur Fehlerzeile („Bitte gib eine gültige E-Mail-Adresse ein.“) – Spalte „Hinweis“ liegt am Handy rechts außerhalb, siehe …-hinweis.png", { regex: /E-Mail/, within: /^4 Lasse Meinert Fehler/, tight: true }),
      t("tabelle", "Tabelle der Vorschau (Zeile · Mitglied · Ergebnis · Hinweis)", { regex: /^Zeile\s*Mitglied\s*Ergebnis/, card: /Zeile.*Mitglied.*Ergebnis.*wird importiert.*Fehler/ }),
      t("knopf-importieren", "Knopf „5 Mitglieder importieren“ (wird nie geklickt)", { regex: /^\d+ Mitglieder importieren$/ }),
    ],
  },
  {
    name: "kalender",
    path: `/kalender?ansicht=liste&datum=${FEST_WEEK}`,
    description: "Kalender als Liste, Juni 2027 – mit „Donnerstag, 3. Juni 2027 · 17:00–18:30 · Fußball-Training D-Jugend“.",
    scrolled: { suffix: "donnerstag", to: (page) => page.getByText(THURSDAY, { exact: true }) },
    marks: [
      t("monat", "Monat „Juni 2027“", { text: "Juni 2027", tight: true }),
      role("ansicht-liste", "Umschalter „Liste“", "link", "Liste"),
      t("tag-donnerstag", "Tagesüberschrift „Donnerstag, 3. Juni 2027“", { text: THURSDAY, tight: true }),
      t("termin-d-jugend", "Karte „Fußball-Training D-Jugend“ am Donnerstag, 3. Juni (17:00 – 18:30, Sportplatz)", {
        text: "Fußball-Training D-Jugend",
        card: /^17:00 – 18:30\s*Fußball-Training D-Jugend.*Sportplatz$/,
        frame: true,
      }),
      t("termin-d-jugend-titel", "Titel „Fußball-Training D-Jugend“ (3. Juni)", { text: "Fußball-Training D-Jugend", tight: true }),
    ],
  },
  {
    name: "termin-detail",
    path: async (page) => {
      // Detailseite des Trainings am Donnerstag, 3. Juni 2027 – Adresse aus dem Kalender (frisch geladen, ohne Klick)
      await page.goto(`/kalender?ansicht=liste&datum=${FEST_WEEK}`, { waitUntil: "networkidle" });
      const href = await page.getByRole("link", { name: /Fußball-Training D-Jugend/ }).first().getAttribute("href");
      if (!href) throw new Error("Link zum Training nicht gefunden");
      return href;
    },
    description:
      "Termin „Fußball-Training D-Jugend“ am Donnerstag, 3. Juni 2027: „Deine Teilnahme“ mit „Zusagen“/„Absagen“ (noch nicht geantwortet), Teilnehmerzahl 9, „9 Zusagen“.",
    scrolled: { suffix: "teilnehmer", to: (page) => page.locator("section[aria-labelledby='event-teilnehmer']") },
    marks: [
      t("titel", "Titel „Fußball-Training D-Jugend“", { text: "Fußball-Training D-Jugend", nth: 0, tight: true }),
      t("datum", "Datum „Donnerstag, 3. Juni 2027 · 17:00 – 18:30 Uhr“", { regex: /^Donnerstag, 3\. Juni 2027 · 17:00 – 18:30 Uhr/, tight: "first" }),
      t("karte-teilnahme", "Karte „Deine Teilnahme“", { text: "Deine Teilnahme", card: /Deine Teilnahme.*Absagen/, frame: true }),
      t("status-teilnahme", "„Du hast noch nicht geantwortet.“", { text: "Du hast noch nicht geantwortet.", tight: true }),
      role("knopf-zusagen", "Knopf „Zusagen“ (wird nie geklickt)", "button", "Zusagen"),
      role("knopf-absagen", "Knopf „Absagen“ (wird nie geklickt)", "button", "Absagen"),
      t("karte-teilnehmerzahl", "Karte „Teilnehmerzahl“ (9)", { text: "Teilnehmerzahl", card: /^Teilnehmerzahl\s*\d+/, frame: true }),
      t("teilnehmerzahl", "Zahl der Zusagen (9)", { regex: /^\d+$/, within: /^Teilnehmerzahl\s*\d+$/, tight: true }),
      t("zusagen-text", "„9 Zusagen“ (Teilnehmer)", { regex: /^\d+ Zusagen$/, tight: true }),
      t("karte-teilnehmer", "Karte „Teilnehmer“ mit der Liste der Zusagen", { text: "Teilnehmer", card: /^Teilnehmer\s*\d+ Zusagen/, frame: true }),
    ],
  },
  {
    name: "schichten",
    path: async (page) => {
      await page.goto("/helferplanung", { waitUntil: "networkidle" });
      const href = await page.getByRole("link", { name: FEST_LINK }).first().getAttribute("href");
      if (!href) throw new Error("Link zum Helferplan des Sommerfests nicht gefunden");
      // Ausgangslage wie bei den Website-Bildern: Der Administrator ist nirgends eingetragen (überall „Eintragen“)
      await page.goto(href, { waitUntil: "networkidle" });
      const leave = page.getByRole("button", { name: "Aus Getränkestand austragen", exact: true });
      if (await leave.count()) {
        await leave.first().click();
        await page.getByRole("button", { name: "In Getränkestand eintragen", exact: true }).first().waitFor();
        await page.waitForLoadState("networkidle");
        restoreShift = href;
      }
      return href;
    },
    steps: collapseShifts,
    description:
      "Helferplan „Sommerfest 2027“ (Samstag, 12. Juni 2027): Karte „Tagesablauf“ mit den Schichten, „Eintragen“ und freien Plätzen (Aufbau voll, Getränkestand 2 von 4, Grillstand 0 von 3, Kuchenbuffet 1 von 3, Abbau 1 von 6).",
    scrolled: { suffix: "liste", to: (page) => page.getByRole("listitem", { name: "Schicht Getränkestand", exact: true }) },
    marks: shiftMarks(),
  },
  {
    name: "schichten-eingetragen",
    path: async (page) => {
      // Danach wieder wie vorher: eingetragen in „Getränkestand“ (Endzustand = Stand vor der Aufnahme)
      const href = restoreShift ?? (await festPlan(page));
      await page.goto(href, { waitUntil: "networkidle" });
      const join = page.getByRole("button", { name: "In Getränkestand eintragen", exact: true });
      if (restoreShift && (await join.count())) {
        await join.first().click();
        await page.getByRole("button", { name: "Aus Getränkestand austragen", exact: true }).first().waitFor();
        await page.waitForLoadState("networkidle");
        restoreShift = null;
      }
      return href;
    },
    steps: collapseShifts,
    description: "Helferplan „Sommerfest 2027“ nach dem Eintragen: Getränkestand 3 von 4, eigener Name, „Austragen“ (Stand wie vor der Aufnahme).",
    scrolled: { suffix: "liste", to: (page) => page.getByRole("listitem", { name: "Schicht Getränkestand", exact: true }) },
    marks: shiftMarks(),
  },
  {
    name: "nachrichten",
    path: "/nachrichten?chat=alle",
    description: "Chat „Alle Mitglieder“ mit der Ankündigung „Arbeitseinsatz am Vereinsheim“ und der Lesestatistik „4/5“ (4 von 5 gelesen).",
    steps: async (page) => {
      await page.getByText("Arbeitseinsatz am Vereinsheim", { exact: true }).first().waitFor();
      await page.waitForTimeout(800); // der Verlauf rollt zur jüngsten Nachricht
    },
    marks: [
      t("chat-kopf", "Kopf des Chats „Alle Mitglieder · Erreicht 5 Personen“", { text: "Alle Mitglieder", card: /Alle Mitglieder\s*Erreicht/, frame: true }),
      t("ankuendigung", "Blase der Ankündigung „Arbeitseinsatz am Vereinsheim“", { text: "Arbeitseinsatz am Vereinsheim", card: /ANKÜNDIGUNG.*Arbeitseinsatz am Vereinsheim.*\d+\/\d+/i }),
      t("lesestatistik", "Lesestatistik der Ankündigung „4/5“ (App-Text „4 von 5 gelesen“)", { regex: /^\d+\/\d+$/, within: /Arbeitseinsatz am Vereinsheim.*18:30/ }),
      t("lesestatistik-zeile", "Fuß der Ankündigung (Umschlag-Symbol, Uhrzeit, Häkchen, 4/5) – das Umschlag-Symbol (E-Mail) gehört nicht zum Fakt", { regex: /18:30\s*\d+\/\d+/, within: /Arbeitseinsatz am Vereinsheim.*18:30/ }),
      { id: "eingabe", label: "Eingabefeld „Nachricht schreiben“", loc: (page) => page.getByPlaceholder("Nachricht schreiben") },
    ],
  },
  {
    name: "nachrichten-liste",
    path: "/nachrichten",
    description: "Liste der Chats: Alle Mitglieder · Helfer · Sommerfest 2027 · Teilnehmer · Sommerfest 2027 · Abteilung Fußball.",
    marks: [
      t("chat-alle", "Chat „Alle Mitglieder“", { text: "Alle Mitglieder", card: /^Alle Mitglieder.*Super Sache/ }),
      t("chat-helfer", "Chat „Helfer · Sommerfest 2027“", { text: "Helfer · Sommerfest 2027", card: /^Helfer · Sommerfest 2027.*Danke an alle/ }),
      t("chat-teilnehmer", "Chat „Teilnehmer · Sommerfest 2027“", { text: "Teilnehmer · Sommerfest 2027", card: /^Teilnehmer · Sommerfest 2027.*zugesagt habt/ }),
      t("chat-abteilung", "Chat „Abteilung Fußball“", { text: "Abteilung Fußball", card: /^Abteilung Fußball.*Trainingsanzüge/ }),
    ],
  },
  {
    name: "finanzen-cockpit",
    path: "/finanzen",
    description:
      "Finanzen › Übersicht: Kontostand, Karte „Offene Rechnungen“ (1.549,50 €, 2 Rechnungen zu bezahlen, davon 1 überfällig), Überschuss und Spenden (im Spot ausmaskiert), Monatszahlen, „Das steht an“.",
    steps: async (page) => page.waitForTimeout(1200), // Diagramm
    scrolled: { suffix: "das-steht-an", to: (page) => page.getByText("Einnahmen und Ausgaben 2026", { exact: true }) },
    marks: [
      FINANCE_TABBAR,
      ...FINANCE_TABS,
      t("karte-offene-rechnungen", "Karte „Offene Rechnungen“", { text: "Offene Rechnungen", card: /^Offene Rechnungen.*überfällig$/, frame: true }),
      t("offene-rechnungen-betrag", "Betrag offene Rechnungen (1.549,50 €)", { regex: /^[\d.]+,\d\d €$/, within: /^Offene Rechnungen.*überfällig$/, tight: true }),
      t("offene-rechnungen-anzahl", "„2 Rechnungen zu bezahlen“", { regex: /^\d+ Rechnung(en)? zu bezahlen$/, tight: true }),
      t("offene-rechnungen-ueberfaellig", "„davon 1 überfällig“", { regex: /^davon \d+ überfällig$/, tight: true }),
      t("karte-kontostand", "Karte „Kontostand gesamt“ – im Spot ausmaskiert", { text: "Kontostand gesamt", card: /^Kontostand gesamt.*Barkasse$/, frame: true }),
      t("karte-ueberschuss", "Karte „Überschuss 2026“ – im Spot ausmaskiert", { regex: /^Überschuss 20\d\d$/, card: /^Überschuss 20\d\d.*seit/, frame: true }),
      t("karte-spenden", "Karte „Spenden 2026“ – im Spot ausmaskiert (Spenden nicht in der Faktenliste)", { regex: /^Spenden 20\d\d$/, card: /^Spenden 20\d\d.*Spender/, frame: true }),
      t("karte-monatszahlen", "Karte „Einnahmen und Ausgaben 2026“ (Monatsdiagramm)", { regex: /^Einnahmen und Ausgaben 20\d\d$/, card: /^Einnahmen und Ausgaben 20\d\d.*Okt/, frame: true }),
      t("karte-das-steht-an", "Karte „Das steht an“", { text: "Das steht an", card: /^Das steht an.*Demnächst/, frame: true }),
    ],
  },
  {
    name: "finanzen-beitraege",
    path: "/finanzen/beitraege",
    description:
      "Finanzen › Beiträge „Wer zahlt was im 4. Quartal 2026“: 6.831,00 € von 230 Mitgliedern, Liste je Mitglied. Die Zeile „0 per Lastschrift, … per Überweisung“ ist im Bild ausgeblendet (kein SEPA/Lastschrift im Spot).",
    steps: hideText(/^\d+ per Lastschrift, \d+ per Überweisung$/),
    maxHeight: 2600,
    scrolled: { suffix: "liste", to: (page) => page.getByRole("table").first() },
    marks: [
      FINANCE_TABBAR,
      ...FINANCE_TABS,
      t("unterreiter", "Unterreiter der Beiträge (Wer zahlt was · Beitragslauf · Offene Beiträge · …)", { regex: /^Wer zahlt was\s*Beitragslauf\s*Offene Beiträge/ }),
      t("karte-summe", "Karte „Beiträge zusammen“ (6.831,00 €)", { text: "Beiträge zusammen", card: /^Beiträge zusammen\s*[\d.]+,\d\d €/, frame: true }),
      t("summe", "Summe der Beiträge im Quartal", { regex: /^[\d.]+,\d\d €$/, within: /^Beiträge zusammen\s*[\d.]+,\d\d €/, tight: true }),
      t("karte-mitglieder-mit-beitrag", "Karte „Mitglieder mit Beitrag“", { text: "Mitglieder mit Beitrag", card: /^Mitglieder mit Beitrag\s*\d+/, frame: true }),
      t("liste", "Tabelle „Wer zahlt was“ (Mitglied · Betrag, erste Zeilen)", { regex: /^Mitglied\s*Betrag$/, card: /^Mitglied\s*Betrag.*€/ }),
    ],
  },
  {
    name: "finanzen-beitraege-offen",
    path: "/finanzen/beitraege/offen",
    description: "Finanzen › Beiträge › Offene Beiträge aus dem Beitragslauf 4. Quartal 2026 (229 Beiträge, fällig 15.10.2026).",
    marks: [
      FINANCE_TABBAR,
      ...FINANCE_TABS,
      t("kopf", "„Offen: 6.831,00 € in 229 Beiträgen“", { regex: /^Offen: [\d.]+,\d\d € in \d+ Beiträgen$/, tight: true }),
      t("erster-beitrag", "Erster offener Beitrag (B-2026-0001)", { text: "B-2026-0001", card: /B-2026-0001.*€/ }),
    ],
  },
  {
    name: "finanzen-kassenbuch",
    path: "/finanzen/kassenbuch",
    description:
      "Finanzen › Kassenbuch: Girokonto und Barkasse, neueste Buchungen zuerst – jede mit Beleg (Datei zum Herunterladen oder Eigenbeleg).",
    scrolled: { suffix: "buchungen", to: (page) => page.getByText(/^\d+ Buchungen$/) },
    marks: [
      FINANCE_TABBAR,
      ...FINANCE_TABS,
      t("konto-girokonto", "Konto „Girokonto“ (Kontostand, Sparkasse Musterstadt)", { regex: /^Girokonto\b.*€.*Sparkasse Musterstadt$/, frame: true }),
      t("konto-barkasse", "Konto „Barkasse“ (Kontostand)", { regex: /^Barkasse\b.*\d,\d\d €$/, frame: true }),
      t("anzahl-buchungen", "„27 Buchungen“", { regex: /^\d+ Buchungen$/, tight: true }),
      t("buchung-1", "Neueste Buchung 2026-0027 (Fahrtkosten Auswärtsspiel, Beleg-Foto)", { regex: /^2026-0027 ·/, card: /^2026-0027.*(Ausgabe|Einnahme)$/ }),
      t("beleg-1", "Beleg der Buchung 2026-0027 „Quittung Fahrtkosten Auswärtsspiel.jpg“", { regex: /Quittung Fahrtkosten Auswärtsspiel\.jpg$/ }),
      t("buchung-2", "Buchung 2026-0026 (Übungsleiterpauschalen September, Beleg-PDF)", { regex: /^2026-0026 ·/, card: /^2026-0026.*(Ausgabe|Einnahme)$/ }),
      t("beleg-2", "Beleg „Abrechnung Übungsleiter September 2026.pdf“", { regex: /Abrechnung Übungsleiter September 2026\.pdf$/ }),
      t("buchung-3", "Buchung 2026-0025 (Übungsleiterzuschuss, Einnahme +540,00 €, Beleg-PDF)", { regex: /^2026-0025 ·/, card: /^2026-0025.*(Ausgabe|Einnahme)$/ }),
      t("beleg-3", "Beleg „Bewilligung Übungsleiterzuschuss 2026.pdf“", { regex: /Bewilligung Übungsleiterzuschuss 2026\.pdf$/ }),
      t("buchung-4", "Buchung 2026-0024 (Bürobedarf, Kassenbon)", { regex: /^2026-0024 ·/, card: /^2026-0024.*(Ausgabe|Einnahme)$/ }),
      t("beleg-4", "Beleg „Kassenbon Bürobedarf.jpg“", { regex: /Kassenbon Bürobedarf\.jpg$/ }),
    ],
  },
  {
    name: "finanzen-rechnungen",
    path: "/finanzen/rechnungen",
    description: "Finanzen › Rechnungen (Offen): „Offen zu bezahlen: 1.549,50 €“, 1 überfällig (1.200,00 €), 1 fällig in 7 Tagen (349,50 €).",
    marks: [
      FINANCE_TABBAR,
      ...FINANCE_TABS,
      t("offen-summe", "„Offen zu bezahlen: 1.549,50 €“", { regex: /^Offen zu bezahlen: [\d.]+,\d\d €$/, tight: true }),
      t("hinweis-ueberfaellig", "„1 Rechnung ist überfällig.“", { regex: /^\d+ Rechnung(en)? (ist|sind) überfällig\.$/, tight: true }),
      t("rechnung-ueberfaellig", "Überfällige Rechnung (1.200,00 €)", { regex: /überfällig$/, within: /^Rechnung vom.*überfällig\s*[\d.]+,\d\d €/, card: /^Rechnung vom.*überfällig\s*[\d.]+,\d\d €/ }),
      t("rechnung-bald", "Bald fällige Rechnung (349,50 €)", { regex: /^fällig in \d+ Tagen$/, card: /^Rechnung vom.*fällig in \d+ Tagen\s*[\d.]+,\d\d €/ }),
      role("knopf-hochladen", "Knopf „Rechnung hochladen“", "button", "Rechnung hochladen"),
    ],
  },
  {
    name: "finanzen-rechnungen-bezahlt",
    path: "/finanzen/rechnungen?stand=bezahlt",
    description: "Finanzen › Rechnungen (Bezahlt): vier bezahlte Rechnungen, jede „im Kassenbuch Nr. …“ gebucht.",
    marks: [FINANCE_TABBAR, ...FINANCE_TABS, t("erste-rechnung", "Neueste bezahlte Rechnung", { regex: /^im Kassenbuch Nr\. 2026-\d{4}$/, card: /^Rechnung vom.*im Kassenbuch Nr\. 2026-\d{4}\s*[\d.]+,\d\d €/ })],
  },
];

/** Helferplan: je Schicht Zeile, Knopf und Belegung („0 von 3 · 3 frei“). */
function shiftMarks() {
  const shifts = ["Aufbau", "Getränkestand", "Grillstand", "Kuchenbuffet", "Abbau"];
  return [
    t("titel", "Titel des Helferplans („Sommerfest 2027“)", { regex: /^Sommerfest 20\d\d$/ }),
    ...shifts.flatMap((name) => {
      const key = name.toLowerCase().replace("ä", "ae");
      return [
        { id: `schicht-${key}`, label: `Schicht „${name}“ (Listeneintrag)`, loc: (page) => page.getByRole("listitem", { name: `Schicht ${name}`, exact: true }) },
        {
          id: `knopf-${key}`,
          label: `Knopf „Eintragen“ (bzw. „Austragen“/„Zuweisen“) der Schicht „${name}“ – bei voller Schicht keiner`,
          loc: (page) =>
            page
              .getByRole("listitem", { name: `Schicht ${name}`, exact: true })
              .getByRole("button", { name: /eintragen|austragen|zuweisen/i }),
        },
        {
          id: `belegung-${key}`,
          label: `Belegung der Schicht „${name}“ („x von y · z frei“ bzw. „voll“)`,
          loc: (page) => page.getByRole("listitem", { name: `Schicht ${name}`, exact: true }).getByText(/^\d+ von \d+/).first(),
          tight: true,
        },
      ];
    }),
  ];
}

async function festPlan(page) {
  await page.goto("/helferplanung", { waitUntil: "networkidle" });
  return page.getByRole("link", { name: FEST_LINK }).first().getAttribute("href");
}
/** Klappt zu, was der Helferplan beim Laden aufklappt (wie collapseShifts der Website). */
async function collapseShifts(page) {
  const open = page.locator("main ul > li h3 button[aria-expanded='true']");
  for (let i = 0; i < 10 && (await open.count()); i++) {
    await open.first().click();
    await page.waitForTimeout(150);
  }
}
let restoreShift = null;

// ---------------------------------------------------------------------------------------------------------------------
// Aufnahme
// ---------------------------------------------------------------------------------------------------------------------

/** Markierungen messen (Bildschirmkoordinaten) und in Bildpixel des jeweiligen Bilds umrechnen. */
async function measure(page, marks, frame) {
  const result = [];
  for (const mark of marks) {
    let box = null;
    try {
      box = mark.loc ? await locateBy(mark.loc(page), mark.tight) : await locateByText(page, mark);
    } catch {
      box = null;
    }
    if (!box) {
      result.push({ id: mark.id, label: mark.label, found: false });
      continue;
    }
    const x = box.x;
    const y = box.y + frame.offsetY;
    const rows = y < frame.height && y + box.height > 0;
    const columns = x < frame.width && x + box.width > 0;
    const whole = x >= -0.5 && y >= -0.5 && x + box.width <= frame.width + 0.5 && y + box.height <= frame.height + 0.5;
    if (!rows) continue; // liegt über oder unter diesem Bild
    // seitlich außerhalb (z. B. weggescrollte Reiter einer Leiste): mit „ausserhalb“ trotzdem verzeichnet
    result.push({
      id: mark.id,
      label: mark.label,
      text: box.text,
      box: { x: Math.round(x * SCALE), y: Math.round(y * SCALE), w: Math.round(box.width * SCALE), h: Math.round(box.height * SCALE) },
      visible: whole ? "ganz" : columns ? "teilweise" : "ausserhalb",
    });
  }
  return result;
}

async function prepare(page) {
  await page.addStyleTag({ content: HIDE_DEV_UI });
  await page.evaluate(() => document.fonts.ready);
  await normalizeNames(page);
  await page.waitForTimeout(500);
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const manifestPath = path.join(OUT, "manifest.json");
  let previous = { images: [] };
  try {
    previous = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch {
    // erstes Mal
  }
  const browser = await chromium.launch();
  const images = [];
  const report = [];
  try {
    const context = await browser.newContext({
      baseURL: BASE,
      viewport: VIEW,
      deviceScaleFactor: SCALE,
      isMobile: true,
      hasTouch: true,
      colorScheme: "light",
      locale: "de-DE",
      timezoneId: "Europe/Berlin",
    });
    context.setDefaultTimeout(45_000);
    const page = await context.newPage();
    const issues = [];
    page.on("console", (m) => m.type() === "error" && issues.push(`Konsole: ${m.text().slice(0, 200)}`));
    page.on("pageerror", (e) => issues.push(`Seitenfehler: ${e.message.slice(0, 200)}`));
    page.on("response", (r) => r.status() >= 400 && issues.push(`HTTP ${r.status()}: ${r.url().replace(BASE, "")}`));
    await page.goto("/anmelden", { waitUntil: "networkidle" });
    await page.getByLabel("E-Mail-Adresse").fill(EMAIL);
    await page.getByLabel("Passwort").fill(PASSWORD);
    await page.getByRole("button", { name: "Anmelden" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/anmelden"));
    await page.waitForLoadState("networkidle");

    for (const shot of SHOTS.filter((s) => !only || only.includes(s.name) || (s.name === "schichten-eingetragen" && only.includes("schichten")))) {
      issues.length = 0;
      try {
        const url = typeof shot.path === "function" ? await shot.path(page) : shot.path;
        issues.length = 0; // Meldungen der Vorbereitung (andere Seiten) zählen nicht
        await page.goto(url, { waitUntil: "networkidle" });
        await shot.steps?.(page);
        await prepare(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);
        const problems = await findProblems(page);
        const docHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        const pageUrl = page.url().replace(BASE, "");

        // 1) ab Seitenanfang
        const file = `${shot.name}.png`;
        const topMarks = await measure(page, shot.marks, { width: VIEW.width, height: VIEW.height, offsetY: 0 });
        await page.screenshot({ path: path.join(OUT, file), type: "png" });
        images.push({ file, width: VIEW.width * SCALE, height: VIEW.height * SCALE, page: pageUrl, variant: "oben", scrollY: 0, description: shot.description, marks: topMarks });

        // 2) ganze Seite (wenn länger als der Bildschirm)
        if (docHeight > VIEW.height + 40) {
          const full = `${shot.name}-ganz.png`;
          // sehr lange Listen nur bis maxHeight (CSS-Pixel) – sonst werden die Bilder zig Megabyte groß
          const height = Math.min(docHeight, shot.maxHeight ?? 6000);
          const fullMarks = await measure(page, shot.marks, { width: VIEW.width, height, offsetY: 0 });
          await page.screenshot({ path: path.join(OUT, full), type: "png", fullPage: true, clip: { x: 0, y: 0, width: VIEW.width, height } });
          images.push({ file: full, width: VIEW.width * SCALE, height: height * SCALE, page: pageUrl, variant: "ganz", scrollY: 0, description: `${shot.description} – ganze Seite${height < docHeight ? ` (die ersten ${height * SCALE} Bildpunkte von ${docHeight * SCALE})` : ""}.`, marks: fullMarks });
        }

        // 3) ab der wichtigen Stelle, direkt unter der Kopfzeile
        if (shot.scrolled && docHeight > VIEW.height + 40) {
          const scrollY = await scrollBelowHeader(page, shot.scrolled.to(page));
          await solidHeader(page);
          const name = `${shot.name}-${shot.scrolled.suffix}.png`;
          const scrolledMarks = await measure(page, shot.marks, { width: VIEW.width, height: VIEW.height, offsetY: 0 });
          await page.screenshot({ path: path.join(OUT, name), type: "png" });
          images.push({ file: name, width: VIEW.width * SCALE, height: VIEW.height * SCALE, page: pageUrl, variant: "gescrollt", scrollY: Math.round(scrollY * SCALE), description: `${shot.description} – ab „${shot.scrolled.suffix}“, Kopfzeile deckend.`, marks: scrolledMarks });
        }
        for (const extra of shot.extras ?? []) {
          const scrollY = await extra.setup(page);
          await solidHeader(page);
          const name = `${shot.name}-${extra.suffix}.png`;
          const extraMarks = await measure(page, shot.marks, { width: VIEW.width, height: VIEW.height, offsetY: 0 });
          await page.screenshot({ path: path.join(OUT, name), type: "png" });
          images.push({ file: name, width: VIEW.width * SCALE, height: VIEW.height * SCALE, page: pageUrl, variant: "gescrollt", scrollY: Math.round((scrollY ?? 0) * SCALE), description: `${shot.description} – ${extra.description}.`, marks: extraMarks });
        }
        const missing = shot.marks.filter((m) => !images.some((img) => img.file.startsWith(shot.name) && img.marks.some((x) => x.id === m.id && x.box)));
        report.push({ name: shot.name, url: pageUrl, height: docHeight, problems: [...problems, ...issues], missing: missing.map((m) => m.id) });
        console.log(
          `${shot.name.padEnd(30)} ${pageUrl}  Höhe ${docHeight}` +
            (problems.length || issues.length ? `  ! ${[...problems, ...issues].join(" | ")}` : "") +
            (missing.length ? `  ? nicht gefunden: ${missing.map((m) => m.id).join(", ")}` : ""),
        );
      } catch (error) {
        console.error(`FEHLER ${shot.name}: ${String(error.message).split("\n")[0]}`);
        process.exitCode = 1;
      }
    }
    // Sicherheitsnetz: Schicht wieder eintragen, falls „schichten-eingetragen“ nicht lief
    if (restoreShift) {
      await page.goto(restoreShift, { waitUntil: "networkidle" });
      const join = page.getByRole("button", { name: "In Getränkestand eintragen", exact: true });
      if (await join.count()) {
        await join.first().click();
        await page.getByRole("button", { name: "Aus Getränkestand austragen", exact: true }).first().waitFor();
      }
      console.log("Schicht „Getränkestand“ wieder eingetragen (wie vorher).");
    }
    await context.close();
  } finally {
    await browser.close();
  }

  // Manifest: neue Einträge ersetzen gleichnamige, übrige bleiben (für --only)
  const kept = (previous.images ?? []).filter((img) => !images.some((n) => n.file === img.file));
  const order = (file) => {
    let best = 999;
    let length = 0;
    SHOTS.forEach((s, i) => {
      if ((file === `${s.name}.png` || file.startsWith(`${s.name}-`)) && s.name.length > length) [best, length] = [i, s.name.length];
    });
    return best;
  };
  const all = [...kept, ...images].sort((a, b) => order(a.file) - order(b.file) || a.file.localeCompare(b.file));
  const manifest = {
    created: new Date().toISOString(),
    source: "VereinsFlow-Demo-App (Datenbank vf_website, Demo-Verein „TSV Musterstadt 1898 e.V.“), angemeldet als Demo-Administratorin „Anna Adler“",
    device: { viewport: VIEW, deviceScaleFactor: SCALE, isMobile: true, hasTouch: true, colorScheme: "light", locale: "de-DE", timezoneId: "Europe/Berlin" },
    units: "Alle Koordinaten in Bildpixeln des jeweiligen PNG (CSS-Pixel × 3), Ursprung oben links. scrollY: Scrollposition der Seite (Bildpixel) beim gescrollten Bild.",
    notes: [
      "Namen nur im Bild ersetzt (DEMO_RENAME aus website/tools/capture-screenshots.mjs): z. B. „Anna Admin“ → „Anna Adler“, „Bernd Vorstand“ → „Bernd Vogt“, „Claudia Abteilungsleiterin“ → „Claudia Abel“.",
      "variant: „oben“ = ab Seitenanfang (1170 × 2532), „ganz“ = ganze Seite (fullPage), „gescrollt“ = ab der wichtigen Stelle direkt unter der Kopfzeile (Kopfzeile deckend).",
      "visible: „teilweise“ = das Element ragt über den Bildrand (z. B. die Reiterleiste der Finanzen, die am Handy breiter als der Bildschirm ist).",
      "Im Spot auszumaskieren (Faktenregeln): Dashboard-Chips „+23 (+11,0 %)“ und „+x gegenüber dem Vormonat“; Finanzen-Karten Kontostand, Überschuss und Spenden.",
      "finanzen-beitraege: Die Zeile „0 per Lastschrift, … per Überweisung“ ist im Bild ausgeblendet (visibility: hidden, Platz bleibt frei).",
      "termin-detail-ganz: Weiter unten stehen die Karten „Helfer“ („keine Helferschichten geplant“) und „Dokumente“ („Noch keine Dokumente hochgeladen.“) – für den Spot termin-detail.png und termin-detail-teilnehmer.png nehmen.",
      "schichten*: Die Schicht „Aufbau“ ist voll und hat deshalb keinen Knopf; in schichten-eingetragen überschneiden sich Grillstand und Kuchenbuffet mit der eigenen Schicht (dort steht der Hinweis statt „Eintragen“).",
      "finanzen-rechnungen: Die grünen Knöpfe „Bezahlt“ sind Aktionen der App (als bezahlt markieren), kein Status.",
      "Inszenierte Demo-Daten: Finanzen aus werkzeuge/finanzen-demo.mjs, Zu-/Absagen des Trainings am 3. Juni 2027 aus werkzeuge/termin-zusagen.mjs, Import-CSV erfunden (nur Vorschau, nichts gespeichert).",
    ],
    images: all,
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  // Prüfbericht (Fehler, Konsolenmeldungen, nicht gefundene Markierungen) – gleichnamige Einträge ersetzt, übrige bleiben
  const reportPath = path.join(HERE, "..", "pruefung", "handy-aufnahmen-bericht.json");
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  let oldReport = [];
  try {
    oldReport = JSON.parse(await fs.readFile(reportPath, "utf8"));
  } catch {
    // erstes Mal
  }
  const merged = [...oldReport.filter((r) => !report.some((n) => n.name === r.name)), ...report];
  merged.sort((a, b) => SHOTS.findIndex((s) => s.name === a.name) - SHOTS.findIndex((s) => s.name === b.name));
  await fs.writeFile(reportPath, `${JSON.stringify(merged, null, 2)}\n`);
  console.log(`\n${images.length} Bilder nach ${OUT}, Manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
