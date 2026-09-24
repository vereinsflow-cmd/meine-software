// Erzeugt die Keyframes der Vorführungen (Laptop und Telefon, die sich beim Scrollen drehen) aus den Bewegungsformeln und
// schreibt sie ans Ende von assets/css/site.css (alles nach dem Kommentar „Keyframes der Vorführungen“ wird ersetzt).
//
//   node tools/make-showcase-keyframes.mjs
//
// Ohne Abhängigkeiten. Jede Animation läuft über den ganzen Abschnitt: 0 % = Abschnitt kommt unten ins Fenster (p = 0),
// 100 % = sein Ende kommt unten an (p = 1). Der Laptop spielt dieselben Keyframes über die Zeit ab (3,6 s, site.css),
// p ist dort der Anteil der Zeit. Die Formeln bilden weiche Teil-Abläufe (smoothstep) für Erscheinen, Drehen,
// Aufklappen und Aufrichten; Licht auf den Flächen nach Lambert. Stützpunkte werden adaptiv gesetzt – so viele, dass die
// lineare Interpolation dazwischen höchstens um die Toleranz von der Formel abweicht (etwa 0,3 px, 0,2°, 1 % Deckkraft).
// Die Endwerte (p = 1) müssen mit den Grundregeln in site.css übereinstimmen: So stehen die Geräte ohne Animation.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cssFile = path.join(root, "assets", "css", "site.css");

