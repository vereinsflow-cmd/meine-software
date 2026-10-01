// Erzeugt die Keyframes der Vorführungen (Laptop und Telefon, die sich von selbst ins Bild drehen) aus den Formeln und
// schreibt sie ans Ende von assets/css/site.css (alles nach dem Kommentar „Keyframes der Vorführungen“ wird ersetzt).
//
//   node tools/make-showcase-keyframes.mjs
//
// Ohne Abhängigkeiten. p = Anteil der Laufzeit (Laptop 3,6 s, Telefon 4 s, siehe site.css): 0 % = Start, 100 % = Ende.
// (Die Formeln stammen aus der Zeit, als die Bewegung am Scrollen hing; die ersten 3 % ohne Bewegung überspringt site.css.) Die Formeln bilden weiche Teil-Abläufe (smoothstep) für Erscheinen, Drehen,
// Aufklappen und Aufrichten; Licht auf den Flächen nach Lambert (beim Laptop mit Umgebungslicht, siehe shadeL). Stützpunkte
// werden adaptiv gesetzt – so viele, dass die
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
// Endlage: Der Deckel steht 14° über die Senkrechte hinaus offen (104°) – gekippt wird dafür das Unterteil um das Scharnier
// nach vorn (--open in site.css, muss gleich sein), der Deckel bleibt in der Bildebene
const OPEN = 14;
const L = (p) => {
  const a = clamp((p - 0.03) / 0.27), r = clamp((p - 0.3) / 0.26), o = clamp((p - 0.5) / 0.28), k = clamp((p - 0.58) / 0.26);
  const ae = ss(a), re = Math.min(1, ss(r) * 1.01), oe = Math.min(1, ss(o) * 1.01), ke = Math.min(1, ss(k) * 1.01);
  // tilt: Neigung zum Betrachter (rotateX in vf-laptop-body)
  return { a, ae, re, oe, ke, ang: (1 - re) * 172, tilt: (1 - ke) * (-28 + OPEN * oe) };
};
// Wie breit man die linke Seite sieht (Anteil ihrer Höhe): cos zur Blickrichtung, verkürzt durch die Neigung, abzüglich
// der Perspektive – sie liegt eine halbe Breite links der Sichtlinie (halbe Breite durch Kameraabstand ≈ 0,05) und ist
// deshalb erst zu sehen, wenn sie etwas über die Kantenansicht hinaus gedreht ist. Rechts sieht man nie (Drehung 172° → 0°).
const sideL = (s) => Math.sin(rad(s.ang)) * Math.cos(rad(s.tilt)) - 0.05 * Math.cos(rad(s.ang)) ** 2;
// Schatten des Deckels auf der Oberseite (Endlage, siehe .laptop-deck::after): Deckkraft und Reichweite (Anteil der Tiefe)
const DECK_SHADE = 0.5, DECK_REACH = 0.16;
// ---------- Telefon ----------
const P = (p) => {
  const a = clamp((p - 0.03) / 0.3), r = clamp((p - 0.26) / 0.46);
  const ae = ss(a), re = Math.min(1, ss(r) * 1.01);
  return { a, ae, re, ang: (1 - re) * -172 };
};
const shade = (phi, ang, light, k) => (1 - Math.max(0, Math.cos(rad(phi + ang + light)))) * k;
// Laptop: Lambert mit Umgebungslicht (Licht von vorn links, 35° zur Seite und 35° über der Waagerechten, tan 0,7) –
// eloxiertes Aluminium spiegelt die helle Umgebung, eine abgewandte Fläche wird deshalb höchstens gut 25 % dunkler statt
// 50 %. tilt: Die senkrechten Flächen des Unterteils kippen beim Aufklappen mit ihm um bis zu 14° nach unten, vom Licht
// weg (vf-laptop-hinge): Anteil zur Seite mal cos, dazu −tan(Höhe) · sin der Kippung (bezogen auf eine senkrechte Fläche)
const LIGHT_TAN = 0.7;
const shadeL = (phi, ang, tilt = 0) =>
  0.36 * (1 - (0.3 + 0.7 * Math.max(0, Math.cos(rad(phi + ang + 35)) * Math.cos(rad(tilt)) - LIGHT_TAN * Math.sin(rad(tilt)))));

