/**
 * NeonBackground – fast schwarzer Nachtblau-Grund mit langsam ziehenden Lichtbändern, Bloom, Vignette, Korn, Bokeh.
 *
 * Die Bänder sind „Lichtseide“: je Band 40–60 feine Fäden entlang einer Bézier-Wirbelsäule, additiv gezeichnet (Canvas,
 * „lighter“). Eine Kante ist hell und scharf, die Fläche läuft weich aus. Das Band verdreht sich (Breite × cos) – wo es
 * hochkant steht, laufen alle Fäden zusammen und es entsteht der helle Knick wie in der Referenz (t00.75).
 * Bloom: drei weichgezeichnete, verkleinerte Kopien additiv darüber (enger Schein, Hof, weiter Dunst) – je weiter, desto
 * satter in Markenblau getönt, damit der Schein farbig leuchtet statt grau zu schleiern. Danach Tonwert der Lichter:
 * übersteuertes Blau läuft zu Eis-Weiß statt ins Cyan. Korn als overlay (hebt Schwarz nicht an).
 *
 *   ribbons    Helligkeit der Bänder 0..1 (BackgroundMood.ribbons)
 *   warm       Anteil Orange 0..1 (dünnes Akzentband + warme Partikel; BackgroundMood.warm)
 *   particles  Bokeh-Partikel 0..1 (BackgroundMood.particles)
 *   tint       Farbmischung der Bänder: 0 = tiefes Vereinsblau, 1 = heller Himmel
 *   layout     "drift" (Bänder am Rand, Mitte frei für Inhalt) | "hero" (große senkrechte Bänder, Opener t00.25) |
 *              "low" (Bänder im unteren Drittel, für Logo + Bodenlicht) | eigene RibbonSpec[]
 *   swooshAt   Frame eines schnellen Band-Wischers quer durchs Bild (mit Bewegungsunschärfe + kurzem Aufhellen)
 *
 * Zeichnet nur aus dem Frame (Prop `frame`, sonst useCurrentFrame) – jeder Frame ist reproduzierbar.
 */
import React, { useLayoutEffect, useRef } from "react";
import { AbsoluteFill } from "remotion";
import { H, W } from "../theme";
import { NEON, hexRgb, rgba } from "./palette";
import { Pt, bezier, bezierTangent, clamp01, easeInOut, hash, invLerp, lerp, seeded, smooth, useF } from "./util";

export type RibbonSpec = {
  /** 4 Kontrollpunkte in Bildanteilen (x 0..1 = 0..Breite, y 0..1 = 0..Höhe) */
  p: [number, number][];
  /** Drift je Kontrollpunkt in Bildanteilen */
  drift: [number, number][];
  /** Drift-Tempo (Schwingungen je 10 s) und Phase */
  speed: number;
  phase: number;
  /** Breite in px */
  width: number;
  /** Verdrehung: [Grundphase rad, Tempo rad/s, Windungen über die Länge] */
  twist: [number, number, number];
  strands: number;
  /** Helligkeit der Lichtkante / der Fläche */
  edge: number;
  body: number;
  tone: "blue" | "orange";
  alpha: number;
};

export type NeonBackgroundProps = {
  frame?: number;
  ribbons?: number;
  warm?: number;
  particles?: number;
  tint?: number;
  layout?: "drift" | "hero" | "low" | RibbonSpec[];
  /** Frame des Wischers (undefined = keiner) */
  swooshAt?: number;
  /** Dauer des Wischers in Frames */
  swooshDuration?: number;
  /** Richtung des Wischers */
  swooshDirection?: "up" | "down" | "left" | "right";
  /** Stärke des Wischers (Band, Aufhellen, Bloom-Zuschlag), Standard 1 */
  swooshGain?: number;
  /** Bloom-Stärke 0..1,5 */
  bloom?: number;
  vignette?: number;
  grain?: number;
  /** Grundfarbe aufhellen (z. B. beim Logo) 0..1 */
  lift?: number;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
};

