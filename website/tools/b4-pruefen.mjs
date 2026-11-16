// Browserprüfung der Startseite (Gestaltung „Pro“ seit 16.11.2026; bis dahin B4): startet einen eigenen kleinen Server
// mit den Headern aus _headers (Content-Security-Policy wie auf dem Webspace) und prüft in Chromium, WebKit und „Chromium
// ohne scroll-driven Animationen“ (nachgestellt: die @supports-Abfragen und CSS.supports verneint), je mit und ohne
// „Bewegung reduzieren“, in sieben Fenstergrößen (320 × 568 bis 1920 × 1080):
//   - keine Meldungen in der Konsole, keine Verstöße gegen die Content-Security-Policy, keine Skriptfehler
//   - kein seitliches Scrollen
//   - beim Durchscrollen hat jedes Kapitel genau einen Eintrag mit aria-current in der Kopfleiste, und dieser Eintrag
//     gehört zum Kapitel (data-navi enthält die Nummer aus data-kapitel)
//   - nach dem Durchscrollen ist alles Eingeblendete da (.erscheint.ist-da) und jedes Gerät in Ruhe (.is-rest; bei
//     „Bewegung reduzieren“: keine Animation an den Geräten)
//   - Layout-Verschiebung (CLS, nur Chromium) höchstens 0,01
//   - genau eine Überschrift h1
//   - kein Text läuft aus seinem Kasten oder aus dem Fenster (je Element gemessen – html und body haben overflow-x: clip,
//     das Dokument allein zeigte einen abgeschnittenen Text nicht); ebenso auf Impressum, Datenschutz und Fehlerseite
//   - Bewegung beim Scrollen (seit Bau 2, statt der Kamerafahrt) an mehreren Stellen jeder Zeitleiste, berechnet wie in
//     site.css (gepinnt: contain, sonst cover, die Kopfleiste abgezogen):
//       Explosion: am Anfang zerlegt (Stapel gedreht, Beschriftung bzw. Legende sichtbar, Laptop und „Alles greift
//       ineinander.“ unsichtbar), in der Mitte halb (Beschriftung aus, Stapel zwischen zerlegt und frontal, Bühne klebt
//       unter der Kopfleiste), am Ende zusammengesetzt (Stapel frontal, Laptop und Kopf B sichtbar, Ebenen aus), danach
//       gelöst (Bühne fährt mit der Seite, Endlage bleibt);
//       Telefon: am Anfang gedreht, Bildschirm A, Feld der Glocke aus; am Ende gerade, Schichtliste, Feld sichtbar; am
//       Rechner gepinnt; Telefon und Feld der Glocke verdecken nie die Textspalte (am Handy: stehen unter dem Text); Aussage: Wörter hellen nacheinander auf; Metall-„13“: neigt sich zwischen Ein- und Auslaufen;
//       an jeder Stelle kein seitliches Scrollen, an den Zwischenstufen kein Text außerhalb von Fenster oder Kasten
//   - „Bewegung reduzieren“: Endlage überall, keine Animation an den Bühnen, Strecken eingeklappt (kein leerer Weg)
// Dazu einmal je Browser: ohne JavaScript (Endlage, Strecken eingeklappt) und das Umschalten zur Laufzeit – „Bewegung
// anhalten“ an fünf Stellen (Explosion mitten im Weg, Kapitel 4, Telefon mitten im Weg, Kapitel 8, Fußzeile) und wieder
// fortsetzen, „Bewegung reduzieren“ an und aus: Die Leseposition springt nicht (Anker höchstens 2 px versetzt), die
// Strecken klappen ein bzw. auf.
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
// Skripte im Paket seit 22.10.2026 80 statt 72 KB (damals mit Kamerafahrt und Lichtfluss); gezählt werden alle Skripte in
// assets/js/
const ZIEL = { jsPaket: 80, jsGzip: 26, cssPaket: 215, cssGzip: 45 };
const kb = (n) => n / 1024;
const jsQuellen = fs
  .readdirSync(path.join(root, "assets/js"))
  .filter((f) => f.endsWith(".js"))
  .sort()
  .map((f) => [f, fs.readFileSync(path.join(root, "assets/js", f), "utf8")]);
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

