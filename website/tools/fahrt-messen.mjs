// Misst, wie flüssig die gepinnten Bühnen der Startseite laufen (seit Bau 2, 16.11.2026: die Explosion in Kapitel 1 und
// das große Telefon in Kapitel 6; die Kamerafahrt der Gestaltung B4 gibt es nicht mehr) – wiederholbar, damit sich
// vorher und nachher vergleichen lassen. Je Fall: Seite laden, warten, bis sie steht (load, Bilder der Explosion
// dekodiert, 600 ms Ruhe), dann
//   - Telefon: 0,3 Fensterhöhen vor das Pinnen springen und mit dem Mausrad durch die ganze Strecke bis 0,5 Fensterhöhen
//     hinter das Lösen der Bühne scrollen (bei „-zurueck“ von dort rückwärts an den Anfang),
//   - Explosion (seit 26.11.2026 selbstlaufend, auf der Zeit): oben ein kleiner Anstoß mit dem Mausrad (80 px), danach
//     läuft der Zusammenbau von selbst – gemessen wird, bis er fertig ist und die Seite ruht (gut 2,5 s; „anstoss“);
//     „anstoss-zurueck“: zusammengesetzt bei 80 px, Anstoß nach oben, die Explosion läuft rückwärts auseinander;
//     „anstoss-weiter“: Anstoß und gleich weiter wie ein Trackpad (900 px), die Bühne löst sich, während sie läuft;
// und messen:
//   - gezeigte Bilder (Chromium: Display::DrawAndSwap im GPU-Prozess, also was wirklich auf den Bildschirm kommt; WebKit:
//     requestAnimationFrame) und Lücken > 16,7 / > 33 / > 100 ms (gezählt ab 1,5 / 2,5 / 6 Bildern, damit das Zittern
//     des Taktgebers nicht mitzählt), verpasste Bilder bei 60 Hz
//   - Hauptthread: Abstände der requestAnimationFrame-Aufrufe, Renderzeit je Bild (Ende der rAF-Rückrufe bis zur
//     nächsten Aufgabe: Stil, Layout, Paint, Übergabe – auch in WebKit), Long Animation Frames (mit Skript und Funktion),
//     lange Aufgaben; Zeit nach Art (Skript, Stil, Layout, Paint, Layer/Commit, GC, Beobachter, Canvas, Dekodierung)
//   - GPU-Prozess: Stopps beim Zeichnen, davon Pipeline-/Shader-Kompilierung (Dawn/Graphite), Rasterung, Dekodierung
//   - je verpasstem Bild die Ursache (was in der Lücke lief) und in welchem Abschnitt der Strecke es geschah (Phasen wie
//     die Keyframe-Offsets in site.css, dazu „vorher“ und „danach“; Explosion: nach der Zeit ihrer Animationen)
//   - Speicher (JS-Heap, GPU-Speicher des Renderers), CPU-Zeit von Renderer und GPU-Prozess
//   - (Chromium, eigener Durchgang je Strecke) Compositing-Ebenen mit Gründen, welche Ebenen während der Strecke neu
//     gezeichnet bzw. neu gerastert werden (Explosion: während des Ablaufs und getrennt nach seinem Ende – dort darf
//     nichts neu gerastert werden, sonst sähe man einen Sprung von unscharf nach scharf), und welche Animationen der
//     Bühnen (ex-*, tf-*, aw-*, mz-*) nicht auf dem Compositor laufen
// Browser: „chrome“ = Google Chrome (headless, mit GPU über Metal, Standard), „shell“ = Playwright-Chromium ohne GPU
// (wie b4-pruefen.mjs), „cft“ = Chrome for Testing, „webkit“ = Playwright-WebKit (nur Hauptthread-Werte; es gibt dort
// keine Spur und kein Compositing in Bildschirmfotos). Kalt = neues Profil (kein HTTP- und kein GPU-Speicher des Browsers),
// warm = dasselbe Profil nach einem ersten Besuch mit Durchscrollen der ganzen Seite und Neustart des Browsers. Den
// Shader-Speicher von Metal (systemweit) leert das Werkzeug nicht: Was ein Effekt beim allerersten Zeichnen kostet
// (Pipeline-Kompilierung, 80–160 ms je neuem Effekt), zeigt nur der erste Lauf nach einer Änderung – deshalb steht
// „Kompil.“ in der Tabelle. Den Energiesparmodus von Chrome schaltet das Werkzeug im Profil aus (sonst 30 Bilder/s im
// Akkubetrieb unter 20 %). Der Server ist eingebaut (Header aus _headers wie tools/serve.mjs, dazu die Cache-Regel für
// /assets/* – serve.mjs sendet no-store, damit wäre „warm“ nicht warm).
//
//   node tools/fahrt-messen.mjs                       ganze Matrix (chrome, webkit × 1440×900@1, 1440×900@2,
//                                                     1280×800@1, 1280×740@2 × kalt, warm × beide Strecken; Telefon
//                                                     trackpad, schnell; Explosion anstoss, anstoss-zurueck), dauert gut
//                                                     zwanzig Minuten
//   --strecke explosion|telefon|beide                 welche gepinnte Bühne (Standard: beide)
//   --browser chrome,webkit,shell,cft   --fenster 1440x900@1,1280x800@1   --cache kalt,warm
//   --scroll trackpad,schnell,geste,geste-schnell,trackpad-zurueck,schnell-zurueck   (Telefon)
//                       trackpad (~700 px/s) und schnell (~2500 px/s): Mausrad-Schritte alle 16 ms, sanft an- und
//                       auslaufend; geste, geste-schnell (nur Chromium): Input.synthesizeScrollGesture, eine vom Browser
//                       im Bildtakt erzeugte Mausrad-Geste mit 700 bzw. 2500 px/s – ohne die Schwebung zwischen
//                       16-ms-Schritten und 60 Hz; „-zurueck“: vom Ende rückwärts durch die Strecke an den Anfang
//            anstoss,anstoss-zurueck,anstoss-weiter   (Explosion, siehe oben; Standard: anstoss,anstoss-zurueck)
//                       Jede Strecke nimmt aus --scroll die Arten, die zu ihr passen, sonst ihren Standard.
//   --vor 0.3 --nach 0.5  Weg vor dem Anfang bzw. hinter dem Ende der Strecke in Fensterhöhen
//   --runden 2          jeden Fall mehrmals (Mittelwerte in der Tabelle, Einzelwerte im JSON)
//   --pause 300         ms zwischen Ruhe und erstem Scrollschritt
//   --gegenprobe a,b    zusätzlich jeden Fall mit abgeschalteter Wirkung (nur für die Messung, über eine angehängte
//                       Stilregel bzw. ein geändertes HTML im Server, die Dateien bleiben unberührt); Namen siehe GEGENPROBEN,
//                       mehrere zugleich mit „+“ (schatten+glanz); --gegenproben listet sie auf
//   --ohne-ebenen / --nur-ebenen   Durchgang für Ebenen und Animationen weglassen bzw. nur ihn (Standard: mit, nur
//                       Chromium, einmal je Fenster und Strecke)
//   --trace <Ordner>    die Spuren (Chromium) als JSON speichern (in DevTools → Performance ladbar)
//   --json <Datei>      alle Werte als JSON
//   --port 4391
// Playwright kommt aus dem Hauptordner des Repositories (VF_APP_DIR, sonst ein Ordner über website/, im Worktree der
// Hauptordner laut git).
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Playwright: aus VF_APP_DIR, sonst aus dem Ordner über website/, sonst (Worktree) aus dem Hauptordner des Repositories
let pw;
function playwrightLaden() {
  const orte = [process.env.VF_APP_DIR, path.resolve(root, "..")];
  try {
    const git = execFileSync("git", ["-C", root, "rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
    orte.push(path.dirname(git));
  } catch {}
  for (const ort of orte.filter(Boolean)) {
    try {
      return createRequire(path.join(ort, "package.json"))("playwright");
    } catch {}
  }
  throw new Error("Playwright nicht gefunden – im Hauptordner des Repositories npm install ausführen oder VF_APP_DIR setzen");
}

// ---------------------------------------------------------------------------------------------------------------
// Aufruf
// ---------------------------------------------------------------------------------------------------------------
const argv = process.argv.slice(2);
const opt = (name, std) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : std;
};
const hat = (name) => argv.includes(`--${name}`);
const liste = (name, std) => opt(name, std).split(",").map((s) => s.trim()).filter(Boolean);
const BROWSER = liste("browser", "chrome,webkit");
// 1280x740@2: MacBook Air 13" (2560 × 1664) mit Browserleiste
const FENSTER = liste("fenster", "1440x900@1,1440x900@2,1280x800@1,1280x740@2").map((f) => {
  const m = /^(\d+)x(\d+)(?:@([\d.]+))?$/.exec(f);
  if (!m) throw new Error(`Fenster „${f}“: Breite x Höhe @ Pixeldichte, z. B. 1440x900@2`);
  return { name: f.includes("@") ? f : `${f}@1`, width: Number(m[1]), height: Number(m[2]), dpr: Number(m[3] ?? 1) };
});
const CACHE = liste("cache", "kalt,warm");
const SCROLL = liste("scroll", "");
const SCROLL_TELEFON = /^(trackpad|schnell|geste|geste-schnell)(-zurueck)?$/;
const SCROLL_EXPLOSION = /^anstoss(-zurueck|-weiter)?$/;
for (const s of SCROLL) if (!SCROLL_TELEFON.test(s) && !SCROLL_EXPLOSION.test(s)) throw new Error(`Scroll-Art „${s}“ unbekannt (trackpad, schnell, geste, geste-schnell, je auch mit -zurueck; anstoss, anstoss-zurueck, anstoss-weiter)`);
// Die gepinnten Bühnen: Element der Zeitleiste (site.css) und die Abschnitte der Strecke (Fortschritt der Zeitleiste bis
// zur genannten Grenze, wie die Keyframe-Offsets in site.css). Die Explosion läuft auf der Zeit (zeit: true) – ihre
// Abschnitte sind Anteile der Dauer ihrer Animationen (2,5 s), rückwärts dieselben Anteile.
const STRECKE = {
  explosion: { sel: "[data-explosion]", name: "Explosion", zeit: true, scroll: SCROLL_EXPLOSION, standard: ["anstoss", "anstoss-zurueck"], abschnitte: [[0.065, "0–6,5 % Beschriftung"], [0.46, "6,5–46 % Zusammenbau"], [0.76, "46–76 % Ebenen in die Platte"], [1.0001, "76–100 % Laptop, Kopf B"]] },
  telefon: { sel: "[data-telefon]", name: "Telefon", scroll: SCROLL_TELEFON, standard: ["trackpad", "schnell"], abschnitte: [[0.06, "0–6 % gedreht"], [0.7, "6–70 % Aufrichten"], [0.8, "70–80 % Glocke"], [1.0001, "80–100 % halten"]] },
};
// Scroll-Arten je Strecke: die passenden aus --scroll, sonst der Standard der Strecke
const scrollArten = (name) => {
  const passend = SCROLL.filter((x) => STRECKE[name].scroll.test(x));
  return passend.length ? passend : STRECKE[name].standard;
};
// Explosion: Weg des Anstoßes und des Weiterscrollens (px)
const ANSTOSS = 80;
const WEITER = 900;
const STRECKEN = liste("strecke", "beide").flatMap((s) => (s === "beide" ? ["explosion", "telefon"] : [s]));
for (const s of STRECKEN) if (!STRECKE[s]) throw new Error(`Strecke „${s}“ unbekannt (explosion, telefon, beide)`);
const ABSCHNITTE = (name) => ["vorher", ...STRECKE[name].abschnitte.map(([, n]) => n), "danach"];
const RUNDEN = Number(opt("runden", "1"));
const VOR = Number(opt("vor", "0.3"));
const NACH = Number(opt("nach", "0.5"));
const PAUSE = Number(opt("pause", "300"));
const PORT = Number(opt("port", "4391"));
const TRACE_DIR = opt("trace", "");
const JSON_OUT = opt("json", "");
const EBENEN = !hat("ohne-ebenen");

// Gegenproben: schalten genau eine Wirkung ab (nur in der Messung; angehängt an site.css bzw. im HTML ersetzt)
const GEGENPROBEN = {
  kopfblur: { text: "Kopfleiste ohne backdrop-filter", css: ".kopf::before { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }" },
  schatten: { text: "Explosion ohne die weichgezeichneten Schatten unter den Ebenen (filter: blur)", css: ".ex-schatten { display: none !important; }" },
  willchange: { text: "kein will-change an den Bühnen (sonst nur, solange sie nahe am Fenster sind)", css: ".ist-nah *, .ist-nah *::after { will-change: auto !important; }" },
  glanz: { text: "Metall-Zahlen ohne die beiden zusätzlichen Glanz-Lagen", css: ".metall-glanz.mz-l, .metall-glanz.mz-r { display: none !important; }" },
  ohnebewegung: {
    text: "nur zum Messen: alle Animationen der Bühnen aus (Strecken bleiben) – zeigt, was die Bewegung selbst kostet; in der Explosion läuft statt ihrer ein winziger Taktgeber gleicher Dauer (Deckkraft eines 4-px-Punkts), den bewegung.js wie sie startet – sonst zeichnete der Browser nach dem Anstoß gar nichts",
    css: ":is(.ex-strecke, .tf-strecke, .aussage, .metall) :is(*, *::after) { animation: none !important; } .js .ex-buehne::before { content: \"\"; position: absolute; left: 8px; top: 8px; width: 4px; height: 4px; background: #fff; opacity: 0.02; animation: ex-takt 2.5s linear both paused; } @keyframes ex-takt { from { opacity: 0.02; } to { opacity: 0.06; } }",
  },
  leer: { text: "nur zum Messen: nichts abgeschaltet, nur dieselbe Auslieferung wie bei jeder Gegenprobe (no-store, angehängte Regel)", css: ".vf-gegenprobe-leer { color: inherit; }" },
};
const PROBEN = ["", ...liste("gegenprobe", "")];
if (hat("gegenproben")) {
  for (const [k, v] of Object.entries(GEGENPROBEN)) console.log(`${k.padEnd(14)} ${v.text}`);
  process.exit(0);
}
// mehrere zugleich mit „+“, z. B. schatten+glanz
const probeVon = (name) => {
  const teile = name.split("+").map((n) => GEGENPROBEN[n]);
  if (teile.some((t) => !t)) throw new Error(`Gegenprobe „${name}“ unbekannt (${Object.keys(GEGENPROBEN).join(", ")})`);
  const css = teile.map((t) => t.css).filter(Boolean).join("\n");
  const html = teile.map((t) => t.html).filter(Boolean);
  return { css, html };
};
for (const p of PROBEN) if (p) probeVon(p);

// ---------------------------------------------------------------------------------------------------------------
// Server: Dateien der Website mit den Headern aus _headers (Block „/*“ und Cache-Regel „/assets/*“)
// ---------------------------------------------------------------------------------------------------------------
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};
function headerBloecke() {
  const bloecke = {};
  let block = null;
  for (const line of fs.readFileSync(path.join(root, "_headers"), "utf8").split(/\r?\n/)) {
    if (/^\S/.test(line) && !line.startsWith("#")) block = bloecke[line.trim()] = {};
    else if (block && /^\s+[\w-]+:/.test(line)) {
      const [name, ...rest] = line.trim().split(":");
      if (name.toLowerCase() !== "strict-transport-security") block[name] = rest.join(":").trim();
    }
  }
  return bloecke;
}
const HEADER = headerBloecke();
let probeJetzt = ""; // aktuelle Gegenprobe (der Server liefert dann geänderte Dateien, ohne Zwischenspeicher)
const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let p = decodeURIComponent(url.pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(root, p);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    return res.end("404");
  }
  const kopf = { "Content-Type": TYPES[path.extname(file)] ?? "application/octet-stream", ...HEADER["/*"] };
  kopf["Cache-Control"] = p.startsWith("/assets/") ? (HEADER["/assets/*"]?.["Cache-Control"] ?? "public, max-age=86400") : "no-cache";
  const probe = probeJetzt && probeVon(probeJetzt);
  if (probe && ((probe.css && p === "/assets/css/site.css") || (probe.html.length && p === "/index.html"))) {
    let text = fs.readFileSync(file, "utf8");
    if (probe.css) text += `\n/* Gegenprobe ${probeJetzt} */\n@media all { ${probe.css} }\n`;
    for (const [re, neu] of probe.html) text = text.replace(re, neu);
    kopf["Cache-Control"] = "no-store";
    res.writeHead(200, kopf);
    return res.end(text);
  }
  res.writeHead(200, kopf);
  fs.createReadStream(file).pipe(res);
});

