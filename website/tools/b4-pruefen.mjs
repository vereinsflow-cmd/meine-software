// Browserprüfung der Startseite (Gestaltung B4): startet einen eigenen kleinen Server mit den Headern aus _headers
// (Content-Security-Policy wie auf dem Webspace) und prüft in Chromium, WebKit und „Chromium ohne scroll-driven
// Animationen“ (nachgestellt: die @supports-Abfragen und CSS.supports verneint), je mit und ohne „Bewegung reduzieren“,
// in sechs Fenstergrößen:
//   - keine Meldungen in der Konsole, keine Verstöße gegen die Content-Security-Policy, keine Skriptfehler
//   - kein seitliches Scrollen
//   - beim Durchscrollen hat jedes Kapitel genau einen Eintrag mit aria-current (Kopfzeile) und einen Rastpunkt
//   - nach dem Durchscrollen ist alles Eingeblendete da (.erscheint.ist-da) und jedes Gerät in Ruhe (.is-rest; bei
//     „Bewegung reduzieren“: keine Animation an den Geräten)
//   - Layout-Verschiebung (CLS, nur Chromium) höchstens 0,01
//   - genau eine Überschrift h1
//   - kein Text läuft aus seinem Kasten oder aus dem Fenster (je Element gemessen – html und body haben overflow-x: clip,
//     das Dokument allein zeigte einen abgeschnittenen Text nicht); ebenso auf Impressum, Datenschutz und Fehlerseite
// Dazu ohne Browser: kein style= im HTML, Größe der Skripte und der Stildatei im Paket (bereinigt wie von
// tools/paket.mjs, roh und gepackt) – über dem Ziel ist ein Fehler.
//   node tools/b4-pruefen.mjs            alle Fälle (dauert einige Minuten)
//   node tools/b4-pruefen.mjs schnell    nur 390 und 1440 px
// Playwright kommt aus dem Hauptordner des Repositories (VF_APP_DIR, Standard: ein Ordner höher).
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { bereinigeCss, bereinigeJs } from "./paket.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schnell = process.argv.includes("schnell");
const APP_DIR = process.env.VF_APP_DIR ?? path.resolve(root, "..");
const pw = createRequire(path.join(APP_DIR, "package.json"))("playwright");
let fehler = 0;
const melde = (ok, text) => {
  console.log(`${ok ? "ok  " : "FEHL"} ${text}`);
  if (!ok) fehler++;
};

