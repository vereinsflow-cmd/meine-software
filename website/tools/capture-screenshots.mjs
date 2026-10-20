// Erzeugt die Produkt-Screenshots der Website aus einer laufenden VereinsFlow-Demo (Seed-Daten).
//
//   node tools/capture-screenshots.mjs                    alle Bilder der Website (hell – die Website ist immer hell)
//   node tools/capture-screenshots.mjs --only dashboard   nur ein Bild (mehrere: --only a,b)
//   node tools/capture-screenshots.mjs --only laptop-finanzen-rechnungen,laptop-finanzen-kassenbuch
//                                                         Bilder, die die Website derzeit nicht zeigt (optional, siehe
//                                                         unten), entstehen nur so – mit ihrem Namen nach --only
//   node tools/capture-screenshots.mjs --scheme dark      dunkle Darstellung (wird derzeit nicht verwendet)
//
// Voraussetzungen: Die Demo-App läuft (Standard http://localhost:3000, `npm run dev:all` im Ordner der App), der
// Demo-Verein ist mit tools/demo-vorbereiten.mjs aufgefüllt (für die Laptop-Bilder der Finanzen zusätzlich mit
// finanzen-demo.mjs aus dem Reel-Projekt, siehe README), und im App-Ordner sind Playwright und sharp installiert.
// Ist nur Edge (kein Chromium) installiert, funktioniert das Skript trotzdem: es startet standardmäßig den Kanal
// „msedge“ (änderbar mit VF_BROWSER_CHANNEL); fehlt Edge, nimmt es das Chromium von Playwright.
//
// Bildqualität: Jede Datei wird in ihrer Breite eigens gezeichnet – der Browser rendert den Ausschnitt mit genau der
// Pixeldichte, die diese Breite ergibt (680 px aus 960 CSS-Pixeln = 0,708-fach), statt ein großes Bild herunterzurechnen.
// Schrift und Linien sitzen so auf ganzen Pixeln wie in einem echten Browser mit dieser Dichte; gespeichert wird
// verlustfrei (WebP lossless bzw. near-lossless, je nachdem, was kleiner ist) – keine Kompressionsschleier an der Schrift.
//
// Umgebungsvariablen (alle optional):
//   VF_APP_DIR         Ordner mit node_modules (Playwright, sharp)  (Standard: der übergeordnete Ordner = Repository-Hauptordner)
//   VF_APP_URL         Adresse der laufenden Demo                 (http://localhost:3000)
//   VF_DEMO_EMAIL      Demo-Benutzer (Vereinsadmin)               (admin@demo-verein.local)
//   VF_DEMO_PASSWORD   Passwort der Demo-Benutzer, siehe SEED_PASSWORD in der .env der App
//   VF_BROWSER_CHANNEL Browserkanal für Playwright                (msedge, ersatzweise chromium)
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

/**
 * Browserfenster der Website (Detailbilder der vier Reiter „Im Detail“, 4 : 3): Auf dem Rechner stehen sie 680 CSS-Pixel
 * breit – 680 und 1360 sind genau die einfache und doppelte Pixeldichte, der Browser zeichnet sie Pixel für Pixel. 960 für
 * 1,25-fache Dichte und schmalere Fenster, 1920 für Tablets und Smartphones (92 % der Breite bei zwei- bis dreifacher Dichte).
 * Die Karten Mitglieder und Auswertungen unter „Funktionen“ zeigen dieselben Bilder 620 CSS-Pixel breit und nehmen so
 * dieselben Dateien (680 bzw. 1360). Andere Bilder nennen eigene `widths`. `scale`: Pixeldichte beim Bedienen
 * (Klicken, Tippen); die Dateien selbst entstehen je Breite mit passender Dichte (siehe capture).
 */
const DESKTOP = { viewport: { width: 1280, height: 800 }, scale: 2, widths: [680, 960, 1360, 1920] };
/**
 * Telefonbilder: je Bild die 1-, 1,5-, 2- und 3-fache Breite des Bildschirms, in dem es auf der Website steht (siehe
 * .phone in site.css: Abschnitt „Mobil“ 260 CSS-Pixel, Kapitel 208 (bzw. 182), Vorführung 312 – dort je Bild eigene
 * `widths`), dazu 260, 520 und 780 für das Smartphone (dort sind die Bildschirme 260 px breit). So zeichnet der Browser das
 * Bild Pixel für Pixel, statt es selbst unscharf umzurechnen. Geänderte Größen hier, in site.css und in „sizes“ im HTML
 * angleichen.
 */
const PHONE = { viewport: { width: 390, height: 844 }, scale: 3, widths: [260, 390, 520, 780] };
/**
 * Laptop der Vorführung „Am Rechner“ (.laptop-screen, 16 : 10): das ganze Fenster der Anwendung (1280 × 800, schmale
 * Seitenleiste wie in der Anwendung voreingestellt). Auf der Website je nach Fensterhöhe 550 bis 880 CSS-Pixel breit
 * (`min(880px, 80vw, (100vh − 218px) · 0,98)`): 720 und 880 für einfache Dichte (Full HD bzw. 1440p), 960 für
 * Smartphones (gut 300 CSS-Pixel bei dreifacher Dichte), 1340 und 1760 für Bildschirme mit doppelter Dichte (MacBook:
 * 570 bis 770 CSS-Pixel). 1340 statt 1320: Im häufigen Fenster 1440 × 900 ist der Laptop 668 CSS-Pixel breit, bei
 * doppelter Dichte also 1337 – mit 1320 nahm der Browser die 1760er Datei und rechnete sie um ein Drittel herunter.
 * Die Karte „Finanzen“ unter „Funktionen“ zeigt dasselbe Bild 670 CSS-Pixel breit und nimmt so dieselben Dateien.
 */
const LAPTOP = { viewport: { width: 1280, height: 800 }, widths: [720, 880, 960, 1340, 1760] };
/**
 * Sichtbarer Teil des Telefonbildschirms auf der Website: zwischen Statusleiste und Home-Balken (.phone-screen picture
 * in site.css: 26/28 der Gerätebreite, 90 % der Bildschirmhöhe) – bei 390 Punkten Breite 760 hoch. Aufnahmen in dieser
 * Größe erscheinen vollständig; bei 844 schneidet der Rahmen unten gut 80 Punkte ab.
 */
const PHONE_SCREEN = { width: 390, height: 760 };

/**
 * Speichert eine Aufnahme: WebP verlustfrei oder near-lossless (Stufe 60 – nur in unruhigen Flächen werden Farbwerte um
 * wenige Stufen gerundet, Schriftkanten bleiben exakt); genommen wird die kleinere Datei, verlustfrei aber schon, wenn sie
 * höchstens 10 % größer ist. Bildschirmfotos mit flächigen Farben sind so meist sogar kleiner als die frühere
 * verlustbehaftete Fassung (Qualität 82), die an der Schrift Schlieren und Farbsäume zeigte.
 * `allowLossy` (nur Einzelbilder): Bei großen Farbverläufen (Kacheln des Dashboards, weichgezeichneter Hintergrund hinter
 * der Suche) wird verlustfrei sehr groß – ist es mehr als 1,5-mal so groß wie Qualität 92 mit voller Farbauflösung
 * (smartSubsample), wird diese genommen; die Schrift bleibt dank der Aufnahme in Zielgröße scharf. Bildfolgen bleiben
 * immer verlustfrei: Nur so sind unveränderte Flächen in allen Bildern Pixel für Pixel gleich und flimmern beim
 * Überblenden nicht.
 */
async function encode(png, { allowLossy = false } = {}) {
  const [lossless, near, lossy] = await Promise.all([
    sharp(png).webp({ lossless: true, effort: 6 }).toBuffer(),
    sharp(png).webp({ nearLossless: true, quality: 60, effort: 6 }).toBuffer(),
    allowLossy ? sharp(png).webp({ quality: 92, smartSubsample: true, effort: 6 }).toBuffer() : null,
  ]);
  const exact = lossless.length <= near.length * 1.1 ? lossless : near;
  return lossy && exact.length > lossy.length * 1.5 ? lossy : exact;
}

/** CDP-Sitzung je Seite (für die Aufnahme mit passender Pixeldichte). */
const cdpSessions = new WeakMap();