// ---------------------------------------------------------------------------------------------------------------
// In der Seite (vor allen Skripten): Messpunkte
// ---------------------------------------------------------------------------------------------------------------
function messpunkte() {
  const vf = (window.__vf = { loaf: [], lt: [], ereignisse: [], bilder: [], laeuft: false });
  const jetzt = () => performance.now();
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        vf.loaf.push({
          start: e.startTime,
          dauer: e.duration,
          blockiert: e.blockingDuration,
          renderStart: e.renderStart,
          stilStart: e.styleAndLayoutStart,
          skripte: e.scripts.map((s) => ({
            start: s.startTime,
            dauer: s.duration,
            erzwungen: s.forcedStyleAndLayoutDuration,
            aufrufer: s.invoker,
            art: s.invokerType,
            quelle: (s.sourceURL || "").replace(/^.*\//, "").replace(/\?.*$/, ""),
            funktion: s.sourceFunctionName,
          })),
        });
      }
    }).observe({ type: "long-animation-frame", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) vf.lt.push({ start: e.startTime, dauer: e.duration });
    }).observe({ type: "longtask", buffered: true });
  } catch {}
  // Zustände der Bühnen (.ist-nah: will-change an/aus, bewegung.js) und geladene Bilder, mit Zeit und Scrollstand
  document.addEventListener("DOMContentLoaded", () => {
    const merke = (was) => vf.ereignisse.push({ t: jetzt(), was, y: scrollY });
    const stand = new Map();
    const mo = new MutationObserver((recs) => {
      for (const r of recs) {
        const an = r.target.classList.contains("ist-nah");
        if (stand.get(r.target) === an) continue;
        stand.set(r.target, an);
        merke(`${r.target.matches("[data-explosion]") ? "Explosion" : "Telefon"} nah ${an ? "an" : "aus"}`);
      }
    });
    for (const b of document.querySelectorAll("[data-explosion], [data-telefon]")) {
      stand.set(b, b.classList.contains("ist-nah"));
      mo.observe(b, { attributes: true, attributeFilter: ["class"] });
    }
    for (const img of document.querySelectorAll(".k01 img, .k06 img")) img.addEventListener("load", () => merke(`geladen ${img.currentSrc.replace(/^.*\//, "").replace(/\?.*$/, "")}`));
  });
  // Bildtakt des Hauptthreads (nur während der Messung). Je Bild auch die Renderzeit: vom Ende der rAF-Rückrufe bis zur
  // nächsten Aufgabe (Stil, Layout, Paint und Übergabe an den Compositor laufen dazwischen, in Chromium wie in WebKit)
  const kanal = new MessageChannel();
  let offen = null;
  kanal.port1.onmessage = () => {
    if (offen) offen[2] = performance.now() - offen[3];
    offen = null;
  };
  const takt = (t) => {
    if (!vf.laeuft) return;
    const eintrag = [t, scrollY, null, performance.now()];
    vf.bilder.push(eintrag);
    offen = eintrag;
    kanal.port2.postMessage(0);
    requestAnimationFrame(takt);
  };
  // Puls: eine Aufgabe alle ~4 ms – fehlt er lange, war der Hauptthread belegt (sonst lag eine Lücke im Bildtakt
  // außerhalb des Hauptthreads: Compositor, UI- bzw. GPU-Prozess)
  const puls = () => {
    if (!vf.laeuft) return;
    vf.puls.push(performance.now());
    setTimeout(puls, 4);
  };
  vf.start = () => {
    vf.bilder = [];
    vf.puls = [];
    vf.laeuft = true;
    vf.t0 = jetzt();
    requestAnimationFrame(takt);
    setTimeout(puls, 4);
  };
  vf.stop = () => {
    vf.laeuft = false;
    vf.t1 = jetzt();
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Scrollen: Mausrad in Schritten alle 16 ms (Trackpad: ruhig, im Mittel ~700 px/s; schnell: ~2500 px/s), sanft an- und
// auslaufend (Sinus). Die Schritte werden zeitgenau geschickt, ohne auf die Bestätigung des vorigen zu warten.
// ---------------------------------------------------------------------------------------------------------------
const PROFILE = { trackpad: 700, schnell: 2500 };
function schritte(strecke, art) {
  const tempo = PROFILE[art] ?? Number(art);
  const n = Math.max(8, Math.round(strecke / tempo / 0.016));
  const roh = Array.from({ length: n }, (_, i) => Math.sin((Math.PI * (i + 0.5)) / n));
  const summe = roh.reduce((a, b) => a + b, 0);
  let rest = 0;
  return roh.map((r) => {
    const v = (r / summe) * strecke + rest;
    const ganz = Math.round(v);
    rest = v - ganz;
    return ganz;
  });
}
const warte = (ms) => new Promise((r) => setTimeout(r, ms));
async function scrollen(page, cdp, deltas, x, y) {
  const t0 = performance.now();
  const offen = [];
  for (let i = 0; i < deltas.length; i++) {
    const soll = t0 + i * 16;
    const d = soll - performance.now();
    if (d > 1) await warte(d);
    offen.push(
      cdp
        ? cdp.send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: deltas[i] }).catch(() => {})
        : page.mouse.wheel(0, deltas[i]).catch(() => {}),
    );
  }
  await Promise.all(offen);
  return performance.now() - t0;
}

