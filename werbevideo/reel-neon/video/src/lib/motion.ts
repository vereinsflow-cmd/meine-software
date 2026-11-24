/**
 * Bewegungs-Helfer für Kamera- und Gerätefahrten: Keyframes, die per Spring ineinander gleiten.
 *
 *   track(f, [{ at: S, v: 0 }, { at: tap - 20, v: 750 }, { at: wo, v: 400, preset: SNAP }])
 *
 * Jeder Keyframe startet eine Spring vom vorigen Wert zum neuen – überlappende Fahrten addieren
 * sich weich (keine Sprünge, keine linearen Rampen).
 */
import { GLIDE, SpringPreset, sp } from "../springs";

export type Key = { at: number; v: number; preset?: SpringPreset; dur?: number };

export const track = (f: number, keys: Key[], preset: SpringPreset = GLIDE) => {
  let v = keys[0].v;
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.at) continue;
    v += (k.v - keys[i - 1].v) * sp(f, k.at, k.preset ?? preset, { durationInFrames: k.dur });
  }
  return v;
};

export type KeyObj<T extends Record<string, number>> = { at: number; v: T; preset?: SpringPreset; dur?: number };

/** wie track(), aber für Objekte mit mehreren Zahlen (z. B. Kamera {s, x, y}) */
export const trackObj = <T extends Record<string, number>>(f: number, keys: KeyObj<T>[], preset: SpringPreset = GLIDE): T => {
  const out = { ...keys[0].v } as Record<string, number>;
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    if (f < k.at) continue;
    const p = sp(f, k.at, k.preset ?? preset, { durationInFrames: k.dur });
    for (const key of Object.keys(k.v)) {
      const prev = keys[i - 1].v[key] ?? 0;
      out[key] += (k.v[key] - prev) * p;
    }
  }
  return out as T;
};

/** sanftes Schweben (deterministisch, ohne Zufall) */
export const bob = (f: number, amp = 1, period = 90, phase = 0) => Math.sin(((f + phase) / period) * Math.PI * 2) * amp;
