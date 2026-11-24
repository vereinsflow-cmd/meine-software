/**
 * Spring-Presets aus dem Storyboard. Alle Bewegungen im Spot laufen über spring() – nie linear.
 *   snap  – Taps, Druck, Einrasten (kritisch gedämpft, schnell)
 *   pop   – Typo, Badges (sichtbarer Overshoot)
 *   glide – Kamera, Geräte, große Flächen (weich, ohne Overshoot)
 */
import { spring } from "remotion";
import { FPS } from "./lib/timeline";

export type SpringPreset = { damping: number; stiffness: number; mass: number };

export const SNAP: SpringPreset = { damping: 26, stiffness: 300, mass: 0.6 };
export const POP: SpringPreset = { damping: 12, stiffness: 180, mass: 0.8 };
export const GLIDE: SpringPreset = { damping: 20, stiffness: 90, mass: 1.1 };

export const PRESETS = { snap: SNAP, pop: POP, glide: GLIDE } as const;

type SpOpts = {
  /** Spring auf diese Länge strecken/stauchen (Frames) */
  durationInFrames?: number;
  from?: number;
  to?: number;
  overshootClamping?: boolean;
};

/**
 * Spring-Fortschritt in Frame `frame` für eine Bewegung, die bei `at` (absoluter Frame) startet.
 * Vor `at` liefert sie `from` (Standard 0).
 */
export const sp = (frame: number, at: number, preset: SpringPreset = GLIDE, opts: SpOpts = {}) => {
  const from = opts.from ?? 0;
  const to = opts.to ?? 1;
  const base = { fps: FPS, config: { ...preset, overshootClamping: opts.overshootClamping ?? false }, durationInFrames: opts.durationInFrames };
  const v = spring({ ...base, frame: frame - at });
  const d = opts.durationInFrames;
  if (d === undefined || d <= 0) return from + (to - from) * v;
  // Gestreckte Springs erreichen bei durationInFrames erst ≈ 99,5 % und springen danach auf den Endwert (bei langen Wegen
  // ein sichtbarer Ruck, z. B. 6 px am Ende eines Scrolls) – deshalb auf den Wert im letzten Frame normieren.
  if (frame - at >= d) return to;
  const end = spring({ ...base, frame: d });
  return from + (to - from) * (end > 0.5 ? v / end : v);
};

/**
 * Spring mit Anfangsgeschwindigkeit: Die Kurve wird um `skip` Frames vorgespult und auf 0..1
 * normiert – die Bewegung ist in Frame `at` schon schnell (z. B. Kamera „reißt“ ab Frame 0).
 */
export const spMoving = (
  frame: number,
  at: number,
  preset: SpringPreset,
  skip: number,
  durationInFrames?: number,
) => {
  const total = durationInFrames !== undefined ? durationInFrames + skip : undefined;
  const p0 = sp(at + skip, at, preset, { durationInFrames: total, overshootClamping: true });
  if (frame < at) return 0;
  const p = sp(frame + skip, at, preset, { durationInFrames: total, overshootClamping: true });
  return Math.min(1, (p - p0) / (1 - p0));
};

/** Kurzer Impuls 0 → 1 → 0 (z. B. Puls 1 → 1,4 → 1) aus zwei versetzten Springs. */
export const pulse = (frame: number, at: number, preset: SpringPreset = POP, hold = 5) =>
  sp(frame, at, preset) - sp(frame, at + hold, preset);

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export const mix = (p: number, a: number, b: number) => a + (b - a) * p;