// Zustand der Bühnen (im Browser ausgeführt): Deckkraft und Abweichung der Matrix von „gerade“ (größter Betrag der
// Differenz zur Einheitsmatrix, ohne Verschiebung), Lage der Bühnen, Deckkraft der Wörter, Matrix der Metall-„13“
function zustand() {
  const q = (s) => document.querySelector(s);
  const op = (s) => (q(s) ? Number(getComputedStyle(q(s)).opacity) : null);
  const abw = (s) => {
    const t = q(s) ? getComputedStyle(q(s)).transform : "none";
    if (t === "none") return 0;
    const m = new DOMMatrixReadOnly(t);
    return Math.max(...[m.m11 - 1, m.m12, m.m13, m.m14, m.m21, m.m22 - 1, m.m23, m.m24, m.m31, m.m32, m.m33 - 1, m.m34].map(Math.abs));
  };
  const top = (s) => (q(s) ? q(s).getBoundingClientRect().top : null);
  const breit = innerWidth >= 900;
  const anims = (s) => [...document.querySelectorAll(s)].reduce((n, e) => n + e.getAnimations({ subtree: true }).filter((a) => "animationName" in a).length, 0);
  return {
    stapel: abw(".ex-stapel"),
    marken: op(breit ? ".ex-marken" : ".ex-legende"),
    kopfB: op(".ex-kopf-b"),
    rechner: op(".rechner"),
    ebene: op(".ex-e3 .ex-bild"),
    buehne: top(".ex-buehne"),
    telefon: abw(".telefon"),
    bildB: op(".telefon-bild-b"),
    glocke: op(".glockenfeld"),
    tfBuehne: top(".tf-buehne"),
    // Lage von Telefon und Feld der Glocke (mit Drehung) gegenüber der Textspalte
    tel: (() => {
      const r = q(".telefon").getBoundingClientRect();
      const g = q(".glockenfeld").getBoundingClientRect();
      const t = q(".tf-text").getBoundingClientRect();
      return { links: Math.min(r.left, Number(getComputedStyle(q(".glockenfeld")).opacity) > 0.01 ? g.left : Infinity), oben: r.top, textRechts: t.right, textUnten: t.bottom };
    })(),
    worte: [...document.querySelectorAll(".aw")].map((e) => Number(getComputedStyle(e).opacity)),
    metall: getComputedStyle(q(".metall-13 .metall-koerper")).transform,
    exWeg: q(".ex-strecke").offsetHeight - q(".ex-buehne").offsetHeight,
    tfWeg: q(".tf-strecke").offsetHeight - q(".tf-buehne").offsetHeight,
    anims: anims(".k01, .k02, .k06, .metall"),
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  };
}

// Scrollstand zum Fortschritt p einer Zeitleiste (wie site.css: Kopfleiste 52 px abgezogen; gepinnt = contain, sonst cover)
function stelle([sel, art, p]) {
  const el = document.querySelector(sel);
  const r = el.getBoundingClientRect();
  const top = r.top + scrollY;
  const k = 52;
  const H = innerHeight;
  let [a, e] = art === "contain" ? [top - k, top + r.height - H] : [top - H, top + r.height - k];
  if (art === "contain" && r.height < H - k) [a, e] = [e, a];
  return Math.round(a + p * (e - a));
}