/**
 * Nimmt den Ausschnitt (`clip` in CSS-Pixeln, sonst das ganze Fenster) in jeder Breite einzeln auf: Für jede Breite stellt
 * der Browser die Pixeldichte so ein, dass der Ausschnitt genau so breit wird, und zeichnet neu. Am Layout ändert das
 * nichts (es rechnet in CSS-Pixeln), Mauszeiger, Fokus und offene Dialoge bleiben. Danach gilt wieder die Dichte der
 * Sitzung. Ergibt das Runden eine um ein Pixel abweichende Breite, wird auf die genaue Breite gebracht.
 */
async function capture(page, clip, widths, spec) {
  const viewport = page.viewportSize();
  const area = clip ?? { x: 0, y: 0, width: viewport.width, height: viewport.height };
  let cdp = cdpSessions.get(page);
  if (!cdp) {
    cdp = await page.context().newCDPSession(page);
    cdpSessions.set(page, cdp);
  }
  const mobile = spec === PHONE;
  const metrics = (deviceScaleFactor) => ({
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor,
    mobile,
    screenWidth: viewport.width,
    screenHeight: viewport.height,
    ...(mobile ? { screenOrientation: { angle: 0, type: "portraitPrimary" } } : {}),
  });
  const shots = new Map();
  try {
    for (const width of widths) {
      await cdp.send("Emulation.setDeviceMetricsOverride", metrics(width / area.width));
      // neu zeichnen lassen; Bilder der Seite (Logo, Avatare) laden je nach Dichte eine andere Größe nach (höchstens
      // 3 s warten – Bilder mit loading="lazy" außerhalb des Fensters laden nie)
      await page.evaluate(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const pending = [...document.images].filter((img) => !img.complete && img.loading !== "lazy");
        const loaded = pending.map(
          (img) =>
            new Promise((done) => {
              img.addEventListener("load", done, { once: true });
              img.addEventListener("error", done, { once: true });
            }),
        );
        await Promise.race([Promise.all(loaded), new Promise((resolve) => setTimeout(resolve, 3000))]);
      });
      await page.waitForTimeout(250);
      // Page.captureScreenshot misst den Ausschnitt ab dem Anfang des Dokuments, nicht des Fensters (wie Playwright
      // selbst: Scrollstand dazurechnen – nach dem Umstellen der Dichte, die ihn auf ganze Pixel runden kann)
      const { cssVisualViewport: scrolled } = await cdp.send("Page.getLayoutMetrics");
      const region = { ...area, x: area.x + scrolled.pageX, y: area.y + scrolled.pageY, scale: 1 };
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png", clip: region });
      let png = Buffer.from(data, "base64");
      const { width: got } = await sharp(png).metadata();
      if (got !== width) png = await sharp(png).resize({ width, kernel: "lanczos3" }).png().toBuffer();
      shots.set(width, png);
    }
  } finally {
    await cdp.send("Emulation.setDeviceMetricsOverride", metrics(spec.scale));
  }
  return shots;
}

/**
 * Gibt die CDP-Sitzung von capture frei. Nötig, bevor sich die Fenstergröße ändert: Chrome wendet die Einstellung der
 * Sitzung bei jedem Seitenwechsel erneut an und überschriebe damit die neue Größe von Playwright (gesehen am 18.10.2026:
 * nach dem Laptop-Bild 1280 statt 1249 px). Innerhalb einer Bildfolge stimmt sie mit Playwright überein (siehe capture).
 */
async function releaseCapture(page) {
  const cdp = cdpSessions.get(page);
  if (!cdp) return;
  cdpSessions.delete(page);
  await cdp.detach().catch(() => {});
}

/** Schreibt alle Breiten einer Aufnahme; gibt die Maße der größten zurück (für die Ausgabe). */
async function save(shots, name, scheme, { allowLossy = false } = {}) {
  let largest = { width: 0, height: 0 };
  for (const [width, png] of shots) {
    await fs.writeFile(path.join(out, `${name}-${scheme}-${width}.webp`), await encode(png, { allowLossy }));
    const meta = await sharp(png).metadata();
    if (meta.width > largest.width) largest = { width: meta.width, height: meta.height };
  }
  return largest;
}

/**
 * Detailbilder: Ausschnitt rechts neben der Seitenleiste, 960 × 720 CSS-Pixel (4 : 3, bei doppelter Auflösung
 * 1920 × 1440). Das Fenster ist so breit, dass neben der Seitenleiste (17 rem bei 17 px Grundschrift = 289 px) genau
 * 960 px Inhalt stehen – knapp unter 1280 px, sonst blendet die Mitgliederliste eine zusätzliche Kontaktspalte ein und
 * wird zu breit. Über 820 px Höhe gelten die normalen (nicht die gestauchten) Abstände der Anwendung. So erscheint die
 * Oberfläche auf der Website gut ein Drittel größer als bei einer Aufnahme des ganzen Fensters. Der Ausschnitt beginnt ein
 * Pixel rechts der Seitenleiste (contentLeft) – bei Pixeldichten wie 1,4167 fiele sonst ein halbes Pixel der dunklen
 * Leiste als Strich an den linken Bildrand –, das Fenster ist dafür ein Pixel breiter.
 */
const DETAIL = { width: 1250, height: 900 };
const CONTENT_CROP = { width: 960, height: 720 };
/**
 * Zentrale Suche: Der Dialog steht in der Mitte des Fensters. So breit, dass ein 960 px breiter Ausschnitt um den Dialog
 * genau an der Seitenleiste (289 px) beginnt – im Bild steht die Seitenleiste dann gar nicht statt angeschnitten.
 */
const SEARCH = { width: 2 * 289 + CONTENT_CROP.width, height: 800 };

/** Linker Rand der Ausschnitte rechts neben der Seitenleiste: ein Pixel Abstand zu ihr (siehe DETAIL). */
const contentLeft = (page) => page.evaluate(() => Math.ceil(document.querySelector("aside")?.getBoundingClientRect().right ?? -1) + 1);

/** Ein Klick auf den ersten Link mit diesem Text; wartet, bis die neue Seite wirklich da und ruhig ist. */
const followLink = (name) => async (page) => {
  const before = new URL(page.url()).pathname;
  await page.getByRole("link", { name }).first().click();
  await page.waitForURL((url) => url.pathname !== before);
  await page.waitForLoadState("networkidle");
};

/**
 * Blendet Textzeilen mit genau diesem Inhalt aus (der Platz bleibt frei, nichts verrutscht). Für die Kennzahl
 * „Helferstunden“: Sind in den letzten zwei Wochen keine Stunden dazugekommen, steht unter der Jahressumme „Noch keine
 * Stunden erfasst“ – im Bild wirkt das wie ein Widerspruch zu „9 Std.“.
 */
const hideText = (text) => async (page) => {
  const pattern = text instanceof RegExp ? [text.source, text.flags] : null;
  await page.evaluate(([wanted, regex]) => {
    const matches = regex ? (t) => new RegExp(regex[0], regex[1]).test(t) : (t) => t === wanted;
    for (const el of document.querySelectorAll("p, span, div")) {
      if (el.children.length === 0 && matches(el.textContent?.replace(/\s+/g, " ").trim() ?? "")) {
        el.style.setProperty("visibility", "hidden");
      }
    }
  }, [pattern ? null : text, pattern]);
};

/**
 * Seitenleiste am Rechner (ab 1024 px): Seit 17.10.2026 zeigt die Anwendung standardmäßig die schmale, dunkle
 * Symbolleiste; wer sie ausklappt, bekommt die breite mit Text (gemerkt in localStorage, `vf:sidebar-breit`). Die
 * Ausschnitte rechts neben der Seitenleiste (Detailbilder, Suche, Helferplan) entstehen mit der breiten Leiste: Dann ist der
 * Inhalt genau so breit wie früher (960 CSS-Pixel bei 1249 px Fenster), und die graue Markierung des aktiven Eintrags,
 * die bei der schmalen Leiste über deren Rand ragt, liegt nicht im Bild. Ganze Fenster (Laptop, Einstieg) zeigen die
 * schmale Leiste wie die Anwendung selbst.
 */
async function setSidebar(page, mode) {
  await page.evaluate((wide) => {
    try {
      localStorage.setItem("vf:sidebar-breit", wide ? "1" : "0");
    } catch {
      // ohne Speicher bleibt die schmale Leiste
    }
  }, mode === "breit");
}