// ---- Band-Layouts -------------------------------------------------------------------------
const LAYOUTS: Record<"drift" | "hero" | "low", RibbonSpec[]> = {
  drift: [
    // breites Band rechts, schräg nach unten
    { p: [[1.3, -0.05], [0.84, 0.3], [1.08, 0.58], [0.8, 1.12]], drift: [[0.03, 0.02], [0.06, 0.04], [0.05, 0.05], [0.05, 0.02]], speed: 0.9, phase: 0.3, width: 300, twist: [0.55, 0.32, 0.85], strands: 56, edge: 1, body: 0.6, tone: "blue", alpha: 0.85 },
    // tiefes, weiches Band unten
    { p: [[-0.32, 0.8], [0.22, 0.95], [0.62, 0.8], [1.32, 1.02]], drift: [[0.02, 0.03], [0.05, 0.03], [0.05, 0.04], [0.02, 0.02]], speed: 0.7, phase: 2.1, width: 360, twist: [2.0, -0.24, 0.65], strands: 52, edge: 0.8, body: 0.55, tone: "blue", alpha: 0.6 },
    // zartes Band links oben
    { p: [[-0.2, -0.06], [0.16, 0.18], [-0.04, 0.42], [0.22, 0.66]], drift: [[0.02, 0.02], [0.04, 0.03], [0.04, 0.04], [0.03, 0.03]], speed: 0.6, phase: 4.2, width: 200, twist: [1.1, 0.4, 1.1], strands: 40, edge: 0.7, body: 0.45, tone: "blue", alpha: 0.42 },
    // dünner oranger Akzent (unten, unter dem Inhalt)
    { p: [[-0.25, 0.86], [0.3, 0.9], [0.66, 0.8], [1.3, 0.9]], drift: [[0.02, 0.03], [0.04, 0.04], [0.04, 0.04], [0.02, 0.03]], speed: 1.1, phase: 1.4, width: 40, twist: [0.3, 0.6, 1.4], strands: 16, edge: 1, body: 0.35, tone: "orange", alpha: 0.5 },
  ],
  hero: [
    // dünne helle Linie (links)
    { p: [[0.5, -0.08], [0.47, 0.36], [0.41, 0.7], [0.16, 1.1]], drift: [[0.03, 0], [0.04, 0.02], [0.05, 0.02], [0.05, 0]], speed: 1.2, phase: 0.2, width: 64, twist: [1.4, 0.3, 0.4], strands: 30, edge: 1.2, body: 0.5, tone: "blue", alpha: 1 },
    // breites Band (rechts), helle Kante rechts
    { p: [[0.66, -0.08], [0.69, 0.3], [0.79, 0.66], [1.04, 1.1]], drift: [[0.03, 0], [0.05, 0.02], [0.05, 0.03], [0.05, 0]], speed: 1.0, phase: 1.6, width: 280, twist: [0.2, 0.22, 0.35], strands: 60, edge: 0.95, body: 0.8, tone: "blue", alpha: 1 },
    // Dunst
    { p: [[0.05, -0.1], [0.25, 0.3], [0.1, 0.7], [0.3, 1.1]], drift: [[0.03, 0], [0.04, 0.03], [0.04, 0.03], [0.03, 0]], speed: 0.6, phase: 3.0, width: 340, twist: [2.6, 0.2, 0.5], strands: 40, edge: 0.4, body: 0.35, tone: "blue", alpha: 0.4 },
    { p: [[0.9, -0.1], [0.6, 0.4], [0.95, 0.75], [0.7, 1.1]], drift: [[0.02, 0.01], [0.04, 0.04], [0.04, 0.04], [0.02, 0.01]], speed: 1.3, phase: 2.2, width: 40, twist: [0.4, 0.5, 1.2], strands: 16, edge: 1, body: 0.3, tone: "orange", alpha: 0.35 },
  ],
  low: [
    { p: [[-0.32, 0.88], [0.28, 0.74], [0.72, 0.94], [1.32, 0.8]], drift: [[0.02, 0.02], [0.05, 0.03], [0.05, 0.03], [0.02, 0.02]], speed: 0.7, phase: 0.8, width: 320, twist: [0.8, 0.3, 0.7], strands: 56, edge: 1, body: 0.55, tone: "blue", alpha: 0.9 },
    { p: [[-0.3, 1.02], [0.36, 0.9], [0.82, 1.04], [1.32, 0.9]], drift: [[0.02, 0.01], [0.04, 0.02], [0.04, 0.02], [0.02, 0.01]], speed: 0.6, phase: 2.6, width: 260, twist: [2.2, -0.26, 0.6], strands: 48, edge: 0.8, body: 0.5, tone: "blue", alpha: 0.7 },
    { p: [[-0.25, 0.83], [0.3, 0.86], [0.7, 0.8], [1.3, 0.87]], drift: [[0.02, 0.02], [0.04, 0.03], [0.04, 0.03], [0.02, 0.02]], speed: 1.0, phase: 1.1, width: 40, twist: [0.3, 0.6, 1.3], strands: 16, edge: 1, body: 0.3, tone: "orange", alpha: 0.5 },
  ],
};