// Endlage (bei „Bewegung reduzieren“, „Bewegung anhalten“ und ohne JavaScript): Liste der Abweichungen
function endlageFehler(z) {
  const f = [];
  if (z.stapel > 0.002 || z.kopfB < 0.98 || z.rechner < 0.98 || z.ebene > 0.02 || z.marken > 0.02) f.push(`Explosion nicht zusammengesetzt (${JSON.stringify({ stapel: z.stapel, kopfB: z.kopfB, rechner: z.rechner, ebene: z.ebene, marken: z.marken })})`);
  if (z.telefon > 0.002 || z.bildB < 0.98 || z.glocke < 0.98) f.push(`Telefon nicht in der Endlage (${JSON.stringify({ telefon: z.telefon, bildB: z.bildB, glocke: z.glocke })})`);
  if (Math.min(...z.worte) < 0.98) f.push("Aussage nicht hell");
  if (z.exWeg > 1 || z.tfWeg > 1) f.push(`Strecken nicht eingeklappt (Explosion +${z.exWeg} px, Telefon +${z.tfWeg} px)`);
  if (z.anims) f.push(`${z.anims} Animationen an den Bühnen`);
  return f;
}

// Neue Seite mit denselben Bedingungen wie in der Matrix (CSP-Meldungen, ohne scroll-driven nachgestellt)
async function neueSeite(browser, ohneSd, kontext) {
  const ctx = await browser.newContext(kontext);
  const page = await ctx.newPage();
  const meldungen = [];
  page.on("console", (m) => {
    if (["error", "warning"].includes(m.type())) meldungen.push(m.text());
  });
  page.on("pageerror", (e) => meldungen.push(`Skriptfehler: ${e.message}`));
  if (ohneSd) await ohneScrollDriven(page);
  await page.addInitScript(() => document.addEventListener("securitypolicyviolation", (e) => console.error(`CSP: ${e.violatedDirective} ${e.blockedURI}`)));
  return { ctx, page, meldungen };
}

async function ohneScrollDriven(page) {
  await page.route("**/assets/css/site.css*", async (route) => {
    const r = await route.fetch();
    route.fulfill({ response: r, body: (await r.text()).replaceAll("animation-timeline: view()", "animation-timeline: gibt-es-nicht()") });
  });
  await page.addInitScript(() => {
    const echt = CSS.supports.bind(CSS);
    CSS.supports = (...a) => (String(a.join(" ")).includes("animation-timeline") ? false : echt(...a));
  });
}

const dreiBilder = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));