/** Wartet, bis die Seitenleiste ihre gemerkte Breite hat (sie liest sie erst nach dem Laden) und der Übergang vorbei ist. */
async function waitForSidebar(page) {
  if ((page.viewportSize()?.width ?? 0) < 1024) return; // darunter gibt es keine feste Seitenleiste
  const ok = await page
    .waitForFunction(
      () => {
        const aside = document.querySelector("aside");
        if (!aside) return true;
        const wide = localStorage.getItem("vf:sidebar-breit") === "1";
        const width = aside.getBoundingClientRect().width;
        return wide ? width > 200 : width < 160;
      },
      undefined,
      { timeout: 10_000 },
    )
    .then(() => true, () => false);
  if (!ok) console.error("WARNUNG: Seitenleiste hat nicht die erwartete Breite");
  await page.waitForTimeout(350); // Übergang der Spaltenbreite (200 ms)
}

/** Öffnet eine Seite der Anwendung und wartet, bis sie ruhig ist (auch die Seitenleiste). */
async function gotoApp(page, url) {
  await page.goto(url, { waitUntil: "networkidle" });
  await waitForSidebar(page);
}

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

/**
 * Telefon: scrollt so, dass das gesuchte Element direkt unter dem beginnt, was oben fest stehen bleibt – der Kopfzeile
 * der Anwendung, auf dem Dashboard auch der Reiterleiste –, `gap` Punkte darunter. So steht im sichtbaren Teil des
 * Telefonbilds, worum es geht, statt Kopfbereich und Schaltflächen.
 */
const scrollBelowHeader = (locate, { gap = 16 } = {}) => async (page) => {
  const target = locate(page).first();
  await target.waitFor();
  const top = await target.evaluate((node, space) => {
    const y = node.getBoundingClientRect().top + window.scrollY;
    let covered = 0;
    for (const bar of document.querySelectorAll("body *")) {
      const style = getComputedStyle(bar);
      if (style.position !== "sticky" && style.position !== "fixed") continue;
      const box = bar.getBoundingClientRect();
      if (!box.height || box.height > innerHeight / 3 || bar.contains(node)) continue;
      // oben haftend: „top“ gesetzt (unten haftende Leisten zählen nicht) und im Dokument über dem Ziel
      if (style.position === "sticky" && (style.top === "auto" || box.top + window.scrollY > y)) continue;
      const stuck = style.position === "fixed" ? box.top : Number.parseFloat(style.top);
      if (stuck > 8 + covered) continue;
      covered = Math.max(covered, stuck + box.height);
    }
    return y - covered - space;
  }, gap);
  await page.evaluate((y) => window.scrollTo(0, Math.max(0, y)), top);
  await page.waitForTimeout(400);
};

/**
 * Telefon: Die Kopfzeile der Anwendung ist leicht durchsichtig und zeichnet weich, was darunter liegt. Beginnt das Bild
 * mitten in der Seite, schiene dort die vorige Karte als farbiger Fleck durch (rotes „Löschen“ neben dem Vereinsnamen) –
 * für diese Bilder dieselbe Farbe, nur deckend.
 */
const solidHeader = async (page) => {
  await page.evaluate(() => {
    const header = document.querySelector("header");
    if (!header) return;
    const color = getComputedStyle(header).backgroundColor.replace(/\s*\/\s*[\d.]+%?\)$/, ")").replace(/^rgba\((.+),\s*[\d.]+\)$/, "rgb($1)");
    header.style.setProperty("background-color", color, "important");
    header.style.setProperty("backdrop-filter", "none", "important");
  });
};

/**
 * Auswertungen (Rechner und Telefon): Wie solidHeader, dazu die oben haftende Reiterleiste des Dashboards. Ihre Schiene
 * ist ebenfalls leicht durchsichtig – darunter schienen Kopf und Knopf der Karte durch („Einklappen ×“, „Entwicklung der
 * Mitglieder“). Durchsichtige Flächen werden deckend in derselben Farbe; die Leiste selbst (am Telefon über die ganze
 * Breite, sonst durchsichtig) bekommt die Farbe des Seitengrunds.
 */
const solidBars = async (page) => {
  await page.evaluate(() => {
    const alpha = (color) => {
      const slash = color.match(/\/\s*([\d.]+)(%?)\)$/);
      if (slash) return slash[2] ? Number(slash[1]) / 100 : Number(slash[1]);
      const rgba = color.match(/^rgba\((?:[^,]+,){3}\s*([\d.]+)\)$/);
      return rgba ? Number(rgba[1]) : 1;
    };
    const opaque = (color) => color.replace(/\s*\/\s*[\d.]+%?\)$/, ")").replace(/^rgba\((.+),\s*[\d.]+\)$/, "rgb($1)");
    const pageColor = (() => {
      for (let el = document.querySelector("main"); el; el = el.parentElement) {
        const color = getComputedStyle(el).backgroundColor;
        if (alpha(color) > 0) return opaque(color);
      }
      return "rgb(255, 255, 255)";
    })();
    const bars = [...document.querySelectorAll("body *")].filter((el) => {
      const style = getComputedStyle(el);
      return el.tagName !== "ASIDE" && style.position === "sticky" && style.top !== "auto" && el.getBoundingClientRect().top < innerHeight / 3;
    });
    for (const bar of bars) {
      // nur die Leiste und Flächen mit Weichzeichner darin (nicht etwa die getönte Fläche hinter den Initialen)
      for (const el of [bar, ...bar.querySelectorAll("*")]) {
        const style = getComputedStyle(el);
        if (el !== bar && style.backdropFilter === "none") continue;
        const a = alpha(style.backgroundColor);
        if (a > 0 && a < 1) el.style.setProperty("background-color", opaque(style.backgroundColor), "important");
        el.style.setProperty("backdrop-filter", "none", "important");
      }
      if (bar.tagName !== "HEADER" && alpha(getComputedStyle(bar).backgroundColor) === 0) {
        bar.style.setProperty("background-color", pageColor, "important");
      }
    }
  });
};

/**
 * Rechner: Blendet aus, was in der Seite über der Karte mit dieser Überschrift steht (der Platz bleibt). Neben der
 * schmalen Reiterleiste läge sonst der untere Rand der vorigen Karte im Bild – sie ist fast ganz unter die Kopfzeile
 * gerollt.
 */
const hideAboveCard = (title) => async (page) => {
  await page.evaluate((text) => {
    const heading = [...document.querySelectorAll("h1, h2, h3, [data-slot='card-title']")].find(
      (el) => el.textContent?.trim() === text,
    );
    const card = heading?.closest("[data-slot='card']") ?? heading;
    const main = document.querySelector("main");
    if (!card || !main) return;
    const top = card.getBoundingClientRect().top;
    for (let node = card; node && node !== main; node = node.parentElement) {
      for (let before = node.previousElementSibling; before; before = before.previousElementSibling) {
        const style = getComputedStyle(before);
        if (style.position === "sticky" || style.position === "fixed" || before.querySelector("[role='tablist']")) continue;
        if (before.getBoundingClientRect().bottom <= top) before.style.setProperty("visibility", "hidden");
      }
    }
  }, title);
};

/**
 * Bricht ab, wenn das Dashboard noch die Einrichtungs-Checkliste („Erste Schritte“) oder Finanzen zeigt – dann fehlt
 * tools/demo-vorbereiten.mjs (der Einstieg soll den Vereinsüberblick mit Kennzahlen zeigen; die Finanzen zeigt der Laptop).
 */
const assertPreparedDashboard = async (page) => {
  for (const title of ["Erste Schritte", "Offene Zahlungen"]) {
    if (await page.getByText(title, { exact: true }).count()) {
      throw new Error(`„${title}“ im Dashboard – zuerst node tools/demo-vorbereiten.mjs ausführen`);
    }
  }
};

/**
 * Mitglieder-Karte des Dashboards: Das Schild „Start · 211“ am Anfang der Verlaufslinie überdeckt in diesen Breiten die
 * Achsenbeschriftung „Okt 25“ (Darstellungsfehler der Anwendung, Stand 18.10.2026) – im Bild ausgeblendet.
 */
const hideStartChip = hideText(/^Start · [\d.]+$/);

/**
 * Gruß des Dashboards: Seit Oktober 2026 grüßt die Anwendung nach der Tageszeit („Guten Morgen/Tag/Abend“, Uhrzeit in
 * Deutschland). Im Bild steht immer „Guten Tag“ – sonst hinge der Gruß auf der Website an der Uhrzeit der Aufnahme.
 */
const neutralGreeting = async (page) => {
  await page.evaluate(() => {
    for (const h of document.querySelectorAll("h1")) {
      const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) n.nodeValue = n.nodeValue.replace(/^Guten (Morgen|Abend)\b/, "Guten Tag");
    }
  });
};

