// Synthetisiert die Tonspur des 60-s-Neon-Reels selbst in Node (kein Netzwerk, keine Samples, keine Fremdprogramme):
// Musikbett und Soundeffekte als 48-kHz-WAV, 16 Bit. (Übernommen aus dem 60-s-Reel; Musik neu für den 60-s-Neon-Film.)
//
//   node werkzeuge/ton-synth.mjs --nur musik     nur die Musik neu bauen (die Effekte liegen schon in video/public/sfx)
//   STEMS=1 node werkzeuge/ton-synth.mjs --nur musik   zeigt zusätzlich die Pegel der einzelnen Spuren (zum Abmischen)
//
// Ablage: video/public/audio/music.wav (stereo, exakt 60,000 s) und video/public/sfx/<name>.wav (mono).
// Alles ist deterministisch (feste Zufallssaat je Datei) – gleicher Aufruf, gleiche Bytes.
//
// Musik: 120 BPM, a-Moll → C-Dur, auf die Szenen des 60-s-Neon-Films gelegt (Szenengrenzen auf Schlägen):
//   0–2,5 s    Einstieg    sofort Energie: Swoosh, Am-Fläche, sich öffnendes Arpeggio
//   2,5–8 s    Problem     angespannt, halbe Zeit, tickende Hi-Hats, Staccato-Zupfer (Am – F – G)
//   8–10 s     Frage       fast still (Gsus), Puls, Riser in den Groove
//   10–46 s    Groove      „Mit VereinsFlow …“: Kick 4/4, helle Supersaw-Flächen (C G Am F), Sechzehntel-Arpeggio;
//                          Akzente an jedem Szenenwechsel; ab 26 s Marimba-Melodie
//   46–51,5 s  Ruhe        Feierabend (Fmaj7) und Leitsatz (Klavier, Am7 → Gsus), Riser zum Logo
//   52–60 s    Schluss     großer C-Dur-Akkord zum Logo, Motiv C–E–G–C, ruhiger Puls, die letzten 0,3 s stumm
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUB = path.join(ROOT, "video/public");
const SR = 48000;
const PEAK_DB = -1.5; // Zielspitze aller Dateien (Anforderung: ≤ −1 dBFS)
const LIMIT_DRIVE_DB = 5; // Musik: so viel dB wird die Kick-Spitze vom Begrenzer heruntergedrückt