// Bewegung an Stellen der Zeitleisten (mit Bewegung): Liste der Abweichungen
async function bewegungPruefen(page, w) {
  const f = [];
  const breit = w >= 900;
  const kopf = 52;
  const nah = (a, b, t = 1.5) => a !== null && Math.abs(a - b) <= t;
  const an = async (sel, art, p, ueberlauf = false) => {
    await page.evaluate((y) => window.scrollTo(0, y), await page.evaluate(stelle, [sel, art, p]));
    await dreiBilder(page);
    await page.waitForTimeout(60);
    const z = await page.evaluate(zustand);
    if (z.sw > z.cw) f.push(`${sel} bei ${Math.round(p * 100)} %: seitliches Scrollen (${z.sw} > ${z.cw})`);
    if (ueberlauf) {
      const u = await page.evaluate(textUeberlauf);
      if (u.length) f.push(`${sel} bei ${Math.round(p * 100)} %: Text läuft über: ${u.slice(0, 3).join("; ")}`);
    }
    return z;
  };
  // Explosion
  let z = await an("[data-explosion]", "contain", 0);
  if (!(z.stapel > 0.3 && z.marken > 0.95 && z.kopfB < 0.05 && z.rechner < 0.05 && z.ebene > 0.9)) f.push(`Explosion am Anfang nicht zerlegt (${JSON.stringify({ stapel: z.stapel, marken: z.marken, kopfB: z.kopfB, rechner: z.rechner, ebene: z.ebene })})`);
  const start = z.stapel;
  z = await an("[data-explosion]", "contain", 0.43, true);
  if (!(z.marken < 0.02 && z.stapel > 0.05 && z.stapel < start - 0.05)) f.push(`Explosion in der Mitte nicht halb (${JSON.stringify({ stapel: z.stapel, marken: z.marken })})`);
  if (!nah(z.buehne, kopf)) f.push(`Bühne der Explosion klebt nicht unter der Kopfleiste (oben ${z.buehne})`);
  z = await an("[data-explosion]", "contain", 1, true);
  if (!(z.stapel < 0.002 && z.rechner > 0.98 && z.kopfB > 0.98 && z.ebene < 0.02 && z.marken < 0.02)) f.push(`Explosion am Ende nicht zusammengesetzt (${JSON.stringify({ stapel: z.stapel, rechner: z.rechner, kopfB: z.kopfB, ebene: z.ebene })})`);
  const ende = z.buehne;
  z = await an("[data-explosion]", "contain", 1.25);
  if (!(z.buehne < ende - 20 && z.stapel < 0.002 && z.kopfB > 0.98)) f.push(`Explosion danach nicht gelöst oder nicht in der Endlage (oben ${z.buehne} statt < ${ende - 20})`);
  // Telefon: am Rechner gepinnt (contain), am Handy cover
  const tf = breit ? "contain" : "cover";
  const [t0, t1] = breit ? [0, 1] : [0.05, 0.75];
  // Text nie vom Telefon verdeckt: am Rechner bleibt es rechts der Textspalte, am Handy unter dem Text
  const verdeckt = (z, wo) => {
    if (breit ? z.tel.links < z.tel.textRechts - 1 : z.tel.oben < z.tel.textUnten - 1) f.push(`Telefon verdeckt ${wo} den Text (${JSON.stringify(z.tel)})`);
  };
  z = await an("[data-telefon]", tf, t0, true);
  if (!(z.telefon > (breit ? 0.2 : 0.05) && z.bildB < 0.02 && z.glocke < 0.02)) f.push(`Telefon am Anfang nicht gedreht (${JSON.stringify({ telefon: z.telefon, bildB: z.bildB, glocke: z.glocke })})`);
  verdeckt(z, "am Anfang");
  if (breit) {
    z = await an("[data-telefon]", tf, 0.45, true);
    if (!nah(z.tfBuehne, kopf)) f.push(`Bühne des Telefons klebt nicht unter der Kopfleiste (oben ${z.tfBuehne})`);
    if (!(z.telefon > 0.002 && z.telefon < 0.6)) f.push(`Telefon in der Mitte nicht im Aufrichten (${z.telefon})`);
    verdeckt(z, "in der Mitte");
  }
  z = await an("[data-telefon]", tf, t1, true);
  verdeckt(z, "am Ende");
  if (!(z.telefon < 0.002 && z.bildB > 0.98 && z.glocke > 0.98)) f.push(`Telefon am Ende nicht gerade (${JSON.stringify({ telefon: z.telefon, bildB: z.bildB, glocke: z.glocke })})`);
  // Aussage
  z = await an("[data-aussage]", "cover", 0.05);
  if (!(z.worte[0] < 0.3 && z.worte.at(-1) < 0.3)) f.push(`Aussage am Anfang nicht dunkel (${z.worte[0]}, ${z.worte.at(-1)})`);
  z = await an("[data-aussage]", "cover", 0.3, true);
  if (!(z.worte[0] > 0.98 && z.worte.at(-1) < 0.3)) f.push(`Aussage hellt nicht nacheinander auf (erstes Wort ${z.worte[0]}, letztes ${z.worte.at(-1)})`);
  z = await an("[data-aussage]", "cover", 0.6);
  if (Math.min(...z.worte) < 0.98) f.push(`Aussage am Ende nicht hell (${Math.min(...z.worte)})`);
  // Metall-„13“: Neigung zwischen Ein- und Auslaufen
  const m0 = (await an(".metall-13", "cover", 0.2)).metall;
  const m1 = (await an(".metall-13", "cover", 0.8)).metall;
  const a = new DOMMatrixReadOnlyLite(m0);
  const b = new DOMMatrixReadOnlyLite(m1);
  if (a.abstand(b) < 0.02) f.push(`Metall-„13“ neigt sich nicht (${m0} / ${m1})`);
  return f;
}