/** Montags stehen in der laufenden Woche noch keine Helferstunden – „−100 % gegenüber letzter Woche“ sagt dann nichts. */
const hideWeekComparison = async (page) => {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll("p, span, div")) {
      if (el.children.length === 0 && /^[−-]100\s*%\s*gegenüber letzter Woche$/.test(el.textContent?.trim() ?? "")) {
        el.style.setProperty("visibility", "hidden");
      }
    }
  });
};

/** Erstes Blatt des Aushangs „Helferplan Sommerfest …“ in der Vorschau der Druckseite (siehe helferplan-druck). */
const printSheet = (page) =>
  page
    .locator("#helferplan-ausdruck section")
    .filter({ has: page.getByRole("heading", { name: /^Helferplan Sommerfest 20\d\d$/ }) })
    .locator(":scope > div")
    .first();

/** Bricht ab, wenn die Finanzen noch nicht eingerichtet sind (dann fehlt finanzen-demo.mjs, siehe README). */
const assertFinance = async (page) => {
  for (const title of ["Kassenbuch einrichten", "Noch keine Buchungen"]) {
    if (await page.getByText(title, { exact: true }).count()) {
      throw new Error(`„${title}“ in den Finanzen – zuerst finanzen-demo.mjs ausführen (README, „Hinweise zu den Aufnahmen“)`);
    }
  }
};

/**
 * Warnt vor allem, was nicht ins Bild gehört: Fehlermeldungen der Anwendung oder von Next.js und Zusagen, die die
 * Website nicht macht (Lastschrift/SEPA). Geprüft wird nur sichtbarer Text im Ausschnitt.
 */
async function checkProblems(page, clip, name) {
  const found = await page.evaluate((area) => {
    const words = [/Application error/, /Unhandled Runtime Error/, /Internal Server Error/, /Etwas ist schiefgelaufen/, /Lastschrift/, /\bSEPA\b/];
    const box = area ?? { x: 0, y: 0, width: innerWidth, height: innerHeight };
    const hits = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      const text = node.nodeValue ?? "";
      if (!el || !words.some((word) => word.test(text))) continue;
      const r = el.getBoundingClientRect();
      const inside = r.width && r.right > box.x && r.left < box.x + box.width && r.bottom > box.y && r.top < box.y + box.height;
      const style = getComputedStyle(el);
      if (inside && style.visibility !== "hidden" && style.display !== "none") hits.add(text.trim().slice(0, 60));
    }
    if (document.querySelector("nextjs-portal")?.shadowRoot?.querySelector("[data-nextjs-dialog], [data-nextjs-error-overlay]")) {
      hits.add("Fehleranzeige von Next.js");
    }
    return [...hits];
  }, clip);
  if (found.length) {
    console.error(`WARNUNG ${name}: im Bild: ${found.join(" | ")}`);
    process.exitCode = 1;
  }
}

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
 * Die Schicht „Getränkestand“ im Helferplan (seit 03.10.2026 „Tagesablauf“: Zeitleiste und darunter eine Liste mit
 * einem Eintrag je Schicht), ihre Knöpfe und ein einheitlicher Ausgangszustand für die Bilder.
 */
const GETRAENKE = { row: "Schicht Getränkestand", join: "In Getränkestand eintragen", leave: "Aus Getränkestand austragen" };
const drinksRow = (page) => page.getByRole("listitem", { name: GETRAENKE.row, exact: true });
const drinksButton = (page, name) => drinksRow(page).getByRole("button", { name, exact: true });
/**
 * Klappt zu, was der Helferplan beim Laden aufklappt (die nächste eigene Schicht – je nach Stand Aufbau oder
 * Getränkestand). Zugeklappt sind alle Einträge vorher und nachher gleich hoch, die Bilder passen übereinander; der
 * eigene Name steht dann als „Name (du)“ in der Zeile (aufgeklappt stünde er mit einem Schild „Du“ untereinander).
 */
const collapseShifts = async (page) => {
  const open = page.locator("main ul > li h3 button[aria-expanded='true']");
  while (await open.count()) {
    await open.first().click();
    await page.waitForTimeout(100);
  }
};

/**
 * Bildfolge für das Live-Fenster im Kapitel „Helferschichten“ (site.css „Live-Fenster“): Ein Mauszeiger zeigt auf
 * „Neue Schicht“, trägt sich beim Getränkestand ein und geht zu „Drucken“. Aufgenommen werden
 *   schichten-live-1  vorher (Getränkestand „2 von 4“, Schaltfläche „Eintragen“)
 *   schichten-live-5  vorher, Zeiger über „Neue Schicht“ (Schritt 1 „Schichten anlegen“)
 *   schichten-live-2  vorher, Zeiger über „Eintragen“
 *   schichten-live-3  nachher („3 von 4“, eigener Name als „Name (du)“, „Du“ am Balken der Zeitleiste), Zeiger über
 *                     „Austragen“ (steht an derselben Stelle)
 *   schichten-live-4  nachher, Zeiger über „Drucken“
 *   schichten         nachher ohne Zeiger – das bekannte Kapitelbild (ohne JavaScript, bei reduzierter Bewegung)
 * Alle als derselbe Ausschnitt rechts neben der Seitenleiste: vom Kopf des Helferplans (Titel, „Neue Schicht“,
 * „Drucken“) über die Zeitleiste bis unter die Schicht „Getränkestand“ (planArea) – so zeigt das Fenster auf der Website
 * nur, worum es geht, statt Seitenleiste und leerer Fläche. Alle Schichten sind zugeklappt (collapseShifts).
 * Die Demo-Datenbank ändert sich dabei nur kurz: Der Administrator trägt sich aus und wieder ein, am Ende ist alles wie
 * vorher. Nach jedem Klick wird die Seite neu geladen – das Umbenennen im Bild (normalizeDemoNames) verändert die Seite,
 * die Anwendung soll danach nichts mehr darauf aufbauen. Die Positionen der Schaltflächen (in Prozent des Ausschnitts)
 * stehen in der Ausgabe; sie gehören nach site.js (LIVE_SCENES.schichten).
 */