// ======================================================================================================
// Grundlagen
// ======================================================================================================
const TAU = Math.PI * 2;
const N = (s) => Math.max(0, Math.round(s * SR));
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const dbLin = (db) => Math.pow(10, db / 20);
const linDb = (x) => 20 * Math.log10(Math.max(1e-12, x));
const zeros = (n) => new Float32Array(n);
const smooth01 = (x) => {
  x = clamp(x, 0, 1);
  return x * x * (3 - 2 * x);
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hashStr = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
let rnd = mulberry32(1);
const reseed = (name) => {
  rnd = mulberry32(hashStr(name));
};
const noise = () => rnd() * 2 - 1;

const NOTE_IDX = { C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11 };
const hz = (name) => {
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Unbekannte Note: ${name}`);
  return 440 * Math.pow(2, (NOTE_IDX[m[1]] + (Number(m[2]) + 1) * 12 - 69) / 12);
};

/** src in dst addieren (Startzeit in Sekunden), mit Gain */
function addInto(dst, src, at = 0, gain = 1) {
  const o = Math.round(at * SR);
  for (let i = 0; i < src.length; i++) {
    const j = o + i;
    if (j < 0) continue;
    if (j >= dst.length) break;
    dst[j] += src[i] * gain;
  }
}

const noiseBuf = (dur) => {
  const y = zeros(N(dur));
  for (let i = 0; i < y.length; i++) y[i] = noise();
  return y;
};
function pinkBuf(dur) {
  const y = zeros(N(dur));
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < y.length; i++) {
    const w = noise();
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    y[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return y;
}
/** weicher Zufallsverlauf (linear interpoliert) mit `rate` Stützstellen pro Sekunde, Werte 0..1 */
function smoothRand(dur, rate) {
  const n = N(dur), y = zeros(n), step = SR / rate;
  let a = rnd(), b = rnd(), pos = 0;
  for (let i = 0; i < n; i++) {
    if (pos >= step) {
      pos -= step;
      a = b;
      b = rnd();
    }
    y[i] = a + (b - a) * (pos / step);
    pos++;
  }
  return y;
}

// ---- Filter -----------------------------------------------------------------------------------------
function coefs(type, fc, q = Math.SQRT1_2, gainDb = 0) {
  fc = clamp(fc, 8, SR * 0.49);
  const w = (TAU * fc) / SR, c = Math.cos(w), s = Math.sin(w), al = s / (2 * q), A = Math.pow(10, gainDb / 40);
  let b0, b1, b2, a0, a1, a2;
  switch (type) {
    case "lp": b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; break;
    case "hp": b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; break;
    case "bp": b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; break;
    case "notch": b0 = 1; b1 = -2 * c; b2 = 1; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; break;
    case "peak": b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; break;
    case "ls": {
      const sq = 2 * Math.sqrt(A) * al;
      b0 = A * (A + 1 - (A - 1) * c + sq); b1 = 2 * A * (A - 1 - (A + 1) * c); b2 = A * (A + 1 - (A - 1) * c - sq);
      a0 = A + 1 + (A - 1) * c + sq; a1 = -2 * (A - 1 + (A + 1) * c); a2 = A + 1 + (A - 1) * c - sq;
      break;
    }
    case "hs": {
      const sq = 2 * Math.sqrt(A) * al;
      b0 = A * (A + 1 + (A - 1) * c + sq); b1 = -2 * A * (A - 1 + (A + 1) * c); b2 = A * (A + 1 + (A - 1) * c - sq);
      a0 = A + 1 - (A - 1) * c + sq; a1 = 2 * (A - 1 - (A + 1) * c); a2 = A + 1 - (A - 1) * c - sq;
      break;
    }
    default: throw new Error(`Filtertyp? ${type}`);
  }
  return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
}
function biquad(x, type, fc, q, gainDb) {
  const [b0, b1, b2, a1, a2] = coefs(type, fc, q, gainDb);
  const y = zeros(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i];
    const yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = xi; y2 = y1; y1 = yi;
    y[i] = yi;
  }
  return y;
}
/** Filterkette: [["lp", 1000, 0.7], ["hp", 100]] */
const filt = (x, stages) => stages.reduce((a, s) => biquad(a, s[0], s[1], s[2], s[3]), x);
/** Bandbegrenztes Rauschen mit grob konstanter Energie (Pegel unabhängig von Mitte und Güte) */
const band = (x, fc, q) => {
  const y = biquad(x, "bp", fc, q);
  const g = 0.5 * Math.sqrt((SR / 2) * q / fc);
  for (let i = 0; i < y.length; i++) y[i] *= g;
  return y;
};

/** Zustandsvariablenfilter mit Zeitverlauf der Grenzfrequenz: fcAt(t, i) → Hz */
function svfSweep(x, fcAt, q = 0.7, mode = "lp") {
  const n = x.length, y = zeros(n), k = 1 / q;
  let ic1 = 0, ic2 = 0;
  for (let i = 0; i < n; i++) {
    const g = Math.tan((Math.PI * clamp(fcAt(i / SR, i), 20, SR * 0.45)) / SR);
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x[i] - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    y[i] = mode === "lp" ? v2 : mode === "bp" ? v1 * k : x[i] - k * v1 - v2;
  }
  return y;
}

// ---- Oszillatoren -----------------------------------------------------------------------------------
function polyBlep(t, dt) {
  if (t < dt) {
    t /= dt;
    return t + t - t * t - 1;
  }
  if (t > 1 - dt) {
    t = (t - 1) / dt;
    return t * t + t + t + 1;
  }
  return 0;
}
/** bandbegrenzter Sägezahn, f konstant oder Funktion der Zeit */
function sawOsc(f, n, ph0 = 0) {
  const y = zeros(n);
  let p = ph0;
  for (let i = 0; i < n; i++) {
    const fr = typeof f === "function" ? f(i / SR) : f;
    const dt = fr / SR;
    y[i] = 2 * p - 1 - polyBlep(p, dt);
    p += dt;
    if (p >= 1) p -= 1;
  }
  return y;
}
/** gedämpfte Sinusschwingung f·e^(−t/τ), auf Wunsch mit Tonhöhenverlauf (f → glideTo) */
function dsine(f, tau, dur, o = {}) {
  const { amp = 1, att = 0.0006, glideTo = null, glideTau = 0.02, phase = 0 } = o;
  const y = zeros(N(dur));
  let ph = phase;
  for (let i = 0; i < y.length; i++) {
    const t = i / SR;
    const fr = glideTo == null ? f : glideTo + (f - glideTo) * Math.exp(-t / glideTau);
    ph += (TAU * fr) / SR;
    y[i] = Math.sin(ph) * amp * Math.exp(-t / tau) * Math.min(1, t / att);
  }
  return endFade(y, 0.004);
}
/** Gedämpfter Resonator (Rekursion): addiert amp·e^(−t/τ)·sin(2πft) ab Zeit `at` in dst */
function addResonator(dst, f, amp, tau, at = 0, phase = 0) {
  if (f >= SR * 0.47) return;
  const i0 = Math.round(at * SR);
  const len = Math.min(dst.length - i0, Math.ceil(tau * 9 * SR));
  if (len < 2) return;
  const w = (TAU * f) / SR, r = Math.exp(-1 / (tau * SR));
  const c1 = 2 * r * Math.cos(w), c2 = -r * r;
  let y2 = amp * Math.sin(phase), y1 = amp * r * Math.sin(w + phase);
  dst[i0] += y2;
  dst[i0 + 1] += y1;
  for (let i = 2; i < len; i++) {
    const y0 = c1 * y1 + c2 * y2;
    dst[i0 + i] += y0;
    y2 = y1;
    y1 = y0;
  }
}
/** Rauschstoß mit Hüllkurve (kurzer linearer Anstieg, dann exponentieller Abfall), optional gefiltert */
function burst(dur, tau, stages = null, att = 0.0003) {
  const x = noiseBuf(dur);
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i] *= Math.min(1, t / att) * Math.exp(-t / tau);
  }
  return endFade(stages ? filt(x, stages) : x, 0.004);
}
const scaleBuf = (x, g) => {
  for (let i = 0; i < x.length; i++) x[i] *= g;
  return x;
};
/** Pufferende weich auf 0 (verhindert Knackser, wenn ein Baustein mitten im Ausklang abgeschnitten wird) */
function endFade(x, sec) {
  const m = Math.min(x.length, N(sec));
  for (let i = 0; i < m; i++) x[x.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / m);
  return x;
}
const peakOf = (x) => {
  let p = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > p) p = a;
  }
  return p;
};

// ---- Hall (Freeverb-Struktur) -----------------------------------------------------------------------
/** feedback: Raumlänge (0,80 ≈ 0,8 s · 0,90 ≈ 2 s · 0,93 ≈ 3 s), damp: Höhendämpfung 0..1 */
function reverbStereo(inL, inR, { feedback = 0.9, damp = 0.35, wet = 1, predelay = 0.015 } = {}) {
  const n = inL.length;
  const sc = SR / 44100;
  const combT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const apT = [556, 441, 341, 225];
  const spread = 23;
  const outL = zeros(n), outR = zeros(n);
  const pd = N(predelay);
  [outL, outR].forEach((out, ch) => {
    const combs = combT.map((t) => ({ buf: new Float32Array(Math.round((t + ch * spread) * sc)), idx: 0, store: 0 }));
    const aps = apT.map((t) => ({ buf: new Float32Array(Math.round((t + ch * spread) * sc)), idx: 0 }));
    for (let i = 0; i < n; i++) {
      const j = i - pd;
      const input = j >= 0 ? (inL[j] + inR[j]) * 0.015 : 0;
      let s = 0;
      for (const c of combs) {
        const y = c.buf[c.idx];
        c.store = y * (1 - damp) + c.store * damp;
        c.buf[c.idx] = input + c.store * feedback;
        if (++c.idx >= c.buf.length) c.idx = 0;
        s += y;
      }
      for (const a of aps) {
        const bo = a.buf[a.idx];
        const y = -s + bo;
        a.buf[a.idx] = s + bo * 0.5;
        if (++a.idx >= a.buf.length) a.idx = 0;
        s = y;
      }
      out[i] = s * wet;
    }
  });
  return { L: outL, R: outR };
}
/** Hall für Einzeleffekte: mono rein, mono raus, Original bleibt erhalten */
function withReverb(x, opts = {}) {
  const { wet = 3, ...rest } = opts;
  const r = reverbStereo(x, x, { wet, ...rest });
  const y = zeros(x.length);
  for (let i = 0; i < y.length; i++) y[i] = x[i] + (r.L[i] + r.R[i]) * 0.5;
  return y;
}

// ======================================================================================================
// Instrumente (mono, ohne Pegelanspruch – die Endpegel setzt jeweils der Mix bzw. die Normalisierung)
// ======================================================================================================

/** Filz-Klavier: additiv, leicht unharmonisch, gedämpfter Hammer. hold = Tastenhaltezeit in s (dann Dämpfer) */
function pianoNote(f, { dur = 2, vel = 0.8, bright = 0.5, sustain = 1, hold = null } = {}) {
  const n = N(dur), y = zeros(n);
  const tauBase = clamp(3.4 - Math.log2(f / 65.4) * 0.62, 0.45, 3.6) * sustain;
  const nPart = Math.min(14, Math.floor((SR * 0.45) / f));
  for (let k = 1; k <= nPart; k++) {
    const fk = f * k * Math.sqrt(1 + 0.00018 * k * k);
    const strike = 0.35 + 0.65 * Math.abs(Math.sin((Math.PI * k) / 7.5));
    const a = vel * strike * Math.pow(k, -(0.85 + (1 - bright) * 1.5 + (1 - vel) * 0.5));
    const tau = tauBase / (1 + 0.62 * (k - 1));
    addResonator(y, fk * 1.0004, a * 0.55, tau);
    addResonator(y, fk * 0.9996, a * 0.55, tau * 1.1);
  }
  const att = 0.0045;
  for (let i = 0; i < Math.min(n, N(0.03)); i++) y[i] *= 1 - Math.exp(-(i / SR) / att);
  // Filzhammer: kurzer dumpfer Schlag
  addInto(y, burst(0.03, 0.007, [["lp", 700, 0.7]], 0.001), 0, 0.28 * vel);
  if (hold != null) {
    const h = N(hold);
    for (let i = h; i < n; i++) y[i] *= Math.exp(-(i - h) / SR / 0.09);
  }
  endFade(y, 0.02);
  const p = peakOf(y);
  return scaleBuf(y, (0.5 * vel) / Math.max(p, 1e-9));
}
/** Marimba: Stab mit Obertönen 1 : 4 : 9,9 und Schlägelgeräusch */
function marimbaNote(f, { vel = 0.8, dur = 1 } = {}) {
  const y = zeros(N(dur));
  const t1 = clamp(0.5 - Math.log2(f / 130) * 0.1, 0.15, 0.6);
  addResonator(y, f, 1, t1);
  addResonator(y, f * 4.0, 0.42, t1 * 0.22);
  addResonator(y, f * 9.9, 0.1, t1 * 0.06);
  addInto(y, burst(0.012, 0.0015, [["bp", 2400, 1]], 0.0002), 0, 0.12);
  for (let i = 0; i < N(0.0008); i++) y[i] *= i / N(0.0008);
  endFade(y, 0.02);
  return scaleBuf(y, (0.5 * vel) / Math.max(peakOf(y), 1e-9));
}
/** Glockenton: Obertöne 1 : 2,76 : 5,4 : 8,93 */
function bellNote(f, { vel = 0.8, dur = 1.2, tau = 0.8 } = {}) {
  const y = zeros(N(dur));
  addResonator(y, f, 1, tau);
  addResonator(y, f * 2.76, 0.32, tau * 0.4);
  addResonator(y, f * 5.4, 0.14, tau * 0.2);
  addResonator(y, f * 8.93, 0.06, tau * 0.1);
  for (let i = 0; i < N(0.0008); i++) y[i] *= i / N(0.0008);
  endFade(y, 0.02);
  return scaleBuf(y, (0.5 * vel) / Math.max(peakOf(y), 1e-9));
}
/** Pad: verstimmte Sägezähne je Stimme, stereo; Tiefpass fährt von cutA nach cutB; weicher Ein- und Ausklang */
function padStereo(freqs, dur, { att = 0.3, rel = 0.5, cutA = 1500, cutB = 1500, cutT = 1, det = 0.0035, gain = 1 } = {}) {
  const n = N(dur + rel), L = zeros(n), R = zeros(n);
  freqs.forEach((f, vi) => {
    const o1 = sawOsc(f * (1 - det), n, (vi * 0.37) % 1), o2 = sawOsc(f * (1 + det * 0.4), n, (vi * 0.61 + 0.2) % 1);
    const o3 = sawOsc(f * (1 + det), n, (vi * 0.29 + 0.5) % 1), o4 = sawOsc(f * (1 - det * 0.4), n, (vi * 0.83 + 0.1) % 1);
    for (let i = 0; i < n; i++) {
      L[i] += o1[i] + o2[i] * 0.7;
      R[i] += o3[i] + o4[i] * 0.7;
    }
  });
  const fc = (t) => cutA + (cutB - cutA) * smooth01(t / cutT);
  const fl = svfSweep(L, fc, 0.65), fr = svfSweep(R, fc, 0.65);
  const g = gain / Math.max(1, freqs.length) ** 0.7;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const e = smooth01(t / att) * (t < dur ? 1 : smooth01(1 - (t - dur) / rel));
    fl[i] *= e * g;
    fr[i] *= e * g;
  }
  return { L: fl, R: fr };
}
const padMono = (freqs, dur, o = {}) => {
  const s = padStereo(freqs, dur, o);
  const y = zeros(s.L.length);
  for (let i = 0; i < y.length; i++) y[i] = (s.L[i] + s.R[i]) * 0.5;
  return y;
};
/** Zupf-Synth: zwei verstimmte Sägezähne, Filter fällt mit der Hüllkurve */
function pluckSynth(f, { vel = 0.8, dur = 0.5 } = {}) {
  const n = N(dur);
  const a = sawOsc(f * 1.0035, n), b = sawOsc(f * 0.9965, n);
  const x = zeros(n);
  for (let i = 0; i < n; i++) x[i] = (a[i] + b[i]) * 0.5;
  const y = svfSweep(x, (t) => 500 + (900 + 3800 * vel) * Math.exp(-t / 0.075), 1.0);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    y[i] *= Math.min(1, t / 0.002) * Math.exp(-t / 0.17);
  }
  const body = dsine(f, 0.12, dur, { amp: 0.35 });
  for (let i = 0; i < n; i++) y[i] += body[i];
  endFade(y, 0.012);
  return scaleBuf(y, vel * 0.5 / Math.max(peakOf(y), 1e-9));
}
/** Bass: Sinus-Sub plus tiefpassgefilterter Sägezahn (damit der Bass auch aus Handylautsprechern zu hören ist) */
function bassNote(f, { dur = 0.25, vel = 1 } = {}) {
  const rel = 0.05, n = N(dur + rel);
  const saw = svfSweep(sawOsc(f, n), (t) => 220 + 500 * Math.exp(-t / 0.08), 0.9);
  const y = zeros(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const e = Math.min(1, t / 0.004) * (t < dur ? Math.exp(-t / 0.35) : Math.exp(-dur / 0.35) * Math.max(0, 1 - (t - dur) / rel));
    y[i] = (Math.sin(TAU * f * t) * 0.9 + saw[i] * 0.42) * e;
  }
  return scaleBuf(y, vel);
}
function kickDrum(vel = 1) {
  const y = zeros(N(0.42));
  let ph = 0;
  for (let i = 0; i < y.length; i++) {
    const t = i / SR;
    ph += (TAU * (48 + 125 * Math.exp(-t / 0.018))) / SR;
    y[i] = Math.sin(ph) * Math.exp(-t / 0.16) * Math.min(1, t / 0.0015);
  }
  addInto(y, burst(0.012, 0.0015, [["lp", 5000, 0.7]]), 0, 0.3);
  for (let i = 0; i < y.length; i++) y[i] = Math.tanh(y[i] * 1.5) * 0.85;
  for (let i = 0; i < N(0.03); i++) y[y.length - 1 - i] *= i / N(0.03);
  return scaleBuf(y, vel);
}
function hatDrum(open, vel = 1) {
  const y = burst(open ? 0.3 : 0.09, open ? 0.065 : 0.011, [["hp", 7200, 0.7], ["hp", 6000, 0.7]], 0.0004);
  return scaleBuf(endFade(y, 0.012), vel * (open ? 0.7 : 1));
}
function clapDrum(vel = 1) {
  const y = zeros(N(0.4));
  for (const t of [0, 0.011, 0.023]) addInto(y, burst(0.04, 0.0045, [["bp", 1250, 0.8], ["hp", 500, 0.7]], 0.0003), t, 0.6);
  addInto(y, burst(0.35, 0.085, [["bp", 1150, 0.9], ["hp", 450, 0.7]], 0.0005), 0.034, 0.5);
  return scaleBuf(endFade(y, 0.02), vel * 3.2);
}

// ======================================================================================================
// WAV, Normalisierung, Ränder
// ======================================================================================================
function wavBytes(chans, { dither = false } = {}) {
  const nCh = chans.length, n = chans[0].length;
  const buf = Buffer.alloc(44 + n * nCh * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * nCh * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(nCh, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * nCh * 2, 28);
  buf.writeUInt16LE(nCh * 2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * nCh * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nCh; c++) {
      let v = chans[c][i] * 32767;
      if (dither) v += rnd() - rnd();
      buf.writeInt16LE(clamp(Math.round(v), -32767, 32767), o);
      o += 2;
    }
  }
  return buf;
}
function normalize(chans, peakDb = PEAK_DB) {
  let p = 0;
  for (const c of chans) p = Math.max(p, peakOf(c));
  const g = dbLin(peakDb) / Math.max(p, 1e-9);
  for (const c of chans) scaleBuf(c, g);
}
function removeDc(x, hpHz = 18) {
  const y = biquad(x, "hp", hpHz, 0.7071);
  let m = 0;
  for (let i = 0; i < y.length; i++) m += y[i];
  m /= y.length || 1;
  for (let i = 0; i < y.length; i++) y[i] -= m;
  return y;
}
/** Ein- und Ausblendung (Kosinus) – damit Anfang und Ende exakt bei 0 liegen */
function fadeEdges(x, inS, outS) {
  const a = Math.max(2, N(inS)), b = Math.max(2, N(outS)), n = x.length;
  for (let i = 0; i < Math.min(a, n); i++) x[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / a);
  for (let i = 0; i < Math.min(b, n); i++) x[n - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / b);
  x[0] = 0;
  x[n - 1] = 0;
  return x;
}
/** Effekt abschließen: exakt auf die Plandauer, Gleichanteil weg, Ränder weich, Spitze auf −1,5 dBFS */
function finishSfx(x, dur, { fadeIn = 0.0008, fadeOut = 0.012, peakDb = PEAK_DB } = {}) {
  const n = N(dur);
  let y = zeros(n);
  y.set(x.subarray(0, Math.min(n, x.length)));
  y = removeDc(y);
  fadeEdges(y, fadeIn, fadeOut);
  normalize([y], peakDb);
  return y;
}

// ======================================================================================================
// Soundeffekte
// ======================================================================================================
/** Tastenanschlag (Laptop/mechanisch): Klick + Bodenanschlag + Kunststoffresonanz */
function keyClack(soft = 0, bright = 1, vel = 1) {
  const y = zeros(N(0.14));
  addInto(y, burst(0.14, 0.0035, [["bp", 2800 * bright, 0.9]], 0.0002).map((v) => v * 6.4), 0, (1 - soft * 0.5) * 0.9);
  addInto(y, dsine(150 + noise() * 14, 0.016, 0.14, { att: 0.0008 }), 0, 0.5 * (1 - soft * 0.45));
  addInto(y, burst(0.14, 0.014, [["bp", 1250 + noise() * 90, 6]], 0.0004).map((v) => v * 13), 0, 0.5 * (1 - soft * 0.3));
  return scaleBuf(filt(y, [["lp", 10000 - soft * 5000, 0.7]]), vel);
}
function tickSoft(vel = 1, f = 3200) {
  const y = zeros(N(0.05));
  addInto(y, burst(0.05, 0.0012, [["hp", 3800, 0.7]], 0.0001), 0, 0.7);
  addInto(y, dsine(f, 0.003, 0.05, { att: 0.0002 }), 0, 0.5);
  return scaleBuf(y, vel);
}
/** Rauschfahrt: Bandpass, dessen Mitte f0 → f1 (exponentiell) wandert; Hüllkurve env(t) */
function sweepNoise(dur, f0, f1, env, { q = 0.9, shapeT = null } = {}) {
  const x = noiseBuf(dur);
  const T = shapeT ?? dur;
  const y = svfSweep(x, (t) => f0 * Math.pow(f1 / f0, clamp(t / T, 0, 1)), q, "bp");
  for (let i = 0; i < y.length; i++) y[i] *= env(i / SR);
  return y;
}

const RECIPES = {
  // ---- 1 · Hook ----------------------------------------------------------------------------------
  "keys-riser": (d) => {
    // Tastaturklacken, immer dichter bis zum Rauschteppich; endet hart auf dem Punkt; darunter steigt ein Ton
    const y = zeros(N(d));
    let t = 0.04;
    while (t < d - 0.012) {
      addInto(y, keyClack(0.15, 0.85 + 0.4 * rnd(), 0.55 + 0.45 * rnd()), t, 0.3 + 0.7 * (t / d));
      t += (0.3 * Math.exp(-t / 0.5) + 0.02) * (0.85 + 0.3 * rnd());
    }
    const tone = zeros(y.length);
    let ph = 0;
    for (let i = 0; i < tone.length; i++) {
      const tt = i / SR;
      ph += (TAU * 240 * Math.pow(1500 / 240, tt / d)) / SR;
      tone[i] = (Math.sin(ph) + 0.35 * Math.sin(2 * ph)) * 0.1 * Math.pow(tt / d, 2.2);
    }
    addInto(y, filt(tone, [["lp", 3500, 0.7]]));
    return finishSfx(y, d, { fadeOut: 0.004 });
  },
  "key-clack": (d) => {
    const y = zeros(N(d));
    addInto(y, keyClack(0, 1, 1), 0.01);
    return finishSfx(y, d);
  },
  "dot-thump": (d) => {
    const y = zeros(N(d));
    addInto(y, burst(0.05, 0.004, [["bp", 1800, 1.4]]).map((v) => v * 4), 0, 0.7);
    addInto(y, dsine(1050, 0.012, 0.06, { att: 0.0004 }), 0, 0.5);
    addInto(y, dsine(430, 0.03, 0.15, { att: 0.0006, glideTo: 380, glideTau: 0.03 }), 0, 0.8);
    addInto(y, dsine(100, 0.22, 0.7, { att: 0.004, glideTo: 50, glideTau: 0.05 }), 0, 1.1);
    return finishSfx(y, d);
  },
  "light-switch": (d) => {
    const y = zeros(N(d));
    addInto(y, burst(0.03, 0.002, [["bp", 4200, 1]]).map((v) => v * 3), 0, 0.8);
    addInto(y, dsine(2400, 0.004, 0.03, { att: 0.0002 }), 0, 0.5);
    addInto(y, dsine(380, 0.012, 0.06), 0, 0.6);
    addInto(y, burst(0.03, 0.002, [["bp", 3000, 1]]).map((v) => v * 3), 0.018, 0.6);
    addInto(y, dsine(900, 0.02, 0.08), 0.003, 0.25);
    return finishSfx(y, d);
  },
  // ---- 2 · Problem -------------------------------------------------------------------------------
  "clock-tick": (d) => {
    const y = zeros(N(d));
    [0.12, 0.62, 1.12].forEach((t, i) => {
      const f = i % 2 === 0 ? 1900 : 1500;
      addInto(y, burst(0.04, 0.003, [["bp", 3800, 1.2]]).map((v) => v * 3), t, 0.55);
      addInto(y, dsine(f, 0.01, 0.05, { att: 0.0003 }), t, 0.5);
      addInto(y, dsine(520, 0.02, 0.1), t, 0.4);
    });
    addInto(y, scaleBuf(filt(pinkBuf(d), [["lp", 600, 0.7]]), 0.01));
    return finishSfx(y, d, { fadeOut: 0.04 });
  },
  "window-clack": (d) => {
    const y = zeros(N(d));
    addInto(y, burst(0.05, 0.005, [["bp", 3200, 1]]).map((v) => v * 3), 0, 0.7);
    addInto(y, dsine(720, 0.018, 0.1), 0, 0.7);
    addInto(y, dsine(1650, 0.01, 0.05), 0, 0.5);
    addInto(y, dsine(2400, 0.008, 0.04), 0.002, 0.25);
    return finishSfx(y, d);
  },
  "paper-flutter": (d) => {
    const n = N(d);
    const y = svfSweep(noiseBuf(d), (t) => 3800 + 1800 * Math.sin(TAU * 3 * t), 0.9, "bp");
    const am1 = rnd() * TAU, am2 = rnd() * TAU;
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const env = t < 0.3 ? smooth01(t / 0.3) : Math.exp(-(t - 0.3) / 0.25);
      const flutter = clamp(0.5 + 0.35 * Math.sin(TAU * 29 * t + am1) + 0.25 * Math.sin(TAU * 43 * t + am2), 0.1, 1);
      y[i] *= env * flutter * 3;
    }
    const low = svfSweep(noiseBuf(d), () => 700, 0.7, "lp");
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      low[i] *= (t < 0.28 ? smooth01(t / 0.28) : Math.exp(-(t - 0.28) / 0.2)) * 0.5;
    }
    addInto(y, low);
    for (let k = 0; k < 24; k++) addInto(y, burst(0.01, 0.002, [["hp", 3000, 0.7]]), 0.05 + rnd() * 0.6, 0.3 * rnd());
    return finishSfx(y, d, { fadeOut: 0.05 });
  },
  "notify-tick": (d) => {
    const y = zeros(N(d));
    addInto(y, dsine(2093, 0.03, 0.2, { att: 0.0008 }), 0, 0.8);
    addInto(y, dsine(2093 * 2.76, 0.012, 0.08, { att: 0.0005 }), 0, 0.2);
    addInto(y, dsine(3136, 0.02, 0.1, { att: 0.0008 }), 0, 0.2);
    return finishSfx(y, d);
  },
  "buzz": (d) => {
    const y = zeros(N(d));
    for (const t0 of [0.02, 0.14]) {
      const len = N(0.095), p = zeros(len);
      const saw = sawOsc(150, len);
      const rat = band(noiseBuf(0.095), 1100, 2);
      for (let i = 0; i < len; i++) {
        const t = i / SR;
        const e = smooth01(t / 0.006) * smooth01((0.095 - t) / 0.014);
        p[i] = (saw[i] * 0.8 + Math.sin(TAU * 75 * t) * 0.4 + rat[i] * 0.9) * e;
      }
      addInto(y, p, t0);
    }
    return finishSfx(filt(y, [["lp", 1300, 0.7]]), d, { fadeOut: 0.02 });
  },
  "stop-hit": (d) => {
    const y = zeros(N(0.3));
    addInto(y, dsine(120, 0.07, 0.3, { att: 0.001, glideTo: 48, glideTau: 0.035 }), 0, 1);
    addInto(y, burst(0.1, 0.02, [["lp", 900, 0.7]]).map((v) => v * 3), 0, 0.5);
    const cut = N(0.22);
    for (let i = cut; i < y.length; i++) y[i] = 0;
    for (let i = 0; i < N(0.004); i++) y[cut - 1 - i] *= i / N(0.004);
    return finishSfx(y, d, { fadeOut: 0.004 });
  },
  // ---- 3 · Falten --------------------------------------------------------------------------------
  "paper-fold": (d) => {
    const x = sweepNoise(d, 1500, 7000, (t) => Math.min(1, t / 0.012) * Math.exp(-t / 0.06), { q: 0.8, shapeT: 0.12 });
    scaleBuf(x, 3);
    addInto(x, burst(0.04, 0.003, [["hp", 2500, 0.7]]), 0.11, 0.7);
    addInto(x, scaleBuf(burst(0.3, 0.08, [["bp", 5000, 0.8]]), 1.2), 0.1, 0.15);
    return finishSfx(x, d, { fadeOut: 0.03 });
  },
  "reverse-swell": (d) => {
    // rückwärts abgespieltes Becken; Mitte der Rauschbänder wandert nach oben („Sog in einen Punkt“); endet hart
    const n = N(d), cym = zeros(n);
    const freqs = [205.3 * 2, 205.3 * 3, 205.3 * 4.16, 205.3 * 5.43, 205.3 * 6.79, 205.3 * 8.21];
    for (const f of freqs) for (let i = 0; i < n; i++) cym[i] += Math.sign(Math.sin(TAU * f * (i / SR))) * 0.12;
    const nz = filt(noiseBuf(d), [["hp", 4000, 0.7]]);
    for (let i = 0; i < n; i++) cym[i] += nz[i] * 0.6;
    const hpc = filt(cym, [["hp", 5000, 0.7], ["hp", 3500, 0.7]]);
    for (let i = 0; i < n; i++) hpc[i] *= Math.exp(-(i / SR) / 0.25);
    hpc.reverse();
    const sw = svfSweep(hpc, (t) => 900 * Math.pow(9000 / 900, t / d), 0.8, "bp");
    const y = zeros(n);
    for (let i = 0; i < n; i++) y[i] = hpc[i] * 0.55 + sw[i] * 1.6;
    return finishSfx(y, d, { fadeIn: 0.01, fadeOut: 0.004 });
  },
  "heartbeat": (d) => {
    const y = zeros(N(d));
    addInto(y, dsine(78, 0.05, 0.3, { att: 0.006, glideTo: 42, glideTau: 0.03 }), 0.04, 1);
    addInto(y, burst(0.08, 0.02, [["lp", 150, 0.7]]).map((v) => v * 6), 0.04, 0.5);
    addInto(y, dsine(88, 0.045, 0.3, { att: 0.006, glideTo: 46, glideTau: 0.03 }), 0.3, 0.65);
    const lo = filt(y, [["lp", 160, 0.7], ["lp", 200, 0.7]]);
    addInto(lo, scaleBuf(filt(pinkBuf(d), [["lp", 300, 0.7]]), 0.004));
    return finishSfx(lo, d, { fadeOut: 0.06 });
  },
  "tap-soft": (d) => {
    const y = zeros(N(d));
    addInto(y, dsine(330, 0.03, 0.2, { att: 0.001 }), 0, 1);
    addInto(y, burst(0.04, 0.006, [["lp", 1500, 0.7]]).map((v) => v * 3), 0, 0.6);
    addInto(y, dsine(900, 0.012, 0.06), 0, 0.3);
    return finishSfx(filt(y, [["lp", 3000, 0.7]]), d);
  },
  // ---- 4 · Mitglieder ----------------------------------------------------------------------------
  "bloom": (d) => {
    const n = N(d), y = zeros(n);
    addInto(y, dsine(95, 0.18, 0.9, { att: 0.003, glideTo: 50, glideTau: 0.05 }), 0, 0.9);
    const sw = svfSweep(noiseBuf(d), (t) => 700 * Math.pow(8000 / 700, smooth01(t / 0.5)), 0.8, "bp");
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      sw[i] *= (t < 0.45 ? smooth01(t / 0.45) : Math.exp(-(t - 0.45) / 0.45)) * 1.2;
    }
    addInto(y, sw);
    for (const [f, a] of [[hz("C5"), 1], [hz("E5"), 0.8], [hz("G5"), 0.8], [hz("C6"), 0.6], [hz("E6"), 0.35]]) {
      const ph = rnd() * TAU;
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const e = (t < 0.35 ? smooth01(t / 0.35) : Math.exp(-(t - 0.35) / 0.5)) * (0.8 + 0.2 * Math.sin(TAU * 5 * t + ph));
        y[i] += Math.sin(TAU * f * t + ph) * 0.1 * a * e;
      }
    }
    return finishSfx(withReverb(y, { feedback: 0.88, wet: 3 }), d, { fadeOut: 0.12 });
  },
  "tap": (d) => {
    const y = zeros(N(d));
    addInto(y, burst(0.03, 0.0025, [["hp", 1800, 0.7]]).map((v) => v * 1.5), 0, 0.8);
    addInto(y, dsine(1700, 0.008, 0.05, { att: 0.0003 }), 0, 0.6);
    addInto(y, dsine(620, 0.014, 0.08), 0, 0.5);
    return finishSfx(y, d);
  },
  "count-rattle": (d) => {
    const y = zeros(N(d));
    let t = 0.02;
    while (t < d - 0.05) {
      const prog = t / d;
      addInto(y, burst(0.02, 0.0015, [["bp", 3300, 1.5]]).map((v) => v * 4), t, (0.5 + 0.5 * rnd()) * (1 - 0.5 * prog));
      addInto(y, dsine(1300 + rnd() * 200, 0.004, 0.02, { att: 0.0002 }), t, 0.3 * (1 - 0.5 * prog));
      t += 0.012 + 0.05 * Math.pow(prog, 2.2) + rnd() * 0.004;
    }
    return finishSfx(y, d, { fadeOut: 0.05 });
  },
  "plop": (d) => {
    const y = zeros(N(d));
    addInto(y, dsine(280, 0.05, 0.25, { att: 0.002, glideTo: 900, glideTau: 0.03 }), 0, 1);
    addInto(y, dsine(420, 0.035, 0.15, { att: 0.002, glideTo: 1100, glideTau: 0.025 }), 0.06, 0.35);
    addInto(y, burst(0.04, 0.012, [["bp", 1800, 0.9]]).map((v) => v * 3), 0, 0.4);
    return finishSfx(y, d);
  },
  "tick": (d) => {
    const y = zeros(N(d));
    addInto(y, tickSoft(1, 3200), 0.002);
    return finishSfx(y, d);
  },
  "bonk": (d) => {
    const y = zeros(N(d));
    addInto(y, dsine(185, 0.1, 0.4, { att: 0.002, glideTo: 150, glideTau: 0.05 }), 0, 1);
    addInto(y, dsine(185 * 2.35, 0.03, 0.1, { att: 0.001 }), 0, 0.25);
    addInto(y, burst(0.04, 0.006, [["lp", 1200, 0.7]]).map((v) => v * 3), 0, 0.4);
    return finishSfx(filt(y, [["lp", 2200, 0.7]]), d, { fadeOut: 0.03 });
  },
  "chime-two": (d) => {
    const y = zeros(N(d));
    addInto(y, bellNote(hz("G5"), { vel: 0.8, dur: d, tau: 0.3 }), 0, 1);
    addInto(y, bellNote(hz("C6"), { vel: 0.9, dur: d - 0.14, tau: 0.38 }), 0.14, 1);
    return finishSfx(withReverb(y, { feedback: 0.84, wet: 2.5 }), d, { fadeOut: 0.08 });
  },
  "swish": (d) => {
    const x = sweepNoise(d, 1600, 4000, (t) => (t < 0.2 ? smooth01(t / 0.2) : Math.exp(-(t - 0.2) / 0.12)), { q: 0.9 });
    return finishSfx(filt(x, [["hp", 800, 0.7]]), d, { fadeIn: 0.004, fadeOut: 0.05 });
  },
  // ---- 5 · Termine -------------------------------------------------------------------------------
  "whoosh-whip": (d) => {
    const x = sweepNoise(d, 500, 8000, (t) => (t < 0.07 ? Math.min(1, t / 0.07) : Math.exp(-(t - 0.07) / 0.09)), { q: 0.9, shapeT: 0.22 });
    const lo = svfSweep(noiseBuf(d), () => 300, 0.7, "lp");
    for (let i = 0; i < lo.length; i++) x[i] = x[i] * 1.5 + lo[i] * 0.4 * Math.exp(-(i / SR) / 0.12) * Math.min(1, (i / SR) / 0.05);
    return finishSfx(x, d, { fadeIn: 0.003, fadeOut: 0.05 });
  },
  "piano-yes": (d) => finishSfx(withReverb(pianoNote(hz("G5"), { dur: d, vel: 0.8, bright: 0.65, sustain: 0.5 }), { feedback: 0.82, wet: 1.5 }), d, { fadeOut: 0.12 }),
  "piano-no": (d) => finishSfx(filt(pianoNote(hz("C3"), { dur: d, vel: 0.5, bright: 0.15, sustain: 0.3, hold: 0.25 }), [["lp", 900, 0.7]]), d, { fadeOut: 0.1 }),
  "bubble-pop": (d) => {
    const y = zeros(N(d));
    addInto(y, burst(0.04, 0.004, [["bp", 3500, 0.8]]).map((v) => v * 3), 0, 0.8);
    addInto(y, dsine(1600, 0.008, 0.05, { att: 0.0003, glideTo: 500, glideTau: 0.01 }), 0, 0.6);
    for (const f of [5200, 7400, 9100]) addInto(y, dsine(f, 0.012, 0.06, { att: 0.0004 }), 0.002 + rnd() * 0.008, 0.12);
    return finishSfx(y, d);
  },
  // ---- 6 · Helfer --------------------------------------------------------------------------------
  "marimba-c": (d) => finishSfx(withReverb(marimbaNote(hz("C4"), { vel: 0.9, dur: d }), { feedback: 0.8, wet: 1.2 }), d, { fadeOut: 0.1 }),
  "marimba-e": (d) => finishSfx(withReverb(marimbaNote(hz("E4"), { vel: 0.9, dur: d }), { feedback: 0.8, wet: 1.2 }), d, { fadeOut: 0.1 }),
  "marimba-g": (d) => finishSfx(withReverb(marimbaNote(hz("G4"), { vel: 0.9, dur: d }), { feedback: 0.8, wet: 1.2 }), d, { fadeOut: 0.1 }),
  "chord-shimmer": (d) => {
    const y = zeros(N(d));
    ["C4", "E4", "G4", "C5"].forEach((nn, i) => addInto(y, pianoNote(hz(nn), { dur: d, vel: 0.55, bright: 0.45, sustain: 0.9 }), i * 0.008, 0.8));
    ["C5", "E5", "G5"].forEach((nn, i) => addInto(y, marimbaNote(hz(nn), { vel: 0.5, dur: d }), 0.02 + i * 0.006, 0.55));
    const n = N(d);
    for (const [f, a] of [[hz("C6"), 1], [hz("G6"), 0.7], [hz("E7"), 0.35]]) {
      const ph = rnd() * TAU;
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        y[i] += Math.sin(TAU * f * t) * 0.05 * a * smooth01(t / 0.3) * Math.exp(-t / 0.75) * (0.75 + 0.25 * Math.sin(TAU * 4.5 * t + ph));
      }
    }
    return finishSfx(withReverb(y, { feedback: 0.9, wet: 3 }), d, { fadeOut: 0.15 });
  },
  "pulse-soft": (d) => {
    const y = zeros(N(d));
    addInto(y, dsine(240, 0.12, 0.6, { att: 0.008, glideTo: 196, glideTau: 0.05 }), 0, 1);
    addInto(y, dsine(392, 0.07, 0.4, { att: 0.008 }), 0, 0.25);
    return finishSfx(filt(y, [["lp", 900, 0.7]]), d, { fadeOut: 0.06 });
  },
  "fest-ambience": (d) => {
    const n = N(d), y = zeros(n);
    // Brise
    const wind = filt(noiseBuf(d), [["lp", 500, 0.7], ["lp", 700, 0.7]]);
    const w1 = smoothRand(d, 0.35), w2 = smoothRand(d, 0.9);
    for (let i = 0; i < n; i++) y[i] += wind[i] * (0.25 + 0.55 * w1[i] + 0.2 * w2[i]) * 2.5;
    // fernes Stimmengemurmel: formantgefärbtes Rauschen, silbenweise moduliert
    for (let v = 0; v < 6; v++) {
      const f1 = 420 + rnd() * 320, f2 = 1100 + rnd() * 1200;
      const vo = filt(noiseBuf(d), [["bp", f1, 4], ["bp", f2, 5]]);
      const am = smoothRand(d, 2.5 + rnd() * 3), am2 = smoothRand(d, 0.6 + rnd());
      for (let i = 0; i < n; i++) y[i] += vo[i] * 14 * Math.pow(am[i], 2.2) * (0.2 + 0.8 * am2[i]) * 0.5;
    }
    const out = filt(y, [["hp", 120, 0.7], ["lp", 3000, 0.7]]);
    return finishSfx(out, d, { fadeIn: 0.35, fadeOut: 0.5 });
  },
  // ---- 7 · Nachrichten ---------------------------------------------------------------------------
  "tock": (d) => {
    const y = zeros(N(d));
    addInto(y, dsine(880, 0.028, 0.15, { att: 0.0007, glideTo: 800, glideTau: 0.02 }), 0, 1);
    addInto(y, dsine(1320, 0.012, 0.08, { att: 0.0005 }), 0, 0.4);
    addInto(y, burst(0.02, 0.002, [["bp", 2000, 1]]).map((v) => v * 3), 0, 0.3);
    return finishSfx(filt(y, [["lp", 3500, 0.7]]), d);
  },
  "typing-soft": (d) => {
    const y = zeros(N(d));
    [0.05, 0.22, 0.31, 0.47, 0.62, 0.7, 0.93, 1.02, 1.12, 1.3].forEach((t) => {
      addInto(y, keyClack(0.75, 0.6, 0.5 + 0.5 * rnd()), t + (rnd() - 0.5) * 0.02, 1);
    });
    return finishSfx(filt(y, [["lp", 5000, 0.7]]), d, { fadeOut: 0.06 });
  },
  "send-whoosh": (d) => {
    const x = sweepNoise(d, 700, 6500, (t) => (t < 0.15 ? smooth01(t / 0.15) : Math.exp(-(t - 0.15) / 0.11)), { q: 0.9, shapeT: 0.4 });
    scaleBuf(x, 2);
    const tone = zeros(x.length);
    let ph = 0;
    for (let i = 0; i < tone.length; i++) {
      const t = i / SR;
      ph += (TAU * (500 + 1000 * smooth01(t / 0.4))) / SR;
      tone[i] = Math.sin(ph) * 0.08 * (t < 0.15 ? smooth01(t / 0.15) : Math.exp(-(t - 0.15) / 0.12));
    }
    addInto(x, tone);
    return finishSfx(filt(x, [["hp", 400, 0.7]]), d, { fadeIn: 0.004, fadeOut: 0.06 });
  },
  "double-tick": (d) => {
    const y = zeros(N(d));
    addInto(y, tickSoft(1, 2800), 0.003);
    addInto(y, tickSoft(0.75, 3200), 0.078);
    return finishSfx(y, d);
  },
  "accent-warm": (d) => {
    const y = zeros(N(d));
    ["C3", "G3", "C4", "E4", "G4"].forEach((nn, i) => addInto(y, pianoNote(hz(nn), { dur: d, vel: 0.5, bright: 0.35, sustain: 0.8 }), i * 0.01, 0.8));
    addInto(y, padMono([hz("C3"), hz("G3"), hz("E4")], 0.7, { att: 0.35, rel: 0.5, cutA: 700, cutB: 1300, cutT: 0.6, gain: 1 }), 0, 0.12);
    return finishSfx(withReverb(y, { feedback: 0.88, wet: 2.5 }), d, { fadeOut: 0.15 });
  },
  // ---- 8 · Finanzen ------------------------------------------------------------------------------
  "box-thump": (d) => {
    const y = zeros(N(d));
    addInto(y, dsine(105, 0.06, 0.3, { att: 0.002, glideTo: 62, glideTau: 0.04 }), 0, 1);
    addInto(y, burst(0.15, 0.03, [["lp", 500, 0.7]]).map((v) => v * 4), 0, 0.8);
    addInto(y, burst(0.2, 0.05, [["bp", 250, 1.5]]).map((v) => v * 4), 0, 0.5);
    // Belege rieseln heraus: Körner mit abnehmender Dichte
    let t = 0.12;
    while (t < d - 0.08) {
      const prog = (t - 0.12) / (d - 0.2);
      addInto(y, burst(0.012, 0.003, [["bp", 2500 + rnd() * 4500, 1.2]]).map((v) => v * 3), t, 0.35 * rnd() * (1 - 0.6 * prog));
      t += 1 / (420 - 380 * prog) * (0.5 + rnd());
    }
    const bed = svfSweep(noiseBuf(d), () => 3500, 0.7, "bp");
    const am = smoothRand(d, 30);
    for (let i = 0; i < bed.length; i++) {
      const tt = i / SR;
      bed[i] *= tt < 0.12 ? 0 : Math.exp(-(tt - 0.12) / 0.3) * am[i] * 0.7;
    }
    addInto(y, bed);
    return finishSfx(y, d, { fadeOut: 0.08 });
  },
  "receipt-snap": (d) => {
    const y = zeros(N(d));
    addInto(y, band(burst(0.04, 0.006, null, 0.0003), 3300, 0.7), 0, 1.3);
    addInto(y, band(burst(0.1, 0.02, null), 5500, 1), 0.004, 0.3);
    addInto(y, dsine(2300, 0.004, 0.03, { att: 0.0002 }), 0, 0.3);
    addInto(y, dsine(900, 0.01, 0.05, { att: 0.0004 }), 0, 0.25);
    return finishSfx(y, d);
  },
  "click-soft": (d) => {
    const y = zeros(N(d));
    addInto(y, dsine(1450, 0.012, 0.08, { att: 0.0004, glideTo: 1050, glideTau: 0.01 }), 0, 0.7);
    addInto(y, dsine(520, 0.014, 0.08), 0, 0.6);
    addInto(y, burst(0.02, 0.002, [["lp", 4000, 0.7]]).map((v) => v * 2), 0, 0.5);
    addInto(y, dsine(1900, 0.006, 0.04, { att: 0.0003 }), 0.07, 0.25);
    addInto(y, burst(0.02, 0.0015, [["lp", 4500, 0.7]]).map((v) => v * 2), 0.07, 0.18);
    return finishSfx(filt(y, [["lp", 5500, 0.7]]), d);
  },
  "glass-tink": (d) => {
    const y = zeros(N(d));
    addResonator(y, 2860, 1, 0.2);
    addResonator(y, 2874, 0.8, 0.18);
    addResonator(y, 6620, 0.35, 0.09);
    addResonator(y, 9400, 0.18, 0.05);
    addInto(y, burst(0.02, 0.002, [["hp", 4000, 0.7]]).map((v) => v * 2), 0, 0.35);
    for (let i = 0; i < N(0.0006); i++) y[i] *= i / N(0.0006);
    return finishSfx(withReverb(y, { feedback: 0.78, wet: 1.2 }), d, { fadeOut: 0.1 });
  },
  "pen-stroke": (d) => {
    const n = N(d);
    const pr = smoothRand(d, 6), grain = smoothRand(d, 400);
    const x = svfSweep(noiseBuf(d), (t) => 2800 + 1200 * Math.sin(TAU * 1.5 * t), 0.6, "bp");
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const shape = smooth01((t - 0.04) / 0.12) * smooth01((0.74 - t) / 0.12);
      x[i] *= shape * (0.4 + 0.6 * pr[i]) * (0.45 + 0.55 * grain[i]) * 3;
    }
    return finishSfx(filt(x, [["hp", 1500, 0.7], ["lp", 7000, 0.7]]), d, { fadeOut: 0.04 });
  },
  "lock-click": (d) => {
    const y = zeros(N(d));
    addInto(y, burst(0.03, 0.003, [["bp", 4800, 2]]).map((v) => v * 4), 0, 0.9);
    [[2300, 0.02, 0.6], [3600, 0.015, 0.45], [5300, 0.01, 0.3]].forEach(([f, tau, a]) => addResonator(y, f, a, tau));
    addInto(y, dsine(380, 0.02, 0.1, { att: 0.0008 }), 0.045, 0.7);
    addInto(y, burst(0.03, 0.006, [["lp", 1500, 0.7]]).map((v) => v * 3), 0.045, 0.5);
    addResonator(y, 1900, 0.25, 0.03, 0.046);
    for (let i = 0; i < N(0.0005); i++) y[i] *= i / N(0.0005);
    return finishSfx(y, d);
  },
  // ---- 9–11 · Leitsatz, Logo, Endkarte ------------------------------------------------------------
  "whoosh-short": (d) => {
    const n = N(d);
    const x = svfSweep(noiseBuf(d), (t) => 1000 + 2400 * Math.sin(Math.PI * clamp(t / 0.45, 0, 1)), 0.9, "bp");
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      x[i] *= Math.pow(Math.sin(Math.PI * clamp(t / 0.45, 0, 1)), 2) * 3;
    }
    return finishSfx(filt(x, [["hp", 600, 0.7]]), d, { fadeIn: 0.004, fadeOut: 0.05 });
  },
  "snap-bloom": (d) => {
    const n = N(d), y = zeros(n);
    addInto(y, dsine(235, 0.03, 0.2, { att: 0.0006, glideTo: 140, glideTau: 0.012 }), 0, 1);
    addInto(y, burst(0.04, 0.005, [["bp", 1100, 1]]).map((v) => v * 4), 0, 0.5);
    addInto(y, dsine(560, 0.02, 0.1), 0, 0.35);
    const pad = padMono([hz("C3"), hz("G3"), hz("C4"), hz("E4")], 0.55, { att: 0.45, rel: 0.5, cutA: 400, cutB: 3000, cutT: 0.6, gain: 1 });
    addInto(y, pad, 0.05, 0.22);
    for (const nn of ["C5", "E5", "G5"]) {
      const f = hz(nn);
      for (let i = 0; i < n - N(0.1); i++) {
        const t = i / SR;
        y[N(0.1) + i] += Math.sin(TAU * f * t) * 0.03 * smooth01(t / 0.4) * Math.exp(-t / 0.5);
      }
    }
    return finishSfx(withReverb(y, { feedback: 0.89, wet: 2.5 }), d, { fadeOut: 0.15 });
  },
  "logo-sting": (d) => {
    // C–E–G–C (Achtel bei 120 BPM = 0,25 s), danach warmer C-Dur-Akkord, der ausklingt
    const y = zeros(N(d));
    const mel = [["C5", 0], ["E5", 0.25], ["G5", 0.5], ["C6", 0.75]];
    mel.forEach(([nn, t], i) => {
      const last = i === mel.length - 1;
      addInto(y, pianoNote(hz(nn), { dur: d - t, vel: last ? 0.8 : 0.55, bright: 0.55, sustain: last ? 0.9 : 0.5, hold: last ? null : 0.24 }), t, last ? 1.4 : 0.9);
      const mar = marimbaNote(hz(nn), { vel: last ? 0.6 : 0.45, dur: last ? Math.min(1, d - t) : 0.3 });
      if (!last) for (let i = 0; i < N(0.06); i++) mar[mar.length - 1 - i] *= i / N(0.06);
      addInto(y, mar, t, 0.5);
    });
    ["C3", "G3", "E4", "C5"].forEach((nn, i) => addInto(y, pianoNote(hz(nn), { dur: d - 0.75, vel: 0.45, bright: 0.35, sustain: 1 }), 0.75 + i * 0.012, 0.4));
    addInto(y, padMono([hz("C3"), hz("G3"), hz("E4"), hz("C5")], 1.2, { att: 0.35, rel: 0.9, cutA: 800, cutB: 1800, cutT: 0.8, gain: 1 }), 0.75, 0.09);
    addInto(y, bellNote(hz("C7"), { vel: 0.18, dur: 1.5, tau: 0.5 }), 0.8, 1);
    return finishSfx(withReverb(y, { feedback: 0.91, wet: 1.8, damp: 0.5 }), d, { fadeOut: 0.3 });
  },
};

// ======================================================================================================
// Musik
// ======================================================================================================
const BPM = 120;
const BEAT = 60 / BPM; // 0,5 s
const BAR = 4 * BEAT; // 2 s

/** Akkorde: Bass-Grundton, Pad-Stimmen, Klavier (rechte Hand + Grundton links), Arpeggio-Töne */
const CH = {
  C: { bass: "C2", pad: ["C3", "G3", "C4", "E4", "G4"], pno: ["E4", "G4", "C5"], lh: "C3", arp: ["C5", "E5", "G5", "C6"] },
  G: { bass: "G1", pad: ["G2", "D3", "G3", "B3", "D4"], pno: ["D4", "G4", "B4"], lh: "G2", arp: ["B4", "D5", "G5", "B5"] },
  Am: { bass: "A1", pad: ["A2", "E3", "A3", "C4", "E4"], pno: ["E4", "A4", "C5"], lh: "A2", arp: ["A4", "C5", "E5", "A5"] },
  F: { bass: "F1", pad: ["F2", "C3", "F3", "A3", "C4"], pno: ["F4", "A4", "C5"], lh: "F2", arp: ["A4", "C5", "F5", "A5"] },
  Am7: { bass: "A1", pad: ["A2", "E3", "G3", "C4", "E4"], pno: ["E4", "G4", "C5"], lh: "A2", arp: ["A4", "C5", "E5", "G5"] },
  Fmaj7: { bass: "F1", pad: ["F2", "C3", "E3", "A3", "C4"], pno: ["E4", "A4", "C5"], lh: "F2", arp: ["A4", "C5", "E5", "A5"] },
  Gsus: { bass: "G1", pad: ["G2", "D3", "G3", "C4", "D4"], pno: ["C4", "D4", "G4"], lh: "G2", arp: ["C5", "D5", "G5", "C6"] },
};

// Szenen des Films (Sekunden, siehe video/src/data/timeline.json)
const T_PROBLEM = 2.5; //  angespannt (Moll), Zettelchaos
const T_FRAGE = 8; //      fast still: „Und wer kommt am Donnerstag?“
const T_DROP = 10; //      „Mit VereinsFlow …“ – voller Groove
const T_LIFT = 26; //      Helfer: Marimba-Melodie, Shaker
const T_FEIER = 46; //     „Dann ist Feierabend.“ – Schlagzeug raus, warm
const T_LEIT = 47.5; //    Leitsatz: Klavier, Aufbau
const T_LOGO_HIT = 52; //  Logo-Auftritt (Stimme „VereinsFlow“ bei 52,18 s)
const T_END = 60;
const T_SILENT = 59.7; //  letzte 0,3 s stumm (sauberer Loop)
/** Akzente an den Szenenwechseln */
const SCENE_HITS = [18, 26, 32, 38.5];

/** Groove-Takte ab T_DROP: C G Am F … (je 2 s) */
const GROOVE = [];
for (let t = T_DROP, k = 0; t < T_FEIER - 0.01; t += BAR, k++) GROOVE.push({ t, ch: ["C", "G", "Am", "F"][k % 4] });

function synthMusic() {
  reseed("music60neon");
  const n = N(T_END);
  const mk = () => ({ L: zeros(n), R: zeros(n) });
  const bus = { drums: mk(), hat: mk(), clap: mk(), bass: mk(), harm: mk(), lead: mk(), intro: mk(), fx: mk(), send: mk() };
  const put = (b, x, t, g = 1, pan = 0, send = 0) => {
    x = endFade(Float32Array.from(x), 0.006);
    const th = ((pan + 1) * Math.PI) / 4, gl = Math.cos(th) * g, gr = Math.sin(th) * g;
    const o = Math.round(t * SR);
    for (let i = 0; i < x.length; i++) {
      const j = o + i;
      if (j < 0 || j >= n) continue;
      b.L[j] += x[i] * gl;
      b.R[j] += x[i] * gr;
      if (send) {
        bus.send.L[j] += x[i] * gl * send;
        bus.send.R[j] += x[i] * gr * send;
      }
    }
  };
  const putSt = (b, s, t, g = 1, send = 0) => {
    const o = Math.round(t * SR);
    for (let i = 0; i < s.L.length; i++) {
      const j = o + i;
      if (j < 0 || j >= n) continue;
      b.L[j] += s.L[i] * g;
      b.R[j] += s.R[i] * g;
      if (send) {
        bus.send.L[j] += s.L[i] * g * send;
        bus.send.R[j] += s.R[i] * g * send;
      }
    }
  };
  const M = { kick: 0.52, clap: 0.8, hatC: 0.4, hatO: 0.42, shaker: 0.22, bass: 0.55, pno: 0.18, pad: 0.2, arp: 0.72, mar: 0.34 };
  const kickTimes = [];
  const kick = (t, v = 1, g = M.kick) => {
    put(bus.drums, kickDrum(v), t, g, 0);
    kickTimes.push(t);
  };
  const hit = (t, big = false) => {
    put(bus.fx, dsine(50, big ? 0.6 : 0.38, big ? 1.6 : 1.1, { att: 0.004, glideTo: 43, glideTau: 0.3 }), t, big ? 0.32 : 0.2, 0);
    put(bus.fx, scaleBuf(burst(big ? 2.2 : 1.2, big ? 0.8 : 0.36, [["hp", 4000, 0.7], ["hp", 3000, 0.7]], 0.001), 0.55), t, big ? 0.08 : 0.05, 0, 0.35);
  };
  const riser = (tEnd, dur, g = 0.2) => {
    const r = zeros(N(dur));
    const x = svfSweep(noiseBuf(dur), (t) => 500 * Math.pow(9500 / 500, t / dur), 1.2, "bp");
    for (let i = 0; i < r.length; i++) r[i] = x[i] * 1.5 * Math.pow(i / r.length, 2.4);
    for (let i = 0; i < N(0.012); i++) r[r.length - 1 - i] *= i / N(0.012);
    put(bus.fx, r, tEnd - dur - 0.01, g, 0, 0.25);
  };

  // ===== Einstieg 0–2,5 s: sofort Energie (Am), Lichtband-Swoosh, Arpeggio öffnet sich ==========
  {
    hit(0.0);
    put(bus.fx, scaleBuf(sweepNoise(0.8, 9000, 900, (x) => Math.exp(-x / 0.25), { q: 1 }), 1.2), 0.0, 0.1, 0, 0.3);
    putSt(bus.intro, padStereo(CH.Am.pad.map(hz), 2.6, { att: 0.05, rel: 0.3, cutA: 900, cutB: 2600, cutT: 2.3, gain: 1 }), 0, 0.2, 0.3);
    for (let e = 0; e < 20; e++) {
      const t = e * (BEAT / 4) + 0.02;
      if (t > T_PROBLEM - 0.05) break;
      const nn = CH.Am.arp[[0, 1, 2, 3, 2, 1, 2, 3][e % 8]];
      put(bus.intro, pluckSynth(hz(nn), { vel: 0.55 + 0.35 * (t / T_PROBLEM), dur: 0.3 }), t, 0.5, e % 2 ? 0.3 : -0.3, 0.2);
    }
    for (let e = 0; e < 5; e++) put(bus.bass, bassNote(hz("A1"), { dur: 0.22, vel: 0.9 }), e * BEAT, M.bass * 0.85, 0);
  }

  // ===== Problem 2,5–8 s: angespannt, halbe Zeit, Ticken, Staccato ================================
  {
    const prog = [["Am", 2.5], ["F", 4.5], ["G", 6.5]];
    prog.forEach(([c, t0], k) => {
      const len = k < 2 ? BAR : T_FRAGE - t0;
      putSt(bus.harm, padStereo(CH[c].pad.map(hz), len, { att: 0.08, rel: 0.3, cutA: 900, cutB: 1400, cutT: len, gain: 1 }), t0, M.pad * 0.8, 0.25);
      for (let b = 0; b < len / BEAT - 0.01; b++) {
        const t = t0 + b * BEAT;
        if (b % 2 === 0) kick(t, 0.9);
        if (b % 4 === 2) put(bus.clap, clapDrum(0.8), t, M.clap * 0.7, 0.05, 0.3);
        put(bus.bass, bassNote(hz(CH[c].bass), { dur: 0.16, vel: 0.85 }), t + BEAT / 2, M.bass * 0.8, 0);
        for (let s = 0; s < 4; s++) put(bus.hat, hatDrum(false, 0.7), t + s * (BEAT / 4), M.hatC * (s === 0 ? 0.5 : 0.28), s % 2 ? 0.25 : -0.25);
        // Staccato-Zupfer: Unruhe der Zettelwirtschaft
        [0, 3].forEach((s) => put(bus.lead, pluckSynth(hz(CH[c].arp[(b + s) % 4]), { vel: 0.6, dur: 0.18 }), t + s * (BEAT / 4), M.arp * 0.7, s ? 0.35 : -0.35, 0.15));
      }
    });
  }

  // ===== Frage 8–10 s: fast still, nur Pad und Puls, Riser in den Groove ===========================
  {
    putSt(bus.harm, padStereo(CH.Gsus.pad.map(hz), 2.1, { att: 0.25, rel: 0.4, cutA: 700, cutB: 1300, cutT: 2, gain: 1 }), T_FRAGE, M.pad * 0.9, 0.4);
    [8.0, 8.5, 9.0, 9.5].forEach((t, i) => put(bus.drums, kickDrum(0.45), t, 0.1 + i * 0.015, 0));
    riser(T_DROP, 1.6, 0.22);
    put(bus.fx, scaleBuf(sweepNoise(1.0, 6000, 500, (x) => Math.pow(x / 1.0, 2.6), { q: 1.1 }), 1.2), T_DROP - 1.02, 0.06, 0, 0.3);
  }

  // ===== Groove 10–46 s: „Mit VereinsFlow …“ ========================================================
  hit(T_DROP, true);
  for (const { t: t0, ch: c } of GROOVE) {
    const lift = t0 >= T_LIFT;
    const ch = CH[c];
    for (let b = 0; b < 4; b++) {
      const t = t0 + b * BEAT;
      if (t >= T_FEIER - 0.01) break;
      kick(t);
      if (b === 1 || b === 3) put(bus.clap, clapDrum(1), t, M.clap, 0.05, 0.35);
    }
    for (let e = 0; e < 8; e++) {
      const t = t0 + e * (BEAT / 2);
      if (t >= T_FEIER - 0.01) break;
      if (e % 2 === 1) put(bus.hat, hatDrum(true, 1), t, M.hatO, 0.18, 0.04);
      else put(bus.hat, hatDrum(false, 1), t, M.hatC * 0.55, -0.12);
      if (t >= 18) put(bus.hat, hatDrum(false, 0.8), t + BEAT / 4, M.shaker * (e % 2 ? 1 : 0.8), e % 2 ? 0.3 : -0.3);
    }
    const bn = hz(ch.bass);
    [[1, 0], [3, 0], [5, 12], [7, 0]].forEach(([e, oct], i) => {
      const t = t0 + e * (BEAT / 2);
      if (t >= T_FEIER - 0.01) return;
      put(bus.bass, bassNote(bn * (oct ? 2 : 1), { dur: 0.2, vel: 1 }), t, M.bass * (i === 0 ? 1 : 0.88), 0);
    });
    // helle Flächen (Supersaw) – der „Neon“-Klang
    const cut = lift ? 4200 : 3000;
    putSt(bus.harm, padStereo(ch.pad.map(hz), BAR, { att: 0.03, rel: 0.25, cutA: cut * 0.6, cutB: cut, cutT: 0.4, gain: 1, det: 0.006 }), t0, M.pad * 1.05, 0.25);
    // Zupf-Arpeggio in Sechzehnteln
    const seq = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 1, 2, 3];
    for (let e = 0; e < 16; e++) {
      const t = t0 + e * (BEAT / 4);
      if (t >= T_FEIER - 0.01) break;
      put(bus.lead, pluckSynth(hz(ch.arp[seq[e]]), { vel: (e % 4 === 0 ? 0.85 : 0.55) * (lift ? 1.05 : 1), dur: 0.3 }), t, M.arp * 0.8, e % 2 ? 0.35 : -0.35, 0.22);
    }
  }
  for (const t of SCENE_HITS) {
    hit(t);
    put(bus.fx, scaleBuf(sweepNoise(0.45, 1200, 8000, (x) => Math.pow(x / 0.45, 2.2), { q: 1 }), 1.4), t - 0.45, 0.05, 0, 0.2);
  }
  // Marimba-Melodie ab dem Lift (Helfer) bis Finanzen
  const MEL = {
    C: [[0, "G5", 2], [2, "E5", 1], [3, "D5", 1], [4, "E5", 2], [6, "G5", 2]],
    G: [[0, "D5", 2], [2, "B4", 1], [3, "D5", 1], [4, "G5", 2], [6, "B5", 2]],
    Am: [[0, "C5", 2], [2, "E5", 1], [3, "A5", 1], [4, "G5", 2], [6, "E5", 2]],
    F: [[0, "A5", 2], [2, "F5", 1], [3, "E5", 1], [4, "C5", 2], [6, "A4", 2]],
  };
  for (const { t: t0, ch: c } of GROOVE) {
    if (t0 < T_LIFT) continue;
    MEL[c].forEach(([e, nn, len], i) => {
      const t = t0 + e * (BEAT / 2);
      if (t >= T_FEIER - 0.05) return;
      put(bus.lead, marimbaNote(hz(nn), { vel: 0.85, dur: Math.min(1.1, len * BEAT * 0.5 + 0.7) }), t, M.mar, -0.1 + (i % 2) * 0.35, 0.3);
    });
  }

  // ===== Feierabend 46–47,5 s: Schlagzeug raus, warmes Fmaj7 =========================================
  {
    putSt(bus.harm, padStereo(CH.Fmaj7.pad.map(hz), 1.7, { att: 0.15, rel: 0.6, cutA: 700, cutB: 1500, cutT: 1.5, gain: 1 }), T_FEIER, 0.17, 0.45);
    CH.Fmaj7.pno.forEach((nn, i) => put(bus.harm, pianoNote(hz(nn), { dur: 2.2, vel: 0.45, bright: 0.4, sustain: 1 }), T_FEIER + i * 0.04, 0.14, -0.15 + i * 0.1, 0.45));
    put(bus.harm, pianoNote(hz("F2"), { dur: 2.4, vel: 0.5, bright: 0.35, sustain: 1 }), T_FEIER, 0.13, 0, 0.3);
  }
  // ===== Leitsatz 47,5–51,5 s: Klavier, ruhiger Aufbau zum Logo ======================================
  {
    const roll = (notes, t, v, hold, g = 0.11) => notes.forEach((nn, i) => put(bus.harm, pianoNote(hz(nn), { dur: hold + 1.4, vel: v * (i === 0 ? 1 : 0.85), bright: 0.42, sustain: 0.9, hold }), t + i * 0.05, g, -0.15 + i * 0.07, 0.4));
    putSt(bus.harm, padStereo(CH.Am7.pad.map(hz), 2.1, { att: 0.4, rel: 0.5, cutA: 600, cutB: 1300, cutT: 2, gain: 1 }), T_LEIT, 0.14, 0.45);
    putSt(bus.harm, padStereo(CH.Gsus.pad.map(hz), 2.2, { att: 0.4, rel: 0.4, cutA: 700, cutB: 1800, cutT: 2, gain: 1 }), T_LEIT + 2, 0.14, 0.45);
    roll(["A2", "E3", "G3", "C4", "E4"], T_LEIT, 0.5, 1.8);
    roll(["G2", "D3", "G3", "C4", "D4"], T_LEIT + 2, 0.5, 1.6);
    for (let k = 0; k < 8; k++) put(bus.drums, kickDrum(0.5), T_LEIT + k * BEAT, 0.08 + 0.01 * k, 0);
    riser(T_LOGO_HIT, 1.4, 0.16);
  }
  // ===== Logo 52 s bis Ende: großer C-Dur-Akkord, Motiv, Ausklang =====================================
  {
    hit(T_LOGO_HIT, true);
    putSt(bus.harm, padStereo(CH.C.pad.map(hz).concat([hz("C2")]), 3.2, { att: 0.15, rel: 1.4, cutA: 1400, cutB: 3600, cutT: 1.6, gain: 1, det: 0.006 }), T_LOGO_HIT, 0.22, 0.4);
    ["C3", "G3", "C4", "E4", "G4", "C5"].forEach((nn, i) => put(bus.harm, pianoNote(hz(nn), { dur: 4.5, vel: 0.62, bright: 0.45, sustain: 1.3 }), T_LOGO_HIT + i * 0.014, 0.18, -0.2 + i * 0.08, 0.4));
    put(bus.bass, dsine(hz("C2"), 1.2, 4, { att: 0.04 }), T_LOGO_HIT, 0.17, 0);
    ["C5", "E5", "G5", "C6"].forEach((nn, i) => put(bus.lead, pluckSynth(hz(nn), { vel: 0.7, dur: 0.6 }), T_LOGO_HIT + 0.75 + i * 0.25, 0.22, i % 2 ? 0.3 : -0.3, 0.35));
    // ruhiger Puls unter dem Claim
    for (let k = 0; k < 14; k++) put(bus.drums, kickDrum(0.5), 53.0 + k * BEAT, 0.1 * (1 - k / 16), 0);
    putSt(bus.harm, padStereo(["C3", "F3", "A3", "C4", "E4"].map(hz), 2.2, { att: 0.6, rel: 1.0, cutA: 900, cutB: 1800, cutT: 1.5, gain: 1 }), 55.5, 0.14, 0.45);
    putSt(bus.harm, padStereo(["C3", "G3", "D4", "E4", "G4"].map(hz), 2.4, { att: 0.6, rel: 1.4, cutA: 900, cutB: 1600, cutT: 1.5, gain: 1 }), 57.5, 0.14, 0.45);
    [[54.0, "G5", 0.26], [55.0, "E5", 0.22], [56.2, "C6", 0.2]].forEach(([t, nn, v]) => put(bus.lead, marimbaNote(hz(nn), { vel: v * 2, dur: 1.6 }), t, 0.12, 0.2, 0.5));
  }

  // ===== Mix =====================================================================================
  const duck = (depth) => {
    const g = new Float32Array(n).fill(1);
    for (const tk of kickTimes) {
      const i0 = Math.round(tk * SR), len = N(0.35);
      for (let i = 0; i < len && i0 + i < n; i++) {
        const t = i / SR;
        const v = 1 - depth * Math.exp(-t / 0.11) * Math.min(1, t / 0.003);
        if (v < g[i0 + i]) g[i0 + i] = v;
      }
    }
    return g;
  };
  const applyGain = (b, g) => {
    for (let i = 0; i < n; i++) {
      b.L[i] *= g[i];
      b.R[i] *= g[i];
    }
  };
  applyGain(bus.bass, duck(0.5));
  applyGain(bus.harm, duck(0.35));
  applyGain(bus.lead, duck(0.2));
  // Lead: in der Frage und im Feierabend gedämpft
  for (const ch of ["L", "R"]) bus.lead[ch] = svfSweep(bus.lead[ch], (t) => (t >= T_FRAGE && t < T_DROP ? 2500 : t >= T_FEIER && t < T_LOGO_HIT ? 2400 : 11000), 0.7);
  // Ping-Pong-Echo (punktierte Achtel) auf Zupf- und Marimba-Stimmen
  {
    const D = N(BEAT * 0.75);
    const mono = zeros(n);
    for (let i = 0; i < n; i++) mono[i] = (bus.lead.L[i] + bus.lead.R[i]) * 0.5;
    for (let k = 1; k <= 4; k++) {
      const tap = biquad(mono, "lp", 6000 / (1 + 0.55 * k), 0.7);
      const g = 0.34 * Math.pow(0.56, k - 1), side = k % 2 ? bus.lead.R : bus.lead.L, oth = k % 2 ? bus.lead.L : bus.lead.R;
      const off = D * k;
      for (let i = 0; i + off < n; i++) {
        side[i + off] += tap[i] * g;
        oth[i + off] += tap[i] * g * 0.25;
        bus.send.L[i + off] += tap[i] * g * 0.12;
        bus.send.R[i + off] += tap[i] * g * 0.12;
      }
    }
  }
  const rv = reverbStereo(bus.send.L, bus.send.R, { feedback: 0.9, damp: 0.38, wet: 2.4, predelay: 0.02 });
  rv.L = filt(rv.L, [["hp", 220, 0.7], ["lp", 7500, 0.7]]);
  rv.R = filt(rv.R, [["hp", 220, 0.7], ["lp", 7500, 0.7]]);
  if (process.env.STEMS) {
    const wins = [["Einstieg", 0.2, 2.4], ["Problem", 2.6, 7.8], ["Frage", 8.1, 9.8], ["Groove", 10.5, 25.5], ["Lift", 26.5, 45.5], ["Feier", 46.1, 47.4], ["Leit", 47.6, 51.4], ["Logo", 52.2, 56]];
    const rmsB = (b, a, z) => {
      let sum = 0, cnt = 0;
      for (let i = N(a); i < N(z); i++) { sum += b.L[i] * b.L[i] + b.R[i] * b.R[i]; cnt += 2; }
      return linDb(Math.sqrt(sum / cnt));
    };
    console.log("Stems (RMS dBFS vor Master):\n" + "".padEnd(10) + wins.map((w) => w[0].padStart(9)).join(""));
    for (const k of ["drums", "hat", "clap", "bass", "harm", "lead", "intro", "fx"]) console.log(k.padEnd(10) + wins.map((w) => rmsB(bus[k], w[1], w[2]).toFixed(1).padStart(9)).join(""));
  }
  for (let i = 0; i < n; i++) {
    bus.intro.L[i] *= 0.8;
    bus.intro.R[i] *= 0.8;
  }
  const L = zeros(n), R = zeros(n);
  for (const k of ["drums", "hat", "clap", "bass", "harm", "lead", "intro", "fx"]) {
    for (let i = 0; i < n; i++) {
      L[i] += bus[k].L[i];
      R[i] += bus[k].R[i];
    }
  }
  for (let i = 0; i < n; i++) {
    L[i] += rv.L[i];
    R[i] += rv.R[i];
  }
  // Ausklang ab 58,2 s, letzte 0,3 s stumm
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const g = t < 58.2 ? 1 : t >= T_SILENT ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * (t - 58.2)) / (T_SILENT - 58.2));
    L[i] *= g;
    R[i] *= g;
  }
  let ML = removeDc(L, 28), MR = removeDc(R, 28);
  [ML, MR] = glueCompress(ML, MR, { thresholdDb: -20, ratio: 2.2, attack: 0.02, release: 0.18 });
  {
    const pk = Math.max(peakOf(ML), peakOf(MR)), g = (dbLin(-1.2) / pk) * dbLin(LIMIT_DRIVE_DB);
    scaleBuf(ML, g);
    scaleBuf(MR, g);
  }
  [ML, MR] = limiter(ML, MR, dbLin(-1.2));
  fadeEdges(ML, 0.004, 0.01);
  fadeEdges(MR, 0.004, 0.01);
  for (let i = N(T_SILENT); i < n; i++) {
    ML[i] = 0;
    MR[i] = 0;
  }
  normalize([ML, MR], PEAK_DB);
  return [ML, MR];
}

function glueCompress(L, R, { thresholdDb, ratio, attack, release }) {
  const n = L.length, ca = Math.exp(-1 / (attack * SR)), cr = Math.exp(-1 / (release * SR));
  const oL = zeros(n), oR = zeros(n);
  let e = 0;
  for (let i = 0; i < n; i++) {
    const p = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    e = p > e ? ca * e + (1 - ca) * p : cr * e + (1 - cr) * p;
    const db = linDb(e);
    const red = db > thresholdDb ? (db - thresholdDb) * (1 - 1 / ratio) : 0;
    const g = dbLin(-red);
    oL[i] = L[i] * g;
    oR[i] = R[i] * g;
  }
  return [oL, oR];
}
/** Lookahead-Begrenzer: garantiert |x| ≤ ceil (Minimum über das Fenster, dann Mittelung, dann langsame Rückkehr) */
function limiter(L, R, ceil, look = 96, relS = 0.09) {
  const n = L.length;
  const need = new Float32Array(n).fill(1);
  for (let i = 0; i < n; i++) {
    const p = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    if (p > ceil) need[i] = ceil / p;
  }
  // gleitendes Minimum über [i−look, i+look]
  const mn = new Float32Array(n), dq = new Int32Array(n);
  let head = 0, tail = 0;
  for (let j = 0; j < n + look; j++) {
    if (j < n) {
      while (tail > head && need[dq[tail - 1]] >= need[j]) tail--;
      dq[tail++] = j;
    }
    const i = j - look;
    if (i >= 0) {
      while (dq[head] < i - look) head++;
      mn[i] = need[dq[head]];
    }
  }
  // Mittelung über dasselbe Fenster: bleibt überall ≤ need[i], die Verstärkung wird rampenförmig
  const ps = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) ps[i + 1] = ps[i] + mn[i];
  const k = 1 - Math.exp(-1 / (relS * SR));
  const oL = zeros(n), oR = zeros(n);
  let g = 1;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - look), b = Math.min(n, i + look + 1);
    const sm = (ps[b] - ps[a]) / (b - a);
    g = Math.min(sm, g + (1 - g) * k);
    oL[i] = L[i] * g;
    oR[i] = R[i] * g;
  }
  return [oL, oR];
}

// ======================================================================================================
// Hauptprogramm
// ======================================================================================================
function main() {
  const args = process.argv.slice(2);
  const arg = (k) => {
    const i = args.indexOf(k);
    return i >= 0 ? args[i + 1] : null;
  };
  const only = arg("--nur");
  const single = arg("--datei");
  const report = (file, chans) => {
    let p = 0, s = 0;
    for (const c of chans) {
      p = Math.max(p, peakOf(c));
      for (let i = 0; i < c.length; i++) s += c[i] * c[i];
    }
    const rms = Math.sqrt(s / (chans.length * chans[0].length));
    console.log(`✓ ${path.relative(ROOT, file)}  ${(chans[0].length / SR).toFixed(3)} s  Spitze ${linDb(p).toFixed(1)} dBFS  RMS ${linDb(rms).toFixed(1)} dBFS`);
  };

  if (only !== "musik") {
    const plan = JSON.parse(fs.readFileSync(path.join(ROOT, "plan/sfx-prompts.json"), "utf8"));
    const names = plan.dateien.map((d) => path.basename(d.datei, path.extname(d.datei)));
    const missing = names.filter((nm) => !RECIPES[nm]);
    const extra = Object.keys(RECIPES).filter((nm) => !names.includes(nm));
    if (missing.length || extra.length) {
      console.error(`Rezepte und Plan passen nicht zusammen. Ohne Rezept: ${missing.join(", ") || "–"} · Nicht im Plan: ${extra.join(", ") || "–"}`);
      process.exit(1);
    }
    fs.mkdirSync(path.join(PUB, "sfx"), { recursive: true });
    for (const d of plan.dateien) {
      const nm = path.basename(d.datei, path.extname(d.datei));
      if (single && single !== nm) continue;
      reseed(`sfx/${nm}`);
      const y = RECIPES[nm](d.dauer_s);
      for (let i = 0; i < y.length; i++) if (!Number.isFinite(y[i])) throw new Error(`${nm}: ungültiger Wert bei Sample ${i}`);
      const out = path.join(PUB, "sfx", `${nm}.wav`);
      fs.writeFileSync(out, wavBytes([y]));
      report(out, [y]);
    }
  }
  if (only !== "sfx" && !single) {
    const [L, R] = synthMusic();
    for (const c of [L, R]) for (let i = 0; i < c.length; i++) if (!Number.isFinite(c[i])) throw new Error(`Musik: ungültiger Wert bei Sample ${i}`);
    fs.mkdirSync(path.join(PUB, "audio"), { recursive: true });
    const out = path.join(PUB, "audio/music.wav");
    reseed("music-dither");
    fs.writeFileSync(out, wavBytes([L, R], { dither: true }));
    report(out, [L, R]);
  }
}
main();
