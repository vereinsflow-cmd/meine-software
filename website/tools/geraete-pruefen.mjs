// Prüft, dass Laptop und Telefon sich genau wie im Stand c112a20 bewegen (die neue Seite ändert nur ihre Hüllen):
//   1. Die sieben Gerätebereiche stehen wörtlich in assets/css/site.css (tools/geraete-css.mjs).
//   2. Alle @keyframes vf-* sind Zeichen für Zeichen gleich (51 von 51).
//   3. Alle transform-, translate-, rotate-, scale-, perspective- und animation-Werte der Geräte-Regeln sind gleich.
//   4. Außerhalb der wörtlichen Bereiche greift keine Regel mit Bewegung (transform, translate, rotate, scale, opacity,
//      filter, animation, clip-path, mask, overflow) an .showcase*, .laptop*, .iphone* oder .phone an; kein neuer
//      Keyframe-Name endet auf „-body“ (site.js erkennt am Ende von *-body die Ruhelage). Erlaubt sind dort nur Größen
//      (--sw, --pw, --rim), object-position des Bildes und eine bewusste Ausnahme in der Ruhelage: Am gedrehten Telefon
//      des Einstiegs bleiben die Eckstreifen (.iphone-rim, display) sichtbar, sonst klafften an den runden Ecken Lücken –
//      das ändert keine Bewegung (die Matrizen unter 7. bleiben gleich), nur ob die Streifen gezeichnet werden.
//   5. assets/js/site.js enthält die Zeilen 107–140 von c112a20 wörtlich (Bild-Laden, Start der Vorführungen).
//   6. Jedes .laptop und .iphone in index.html ist Zeichen für Zeichen das Gerät aus c112a20 – bis auf das <img> im
//      Bildschirm.
//   7. Laufzeit (Playwright, Chromium und WebKit): Die Matrizen von .laptop, .laptop-lid, .laptop-body, .laptop-screen,
//      .iphone, .iphone-front und .showcase-scene sind zu den Zeitpunkten 0 / 0,8 / 2,1 / 3,6 s der Bewegung gleich wie
//      auf der Seite c112a20 (gleiche Fenstergröße, gleiche --sw/--pw). Die Referenz wird aus git ausgepackt.
//   node tools/geraete-pruefen.mjs [--ohne-browser]
// Playwright kommt aus dem Hauptordner des Repositories (VF_APP_DIR, Standard: ein Ordner höher).
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { BEREICHE, REFERENZ, geraeteTexte, istWoertlich, referenzCss } from "./geraete-css.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (f) => fs.readFileSync(path.join(root, f), "utf8");
const git = (pfad) => execFileSync("git", ["show", `${REFERENZ}:website/${pfad}`], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 });
let fehler = 0;
const melde = (ok, text) => {
  console.log(`${ok ? "ok  " : "FEHL"} ${text}`);
  if (!ok) fehler++;
};

const css = lies("assets/css/site.css");
const refCss = referenzCss();
const texte = geraeteTexte(refCss);

// 1. Bereiche
melde(istWoertlich(css, texte), `${BEREICHE.length} Gerätebereiche wörtlich aus site.css ${REFERENZ}`);

// 2. Keyframes
function keyframes(text) {
  const map = new Map();
  const re = /@keyframes\s+(vf-[\w-]+)\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    let tiefe = 1;
    let i = re.lastIndex;
    while (tiefe && i < text.length) {
      if (text[i] === "{") tiefe++;
      else if (text[i] === "}") tiefe--;
      i++;
    }
    map.set(m[1], text.slice(m.index, i));
  }
  return map;
}
const kRef = keyframes(refCss);
const kNeu = keyframes(css);
let gleich = 0;
for (const [name, block] of kRef) if (kNeu.get(name) === block) gleich++;
melde(gleich === kRef.size && kNeu.size === kRef.size, `@keyframes vf-*: ${gleich} von ${kRef.size} identisch (neu: ${kNeu.size})`);

// 3. Transform- und Animationswerte der Geräte-Regeln (Bereiche 1–6)
const werte = (text) =>
  (text.match(/^\s*(transform|translate|rotate|scale|perspective|perspective-origin|transform-origin|transform-style|backface-visibility|animation)\s*:[^;]+;/gm) ?? []).map((s) => s.trim());
const refZeilen = refCss.split("\n");
const wRef = werte(BEREICHE.slice(0, 6).map(([v, b]) => refZeilen.slice(v - 1, b).join("\n")).join("\n"));
const vorne = css.slice(css.indexOf("/* @@geraete-anfang"), css.indexOf("/* @@geraete-ende */"));
const wNeu = werte(vorne);
melde(JSON.stringify(wRef) === JSON.stringify(wNeu), `${wRef.length} Transform- und Animationswerte der Geräte-Regeln gleich (neu: ${wNeu.length})`);