async function liveFrames(page, snap) {
  const url = page.url();
  const button = (name) => drinksButton(page, name);
  const action = (name) => page.getByRole("button", { name, exact: true }).or(page.getByRole("link", { name, exact: true })).first();
  const fresh = async () => {
    await gotoApp(page, url);
    await drinksRow(page).waitFor();
    await collapseShifts(page);
  };
  const toggle = async (from, to) => {
    await fresh();
    // einmal neu laden und wiederholen, falls der Knopf noch nicht klickbar ist (gesehen: erster Klick nach dem Wechsel
    // von den Laptop-Bildern lief in die Zeitüberschreitung)
    await button(from).click({ timeout: 15_000 }).catch(async () => {
      await fresh();
      await button(from).click();
    });
    await button(to).waitFor();
    await page.waitForLoadState("networkidle");
    await fresh();
  };
  // Ausschnitt: rechts neben der Seitenleiste bis zum Fensterrand, vom Titel bis zum Ende des Eintrags „Getränkestand“
  // in der Karte „Tagesablauf“. Oben nichts vom Rücklink „Helferplanung“ (der unterste Link über dem Titel).
  const planArea = async () => {
    const x = await contentLeft(page);
    const title = await page.locator("main h1").first().boundingBox();
    const shift = await drinksRow(page).boundingBox();
    if (!title) throw new Error("Titel des Helferplans nicht gefunden");
    if (!shift) throw new Error("Schicht „Getränkestand“ nicht gefunden");
    // oben 16 px Luft über dem Titel, aber nichts vom Rücklink „Helferplanung“ darüber; unten genau bis zum Ende des
    // Eintrags – die Trennlinie zur nächsten Schicht bleibt draußen, die Karte läuft unten offen aus
    const back = await page.evaluate(
      ([left, top]) =>
        Math.max(
          0,
          ...[...document.querySelectorAll("a")]
            .map((link) => link.getBoundingClientRect())
            .filter((box) => box.width && box.left >= left && box.bottom <= top)
            .map((box) => box.bottom),
        ),
      [x, title.y],
    ).catch(() => 0);
    const y = Math.max(0, Math.floor(title.y - 16), Math.ceil(back + 1));
    return { x, y, width: page.viewportSize().width - x, height: Math.floor(shift.y + shift.height) - y };
  };
  // Ausgangslage: nicht eingetragen (erst prüfen, wenn die Liste da ist – die Seite zeigt zunächst Platzhalter)
  await fresh();
  if (await button(GETRAENKE.leave).count()) await toggle(GETRAENKE.leave, GETRAENKE.join);
  const clip = await planArea();
  // Leerer Rand des Ausschnitts neben Titel und Karte: Nur so weit dürfen Telefon und Blatt auf der Website über das
  // Fenster reichen (site.css, --story-lap und --story-tuck, ausgelegt auf gut 3 % je Seite)
  const margin = await drinksRow(page).evaluate((row, area) => {
    const card = (row.closest("section") ?? row).getBoundingClientRect(); // die Karte „Tagesablauf“
    const title = document.querySelector("main h1")?.getBoundingClientRect() ?? card;
    const left = Math.min(card.left, title.left) - area.x;
    const right = area.x + area.width - card.right;
    return `links ${((left / area.width) * 100).toFixed(1)} %, rechts ${((right / area.width) * 100).toFixed(1)} %`;
  }, clip);
  await page.mouse.move(0, 0);
  await snap("schichten-live-1", { clip });
  const add = await spot(page, action("Neue Schicht"), clip);
  await page.mouse.move(add.x, add.y);
  await snap("schichten-live-5", { clip });
  const join = await spot(page, button(GETRAENKE.join), clip);
  await page.mouse.move(join.x, join.y);
  await snap("schichten-live-2", { clip });
  // Eintragen – danach steht „Austragen“ an derselben Stelle unter dem Zeiger
  await toggle(GETRAENKE.join, GETRAENKE.leave);
  const after = await planArea();
  if (JSON.stringify(after) !== JSON.stringify(clip)) {
    console.error(`WARNUNG schichten: Ausschnitt nachher ${JSON.stringify(after)} statt ${JSON.stringify(clip)} – die Bilder passen nicht übereinander`);
    process.exitCode = 1;
  }
  const leave = await spot(page, button(GETRAENKE.leave), clip);
  await page.mouse.move(leave.x, leave.y);
  await snap("schichten-live-3", { clip });
  const print = await spot(page, action("Drucken"), clip);
  await page.mouse.move(print.x, print.y);
  await snap("schichten-live-4", { clip });
  await page.mouse.move(0, 0);
  await snap("schichten", { clip });
  console.log(
    `      Positionen: Neue Schicht ${add.at}, Eintragen ${join.at} (Austragen ${leave.at}), Drucken ${print.at}` +
      ` · Ausschnitt ${clip.width}×${clip.height} ab ${clip.x}/${clip.y} · Rand neben den Karten ${margin}`,
  );
}

/**
 * Telefon im Kapitel „Helferschichten“: dieselbe Schicht „Getränkestand“ wie im Live-Fenster daneben, vorher und
 * nachher – site.js blendet im Telefon um, sobald der Mauszeiger im Fenster auf „Eintragen“ klickt, damit beide immer
 * denselben Stand zeigen:
 *   phone-schichten-live-1  vorher („2 von 4“, „Eintragen“)
 *   phone-schichten         nachher („3 von 4“, eigener Name als „Name (du)“, „Austragen“) – das ruhige Bild
 * Beide ab der Schicht direkt unter der Kopfzeile, alle Schichten zugeklappt (collapseShifts). Wie bei liveFrames trägt
 * sich der Administrator kurz aus und wieder ein; am Ende ist er eingetragen. Die Ausgabe nennt, wo „Eintragen“ im Bild
 * „vorher“ liegt – dort tippt auf dem Smartphone der Finger (site.css, .story-tap).
 */
async function phoneFrames(page, snap) {
  const url = page.url();
  const shift = () => drinksRow(page);
  const button = (name) => drinksButton(page, name);
  const fresh = async () => {
    await gotoApp(page, url);
    await shift().waitFor();
    await collapseShifts(page);
  };
  const toggle = async (from, to) => {
    await fresh();
    // einmal neu laden und wiederholen, falls der Knopf noch nicht klickbar ist (gesehen: erster Klick nach dem Wechsel
    // von den Laptop-Bildern lief in die Zeitüberschreitung)
    await button(from).click({ timeout: 15_000 }).catch(async () => {
      await fresh();
      await button(from).click();
    });
    await button(to).waitFor();
    await page.waitForLoadState("networkidle");
  };
  const frame = async (name) => {
    await fresh();
    await scrollBelowHeader(() => shift(), { gap: 12 })(page);
    await solidHeader(page);
    const join = (await button(GETRAENKE.join).count()) ? await spot(page, button(GETRAENKE.join)) : null;
    await snap(name);
    return join;
  };
  await fresh(); // erst prüfen, wenn die Liste da ist (die Seite zeigt zunächst Platzhalter)
  if (await button(GETRAENKE.leave).count()) await toggle(GETRAENKE.leave, GETRAENKE.join);
  const join = await frame("phone-schichten-live-1");
  await toggle(GETRAENKE.join, GETRAENKE.leave);
  await frame("phone-schichten");
  if (join) console.log(`      Positionen: Eintragen ${join.at} (Fingertipp, .story-tap in site.css)`);
}

/**
 * Zentrale Suche: Hinter dem Dialog liegt die Seite leicht abgedunkelt und weichgezeichnet (bg-black/10, blur 4 px). Im
 * verlustfrei gespeicherten Bild kostet dieses weiche Muster mehr als der Dialog selbst (18.10.2026: knapp 100 statt gut
 * 40 KB je Bild bei doppelter Dichte). Im Bild ist die Abdunkelung deshalb eine ruhige, deckende Fläche in genau der
 * Farbe, die sie über dem Seitengrund hat.
 */
const flatBackdrop = async (page) => {
  await page.evaluate(() => {
    const overlay = document.querySelector("[data-slot='dialog-overlay']");
    if (!overlay) throw new Error("Abdunkelung hinter dem Dialog nicht gefunden");
    // Farbe der Abdunkelung über dem Seitengrund – der Browser mischt sie selbst (auch lab/oklab)
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.fillStyle = "#ffffff";
    context.fillStyle = getComputedStyle(document.body).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    context.fillStyle = getComputedStyle(overlay).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    overlay.style.setProperty("background-color", `rgb(${r}, ${g}, ${b})`, "important");
    overlay.style.setProperty("backdrop-filter", "none", "important");
  });
};

/** Mittelpunkt eines Elements in Prozent des Ausschnitts (für die Zielpunkte in site.js, LIVE_SCENES). */
async function spot(page, locator, clip, { dx = 0.5 } = {}) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Element nicht gefunden");
  const area = clip ?? { x: 0, y: 0, ...page.viewportSize() };
  const x = ((box.x + box.width * dx - area.x) / area.width) * 100;
  const y = ((box.y + box.height / 2 - area.y) / area.height) * 100;
  return { x: box.x + box.width * dx, y: box.y + box.height / 2, at: `${x.toFixed(2)}% ${y.toFixed(2)}%` };
}

/**
 * Zentrale Suche (über der Mitgliederliste, siehe Bildliste): ohne Dialog (Tastenkürzel), Dialog leer, „H“, „He“, „Hel“
 * (= Standbild „suche“), dann Zeiger auf „Schicht bearbeiten“. Ausschnitt wie beim Standbild: um den Dialog mit „Hel“ –
 * für alle Bilder derselbe.
 */
async function searchFrames(page, snap) {
  const input = () => page.getByRole("combobox", { name: "Suchen" }).or(page.getByLabel("Suchen", { exact: true })).first();
  const settle = async () => {
    await page.waitForLoadState("networkidle");
    await page.getByRole("status").filter({ hasText: "Suche" }).waitFor({ state: "detached" }).catch(() => {});
    await page.waitForTimeout(600);
  };
  const open = async () => {
    await page.keyboard.press("Control+k");
    await input().waitFor();
    await page.waitForTimeout(400);
    await flatBackdrop(page);
  };
  // Die Mitgliederliste dahinter einmal gründlich umbenennen („Nachname, Vorname“ steht in mehreren Textknoten, siehe
  // normalizeDemoNames) – solange noch kein Dialog offen ist; die Liste selbst ändert sich danach nicht mehr
  await normalizeDemoNames(page);
  await open();
  await input().pressSequentially("Hel", { delay: 60 });
  await settle();
  const clip = await cropArea(page, "dialog");
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" }).catch(() => {});
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);
  await snap("suche-live-1", { clip, gentle: true });
  await open();
  await snap("suche-live-2", { clip, gentle: true });
  await input().pressSequentially("H");
  await settle();
  await snap("suche-live-3", { clip, gentle: true });
  await input().pressSequentially("e");
  await settle();
  await snap("suche-live-4", { clip, gentle: true });
  await input().pressSequentially("l");
  await settle();
  await snap("suche", { clip, gentle: true });
  const option = await spot(page, page.getByRole("option", { name: /Schicht bearbeiten/ }).first(), clip, { dx: 0.3 });
  await page.mouse.move(option.x, option.y);
  await page.waitForTimeout(300);
  await snap("suche-live-5", { clip, gentle: true });
  console.log(`      Positionen: Option „Schicht bearbeiten“ ${option.at}`);
}

