// Misst, wie flüssig die Kamerafahrt (Kapitel 1) läuft – wiederholbar, damit sich vorher und nachher vergleichen lassen.
// Je Fall: Seite laden, warten, bis Laptop und Telefon in Ruhe stehen und sich in die Pose gedreht haben (Ruhelage), dann
// mit dem Mausrad durch die ganze Fahrt bis in Kapitel 2 scrollen und messen:
//   - gezeigte Bilder (Chromium: Display::DrawAndSwap im GPU-Prozess, also was wirklich auf den Bildschirm kommt; WebKit:
//     requestAnimationFrame) und Lücken > 16,7 / > 33 / > 100 ms (gezählt ab 1,5 / 2,5 / 6 Bildern, damit das Zittern
//     des Taktgebers nicht mitzählt), verpasste Bilder bei 60 Hz
//   - Hauptthread: Abstände der requestAnimationFrame-Aufrufe, Renderzeit je Bild (Ende der rAF-Rückrufe bis zur
//     nächsten Aufgabe: Stil, Layout, Paint, Übergabe – auch in WebKit), Long Animation Frames (mit Skript und Funktion),
//     lange Aufgaben; Zeit nach Art (Skript, Stil, Layout, Paint, Layer/Commit, GC, Beobachter, Canvas, Dekodierung)
//   - GPU-Prozess: Stopps beim Zeichnen, davon Pipeline-/Shader-Kompilierung (Dawn/Graphite), Rasterung, Dekodierung
//   - je verpasstem Bild die Ursache (was in der Lücke lief) und in welchem Abschnitt der Fahrt es geschah
//   - Speicher (JS-Heap, GPU-Speicher des Renderers), CPU-Zeit von Renderer und GPU-Prozess
//   - (Chromium, eigener Durchgang) Compositing-Ebenen mit Gründen, welche Ebenen während der Fahrt neu gezeichnet bzw.
//     neu gerastert werden, und welche Animationen nicht auf dem Compositor laufen
// Browser: „chrome“ = Google Chrome (headless, mit GPU über Metal, Standard), „shell“ = Playwright-Chromium ohne GPU
// (wie b4-pruefen.mjs), „cft“ = Chrome for Testing, „webkit“ = Playwright-WebKit (nur Hauptthread-Werte; es gibt dort
// keine Spur und kein Compositing in Bildschirmfotos). Kalt = neues Profil (kein HTTP- und kein GPU-Speicher des Browsers),
// warm = dasselbe Profil nach einem ersten Besuch mit Durchscrollen und Neustart des Browsers. Den Shader-Speicher von
// Metal (systemweit) leert das Werkzeug nicht: Was ein Effekt beim allerersten Zeichnen kostet (Pipeline-Kompilierung,
// 80–160 ms je neuem Effekt), zeigt nur der erste Lauf nach einer Änderung – deshalb steht „Kompil.“ in der Tabelle.
// Der Server ist eingebaut (Header aus _headers wie tools/serve.mjs, dazu die Cache-Regel für /assets/* – serve.mjs
// sendet no-store, damit wäre „warm“ nicht warm).
//
//   node tools/fahrt-messen.mjs                       ganze Matrix (chrome, webkit × 1440×900@1, 1440×900@2,
//                                                     1280×800@1, 1280×740@2 × kalt, warm × trackpad, schnell), dauert
//                                                     gut zehn Minuten
//   --browser chrome,webkit,shell,cft   --fenster 1440x900@1,1280x800@1   --cache kalt,warm   --scroll trackpad,schnell
//                       (Chromium dazu „geste“ bzw. „geste-schnell“: Input.synthesizeScrollGesture, vom Browser im Bildtakt
//                       erzeugte Mausrad-Geste mit 700 bzw. 2500 px/s – ohne die Schwebung zwischen 16-ms-Schritten und 60 Hz)
//   --runden 2          jeden Fall mehrmals (Mittelwerte in der Tabelle, Einzelwerte im JSON)
//   --bis ende|kapitel2 Strecke: nur die Fahrt oder bis 0,6 Fensterhöhen in Kapitel 2 (Standard)
//   --pause 300         ms zwischen Ruhelage und erstem Scrollschritt
//   --gegenprobe a,b    zusätzlich jeden Fall mit abgeschalteter Wirkung (nur für die Messung, über eine angehängte
//                       Stilregel bzw. ein geändertes HTML im Server, die Dateien bleiben unberührt); Namen siehe GEGENPROBEN,
//                       mehrere zugleich mit „+“ (kegelalt+titelalt); --gegenproben listet sie auf
//   --ohne-ebenen / --nur-ebenen   Durchgang für Ebenen und Animationen weglassen bzw. nur ihn (Standard: mit, nur
//                       Chromium, einmal je Fenster)
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
const SCROLL = liste("scroll", "trackpad,schnell");
const RUNDEN = Number(opt("runden", "1"));
const BIS = opt("bis", "kapitel2");
const PAUSE = Number(opt("pause", "300"));
const PORT = Number(opt("port", "4391"));
const TRACE_DIR = opt("trace", "");
const JSON_OUT = opt("json", "");
const EBENEN = !hat("ohne-ebenen");