const clamp = (x, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
const ss = (x) => x * x * (3 - 2 * x);
const rad = (d) => (d * Math.PI) / 180;
const f = (x, d = 4) => {
  const v = Number(x.toFixed(d));
  return Object.is(v, -0) ? "0" : String(v);
};

// ---------- Laptop ----------
const L = (p) => {
  const a = clamp((p - 0.03) / 0.27), r = clamp((p - 0.3) / 0.26), o = clamp((p - 0.5) / 0.28), k = clamp((p - 0.58) / 0.26);
  const ae = ss(a), re = Math.min(1, ss(r) * 1.01), oe = Math.min(1, ss(o) * 1.01), ke = Math.min(1, ss(k) * 1.01);
  return { a, ae, re, oe, ke, ang: (1 - re) * 172 };
};
// ---------- Telefon ----------
const P = (p) => {
  const a = clamp((p - 0.03) / 0.3), r = clamp((p - 0.26) / 0.46);
  const ae = ss(a), re = Math.min(1, ss(r) * 1.01);
  return { a, ae, re, ang: (1 - re) * -172 };
};
const shade = (phi, ang, light, k) => (1 - Math.max(0, Math.cos(rad(phi + ang + light)))) * k;

// Jede Animation: Parameter je p, Toleranzen je Parameter (in „sichtbaren“ Einheiten), Ausgabe als CSS-Deklaration.
// Größen für die Fehlerabschätzung: 100vh ≈ 945 px, --lh ≈ 596 px, --closed-scale 0,76 (ungünstigster Fall)
const anims = [
  {
    name: "vf-laptop-body",
    fn: (p) => {
      const s = L(p);
      return { X: 1 - s.ae, Y: (1 - s.oe) * 0.42 + s.oe * (1 - s.ke) * 0.05, A: 0.7 + 0.3 * s.ae, B: s.oe, C: 1 - 0.26 * s.oe * (1 - s.ke), R: (1 - s.ke) * -22, S: (1 - s.re) * 172 };
    },
    err: (v, w) => [Math.abs((v.X - w.X) * 283.5 - (v.Y - w.Y) * 596) / 0.3, Math.abs(v.A * (0.76 + 0.24 * v.B) * v.C - w.A * (0.76 + 0.24 * w.B) * w.C) / 0.0015, Math.abs(v.R - w.R) / 0.2, Math.abs(v.S - w.S) / 0.2],
    css: (v) => `transform: translateY(calc(${f(v.X)} * 30vh - ${f(v.Y)} * var(--lh))) scale(calc(${f(v.A)} * (var(--closed-scale, 1) + (1 - var(--closed-scale, 1)) * ${f(v.B)}) * ${f(v.C)})) rotateX(${f(v.R, 3)}deg) rotateY(${f(v.S, 3)}deg);`,
  },
  { name: "vf-laptop-lid", fn: (p) => ({ V: (1 - L(p).oe) * -90 }), tol: { V: 0.2 }, css: (v) => `transform: rotateX(${f(v.V, 3)}deg);` },
  { name: "vf-laptop-screen", fn: (p) => ({ V: clamp(L(p).oe * 50) }), tol: { V: 0.001 }, css: (v) => `scale: ${f(v.V)};` },
  { name: "vf-laptop-cover", fn: (p) => ({ V: clamp((0.98 - L(p).oe) * 50) }), tol: { V: 0.001 }, css: (v) => `scale: ${f(v.V)};` },
  // Rückseite des Deckels: hochgeklappt zeigt sie vom Licht weg und wird dunkler
  { name: "vf-laptop-cover-dark", fn: (p) => ({ V: L(p).oe * 0.4 }), tol: { V: 0.01 }, css: (v) => `opacity: ${f(v.V, 3)};` },
  { name: "vf-laptop-screen-off", fn: (p) => ({ V: (1 - L(p).oe) * 0.94 }), tol: { V: 0.01 }, css: (v) => `opacity: ${f(v.V, 3)};` },
  { name: "vf-laptop-screen-glare", fn: (p) => ({ V: 1 - L(p).ke }), tol: { V: 0.01 }, css: (v) => `opacity: ${f(v.V, 3)};` },
  { name: "vf-laptop-sheen", fn: (p) => { const re = L(p).re; return { V: 4 * re * (1 - re) }; }, tol: { V: 0.01 }, css: (v) => `opacity: ${f(v.V, 3)};` },
  ...[["front", 0], ["rear", 180], ["side-l", -90], ["side-r", 90]].map(([n, phi]) => ({
    name: `vf-laptop-lit-${n}`, fn: (p) => ({ V: shade(phi, L(p).ang, 35, 0.5) }), tol: { V: 0.008 }, css: (v) => `opacity: ${f(v.V, 3)};`,
  })),
  // Licht an den Stößen der Eckstreifen vorn (Winkel der Flächennormale wie bei den Kanten: vorn 0°, links −90°, rechts
  // 90°); vorn, links und rechts übernehmen die Animationen der Kanten
  ...[-67.5, -45, -22.5, 22.5, 45, 67.5].map((phi) => ({
    name: `vf-laptop-lit-${phi < 0 ? "m" : "p"}${Math.floor(Math.abs(phi))}`, fn: (p) => ({ V: shade(phi, L(p).ang, 35, 0.5) }), tol: { V: 0.008 }, css: (v) => `opacity: ${f(v.V, 3)};`,
  })),
  { name: "vf-laptop-scene", fn: (p) => ({ V: clamp(L(p).a * 1.6) }), tol: { V: 0.01 }, css: (v) => `opacity: ${f(v.V, 3)};` },
  {
    name: "vf-laptop-floor",
    fn: (p) => { const s = L(p); return { O: (0.5 + 0.5 * s.oe) * (1 - s.ke), SX: (0.55 + 0.45 * s.ae) * (1.1 - 0.1 * s.oe), SY: 0.55 + 0.45 * s.ae }; },
    tol: { O: 0.01, SX: 0.003, SY: 0.003 },
    css: (v) => `opacity: ${f(v.O, 3)}; scale: ${f(v.SX)} ${f(v.SY)};`,
  },
  { name: "vf-laptop-contact", fn: (p) => ({ V: L(p).ke ** 2 }), tol: { V: 0.01 }, css: (v) => `opacity: ${f(v.V, 3)};` },
  // ---------- Telefon ----------
  {
    name: "vf-phone-body",
    fn: (p) => { const s = P(p); return { X: 1 - s.ae, A: (0.74 + 0.26 * s.ae) * (0.9 + 0.1 * s.re), Z: (1 - s.re) * -9, R: (1 - s.re) * 8, S: (1 - s.re) * -172 }; },
    err: (v, w) => [Math.abs(v.X - w.X) * 264.6 / 0.3, Math.abs(v.A - w.A) / 0.0015, Math.abs(v.Z - w.Z) / 0.2, Math.abs(v.R - w.R) / 0.2, Math.abs(v.S - w.S) / 0.2],
    css: (v) => `transform: translateY(calc(${f(v.X)} * 28vh)) scale(${f(v.A)}) rotateZ(${f(v.Z, 3)}deg) rotateX(${f(v.R, 3)}deg) rotateY(${f(v.S, 3)}deg);`,
  },
  { name: "vf-phone-front", fn: (p) => ({ V: clamp((P(p).re - 0.47) * 100) }), tol: { V: 0.001 }, css: (v) => `scale: ${f(v.V)};` },
  { name: "vf-phone-glare", fn: (p) => ({ V: 1 - P(p).re }), tol: { V: 0.01 }, css: (v) => `opacity: ${f(v.V, 3)};` },
  { name: "vf-phone-buttons", fn: (p) => ({ V: clamp((P(p).re - 0.82) * 6) }), tol: { V: 0.01 }, css: (v) => `opacity: ${f(v.V, 3)};` },
  { name: "vf-phone-back", fn: (p) => ({ V: clamp((0.485 - P(p).re) * 100) }), tol: { V: 0.001 }, css: (v) => `scale: ${f(v.V)};` },
  { name: "vf-phone-back-shade", fn: (p) => ({ V: shade(180, P(p).ang, -30, 0.38) }), tol: { V: 0.008 }, css: (v) => `opacity: ${f(v.V, 3)};` },
  { name: "vf-phone-sheen", fn: (p) => { const x = clamp(P(p).re / 0.48); return { V: 4 * x * (1 - x) }; }, tol: { V: 0.01 }, css: (v) => `opacity: ${f(v.V, 3)};` },
  ...[["side-l", -90], ["side-r", 90]].map(([n, phi]) => ({
    name: `vf-phone-${n}`, fn: (p) => ({ V: shade(phi, P(p).ang, -30, 0.32) }), tol: { V: 0.008 }, css: (v) => `opacity: ${f(v.V, 3)};`,
  })),
  { name: "vf-phone-scene", fn: (p) => ({ V: clamp(P(p).a * 1.6) }), tol: { V: 0.01 }, css: (v) => `opacity: ${f(v.V, 3)};` },
  { name: "vf-phone-floor", fn: (p) => ({ V: 0.55 + 0.45 * P(p).ae }), tol: { V: 0.003 }, css: (v) => `scale: ${f(v.V)};` },
];

const N = 20000; // Rasterschritte für die Fehlersuche
let total = 0;
let out = "";
for (const anim of anims) {
  const vals = Array.from({ length: N + 1 }, (_, i) => anim.fn(i / N));
  const err = anim.err ?? ((v, w) => Object.keys(anim.tol).map((k) => Math.abs(v[k] - w[k]) / anim.tol[k]));
  const lerp = (a, b, t) => Object.fromEntries(Object.keys(a).map((k) => [k, a[k] + (b[k] - a[k]) * t]));
  // Stützpunkte: Anfang und Ende sowie jede Stelle, an der ein Wert genau 0 oder 1 erreicht bzw. verlässt (so bleibt etwa
  // ein zusammengeschobenes scale bis dorthin exakt 0 – nicht nur fast); dann jeweils den schlechtesten Zwischenpunkt
  // einfügen, bis alles in der Toleranz liegt
  const atBound = (v) => v === 0 || v === 1;
  const seeds = new Set([0, N]);
  for (const k of Object.keys(vals[0])) {
    for (let i = 0; i < N; i++) {
      const a = atBound(vals[i][k]), b = atBound(vals[i + 1][k]);
      if (a && !b) seeds.add(i);
      if (b && !a) seeds.add(i + 1);
    }
  }
  const keys = [...seeds].sort((x, y) => x - y);
  for (let guard = 0; guard < 400; guard++) {
    let worst = null;
    for (let s = 0; s < keys.length - 1; s++) {
      const i0 = keys[s], i1 = keys[s + 1];
      for (let i = i0 + 1; i < i1; i++) {
        const e = Math.max(...err(vals[i], lerp(vals[i0], vals[i1], (i - i0) / (i1 - i0))));
        if (e > 1 && (!worst || e > worst.e)) worst = { e, i, s };
      }
    }
    if (!worst) break;
    keys.splice(worst.s + 1, 0, worst.i);
  }
  total += keys.length;
  const stops = keys.map((i) => `  ${f((i / N) * 100, 3)}% {\n    ${anim.css(vals[i]).replace(/; /g, ";\n    ")}\n  }\n`);
  out += `@keyframes ${anim.name} {\n${stops.join("\n")}}\n\n`;
}

const css = fs.readFileSync(cssFile, "utf8");
const head = css.indexOf("Keyframes der Vorführungen");
if (head < 0) throw new Error("Kommentar „Keyframes der Vorführungen“ in site.css nicht gefunden");
const start = css.indexOf("*/", head) + 2;
// Nur erzeugte Keyframes ersetzen: Steht dahinter noch anderes CSS, lieber abbrechen, als es zu überschreiben
const foreign = css.slice(start).replace(/@keyframes vf-[\w-]+ \{[\s\S]*?\n\}\n?/g, "").trim();
if (foreign) throw new Error(`Nach den Keyframes der Vorführungen steht anderes CSS – bitte vor den Kommentar verschieben:\n${foreign.slice(0, 200)}`);
fs.writeFileSync(cssFile, `${css.slice(0, start)}\n\n${out.trimEnd()}\n`);
console.log(`${anims.length} Animationen, ${total} Stützpunkte, ${(out.length / 1024).toFixed(1)} KB → ${path.relative(root, cssFile)}`);