/**
 * Mitglieder: Klick ins Suchfeld, „Koch“ tippen, „Filter“ aufklappen, „Filtern“ – die Liste zeigt nur noch die Kochs.
 * („Filtern“ steckt seit der Liste mit Detailbereich, 20.10.2026, hinter dem Knopf „Filter“ und ist erst danach sichtbar.)
 */
async function memberFrames(page, snap) {
  const clip = await cropArea(page, "content");
  const field = page.getByPlaceholder("Mitglieder durchsuchen").or(page.getByLabel("Mitglieder durchsuchen")).first();
  const toggle = page.locator("label", { hasText: /^Filter/ }).first();
  const filter = page.getByRole("button", { name: "Filtern", exact: true }).first();
  const at = { field: await spot(page, field, clip, { dx: 0.18 }), toggle: await spot(page, toggle, clip) };
  await page.mouse.move(0, 0);
  await snap("mitglieder", { clip });
  await page.mouse.move(at.field.x, at.field.y);
  await field.click();
  await page.waitForTimeout(300);
  await snap("mitglieder-live-1", { clip });
  await field.pressSequentially("Koch", { delay: 80 });
  await page.waitForTimeout(900);
  const live = new URL(page.url()).searchParams.size > 0;
  await snap("mitglieder-live-2", { clip });
  await page.mouse.move(at.toggle.x, at.toggle.y);
  await toggle.click();
  await filter.waitFor();
  at.filter = await spot(page, filter, clip);
  await page.mouse.move(at.filter.x, at.filter.y);
  await page.waitForTimeout(300);
  await snap("mitglieder-live-3", { clip });
  const before = page.url();
  await filter.click();
  await page.waitForURL((url) => url.href !== before).catch(() => {});
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(500);
  await snap("mitglieder-live-4", { clip });
  console.log(`      Positionen: Suchfeld ${at.field.at}, Filter ${at.toggle.at}, Filtern ${at.filter.at}${live ? " (Liste filterte schon beim Tippen)" : ""}`);
}

/**
 * Kalender: Zeiger auf „Liste“, Listenansicht des Monats, zurück zu „Monat“. (Die Liste füllt den Ausschnitt; die
 * Wochenansicht ließe auch mit Terminen an jedem Tag die untere Hälfte leer.)
 */
async function calendarFrames(page, snap) {
  const clip = await cropArea(page, "content");
  const view = (name) => page.getByRole("link", { name, exact: true }).or(page.getByRole("button", { name, exact: true })).first();
  const list = await spot(page, view("Liste"), clip);
  const month = await spot(page, view("Monat"), clip);
  await page.mouse.move(0, 0);
  await snap("kalender", { clip });
  await page.mouse.move(list.x, list.y);
  await page.waitForTimeout(300);
  await snap("kalender-live-1", { clip });
  const before = page.url();
  await view("Liste").click();
  await page.waitForURL((url) => url.href !== before);
  await page.waitForLoadState("networkidle");
  await page.mouse.move(list.x, list.y);
  await page.waitForTimeout(500);
  await snap("kalender-live-2", { clip });
  await page.mouse.move(month.x, month.y);
  await page.waitForTimeout(300);
  await snap("kalender-live-3", { clip });
  console.log(`      Positionen: Liste ${list.at}, Monat ${month.at}`);
}

/** Auswertungen: Diagrammart „Fläche“, dann „Balken“ (zurück zu „Linie“ = Standbild). */
async function chartFrames(page, snap) {
  const clip = await cropArea(page, "content");
  const kind = (name) => page.getByRole("radio", { name, exact: true }).or(page.getByRole("button", { name, exact: true })).first();
  const at = { line: await spot(page, kind("Linie"), clip), area: await spot(page, kind("Fläche"), clip), bars: await spot(page, kind("Balken"), clip) };
  await page.mouse.move(0, 0);
  await snap("auswertung", { clip, gentle: true });
  for (const [name, target, file] of [["Fläche", at.area, "auswertung-live-1"], ["Balken", at.bars, "auswertung-live-2"]]) {
    await page.mouse.move(target.x, target.y);
    await kind(name).click();
    await page.waitForTimeout(1200); // Diagramm-Animation
    await snap(file, { clip, gentle: true });
  }
  await kind("Linie").click(); // wieder wie vorher
  console.log(`      Positionen: Linie ${at.line.at}, Fläche ${at.area.at}, Balken ${at.bars.at}`);
}

/**
 * Sommerfest des Demo-Vereins (tools/demo-vorbereiten.mjs, FEST_DAY 2027-06-12): Link zu seinem Helferplan und ein Tag
 * in seiner Woche – der Kalender zeigt dessen Monat.
 */