// ---- Farben -------------------------------------------------------------------------------
type RGB = [number, number, number];
const BLUE_STOPS = (tint: number): RGB[] => {
  // tiefe Fläche → satte Fläche → Kante → Kern (tint schiebt alles Richtung Himmel)
  const t = clamp01(tint);
  const m = (a: string, b: string): RGB => {
    const pa = hexRgb(a);
    const pb = hexRgb(b);
    return [lerp(pa[0], pb[0], t), lerp(pa[1], pb[1], t), lerp(pa[2], pb[2], t)];
  };
  return [m("#1230B4", "#2350E4"), m("#2350E4", NEON.blue), m("#4F7FF5", NEON.sky), m("#B4C8FF", NEON.ice)];
};
const ORANGE_STOPS: RGB[] = [hexRgb("#C2471C"), hexRgb("#FF7A47"), hexRgb(NEON.orange), hexRgb("#FFD2BC")];

const colorAt = (stops: RGB[], u: number): RGB => {
  // u −1 … 1 → Stopps bei −1, 0,45, 0,86, 1 (nur die äußerste Kante wird hell)
  const pos = [-1, 0.45, 0.86, 1];
  for (let i = 0; i < pos.length - 1; i++) {
    if (u <= pos[i + 1]) {
      const k = invLerp(pos[i], pos[i + 1], u);
      return [lerp(stops[i][0], stops[i + 1][0], k), lerp(stops[i][1], stops[i + 1][1], k), lerp(stops[i][2], stops[i + 1][2], k)];
    }
  }
  return stops[stops.length - 1];
};

/**
 * Deckkraft je Faden quer über das Band (u −1 … 1, Lichtkante bei u = 1). Die Fläche wird zur Kante hin dichter
 * (wie das breite Band in t00.25), die Kante selbst ist ein schmaler, sehr heller Saum.
 */
const profile = (u: number, edge: number, body: number) =>
  body * 0.78 * (0.3 + 0.7 * Math.pow((u + 1) / 2, 1.3)) +
  edge * 0.5 * Math.exp(-Math.pow((1 - u) / 0.045, 2)) +
  edge * 0.26 * Math.exp(-Math.pow((1 - u) / 0.2, 2)) +
  edge * 0.12 * Math.exp(-Math.pow((1 + u) / 0.06, 2));

/**
 * Lichter wie Filmmaterial: übersteuertes Blau kippt beim additiven Zeichnen sonst ins Cyan (Blau voll, Grün läuft
 * nach, Rot bleibt zurück). Wo Blau gesättigt ist, zieht Rot zu Grün nach – heiße Stellen werden weiß-bläulich (Eis).
 */
const tonemapHighlights = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let touched = false;
  for (let i = 0; i < d.length; i += 4) {
    const b = d[i + 2];
    if (b < 200) continue;
    const g = d[i + 1];
    if (g < 90) continue;
    // je weiter Grün bei hellem Blau nachläuft, desto stärker Rot mitziehen (Himmel-Verhältnis R ≈ 0,88 · G)
    const x = Math.min(1, (g - 90) / 130) * Math.min(1, (b - 200) / 40);
    const k = x * x * (3 - 2 * x);
    const r = d[i];
    const tr = g * 0.88;
    if (tr > r) d[i] = r + (tr - r) * k;
    if (g > 238) d[i + 1] = g - (g - 238) * 0.5 * k;
    touched = true;
  }
  if (touched) ctx.putImageData(img, 0, 0);
};

// ---- Zeichnen -----------------------------------------------------------------------------
const SAMPLES = 46;