// Gegenproben: schalten genau eine Wirkung ab (nur in der Messung; angehängt an site.css bzw. im HTML ersetzt)
const GEGENPROBEN = {
  fluss: { text: "Lichtfluss im Einstieg aus", css: ".k01 .fluss { display: none !important; }" },
  tafelblur: { text: "Tafel ohne backdrop-filter", css: ".fahrt-ende .tafel { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }" },
  kopfblur: { text: "Kopfzeile ohne backdrop-filter", css: ".kopf-glas { -webkit-backdrop-filter: none !important; backdrop-filter: none !important; }" },
  // „unset“ statt „none“: Chromium kennt -webkit-box-reflect: none nicht (die Deklaration fiele weg)
  spiegel: { text: "keine Spiegelung (box-reflect) an Laptop und Telefon", css: ".k01 .geraet { -webkit-box-reflect: unset !important; }" },
  spiegelaus: { text: "alter Stand: Spiegelung des Laptops beim Losfahren abgeschaltet (mit „none“, das nur WebKit kennt)", css: ".k01 .ist-faehrt .geraet-laptop { -webkit-box-reflect: none !important; }" },
  streif: { text: "Streiflicht auf dem Deckel aus (mix-blend-mode, blur, blendet beim Losfahren aus)", css: ".k01 .streif-laptop { display: none !important; }" },
  licht: { text: "Licht der Bühne aus (Leuchten, Kegel, Höfe, Rand- und Streiflicht)", css: ".k01 :is(.buehne-licht, .hof, .bodenlicht, .randlicht, .streiflicht) { display: none !important; }" },
  pose: { text: "kein Übergang der Pose beim Losfahren (springt sofort frontal)", css: ".js .k01 .pose, .js .k01 .geraet-laptop { transition: none !important; }" },
  flach: { text: "keine flache Aufnahme am Ende", css: ".js .k01 .fahrt-flach { display: none !important; }" },
  tastatur: { text: "Tastatur des Laptops unsichtbar (nur zum Messen)", css: ".k01 .laptop-keys { visibility: hidden !important; }" },
  grossbild: { text: "kein Nachladen des großen Bildes beim Losfahren", html: [/ data-gross="[^"]*"/g, ""] },
  fernegeraete: { text: "Geräte in Kapitel 4 und 6 aus (deren angehaltene Animationen halten sonst ~150 Ebenen)", css: ":is(.k04, .k06) .showcase { display: none !important; }" },
  poselaptop: { text: "nur der Laptop ohne Pose-Übergang (springt frontal)", css: ".js .k01 .pose-laptop, .js .k01 .geraet-laptop { transition: none !important; }" },
  eckenrechts: { text: "nur zum Messen: rechte Eckstreifen des Telefons in der Fahrt aus (Ursache der Bilder, die das Wegdrehen kostete)", css: ".js .k01 .ist-faehrt :is(.rim-tr, .rim-br) { display: none !important; }" },
  handyzu0: { text: "Umbau: Telefon dreht beim Losfahren zur Kamera (auf 0°) – dabei werden Eckstreifen nur verdeckt, nie neu sichtbar", css: ".js .k01 .ist-faehrt .ist-posiert .pose-handy { --pose: perspective(calc(var(--pw) * 9)) rotateY(-0deg); }" },
  leer: { text: "nur zum Messen: nichts abgeschaltet, nur dieselbe Auslieferung wie bei jeder Gegenprobe (no-store, angehängte Regel)", css: ".vf-gegenprobe-leer { color: inherit; }" },
  // alter Stand je Maßnahme (zum Gegenprüfen, was eine einzelne Maßnahme bewirkt hat)
  kegelalt: { text: "alter Stand: Lichtkegel mit filter: blur(28px)", css: ".k01 .lichtkegel { filter: blur(28px); }" },
  titelalt: {
    text: "alter Stand: Überschrift mit filter: blur in der Fahrt",
    css: "@keyframes fahrt-titel { 0% { translate: 0 0; scale: 1; opacity: 1; filter: blur(0); } 70% { opacity: .22; } 100% { translate: 0 -40svh; scale: 1.6; opacity: 0; filter: blur(2px); } }",
  },
  handyalt: { text: "alter Stand: Telefon dreht beim Losfahren in 0,9 s auf −62°", css: ".js .k01 .ist-faehrt .ist-posiert .pose-handy { --pose: perspective(calc(var(--pw) * 9)) rotateY(-62deg); }" },
  posewc: { text: "Umbau: will-change: transform an .pose (Pose-Übergang wie bisher)", css: ".js .k01 .pose { will-change: transform; }" },
  cv: { text: "content-visibility: auto für die Kapitel 2–10", css: "main > .kapitel:not(.k01) { content-visibility: auto; contain-intrinsic-size: auto 900px; }" },
};
const PROBEN = ["", ...liste("gegenprobe", "")];
if (hat("gegenproben")) {
  for (const [k, v] of Object.entries(GEGENPROBEN)) console.log(`${k.padEnd(14)} ${v.text}`);
  process.exit(0);
}
// mehrere zugleich mit „+“, z. B. kegelalt+titelalt
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
  const vf = (window.__vf = { loaf: [], lt: [], ereignisse: [], bilder: [], laeuft: false, pose: {} });
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
  document.addEventListener(
    "transitionend",
    (e) => {
      const el = e.target;
      if (el instanceof Element && el.matches(".k01 .pose") && e.propertyName === "transform") {
        vf.pose[el.classList.contains("pose-laptop") ? "laptop" : "handy"] = jetzt();
      }
    },
    true,
  );
  const fahrtwert = () => {
    const f = document.querySelector("[data-fahrt]");
    if (!f) return 0;
    const top = f.getBoundingClientRect().top + scrollY;
    const len = f.offsetHeight - innerHeight;
    return len > 0 ? (scrollY - top) / len : 0;
  };
  vf.fahrtwert = fahrtwert;
  // Zustände der Fahrt (Klassen und Bildwechsel), mit Zeit und Scrollstand
  document.addEventListener("DOMContentLoaded", () => {
    const merke = (was) => vf.ereignisse.push({ t: jetzt(), was, y: scrollY });
    const buehne = document.querySelector("[data-buehne]");
    const kopf = document.querySelector("[data-kopf]");
    // je Element nur die Klasse, die dort zählt; gemeldet werden Wechsel gegenüber dem Stand beim Laden
    const klassen = [
      [buehne, "ist-faehrt", "buehne"],
      [kopf, "ist-weg", "kopf"],
    ].filter(([el]) => el);
    const zustand = new Map(klassen.map(([el, k]) => [el, el.classList.contains(k)]));
    const mo = new MutationObserver((recs) => {
      for (const r of recs) {
        const el = r.target;
        if (r.attributeName === "class") {
          const eintrag = klassen.find(([e]) => e === el);
          if (!eintrag) continue;
          const an = el.classList.contains(eintrag[1]);
          if (zustand.get(el) !== an) {
            zustand.set(el, an);
            merke(`${eintrag[2]} ${eintrag[1]} ${an ? "an" : "aus"}`);
          }
        } else if (r.attributeName === "srcset") merke(`srcset ${el.closest("[data-fahrt-flach]") ? "flach" : "bildschirm"}`);
      }
    });
    if (buehne) mo.observe(buehne, { attributes: true, attributeFilter: ["class"] });
    if (kopf) mo.observe(kopf, { attributes: true, attributeFilter: ["class"] });
    for (const img of document.querySelectorAll(".k01 .laptop-screen img, [data-fahrt-flach] img")) {
      mo.observe(img, { attributes: true, attributeFilter: ["srcset"] });
      img.addEventListener("load", () => merke(`geladen ${img.currentSrc.replace(/^.*\//, "").replace(/\?.*$/, "")}`));
    }
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
function neuesProfil() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vf-fahrt-"));
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

async function ruhelage(page) {
  await page.goto(BASIS, { waitUntil: "load" });
  await page.waitForFunction(() => document.querySelectorAll(".k01 .showcase.is-rest.ist-posiert").length === 2, null, { timeout: 30000 });
  // Pose: Übergang 0,9 s – auf beide transitionend warten (höchstens 2,5 s)
  await page.waitForFunction(() => window.__vf.pose.laptop && window.__vf.pose.handy, null, { timeout: 2500 }).catch(() => {});
}

async function strecke(page) {
  return page.evaluate((bis) => {
    const f = document.querySelector("[data-fahrt]");
    const top = f.getBoundingClientRect().top + scrollY;
    const len = f.offsetHeight - innerHeight;
    return { top, len, ziel: Math.round(top + len + (bis === "ende" ? 0 : 0.6 * innerHeight)) };
  }, BIS);
}

async function aufwaermen(browserName, fenster, profilDir) {
  const { ctx } = await starten(browserName, fenster, profilDir);
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.addInitScript(messpunkte);
  await ruhelage(page);
  const s = await strecke(page);
  await page.mouse.move(fenster.width / 2, fenster.height / 2);
  for (let y = 0; y <= s.ziel; y += 120) {
    await page.evaluate((yy) => scrollTo(0, yy), y);
    await warte(60);
  }
  await warte(500);
  await ctx.close();
}

async function fall({ browserName, fenster, cache, scrollArt, probe, runde }) {
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
  await ruhelage(page);
  const ruheNach = Date.now() - tLaden;
  const s = await strecke(page);
  const weg = s.ziel - (await page.evaluate(() => scrollY));
  const geste = scrollArt.startsWith("geste") && cdp;
  const deltas = geste ? [] : schritte(weg, scrollArt.replace(/^geste-?/, "") || "trackpad");
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
    ? (await cdp.send("Input.synthesizeScrollGesture", { x: mx, y: my, yDistance: -weg, speed: PROFILE[scrollArt.replace(/^geste-?/, "") || "trackpad"] ?? 700, gestureSourceType: "mouse", preventFling: true }), performance.now() - t0Senden)
    : await scrollen(page, cdp, deltas, mx, my);
  // warten, bis die Scrollposition ruht (300 ms unverändert)
  const tRuhe = await page.evaluate(
    () =>
      new Promise((fertig) => {
        let y = scrollY;
        let seit = performance.now();
        const blick = () => {
          if (scrollY !== y) {
            y = scrollY;
            seit = performance.now();
          }
          if (performance.now() - seit > 300) fertig(seit);
          else requestAnimationFrame(blick);
        };
        requestAnimationFrame(blick);
      }),
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
      fahrt: (() => {
        const f = document.querySelector("[data-fahrt]");
        return { top: f.getBoundingClientRect().top + scrollY, len: f.offsetHeight - innerHeight };
      })(),
      endY: scrollY,
      pose: v.pose,
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
      fs.writeFileSync(path.join(TRACE_DIR, `fahrt-${browserName}-${fenster.name.replace("@", "-dpr")}-${cache}-${scrollArt}${probe ? `-ohne-${probe}` : ""}-${runde}.json`), text);
    }
    spur = spurAuswerten(text, { tStart, tRuhe });
  }
  await ctx.close();

  // Hauptthread-Takt (requestAnimationFrame) bis zur Ruhe der Scrollposition
  const takt = seite.bilder.filter(([t]) => t <= tRuhe);
  const abst = takt.slice(1).map(([t], i) => t - takt[i][0]);
  const render = takt.map((b) => b[2]).filter((x) => typeof x === "number").sort((a, b) => a - b);
  const quantil = (l, q) => (l.length ? l[Math.min(l.length - 1, Math.floor(q * l.length))] : null);
  const fahrtwert = (y) => (y - seite.fahrt.top) / seite.fahrt.len;
  const abschnitt = (y) => {
    const p = fahrtwert(y);
    if (p < 0.05) return "0–5 %";
    if (p < 0.3) return "5–30 %";
    if (p < 0.58) return "30–58 %";
    if (p < 0.88) return "58–88 %";
    if (p <= 1.0) return "88–100 %";
    return "danach";
  };
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
    taktLuecken.push({ t: Math.round(a - tStart), ms: b - a, pause, belegt: pause >= 0.6 * (b - a), p: Math.round(fahrtwert(takt[i - 1][1]) * 100), render: takt[i - 1][2] });
  }
  const phasen = {};
  const quelleLuecken = spur ? spur.verpasstJe : abst.map((ms, i) => ({ t: takt[i + 1][0], ms, verpasst: ms > 25 ? Math.max(1, Math.round(ms / 16.667) - 1) : 0 }));
  for (const l of quelleLuecken) if (l.verpasst) phasen[abschnitt(yBei(l.t))] = (phasen[abschnitt(yBei(l.t))] ?? 0) + l.verpasst;
  const lueckenGezeigt = spur ? spur.luecken : abst;
  // Kosten je Bild nach Abschnitt (Chromium): Hauptthread-Bild (BeginMainFrame), davon PrePaint, Zeichnen im Compositor
  const kosten = {};
  if (spur) {
    for (const [t, ms, pp] of spur.bmfListe) {
      if (t > tRuhe) continue;
      const k = (kosten[abschnitt(yBei(t))] ??= { n: 0, bmf: 0, pp: 0, dn: 0, draw: 0 });
      k.n++;
      k.bmf += ms;
      k.pp += pp;
    }
    for (const [t, ms] of spur.drawListe) {
      if (t > tRuhe) continue;
      const k = (kosten[abschnitt(yBei(t))] ??= { n: 0, bmf: 0, pp: 0, dn: 0, draw: 0 });
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
    cache,
    scroll: scrollArt,
    probe,
    runde,
    ruheNach,
    strecke: { ziel: s.ziel, len: s.len, endY: seite.endY },
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
      liste: seite.loaf.map((l) => ({ ...l, t: Math.round(l.start - tStart), p: Math.round(fahrtwert(yBei(l.start)) * 100) })),
    },
    lt: { n: seite.lt.length, ms: seite.lt.reduce((a, l) => a + l.dauer, 0), max: Math.max(0, ...seite.lt.map((l) => l.dauer)), liste: seite.lt.map((l) => ({ ...l, y: yBei(l.start) })) },
    phasen,
    kosten,
    ereignisse: seite.ereignisse.filter((e) => e.t >= tStart - 50).map((e) => ({ ...e, t: Math.round(e.t - tStart), p: Math.round(fahrtwert(e.y) * 100) })),
    heapMB: (nachher.JSHeapUsedSize ?? seite.heap ?? 0) / 1048576 || null,
    metriken: chromium
      ? { stilMs: d("RecalcStyleDuration") * 1000, layoutMs: d("LayoutDuration") * 1000, skriptMs: d("ScriptDuration") * 1000, aufgabenMs: d("TaskDuration") * 1000, layouts: d("LayoutCount"), stile: d("RecalcStyleCount") }
      : null,
    cpu: Object.fromEntries(Object.keys(cpuNachher).map((k) => [k, (cpuNachher[k] - (cpuVorher[k] ?? 0)) * 1000])),
    spur: spur && { ...spur, bmfListe: undefined, drawListe: undefined, verpasstJe: spur.verpasstJe.map((v) => ({ ...v, t: Math.round(v.t - tStart), p: Math.round(fahrtwert(yBei(v.t)) * 100) })), anfragen: spur.anfragen.map((a) => ({ ...a, t: Math.round(a.t - tStart) })), dekodierung: { ...spur.dekodierung, liste: spur.dekodierung.liste.map((x) => ({ ...x, t: Math.round(x.t - tStart), p: Math.round(fahrtwert(yBei(x.t)) * 100) })) }, gpuStopps: spur.gpuStopps.map((g) => ({ ...g, t: Math.round(g.t - tStart), p: Math.round(fahrtwert(yBei(g.t)) * 100) })), hauptLang: spur.hauptLang.map((h) => ({ ...h, t: Math.round(h.t - tStart), p: Math.round(fahrtwert(yBei(h.t)) * 100) })) },
    konsole,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Ebenen und Animationen (Chromium, ohne Zeitmessung): Compositing-Ebenen in der Ruhelage und während der Fahrt, welche
// Ebenen neu gezeichnet (paintCount) bzw. neu gerastert (RasterTask je Ebene) werden, und welche Animationen nicht auf
// dem Compositor laufen (Spur „blink.animations“ ab dem Laden)
// ---------------------------------------------------------------------------------------------------------------
// CompositorAnimations::FailureReason (Chromium, compositor_animations.h), Bit für Bit
const GRUENDE_ANIM = [
  "beschleunigte Animationen aus", "von DevTools unterdrückt", "ungültige Animation", "Zeitparameter nicht unterstützt", "Kompositmodus nicht replace",
  "Ziel ohne gültigen Compositing-Zustand", "unverträgliche Animationen am Ziel", "Ziel hat CSS offset", "(veraltet)", "nicht-CSS-Eigenschaften",
  "Transform-Eigenschaft auf diesem Ziel nicht beschleunigt", "Transform hängt von der Boxgröße ab", "Filter verschiebt Pixel (z. B. blur)", "Eigenschaft nicht unterstützt",
  "(veraltet)", "gemischte Keyframe-Typen", "Zeitleiste ohne gültigen Compositing-Zustand", "Animation ohne Wirkung (wegoptimiert)", "betrifft !important", "SVG mit eigener Transform-Eigenschaft",
];
async function ebenenDurchgang(browserName, fenster) {
  probeJetzt = "";
  const { ctx } = await starten(browserName, fenster, neuesProfil());
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.addInitScript(messpunkte);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Tracing.start", { transferMode: "ReturnAsStream", traceConfig: { includedCategories: ["blink.animations", "cc", "disabled-by-default-devtools.timeline", "blink.user_timing"], recordMode: "recordAsMuchAsPossible" } });
  await ruhelage(page);
  await warte(400);
  await cdp.send("DOM.enable");
  await cdp.send("DOM.getDocument", { depth: 0 });
  let ebenen = [];
  cdp.on("LayerTree.layerTreeDidChange", (e) => {
    if (e.layers) ebenen = e.layers;
  });
  await cdp.send("LayerTree.enable");
  const s = await strecke(page);
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
    const zeichnen = ebenen.filter((l) => l.drawsContent);
    const flaeche = zeichnen.reduce((a, l) => a + l.width * l.height, 0) * fenster.dpr * fenster.dpr;
    return { name, ebenen: ebenen.length, zeichnend: zeichnen.length, mpx: flaeche / 1e6, liste: ebenen.map((l) => ({ id: l.layerId, node: l.backendNodeId, w: l.width, h: l.height, paint: l.paintCount, zeichnet: l.drawsContent })) };
  };
  const stand = [await schnapp("Ruhelage")];
  // Gründe (in der Ruhelage)
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
  // Durch die Fahrt in 40 Schritten (paintCount und Rasterung je Ebene)
  await page.evaluate(() => performance.mark("vf-ebenen-start"));
  const paint0 = new Map(ebenen.map((l) => [l.layerId, l.paintCount]));
  for (let i = 1; i <= 40; i++) {
    await page.evaluate((y) => scrollTo(0, y), Math.round(s.top + (s.len * i) / 40));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await warte(40);
    if (i === 12 || i === 23 || i === 35 || i === 40) stand.push(await schnapp(`${Math.round((i / 40) * 100)} %`));
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
    if (dd.compositeFailed !== undefined) a.fehler = (a.fehler ?? 0) | dd.compositeFailed;
    if (dd.unsupportedProperties?.length) a.nicht = [...new Set([...(a.nicht ?? []), ...dd.unsupportedProperties])];
    if (e.ph === "e") anim.delete(id);
  }
  const animationen = alleAnim.filter((a) => a.ziel && /k01|kamera|einstieg|geraet|fluss|buehne|fahrt|kopf|marke|tafel|licht|hof|ruhe|pose|w-pin|w vorn|w hinten|\bw\b/.test(`${a.ziel} ${a.name ?? ""}`));
  // Rasterung je Ebene während der Fahrt
  const rasterJe = {};
  for (const e of ev) {
    if (e.name !== "RasterTask" || e.ts < startTs || e.ph !== "X") continue;
    const id = String(e.args?.tileData?.layerId ?? "?");
    const r = (rasterJe[id] ??= { n: 0, ms: 0 });
    r.n++;
    r.ms += e.dur / 1000;
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
  const groesste = [];
  for (const l of [...ebenen].filter((x) => x.drawsContent).sort((a, b) => b.width * b.height - a.width * a.height).slice(0, 8)) {
    groesste.push({ element: await beschreibe(l), groesse: `${Math.round(l.width)}×${Math.round(l.height)}`, mpx: (l.width * l.height * fenster.dpr * fenster.dpr) / 1e6 });
  }
  await ctx.close();
  return {
    fenster: fenster.name,
    stand: stand.map(({ liste, ...r }) => r),
    gruende,
    beispiele: Object.fromEntries(Object.entries(beispiele).map(([k, v]) => [k, Object.entries(v).sort((a, b) => b[1] - a[1]).slice(0, 6)])),
    animationen: animationen.map((a) => ({ ...a, gruende: a.fehler ? GRUENDE_ANIM.filter((_, i) => a.fehler & (1 << i)) : [] })),
    raster: rasterListe,
    neuGezeichnet: paintListe,
    groesste,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Ausgabe
// ---------------------------------------------------------------------------------------------------------------
const zahl = (n, st = 0) => (n === null || n === undefined || Number.isNaN(n) ? "–" : n.toFixed(st).replace(".", ","));
function tabelle(kopf, zeilen) {
  const breite = kopf.map((k, i) => Math.max(k.length, ...zeilen.map((z) => String(z[i]).length)));
  const linie = (z) => `| ${z.map((x, i) => (i < 4 || typeof x === "string" && /^[A-Za-zÄÖÜäöü]/.test(x) ? String(x).padEnd(breite[i]) : String(x).padStart(breite[i]))).join(" | ")} |`;
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
  for (const browserName of BROWSER)
    for (const fenster of FENSTER)
      for (const cache of CACHE)
        for (const scrollArt of SCROLL) for (const probe of PROBEN) for (let runde = 1; runde <= RUNDEN; runde++) if (!hat("nur-ebenen")) faelle.push({ browserName, fenster, cache, scrollArt, probe, runde });
  console.log(`Kamerafahrt messen: ${faelle.length} Fälle (${BROWSER.join(", ")} · ${FENSTER.map((f) => f.name).join(", ")} · ${CACHE.join(", ")} · ${SCROLL.join(", ")}${PROBEN.length > 1 ? ` · Gegenproben ${PROBEN.filter(Boolean).join(", ")}` : ""})`);
  for (const [i, f] of faelle.entries()) {
    const name = `${f.browserName} ${f.fenster.name} ${f.cache} ${f.scrollArt}${f.probe ? ` ohne ${f.probe}` : ""}${RUNDEN > 1 ? ` #${f.runde}` : ""}`;
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
      for (const fenster of FENSTER) {
        process.stdout.write(`  Ebenen ${b} ${fenster.name} … `);
        try {
          ebenen.push({ browser: b, ...(await ebenenDurchgang(b, fenster)) });
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
    const k = `${r.browser}|${r.fenster}|${r.cache}|${r.scroll}|${r.probe}`;
    if (!gruppen.has(k)) gruppen.set(k, []);
    gruppen.get(k).push(r);
  }
  console.log("Bildrate während des Scrollens (gezeigt: Chromium = Bilder des GPU-Prozesses, WebKit = requestAnimationFrame; Lücke > 16,7 ms heißt ≥ 1,5 Bilder, > 33 ms ≥ 2,5 Bilder; verpasst = Bilder bei 60 Hz, die fehlten)");
  tabelle(
    ["Browser", "Fenster", "Cache", "Scroll", "Gegenprobe", "Dauer s", "Bilder", ">16,7", ">33", ">100", "max ms", "verpasst", "Haupt >16,7/>33/>100", "Lücken >33: HT belegt/frei", "Render ms Median/p95/max", "LoAF n/Σms/max", "Long Tasks n/max", "Heap MB", "GPU-MB"],
    [...gruppen.values()].map((g) => {
      const r = g[0];
      const m = (f, st = 0) => zahl(mittel(g, f), st);
      return [
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
      ["Browser", "Fenster", "Cache", "Scroll", "Gegenprobe", "verpasst", ...spalten],
      mitSpur.map((g) => {
        const r = g[0];
        return [r.browser, r.fenster, r.cache, r.scroll, r.probe ? `ohne ${r.probe}` : "–", zahl(mittel(g, (x) => x.gezeigt.verpasst), 1), ...spalten.map((k) => zahl(mittel(g, (x) => x.spur.ursachen[k] ?? 0), 1))];
      }),
    );
    console.log("Wo in der Fahrt (verpasste Bilder je Abschnitt; 0–5 % = Losfahren, 58 % frontal, 88 % Maßstab 1, danach = Kapitel 2)");
    const ab = ["0–5 %", "5–30 %", "30–58 %", "58–88 %", "88–100 %", "danach"];
    tabelle(
      ["Browser", "Fenster", "Cache", "Scroll", "Gegenprobe", ...ab],
      [...gruppen.values()].map((g) => {
        const r = g[0];
        return [r.browser, r.fenster, r.cache, r.scroll, r.probe ? `ohne ${r.probe}` : "–", ...ab.map((a) => zahl(mittel(g, (x) => x.phasen[a] ?? 0), 1))];
      }),
    );
    console.log("Kosten je Bild nach Abschnitt (Chromium, ms im Mittel): Hauptthread-Bild (BeginMainFrame) / davon PrePaint / Zeichnen im Compositor");
    tabelle(
      ["Browser", "Fenster", "Cache", "Scroll", "Gegenprobe", ...ab],
      mitSpur.map((g) => {
        const r = g[0];
        return [
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
    console.log("Arbeit während des Scrollens (ms; Hauptthread nach Art als Selbstzeit, dazu Compositor-Thread, GPU-Prozess, Rasterung, Dekodierung, GC; CPU = Prozesszeit)");
    const arten = ["Skript", "Stil", "Layout", "PrePaint", "Paint", "Layer/Commit", "Canvas", "IntersectionObserver", "ResizeObserver", "HitTest", "GC", "Sonstiges"];
    tabelle(
      ["Browser", "Fenster", "Cache", "Scroll", "Gegenprobe", ...arten, "Compositor", "GPU-Haupt", "GPU-Stopps n/Σ", "Kompil. n/Σ/max", "Raster n/Σ", "Dekod. n/Σ", "CPU Renderer", "CPU GPU"],
      mitSpur.map((g) => {
        const r = g[0];
        const m = (f, st = 0) => zahl(mittel(g, f), st);
        return [
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
      const basis = gruppen.get(`${r.browser}|${r.fenster}|${r.cache}|${r.scroll}|`);
      if (!basis) continue;
      const vb = mittel(basis, (x) => x.gezeigt.verpasst);
      const vp = mittel(g, (x) => x.gezeigt.verpasst);
      const ht = (gg) => mittel(gg, (x) => (x.spur ? Object.values(x.kosten).reduce((a, k) => a + k.bmf, 0) / Math.max(1, Object.values(x.kosten).reduce((a, k) => a + k.n, 0)) : null));
      zeilen.push([r.browser, r.fenster, r.cache, r.scroll, `ohne ${r.probe}`, `${zahl(vb, 1)} → ${zahl(vp, 1)}`, zahl(vb - vp, 1), vb ? `${zahl(((vb - vp) / vb) * 100)} %` : "–", `${zahl(mittel(basis, (x) => x.gezeigt.max))} → ${zahl(mittel(g, (x) => x.gezeigt.max))}`, r.spur ? `${zahl(ht(basis), 1)} → ${zahl(ht(g), 1)}` : "–"]);
    }
    zeilen.sort((a, b) => Number(String(b[6]).replace(",", ".")) - Number(String(a[6]).replace(",", ".")));
    tabelle(["Browser", "Fenster", "Cache", "Scroll", "Gegenprobe", "verpasst", "Wegfall", "Anteil", "max ms", "HT ms/Bild"], zeilen);
  }

  // Zeitachse eines Falls (der erste Fall je Browser/Fenster mit kaltem Cache und Trackpad)
  console.log("Zeitachse (ms ab dem ersten Scrollschritt, p = Fortschritt der Fahrt in %), je Browser und Fenster der kalte Trackpad-Fall:");
  for (const r of ergebnisse.filter((x) => x.cache === CACHE[0] && x.scroll === SCROLL[0] && !x.probe && x.runde === 1)) {
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
    console.log(`  ${r.browser} ${r.fenster} (${zahl(r.dauer)} ms gescrollt, Ruhelage nach ${r.ruheNach} ms ab Laden):`);
    for (const [t, text] of zeilen.sort((a, b) => a[0] - b[0])) console.log(`    ${String(t).padStart(6)}  ${text}`);
  }
  console.log("");

  for (const e of ebenen) {
    console.log(`Ebenen ${e.browser} ${e.fenster}: ${e.stand.map((s) => `${s.name}: ${s.ebenen} (${s.zeichnend} zeichnend, ${zahl(s.mpx, 1)} MPx)`).join(" · ")}`);
    console.log(`  Gründe (Ruhelage): ${Object.entries(e.gruende).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, n]) => `${k} ${n}`).join(", ")}`);
    for (const [k, n] of Object.entries(e.gruende).sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`    ${k} ${n}: ${e.beispiele[k].map(([el, m]) => `${el} ×${m}`).join(", ")}`);
    console.log(`  größte zeichnende Ebenen: ${e.groesste.map((g) => `${g.element} ${g.groesse}`).join("; ")}`);
    console.log(`  neu gezeichnet während der Fahrt (paintCount): ${e.neuGezeichnet.map((p) => `${p.element} ${p.groesse} +${p.mehr}`).join("; ") || "keine"}`);
    console.log(`  neu gerastert während der Fahrt (Kacheln/ms): ${e.raster.map((p) => `${p.element} ${p.groesse}: ${p.n}/${zahl(p.ms)}`).join("; ") || "keine"}`);
    const nicht = e.animationen.filter((a) => a.fehler);
    console.log(`  Animationen der Bühne: ${e.animationen.length}, davon nicht auf dem Compositor: ${nicht.length}${nicht.length ? ` – ${nicht.map((a) => `${a.ziel} ${a.name ?? a.eigenschaft} (${a.gruende.join(", ")}${a.nicht ? `; ${a.nicht.join(", ")}` : ""})`).join("; ")}` : ""}`);
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