const FEST_LINK = /Sommerfest 20\d\d/;
const FEST_WEEK = "2027-06-09";

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
  // Einstieg breit unter dem Text (560 bis 899 px, Rahmen 5 : 4, siehe .hero-visual in site.css): der Inhalt des
  // Dashboards rechts neben der schmalen Seitenleiste, schon als 5 : 4 zugeschnitten (die Seite zeigt das Bild ganz). Das
  // Fenster ist so hoch, dass die drei Spalten der Übersicht samt Karten im Bild stehen. Der Rahmen ist dort 92 % der
  // Breite bzw. die Breite minus 64 px (bis gut 830 CSS-Pixel) – 720 bis 2328 (doppelte Dichte des Ausschnitts) decken
  // einfache bis dreifache Pixeldichte ab.
  {
    name: "dashboard",
    path: "/dashboard",
    steps: async (page) => {
      await assertPreparedDashboard(page);
      await hideText("Noch keine Stunden erfasst")(page);
      await hideStartChip(page);
      await neutralGreeting(page);
      await hideWeekComparison(page);
    },
    viewport: { width: 1280, height: 1000 },
    crop: async (page) => {
      // Die graue Markierung des aktiven Eintrags ragt über den Rand der schmalen Leiste – sie gehört zur Leiste
      await page.addStyleTag({ content: "aside { clip-path: inset(0) !important; }" });
      const x = await contentLeft(page);
      const width = page.viewportSize().width - x;
      return { x, y: 0, width, height: Math.round(width * 0.8) };
    },
    // 2880: fensterbreit am Ende der Kamerafahrt (Website, 1440 CSS-Pixel bei doppelter Dichte)
    widths: [720, 960, 1440, 1920, 2328, 2880],
  },
  // Einstieg ab 900 px: das Dashboard in Tablet-Breite (768) als hohes Bild neben dem Text. In dieser Breite stehen die
  // vier Kennzahl-Karten zwei mal zwei und nichts wird gekürzt (schmaler kürzt die Anwendung den Vereinsnamen, breiter
  // erscheint die Seitenleiste). Der Rahmen zeigt es von oben und schneidet je nach Höhe unten ab (bis 1600 = 768 / 0,48);
  // auf der Website 330 bis 490 CSS-Pixel breit, daher 490 bis 1536 (einfache bis dreifache Pixeldichte).
  {
    name: "einstieg-dashboard",
    optional: true, // seit der Gestaltung B4 nicht mehr auf der Website
    path: "/dashboard",
    steps: async (page) => {
      await assertPreparedDashboard(page);
      // montags stehen in der laufenden Woche noch keine Helferstunden – der Vergleich „−100 % gegenüber letzter Woche“
      // sagt dann nichts und fiele im großen Bild auf
      await page.evaluate(() => {
        for (const el of document.querySelectorAll("p, span, div")) {
          if (el.children.length === 0 && /^[−-]100\s*%\s*gegenüber letzter Woche$/.test(el.textContent?.trim() ?? "")) {
            el.style.setProperty("visibility", "hidden");
          }
        }
      });
      await hideStartChip(page);
    },
    viewport: { width: 768, height: 1600 },
    widths: [490, 660, 980, 1280, 1536],
  },
  // Bildschirm des Laptops in der Vorführung „Am Rechner“ (.laptop-screen, siehe LAPTOP): die Finanzen – Übersicht mit
  // Kontostand, offenen Rechnungen, Überschuss und Spenden, die Rechnungen, das Kassenbuch mit Belegen und die Beiträge.
  // Daten aus finanzen-demo.mjs (Reel-Projekt, siehe README). Alle vier gleich groß und gleich gerahmt (Kopfzeile,
  // Titel „Finanzen“ und Reiterleiste stehen an derselben Stelle) – nacheinander gezeigt wirken sie wie ein Klick durch
  // die Reiter. Die Website zeigt nur die Übersicht (ruhiges Einzelbild, siehe Kommentar am Laptop in index.html); die
  // übrigen drei sind `optional` und entstehen nur mit --only <Name>, damit keine unbenutzten Dateien hochgeladen werden.
  ...[
    ["uebersicht", "/finanzen", "Kontostand gesamt"],
    ["rechnungen", "/finanzen/rechnungen", "Rechnung hochladen"],
    ["kassenbuch", "/finanzen/kassenbuch", /^\d+ Buchungen$/],
    ["beitraege", "/finanzen/beitraege", "Beiträge zusammen"],
  ].map(([key, url, ready]) => ({
    name: `laptop-finanzen-${key}`,
    optional: key !== "uebersicht",
    path: url,
    steps: async (page) => {
      await (typeof ready === "string" ? page.getByText(ready, { exact: true }) : page.getByText(ready)).first().waitFor();
      await assertFinance(page);
      // Beiträge: „0 per Lastschrift, … per Überweisung“ – Lastschrift (SEPA) bietet die Website nicht an
      await hideText(/^\d+ per Lastschrift, \d+ per Überweisung$/)(page);
      await page.waitForTimeout(1200); // Verlaufslinien der Karten
    },
    viewport: LAPTOP.viewport,
    widths: LAPTOP.widths,
  })),
  // Der Helferplan als Ausschnitt ohne Seitenleiste: Kopf mit „Neue Schicht“ und „Drucken“, darunter die Zeitleiste
  // „Tagesablauf“ und aus der Liste „Aufbau“ (voll besetzt) und „Getränkestand“ (teilweise besetzt, hier trägt sich der
  // Mauszeiger ein). 1440 px breit: Die Liste steht in vier Spalten (ab 1280 px), die Einträge werden flach – der
  // Ausschnitt ist knapp 3 : 2 statt hochkant. Zusammen mit der Bildfolge für das Live-Fenster aufgenommen (siehe
  // liveFrames) – beide müssen denselben Stand zeigen.
  // Auf der Website 700 CSS-Pixel breit: 700 und 1400 für einfache und doppelte Dichte.
  {
    name: "schichten",
    optional: true, // seit der Gestaltung B4 nicht mehr auf der Website (Live-Fenster entfallen)
    path: "/helferplanung",
    sidebar: "breit",
    steps: followLink(FEST_LINK),
    viewport: { width: 1440, height: 1000 },
    widths: [700, 960, 1400, 1920],
    frames: liveFrames,
  },
  { name: "mitglieder", optional: true, path: "/mitglieder", sidebar: "breit", viewport: DETAIL, crop: "content", frames: memberFrames },
  // Monat des Sommerfests (dort legt tools/demo-vorbereiten.mjs Trainings und weitere Termine an); das Datum steht in
  // der Adresse – bei einem anderen FEST_DAY in tools/demo-vorbereiten.mjs hier mitändern (FEST_WEEK).
  { name: "kalender", optional: true, path: `/kalender?ansicht=monat&datum=${FEST_WEEK}`, sidebar: "breit", viewport: DETAIL, crop: "content", frames: calendarFrames },
  // Diagramme („Auswertungen“) liegen weiter unten auf dem Reiter „Mitglieder“: Verlauf statt Donut, und ein
  // niedrigeres Fenster (720 px), damit die Seite weit genug scrollt, um mit der Karte zu beginnen.
  {
    name: "auswertung",
    optional: true, // seit der Gestaltung B4 nicht mehr auf der Website
    path: "/dashboard?tab=mitglieder",
    sidebar: "breit",
    steps: async (page) => {
      await page.getByText("Entwicklung", { exact: true }).first().click(); // Umschalter „Ansicht“ (SegmentedControl)
      await scrollToCard("Auswertungen")(page);
      await solidBars(page);
      await hideAboveCard("Auswertungen")(page);
    },
    viewport: { width: DETAIL.width, height: 720 },
    crop: "content",
    frames: chartFrames,
  },
  // Zentrale Suche: Treffer aus mehreren Gruppen (Aktionen, Seiten, Mitglieder) – nur lesen, nichts auswählen. Geöffnet
  // über der Mitgliederliste statt über dem Dashboard: Dessen farbige Kacheln lägen weichgezeichnet hinter dem Dialog,
  // und weiche Farbverläufe machen die verlustfreie Bildfolge gut doppelt so groß (18.10.2026: 736 statt gut 300 KB
  // bei doppelter Dichte). Die ruhige, helle Liste zeigt dasselbe – die Suche geht von jeder Seite aus.
  { name: "suche", optional: true, path: "/mitglieder", sidebar: "breit", viewport: SEARCH, crop: "dialog", frames: searchFrames },
  // Der Helferplan zum Aushängen: das erste Blatt des Aushangs „Helferplan Sommerfest …“, wie es die Vorschau der
  // Druckseite zeigt – ein weißes A4-Blatt (210 mm = 794 CSS-Pixel breit) mit Rand und angedeuteter Kopfzeile. (Mit
  // `media: "print"` fehlten seit dem neuen Druckbild vom Oktober 2026 die Ränder – die setzt beim Drucken erst `@page`.)
  // Ausschnitt im Seitenverhältnis A4 ab dem oberen Blattrand. Papier ist in beiden Darstellungen weiß, deshalb nur hell.
  {
    name: "helferplan-druck",
    path: "/helferplanung/drucken?inhalt=aushang",
    viewport: { width: 1000, height: 1400 },
    steps: scrollBelowHeader((page) => printSheet(page), { gap: 0 }),
    crop: async (page) => {
      const box = await printSheet(page).boundingBox();
      if (!box) throw new Error("Blatt „Helferplan Sommerfest“ nicht gefunden");
      const x = Math.ceil(box.x);
      const width = Math.floor(box.x + box.width) - x;
      return { x, y: Math.ceil(box.y), width, height: Math.round((width * 297) / 210) };
    },
    // Auf der Website (Kapitel 3, Aushang) 236 bis 240 CSS-Pixel breit: 240 und 480 für einfache und doppelte Dichte, 640
    // und 800 für Smartphones mit dreifacher Dichte
    widths: [240, 480, 640, 800],
    schemes: ["light"],
  },
  // Einstieg am Smartphone (unter 560 px): das Dashboard in der Ansicht fürs Smartphone, ohne Telefonrahmen als großes
  // Bild unter dem Text (288 bis 527 CSS-Pixel breit, Ausschnitt in site.css bei .hero-visual); 1170 für dreifache Dichte
  {
    name: "phone-dashboard",
    device: "phone",
    path: "/dashboard",
    steps: async (page) => {
      await assertPreparedDashboard(page);
      await hideStartChip(page);
      await neutralGreeting(page);
      await hideWeekComparison(page);
    },
    viewport: PHONE_SCREEN,
    // „Im Detail“ am Smartphone (Telefon, Bildschirm bis 312 CSS-Pixel): je Pixeldichte eine Datei
    widths: [312, 442, 520, 624, 780, 936, 1170],
  },
  // Vorführung „Unterwegs“: ab „Meine Einsätze“, damit die Schaltfläche „Eintragen“ der ersten offenen Schicht ganz zu
  // sehen ist (über ihr stehen je nach Datum noch Hinweise auf unbesetzte Schichten)
  {
    name: "phone-helferplanung",
    device: "phone",
    path: "/helferplanung",
    steps: scrollBelowHeader((page) => page.getByRole("heading", { name: "Meine Einsätze" })),
    viewport: PHONE_SCREEN,
    widths: [260, 312, 468, 520, 624, 780],
  },
  // Kapitel Helferschichten: die Schicht „Getränkestand“ aus Sicht des Helfers vor und nach dem Eintragen (siehe
  // phoneFrames), darunter „Grillstand“ (unbesetzt).
  {
    name: "phone-schichten",
    device: "phone",
    path: "/helferplanung",
    steps: followLink(FEST_LINK),
    frames: phoneFrames,
    viewport: PHONE_SCREEN,
    // Einstieg (Telefon neben dem Laptop, Bildschirm 182/208 CSS-Pixel) und Kapitel 3 (flaches Telefon, 260/312); das Bild
    // „vorher“ nur für Kapitel 3
    widths: [182, 208, 260, 312, 390, 416, 520, 624, 780],
    frameWidths: { "phone-schichten-live-1": [260, 312, 390, 520, 624, 780] },
  },
  // „Im Detail“ auf dem Smartphone (unter 720 px statt der Browserfenster): Suche über die Lupe, Mitgliederliste,
  // Kalender als Liste, Auswertung – je 260 CSS-Pixel breit wie die übrigen Telefone dort
  {
    name: "phone-suche",
    optional: true, // seit der Gestaltung B4 nicht mehr auf der Website
    device: "phone",
    path: "/dashboard",
    steps: openSearch("Hel", { viaButton: true }),
    viewport: PHONE_SCREEN,
  },
  {
    name: "phone-mitglieder",
    optional: true, // seit der Gestaltung B4 nicht mehr auf der Website
    device: "phone",
    path: "/mitglieder",
    steps: scrollBelowHeader((page) => page.getByPlaceholder(/suchen/).or(page.getByRole("searchbox"))),
    viewport: PHONE_SCREEN,
  },
  {
    name: "phone-kalender",
    optional: true, // seit der Gestaltung B4 nicht mehr auf der Website
    device: "phone",
    path: `/kalender?ansicht=liste&datum=${FEST_WEEK}`, // Monat wie bei „kalender“
    steps: scrollBelowHeader((page) => page.getByRole("button", { name: "Heute" }).or(page.getByRole("link", { name: "Heute" }))),
    viewport: PHONE_SCREEN,
  },
  {
    name: "phone-auswertung",
    optional: true, // seit der Gestaltung B4 nicht mehr auf der Website
    device: "phone",
    path: "/dashboard?tab=mitglieder",
    steps: async (page) => {
      await page.getByText("Entwicklung", { exact: true }).first().click();
      await page.waitForTimeout(1200); // Diagramm-Animation
      await scrollBelowHeader((p) => p.getByText("Nach Status", { exact: true }))(page); // Umschalter, Diagramm ganz im Bild
      await solidBars(page);
    },
    viewport: PHONE_SCREEN,
  },
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
/**
 * `gentle`: für Bildfolgen, in denen danach noch getippt oder geklickt wird – nur Textinhalte ersetzen, keine Knoten
 * entfernen oder zusammenfassen (React arbeitet sonst mit Knoten weiter, die es nicht mehr gibt). Was dabei nicht
 * greift, meldet checkDemoNames.
 */