// Matrix aus der berechneten transform-Angabe (matrix(…) oder matrix3d(…)) – im Node-Prozess, ohne DOM
class DOMMatrixReadOnlyLite {
  constructor(t) {
    const z = (t.match(/-?[\d.]+(?:e-?\d+)?/g) ?? []).map(Number);
    this.w = t.startsWith("matrix3d") ? z : z.length === 6 ? [z[0], z[1], 0, 0, z[2], z[3], 0, 0, 0, 0, 1, 0, z[4], z[5], 0, 1] : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }
  abstand(o) {
    return Math.max(...this.w.slice(0, 12).map((x, i) => Math.abs(x - o.w[i])));
  }
}

// Umschalten zur Laufzeit ohne Sprung: „Bewegung anhalten“ an mehreren Stellen und wieder fortsetzen, dann „Bewegung
// reduzieren“ an und aus. Anker: die Bühne (in einer Strecke) bzw. ein Element des Kapitels; erlaubt sind 2 px.
async function umschaltenPruefen(browser, name, ohneSd, w, h) {
  const breit = w >= 900;
  const { ctx, page, meldungen } = await neueSeite(browser, ohneSd, { viewport: { width: w, height: h }, reducedMotion: "no-preference", hasTouch: w < 768 });
  const f = [];
  await page.goto(URL0, { waitUntil: "load" });
  await page.waitForTimeout(700);
  const ankerTop = (sel) => page.evaluate((s) => document.querySelector(s).getBoundingClientRect().top, sel);
  const knopf = () => page.evaluate(() => document.querySelector("[data-ruhe-knopf]").click());
  const stellen = [
    ["Explosion (Mitte)", () => page.evaluate(stelle, ["[data-explosion]", "contain", 0.5]), ".ex-buehne"],
    ["Kapitel 4", () => page.evaluate(() => document.querySelector(".k04").getBoundingClientRect().top + scrollY + 260), ".k04 .bereiche"],
    ...(breit ? [["Telefon (Mitte)", () => page.evaluate(stelle, ["[data-telefon]", "contain", 0.5]), ".tf-buehne"]] : []),
    ["Kapitel 8", () => page.evaluate(() => document.querySelector(".k08").getBoundingClientRect().top + scrollY + 120), ".k08 .datenblatt"],
    ["Fußzeile", () => page.evaluate(() => document.documentElement.scrollHeight), "[data-ruhe-knopf]"],
  ];
  for (const [ort, y, anker] of stellen) {
    await page.evaluate((yy) => window.scrollTo(0, yy), await y());
    await dreiBilder(page);
    await page.waitForTimeout(80);
    const vorher = await ankerTop(anker);
    await knopf();
    await dreiBilder(page);
    await page.waitForTimeout(80);
    const ruhig = await ankerTop(anker);
    const z = await page.evaluate(zustand);
    const end = endlageFehler(z);
    if (end.length) f.push(`${ort}, angehalten: ${end.join(", ")}`);
    if (Math.abs(ruhig - vorher) > 2) f.push(`${ort}: Sprung beim Anhalten (${Math.round(vorher)} → ${Math.round(ruhig)} px)`);
    await knopf();
    await dreiBilder(page);
    await page.waitForTimeout(80);
    const wieder = await ankerTop(anker);
    const z2 = await page.evaluate(zustand);
    if (Math.abs(wieder - ruhig) > 2) f.push(`${ort}: Sprung beim Fortsetzen (${Math.round(ruhig)} → ${Math.round(wieder)} px)`);
    if (z2.exWeg < 100 || (breit && z2.tfWeg < 100)) f.push(`${ort}: Strecken nach dem Fortsetzen nicht aufgeklappt`);
    if (!z2.anims) f.push(`${ort}: nach dem Fortsetzen keine Animationen`);
  }
  // „Bewegung reduzieren“ zur Laufzeit (Kapitel 4)
  await page.evaluate((yy) => window.scrollTo(0, yy), await stellen[1][1]());
  await dreiBilder(page);
  const vorher = await ankerTop(".k04 .bereiche");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await dreiBilder(page);
  await page.waitForTimeout(120);
  const reduziert = await ankerTop(".k04 .bereiche");
  const zr = await page.evaluate(zustand);
  if (Math.abs(reduziert - vorher) > 2) f.push(`„Bewegung reduzieren“ an: Sprung (${Math.round(vorher)} → ${Math.round(reduziert)} px)`);
  if (endlageFehler(zr).length) f.push(`„Bewegung reduzieren“ an: ${endlageFehler(zr).join(", ")}`);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await dreiBilder(page);
  await page.waitForTimeout(120);
  const wieder = await ankerTop(".k04 .bereiche");
  if (Math.abs(wieder - reduziert) > 2) f.push(`„Bewegung reduzieren“ aus: Sprung (${Math.round(reduziert)} → ${Math.round(wieder)} px)`);
  if (meldungen.length) f.push(`Konsole: ${[...new Set(meldungen)].join(" | ")}`);
  await ctx.close();
  return [!f.length, `${name}${ohneSd ? " ohne scroll-driven" : ""} · Umschalten zur Laufzeit · ${w}×${h}${f.length ? ": " + f.slice(0, 6).join(" · ") : ": ohne Sprung (Anhalten an " + stellen.length + " Stellen, Fortsetzen, Bewegung reduzieren an/aus)"}`];
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

// 1024 × 720 (seit Bau 2): die niedrigste Rechnerhöhe aus dem Bauplan – das gepinnte Telefon muss dort in Zwischenstufen
// neben dem Text Platz haben
const GROESSEN = schnell ? [[390, 844], [1440, 900]] : [[320, 568], [390, 844], [768, 1024], [1024, 768], [1024, 720], [1440, 900], [1920, 1080]];
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
        if (ohneSd) await ohneScrollDriven(page);
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
          const s = await page.evaluate(() => {
            const k = document.querySelector("[data-kopf]")?.dataset.kapitel;
            const aktiv = [...document.querySelectorAll(".kopf-leiste [data-navi][aria-current]")];
            return { k, navi: aktiv.length, eintrag: aktiv.map((a) => a.dataset.navi).join("/"), passt: aktiv.every((a) => a.dataset.navi.split(" ").includes(k)) };
          });
          if (s.navi !== 1 || !s.passt) kapitelFehler.push(`${y}px: Kapitel ${s.k}, ${s.navi} Einträge (${s.eintrag})`);
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
        z.bewegung = bewegung === "reduce" ? endlageFehler(await page.evaluate(zustand)) : await bewegungPruefen(page, w);
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
        if (z.bewegung.length) probleme.push(`Bewegung: ${z.bewegung.slice(0, 5).join("; ")}`);
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
    // Ohne JavaScript und Umschalten zur Laufzeit (je Browser einmal, Rechner und Handy)
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      if (!ohneSd) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, javaScriptEnabled: false, reducedMotion: "no-preference" });
        const page = await ctx.newPage();
        await page.goto(URL0, { waitUntil: "load" });
        await page.waitForTimeout(200);
        const z = await page.evaluate(zustand);
        const f = endlageFehler(z);
        if (z.sw > z.cw) f.push(`seitliches Scrollen (${z.sw} > ${z.cw})`);
        melde(!f.length, `${name} · ohne JavaScript · ${w}×${h}: Endlage, Strecken eingeklappt${f.length ? ": " + f.join(" · ") : ""}`);
        await ctx.close();
      }
      melde(...(await umschaltenPruefen(browser, name, ohneSd, w, h)));
    }
    await browser.close();
  }
} finally {
  server.close();
}
console.log(fehler ? `\n${fehler} Fehler` : "\nAlle Prüfungen bestanden.");
process.exit(fehler ? 1 : 0);