// --- ohne Browser ---
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
melde(!/\sstyle="/.test(html), "index.html ohne style=-Attribute");
// Ziele für das, was auf den Webspace kommt (bereinigt) und was übertragen wird (gzip, wie mod_deflate)
const ZIEL = { jsPaket: 72, jsGzip: 26, cssPaket: 215, cssGzip: 45 };
const kb = (n) => n / 1024;
const jsQuellen = ["site.js", "buehne.js", "fluss.js"].map((f) => [f, fs.readFileSync(path.join(root, "assets/js", f), "utf8")]);
const jsPaket = jsQuellen.map(([f, t]) => bereinigeJs(t, f));
const jsRoh = jsQuellen.reduce((a, [, t]) => a + Buffer.byteLength(t), 0);
const jsBer = jsPaket.reduce((a, t) => a + Buffer.byteLength(t), 0);
const jsGz = jsPaket.reduce((a, t) => a + zlib.gzipSync(t).length, 0);
console.log(`     Skripte: ${kb(jsRoh).toFixed(1)} KB Quelltext, im Paket ${kb(jsBer).toFixed(1)} KB, gepackt ${kb(jsGz).toFixed(1)} KB (Ziel ≤ ${ZIEL.jsPaket} / ${ZIEL.jsGzip} KB)`);
melde(kb(jsBer) <= ZIEL.jsPaket && kb(jsGz) <= ZIEL.jsGzip, "Größe der Skripte im Paket");
const css = fs.readFileSync(path.join(root, "assets/css/site.css"), "utf8");
const cssPaket = bereinigeCss(css, "site.css");
const cssGz = zlib.gzipSync(cssPaket).length;
console.log(`     Stildatei: ${kb(css.length).toFixed(0)} KB Quelltext, im Paket ${kb(cssPaket.length).toFixed(0)} KB, gepackt ${kb(cssGz).toFixed(0)} KB (Ziel ≤ ${ZIEL.cssPaket} / ${ZIEL.cssGzip} KB)`);
melde(kb(cssPaket.length) <= ZIEL.cssPaket && kb(cssGz) <= ZIEL.cssGzip, "Größe der Stildatei im Paket");

// Text, der aus dem Fenster oder aus einem abschneidenden Kasten läuft (im Browser ausgeführt): je Textstück die Zeilen
// (Range.getClientRects) gegen das Fenster und gegen den nächsten Vorfahren mit overflow ≠ visible – so fällt auch ein
// Wort auf, das html/body (overflow-x: clip) still abschneiden. Unsichtbares (Deckkraft 0, aria-hidden, sr-only) zählt nicht.
function textUeberlauf() {
  const aus = [];
  const vw = document.documentElement.clientWidth;
  const sichtbar = (el) => (el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true);
  const kanten = new Map();
  const schneider = (el) => {
    if (kanten.has(el)) return kanten.get(el);
    let e = el.parentElement;
    while (e && e !== document.body && e !== document.documentElement) {
      const cs = getComputedStyle(e);
      if (cs.overflowX !== "visible") break;
      e = e.parentElement;
    }
    const r = e && e !== document.body && e !== document.documentElement ? e.getBoundingClientRect() : null;
    kanten.set(el, r);
    return r;
  };
  const gang = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const gemeldet = new Set();
  for (let t = gang.nextNode(); t; t = gang.nextNode()) {
    if (!t.textContent.trim()) continue;
    const el = t.parentElement;
    if (!el || el.closest('[aria-hidden="true"], .sr-only, [hidden], .menue, .notify-trap, svg, script, style') || !sichtbar(el)) continue;
    if (el.getBoundingClientRect().width <= 1) continue; // nur für Screenreader (1 px breit, ausgeschnitten)
    const range = document.createRange();
    range.selectNodeContents(t);
    const kasten = schneider(el);
    for (const r of range.getClientRects()) {
      if (!r.width) continue;
      const name = `„${t.textContent.trim().slice(0, 28)}“`;
      let fehler = "";
      if (r.right > vw + 1 || r.left < -1) fehler = `außerhalb des Fensters (${Math.round(r.left)}–${Math.round(r.right)} von ${vw})`;
      else if (kasten && (r.right > kasten.right + 1 || r.left < kasten.left - 1)) fehler = `abgeschnitten (${Math.round(r.left)}–${Math.round(r.right)}, Kasten ${Math.round(kasten.left)}–${Math.round(kasten.right)})`;
      if (fehler && !gemeldet.has(name)) {
        gemeldet.add(name);
        aus.push(`${name} ${fehler}`);
      }
    }
  }
  return aus;
}

// --- Server mit den Headern aus _headers ---
function header() {
  const out = {};
  let drin = false;
  for (const z of fs.readFileSync(path.join(root, "_headers"), "utf8").split(/\r?\n/)) {
    if (/^\S/.test(z) && !z.startsWith("#")) drin = z.trim() === "/*";
    else if (drin && /^\s+[\w-]+:/.test(z)) {
      const [n, ...rest] = z.trim().split(":");
      if (n.toLowerCase() !== "strict-transport-security") out[n] = rest.join(":").trim();
    }
  }
  return out;
}
const TYPEN = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json" };
const H = header();
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404, H).end();
    return;
  }
  res.writeHead(200, { ...H, "Content-Type": `${TYPEN[path.extname(f)] ?? "application/octet-stream"}; charset=utf-8`, "Cache-Control": "no-store" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const URL0 = `http://127.0.0.1:${server.address().port}/`;

const GROESSEN = schnell ? [[390, 844], [1440, 900]] : [[320, 568], [390, 844], [768, 1024], [1024, 768], [1440, 900], [1920, 1080]];
const BROWSER = [["chromium", false], ["webkit", false], ["chromium", true]];

try {
  for (const [name, ohneSd] of BROWSER) {
    let browser;
    try {
      browser = await pw[name].launch();
    } catch {
      console.log(`(${name} nicht installiert – übersprungen)`);
      continue;
    }
    for (const bewegung of ["no-preference", "reduce"]) {
      for (const [w, h] of GROESSEN) {
        const mobil = w < 768;
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: bewegung, hasTouch: mobil, isMobile: mobil && name === "chromium" });
        const page = await ctx.newPage();
        const meldungen = [];
        page.on("console", (m) => {
          if (["error", "warning"].includes(m.type())) meldungen.push(m.text());
        });
        page.on("pageerror", (e) => meldungen.push(`Skriptfehler: ${e.message}`));
        if (ohneSd) {
          await page.route("**/assets/css/site.css*", async (route) => {
            const r = await route.fetch();
            route.fulfill({ response: r, body: (await r.text()).replaceAll("animation-timeline: view()", "animation-timeline: gibt-es-nicht()") });
          });
          await page.addInitScript(() => {
            const echt = CSS.supports.bind(CSS);
            CSS.supports = (...a) => (String(a.join(" ")).includes("animation-timeline") ? false : echt(...a));
          });
        }
        await page.addInitScript(() => {
          window.__cls = 0;
          document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP: ${e.violatedDirective} ${e.blockedURI}`));
          try {
            new PerformanceObserver((l) => {
              for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
            }).observe({ type: "layout-shift", buffered: true });
          } catch {
            // WebKit kennt layout-shift nicht
          }
        });
        await page.goto(URL0, { waitUntil: "load" });
        await page.waitForTimeout(900);
        // Durchscrollen in Schritten (IntersectionObserver und Animationen laufen mit)
        const hoehe = await page.evaluate(() => document.documentElement.scrollHeight);
        const kapitelFehler = [];
        for (let y = 0; y <= hoehe; y += Math.round(h * 0.4)) {
          await page.evaluate((y) => window.scrollTo(0, y), y);
          await page.waitForTimeout(45);
          const s = await page.evaluate(() => ({
            k: document.querySelector("[data-kopf]")?.dataset.kapitel,
            navi: document.querySelectorAll(".kopf-insel [data-navi][aria-current]").length,
            ziele: [...document.querySelectorAll("[data-ziel][aria-current]")].map((a) => a.dataset.ziel),
          }));
          if (s.navi !== 1 || s.ziele.length !== 1 || s.ziele[0] !== s.k) kapitelFehler.push(`${y}px: Kapitel ${s.k}, ${s.navi} Einträge, Rastpunkt ${s.ziele.join("/")}`);
        }
        await page.waitForTimeout(bewegung === "reduce" ? 300 : 4600);
        const z = await page.evaluate(() => ({
          sw: document.documentElement.scrollWidth,
          cw: document.documentElement.clientWidth,
          offen: document.querySelectorAll(".erscheint:not(.ist-da)").length,
          // mit Bewegung: in Ruhe (.is-rest); bei „Bewegung reduzieren“ laufen an den Geräten gar keine Animationen
          geraete: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? [...document.querySelectorAll(".showcase")].filter((s) => s.getAnimations({ subtree: true }).length).map((s) => s.dataset.geraet)
            : [...document.querySelectorAll(".showcase")].filter((s) => !s.classList.contains("is-rest")).map((s) => s.dataset.geraet),
          h1: document.querySelectorAll("h1").length,
          cls: window.__cls,
        }));
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(bewegung === "reduce" ? 100 : 600);
        z.ueberlauf = await page.evaluate(textUeberlauf);
        const fall = `${name}${ohneSd ? " ohne scroll-driven" : ""} · ${bewegung === "reduce" ? "Bewegung reduziert" : "mit Bewegung"} · ${w}×${h}`;
        const probleme = [];
        if (meldungen.length) probleme.push(`Konsole: ${[...new Set(meldungen)].join(" | ")}`);
        if (z.sw > z.cw) probleme.push(`seitliches Scrollen (${z.sw} > ${z.cw})`);
        if (kapitelFehler.length) probleme.push(`Kapitel: ${kapitelFehler.slice(0, 3).join("; ")}`);
        if (z.offen) probleme.push(`${z.offen} × .erscheint nicht eingeblendet`);
        if (z.geraete.length) probleme.push(`Geräte nicht in Ruhe: ${z.geraete.join(", ")}`);
        if (z.h1 !== 1) probleme.push(`${z.h1} × h1`);
        if (z.cls > 0.01) probleme.push(`CLS ${z.cls.toFixed(4)}`);
        if (z.ueberlauf.length) probleme.push(`Text läuft über: ${z.ueberlauf.slice(0, 4).join("; ")}`);
        melde(!probleme.length, `${fall}${probleme.length ? ": " + probleme.join(" · ") : ""}`);
        await ctx.close();
      }
    }
    // Unterseiten: Konsole, CSP und Text im Kasten (schmal bis breit)
    if (!ohneSd) {
      for (const seite of ["impressum.html", "datenschutz.html", "404.html"]) {
        for (const w of schnell ? [320, 390, 1440] : [320, 360, 390, 768, 1024, 1440]) {
          const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
          const page = await ctx.newPage();
          const meldungen = [];
          page.on("console", (m) => {
            if (["error", "warning"].includes(m.type())) meldungen.push(m.text());
          });
          page.on("pageerror", (e) => meldungen.push(`Skriptfehler: ${e.message}`));
          await page.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP: ${e.violatedDirective} ${e.blockedURI}`)));
          await page.goto(URL0 + seite, { waitUntil: "load" });
          await page.waitForTimeout(150);
          const ueberlauf = await page.evaluate(textUeberlauf);
          const probleme = [...(meldungen.length ? [`Konsole: ${[...new Set(meldungen)].join(" | ")}`] : []), ...(ueberlauf.length ? [`Text läuft über: ${ueberlauf.slice(0, 4).join("; ")}`] : [])];
          melde(!probleme.length, `${name} · ${seite} · ${w} px${probleme.length ? ": " + probleme.join(" · ") : ""}`);
          await ctx.close();
        }
      }
    }
    await browser.close();
  }
} finally {
  server.close();
}
console.log(fehler ? `\n${fehler} Fehler` : "\nAlle Prüfungen bestanden.");
process.exit(fehler ? 1 : 0);