// ---------------------------------------------------------------------------------------------------------------
// Auswertung der Spur (Chromium)
// ---------------------------------------------------------------------------------------------------------------
const ART = [
  [/^(MinorGC|MajorGC|V8\.GC_.*|BlinkGC\..*|V8\.GCScavenger|V8\.GCFinalizeMC.*|V8\.GCIncrementalMarking)$/, "GC"],
  [/^(Decode Image|ImageDecodeTask|Decode LazyPixelRef|ImageFrameGenerator::decode.*|GpuImageDecodeCache::DecodeImage)$/, "Dekodierung"],
  [/^(IntersectionObserverController::computeIntersections|LocalFrameView::UpdateViewportIntersectionsForSubtree)$/, "IntersectionObserver"],
  [/^(LocalFrameView::NotifyResizeObservers)$/, "ResizeObserver"],
  [/^(HitTest|LayoutView::HitTest)$/, "HitTest"],
  [/^(CanvasRenderingContext2D::FinalizeFrame|Canvas2DResourceProvider::.*|RasterImplementation::RasterCHROMIUM)$/, "Canvas"],
  [/^(UpdateLayoutTree|Document::recalcStyle|Document::updateStyle|ParseAuthorStyleSheet)$/, "Stil"],
  [/^(Layout|LocalFrameView::layout|LocalFrameView::performLayout)$/, "Layout"],
  [/^(PrePaint)$/, "PrePaint"],
  [/^(Paint|PaintImage|LocalFrameView::RunPaintLifecyclePhase)$/, "Paint"],
  [/^(Layerize|Commit|UpdateLayer|LayerTreeHost::DoUpdateLayers|LocalFrameView::pushPaintArtifactToCompositor)$/, "Layer/Commit"],
  [/^(FunctionCall|EvaluateScript|v8\.callFunction|v8\.run|TimerFire|FireAnimationFrame|EventDispatch|FireIdleCallback|v8\.compile|V8\.CompileCode|RunMicrotasks|v8\.evaluateModule|AsyncTask Run)$/, "Skript"],
  [/^(ParseHTML|ResourceReceivedData|ResourceFinish|ResourceReceiveResponse)$/, "Laden"],
];
const artVon = (name) => ART.find(([re]) => re.test(name))?.[1];
const TOP = /^(ThreadControllerImpl::RunTask|RunTask)$/;