// 4. Eigene Regeln: keine Bewegung an den Geräten
const ohneGeraete = css.slice(0, css.indexOf("/* @@geraete-anfang")) + css.slice(css.indexOf("/* @@geraete-ende */"), css.indexOf("/* @@geraete-keyframes"));
const ohneKommentare = ohneGeraete.replace(/\/\*[\s\S]*?\*\//g, "");
const verboten = [];
const regel = /([^{}]+)\{([^{}]*)\}/g;
let r;
while ((r = regel.exec(ohneKommentare))) {
  const selektoren = r[1].split(",").map((s) => s.trim());
  const eigenschaften = r[2];
  if (!/(^|;|\s)(transform|translate|rotate|scale|opacity|filter|animation[\w-]*|clip-path|mask[\w-]*|-webkit-mask[\w-]*|overflow[\w-]*)\s*:/m.test(eigenschaften)) continue;
  for (const s of selektoren) {
    if (s.startsWith("@") || s.startsWith("from") || s.startsWith("to") || /^\d/.test(s)) continue;
    const letztes = s.split(/[\s>+~]+/).filter(Boolean).at(-1) ?? "";
    // Ziel der Regel ist das letzte Glied; Pseudo-Elemente zählen zum Gerät
    if (/\.(showcase|showcase-stage|showcase-scene|showcase-floor|showcase-laptop|showcase-phone|laptop[\w-]*|iphone[\w-]*|phone)(?![\w-])/.test(letztes) && !/\.(pose|kamera|geraet)(?![\w-])/.test(letztes)) {
      verboten.push(s);
    }
  }
}
melde(verboten.length === 0, `keine eigene Regel bewegt Bühne oder Geräte${verboten.length ? ": " + verboten.join(" | ") : ""}`);
const eigeneNamen = [...ohneGeraete.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
melde(!eigeneNamen.some((n) => n.endsWith("-body") || n.startsWith("vf-")), `${eigeneNamen.length} eigene Keyframes, keiner heißt vf-* oder endet auf „-body“`);
const buehneJs = fs.existsSync(path.join(root, "assets/js/buehne.js")) ? lies("assets/js/buehne.js") : "";
melde(!/\.(laptop|iphone|showcase-scene)\b[^\n]*\.(animate|style)\b/.test(buehneJs) && !/querySelector[^\n]*\.(laptop|iphone)["'][^\n]*\)\.(animate|style)/.test(buehneJs), "buehne.js bewegt die Geräte nicht (liest nur ihren Zustand)");

// 5. site.js
const refJs = git("assets/js/site.js").split("\n").slice(106, 140).join("\n");
melde(lies("assets/js/site.js").includes(refJs), `site.js enthält die Zeilen 107–140 aus ${REFERENZ} wörtlich`);

// 6. Markup der Geräte
const refHtml = git("index.html").split("\n");
const geraetRef = { laptop: refHtml.slice(426, 460).join("\n"), iphone: refHtml.slice(827, 865).join("\n") };
const ohneBild = (t) => t.replace(/<img\b[^>]*>/g, "<img>").replace(/<source\b[^>]*>/g, "");
function bloecke(html, klasse) {
  const out = [];
  const zeilen = html.split("\n");
  zeilen.forEach((z, i) => {
    if (z.trim() !== `<div class="${klasse}">`) return;
    const einzug = z.match(/^\s*/)[0];
    const ende = zeilen.findIndex((y, j) => j > i && y === `${einzug}</div>`);
    out.push(zeilen.slice(i, ende + 1).join("\n"));
  });
  return out;
}
const html = lies("index.html");
for (const klasse of ["laptop", "iphone"]) {
  const liste = bloecke(html, klasse);
  const soll = ohneBild(geraetRef[klasse]).replace(/^\s+/gm, "");
  const ok = liste.length > 0 && liste.every((b) => ohneBild(b).replace(/^\s+/gm, "") === soll);
  melde(ok, `${liste.length} × .${klasse} in index.html wie in ${REFERENZ} (bis auf das Bild im Bildschirm)`);
}

// 7. Laufzeit
if (process.argv.includes("--ohne-browser")) {
  console.log("(Laufzeitprüfung übersprungen)");
} else {
  await laufzeit();
}

console.log(fehler ? `\n${fehler} Fehler` : "\nAlles gleich: Laptop und Telefon bewegen sich wie bisher.");
process.exit(fehler ? 1 : 0);

async function laufzeit() {
  const APP_DIR = process.env.VF_APP_DIR ?? path.resolve(root, "..");
  let pw;
  try {
    pw = createRequire(path.join(APP_DIR, "package.json"))("playwright");
  } catch {
    melde(false, `Playwright nicht gefunden (VF_APP_DIR=${APP_DIR}) – Laufzeitprüfung nicht möglich`);
    return;
  }
  // Referenz aus git auspacken (nur Seite, Stil, Skripte und Texturen; der Ordner liegt im Temp-Verzeichnis des Systems)
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vf-geraete-"));
  const teile = ["index.html", "assets/css", "assets/js", "assets/img/textur-koernung.svg", "assets/img/textur-buerstung.svg"].map((t) => `website/${t}`).join(" ");
  execFileSync("sh", ["-c", `git archive ${REFERENZ} ${teile} | tar -x -C "${tmp}"`], { cwd: path.resolve(root, "..") });
  const server = (dir) =>
    new Promise((fertig) => {
      const s = http.createServer((req, res) => {
        let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
        if (p.endsWith("/")) p += "index.html";
        const f = path.join(dir, p);
        if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
          res.writeHead(404).end();
          return;
        }
        const typ = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png" }[path.extname(f)] ?? "application/octet-stream";
        res.writeHead(200, { "Content-Type": `${typ}; charset=utf-8` });
        fs.createReadStream(f).pipe(res);
      });
      s.listen(0, "127.0.0.1", () => fertig(s));
    });
  const sNeu = await server(root);
  const sRef = await server(path.join(tmp, "website"));
  const url = (s) => `http://127.0.0.1:${s.address().port}/`;
  const ELEMENTE = {
    laptop: [".laptop", ".laptop-lid", ".laptop-body", ".laptop-screen", ".laptop-cover"],
    iphone: [".iphone", ".iphone-front", ".iphone-back"],
  };
  const ZEITEN = [0, 800, 2100, 3600];
  // Liest die lokalen Matrizen eines Geräts (und seiner Bühne) zu den Zeitpunkten; Größe vorgegeben
  const messen = async (page, auswahl, typ) =>
    page.evaluate(
      async ({ auswahl, typ, ELEMENTE, ZEITEN }) => {
        const showcase = document.querySelector(auswahl);
        const scene = showcase.querySelector(".showcase-scene");
        if (typ === "laptop") showcase.style.setProperty("--sw", "640px");
        else scene.style.setProperty("--pw", "224px");
        showcase.classList.remove("is-rest", "ist-posiert");
        showcase.classList.add("is-playing");
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const ziele = [scene, ...ELEMENTE[typ].map((s) => showcase.querySelector(s))];
        const anims = showcase.getAnimations({ subtree: true });
        const ergebnis = [];
        for (const t of ZEITEN) {
          for (const a of anims) {
            a.pause();
            a.currentTime = t;
          }
          ergebnis.push(ziele.map((e) => [getComputedStyle(e).transform, getComputedStyle(e).opacity].join(" | ")));
        }
        return ergebnis;
      },
      { auswahl, typ, ELEMENTE, ZEITEN },
    );
  const FAELLE = [
    // [Seite, Auswahl des .showcase]
    ["laptop", ".k01 .showcase-laptop", "#am-rechner"],
    ["laptop", ".k06 .showcase-laptop", "#am-rechner"],
    ["iphone", ".k01 .showcase-phone", "section.showcase-phone"],
    ["iphone", ".k04 .showcase-phone", "section.showcase-phone"],
  ];
  try {
    for (const name of ["chromium", "webkit"]) {
      let browser;
      try {
        browser = await pw[name].launch();
      } catch {
        console.log(`(${name} nicht installiert – übersprungen)`);
        continue;
      }
      for (const [typ, neuSel, refSel] of FAELLE) {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "no-preference" });
        const pNeu = await ctx.newPage();
        await pNeu.goto(url(sNeu), { waitUntil: "load" });
        const pRef = await ctx.newPage();
        await pRef.goto(url(sRef), { waitUntil: "load" });
        const a = await messen(pNeu, neuSel, typ);
        const b = await messen(pRef, refSel, typ);
        // Gegenprobe: Die Bewegung muss tatsächlich laufen (Matrix des Geräts am Anfang anders als am Ende)
        const bewegt = a[0][1] !== a[ZEITEN.length - 1][1] && !a[1][1].startsWith("none");
        const ok = bewegt && JSON.stringify(a) === JSON.stringify(b);
        let hinweis = bewegt ? "" : " – die Animation lief nicht (Matrizen ohne Bewegung)";
        if (!ok && bewegt) {
          outer: for (let i = 0; i < a.length; i++) for (let j = 0; j < a[i].length; j++) if (a[i][j] !== b[i][j]) { hinweis = ` – erste Abweichung bei ${ZEITEN[i]} ms, Element ${j}: ${a[i][j]} ≠ ${b[i][j]}`; break outer; }
        }
        melde(ok, `${name}: ${neuSel} bewegt sich wie ${refSel} in ${REFERENZ} (${ZEITEN.length} Zeitpunkte × ${a[0].length} Elemente)${hinweis}`);
        await ctx.close();
      }
      await browser.close();
    }
  } finally {
    sNeu.close();
    sRef.close();
  }
}