const drawRibbon = (
  ctx: CanvasRenderingContext2D,
  spec: RibbonSpec,
  t: number,
  w: number,
  h: number,
  gain: number,
  tint: number,
  offset: Pt = { x: 0, y: 0 },
  seed = 0,
) => {
  if (gain <= 0.002) return;
  const om = (2 * Math.PI * spec.speed) / 10;
  const cp = spec.p.map(([px, py], k) => {
    const [dx, dy] = spec.drift[k] ?? [0, 0];
    return {
      x: (px + offset.x + dx * Math.sin(om * t + spec.phase + k * 1.7)) * w,
      y: (py + offset.y + dy * Math.cos(om * 0.8 * t + spec.phase * 1.3 + k * 2.3)) * h,
    };
  }) as [Pt, Pt, Pt, Pt];

  const pts: Pt[] = [];
  const nrm: Pt[] = [];
  const wid: number[] = [];
  for (let k = 0; k <= SAMPLES; k++) {
    const s = k / SAMPLES;
    const P = bezier(cp, s);
    const T = bezierTangent(cp, s);
    const len = Math.hypot(T.x, T.y) || 1;
    pts.push(P);
    nrm.push({ x: -T.y / len, y: T.x / len });
    const tw = Math.cos(spec.twist[0] + spec.twist[1] * t + spec.twist[2] * s * Math.PI * 2);
    // nie ganz null, sonst verschwindet die Fläche im Knick
    wid.push(spec.width * (Math.abs(tw) < 0.07 ? 0.07 * Math.sign(tw || 1) : tw));
  }

  const stops = spec.tone === "orange" ? ORANGE_STOPS : BLUE_STOPS(tint);
  const n = spec.strands;
  const lw = Math.max(1.1, (spec.width / n) * 1.3);
  // Fäden überlappen sich um den Faktor 1,3 – so bleibt die Fläche unabhängig von der Fadenzahl gleich hell
  const density = 1 / 1.3;
  // Verlauf entlang der Sehne: Enden blenden aus
  const a0 = cp[0];
  const a1 = cp[3];
  for (let j = 0; j < n; j++) {
    const u = -1 + (2 * j) / (n - 1);
    // feine Seidenstruktur, aber kein Drahtgitter: Fäden streuen nur ±20 %, jeder 7. ist ein heller Glanzfaden
    const jit = (0.8 + 0.4 * hash(j * 7.31 + seed * 13.7 + spec.phase * 3.1)) * (j % 7 === 3 ? 1.35 : 1);
    const a = profile(u, spec.edge, spec.body) * jit * 0.95 * density * gain * spec.alpha;
    if (a < 0.003) continue;
    const [r, g, b] = colorAt(stops, u);
    const grad = ctx.createLinearGradient(a0.x, a0.y, a1.x, a1.y);
    const c = `${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}`;
    grad.addColorStop(0, `rgba(${c}, 0)`);
    grad.addColorStop(0.16, `rgba(${c}, ${Math.min(1, a).toFixed(4)})`);
    grad.addColorStop(0.84, `rgba(${c}, ${Math.min(1, a).toFixed(4)})`);
    grad.addColorStop(1, `rgba(${c}, 0)`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = u > 0.93 ? lw * 0.6 : lw;
    ctx.beginPath();
    for (let k = 0; k <= SAMPLES; k++) {
      const off = u * wid[k] * 0.5;
      const x = pts[k].x + nrm[k].x * off;
      const y = pts[k].y + nrm[k].y * off;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
};

/** Wischer: ein breites, schnell verdrehtes Band fliegt quer durchs Bild. */
const SWOOSH: RibbonSpec = {
  p: [[-0.1, 1.15], [0.2, 0.62], [0.82, 0.48], [1.12, -0.12]],
  drift: [[0, 0], [0, 0], [0, 0], [0, 0]],
  speed: 0,
  phase: 0.7,
  width: 420,
  twist: [0.4, 0, 1.15],
  strands: 48,
  edge: 1.25,
  body: 0.8,
  tone: "blue",
  alpha: 1,
};

const swooshOffset = (q: number, dir: "up" | "down" | "left" | "right"): Pt => {
  const d = lerp(1.25, -1.25, q);
  if (dir === "up") return { x: -d * 0.45, y: d };
  if (dir === "down") return { x: d * 0.45, y: -d };
  if (dir === "left") return { x: d, y: d * 0.2 };
  return { x: -d, y: -d * 0.2 };
};

/** Bokeh-Partikel (deterministisch aus Seeds). */
const drawParticles = (ctx: CanvasRenderingContext2D, t: number, w: number, h: number, amount: number, warm: number) => {
  const count = Math.round(64 * clamp01(amount));
  for (let i = 0; i < count; i++) {
    const rx = seeded(`np-x-${i}`);
    const ry = seeded(`np-y-${i}`);
    const depth = seeded(`np-d-${i}`); // 0 fern … 1 nah
    const near = depth > 0.82;
    const speed = (0.25 + depth * 0.9) * 9; // px/s nach oben
    const span = h + 240;
    const y = ((((ry * span - t * speed) % span) + span) % span) - 120;
    const x = rx * w + Math.sin(t * (0.25 + depth * 0.3) + i) * (10 + depth * 30);
    const tw = 0.55 + 0.45 * Math.sin(t * (1.1 + hash(i) * 1.7) + i * 2.3);
    const isWarm = seeded(`np-w-${i}`) < 0.08 + 0.42 * warm;
    const col = isWarm ? hexRgb(NEON.orange) : seeded(`np-c-${i}`) < 0.3 ? hexRgb(NEON.sky) : hexRgb(NEON.electric);
    const c = `${col[0]}, ${col[1]}, ${col[2]}`;
    if (near) {
      // große, weiche Bokeh-Scheibe mit leicht hellerem Rand
      const r = 26 + depth * 34;
      const a = (0.022 + 0.026 * tw) * amount;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${c}, ${(a * 0.7).toFixed(4)})`);
      g.addColorStop(0.72, `rgba(${c}, ${a.toFixed(4)})`);
      g.addColorStop(0.86, `rgba(${c}, ${(a * 0.55).toFixed(4)})`);
      g.addColorStop(1, `rgba(${c}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const r = 1.2 + depth * 3.2;
      const a = (0.25 + 0.55 * tw) * (0.35 + depth * 0.65) * amount;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
      g.addColorStop(0, `rgba(255, 255, 255, ${(a * 0.9).toFixed(4)})`);
      g.addColorStop(0.18, `rgba(${c}, ${(a * 0.8).toFixed(4)})`);
      g.addColorStop(1, `rgba(${c}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};

const ensure = (c: HTMLCanvasElement, w: number, h: number) => {
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
};

/**
 * Bloom-Stufe: verkleinerte, weichgezeichnete Kopie additiv darüber. `tint` färbt den Schein Richtung Markenblau
 * (source-atop: nur wo Licht ist) – sonst legt der Schein weißer Kanten einen grauen Schleier über die Fläche.
 */
const bloomPass = (main: HTMLCanvasElement, tmp: HTMLCanvasElement, w: number, h: number, scale: number, blur: number, strength: number, tint = 0, tintColor = "#2A5BEA") => {
  if (strength <= 0.001) return;
  const tw = Math.max(2, Math.round(w * scale));
  const th = Math.max(2, Math.round(h * scale));
  ensure(tmp, tw, th);
  const t = tmp.getContext("2d");
  const m = main.getContext("2d");
  if (!t || !m) return;
  t.save();
  t.clearRect(0, 0, tw, th);
  t.filter = `blur(${blur}px)`;
  t.imageSmoothingEnabled = true;
  t.imageSmoothingQuality = "high";
  t.drawImage(main, 0, 0, tw, th);
  t.restore();
  if (tint > 0.001) {
    t.save();
    t.globalCompositeOperation = "source-atop";
    t.fillStyle = rgba(tintColor, Math.min(1, tint));
    t.fillRect(0, 0, tw, th);
    t.restore();
  }
  m.save();
  m.globalCompositeOperation = "lighter";
  m.globalAlpha = Math.min(1, strength);
  m.imageSmoothingEnabled = true;
  m.imageSmoothingQuality = "high";
  m.drawImage(tmp, 0, 0, w, h);
  if (strength > 1) {
    m.globalAlpha = strength - 1;
    m.drawImage(tmp, 0, 0, w, h);
  }
  m.restore();
};

/** Swoosh-Fortschritt 0..1 (eased) zum Frame; null außerhalb. */
export const swooshProgress = (f: number, at: number | undefined, dur = 16) => {
  if (at === undefined || f < at - 1 || f > at + dur + 1) return null;
  return easeInOut(invLerp(at, at + dur, f));
};

export const NeonBackground: React.FC<NeonBackgroundProps> = ({
  frame,
  ribbons = 1,
  warm = 0,
  particles = 0.6,
  tint = 0.25,
  layout = "drift",
  swooshAt,
  swooshDuration = 16,
  swooshDirection = "up",
  swooshGain = 1,
  bloom = 1,
  vignette = 1,
  grain = 0.055,
  lift = 0,
  width = W,
  height = H,
  style,
}) => {
  const f = useF(frame);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tmpA = useRef<HTMLCanvasElement | null>(null);
  const tmpB = useRef<HTMLCanvasElement | null>(null);
  const t = f / 30;
  const specs = typeof layout === "string" ? LAYOUTS[layout] : layout;
  const q = swooshProgress(f, swooshAt, swooshDuration);
  // Aufhellen beim Wischer gedämpft (Gesamtprüfung: sonst milchig-weiß, Mittelwert > 90/255)
  const flash = q === null ? 0 : Math.sin(Math.PI * q) * 0.45 * swooshGain;

  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c) return;
    ensure(c, width, height);
    // CPU-Kontext: die Lichter werden pro Frame nachbearbeitet (getImageData), ohne Rücklesen von der GPU
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.save();
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const breathe = (i: number) => 0.85 + 0.15 * Math.sin(t * 0.7 + i * 1.9);
    specs.forEach((s, i) => {
      const accent = s.tone === "orange" ? (0.3 + 0.7 * clamp01(warm)) * (0.45 + 0.55 * Math.max(0, Math.sin(t * 0.45 + i))) : 1;
      drawRibbon(ctx, s, t, width, height, ribbons * breathe(i) * accent * (1 + flash * 0.4), tint, { x: 0, y: 0 }, i);
    });
    if (q !== null && swooshAt !== undefined) {
      // Bewegungsunschärfe: 16 Proben über einen halben Frame Belichtung (bei 8 waren die Proben als Streifen sichtbar)
      const N = 16;
      for (let k = 0; k < N; k++) {
        const fk = f - (k / N) * 0.6;
        const qk = easeInOut(invLerp(swooshAt, swooshAt + swooshDuration, fk));
        const env = Math.sin(Math.PI * clamp01(qk)) ** 0.6;
        const spec: RibbonSpec = { ...SWOOSH, twist: [SWOOSH.twist[0] + qk * 4.2, 0, SWOOSH.twist[2]] };
        drawRibbon(ctx, spec, t, width, height, (0.46 * swooshGain * env) / N * 2.2, tint, swooshOffset(qk, swooshDirection), 9);
      }
    }
    ctx.restore();
    if (!tmpA.current) tmpA.current = document.createElement("canvas");
    if (!tmpB.current) tmpB.current = document.createElement("canvas");
    // Zuschlag mit derselben Hüllkurve wie das Aufhellen – keine Stufe an den Rändern des Wischer-Fensters
    const b = bloom * clamp01(ribbons + (q === null ? 0 : Math.sin(Math.PI * q) * swooshGain));
    // enger Schein (Kante glüht), mittlerer Hof, schwacher weiter Dunst – zu viel Dunst macht den Grund grau
    // je weiter der Schein, desto satter blau (heller Kern bleibt hell, der Hof leuchtet farbig statt grau)
    bloomPass(c, tmpA.current, width, height, 0.5, 3, 0.85 * b, 0.25, NEON.blue);
    bloomPass(c, tmpB.current, width, height, 0.125, 5, 0.75 * b, 0.55, NEON.electric);
    bloomPass(c, tmpB.current, width, height, 0.0625, 7, 0.5 * b, 0.7, NEON.deep);
    tonemapHighlights(ctx, width, height);
    if (particles > 0.001) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      drawParticles(ctx, t, width, height, particles, warm);
      ctx.restore();
    }
  });

  // langsam wandernde Umgebungsflecken (CSS, billig)
  const ax = 18 + Math.sin(t * 0.21) * 6;
  const ay = 14 + Math.cos(t * 0.17) * 5;
  const bx = 82 + Math.sin(t * 0.15 + 2) * 6;
  const by = 86 + Math.cos(t * 0.19 + 1) * 4;
  const l = clamp01(lift);
  return (
    <AbsoluteFill style={{ width, height, overflow: "hidden", background: `linear-gradient(180deg, ${NEON.night} 0%, #03060F 58%, ${NEON.void} 100%)`, ...style }}>
      {/* Umgebungslicht: sattes Nachtblau, schwach – der Grund bleibt fast schwarz (Referenz: Licht nur aus den Elementen) */}
      <AbsoluteFill
        style={{
          backgroundImage: [
            `radial-gradient(60% 38% at ${ax}% ${ay}%, ${rgba("#0F2470", 0.3 + 0.3 * l)} 0%, ${rgba("#0F2470", 0.1 + 0.1 * l)} 38%, ${rgba("#0F2470", 0)} 72%)`,
            `radial-gradient(72% 42% at ${bx}% ${by}%, ${rgba("#0B1C5C", 0.26 + 0.24 * l)} 0%, ${rgba("#0B1C5C", 0.08 + 0.08 * l)} 40%, ${rgba("#0B1C5C", 0)} 74%)`,
          ].join(", "),
        }}
      />
      <canvas ref={canvas} width={width} height={height} style={{ position: "absolute", left: 0, top: 0, width, height, mixBlendMode: "screen" }} />
      {flash > 0.01 ? (
        <AbsoluteFill
          style={{
            background: `radial-gradient(80% 55% at 50% 50%, ${rgba(NEON.sky, 0.22 * flash)} 0%, ${rgba(NEON.blue, 0.12 * flash)} 45%, ${rgba(NEON.blue, 0)} 80%)`,
            mixBlendMode: "screen",
          }}
        />
      ) : null}
      {vignette > 0 ? (
        <AbsoluteFill
          style={{
            backgroundImage: `radial-gradient(ellipse 92% 72% at 50% 46%, rgba(2,3,8,0) 48%, ${rgba("#020308", 0.8 * vignette)} 100%)`,
          }}
        />
      ) : null}
      {grain > 0 ? <NeonGrain frame={f} opacity={grain} width={width} height={height} /> : null}
    </AbsoluteFill>
  );
};

/**
 * Filmkorn (SVG-Rauschen, Seed wechselt alle 2 Frames) – glättet zugleich Farbstufen in dunklen Verläufen.
 * Standard „overlay“: das Korn moduliert die Helligkeit (±), hebt Schwarz aber nicht an und entsättigt nicht
 * (`opacity` wird dafür intern ×4,5 genommen, 0,05 ≈ dezentes Filmkorn). „screen“ = altes Verhalten (hellt auf).
 */
export const NeonGrain: React.FC<{ frame?: number; opacity?: number; width?: number; height?: number; blend?: "overlay" | "screen" }> = ({
  frame,
  opacity = 0.05,
  width = W,
  height = H,
  blend = "overlay",
}) => {
  const f = useF(frame);
  const seed = Math.floor(seeded(`ng-${Math.floor(f / 2)}`) * 10000);
  const id = `neon-grain-${seed}`;
  const k = blend === "overlay" ? Math.min(0.6, opacity * 4.5) : opacity;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity: k, mixBlendMode: blend }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: "absolute", inset: 0 }}>
        <filter id={id} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency={0.85} numOctaves={2} seed={seed} stitchTiles="stitch" />
          {/* Grauwert-Rauschen um 0,5, voll deckend (neutral für overlay) */}
          <feColorMatrix type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1" />
          <feComponentTransfer>
            <feFuncR type="linear" slope={2.6} intercept={-0.8} />
            <feFuncG type="linear" slope={2.6} intercept={-0.8} />
            <feFuncB type="linear" slope={2.6} intercept={-0.8} />
          </feComponentTransfer>
        </filter>
        <rect width={width} height={height} filter={`url(#${id})`} />
      </svg>
    </AbsoluteFill>
  );
};

/** Schnelle Glättung für Aufrufer: 0..1 → weiche Kurve (für Stimmungs-Überblendungen). */
export const moodMix = (a: number, b: number, t: number) => lerp(a, b, smooth(t));

/**
 * Vignette als eigene Ebene – über 3D-Szenen legen, damit die Ränder ins Dunkel sinken (Kontrast wie in der Referenz).
 * Die Fläche ragt weit über das Bild hinaus: auch verkleinert (ZoomThrough) zeigt sie keine Kanten.
 */
export const NeonVignette: React.FC<{ strength?: number; inner?: number; width?: number; height?: number }> = ({ strength = 0.8, inner = 42, width = W, height = H }) => {
  const rx = width * 0.88;
  const ry = height * 0.7;
  return (
    <div
      style={{
        position: "absolute",
        left: -width,
        top: -height,
        width: width * 3,
        height: height * 3,
        pointerEvents: "none",
        backgroundImage: `radial-gradient(${rx.toFixed(0)}px ${ry.toFixed(0)}px at ${(width * 1.5).toFixed(0)}px ${(height * 1.48).toFixed(0)}px, rgba(2,3,8,0) ${inner}%, ${rgba("#020308", 0.55 * strength)} 78%, ${rgba("#020308", 0.92 * strength)} 100%)`,
      }}
    />
  );
};