// Jede Animation: Parameter je p, Toleranzen je Parameter (in „sichtbaren“ Einheiten), Ausgabe als CSS-Deklaration.
// Größen für die Fehlerabschätzung: 100vh ≈ 945 px, --lh ≈ 634 px, --closed-scale 0,86 (ungünstigster Fall)
const anims = [
  {
    name: "vf-laptop-body",
    fn: (p) => {
      const s = L(p);
      // Z: Beim Aufklappen fährt die Kamera kurz zurück (der Laptop rückt um Z Kameraabstände nach hinten, --cam in
      // site.css) – so bleibt die Vorderkante im Bild, ohne dass das Gerät selbst schrumpft. R: Neigung zum Betrachter;
      // während der Deckel aufgeht, gleicht sie die Kippung des Unterteils (vf-laptop-hinge) aus – die Oberseite bleibt
      // gleich geneigt. Y: zugeklappt angehoben; beim Aufrichten etwas abgesenkt, denn die Neigung um die Mitte des
      // Unterteils hebt das Scharnier – sonst stieße der hochklappende Deckel an die Überschrift
      return { X: 1 - s.ae, Y: (1 - s.oe) * 0.42 - s.oe * (1 - s.ke) * 0.1, A: 0.7 + 0.3 * s.ae, B: s.oe, Z: 0.3 * s.oe * (1 - s.ke), R: s.tilt, S: (1 - s.re) * 172 };
    },
    err: (v, w) => [Math.abs((v.X - w.X) * 283.5 - (v.Y - w.Y) * 634) / 0.3, Math.abs((v.A * (0.86 + 0.14 * v.B)) / (1 + v.Z) - (w.A * (0.86 + 0.14 * w.B)) / (1 + w.Z)) / 0.0015, Math.abs(v.R - w.R) / 0.2, Math.abs(v.S - w.S) / 0.2],
    css: (v) => `transform: translateY(calc(${f(v.X)} * 30vh - ${f(v.Y)} * var(--lh))) translateZ(calc(${f(-v.Z)} * var(--cam))) scale(calc(${f(v.A)} * (var(--closed-scale, 1) + (1 - var(--closed-scale, 1)) * ${f(v.B)}))) rotateX(${f(v.R, 3)}deg) rotateY(${f(v.S, 3)}deg);`,
  },
  // Unterteil um das Scharnier: zugeklappt gerade (der Deckel liegt darauf), beim Aufklappen auf die Endlage gekippt
  { name: "vf-laptop-hinge", fn: (p) => ({ V: L(p).oe * -OPEN }), tol: { V: 0.2 }, css: (v) => `transform: rotateX(${f(v.V, 3)}deg);` },
  { name: "vf-laptop-lid", fn: (p) => ({ V: (1 - L(p).oe) * -90 }), tol: { V: 0.2 }, css: (v) => `transform: rotateX(${f(v.V, 3)}deg);` },
  { name: "vf-laptop-screen", fn: (p) => ({ V: clamp(L(p).oe * 50) }), tol: { V: 0.001 }, css: (v) => `scale: ${f(v.V)};` },
  { name: "vf-laptop-cover", fn: (p) => ({ V: clamp((0.98 - L(p).oe) * 50) }), tol: { V: 0.001 }, css: (v) => `scale: ${f(v.V)};` },
  // Tastatur, Touchpad und Lautsprecher: verborgen, solange der Deckel zu ist (bis er gut 3° offen steht, siehe vf-laptop-lid)
  { name: "vf-laptop-deck-parts", fn: (p) => ({ V: p >= 0.5322 ? 1 : 0 }), tol: { V: 0.5 }, css: (v) => `visibility: ${v.V ? "visible" : "hidden"};` },
  // Rückseite des Deckels: hochgeklappt zeigt sie vom Licht weg und wird dunkler
  { name: "vf-laptop-cover-dark", fn: (p) => ({ V: L(p).oe * 0.4 }), tol: { V: 0.01 }, css: (v) => `opacity: ${f(v.V, 3)};` },
  // Glas: schwarz, bis der Deckel gut halb offen ist, dann geht der Bildschirm in gut 0,3 s an. Über das dunkle Glas
  // gleitet beim Aufklappen das Spiegelbild einer Leuchte von oben nach unten (Hintergrund 300 % hoch: bei 77,5 % steht das
  // Band über dem Glas, bei 7,5 % darunter – Endlage, siehe site.css); am hellsten, solange das Glas flach gesehen wird
  { name: "vf-laptop-screen-off", fn: (p) => ({ V: 0.97 * (1 - ss(clamp((L(p).oe - 0.55) / 0.4))) }), tol: { V: 0.01 }, css: (v) => `opacity: ${f(v.V, 3)};` },
  { name: "vf-laptop-screen-glare", fn: (p) => { const s = L(p); return { V: 1 - s.ke, Y: 77.5 - 70 * ss(clamp((s.oe - 0.1) / 0.75)) }; }, tol: { V: 0.01, Y: 0.4 }, css: (v) => `opacity: ${f(v.V, 3)}; background-position: 0 ${f(v.Y, 1)}%;` },
  // Lichtschein auf dem zugeklappten Deckel: Er steht still, während sich das Aluminium darunter dreht (die Schicht dreht
  // in der Deckelebene gegen die Drehung des Laptops), und blendet beim Aufklappen aus
  { name: "vf-laptop-sheen", fn: (p) => { const s = L(p); return { R: s.ang, O: 0.9 * (1 - s.oe) }; }, tol: { R: 0.2, O: 0.01 }, css: (v) => `rotate: ${f(v.R, 2)}deg; opacity: ${f(v.O, 3)};` },
  // Schatten des Deckels auf der Oberseite, Licht schräg von vorn oben (siehe shadeL): Steht der Deckel um den Winkel w
  // offen, liegt die Oberseite bis cos w − sin w / 0,7 der Tiefe im Schatten (ab 35° gar nicht mehr). scale streckt die
  // Schicht vom Scharnier aus (höchstens bis zur Vorderkante) so weit, dass die Mitte ihres weichen Auslaufs (bei 80 %)
  // dort liegt. Er zieht sich beim Aufklappen zum Scharnier zurück und wird heller; aufgeklappt bleibt ein schmaler
  // Schatten am Scharnier
  {
    name: "vf-laptop-deck-shade",
    fn: (p) => {
      const w = (90 + OPEN) * L(p).oe, reach = (Math.cos(rad(w)) - Math.sin(rad(w)) / LIGHT_TAN) / 0.8;
      return { O: DECK_SHADE + (1 - DECK_SHADE) * (1 - ss(clamp((w - 5) / 35))), Y: Math.max(DECK_REACH, Math.min(1, reach)) };
    },
    tol: { O: 0.01, Y: 0.004 },
    css: (v) => `opacity: ${f(v.O, 3)}; scale: 1 ${f(v.Y)};`,
  },
  ...[["front", 0], ["rear", 180], ["side-l", -90], ["side-r", 90]].map(([n, phi]) => ({
    name: `vf-laptop-lit-${n}`, fn: (p) => ({ V: shadeL(phi, L(p).ang, OPEN * L(p).oe) }), tol: { V: 0.008 }, css: (v) => `opacity: ${f(v.V, 3)};`,
  })),
  // Linke Seite und linke Kante des Deckels fast genau von der Kante gesehen (unter etwa 2 px breit): halb bis ganz
  // ausgeblendet – Chromium zeichnet so schmale Flächen sonst als gestrichelte helle Linie. Die Anschlüsse darin blenden
  // etwas früher aus (dunkle Striche wären noch auffälliger), sind aber ganz zu sehen, bis die Seite nur noch gut 15° zum
  // Betrachter gedreht ist
  { name: "vf-laptop-side-l", fn: (p) => ({ V: ss(clamp((sideL(L(p)) - 0.035) / 0.105)) }), tol: { V: 0.01 }, css: (v) => `opacity: ${f(v.V, 3)};` },
  { name: "vf-laptop-ports", fn: (p) => ({ V: ss(clamp((sideL(L(p)) - 0.12) / 0.08)) }), tol: { V: 0.01 }, css: (v) => `opacity: ${f(v.V, 3)};` },
  // Oberkante des Deckels: zugeklappt zeigt sie nach vorn wie die Vorderkante, aufgeklappt nach oben (ganz hell)
  { name: "vf-laptop-lit-lid-top", fn: (p) => ({ V: (1 - L(p).oe) * shadeL(0, L(p).ang) }), tol: { V: 0.008 }, css: (v) => `opacity: ${f(v.V, 3)};` },
  // Licht an den Stößen der Eckstreifen (Winkel der Flächennormale wie bei den Kanten: vorn 0°, links −90°, rechts 90°,
  // hinten ±180°); vorn, hinten, links und rechts übernehmen die Animationen der Kanten
  ...[-157.5, -135, -112.5, -67.5, -45, -22.5, 22.5, 45, 67.5, 112.5, 135, 157.5].map((phi) => ({
    name: `vf-laptop-lit-${phi < 0 ? "m" : "p"}${Math.floor(Math.abs(phi))}`, fn: (p) => ({ V: shadeL(phi, L(p).ang, OPEN * L(p).oe) }), tol: { V: 0.008 }, css: (v) => `opacity: ${f(v.V, 3)};`,
  })),
  { name: "vf-laptop-scene", fn: (p) => ({ V: clamp(L(p).a * 1.6) }), tol: { V: 0.01 }, css: (v) => `opacity: ${f(v.V, 3)};` },
  {
    name: "vf-laptop-floor",
    fn: (p) => { const s = L(p); return { O: (0.5 + 0.5 * s.oe) * (1 - s.ke), SX: (0.55 + 0.45 * s.ae) * (1.1 - 0.1 * s.oe), SY: 0.55 + 0.45 * s.ae }; },
    tol: { O: 0.01, SX: 0.003, SY: 0.003 },
    css: (v) => `opacity: ${f(v.O, 3)}; scale: ${f(v.SX)} ${f(v.SY)};`,
  },
  { name: "vf-laptop-contact", fn: (p) => ({ V: L(p).ke ** 2 }), tol: { V: 0.01 }, css: (v) => `opacity: ${f(v.V, 3)};` },
  // Oberseite des Unterteils ganz verborgen, solange der Deckel exakt zu ist (bis p = 0,5): Schutz, falls Safari sie trotz
  // Bezugspunkt in der Mitte über den Deckel zeichnet (je nach Version und Grafikchip sortiert es anders). Genau 0,5, nicht
  // 0,532 – sonst Durchblick unter dem sich hebenden Deckel. Toleranz unter 0,5: Der Wechsel liegt genau in der Mitte
  // zwischen 0 % und 100 %, der Fehler dort wäre genau 1 – dann setzte der Generator keinen Stützpunkt, und die Fläche
  // wäre durchgehend sichtbar.
  { name: "vf-laptop-deck", fn: (p) => ({ V: p > 0.5 ? 1 : 0 }), tol: { V: 0.4 }, css: (v) => `visibility: ${v.V ? "visible" : "hidden"};` },
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
  // Glanz auf dem matten Rückglas: wandert beim Drehen über die Fläche zur herandrehenden Kante (Spiegelbild des
  // ruhenden Lichts; auf der gedrehten Rückseite zeigt +x zur zurückweichenden Kante, daher das Minus), am stärksten,
  // wenn die Flächennormale auf der Winkelhalbierenden zwischen Blick und Licht steht (≈ −165°)
  { name: "vf-phone-sheen", fn: (p) => { const d = (P(p).ang + 165) / 40; return { X: clamp(d, -1.5, 1.5), O: Math.exp(-d * d) }; }, tol: { X: 0.01, O: 0.01 }, css: (v) => `translate: ${f(v.X * -40, 2)}% 0; opacity: ${f(v.O, 3)};` },
  ...[["side-l", -90], ["side-r", 90]].map(([n, phi]) => ({
    name: `vf-phone-${n}`, fn: (p) => ({ V: shade(phi, P(p).ang, -30, 0.32) }), tol: { V: 0.008 }, css: (v) => `opacity: ${f(v.V, 3)};`,
  })),
  { name: "vf-phone-scene", fn: (p) => ({ V: clamp(P(p).a * 1.6) }), tol: { V: 0.01 }, css: (v) => `opacity: ${f(v.V, 3)};` },
  // Bodenschatten: in der Kantenansicht nur so breit, wie das Gehäuse dick ist (|cos| des Drehwinkels), sonst wie bisher
  { name: "vf-phone-floor", fn: (p) => { const s = P(p), c = Math.abs(Math.cos(rad(s.ang))), sy = 0.55 + 0.45 * s.ae; return { SX: sy * (0.28 + 0.72 * c), SY: sy }; }, tol: { SX: 0.003, SY: 0.003 }, css: (v) => `scale: ${f(v.SX)} ${f(v.SY)};` },
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
