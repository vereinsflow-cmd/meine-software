/**
 * Bewegungs-Helfer für den UI-Baukasten. Alles hängt nur am Frame – keine Zufallswerte, keine CSS-Übergänge.
 *
 *   appear(f, at)              0 → 1 (GLIDE-Spring, ohne Überschwingen), ab Frame `at`
 *   stagger(f, at, i, gap)     wie appear, Element i startet gap·i Frames später
 *   countUp(f, at, dur, a, b)  Zahl zählt mit ease-out von a nach b
 *   formatDE(1549.5, 2)        → „1.549,50“
 *   riseIn(p)                  Stil: steigt von unten auf, blendet ein, wird scharf
 */
import type React from "react";
import { sp, GLIDE, SNAP, POP, clamp01, mix, type SpringPreset } from "../springs";

export { clamp01, mix };

/** Weiches Erscheinen 0..1 (ohne Überschwingen). `dur` streckt die Spring auf diese Länge in Frames. */
export const appear = (f: number, at: number, dur?: number, preset: SpringPreset = GLIDE) =>
  clamp01(sp(f, at, preset, { durationInFrames: dur, overshootClamping: true }));

/** Wie appear, aber mit sichtbarem Überschwingen (für Schilder, Häkchen, Zähler-Puls). */
export const pop = (f: number, at: number, dur?: number) => sp(f, at, POP, { durationInFrames: dur });

/** Schnelles Einrasten (Tipp, Druck). */
export const snap = (f: number, at: number, dur?: number) =>
  clamp01(sp(f, at, SNAP, { durationInFrames: dur, overshootClamping: true }));

/** Gestaffeltes Erscheinen: Element i startet `gap` Frames nach Element i − 1. */
export const stagger = (f: number, at: number, i: number, gap = 3, dur?: number) => appear(f, at + i * gap, dur);

/** Druck eines Knopfes: 0 → 1 → 0 um Frame `at` (runter in ~4, wieder hoch nach `hold` Frames). */
export const press = (f: number, at: number, hold = 4) =>
  clamp01(sp(f, at, SNAP, { overshootClamping: true }) - sp(f, at + hold, SNAP, { overshootClamping: true }));

/** ease-out (kubisch) */
export const easeOut = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
/** ease-in-out (kubisch) */
export const easeInOut = (t: number) => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

/** Zahl zählt von `from` nach `to` hoch (ease-out), Start bei Frame `at`, Dauer `dur` Frames. */
export const countUp = (f: number, at: number, dur: number, from: number, to: number) =>
  mix(easeOut((f - at) / Math.max(1, dur)), from, to);

/** Linear 0..1 zwischen zwei Frames (für Fortschritte, die gleichmäßig laufen sollen). */
export const progress = (f: number, from: number, to: number) => clamp01((f - from) / Math.max(1, to - from));

/**
 * Deutsche Zahl: Tausenderpunkt, Dezimalkomma. formatDE(13944.47, 2) → „13.944,47“.
 * Negative Zahlen mit echtem Minus „−“ (wie die App).
 */
export const formatDE = (n: number, decimals = 0) => {
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(decimals);
  const [int, frac] = fixed.split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const s = frac !== undefined ? `${grouped},${frac}` : grouped;
  return neg && Number(fixed) !== 0 ? `−${s}` : s;
};

/** Euro-Betrag wie die App: „13.944,47 €“ (geschütztes Leerzeichen); signed → „+5.286,30 €“ / „−64,20 €“. */
export const formatEuro = (n: number, signed = false) => {
  const body = `${formatDE(Math.abs(n), 2)} €`;
  if (n < 0 && Math.abs(n) >= 0.005) return `−${body}`;
  if (signed && n > 0) return `+${body}`;
  return body;
};

/**
 * Auftritt „steigt auf“: von `dist` px unterhalb, durchsichtig und unscharf → an Ort und Stelle, deckend, scharf.
 * p = 0..1 (meist appear()).
 */
export const riseIn = (p: number, dist = 60, blur = 14): React.CSSProperties => {
  const q = clamp01(p);
  return {
    opacity: q,
    transform: `translateY(${(1 - p) * dist}px)`,
    filter: q >= 0.999 ? undefined : `blur(${(1 - q) * blur}px)`,
  };
};

/** Gleitet seitlich herein (Zeilen einer Liste). */
export const slideIn = (p: number, dist = 90): React.CSSProperties => {
  const q = clamp01(p);
  return { opacity: q, transform: `translateX(${(1 - p) * dist}px)` };
};

/** Taste gedrückt: leicht kleiner (0,96) – pressed 0..1. */
export const pressScale = (pressed = 0) => 1 - 0.04 * clamp01(pressed);
