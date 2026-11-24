// Setzt die Sprecherstimme des 45-s-Reels aus den vorhandenen ElevenLabs-Aufnahmen („Jonas“) der früheren Reels zusammen.
//   node werkzeuge/stimme-zusammensetzen.mjs
// Quellen: audio/quellen/jonas-60s.wav (Sprecher des 60-s-Reels) und audio/quellen/jonas-35s.wav (35-s-Reel), beide
// 48 kHz mono (afconvert aus den MP3s). Jeder Abschnitt aus plan/abschnitte.json wird aus Satz-Ausschnitten gebaut
// (Zeiten unten, per Pausen-Erkennung vermessen), die Lautstärke der Ausschnitte wird angeglichen, zwischen den
// Abschnitten liegt 1 s Stille. Ergebnis: audio/stimme-jonas.wav – danach wie eine Web-Aufnahme weiterverarbeiten:
//   node bauen.mjs audio/stimme-jonas.wav
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SR = 48000;

const readWav = (file) => {
  const b = fs.readFileSync(file);
  let o = 12;
  while (b.toString("ascii", o, o + 4) !== "data") o += 8 + b.readUInt32LE(o + 4);
  o += 8;
  const n = (b.length - o) / 2;
  const x = new Float32Array(n);
  for (let k = 0; k < n; k++) x[k] = b.readInt16LE(o + k * 2) / 32768;
  return x;
};
const SRC = {
  "60": readWav(path.join(ROOT, "audio/quellen/jonas-60s.wav")),
  "35": readWav(path.join(ROOT, "audio/quellen/jonas-35s.wav")),
};

/** Abschnitte: Ausschnitte [Quelle, von, bis] in Sekunden; zwischen Ausschnitten eines Abschnitts `gap` Sekunden Stille */
const PARTS = [
  { text: "Ihr Verein läuft immer noch über Excel? Die Liste gibt es dreimal.", cuts: [["60", 0.0, 1.86], ["60", 4.4, 5.84]], gap: 0.16 },
  { text: "Das geht einfacher: mit VereinsFlow.", cuts: [["35", 3.79, 5.62]] },
  // „Mit VereinsFlow sind“ weggeschnitten: Schnitt in der Pause vor „alle“ (tiefster Punkt −67 dB bei 11,55 s)
  { text: "Alle Mitglieder an einem Ort. Ihre Excel-Liste nehmen Sie mit.", cuts: [["60", 11.548, 13.07], ["60", 13.31, 15.13]], gap: 0.3, fadeIn: 0.004 },
  // „Wer kommt,“ 21,12–21,73 · Komma-Pause · „sagt zu.“ 22,03–22,85 (per Pegel und Zischlauten vermessen; die alte
  // Zeitzuordnung des 60-s-Reels lag hier 0,5 s daneben)
  { text: "Wer kommt, sagt zu.", cuts: [["60", 21.08, 22.9]] },
  { text: "Helfer tragen sich mit einem Fingertipp selbst ein – und Sie sehen sofort, wo noch jemand fehlt.", cuts: [["35", 5.81, 10.58]] },
  { text: "Ihre Nachricht geht an alle, an eine Abteilung oder nur an die Helfer. Und Sie sehen, wie viele schon gelesen haben.", cuts: [["60", 31.97, 35.57], ["60", 35.87, 37.77]], gap: 0.28 },
  { text: "Beiträge, Rechnungen und das Kassenbuch mit Belegen.", cuts: [["60", 39.87, 42.92]] },
  { text: "Die Daten jedes Vereins strikt getrennt.", cuts: [["35", 24.4, 26.82]] },
  { text: "VereinsFlow. Bringt Vereinsarbeit in Fluss.", cuts: [["60", 51.83, 52.62], ["60", 53.08, 54.97]], gap: 0.42 },
  { text: "Jetzt Demo anfragen.", cuts: [["60", 55.51, 56.94]] },
];

const plan = JSON.parse(fs.readFileSync(path.join(ROOT, "plan/abschnitte.json"), "utf8"));
PARTS.forEach((p, i) => {
  if (!plan[i] || plan[i].text !== p.text) throw new Error(`Abschnitt ${i}: Text in plan/abschnitte.json passt nicht zur Aufnahme:\n  Plan: ${plan[i]?.text}\n  Ton:  ${p.text}`);
});

// Lautheit je Ausschnitt (RMS der lauten 10-ms-Fenster) → auf gemeinsamen Zielwert
const rmsSpeech = (x) => {
  const H = 480;
  const vals = [];
  for (let i = 0; i + H <= x.length; i += H) {
    let q = 0;
    for (let k = 0; k < H; k++) q += x[i + k] * x[i + k];
    vals.push(Math.sqrt(q / H));
  }
  vals.sort((a, b) => a - b);
  const top = vals.slice(Math.floor(vals.length * 0.4));
  return Math.sqrt(top.reduce((s, v) => s + v * v, 0) / top.length);
};
const slice = (src, a, b) => SRC[src].slice(Math.round(a * SR), Math.round(b * SR));
const allCuts = PARTS.flatMap((p) => p.cuts.map(([s, a, b]) => rmsSpeech(slice(s, a, b))));
const target = allCuts.reduce((s, v) => s + v, 0) / allCuts.length;

const BREAK = 1.0;
const pieces = [];
const report = [];
PARTS.forEach((p, i) => {
  if (i > 0) pieces.push(new Float32Array(Math.round(BREAK * SR)));
  p.cuts.forEach(([s, a, b], k) => {
    if (k > 0) pieces.push(new Float32Array(Math.round((p.gap ?? 0.3) * SR)));
    const x = slice(s, a, b);
    const g = target / rmsSpeech(x);
    const fi = Math.round(((k === 0 && p.fadeIn) || 0.008) * SR), fo = Math.round(0.012 * SR);
    for (let j = 0; j < x.length; j++) {
      const e = Math.min(1, j / fi, (x.length - 1 - j) / fo);
      x[j] *= g * e;
    }
    pieces.push(x);
    report.push(`  ${i}.${k}  Quelle ${s}s  ${a.toFixed(2)}–${b.toFixed(2)}  Pegel ${(20 * Math.log10(g)).toFixed(1)} dB`);
  });
});
const total = pieces.reduce((s, x) => s + x.length, 0);
const out = new Float32Array(total + Math.round(0.2 * SR));
let o = 0;
for (const x of pieces) {
  out.set(x, o);
  o += x.length;
}
let peak = 0;
for (const v of out) peak = Math.max(peak, Math.abs(v));
const norm = 0.89 / peak; // Spitze −1 dBFS
const buf = Buffer.alloc(44 + out.length * 2);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + out.length * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(out.length * 2, 40);
for (let k = 0; k < out.length; k++) buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out[k] * norm)) * 32767), 44 + k * 2);
fs.writeFileSync(path.join(ROOT, "audio/stimme-jonas.wav"), buf);
console.log(report.join("\n"));
console.log(`audio/stimme-jonas.wav: ${(out.length / SR).toFixed(2)} s, ${PARTS.length} Abschnitte`);