function spurAuswerten(text, fahrt) {
  const roh = JSON.parse(text);
  const ev = roh.traceEvents ?? roh;
  const tn = new Map();
  const pn = new Map();
  for (const e of ev) {
    if (e.ph !== "M") continue;
    if (e.name === "thread_name") tn.set(`${e.pid}:${e.tid}`, e.args.name);
    if (e.name === "process_name") pn.set(e.pid, e.args.name);
  }
  const start = ev.find((e) => e.name === "vf-start");
  const ende = ev.find((e) => e.name === "vf-ende");
  if (!start || !ende) return null;
  const rpid = start.pid;
  const gpid = [...pn].find(([, n]) => n === "GPU Process")?.[0];
  const faden = (pid, name) => [...tn].filter(([k, n]) => k.startsWith(`${pid}:`) && n === name).map(([k]) => Number(k.split(":")[1]));
  const [main] = faden(rpid, "CrRendererMain");
  const [comp] = faden(rpid, "Compositor");
  const [gmain] = faden(gpid, "CrGpuMain");
  const [viz] = faden(gpid, "VizCompositorThread");
  const A = start.ts;
  const B = ende.ts;
  // Seitenzeit (performance.now) ↔ Spurzeit: vf-start wurde bei fahrt.tStart gesetzt
  const zuSeite = (ts) => fahrt.tStart + (ts - A) / 1000;
  const imFenster = (e) => e.ph === "X" && e.ts + (e.dur ?? 0) > A && e.ts < B;
  const X = ev.filter(imFenster);
  const auf = (pid, tid) => X.filter((e) => e.pid === pid && e.tid === tid).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const mainEv = auf(rpid, main);
  const gpuEv = auf(gpid, gmain);
  const compEv = auf(rpid, comp);
  const werker = X.filter((e) => e.pid === rpid && /ThreadPool|Compositor(Tile)?Worker|Raster/.test(tn.get(`${e.pid}:${e.tid}`) ?? ""));
  const gWerker = X.filter((e) => e.pid === gpid && e.tid !== gmain && e.tid !== viz);

  // Selbstzeit je Art auf dem Hauptthread (Zeit eines Ereignisses ohne Art zählt zur Art des nächsten Vorfahren)
  const nachArt = {};
  const nachSkript = {};
  const stapel = [];
  for (const e of mainEv) {
    while (stapel.length && stapel.at(-1).ende <= e.ts) stapel.pop();
    const eltern = stapel.at(-1);
    const art = artVon(e.name) ?? eltern?.art ?? "Sonstiges";
    let skript = eltern?.skript;
    if (e.name === "FunctionCall" && e.args?.data?.url) skript = `${e.args.data.url.replace(/^.*\//, "").replace(/\?.*$/, "")}:${e.args.data.functionName || "(anonym)"}`;
    else if (!skript && /^(FireAnimationFrame|TimerFire|FireIdleCallback|EventDispatch)$/.test(e.name)) skript = e.name;
    const knoten = { ende: e.ts + (e.dur ?? 0), art, skript, kinder: 0, elternArt: eltern?.art };
    if (eltern) eltern.kinder += e.dur ?? 0;
    stapel.push(knoten);
    e._k = knoten;
  }
  for (const e of mainEv) {
    const k = e._k;
    const selbst = Math.max(0, (e.dur ?? 0) - k.kinder) / 1000;
    nachArt[k.art] = (nachArt[k.art] ?? 0) + selbst;
    if (k.art === "Skript" && k.skript) nachSkript[k.skript] = (nachSkript[k.skript] ?? 0) + selbst;
  }

  // Aufgaben der obersten Ebene (ThreadControllerImpl::RunTask, sonst RunTask; ineinander geschachtelte nur einmal)
  const top = (liste) => {
    const name = liste.some((e) => e.name === "ThreadControllerImpl::RunTask") ? "ThreadControllerImpl::RunTask" : "RunTask";
    const aus = [];
    let bis = -1;
    for (const e of liste) {
      if (e.name !== name || e.ts < bis) continue;
      aus.push(e);
      bis = e.ts + e.dur;
    }
    return aus;
  };
  const mainTop = top(mainEv);
  const gpuTop = top(gpuEv);
  const dawn = gWerker.filter((e) => e.name === "DawnPlatformImpl::RunWorkerTask" && e.dur > 4000);
  const raster = werker.filter((e) => e.name === "RasterTask");
  const dekod = [...werker, ...mainEv].filter((e) => e.name === "ImageDecodeTask" || (e.name === "Decode Image" && e.tid === main));
  const gc = mainEv.filter((e) => e.name === "MinorGC" || e.name === "MajorGC");
  const finish = gpuEv.filter((e) => e.name === "SkiaOutputSurfaceImplOnGpu::FinishPaintRenderPass");
  const summe = (l) => l.reduce((a, e) => a + e.dur / 1000, 0);

  // Gezeigte Bilder: Display::DrawAndSwap im GPU-Prozess, nur solange gescrollt wird (bis die Scrollposition ruht)
  const swaps = ev.filter((e) => e.pid === gpid && e.name === "Display::DrawAndSwap" && e.ts >= A && e.ts <= B).map((e) => e.ts).sort((a, b) => a - b);
  const aktivBis = A + (fahrt.tRuhe - fahrt.tStart) * 1000;
  const luecken = [];
  for (let i = 1; i < swaps.length; i++) {
    if (swaps[i] > aktivBis) break;
    luecken.push({ a: swaps[i - 1], b: swaps[i], ms: (swaps[i] - swaps[i - 1]) / 1000 });
  }
  // Was lief in einer Lücke? (Überlappung in ms)
  const ueber = (liste, a, b) => liste.reduce((s, e) => s + Math.max(0, Math.min(b, e.ts + e.dur) - Math.max(a, e.ts)) / 1000, 0);
  const artIn = (a, b) => {
    const m = {};
    for (const e of mainEv) {
      const k = e._k;
      const s = Math.max(0, Math.min(b, e.ts + e.dur) - Math.max(a, e.ts));
      if (!s) continue;
      // nur Selbstzeit-Anteil grob: Blätter zählen voll, Eltern ohne Kinder in der Lücke
      if (k.kinder === 0) m[k.art] = (m[k.art] ?? 0) + s / 1000;
    }
    return Object.entries(m).sort((x, y) => y[1] - x[1])[0]?.[0] ?? "Sonstiges";
  };
  const ursachen = {};
  const verpasstJe = [];
  for (const l of luecken) {
    if (l.ms <= 25) continue;
    const verpasst = Math.max(1, Math.round(l.ms / 16.667) - 1);
    const fen = [l.a, l.b];
    const k = ueber(dawn, ...fen);
    const g = ueber(gpuTop, ...fen);
    const m = ueber(mainTop, ...fen);
    const r = ueber(raster, ...fen);
    const d = ueber(dekod, ...fen);
    let ursache;
    if (k > l.ms * 0.3) ursache = "GPU: Pipeline-/Shader-Kompilierung (Dawn)";
    else if (d > l.ms * 0.3) ursache = "Bild-Dekodierung";
    else if (g >= Math.max(m, r) && g > l.ms * 0.3) ursache = "GPU: Zeichnen/Rasterflush";
    else if (r >= m && r > l.ms * 0.3) ursache = "Rasterung (Kacheln)";
    else if (m > l.ms * 0.3) ursache = `Hauptthread: ${artIn(...fen)}`;
    else ursache = "unklar (kein Thread ausgelastet)";
    ursachen[ursache] = (ursachen[ursache] ?? 0) + verpasst;
    verpasstJe.push({ t: zuSeite(l.b), ms: l.ms, verpasst, ursache, gpuStopp: g, kompil: k, haupt: m, raster: r });
  }

  // Bildzustände des Compositors (PipelineReporter): verworfen bzw. ohne Hauptthread-Anteil gezeigt
  const pr = ev.filter((e) => e.name === "PipelineReporter" && e.ph === "b" && e.ts >= A && e.ts <= aktivBis);
  const zustaende = {};
  for (const e of pr) {
    const f = e.args?.frame_reporter ?? e.args?.chrome_frame_reporter ?? {};
    const k = f.state ?? "?";
    zustaende[k] = (zustaende[k] ?? 0) + 1;
  }
  const gpuMem = Math.max(0, ...ev.filter((e) => e.name === "GPUTask" && e.pid === gpid && e.ts >= A && e.ts <= B).map((e) => e.args?.data?.used_bytes ?? 0));
  const anfragen = ev
    .filter((e) => e.name === "ResourceSendRequest" && e.ts >= A && e.ts <= B)
    .map((e) => ({ t: zuSeite(e.ts), url: (e.args?.data?.url ?? "").replace(/^.*\//, "").replace(/\?.*$/, "") }));
  const dekodierungen = dekod
    .filter((e) => e.name === "ImageDecodeTask" || e.tid === main)
    .map((e) => ({ t: zuSeite(e.ts), ms: e.dur / 1000, faden: e.tid === main ? "Hauptthread" : "Werker" }));
  const langMain = mainTop.filter((e) => e.dur > 50000).map((e) => ({ t: zuSeite(e.ts), ms: e.dur / 1000 }));
  const begin = mainEv.filter((e) => e.name === "ProxyMain::BeginMainFrame");
  // je Hauptthread-Bild: Dauer und PrePaint darin; je Compositor-Bild: Dauer des Zeichnens
  const prePaint = mainEv.filter((e) => e.name === "PrePaint");
  const bmfListe = begin.map((b) => {
    let pp = 0;
    for (const e of prePaint) if (e.ts >= b.ts && e.ts + e.dur <= b.ts + b.dur && e._k && e._k.elternArt !== "PrePaint") pp += e.dur / 1000;
    return [zuSeite(b.ts), b.dur / 1000, pp];
  });
  const drawListe = compEv.filter((e) => e.name === "ProxyImpl::ScheduledActionDraw").map((e) => [zuSeite(e.ts), e.dur / 1000]);
  return {
    bilder: swaps.filter((t) => t <= aktivBis).length,
    luecken: luecken.map((l) => l.ms),
    ursachen,
    verpasstJe,
    zustaende,
    nachArt,
    nachSkript,
    hauptLang: langMain,
    bmfListe,
    drawListe,
    beginMainMax: Math.max(0, ...begin.map((e) => e.dur / 1000)),
    beginMainSumme: summe(begin),
    gpuStopps: finish.filter((e) => e.dur > 16000).map((e) => ({ t: zuSeite(e.ts), ms: e.dur / 1000 })),
    gpuHauptSumme: summe(gpuTop),
    kompilierung: { n: dawn.length, ms: summe(dawn), max: Math.max(0, ...dawn.map((e) => e.dur / 1000)) },
    raster: { n: raster.length, ms: summe(raster), max: Math.max(0, ...raster.map((e) => e.dur / 1000)) },
    dekodierung: { n: dekodierungen.length, ms: dekodierungen.reduce((a, d) => a + d.ms, 0), liste: dekodierungen },
    gc: { n: gc.length, ms: summe(gc) },
    compositorSumme: summe(top(compEv)),
    gpuMem,
    anfragen,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Ein Fall
// ---------------------------------------------------------------------------------------------------------------
const TRACE_KAT = [
  "devtools.timeline",
  "disabled-by-default-devtools.timeline",
  "disabled-by-default-devtools.timeline.frame",
  "blink",
  "cc",
  "gpu",
  "v8",
  "loading",
  "benchmark",
  "viz",
  "toplevel",
  "blink.animations",
  "blink.user_timing",
];

const BASIS = `http://127.0.0.1:${PORT}/`;
const profile = [];
// Neues Profil. Der Energiesparmodus von Chrome bleibt darin aus: Im Akkubetrieb mit 20 % oder weniger begrenzt Chrome
// sonst alle Seiten auf 30 Bilder/s (gemessen am 16.11.2026) – das wäre eine Eigenschaft des Rechners, nicht der Seite.
function neuesProfil() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-fahrt-"));
  fs.writeFileSync(path.join(dir, "Local State"), JSON.stringify({ performance_tuning: { battery_saver_mode: { state: 0 }, high_efficiency_mode: { state: 0 } } }));
  profile.push(dir);
  return dir;
}

// CPU-Zeit der Chromium-Prozesse dieses Profils (ps; Sekunden je Prozessart)
function cpuZeiten(profilDir) {
  const m = {};
  try {
    const aus = execFileSync("ps", ["-A", "-ww", "-o", "time=,command="], { encoding: "utf8", maxBuffer: 1 << 26 });
    for (const zeile of aus.split("\n")) {
      if (!zeile.includes(profilDir)) continue;
      const [zeit] = zeile.trim().split(/\s+/, 1);
      const s = zeit.split(":").reduce((a, x) => a * 60 + Number(x), 0);
      const art = /--type=gpu-process/.test(zeile) ? "gpu" : /--type=renderer/.test(zeile) ? "renderer" : /--type=/.test(zeile) ? "sonst" : "browser";
      m[art] = (m[art] ?? 0) + s;
    }
  } catch {}
  return m;
}

async function starten(browserName, fenster, profilDir) {
  const kontextOpt = { viewport: { width: fenster.width, height: fenster.height }, deviceScaleFactor: fenster.dpr, reducedMotion: "no-preference" };
  if (browserName === "webkit") return { ctx: await pw.webkit.launchPersistentContext(profilDir, { headless: true, ...kontextOpt }), chromium: false };
  const launch = { headless: true, ...kontextOpt };
  if (browserName === "chrome" || browserName === "cft") {
    launch.channel = browserName === "chrome" ? "chrome" : "chromium";
    launch.ignoreDefaultArgs = ["--enable-unsafe-swiftshader"];
    launch.args = ["--enable-gpu-rasterization", "--ignore-gpu-blocklist"];
  }
  return { ctx: await pw.chromium.launchPersistentContext(profilDir, launch), chromium: true };
}

// Bereit: geladen, Bilder der Explosion dekodiert (bewegung.js tut das ohnehin vorab), dann kurz Ruhe
async function bereit(page) {
  await page.goto(BASIS, { waitUntil: "load" });
  await page.evaluate(() => Promise.all([...document.querySelectorAll(".k01 img")].map((i) => (i.decode ? i.decode().catch(() => {}) : null))));
  await warte(600);
}

// Explosion: warten, bis keine ihrer Animationen mehr läuft (höchstens 5 s)
async function exFertig(page) {
  await page.evaluate(
    () =>
      new Promise((fertig) => {
        const anims = document.querySelector("[data-explosion]").getAnimations({ subtree: true });
        const t0 = performance.now();
        const blick = () => {
          if ((performance.now() - t0 > 200 && !anims.some((a) => a.playState === "running")) || performance.now() - t0 > 5000) fertig();
          else requestAnimationFrame(blick);
        };
        requestAnimationFrame(blick);
      }),
  );
}

// Strecke einer Bühne: Spanne ihrer Zeitleiste wie in site.css (gepinnt: contain, sonst cover; Kopfleiste 52 px
// abgezogen), Anfang und Ziel des Scrollens
async function strecke(page, name) {
  return page.evaluate(
    ([sel, vor, nach]) => {
      const el = document.querySelector(sel);
      const r = el.getBoundingClientRect();
      const top = r.top + scrollY;
      const H = innerHeight;
      const k = 52;
      const pin = sel === "[data-explosion]" || innerWidth >= 900;
      const [a, e] = pin ? [top - k, top + r.height - H] : [top - H, top + r.height - k];
      return { a, e, pin, start: Math.max(0, Math.round(a - vor * H)), ziel: Math.round(e + nach * H) };
    },
    [STRECKE[name].sel, VOR, NACH],
  );
}

async function aufwaermen(browserName, fenster, profilDir) {
  const { ctx } = await starten(browserName, fenster, profilDir);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.addInitScript(messpunkte);
  await bereit(page);
  const hoehe = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.mouse.move(fenster.width / 2, fenster.height / 2);
  for (let y = 0; y <= hoehe; y += 160) {
    await page.evaluate((yy) => scrollTo(0, yy), y);
    await warte(40);
  }
  await warte(500);
  await ctx.close();
}

async function fall({ browserName, fenster, streckeName, cache, scrollArt, probe, runde }) {
  probeJetzt = probe;
  const profilDir = neuesProfil();
  if (cache === "warm") await aufwaermen(browserName, fenster, profilDir);
  const { ctx, chromium } = await starten(browserName, fenster, profilDir);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  const konsole = [];
  page.on("pageerror", (e) => konsole.push(String(e)));
  await page.addInitScript(messpunkte);
  const cdp = chromium ? await ctx.newCDPSession(page) : null;
  if (chromium) await cdp.send("Performance.enable");
  const tLaden = Date.now();
  await bereit(page);
  const ruheNach = Date.now() - tLaden;
  const s = await strecke(page, streckeName);
  const zeit = Boolean(STRECKE[streckeName].zeit);
  const zurueck = scrollArt.endsWith("-zurueck");
  let weg;
  if (zeit) {
    // Explosion: oben (zerlegt); bei „-zurueck“ erst bei 80 px zusammensetzen lassen, dann nach oben anstoßen
    await page.evaluate(() => scrollTo(0, 0));
    await warte(400);
    if (zurueck) {
      await page.evaluate((y) => scrollTo(0, y), ANSTOSS);
      await exFertig(page);
      await warte(400);
    }
    weg = zurueck ? -(ANSTOSS + 40) : scrollArt === "anstoss-weiter" ? WEITER : ANSTOSS;
  } else {
    // an den Anfang (bzw. bei „-zurueck“ ans Ziel) springen und dort zur Ruhe kommen lassen
    await page.evaluate((y) => scrollTo(0, y), zurueck ? s.ziel : s.start);
    await warte(zurueck ? 1200 : 400);
    weg = (zurueck ? s.start : s.ziel) - (await page.evaluate(() => scrollY));
  }
  const geste = scrollArt.startsWith("geste") && cdp;
  const deltas = geste ? [] : schritte(Math.abs(weg), zeit ? "trackpad" : scrollArt.replace(/^geste-?/, "").replace(/-zurueck$/, "") || "trackpad").map((d) => d * Math.sign(weg));
  await page.mouse.move(Math.round(fenster.width * 0.55), Math.round(fenster.height * 0.5));
  await warte(PAUSE);

  const metrik = async () => (cdp ? Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value])) : {});
  const cpu = async () => (chromium ? cpuZeiten(profilDir) : {});
  const vorher = await metrik();
  const cpuVorher = await cpu();
  let stream = null;
  if (cdp) {
    await cdp.send("Tracing.start", { transferMode: "ReturnAsStream", traceConfig: { includedCategories: TRACE_KAT, recordMode: "recordAsMuchAsPossible" } });
  }
  const tStart = await page.evaluate(() => {
    window.__vf.start();
    performance.mark("vf-start");
    return window.__vf.t0;
  });
  const mx = Math.round(fenster.width * 0.55);
  const my = Math.round(fenster.height * 0.5);
  const t0Senden = performance.now();
  const sendeDauer = geste
    ? (await cdp.send("Input.synthesizeScrollGesture", { x: mx, y: my, yDistance: -weg, speed: PROFILE[scrollArt.replace(/^geste-?/, "").replace(/-?zurueck$/, "") || "trackpad"] ?? 700, gestureSourceType: "mouse", preventFling: true }), performance.now() - t0Senden)
    : await scrollen(page, cdp, deltas, mx, my);
  // warten, bis die Scrollposition ruht (300 ms unverändert) – bei der Explosion auch, bis ihre Animationen fertig sind;
  // dabei den Stand ihrer Animation im ersten Bild merken, in dem sie läuft (für die Abschnitte nach der Zeit)
  const { ruhe: tRuhe, ref: exRef, dauer: exD } = await page.evaluate(
    (zeit) =>
      new Promise((fertig) => {
        let y = scrollY;
        let seit = performance.now();
        let ende = 0;
        let ref = null;
        const anims = zeit ? document.querySelector("[data-explosion]").getAnimations({ subtree: true }).filter((a) => "animationName" in a) : [];
        const dauer = anims.length ? anims[0].effect.getComputedTiming().endTime : 0;
        const blick = () => {
          const jetzt = performance.now();
          if (scrollY !== y) {
            y = scrollY;
            seit = jetzt;
          }
          if (anims.some((a) => a.playState === "running")) {
            ende = 0;
            // Stand im Sinne des Zusammenbaus; rückwärts läuft sie mit direction: reverse (bewegung.js)
            const rueck = anims[0].effect.getTiming().direction === "reverse";
            if (!ref) ref = { t: jetzt, ct: rueck ? dauer - anims[0].currentTime : anims[0].currentTime, r: rueck ? -1 : 1 };
          } else if (!ende) ende = jetzt;
          const animFertig = !zeit || (ref && ende && jetzt - ende > 150) || jetzt - seit > 6000;
          if (jetzt - seit > 300 && animFertig) fertig({ ruhe: Math.max(seit, zeit && ende ? ende : 0), ref, dauer });
          else requestAnimationFrame(blick);
        };
        requestAnimationFrame(blick);
      }),
    zeit,
  );
  await warte(200);
  const seite = await page.evaluate(() => {
    performance.mark("vf-ende");
    window.__vf.stop();
    const v = window.__vf;
    return {
      bilder: v.bilder,
      puls: v.puls,
      loaf: v.loaf.filter((l) => l.start + l.dauer > v.t0),
      lt: v.lt.filter((l) => l.start + l.dauer > v.t0),
      ereignisse: v.ereignisse,
      heap: performance.memory?.usedJSHeapSize ?? null,
      endY: scrollY,
    };
  });
  const nachher = await metrik();
  const cpuNachher = await cpu();
  let spur = null;
  if (cdp) {
    const fertig = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
    await cdp.send("Tracing.end");
    ({ stream } = await fertig);
    const teile = [];
    for (;;) {
      const { data, eof, base64Encoded } = await cdp.send("IO.read", { handle: stream, size: 1 << 22 });
      teile.push(base64Encoded ? Buffer.from(data, "base64").toString() : data);
      if (eof) break;
    }
    await cdp.send("IO.close", { handle: stream });
    const text = teile.join("");
    if (TRACE_DIR) {
      fs.mkdirSync(TRACE_DIR, { recursive: true });
      fs.writeFileSync(path.join(TRACE_DIR, `${streckeName}-${browserName}-${fenster.name.replace("@", "-dpr")}-${cache}-${scrollArt}${probe ? `-ohne-${probe}` : ""}-${runde}.json`), text);
    }
    spur = spurAuswerten(text, { tStart, tRuhe });
  }
  await ctx.close();

  // Hauptthread-Takt (requestAnimationFrame) bis zur Ruhe der Scrollposition
  const takt = seite.bilder.filter(([t]) => t <= tRuhe);
  const abst = takt.slice(1).map(([t], i) => t - takt[i][0]);
  const render = takt.map((b) => b[2]).filter((x) => typeof x === "number").sort((a, b) => a - b);
  const quantil = (l, q) => (l.length ? l[Math.min(l.length - 1, Math.floor(q * l.length))] : null);
  // Fortschritt der Zeitleiste beim Scrollstand y und der Abschnitt der Strecke
  const fahrtwert = (y) => (y - s.a) / (s.e - s.a);
  const abschnitt = (y) => {
    const p = fahrtwert(y);
    if (p < 0) return "vorher";
    for (const [bis, name] of STRECKE[streckeName].abschnitte) if (p < bis) return name;
    return "danach";
  };
  // Explosion (auf der Zeit): Fortschritt ihrer Animationen zur Seitenzeit t (aus dem gemerkten Stand) und Abschnitt
  const exAnfang = exRef ? exRef.t - (exRef.r > 0 ? exRef.ct : exD - exRef.ct) : Infinity;
  const exWert = (t) => (exRef ? Math.min(1, Math.max(0, (exRef.ct + (t - exRef.t) * exRef.r) / exD)) : 0);
  const abschnittBei = (t) => {
    if (!zeit) return abschnitt(yBei(t));
    if (t < exAnfang) return "vorher";
    if (t > exAnfang + exD) return "danach";
    const p = exWert(t);
    for (const [bis, name] of STRECKE[streckeName].abschnitte) if (p < bis) return name;
    return STRECKE[streckeName].abschnitte.at(-1)[1];
  };
  const pBei = (t) => Math.round((zeit ? exWert(t) : fahrtwert(yBei(t))) * 100);
  // Scrollstand zur Seitenzeit t (aus dem Takt)
  const yBei = (t) => {
    let y = takt[0]?.[1] ?? 0;
    for (const [tt, yy] of takt) {
      if (tt > t) break;
      y = yy;
    }
    return y;
  };
  // Lücken im Bildtakt des Hauptthreads (> 33 ms): war der Hauptthread in der Lücke belegt (längste Pulspause)?
  const puls = seite.puls ?? [];
  const taktLuecken = [];
  for (let i = 1; i < takt.length; i++) {
    const a = takt[i - 1][0];
    const b = takt[i][0];
    if (b - a <= 41.7) continue;
    let pause = 0;
    let vor = a;
    for (const t of puls) {
      if (t < a) continue;
      if (t > b) break;
      pause = Math.max(pause, t - vor);
      vor = t;
    }
    pause = Math.max(pause, b - vor);
    taktLuecken.push({ t: Math.round(a - tStart), ms: b - a, pause, belegt: pause >= 0.6 * (b - a), p: zeit ? pBei(a) : Math.round(fahrtwert(takt[i - 1][1]) * 100), render: takt[i - 1][2] });
  }
  const phasen = {};
  const quelleLuecken = spur ? spur.verpasstJe : abst.map((ms, i) => ({ t: takt[i + 1][0], ms, verpasst: ms > 25 ? Math.max(1, Math.round(ms / 16.667) - 1) : 0 }));
  for (const l of quelleLuecken) if (l.verpasst) phasen[abschnittBei(l.t)] = (phasen[abschnittBei(l.t)] ?? 0) + l.verpasst;
  const lueckenGezeigt = spur ? spur.luecken : abst;
  // Kosten je Bild nach Abschnitt (Chromium): Hauptthread-Bild (BeginMainFrame), davon PrePaint, Zeichnen im Compositor
  const kosten = {};
  if (spur) {
    for (const [t, ms, pp] of spur.bmfListe) {
      if (t > tRuhe) continue;
      const k = (kosten[abschnittBei(t)] ??= { n: 0, bmf: 0, pp: 0, dn: 0, draw: 0 });
      k.n++;
      k.bmf += ms;
      k.pp += pp;
    }
    for (const [t, ms] of spur.drawListe) {
      if (t > tRuhe) continue;
      const k = (kosten[abschnittBei(t)] ??= { n: 0, bmf: 0, pp: 0, dn: 0, draw: 0 });
      k.dn++;
      k.draw += ms;
    }
  }
  const zaehle = (l, ms) => l.filter((x) => x > ms).length;
  const loafSkripte = {};
  for (const l of seite.loaf) for (const sk of l.skripte) loafSkripte[`${sk.quelle || sk.art}:${sk.funktion || sk.aufrufer}`] = (loafSkripte[`${sk.quelle || sk.art}:${sk.funktion || sk.aufrufer}`] ?? 0) + sk.dauer;
  const d = (k) => (nachher[k] ?? 0) - (vorher[k] ?? 0);
  return {
    browser: browserName,
    fenster: fenster.name,
    strecke: streckeName,
    cache,
    scroll: scrollArt,
    probe,
    runde,
    ruheNach,
    weg: { start: s.start, ziel: s.ziel, a: s.a, e: s.e, endY: seite.endY },
    sendeDauer,
    dauer: tRuhe - tStart,
    gezeigt: {
      quelle: spur ? "DrawAndSwap" : "rAF",
      n: spur ? spur.bilder : takt.length,
      ueber16: zaehle(lueckenGezeigt, 25),
      ueber33: zaehle(lueckenGezeigt, 41.7),
      ueber100: zaehle(lueckenGezeigt, 100),
      max: Math.max(0, ...lueckenGezeigt),
      verpasst: lueckenGezeigt.reduce((a, ms) => a + (ms > 25 ? Math.max(1, Math.round(ms / 16.667) - 1) : 0), 0),
    },
    haupt: {
      luecken: taktLuecken,
      n: takt.length,
      ueber16: zaehle(abst, 25),
      ueber33: zaehle(abst, 41.7),
      ueber100: zaehle(abst, 100),
      max: Math.max(0, ...abst),
      render: { median: quantil(render, 0.5), p95: quantil(render, 0.95), max: render.at(-1) ?? null, summe: render.reduce((a, b) => a + b, 0) },
    },
    loaf: {
      n: seite.loaf.length,
      ms: seite.loaf.reduce((a, l) => a + l.dauer, 0),
      max: Math.max(0, ...seite.loaf.map((l) => l.dauer)),
      skripte: loafSkripte,
      liste: seite.loaf.map((l) => ({ ...l, t: Math.round(l.start - tStart), p: pBei(l.start) })),
    },
    lt: { n: seite.lt.length, ms: seite.lt.reduce((a, l) => a + l.dauer, 0), max: Math.max(0, ...seite.lt.map((l) => l.dauer)), liste: seite.lt.map((l) => ({ ...l, y: yBei(l.start) })) },
    phasen,
    kosten,
    ereignisse: seite.ereignisse.filter((e) => e.t >= tStart - 50).map((e) => ({ ...e, t: Math.round(e.t - tStart), p: zeit ? pBei(e.t) : Math.round(fahrtwert(e.y) * 100) })),
    heapMB: (nachher.JSHeapUsedSize ?? seite.heap ?? 0) / 1048576 || null,
    metriken: chromium
      ? { stilMs: d("RecalcStyleDuration") * 1000, layoutMs: d("LayoutDuration") * 1000, skriptMs: d("ScriptDuration") * 1000, aufgabenMs: d("TaskDuration") * 1000, layouts: d("LayoutCount"), stile: d("RecalcStyleCount") }
      : null,
    cpu: Object.fromEntries(Object.keys(cpuNachher).map((k) => [k, (cpuNachher[k] - (cpuVorher[k] ?? 0)) * 1000])),
    spur: spur && { ...spur, bmfListe: undefined, drawListe: undefined, verpasstJe: spur.verpasstJe.map((v) => ({ ...v, t: Math.round(v.t - tStart), p: pBei(v.t) })), anfragen: spur.anfragen.map((a) => ({ ...a, t: Math.round(a.t - tStart) })), dekodierung: { ...spur.dekodierung, liste: spur.dekodierung.liste.map((x) => ({ ...x, t: Math.round(x.t - tStart), p: pBei(x.t) })) }, gpuStopps: spur.gpuStopps.map((g) => ({ ...g, t: Math.round(g.t - tStart), p: pBei(g.t) })), hauptLang: spur.hauptLang.map((h) => ({ ...h, t: Math.round(h.t - tStart), p: pBei(h.t) })) },
    explosion: zeit ? { dauer: exD, anfang: exRef ? Math.round(exAnfang - tStart) : null, richtung: exRef?.r ?? null } : undefined,
    konsole,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Ebenen und Animationen (Chromium, ohne Zeitmessung): Compositing-Ebenen am Anfang der Strecke und in ihrem Verlauf,
// welche Ebenen neu gezeichnet (paintCount) bzw. neu gerastert (RasterTask je Ebene) werden – nach einem ersten
// Durchgang, also ohne das erste Zeichnen –, und welche Animationen der Bühnen nicht auf dem Compositor laufen (Spur
// „blink.animations“ ab dem Laden)
// ---------------------------------------------------------------------------------------------------------------
// CompositorAnimations::FailureReason (Chromium, compositor_animations.h), Bit für Bit
const GRUENDE_ANIM = [
  "beschleunigte Animationen aus", "von DevTools unterdrückt", "ungültige Animation", "Zeitparameter nicht unterstützt", "Kompositmodus nicht replace",
  "Ziel ohne gültigen Compositing-Zustand", "unverträgliche Animationen am Ziel", "Ziel hat CSS offset", "(veraltet)", "nicht-CSS-Eigenschaften",
  "Transform-Eigenschaft auf diesem Ziel nicht beschleunigt", "Transform hängt von der Boxgröße ab", "Filter verschiebt Pixel (z. B. blur)", "Eigenschaft nicht unterstützt",
  "(veraltet)", "gemischte Keyframe-Typen", "Zeitleiste ohne gültigen Compositing-Zustand", "Animation ohne Wirkung (wegoptimiert)", "betrifft !important", "SVG mit eigener Transform-Eigenschaft",
];
// Stand der Ebenen: Anzahl, zeichnende, Fläche (MPx) und je Ebene Größe und paintCount
function ebenenStand(ebenen, fenster) {
  const zeichnen = ebenen.filter((l) => l.drawsContent);
  const flaeche = zeichnen.reduce((a, l) => a + l.width * l.height, 0) * fenster.dpr * fenster.dpr;
  return { ebenen: ebenen.length, zeichnend: zeichnen.length, mpx: flaeche / 1e6, liste: ebenen.map((l) => ({ id: l.layerId, node: l.backendNodeId, w: l.width, h: l.height, paint: l.paintCount, zeichnet: l.drawsContent })) };
}
async function ebenenDurchgang(browserName, fenster, streckeName) {
  probeJetzt = "";
  const { ctx } = await starten(browserName, fenster, neuesProfil());
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.addInitScript(messpunkte);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Tracing.start", { transferMode: "ReturnAsStream", traceConfig: { includedCategories: ["blink.animations", "cc", "disabled-by-default-devtools.timeline", "blink.user_timing"], recordMode: "recordAsMuchAsPossible" } });
  await bereit(page);
  const s = await strecke(page, streckeName);
  const zeit = Boolean(STRECKE[streckeName].zeit);
  if (zeit) {
    // Explosion: einmal zusammensetzen und wieder auseinander laufen lassen (alles einmal gezeichnet und gerastert)
    await page.evaluate((y) => scrollTo(0, y), ANSTOSS);
    await exFertig(page);
    await page.evaluate(() => scrollTo(0, 0));
    await exFertig(page);
    await warte(400);
  } else {
    // ein erster Durchgang durch die Strecke (alles einmal gezeichnet und gerastert), dann zurück an den Anfang
    for (let i = 0; i <= 20; i++) {
      await page.evaluate((y) => scrollTo(0, y), Math.round(s.start + ((s.ziel - s.start) * i) / 20));
      await warte(50);
    }
    await page.evaluate((y) => scrollTo(0, y), s.start);
    await warte(400);
  }
  await cdp.send("DOM.enable");
  await cdp.send("DOM.getDocument", { depth: 0 });
  let ebenen = [];
  cdp.on("LayerTree.layerTreeDidChange", (e) => {
    if (e.layers) ebenen = e.layers;
  });
  await cdp.send("LayerTree.enable");
  const beschreibung = new Map();
  const beschreibe = async (l) => {
    if (!l.backendNodeId) return l.parentLayerId ? "(ohne Element)" : "(Wurzel)";
    if (beschreibung.has(l.backendNodeId)) return beschreibung.get(l.backendNodeId);
    let t = "?";
    try {
      const { node } = await cdp.send("DOM.describeNode", { backendNodeId: l.backendNodeId });
      const at = node.attributes ?? [];
      const cls = at[at.indexOf("class") + 1];
      t = node.nodeName.toLowerCase() + (at.includes("class") && cls ? `.${cls.trim().split(/\s+/).slice(0, 3).join(".")}` : "") + (node.pseudoType ? `::${node.pseudoType}` : "");
    } catch {}
    beschreibung.set(l.backendNodeId, t);
    return t;
  };
  const schnapp = async (name) => {
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await warte(250);
    return { ...ebenenStand(ebenen, fenster), name };
  };
  const stand = [await schnapp("Anfang")];
  // Gründe (am Anfang der Strecke)
  const gruende = {};
  const beispiele = {};
  for (const l of ebenen) {
    const r = await cdp.send("LayerTree.compositingReasons", { layerId: l.layerId }).catch(() => null);
    for (const id of r?.compositingReasonIds ?? []) {
      gruende[id] = (gruende[id] ?? 0) + 1;
      const b = (beispiele[id] ??= {});
      const el = (await beschreibe(l)).replace(/\.(\w+-)?(\d+)\b/g, "");
      b[el] = (b[el] ?? 0) + 1;
    }
  }
  // Durch die Strecke in 40 Schritten (paintCount und Rasterung je Ebene); Explosion: Anstoß, Ablauf mit Ständen bei
  // 25/50/75 % der Dauer, dann ihr Ende (Marke „vf-ebenen-ende“: was danach neu gerastert wird, zählt eigens), 1 s Ruhe,
  // danach rückwärts
  await page.evaluate(() => performance.mark("vf-ebenen-start"));
  const paint0 = new Map(ebenen.map((l) => [l.layerId, l.paintCount]));
  let paintEnde = null;
  if (zeit) {
    const dauer = await page.evaluate(() => document.querySelector(".ex-stapel").getAnimations()[0].effect.getComputedTiming().endTime);
    const t0 = Date.now();
    await page.evaluate((y) => scrollTo(0, y), ANSTOSS);
    for (const q of [0.25, 0.5, 0.75]) {
      await warte(Math.max(0, t0 + q * dauer - Date.now()));
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
      stand.push({ ...ebenenStand(ebenen, fenster), name: `${q * 100} %` });
    }
    await exFertig(page);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await page.evaluate(() => performance.mark("vf-ebenen-ende"));
    paintEnde = new Map(ebenen.map((l) => [l.layerId, l.paintCount]));
    await warte(1000);
    stand.push(await schnapp("Ende + 1 s"));
    await page.evaluate(() => performance.mark("vf-ebenen-rueck"));
    await page.evaluate(() => scrollTo(0, 0));
    await exFertig(page);
    stand.push(await schnapp("rückwärts zerlegt"));
  } else {
    for (let i = 1; i <= 40; i++) {
      await page.evaluate((y) => scrollTo(0, y), Math.round(s.start + ((s.ziel - s.start) * i) / 40));
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      await warte(40);
      if (i === 12 || i === 23 || i === 35 || i === 40) stand.push(await schnapp(`${Math.round((i / 40) * 100)} %`));
    }
  }
  const paintMehr = new Map();
  for (const l of ebenen) {
    const vor = paint0.get(l.layerId);
    paintMehr.set(l.layerId, vor === undefined ? `neu (${l.paintCount})` : l.paintCount - vor);
  }
  const fertig = new Promise((r) => cdp.once("Tracing.tracingComplete", r));
  await cdp.send("Tracing.end");
  const { stream } = await fertig;
  const teile = [];
  for (;;) {
    const { data, eof, base64Encoded } = await cdp.send("IO.read", { handle: stream, size: 1 << 22 });
    teile.push(base64Encoded ? Buffer.from(data, "base64").toString() : data);
    if (eof) break;
  }
  const roh = JSON.parse(teile.join(""));
  const ev = roh.traceEvents ?? roh;
  const startTs = ev.find((e) => e.name === "vf-ebenen-start")?.ts ?? 0;
  // Animationen
  // Animationen: Chromium vergibt die Kennung (id2) nach dem Ende neu – jedes „b“ beginnt deshalb eine neue Animation,
  // „n“ und „e“ gehören zur zuletzt begonnenen mit derselben Kennung
  const anim = new Map();
  const alleAnim = [];
  for (const e of ev.filter((x) => x.name === "Animation").sort((x, y) => x.ts - y.ts)) {
    const id = e.id2?.local ?? e.id;
    const dd = e.args?.data ?? {};
    let a = anim.get(id);
    if (e.ph === "b" || !a) {
      a = {};
      anim.set(id, a);
      alleAnim.push(a);
    }
    if (dd.nodeName) a.ziel = dd.nodeName;
    if (dd.displayName !== undefined) a.eigenschaft = dd.displayName;
    if (dd.name) a.name = dd.name;
    // jeder Versuch, die Animation auf den Compositor zu legen, steht als „n“ mit compositeFailed (0 = gelungen) in der
    // Spur; „fehler“ sammelt alle Gründe, „zuletzt“ ist das Ergebnis des letzten Versuchs (zählt für die Bewertung)
    if (dd.compositeFailed !== undefined) {
      a.fehler = (a.fehler ?? 0) | dd.compositeFailed;
      a.zuletzt = dd.compositeFailed;
      a.versuche = (a.versuche ?? 0) + 1;
    }
    if (dd.unsupportedProperties?.length) a.nicht = [...new Set([...(a.nicht ?? []), ...dd.unsupportedProperties])];
    if (e.ph === "e") anim.delete(id);
  }
  // die Animationen der Bühnen (Namen ex-, tf-, aw-, mz- in site.css; die Geräte von heute heißen vf-*)
  const animationen = alleAnim.filter((a) => /^(ex|tf|aw|mz)-/.test(a.name ?? "") || /ex-|telefon|glockenfeld|\baw\b|metall/.test(a.ziel ?? ""));
  // Rasterung je Ebene während der Strecke (Explosion: auch eigens nach dem Ende ihres Ablaufs)
  const endeTs = ev.find((e) => e.name === "vf-ebenen-ende")?.ts ?? Infinity;
  const rueckTs = ev.find((e) => e.name === "vf-ebenen-rueck")?.ts ?? Infinity;
  const rasterJe = {};
  const rasterNachEnde = {};
  for (const e of ev) {
    if (e.name !== "RasterTask" || e.ts < startTs || e.ph !== "X") continue;
    const id = String(e.args?.tileData?.layerId ?? "?");
    const r = (rasterJe[id] ??= { n: 0, ms: 0 });
    r.n++;
    r.ms += e.dur / 1000;
    if (e.ts >= endeTs && e.ts < rueckTs) {
      const q = (rasterNachEnde[id] ??= { n: 0, ms: 0 });
      q.n++;
      q.ms += e.dur / 1000;
    }
  }
  const info = new Map(ebenen.map((l) => [l.layerId, l]));
  const rasterListe = [];
  for (const [id, r] of Object.entries(rasterJe).sort((a, b) => b[1].ms - a[1].ms).slice(0, 12)) {
    const l = info.get(id);
    rasterListe.push({ id, ...r, element: l ? await beschreibe(l) : "(Ebene nicht mehr da)", groesse: l ? `${Math.round(l.width)}×${Math.round(l.height)}` : "" });
  }
  const paintListe = [];
  for (const [id, mehr] of [...paintMehr].filter(([, m]) => m !== 0).sort((a, b) => (typeof b[1] === "number" ? b[1] : 0) - (typeof a[1] === "number" ? a[1] : 0)).slice(0, 12)) {
    const l = info.get(id);
    paintListe.push({ id, mehr, element: await beschreibe(l), groesse: `${Math.round(l.width)}×${Math.round(l.height)}` });
  }
  // Explosion: nach dem Ende ihres Ablaufs neu gerastert bzw. neu gezeichnet (bis zum Rückwärtslauf)
  const nachEnde = [];
  if (paintEnde) {
    for (const [id, r] of Object.entries(rasterNachEnde).sort((a, b) => b[1].ms - a[1].ms).slice(0, 8)) {
      const l = info.get(id);
      nachEnde.push({ art: "gerastert", id, ...r, element: l ? await beschreibe(l) : "(Ebene nicht mehr da)", groesse: l ? `${Math.round(l.width)}×${Math.round(l.height)}` : "" });
    }
    const beimEnde = stand.find((x) => x.name === "Ende + 1 s");
    for (const x of beimEnde?.liste ?? []) {
      const vor = paintEnde.get(x.id);
      if (vor !== undefined && x.paint > vor) {
        const l = info.get(x.id);
        nachEnde.push({ art: "gezeichnet", id: x.id, n: x.paint - vor, element: l ? await beschreibe(l) : "?", groesse: `${Math.round(x.w)}×${Math.round(x.h)}` });
      }
    }
  }
  const groesste = [];
  for (const l of [...ebenen].filter((x) => x.drawsContent).sort((a, b) => b.width * b.height - a.width * a.height).slice(0, 8)) {
    groesste.push({ element: await beschreibe(l), groesse: `${Math.round(l.width)}×${Math.round(l.height)}`, mpx: (l.width * l.height * fenster.dpr * fenster.dpr) / 1e6 });
  }
  await ctx.close();
  return {
    fenster: fenster.name,
    strecke: streckeName,
    stand: stand.map(({ liste, ...r }) => r),
    gruende,
    beispiele: Object.fromEntries(Object.entries(beispiele).map(([k, v]) => [k, Object.entries(v).sort((a, b) => b[1] - a[1]).slice(0, 6)])),
    animationen: animationen.map((a) => ({
      ...a,
      gruende: a.fehler ? GRUENDE_ANIM.filter((_, i) => a.fehler & (1 << i)) : [],
      gruendeZuletzt: a.zuletzt ? GRUENDE_ANIM.filter((_, i) => a.zuletzt & (1 << i)) : [],
    })),
    raster: rasterListe,
    neuGezeichnet: paintListe,
    nachEnde: paintEnde ? nachEnde : null,
    groesste,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Ausgabe
// ---------------------------------------------------------------------------------------------------------------
const zahl = (n, st = 0) => (n === null || n === undefined || Number.isNaN(n) ? "–" : n.toFixed(st).replace(".", ","));
function tabelle(kopf, zeilen) {
  const breite = kopf.map((k, i) => Math.max(k.length, ...zeilen.map((z) => String(z[i]).length)));
  const linie = (z) => `| ${z.map((x, i) => (i < 5 || typeof x === "string" && /^[A-Za-zÄÖÜäöü]/.test(x) ? String(x).padEnd(breite[i]) : String(x).padStart(breite[i]))).join(" | ")} |`;
  console.log(linie(kopf));
  console.log(`|${breite.map((b) => "-".repeat(b + 2)).join("|")}|`);
  for (const z of zeilen) console.log(linie(z));
  console.log("");
}
const mittel = (liste, f) => {
  const w = liste.map(f).filter((x) => typeof x === "number" && !Number.isNaN(x));
  return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null;
};

// ---------------------------------------------------------------------------------------------------------------
// Ablauf
// ---------------------------------------------------------------------------------------------------------------
async function main() {
  pw = playwrightLaden();
  await new Promise((r, f) => server.listen(PORT, "127.0.0.1", r).on("error", f));
  const ergebnisse = [];
  const ebenen = [];
  const faelle = [];
  for (const streckeName of STRECKEN)
    for (const browserName of BROWSER)
      for (const fenster of FENSTER)
        for (const cache of CACHE)
          for (const scrollArt of scrollArten(streckeName)) {
            // Gesten erzeugt nur Chromium (CDP)
            if (scrollArt.startsWith("geste") && browserName === "webkit") continue;
            for (const probe of PROBEN) for (let runde = 1; runde <= RUNDEN; runde++) if (!hat("nur-ebenen")) faelle.push({ browserName, fenster, streckeName, cache, scrollArt, probe, runde });
          }
  console.log(`Gepinnte Bühnen messen: ${faelle.length} Fälle (${STRECKEN.join(", ")} · ${BROWSER.join(", ")} · ${FENSTER.map((f) => f.name).join(", ")} · ${CACHE.join(", ")} · ${STRECKEN.map((n) => scrollArten(n).join(", ")).join(" | ")}${PROBEN.length > 1 ? ` · Gegenproben ${PROBEN.filter(Boolean).join(", ")}` : ""})`);
  for (const [i, f] of faelle.entries()) {
    const name = `${f.streckeName} ${f.browserName} ${f.fenster.name} ${f.cache} ${f.scrollArt}${f.probe ? ` ohne ${f.probe}` : ""}${RUNDEN > 1 ? ` #${f.runde}` : ""}`;
    process.stdout.write(`  [${i + 1}/${faelle.length}] ${name} … `);
    try {
      const r = await fall(f);
      ergebnisse.push(r);
      console.log(`${r.gezeigt.n} Bilder, ${r.gezeigt.verpasst} verpasst, max ${zahl(r.gezeigt.max)} ms${r.konsole.length ? `, Fehler: ${r.konsole[0]}` : ""}`);
    } catch (e) {
      console.log(`FEHLER ${e.message.split("\n")[0]}`);
    }
  }
  if (EBENEN) {
    const chromes = BROWSER.filter((b) => b !== "webkit");
    for (const b of chromes.slice(0, 1))
      for (const streckeName of STRECKEN)
        for (const fenster of FENSTER) {
          process.stdout.write(`  Ebenen ${streckeName} ${b} ${fenster.name} … `);
          try {
            ebenen.push({ browser: b, ...(await ebenenDurchgang(b, fenster, streckeName)) });
            console.log("ok");
          } catch (e) {
            console.log(`FEHLER ${e.message.split("\n")[0]}`);
          }
        }
  }
  console.log("");

  // Gruppen (Mittel über Runden)
  const gruppen = new Map();
  for (const r of ergebnisse) {
    const k = `${r.strecke}|${r.browser}|${r.fenster}|${r.cache}|${r.scroll}|${r.probe}`;
    if (!gruppen.has(k)) gruppen.set(k, []);
    gruppen.get(k).push(r);
  }
  console.log("Bildrate während des Scrollens (gezeigt: Chromium = Bilder des GPU-Prozesses, WebKit = requestAnimationFrame; Lücke > 16,7 ms heißt ≥ 1,5 Bilder, > 33 ms ≥ 2,5 Bilder; verpasst = Bilder bei 60 Hz, die fehlten)");
  tabelle(
    ["Strecke", "Browser", "Fenster", "Cache", "Scroll", "Gegenprobe", "Dauer s", "Bilder", ">16,7", ">33", ">100", "max ms", "verpasst", "Haupt >16,7/>33/>100", "Lücken >33: HT belegt/frei", "Render ms Median/p95/max", "LoAF n/Σms/max", "Long Tasks n/max", "Heap MB", "GPU-MB"],
    [...gruppen.values()].map((g) => {
      const r = g[0];
      const m = (f, st = 0) => zahl(mittel(g, f), st);
      return [
        r.strecke,
        r.browser,
        r.fenster,
        r.cache,
        r.scroll,
        r.probe ? `ohne ${r.probe}` : "–",
        m((x) => x.dauer / 1000, 2),
        m((x) => x.gezeigt.n),
        m((x) => x.gezeigt.ueber16, 1),
        m((x) => x.gezeigt.ueber33, 1),
        m((x) => x.gezeigt.ueber100, 1),
        m((x) => x.gezeigt.max),
        m((x) => x.gezeigt.verpasst, 1),
        `${m((x) => x.haupt.ueber16)}/${m((x) => x.haupt.ueber33)}/${m((x) => x.haupt.ueber100)}`,
        `${m((x) => x.haupt.luecken.filter((l) => l.belegt).length, 1)}/${m((x) => x.haupt.luecken.filter((l) => !l.belegt).length, 1)}`,
        `${m((x) => x.haupt.render.median, 1)}/${m((x) => x.haupt.render.p95, 1)}/${m((x) => x.haupt.render.max, 1)}`,
        r.browser === "webkit" ? "–" : `${m((x) => x.loaf.n)}/${m((x) => x.loaf.ms)}/${m((x) => x.loaf.max)}`,
        r.browser === "webkit" ? "–" : `${m((x) => x.lt.n)}/${m((x) => x.lt.max)}`,
        m((x) => x.heapMB, 1),
        m((x) => (x.spur ? x.spur.gpuMem / 1048576 : null)),
      ];
    }),
  );

  const mitSpur = [...gruppen.values()].filter((g) => g[0].spur);
  if (mitSpur.length) {
    console.log("Ursachen der verpassten Bilder (Chromium; je Lücke das, was in ihr lief: Pipeline-Kompilierung im GPU-Prozess, GPU-Zeichnen, Rasterung, Dekodierung, Hauptthread)");
    const alle = new Set();
    for (const g of mitSpur) for (const r of g) Object.keys(r.spur.ursachen).forEach((k) => alle.add(k));
    const spalten = [...alle].sort();
    tabelle(
      ["Strecke", "Browser", "Fenster", "Cache", "Scroll", "Gegenprobe", "verpasst", ...spalten],
      mitSpur.map((g) => {
        const r = g[0];
        return [r.strecke, r.browser, r.fenster, r.cache, r.scroll, r.probe ? `ohne ${r.probe}` : "–", zahl(mittel(g, (x) => x.gezeigt.verpasst), 1), ...spalten.map((k) => zahl(mittel(g, (x) => x.spur.ursachen[k] ?? 0), 1))];
      }),
    );
    for (const sn of STRECKEN) {
      const ab = ABSCHNITTE(sn);
      const gs = [...gruppen.values()].filter((g) => g[0].strecke === sn);
      if (!gs.length) continue;
      console.log(`Wo in der Strecke ${STRECKE[sn].name} (verpasste Bilder je Abschnitt; Prozent = Fortschritt der Zeitleiste wie die Keyframe-Offsets in site.css)`);
      tabelle(
        ["Strecke", "Browser", "Fenster", "Cache", "Scroll", "Gegenprobe", ...ab],
        gs.map((g) => {
          const r = g[0];
          return [r.strecke, r.browser, r.fenster, r.cache, r.scroll, r.probe ? `ohne ${r.probe}` : "–", ...ab.map((a) => zahl(mittel(g, (x) => x.phasen[a] ?? 0), 1))];
        }),
      );
      console.log(`Kosten je Bild nach Abschnitt, ${STRECKE[sn].name} (Chromium, ms im Mittel): Hauptthread-Bild (BeginMainFrame) / davon PrePaint / Zeichnen im Compositor`);
      tabelle(
        ["Strecke", "Browser", "Fenster", "Cache", "Scroll", "Gegenprobe", ...ab],
        mitSpur
          .filter((g) => g[0].strecke === sn)
          .map((g) => {
            const r = g[0];
            return [
              r.strecke,
              r.browser,
              r.fenster,
              r.cache,
              r.scroll,
              r.probe ? `ohne ${r.probe}` : "–",
              ...ab.map((a) => {
                const f = (sel) => mittel(g, (x) => (x.kosten[a] ? sel(x.kosten[a]) : null));
                return `${zahl(f((k) => k.bmf / k.n), 1)}/${zahl(f((k) => k.pp / k.n), 1)}/${zahl(f((k) => k.draw / k.dn), 1)}`;
              }),
            ];
          }),
      );
    }
    console.log("Arbeit während des Scrollens (ms; Hauptthread nach Art als Selbstzeit, dazu Compositor-Thread, GPU-Prozess, Rasterung, Dekodierung, GC; CPU = Prozesszeit)");
    const arten = ["Skript", "Stil", "Layout", "PrePaint", "Paint", "Layer/Commit", "Canvas", "IntersectionObserver", "ResizeObserver", "HitTest", "GC", "Sonstiges"];
    tabelle(
      ["Strecke", "Browser", "Fenster", "Cache", "Scroll", "Gegenprobe", ...arten, "Compositor", "GPU-Haupt", "GPU-Stopps n/Σ", "Kompil. n/Σ/max", "Raster n/Σ", "Dekod. n/Σ", "CPU Renderer", "CPU GPU"],
      mitSpur.map((g) => {
        const r = g[0];
        const m = (f, st = 0) => zahl(mittel(g, f), st);
        return [
          r.strecke,
          r.browser,
          r.fenster,
          r.cache,
          r.scroll,
          r.probe ? `ohne ${r.probe}` : "–",
          ...arten.map((a) => m((x) => x.spur.nachArt[a] ?? 0)),
          m((x) => x.spur.compositorSumme),
          m((x) => x.spur.gpuHauptSumme),
          `${m((x) => x.spur.gpuStopps.length)}/${m((x) => x.spur.gpuStopps.reduce((a, s) => a + s.ms, 0))}`,
          `${m((x) => x.spur.kompilierung.n)}/${m((x) => x.spur.kompilierung.ms)}/${m((x) => x.spur.kompilierung.max)}`,
          `${m((x) => x.spur.raster.n)}/${m((x) => x.spur.raster.ms)}`,
          `${m((x) => x.spur.dekodierung.n)}/${m((x) => x.spur.dekodierung.ms)}`,
          m((x) => x.cpu.renderer),
          m((x) => x.cpu.gpu),
        ];
      }),
    );
    // Skripte mit der meisten Zeit (über alle Fälle ohne Gegenprobe)
    const sk = {};
    const ohne = mitSpur.filter((g) => !g[0].probe);
    for (const g of ohne) for (const r of g) for (const [k, v] of Object.entries(r.spur.nachSkript)) sk[k] = (sk[k] ?? 0) + v / (ohne.length * g.length);
    console.log("Skripte auf dem Hauptthread (Selbstzeit je Fall im Mittel, ms):");
    for (const [k, v] of Object.entries(sk).sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${zahl(v, 1).padStart(7)}  ${k}`);
    console.log("");
  }

  // Gegenproben gegen die Basis: wie viele verpasste Bilder fallen weg (Anteil = Wegfall / verpasst in der Basis)
  const mitProbe = [...gruppen.values()].filter((g) => g[0].probe);
  if (mitProbe.length) {
    console.log("Gegenproben gegen die Basis (verpasste Bilder im Mittel; Anteil = Wegfall ÷ verpasst in der Basis; HT ms/Bild = BeginMainFrame im Mittel)");
    const zeilen = [];
    for (const g of mitProbe) {
      const r = g[0];
      const basis = gruppen.get(`${r.strecke}|${r.browser}|${r.fenster}|${r.cache}|${r.scroll}|`);
      if (!basis) continue;
      const vb = mittel(basis, (x) => x.gezeigt.verpasst);
      const vp = mittel(g, (x) => x.gezeigt.verpasst);
      const ht = (gg) => mittel(gg, (x) => (x.spur ? Object.values(x.kosten).reduce((a, k) => a + k.bmf, 0) / Math.max(1, Object.values(x.kosten).reduce((a, k) => a + k.n, 0)) : null));
      zeilen.push([r.strecke, r.browser, r.fenster, r.cache, r.scroll, `ohne ${r.probe}`, `${zahl(vb, 1)} → ${zahl(vp, 1)}`, zahl(vb - vp, 1), vb ? `${zahl(((vb - vp) / vb) * 100)} %` : "–", `${zahl(mittel(basis, (x) => x.gezeigt.max))} → ${zahl(mittel(g, (x) => x.gezeigt.max))}`, r.spur ? `${zahl(ht(basis), 1)} → ${zahl(ht(g), 1)}` : "–"]);
    }
    zeilen.sort((a, b) => Number(String(b[6]).replace(",", ".")) - Number(String(a[6]).replace(",", ".")));
    tabelle(["Strecke", "Browser", "Fenster", "Cache", "Scroll", "Gegenprobe", "verpasst", "Wegfall", "Anteil", "max ms", "HT ms/Bild"], zeilen);
  }

  // Zeitachse eines Falls (der erste Fall je Browser/Fenster mit kaltem Cache und Trackpad)
  console.log("Zeitachse (ms ab dem ersten Scrollschritt, p = Fortschritt der Zeitleiste in %), je Strecke, Browser und Fenster der kalte Trackpad-Fall:");
  for (const r of ergebnisse.filter((x) => x.cache === CACHE[0] && x.scroll === scrollArten(x.strecke)[0] && !x.probe && x.runde === 1)) {
    const zeilen = [...r.ereignisse.map((e) => [e.t, `p=${e.p} ${e.was}`])];
    if (r.spur) {
      for (const g of r.spur.gpuStopps) zeilen.push([g.t, `p=${g.p} GPU-Stopp ${zahl(g.ms)} ms`]);
      for (const v of r.spur.verpasstJe.filter((v) => v.ms > 41.7)) zeilen.push([v.t, `p=${v.p} Lücke ${zahl(v.ms)} ms (${v.verpasst} verpasst): ${v.ursache}`]);
      for (const a of r.spur.anfragen) zeilen.push([a.t, `Anfrage ${a.url}`]);
      for (const x of r.spur.dekodierung.liste.filter((x) => x.ms > 2)) zeilen.push([x.t, `p=${x.p} Dekodierung ${zahl(x.ms, 1)} ms (${x.faden})`]);
      for (const h of r.spur.hauptLang) zeilen.push([h.t, `p=${h.p} lange Aufgabe ${zahl(h.ms)} ms`]);
    }
    for (const l of r.loaf.liste.filter((l) => l.dauer > 50)) {
      const sk = [...l.skripte].sort((a, b) => b.dauer - a.dauer)[0];
      const stil = l.stilStart ? l.start + l.dauer - l.stilStart : 0;
      zeilen.push([l.t, `p=${l.p} Long Animation Frame ${zahl(l.dauer)} ms (Stil+Layout ${zahl(stil)} ms${sk ? `, Skript ${sk.quelle || sk.art}:${sk.funktion || sk.aufrufer} ${zahl(sk.dauer)} ms, erzwungenes Layout ${zahl(sk.erzwungen)} ms` : ""})`]);
    }
    for (const l of r.haupt.luecken) zeilen.push([l.t, `p=${l.p} Bildtakt-Lücke ${zahl(l.ms)} ms, längste Pulspause ${zahl(l.pause)} ms → ${l.belegt ? "Hauptthread belegt" : "Hauptthread frei (Compositor/UI/GPU)"}, Renderzeit davor ${zahl(l.render, 1)} ms`]);
    console.log(`  ${r.strecke} ${r.browser} ${r.fenster} (${zahl(r.dauer)} ms gescrollt, bereit nach ${r.ruheNach} ms ab Laden):`);
    for (const [t, text] of zeilen.sort((a, b) => a[0] - b[0])) console.log(`    ${String(t).padStart(6)}  ${text}`);
  }
  console.log("");

  for (const e of ebenen) {
    console.log(`Ebenen ${e.strecke} ${e.browser} ${e.fenster}: ${e.stand.map((s) => `${s.name}: ${s.ebenen} (${s.zeichnend} zeichnend, ${zahl(s.mpx, 1)} MPx)`).join(" · ")}`);
    console.log(`  Gründe (Anfang der Strecke): ${Object.entries(e.gruende).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, n]) => `${k} ${n}`).join(", ")}`);
    for (const [k, n] of Object.entries(e.gruende).sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`    ${k} ${n}: ${e.beispiele[k].map(([el, m]) => `${el} ×${m}`).join(", ")}`);
    console.log(`  größte zeichnende Ebenen: ${e.groesste.map((g) => `${g.element} ${g.groesse}`).join("; ")}`);
    console.log(`  neu gezeichnet während der Strecke (paintCount, nach einem ersten Durchgang): ${e.neuGezeichnet.map((p) => `${p.element} ${p.groesse} +${p.mehr}`).join("; ") || "keine"}`);
    console.log(`  neu gerastert während der Strecke (Kacheln/ms, nach einem ersten Durchgang): ${e.raster.map((p) => `${p.element} ${p.groesse}: ${p.n}/${zahl(p.ms)}`).join("; ") || "keine"}`);
    if (e.nachEnde) console.log(`  nach dem Ende des Ablaufs (1 s Ruhe) neu gerastert/gezeichnet: ${e.nachEnde.map((p) => `${p.art} ${p.element} ${p.groesse}: ${p.n}${p.ms !== undefined ? `/${zahl(p.ms)} ms` : ""}`).join("; ") || "nichts"}`);
    // nicht komponiert = der letzte Versuch scheiterte; „zeitweise“ = ein früherer Versuch scheiterte (etwa solange die
    // Bühne weit außerhalb des Fensters stand und nichts von ihr gezeichnet war), der letzte gelang
    const nicht = e.animationen.filter((a) => a.zuletzt);
    const zeitweise = e.animationen.filter((a) => a.fehler && !a.zuletzt);
    const nenne = (a, g) => `${a.ziel} ${a.name ?? a.eigenschaft} (${g.join(", ")}${a.nicht ? `; ${a.nicht.join(", ")}` : ""})`;
    console.log(`  Animationen der Bühnen (ex-, tf-, aw-, mz-): ${e.animationen.length}, davon nicht auf dem Compositor: ${nicht.length}${nicht.length ? ` – ${nicht.map((a) => nenne(a, a.gruendeZuletzt)).join("; ")}` : ""}`);
    if (zeitweise.length) console.log(`    zeitweise nicht, beim letzten Versuch auf dem Compositor: ${zeitweise.length} – ${zeitweise.map((a) => nenne(a, a.gruende)).join("; ")}`);
  }
  if (JSON_OUT) {
    fs.writeFileSync(JSON_OUT, JSON.stringify({ zeit: new Date().toISOString(), ergebnisse, ebenen }, null, 1));
    console.log(`\nJSON: ${JSON_OUT}`);
  }
}

try {
  await main();
} finally {
  server.close();
  for (const d of profile) fs.rmSync(d, { recursive: true, force: true });
}
