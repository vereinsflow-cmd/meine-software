// Musik, Geräusche und Mischung des Werbevideos – alles hier berechnet (keine fremden Musikstücke, keine Lizenzfragen).
//
//   node werbevideo/werkzeuge/musik.mjs
//
// Liest Zeiten aus drehbuch.mjs und die Sprecher-Stücke aus ausgabe/ton/sprecher (vorher sprecher.mjs laufen lassen).
// Ergebnis: ausgabe/ton/musik.wav (nur Musik + Geräusche) und ausgabe/ton/mischung.wav (mit Sprecher, Musik leiser,
// solange gesprochen wird). 48 kHz, Stereo.
//
// Aufbau (120 BPM, Takt = 2 s): 0–3 s Haken (dunkler Teppich, Uhr tickt, Handy brummt) · 3–10 s Problem (gedämpfter
// Moll-Groove, ab 8 s Steigerung) · 10 s Aufprall, Wisch · 10–14 s hell (F, G) · 14–44 s voller Groove in C-Dur
// (C G Am F) mit Melodie zwischen den Sprechstellen · 44–52 s ruhiger Teil (F C G Am) · 52–54 s Steigerung ·
// 54–60 s Schluss (C, F G, C – ausklingend).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as LANG from "./drehbuch.mjs";
import * as NACHT from "./drehbuch-nacht.mjs";

// --nacht: Musik für den Kurzspot (szenen/nacht.html, drehbuch-nacht.mjs) statt für das 60-s-Video
const STUECK = process.argv.includes("--nacht") ? "nacht" : "lang";
const D = STUECK === "nacht" ? NACHT : LANG;
const SUFFIX = STUECK === "nacht" ? "-nacht" : "";

const here = path.dirname(fileURLToPath(import.meta.url));
const tonDir = path.resolve(here, "..", "ausgabe", "ton");
fs.mkdirSync(tonDir, { recursive: true });

const SR = 48000;
const N = Math.ceil(D.DAUER * SR);
const BEAT = 60 / D.BPM;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------------------------
// Grundlagen
// ---------------------------------------------------------------------------------------------------------------
function bus() {
  return { L: new Float32Array(N), R: new Float32Array(N) };
}
const B = { drums: bus(), bass: bus(), keys: bus(), pad: bus(), lead: bus(), fx: bus(), send: bus() };

let seed = 20261106;
function rnd() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const noise = () => rnd() * 2 - 1;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const idx = (t) => Math.round(t * SR);

function put(b, i, l, r, send = 0) {
  if (i < 0 || i >= N) return;
  b.L[i] += l;
  b.R[i] += r;
  if (send) {
    B.send.L[i] += l * send;
    B.send.R[i] += r * send;
  }
}