async function normalizeDemoNames(page, { gentle = false } = {}) {
  await page.evaluate(([rules, gentle]) => {
    // React setzt „{Nachname}, {Vorname}“ aus mehreren Textknoten zusammen, beim Rendern auf dem Server getrennt durch
    // leere Kommentare (<!-- -->). Ohne die Kommentare lassen sich die Knoten zusammenfassen, dann greifen die Regeln.
    if (!gentle) {
      const comments = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
      const markers = [];
      for (let node = comments.nextNode(); node; node = comments.nextNode()) markers.push(node);
      for (const node of markers) node.remove();
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
  }, [DEMO_RENAME.map(([re, replacement]) => [re.source, re.flags, replacement]), gentle]);
}

/** Warnt, wenn im Bildausschnitt noch Namen oder Adressen aus dem Seed stehen (das Repository ist öffentlich). */
async function checkDemoNames(page, clip, name) {
  const found = await page.evaluate(([area, sources]) => {
    // dieselben Muster wie beim Umbenennen: Was davon noch im Bild steht, wurde nicht ersetzt
    const rules = sources.map(([source, flags]) => new RegExp(source, flags.replace("g", "")));
    const seed = { test: (text) => rules.some((rule) => rule.test(text)) };
    const box = area ?? { x: 0, y: 0, width: innerWidth, height: innerHeight };
    const hits = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || !seed.test(el.textContent ?? "")) continue;
      const r = el.getBoundingClientRect();
      const inside = r.width && r.right > box.x && r.left < box.x + box.width && r.bottom > box.y && r.top < box.y + box.height;
      if (inside && getComputedStyle(el).visibility !== "hidden") hits.add(el.textContent.trim().slice(0, 60));
    }
    return [...hits];
  }, [clip, DEMO_RENAME.map(([re]) => [re.source, re.flags])]);
  if (found.length) {
    console.error(`WARNUNG ${name}: Seed-Namen im Bild: ${found.join(" | ")}`);
    process.exitCode = 1;
  }
}

/**
 * Das Symbol der Next.js-Entwicklungsumgebung und Einblendungen gehören nicht ins Bild, ebenso die blinkende Schreibmarke
 * (sie stünde mal im Bild und mal nicht – in einer Bildfolge flackerte sie).
 */
const HIDE_DEV_UI =
  "nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button] { display: none !important; } * { caret-color: transparent !important; }";

/** Bildausschnitt in Fensterkoordinaten (Playwright `clip`) – oder undefined für das ganze Fenster. */
async function cropArea(page, crop) {
  if (typeof crop === "function") return crop(page);
  if (crop === "content") {
    const x = await contentLeft(page);
    return { x, y: 0, ...CONTENT_CROP };
  }
  if (crop === "dialog") {
    const box = await page.getByRole("dialog").first().boundingBox();
    if (!box) throw new Error("Kein geöffneter Dialog");
    const viewport = page.viewportSize();
    const { width, height } = CONTENT_CROP;
    // nie mitten durch die Seitenleiste: frühestens an ihrer rechten Kante
    const aside = await contentLeft(page);
    const x = Math.round(Math.min(Math.max(aside, box.x + box.width / 2 - width / 2), viewport.width - width));
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
  const browser = await chromium.launch({ channel: CHANNEL }).catch((error) => {
    if (CHANNEL === "chromium" || process.env.VF_BROWSER_CHANNEL) throw error;
    console.log(`Browser „${CHANNEL}“ nicht gefunden – nehme das Chromium von Playwright.`);
    return chromium.launch({ channel: "chromium" });
  });
  // Ohne --only alle Bilder, die die Website verwendet; `optional` (derzeit nicht eingebunden) nur ausdrücklich
  const selected = shots.filter((s) => (only ? only.includes(s.name) : !s.optional));
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
            await releaseCapture(page);
            await page.setViewportSize(shot.viewport ?? spec.viewport);
            await page.emulateMedia({ media: shot.media ?? "screen" });
            if (device === "desktop") await setSidebar(page, shot.sidebar ?? "schmal");
            await gotoApp(page, shot.path);
            await shot.steps?.(page);
            if (shot.frames) {
              // Bildfolge: jedes Bild wie ein einzelnes, der Mauszeiger bleibt, wo ihn die Folge hinstellt
              // clip: Ausschnitt für alle Bilder der Folge gleich (sonst ganzes Fenster); gentle: siehe normalizeDemoNames
              const snap = async (name, { clip, gentle = false } = {}) => {
                await page.addStyleTag({ content: HIDE_DEV_UI });
                await page.evaluate(() => document.fonts.ready);
                await normalizeDemoNames(page, { gentle });
                await page.waitForTimeout(500);
                await checkDemoNames(page, clip, name);
                await checkProblems(page, clip, name);
                const breiten = shot.frameWidths?.[name] ?? shot.widths ?? spec.widths;
                const { width, height } = await save(await capture(page, clip, breiten, spec), name, scheme);
                console.log(`${scheme.padEnd(5)} ${name}  ${width}×${height}`);
              };
              await shot.frames(page, snap);
              continue;
            }
            await page.addStyleTag({ content: HIDE_DEV_UI }); // nach den Schritten: ein Link-Klick lädt eine neue Seite
            await page.evaluate(() => document.fonts.ready);
            await normalizeDemoNames(page);
            await page.mouse.move(0, 0); // kein Hover-Zustand im Bild
            await page.waitForTimeout(500); // Übergänge und Diagramm-Animationen abwarten
            const clip = await cropArea(page, shot.crop);
            await checkDemoNames(page, clip, shot.name);
            await checkProblems(page, clip, shot.name);
            const captured = await capture(page, clip, shot.widths ?? spec.widths, spec);
            const { width, height } = await save(captured, shot.name, scheme, { allowLossy: true });
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
