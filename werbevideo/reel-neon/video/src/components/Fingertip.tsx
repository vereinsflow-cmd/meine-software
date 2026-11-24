/**
 * Der orange Punkt als Fingerkuppe über einem 3D-Handy.
 *
 * dotPath() führt den Punkt über eine Folge von Zielen, die sich selbst bewegen dürfen (z. B. ein
 * Knopf im scrollenden, kippenden Handy – Ziel = projectPhone(…) in jedem Frame). Jede Etappe ist
 * eine Spring mit leichtem Bogen. <Fingertip> zeichnet Punkt, Druck-Squash und Ripple-Ringe
 * (1 → 2,2 in 12 Frames) für alle Tipp-Frames.
 */
import React from "react";
import { useAbsFrame } from "../lib/scene";
import { GLIDE, SNAP, SpringPreset, clamp01, mix, sp } from "../springs";
import { C, rgba } from "../theme";

export type Pt = { x: number; y: number };
export type DotLeg = {
  /** Start der Etappe (absoluter Frame) */
  at: number;
  /** Ziel (darf sich bewegen) */
  to: (f: number) => Pt;
  /** Dauer bis zur Ankunft (Frames) */
  dur?: number;
  preset?: SpringPreset;
  /** Bogenhöhe (px, nach oben) */
  arc?: number;
};

export const dotPath = (f: number, legs: DotLeg[]): Pt => {
  let p = legs[0].to(f);
  for (let i = 1; i < legs.length; i++) {
    const leg = legs[i];
    if (f < leg.at) break;
    const q = sp(f, leg.at, leg.preset ?? GLIDE, { durationInFrames: leg.dur, overshootClamping: true });
    const t = leg.to(f);
    const arc = (leg.arc ?? 60) * Math.sin(Math.PI * clamp01(q));
    p = { x: mix(q, p.x, t.x), y: mix(q, p.y, t.y) - arc };
  }
  return p;
};

/** Druck des Punkts: 0 → 1 → 0 um jeden Tipp */
export const tapPress = (f: number, taps: number[]) =>
  taps.reduce((acc, at) => Math.max(acc, sp(f, at - 2, SNAP, { durationInFrames: 4 }) - sp(f, at + 2, SNAP, { durationInFrames: 8 })), 0);

/** Delle des angetippten Elements 1 → 1−depth → 1 */
export const dent = (f: number, at: number, depth = 0.03) =>
  1 - depth * (sp(f, at - 1, SNAP, { durationInFrames: 4 }) - sp(f, at + 3, SNAP, { durationInFrames: 8 }));

export const Fingertip: React.FC<{
  x: number;
  y: number;
  taps?: number[];
  size?: number;
  color?: string;
  opacity?: number;
  scale?: number;
  glow?: number;
}> = ({ x, y, taps = [], size = 44, color = C.orange, opacity = 1, scale = 1, glow = 1 }) => {
  const f = useAbsFrame();
  const press = tapPress(f, taps);
  const s = scale * (1 - 0.18 * press);
  if (opacity <= 0.001) return null;
  return (
    <>
      {taps.map((at) => {
        if (f < at || f > at + 14) return null;
        const r = sp(f, at, SNAP, { durationInFrames: 12 });
        return (
          <div
            key={at}
            style={{
              position: "absolute",
              left: x - size / 2,
              top: y - size / 2,
              width: size,
              height: size,
              borderRadius: "50%",
              border: `3px solid ${rgba(color, 0.95)}`,
              scale: String(mix(r, 1, 2.2) * scale),
              opacity: (1 - r) * 0.9 * opacity,
            }}
          />
        );
      })}
      <div
        style={{
          position: "absolute",
          left: x - size / 2,
          top: y - size / 2,
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundColor: color,
          scale: String(s),
          opacity,
          boxShadow:
            glow > 0
              ? `0 0 ${size * 0.8 * glow}px ${rgba(color, 0.55 * glow)}, 0 0 ${size * 2 * glow}px ${rgba(color, 0.2 * glow)}, 0 6px 16px ${rgba("#000000", 0.28)}`
              : `0 6px 16px ${rgba("#000000", 0.28)}`,
        }}
      />
    </>
  );
};