function polyblep(t, dt) {
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

class Biquad {
  constructor() {
    this.x1 = this.x2 = this.y1 = this.y2 = 0;
    this.b0 = 1;
    this.b1 = this.b2 = this.a1 = this.a2 = 0;
  }
  set(type, f, q = 0.707) {
    const w = (TAU * clamp(f, 10, SR * 0.45)) / SR;
    const cs = Math.cos(w);
    const al = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (type === "lp") [b0, b1, b2] = [(1 - cs) / 2, 1 - cs, (1 - cs) / 2];
    else if (type === "hp") [b0, b1, b2] = [(1 + cs) / 2, -(1 + cs), (1 + cs) / 2];
    else [b0, b1, b2] = [al, 0, -al]; // Bandpass (0 dB Spitze)
    const a0 = 1 + al;
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cs) / a0;
    this.a2 = (1 - al) / a0;
    return this;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Instrumente
// ---------------------------------------------------------------------------------------------------------------
const kicks = []; // für das Ducken (Pumpen) von Bass, Akkorden, Teppich

function kick(t, { gain = 1, muffled = false, long = false } = {}) {
  kicks.push(t);
  const len = long ? 1.4 : 0.42;
  const lp = new Biquad().set("lp", muffled ? 220 : 6000);
  let ph = 0;
  for (let n = 0; n < len * SR; n++) {
    const s = n / SR;
    const f = (long ? 38 : 46) + 120 * Math.exp(-s * 30);
    ph += f / SR;
    const amp = Math.exp(-s * (long ? 2.6 : 7.5));
    let x = Math.sin(TAU * ph) * amp + noise() * Math.exp(-s * 450) * 0.35;
    x = Math.tanh(x * 1.6) * 0.62 * gain;
    x = lp.run(x);
    put(B.drums, idx(t) + n, x, x);
  }
}

function clap(t, { gain = 1 } = {}) {
  const bp = new Biquad().set("bp", 1250, 0.9);
  const bp2 = new Biquad().set("bp", 1180, 0.9);
  for (let n = 0; n < 0.32 * SR; n++) {
    const s = n / SR;
    let env = Math.exp(-s * 22) * 0.55;
    for (const o of [0, 0.011, 0.022]) if (s >= o) env += Math.exp(-(s - o) * 240);
    const l = bp.run(noise()) * env * 0.5 * gain;
    const r = bp2.run(noise()) * env * 0.5 * gain;
    put(B.drums, idx(t) + n, l, r, 0.35);
  }
}

function hat(t, { open = false, gain = 1, pan = 0 } = {}) {
  const hp = new Biquad().set("hp", open ? 5500 : 6500, 0.8);
  const len = open ? 0.26 : 0.05;
  for (let n = 0; n < len * SR; n++) {
    const s = n / SR;
    const x = hp.run(noise()) * Math.exp(-s * (open ? 14 : 75)) * 0.22 * gain;
    put(B.drums, idx(t) + n, x * (1 - pan), x * (1 + pan));
  }
}

function snare(t, { gain = 1 } = {}) {
  const bp = new Biquad().set("bp", 1800, 0.7);
  let ph = 0;
  for (let n = 0; n < 0.2 * SR; n++) {
    const s = n / SR;
    ph += (190 + 60 * Math.exp(-s * 40)) / SR;
    const x = (bp.run(noise()) * Math.exp(-s * 26) * 0.55 + Math.sin(TAU * ph) * Math.exp(-s * 30) * 0.35) * gain;
    put(B.drums, idx(t) + n, x, x, 0.2);
  }
}

function tick(t, { gain = 1 } = {}) {
  // Uhr / Holzblock
  let ph = 0;
  const hp = new Biquad().set("hp", 900);
  for (let n = 0; n < 0.05 * SR; n++) {
    const s = n / SR;
    ph += 1650 / SR;
    const x = hp.run(Math.sin(TAU * ph) * Math.exp(-s * 140) + noise() * Math.exp(-s * 600) * 0.4) * 0.16 * gain;
    put(B.drums, idx(t) + n, x * 0.8, x * 1.1);
  }
}

function bassNote(t, dur, m, { gain = 1, cutoff = 700 } = {}) {
  const f = mtof(m);
  const lp = new Biquad();
  let p1 = 0;
  let p2 = 0;
  const len = dur + 0.03;
  for (let n = 0; n < len * SR; n++) {
    const s = n / SR;
    if (n % 32 === 0) lp.set("lp", cutoff * (0.55 + 0.9 * Math.exp(-s * 9)), 0.9);
    p1 = (p1 + f / SR) % 1;
    p2 = (p2 + f / 2 / SR) % 1;
    const saw = 2 * p1 - 1 - polyblep(p1, f / SR);
    let x = lp.run(saw * 0.55) + Math.sin(TAU * p2) * 0.45;
    const env = Math.min(1, s / 0.004) * (s > dur ? Math.max(0, 1 - (s - dur) / 0.03) : 1);
    x = Math.tanh(x * 1.3) * env * 0.42 * gain;
    put(B.bass, idx(t) + n, x, x);
  }
}

function sawVoices(t, len, m, detunes, envFn, filterFn, out, { gain = 1, send = 0, spread = 0.6 } = {}) {
  const voices = detunes.map((cents, k) => ({
    f: mtof(m) * Math.pow(2, cents / 1200),
    p: rnd(),
    pan: detunes.length === 1 ? 0 : (k / (detunes.length - 1)) * 2 - 1,
  }));
  const lpL = new Biquad();
  const lpR = new Biquad();
  for (let n = 0; n < len * SR; n++) {
    const s = n / SR;
    if (n % 32 === 0) {
      const fc = filterFn(s);
      lpL.set("lp", fc, 0.8);
      lpR.set("lp", fc, 0.8);
    }
    let l = 0;
    let r = 0;
    for (const v of voices) {
      v.p = (v.p + v.f / SR) % 1;
      const x = 2 * v.p - 1 - polyblep(v.p, v.f / SR);
      l += x * (1 - v.pan * spread);
      r += x * (1 + v.pan * spread);
    }
    const env = envFn(s) * gain / voices.length;
    put(out, idx(t) + n, lpL.run(l) * env, lpR.run(r) * env, send);
  }
}

function pluck(t, notes, { gain = 1, bright = 1, decay = 0.32 } = {}) {
  for (const m of notes) {
    sawVoices(
      t,
      decay * 2.2,
      m,
      [-9, 0, 9],
      (s) => Math.min(1, s / 0.003) * Math.exp(-s / decay),
      (s) => 900 + 5200 * bright * Math.exp(-s * 12),
      B.keys,
      { gain: gain * 0.14, send: 0.3 },
    );
  }
}

function pad(t, dur, notes, { gain = 1, cutoff = 1600, attack = 0.5, release = 0.8, cutoffEnd = null } = {}) {
  for (const m of notes) {
    sawVoices(
      t,
      dur + release,
      m,
      [-7, -2, 3, 8],
      (s) => Math.min(1, s / attack) * (s > dur ? Math.max(0, 1 - (s - dur) / release) : 1),
      (s) => (cutoffEnd ? cutoff + (cutoffEnd - cutoff) * Math.min(1, s / dur) : cutoff),
      B.pad,
      { gain: gain * 0.075, send: 0.45, spread: 0.9 },
    );
  }
}

function lead(t, dur, m, { gain = 1 } = {}) {
  const f0 = mtof(m);
  const lp = new Biquad();
  let p1 = rnd();
  let p2 = rnd();
  const len = dur + 0.12;
  for (let n = 0; n < len * SR; n++) {
    const s = n / SR;
    if (n % 32 === 0) lp.set("lp", 1400 + 3800 * Math.exp(-s * 10), 1.1);
    const vib = 1 + 0.004 * Math.sin(TAU * 5.5 * s) * Math.min(1, s / 0.25);
    p1 = (p1 + (f0 * vib) / SR) % 1;
    p2 = (p2 + (f0 * vib * 1.003) / SR) % 1;
    const saw = 2 * p1 - 1 - polyblep(p1, f0 / SR);
    const sq = (p2 < 0.5 ? 1 : -1) + polyblep(p2, f0 / SR) - polyblep((p2 + 0.5) % 1, f0 / SR);
    const env = Math.min(1, s / 0.004) * (0.55 + 0.45 * Math.exp(-s * 6)) * (s > dur ? Math.max(0, 1 - (s - dur) / 0.12) : 1);
    const x = lp.run(saw * 0.6 + sq * 0.4) * env * 0.11 * gain;
    put(B.lead, idx(t) + n, x * 0.92, x * 1.08, 0.3);
  }
}

function keysPiano(t, notes, { gain = 1, len = 2.2 } = {}) {
  for (const m of notes) {
    const f = mtof(m);
    const parts = [1, 2, 3, 4, 5, 6].map((h, k) => ({ h, a: [1, 0.45, 0.25, 0.14, 0.07, 0.04][k], p: rnd() }));
    for (let n = 0; n < len * SR; n++) {
      const s = n / SR;
      let x = 0;
      for (const q of parts) {
        q.p = (q.p + (f * q.h * (1 + 0.0004 * q.h * q.h)) / SR) % 1;
        x += Math.sin(TAU * q.p) * q.a * Math.exp(-s * (1.6 + q.h * 0.9));
      }
      x *= Math.min(1, s / 0.004) * 0.075 * gain;
      const pan = ((m % 12) / 12 - 0.5) * 0.5;
      put(B.keys, idx(t) + n, x * (1 - pan), x * (1 + pan), 0.4);
    }
  }
}

function bell(t, m, { gain = 1, len = 1.4, send = 0.5 } = {}) {
  const f = mtof(m);
  let p1 = 0;
  let p2 = 0;
  let p3 = 0;
  for (let n = 0; n < len * SR; n++) {
    const s = n / SR;
    p1 += f / SR;
    p2 += (f * 2.76) / SR;
    p3 += (f * 5.4) / SR;
    const x =
      (Math.sin(TAU * p1) * Math.exp(-s * 3.2) + Math.sin(TAU * p2) * 0.35 * Math.exp(-s * 6) + Math.sin(TAU * p3) * 0.12 * Math.exp(-s * 11)) *
      Math.min(1, s / 0.002) *
      0.12 *
      gain;
    put(B.fx, idx(t) + n, x * 0.95, x * 1.05, send);
  }
}

function noiseSweep(t, len, f0, f1, { gain = 1, q = 1.2, shape = (p) => Math.sin(Math.PI * p), panFrom = -0.6, panTo = 0.6, out = B.fx, send = 0.25 } = {}) {
  const bp = new Biquad();
  for (let n = 0; n < len * SR; n++) {
    const p = n / (len * SR);
    if (n % 32 === 0) bp.set("bp", f0 * Math.pow(f1 / f0, p), q);
    const x = bp.run(noise()) * shape(p) * 0.5 * gain;
    const pan = panFrom + (panTo - panFrom) * p;
    put(out, idx(t) + n, x * (1 - pan), x * (1 + pan), send);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Geräusche aus dem Drehbuch
// ---------------------------------------------------------------------------------------------------------------
const SFX = {
  brummen(t) {
    let ph = 0;
    const lp = new Biquad().set("lp", 900);
    for (let n = 0; n < 0.24 * SR; n++) {
      const s = n / SR;
      ph += 150 / SR;
      const am = 0.6 + 0.4 * Math.sin(TAU * 26 * s);
      const env = Math.min(1, s / 0.01) * Math.min(1, (0.24 - s) / 0.03);
      const x = lp.run(Math.tanh(3 * Math.sin(TAU * ph))) * am * env * 0.2;
      put(B.fx, idx(t) + n, x, x);
    }
  },
  plopp(t) {
    let ph = 0;
    for (let n = 0; n < 0.09 * SR; n++) {
      const s = n / SR;
      ph += (620 + 520 * Math.min(1, s / 0.035)) / SR;
      const x = Math.sin(TAU * ph) * Math.exp(-s * 38) * 0.14;
      put(B.fx, idx(t) + n, x, x, 0.15);
    }
  },
  schlag(t) {
    let ph = 0;
    const lp = new Biquad().set("lp", 1400);
    for (let n = 0; n < 0.6 * SR; n++) {
      const s = n / SR;
      ph += (58 + 70 * Math.exp(-s * 18)) / SR;
      const x = (Math.sin(TAU * ph) * Math.exp(-s * 5.5) * 0.55 + lp.run(noise()) * Math.exp(-s * 30) * 0.25) * 0.8;
      put(B.fx, idx(t) + n, x, x, 0.35);
    }
  },
  tippen(t) {
    const bp = new Biquad().set("bp", 4200, 1.5);
    for (let n = 0; n < 0.012 * SR; n++) {
      const s = n / SR;
      const x = bp.run(noise()) * Math.exp(-s * 520) * 0.22;
      put(B.fx, idx(t) + n, x * 0.9, x);
    }
  },
  wusch(t, { lang = 0.42 } = {}) {
    noiseSweep(t - lang * 0.55, lang, 350, 3800, { gain: 0.55, q: 0.9, shape: (p) => Math.pow(Math.sin(Math.PI * p), 1.5) });
  },
  aufprall(t) {
    kick(t, { gain: 1.1, long: true });
    const hp = new Biquad().set("hp", 2500);
    const hp2 = new Biquad().set("hp", 2600);
    for (let n = 0; n < 1.8 * SR; n++) {
      const s = n / SR;
      const env = Math.exp(-s * 2.2) * 0.13;
      put(B.fx, idx(t) + n, hp.run(noise()) * env, hp2.run(noise()) * env, 0.3);
    }
  },
  glanz(t) {
    [84, 88, 91, 96].forEach((m, k) => bell(t + k * 0.06, m, { gain: 0.55 - k * 0.07, len: 1.6, send: 0.6 }));
  },
  auf(t) {
    noiseSweep(t - 0.25, 0.4, 250, 1600, { gain: 0.35, q: 0.7 });
  },
  karte(t) {
    let ph = 0;
    for (let n = 0; n < 0.08 * SR; n++) {
      const s = n / SR;
      ph += (440 + 300 * Math.min(1, s / 0.04)) / SR;
      const x = Math.sin(TAU * ph) * Math.exp(-s * 45) * 0.09;
      put(B.fx, idx(t) + n, x, x, 0.2);
    }
  },
  klick(t) {
    const bp = new Biquad().set("bp", 2600, 1.2);
    for (let n = 0; n < 0.05 * SR; n++) {
      const s = n / SR;
      const x = bp.run(noise()) * (Math.exp(-s * 900) + (s > 0.045 ? 0 : 0)) * 0.5;
      put(B.fx, idx(t) + n, x, x);
    }
    const bp2 = new Biquad().set("bp", 2200, 1.2);
    for (let n = 0; n < 0.02 * SR; n++) {
      const s = n / SR;
      const x = bp2.run(noise()) * Math.exp(-s * 1100) * 0.3;
      put(B.fx, idx(t + 0.075) + n, x, x);
    }
  },
  erfolg(t) {
    bell(t, 76, { gain: 0.75, len: 0.9, send: 0.35 });
    bell(t + 0.1, 83, { gain: 0.7, len: 1.1, send: 0.35 });
  },
  haken(t) {
    bell(t, 84, { gain: 0.6, len: 0.7, send: 0.3 });
    bell(t + 0.07, 91, { gain: 0.55, len: 0.9, send: 0.3 });
  },
  glocke(t) {
    bell(t, 81, { gain: 0.85, len: 1.2, send: 0.35 });
    bell(t + 0.13, 88, { gain: 0.75, len: 1.4, send: 0.35 });
  },
  tipp(t) {
    let ph = 0;
    for (let n = 0; n < 0.06 * SR; n++) {
      const s = n / SR;
      ph += (300 - 120 * Math.min(1, s / 0.03)) / SR;
      const x = (Math.sin(TAU * ph) * Math.exp(-s * 60) * 0.25 + noise() * Math.exp(-s * 700) * 0.08) * 0.9;
      put(B.fx, idx(t) + n, x, x);
    }
  },
  // Kurzspot: heller Lichtstreifen (zieht schnell nach oben, Glockenton am Ende)
  strich(t) {
    noiseSweep(t, 0.55, 900, 9000, { gain: 0.45, q: 2.2, shape: (p) => Math.sin(Math.PI * p) * (0.4 + 0.6 * p), panFrom: -0.5, panTo: 0.5, send: 0.35 });
    bell(t + 0.5, 91, { gain: 0.35, len: 0.9, send: 0.5 });
  },
  // Kurzspot: tiefer Aufschlag ohne Becken (App-Symbol)
  tief(t) {
    let ph = 0;
    for (let n = 0; n < 1.6 * SR; n++) {
      const s = n / SR;
      ph += (42 + 60 * Math.exp(-s * 9)) / SR;
      const x = Math.sin(TAU * ph) * Math.exp(-s * 2.4) * 0.7;
      put(B.fx, idx(t) + n, x, x, 0.2);
    }
  },
  // Kurzspot: Lichtschein am Ende (aufsteigendes Rauschen, Glockenakkord)
  schein(t) {
    noiseSweep(t - 0.3, 1.2, 400, 6000, { gain: 0.4, q: 0.9, shape: (p) => Math.sin(Math.PI * p) });
    [72, 76, 79, 84].forEach((m, k) => bell(t + 0.15 + k * 0.08, m, { gain: 0.45, len: 2.4, send: 0.7 }));
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Akkorde und Ablauf
// ---------------------------------------------------------------------------------------------------------------
const CH = {
  C: { bass: 36, keys: [60, 64, 67, 72], pad: [48, 55, 64, 67], piano: [48, 55, 60, 64, 67] },
  G: { bass: 43, keys: [59, 62, 67, 71], pad: [43, 50, 59, 62], piano: [43, 50, 59, 62, 67] },
  Am: { bass: 45, keys: [57, 60, 64, 69], pad: [45, 52, 60, 64], piano: [45, 52, 57, 60, 64] },
  F: { bass: 41, keys: [57, 60, 65, 69], pad: [41, 48, 57, 60], piano: [41, 48, 57, 60, 65] },
  E: { bass: 40, keys: [56, 59, 64, 68], pad: [40, 47, 56, 59], piano: [40, 47, 56, 59, 64] },
};

// Takte (Beginn in s, Akkord)
const TAKTE = [
  [0, "Am"], [2, "Am"], [4, "Am"], [6, "F"], [8, "E"],
  [10, "F"], [12, "G"],
  ...["C", "G", "Am", "F", "C", "G", "Am", "F", "C", "G", "Am", "F", "C", "G", "Am"].map((c, k) => [14 + k * 2, c]),
  [44, "F"], [46, "C"], [48, "G"], [50, "Am"], [52, "G"],
  [54, "C"], [56, "F"], [57, "G"], [58, "C"],
];
const taktEnde = (k) => (k + 1 < TAKTE.length ? TAKTE[k + 1][0] : D.DAUER);

// Melodie je Akkord (Schlag im Takt, Ton, Länge in Schlägen)
const MELODIE = {
  C: [[0, 76, 0.5], [0.5, 79, 0.5], [1.5, 81, 0.5], [2, 79, 1], [3.5, 76, 0.5]],
  G: [[0, 74, 0.5], [0.5, 79, 0.5], [1.5, 74, 0.5], [2, 71, 1.5]],
  Am: [[0, 72, 0.5], [0.5, 76, 0.5], [1.5, 81, 0.5], [2, 79, 1], [3.5, 76, 0.5]],
  F: [[0, 77, 0.5], [0.5, 76, 0.5], [1, 74, 0.5], [1.5, 72, 1.5], [3.5, 74, 0.5]],
};
const LEAD_ZEITEN = [[22, 29], [36, 44]];

const inRange = (t, ranges) => ranges.some(([a, b]) => t >= a - 1e-6 && t < b - 1e-6);

if (STUECK === "lang") TAKTE.forEach(([t0, name], k) => {
  const ch = CH[name];
  const t1 = taktEnde(k);
  const len = t1 - t0;
  const beats = Math.round(len / BEAT);

  if (t0 < 2) {
    // Haken: dunkler Teppich, Uhr
    pad(t0, len, ch.pad.slice(0, 3), { gain: 0.7, cutoff: 520, attack: 0.8 });
    for (let b = 0; b < beats; b++) tick(t0 + b * BEAT, { gain: 0.8 });
    return;
  }
  if (t0 < 10) {
    // Problem: gedämpfter Groove
    // gedämpft: leiser als der helle Teil, erst die Steigerung ab 8 s wird lauter
    const late = t0 >= 8;
    pad(t0, len, ch.pad, { gain: late ? 0.8 : 0.55, cutoff: late ? 650 : 520, cutoffEnd: late ? 2400 : null, attack: 0.3 });
    for (let b = 0; b < beats; b++) {
      const t = t0 + b * BEAT;
      if (t >= 3) kick(t, { gain: 0.62, muffled: true });
      tick(t, { gain: 0.5 });
      for (const e of [0, 0.5]) if (t + e * BEAT >= 3) bassNote(t + e * BEAT, BEAT * 0.42, ch.bass, { gain: 0.45, cutoff: 320 });
    }
    if (t0 >= 3) pluck(t0, ch.keys, { gain: 0.35, bright: 0.2, decay: 0.5 });
    else pluck(3, ch.keys, { gain: 0.35, bright: 0.2, decay: 0.5 });
    return;
  }
  if (t0 < 14) {
    // Hell: nach dem Aufprall erst Teppich und Zupfer, ab 12 s Schlagzeug
    pad(t0, len, ch.pad, { gain: 1, cutoff: 2600, attack: 0.15 });
    const pattern = [0, 0.75, 1.5, 2.5, 3, 3.5];
    for (const p of pattern) pluck(t0 + p * BEAT, ch.keys, { gain: t0 < 12 ? 0.7 : 0.9, bright: 0.8 });
    if (t0 >= 12) {
      for (let b = 0; b < 4; b++) {
        kick(t0 + b * BEAT, { gain: 0.9 });
        hat(t0 + b * BEAT + BEAT / 2, { open: true, gain: 0.7 });
      }
      for (let b = 0; b < 8; b++) bassNote(t0 + b * BEAT / 2, BEAT * 0.4, ch.bass, { gain: 0.9 });
      // Wirbel vor dem Eintauchen in den Laptop
      for (let s = 0; s < 8; s++) snare(t0 + 1 + s * BEAT / 4, { gain: 0.25 + s * 0.07 });
    }
    return;
  }
  if (t0 < 44) {
    // Voller Groove
    pad(t0, len, ch.pad, { gain: 0.75, cutoff: 2200, attack: 0.1 });
    const pattern = [0, 0.75, 1.5, 2.5, 3, 3.5];
    for (const p of pattern) pluck(t0 + p * BEAT, ch.keys, { gain: 0.95, bright: 1 });
    for (let b = 0; b < beats; b++) {
      const t = t0 + b * BEAT;
      kick(t);
      if (b % 2 === 1) clap(t, { gain: 0.9 });
      hat(t + BEAT / 2, { open: true, gain: 0.6, pan: 0.2 });
      for (const s of [0.25, 0.75]) hat(t + s * BEAT, { gain: 0.55, pan: -0.25 });
      for (const e of [0, 0.5]) bassNote(t + e * BEAT, BEAT * 0.42, ch.bass + (e === 0.5 && b % 2 ? 12 : 0), { gain: 1 });
    }
    if (inRange(t0, LEAD_ZEITEN) && MELODIE[name]) for (const [b, m, d] of MELODIE[name]) lead(t0 + b * BEAT, d * BEAT * 0.9, m);
    return;
  }
  if (t0 < 52) {
    // Ruhiger Teil: Klavier, Teppich, leichter Halbtakt
    pad(t0, len, ch.pad, { gain: 0.85, cutoff: 1500, attack: 0.6 });
    keysPiano(t0, ch.piano, { gain: 1, len: 2.4 });
    keysPiano(t0 + 1.5 * BEAT, ch.piano.slice(2), { gain: 0.55, len: 1.6 });
    bassNote(t0, len - 0.05, ch.bass, { gain: 0.55, cutoff: 260 });
    for (let b = 0; b < beats; b++) {
      hat(t0 + b * BEAT, { gain: 0.35 });
      hat(t0 + b * BEAT + BEAT / 2, { gain: 0.22 });
    }
    if (t0 >= 48) {
      kick(t0, { gain: 0.6 });
      kick(t0 + 2 * BEAT, { gain: 0.6 });
      clap(t0 + 1 * BEAT, { gain: 0.45 });
      clap(t0 + 3 * BEAT, { gain: 0.45 });
    }
    return;
  }
  if (t0 < 54) {
    // Steigerung zum Schluss
    pad(t0, len, ch.pad, { gain: 0.95, cutoff: 900, cutoffEnd: 4200, attack: 0.2 });
    for (let s = 0; s < 16; s++) snare(t0 + s * BEAT / 4, { gain: 0.2 + s * 0.035 });
    for (let b = 0; b < 4; b++) kick(t0 + b * BEAT, { gain: 0.7 + b * 0.08 });
    for (let e = 0; e < 8; e++) bassNote(t0 + e * BEAT / 2, BEAT * 0.4, ch.bass, { gain: 0.75 });
    noiseSweep(t0, 2, 300, 7000, { gain: 0.5, q: 1.4, shape: (p) => p * p });
    return;
  }
  // Schluss
  const final = t0 >= 58;
  pad(t0, final ? 1.6 : len, ch.pad, { gain: final ? 1.1 : 0.85, cutoff: 2600, attack: 0.05, release: final ? 0.5 : 0.3 });
  if (final) {
    pluck(t0, ch.keys, { gain: 1, bright: 1, decay: 0.6 });
    keysPiano(t0, ch.piano, { gain: 1.1, len: 1.95 });
    bassNote(t0, 1.5, ch.bass, { gain: 0.9 });
    kick(t0, { gain: 1 });
    clap(t0, { gain: 0.6 });
    return;
  }
  for (const p of [0, 0.75, 1.5, 2.5, 3, 3.5].filter((p) => p * BEAT < len)) pluck(t0 + p * BEAT, ch.keys, { gain: 0.95, bright: 1 });
  for (let b = 0; b < beats; b++) {
    const t = t0 + b * BEAT;
    kick(t);
    if ((Math.round((t - 54) / BEAT)) % 2 === 1) clap(t, { gain: 0.9 });
    hat(t + BEAT / 2, { open: true, gain: 0.6 });
    for (const e of [0, 0.5]) bassNote(t + e * BEAT, BEAT * 0.42, ch.bass, { gain: 1 });
  }
  if (MELODIE[name] && t0 === 54) for (const [b, m, d] of MELODIE.C) lead(t0 + b * BEAT, d * BEAT * 0.9, m, { gain: 0.9 });
});

// Steigerung vor dem Wisch (8–10 s): Wirbel und Rauschen
if (STUECK === "lang") {
  for (let k = 0; k < 4; k++) snare(8 + k * BEAT, { gain: 0.25 });
  for (let k = 0; k < 8; k++) snare(9 + k * BEAT / 4, { gain: 0.3 + k * 0.05 });
  noiseSweep(7.9, 2.1, 250, 6500, { gain: 0.6, q: 1.3, shape: (p) => p * p * (p < 0.97 ? 1 : (1 - p) / 0.03) });
} else arrangeNacht();

/**
 * Kurzspot (22,5 s): dunkler Teppich, der mit dem Logo aufgeht; Groove ab dem Handy (2,5 s, auf einer Eins);
 * Schläge auf „Mitglieder. Beiträge. Termine.“; Steigerung zu „Alles in einem Flow.“; Logo auf C; Schein klingt aus.
 */
function arrangeNacht() {
  pad(0.0, 2.5, CH.Am.pad, { gain: 0.9, cutoff: 500, cutoffEnd: 2600, attack: 0.6, release: 0.3 });
  noiseSweep(1.4, 1.1, 300, 7000, { gain: 0.45, q: 1.2, shape: (p) => p * p });
  for (const [t0, t1, name] of [[2.5, 4.5, "Am"], [4.5, 6.5, "F"], [6.5, 8.5, "C"], [8.5, 10.5, "G"], [10.5, 12.5, "Am"], [12.5, 13.85, "F"]]) {
    const ch = CH[name];
    const beats = Math.round((t1 - t0) / BEAT);
    pad(t0, t1 - t0, ch.pad, { gain: 0.7, cutoff: 2200, attack: 0.08 });
    for (const p of [0, 0.75, 1.5, 2.5, 3, 3.5]) if (t0 + p * BEAT < t1) pluck(t0 + p * BEAT, ch.keys, { gain: 0.9, bright: 1 });
    for (let b = 0; b < beats; b++) {
      const t = t0 + b * BEAT;
      kick(t);
      if (b % 2 === 1) clap(t, { gain: 0.85 });
      hat(t + BEAT / 2, { open: true, gain: 0.55, pan: 0.2 });
      for (const s of [0.25, 0.75]) hat(t + s * BEAT, { gain: 0.5, pan: -0.25 });
      for (const e of [0, 0.5]) bassNote(t + e * BEAT, BEAT * 0.42, ch.bass + (e === 0.5 && b % 2 ? 12 : 0), { gain: 1 });
    }
    if (t0 >= 8.5 && MELODIE[name]) for (const [b, m, d] of MELODIE[name]) if (t0 + b * BEAT < t1) lead(t0 + b * BEAT, d * BEAT * 0.9, m, { gain: 0.8 });
  }
  [[14.0, "Am"], [14.5, "F"], [15.0, "G"]].forEach(([t, name]) => {
    kick(t, { gain: 1 });
    clap(t, { gain: 0.6 });
    pluck(t, CH[name].keys, { gain: 1, bright: 1, decay: 0.5 });
    bassNote(t, 0.45, CH[name].bass, { gain: 1 });
  });
  pad(15.5, 1.5, CH.G.pad, { gain: 0.9, cutoff: 900, cutoffEnd: 4000, attack: 0.2, release: 0.1 });
  for (let k = 0; k < 8; k++) snare(16.0 + (k * BEAT) / 4, { gain: 0.2 + k * 0.06 });
  noiseSweep(15.6, 1.4, 300, 7000, { gain: 0.5, q: 1.4, shape: (p) => p * p });
  {
    const ch = CH.C;
    pad(17.0, 2.5, ch.pad, { gain: 0.9, cutoff: 2600, attack: 0.05, release: 0.4 });
    for (const p of [0, 0.75, 1.5, 2.5, 3, 3.5, 4, 4.75]) pluck(17.0 + p * BEAT, ch.keys, { gain: 0.85, bright: 1 });
    for (let b = 0; b < 5; b++) {
      const t = 17.0 + b * BEAT;
      kick(t, { gain: 0.9 });
      if (b % 2 === 1) clap(t, { gain: 0.7 });
      hat(t + BEAT / 2, { open: true, gain: 0.5 });
      bassNote(t, BEAT * 0.42, ch.bass, { gain: 0.9 });
      bassNote(t + BEAT / 2, BEAT * 0.42, ch.bass, { gain: 0.9 });
    }
    for (const [b, m, d] of MELODIE.C) lead(17.0 + b * BEAT, d * BEAT * 0.9, m, { gain: 0.8 });
  }
  pad(19.5, 2.6, CH.C.pad, { gain: 0.95, cutoff: 2000, attack: 0.3, release: 0.4 });
  keysPiano(19.5, CH.C.piano, { gain: 1, len: 3.0 });
  kick(19.5, { gain: 0.8 });
}

for (const g of D.GERAEUSCHE) SFX[g.art](g.t, g);

// ---------------------------------------------------------------------------------------------------------------
// Effekte und Mischung
// ---------------------------------------------------------------------------------------------------------------
function reverb(inL, inR, { room = 0.84, damp = 0.35, wet = 1 } = {}) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const alls = [556, 441, 341, 225];
  const scale = SR / 44100;
  const make = (spread) => ({
    c: combs.map((d) => ({ buf: new Float32Array(Math.round((d + spread) * scale)), i: 0, f: 0 })),
    a: alls.map((d) => ({ buf: new Float32Array(Math.round((d + spread) * scale)), i: 0 })),
  });
  const chans = [make(0), make(23)];
  const outL = new Float32Array(N);
  const outR = new Float32Array(N);
  const ins = [inL, inR];
  const outs = [outL, outR];
  for (let ch = 0; ch < 2; ch++) {
    const { c, a } = chans[ch];
    const x = ins[ch];
    const y = outs[ch];
    for (let n = 0; n < N; n++) {
      const input = x[n] * 0.015;
      let s = 0;
      for (const cb of c) {
        const out = cb.buf[cb.i];
        cb.f = out * (1 - damp) + cb.f * damp;
        cb.buf[cb.i] = input + cb.f * room;
        cb.i = (cb.i + 1) % cb.buf.length;
        s += out;
      }
      for (const ap of a) {
        const b = ap.buf[ap.i];
        const o = -s + b;
        ap.buf[ap.i] = s + b * 0.5;
        ap.i = (ap.i + 1) % ap.buf.length;
        s = o;
      }
      y[n] = s * wet;
    }
  }
  return [outL, outR];
}

function delay(b, seconds, feedback, mix) {
  const d = Math.round(seconds * SR);
  for (let n = d; n < N; n++) {
    // Ping-Pong
    const l = b.L[n - d] * feedback;
    const r = b.R[n - d] * feedback;
    b.L[n] += r * mix;
    b.R[n] += l * mix;
  }
}

// Pumpen: Bass, Zupfer, Teppich werden bei jedem Kick kurz leiser
const duck = new Float32Array(N).fill(1);
for (const t of kicks) {
  const i0 = idx(t);
  for (let n = 0; n < 0.24 * SR; n++) {
    const s = n / SR;
    const g = 1 - 0.55 * (1 - Math.min(1, s / 0.2) ** 2);
    if (i0 + n < N) duck[i0 + n] = Math.min(duck[i0 + n], g);
  }
}
for (const b of [B.bass, B.keys, B.pad]) for (let n = 0; n < N; n++) {
  b.L[n] *= duck[n];
  b.R[n] *= duck[n];
}

delay(B.lead, BEAT * 0.75, 0.38, 0.6);
const [revL, revR] = reverb(B.send.L, B.send.R);

const music = bus();
const LEVEL = { drums: 1, bass: 0.8, keys: 1.05, pad: 0.9, lead: 0.85, fx: 1 };
for (let n = 0; n < N; n++) {
  let l = revL[n] * 0.9;
  let r = revR[n] * 0.9;
  for (const [k, g] of Object.entries(LEVEL)) {
    l += B[k].L[n] * g;
    r += B[k].R[n] * g;
  }
  music.L[n] = l;
  music.R[n] = r;
}

// Sprecher laden
function readWav(file) {
  const buf = fs.readFileSync(file);
  let p = 12;
  let fmt = null;
  while (p < buf.length) {
    const id = buf.toString("ascii", p, p + 4);
    const size = buf.readUInt32LE(p + 4);
    if (id === "fmt ") fmt = { ch: buf.readUInt16LE(p + 10), rate: buf.readUInt32LE(p + 12), bits: buf.readUInt16LE(p + 22) };
    if (id === "data") {
      const frames = size / (fmt.ch * 2);
      const out = new Float32Array(frames);
      for (let i = 0; i < frames; i++) out[i] = buf.readInt16LE(p + 8 + i * fmt.ch * 2) / 32768;
      if (fmt.rate !== SR) throw new Error(`${file}: ${fmt.rate} Hz statt ${SR}`);
      return out;
    }
    p += 8 + size + (size % 2);
  }
  throw new Error(`${file}: keine Daten`);
}

const voice = new Float32Array(N);
const vo = D.SPRECHER.map((s) => ({ ...s, samples: readWav(path.join(tonDir, "sprecher", `${s.id}.wav`)) }));
let voPeak = 0;
for (const s of vo) for (const x of s.samples) voPeak = Math.max(voPeak, Math.abs(x));
for (const s of vo) {
  const i0 = idx(s.start);
  for (let i = 0; i < s.samples.length && i0 + i < N; i++) voice[i0 + i] += (s.samples[i] / voPeak) * 0.82;
}

// Musik leiser, solange gesprochen wird (weich ein- und ausblenden)
const voDuck = new Float32Array(N).fill(1);
for (const s of vo) {
  const a = s.start - 0.12;
  const b = s.start + s.samples.length / SR + 0.05;
  for (let n = Math.max(0, idx(a - 0.15)); n < Math.min(N, idx(b + 0.35)); n++) {
    const t = n / SR;
    let g = 1;
    if (t < a) g = 1 - 0.55 * ((t - (a - 0.15)) / 0.15);
    else if (t <= b) g = 0.45;
    else g = 0.45 + 0.55 * ((t - b) / 0.35);
    voDuck[n] = Math.min(voDuck[n], clamp(g, 0.45, 1));
  }
}

function normalizePeak(L, R, target) {
  let peak = 0;
  for (let n = 0; n < N; n++) peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
  const g = target / (peak || 1);
  for (let n = 0; n < N; n++) {
    L[n] *= g;
    R[n] *= g;
  }
  return g;
}

// Klang: Höhen etwas anheben (Präsenz am Handy-Lautsprecher), tiefsten Bass etwas absenken
{
  const hpL = new Biquad().set("hp", 2800, 0.7);
  const hpR = new Biquad().set("hp", 2800, 0.7);
  const lpL = new Biquad().set("lp", 110, 0.7);
  const lpR = new Biquad().set("lp", 110, 0.7);
  for (let n = 0; n < N; n++) {
    const l = music.L[n];
    const r = music.R[n];
    music.L[n] = l + 0.45 * hpL.run(l) - 0.3 * lpL.run(l);
    music.R[n] = r + 0.45 * hpR.run(r) - 0.3 * lpR.run(r);
  }
}
// Musik in sich ausgleichen: weich begrenzen, dann auf Pegel bringen
for (let n = 0; n < N; n++) {
  music.L[n] = Math.tanh(music.L[n] * 1.2) / 1.2;
  music.R[n] = Math.tanh(music.R[n] * 1.2) / 1.2;
}
normalizePeak(music.L, music.R, 0.7);
// Ende: die letzten 0,4 s ausblenden
for (let n = idx(D.DAUER - 0.45); n < N; n++) {
  const g = Math.max(0, (N - n) / (0.45 * SR));
  music.L[n] *= g;
  music.R[n] *= g;
}

function writeWav(file, L, R) {
  const data = Buffer.alloc(N * 4);
  for (let n = 0; n < N; n++) {
    data.writeInt16LE(Math.round(clamp(L[n], -1, 1) * 32767), n * 4);
    data.writeInt16LE(Math.round(clamp(R[n], -1, 1) * 32767), n * 4 + 2);
  }
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(2, 22);
  h.writeUInt32LE(SR, 24);
  h.writeUInt32LE(SR * 4, 28);
  h.writeUInt16LE(4, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, data]));
}

writeWav(path.join(tonDir, `musik${SUFFIX}.wav`), music.L, music.R);

const mixL = new Float32Array(N);
const mixR = new Float32Array(N);
for (let n = 0; n < N; n++) {
  mixL[n] = music.L[n] * voDuck[n] + voice[n];
  mixR[n] = music.R[n] * voDuck[n] + voice[n];
  // sanfter Begrenzer
  mixL[n] = Math.tanh(mixL[n] * 1.05);
  mixR[n] = Math.tanh(mixR[n] * 1.05);
}
normalizePeak(mixL, mixR, 0.93);
writeWav(path.join(tonDir, `mischung${SUFFIX}.wav`), mixL, mixR);

let rms = 0;
for (let n = 0; n < N; n++) rms += mixL[n] * mixL[n] + mixR[n] * mixR[n];
rms = Math.sqrt(rms / (2 * N));
console.log(`✔ ausgabe/ton/musik${SUFFIX}.wav, ausgabe/ton/mischung${SUFFIX}.wav (RMS ${(20 * Math.log10(rms)).toFixed(1)} dBFS)`);
