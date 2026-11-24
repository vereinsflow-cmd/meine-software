/**
 * Helfer der Neon-Bausteine: Zeitquelle, Kurven, Hash, Pfad-Abtastung, Tippen, Cursor.
 * Alles deterministisch aus dem Frame (kein Math.random, keine Zeitgeber).
 */
import { useAbsFrame } from "../lib/scene";

/** Frame aus der Prop (absoluter Frame der Szene) oder – ohne Prop – der absolute Film-Frame (stimmt auch im Prüfbogen/ShowFrame). */
export const useF = (frame?: number) => {
  const cur = useAbsFrame();
  return frame ?? cur;
};

export const FPS = 30;

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const clamp01 = (v: number) => clamp(v, 0, 1);
/** lineare Mischung a → b (Achtung: andere Reihenfolge als mix() in springs.ts) */
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 0..1, wo v zwischen a und b liegt (geklemmt) */
export const invLerp = (a: number, b: number, v: number) => (a === b ? (v >= b ? 1 : 0) : clamp01((v - a) / (b - a)));
export const smooth = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
export const smoothstep = (a: number, b: number, v: number) => smooth(invLerp(a, b, v));
export const easeOut = (t: number, p = 3) => 1 - Math.pow(1 - clamp01(t), p);
export const easeIn = (t: number, p = 3) => Math.pow(clamp01(t), p);
export const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOutExpo = (t: number) => {
  const x = clamp01(t);
  return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);
};
/** Zeitfenster: 0 vor `at`, 1 nach `at + dur`, dazwischen mit Kurve */
export const win = (f: number, at: number, dur: number, ease: (t: number) => number = easeInOut) => ease(invLerp(at, at + dur, f));
/** kurzer Impuls 0 → 1 → 0 (Anstieg `up` Frames, Abklingen `down` Frames) */
export const blip = (f: number, at: number, up = 3, down = 12) => {
  if (f < at) return 0;
  if (f < at + up) return smooth((f - at) / up);
  return Math.exp(-(f - at - up) / Math.max(1, down / 2.5));
};

/** deterministischer Hash 0..1 */
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
};

export type Pt = { x: number; y: number };

/** Punkt auf einer Catmull-Rom-Kurve durch `pts` (t 0..1 über die ganze Kurve). */
export const catmull = (pts: Pt[], t: number): Pt => {
  if (pts.length === 1) return pts[0];
  const n = pts.length - 1;
  const x = clamp01(t) * n;
  const i = Math.min(n - 1, Math.floor(x));
  const u = x - i;
  const p0 = pts[Math.max(0, i - 1)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(n, i + 2)];
  const u2 = u * u;
  const u3 = u2 * u;
  const c = (a: number, b: number, cc: number, d: number) => 0.5 * (2 * b + (-a + cc) * u + (2 * a - 5 * b + 4 * cc - d) * u2 + (-a + 3 * b - 3 * cc + d) * u3);
  return { x: c(p0.x, p1.x, p2.x, p3.x), y: c(p0.y, p1.y, p2.y, p3.y) };
};

/** Punkt und Tangente einer kubischen Bézierkurve. */
export const bezier = (p: [Pt, Pt, Pt, Pt], t: number): Pt => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p[0].x + b * p[1].x + c * p[2].x + d * p[3].x, y: a * p[0].y + b * p[1].y + c * p[2].y + d * p[3].y };
};
export const bezierTangent = (p: [Pt, Pt, Pt, Pt], t: number): Pt => {
  const u = 1 - t;
  const a = 3 * u * u;
  const b = 6 * u * t;
  const c = 3 * t * t;
  return {
    x: a * (p[1].x - p[0].x) + b * (p[2].x - p[1].x) + c * (p[3].x - p[2].x),
    y: a * (p[1].y - p[0].y) + b * (p[2].y - p[1].y) + c * (p[3].y - p[2].y),
  };
};

/**
 * Tippen wie ein Mensch: Zeichen pro Sekunde `cps`, leichte Unregelmäßigkeit, kurze Pausen nach Leerzeichen und Satzzeichen.
 * Liefert die getippte Zeichenzahl als Kommazahl (Ganzteil = sichtbare Zeichen, Rest = Fortschritt zum nächsten)
 * und den Frame des letzten Anschlags (für den Cursor).
 */
export const typing = (f: number, start: number, text: string, cps = 16, human = 0.45) => {
  const base = FPS / Math.max(1, cps);
  let t = start;
  let last = start;
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const prev = chars[i - 1] ?? "";
    let d = base * (1 + human * (hash(i * 3.17 + text.length) - 0.5) * 1.6);
    if (prev === " ") d *= 1.35;
    if (/[,.?!:;–]/.test(prev)) d *= 2.4;
    if (ch === " ") d *= 0.8;
    if (f < t + d) {
      const frac = clamp01((f - t) / d);
      return { count: i + frac, shown: f < start ? 0 : i, last: i === 0 ? start : last, done: false };
    }
    last = t + d;
    t += d;
  }
  return { count: chars.length, shown: chars.length, last, done: true };
};

/** Frame, an dem `typing()` mit denselben Werten fertig ist. */
export const typingEnd = (start: number, text: string, cps = 16, human = 0.45) => {
  const r = typing(1e9, start, text, cps, human);
  return r.last;
};

/**
 * Cursor-Deckkraft: beim Tippen fest an, danach weiches Blinken (Periode `period` Frames, kurze Rampen).
 */
export const cursorBlink = (f: number, lastKey: number, period = 30) => {
  const idle = f - lastKey;
  if (idle < 8) return 1;
  const ph = ((idle - 8) % period) / period;
  // an 0–0,5, aus 0,5–1; 2-Frame-Rampen
  const r = 2 / period;
  if (ph < 0.5 - r) return 1;
  if (ph < 0.5) return 1 - (ph - (0.5 - r)) / r;
  if (ph < 1 - r) return 0;
  return (ph - (1 - r)) / r;
};

/** Zufallszahl 0..1 aus Seed-Text (deterministisch). */
export const seeded = (seed: string) => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return hash((h >>> 0) / 4294967295 * 1000 + 0.123);
};
