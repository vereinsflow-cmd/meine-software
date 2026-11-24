/**
 * Übergänge in Markenfarben (alle spring-getrieben, absolute Frames).
 *
 *   <CircleReveal at={…} x={540} y={960}>   Kreis-Wipe: Kinder erscheinen in wachsendem Kreis
 *   <BandWipe at={…} direction="diagonal">   Schräges Band fegt über das Bild: weicher Verlauf Himmel →
 *                                           Vereinsblau → Himmel, Korn, Bewegungsunschärfe in Fahrtrichtung;
 *                                           ganz bedeckt nur ca. 1 Frame → dort schneiden (wipeStartFor)
 *   <MorphRect at={…} from={…} to={…}>      Match-Cut: Form, Lage, Radius und Farbe morphen
 *   wipeCoverFrame(at, duration)            Frame, in dem BandWipe das Bild ganz bedeckt
 */
import React, { useId } from "react";
import { AbsoluteFill, interpolateColors } from "remotion";
import { useAbsFrame } from "../lib/scene";
import { Grain } from "./Background";
import { GLIDE, SNAP, SpringPreset, clamp01, mix, sp } from "../springs";
import { C, H, W, rgba } from "../theme";

// ---- Kreis-Wipe ---------------------------------------------------------------------------
export const CircleReveal: React.FC<{
  at: number;
  x: number;
  y: number;
  /** Startradius (px) */
  r0?: number;
  durationInFrames?: number;
  preset?: SpringPreset;
  /** Randring-Farbe (null = ohne) */
  ring?: string | null;
  children: React.ReactNode;
}> = ({ at, x, y, r0 = 20, durationInFrames = 12, preset = SNAP, ring = C.orange, children }) => {
  const f = useAbsFrame();
  if (f < at) return null;
  const maxR = Math.hypot(Math.max(x, W - x), Math.max(y, H - y)) + 40;
  const p = sp(f, at, preset, { durationInFrames, overshootClamping: true });
  const r = mix(p, r0, maxR);
  const done = p > 0.999;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ clipPath: done ? undefined : `circle(${r.toFixed(2)}px at ${x}px ${y}px)` }}>
        {children}
      </AbsoluteFill>
      {ring && !done ? (
        <div
          style={{
            position: "absolute",
            left: x - r,
            top: y - r,
            width: r * 2,
            height: r * 2,
            borderRadius: "50%",
            border: `${mix(p, 26, 3).toFixed(2)}px solid ${rgba(ring, Math.pow(1 - p, 0.7))}`,
            boxShadow: `0 0 60px ${rgba(ring, 0.55 * (1 - p))}, inset 0 0 40px ${rgba(ring, 0.35 * (1 - p))}`,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

// ---- Band-Wipe ----------------------------------------------------------------------------
const WIPE_SPAN = H * 1.9; // Bandlänge in Bewegungsrichtung

const wipeProgress = (frame: number, at: number, durationInFrames: number) =>
  sp(frame, at, GLIDE, { durationInFrames, overshootClamping: true });

/** Erster Frame, in dem das Band das Bild vollständig bedeckt (dort hart schneiden). */
export const wipeCoverFrame = (at: number, durationInFrames = 10) => {
  for (let f = at; f < at + durationInFrames; f++) {
    if (wipeProgress(f, at, durationInFrames) >= 0.5) return f;
  }
  return at + Math.round(durationInFrames / 2);
};

/** Startframe eines BandWipe, dessen Deckung genau auf `cut` fällt (dort hart schneiden). */
export const wipeStartFor = (cut: number, durationInFrames = 10) => cut - (wipeCoverFrame(0, durationInFrames) - 0);

export const BandWipe: React.FC<{
  at: number;
  durationInFrames?: number;
  direction?: "diagonal" | "up" | "down";
  /** Kantenfarbe und Kernfarbe des Bands (weicher Verlauf Himmel → Vereinsblau → Himmel) */
  colors?: [string, string];
}> = ({ at, durationInFrames = 10, direction = "diagonal", colors = [C.sky, C.blue] }) => {
  const f = useAbsFrame();
  const rawId = useId();
  const blurId = `wipe-mb-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const p = wipeProgress(f, at, durationInFrames);
  if (f < at || p > 0.999) return null;
  const angle = direction === "diagonal" ? -22 : 0;
  const pad = H * 0.35;
  const y0 = direction === "down" ? -WIPE_SPAN - pad : H + pad;
  const y1 = direction === "down" ? H + pad : -WIPE_SPAN - pad;
  const y = mix(p, y0, y1);
  // Bewegungsunschärfe entlang der Fahrtrichtung (lokale y-Achse des Bands), aus der Geschwindigkeit
  const speed = Math.abs(wipeProgress(f + 0.5, at, durationInFrames) - wipeProgress(f - 0.5, at, durationInFrames)) * Math.abs(y1 - y0);
  const sigma = Math.min(34, speed * 0.022);
  const [edge, core] = colors;
  // Eckpunkte des gedrehten Bands (für das Korn, das nur auf dem Band liegt)
  const cx = W / 2;
  const cy = y + WIPE_SPAN / 2;
  const th = (angle * Math.PI) / 180;
  const corner = (lx: number, ly: number) => `${(cx + lx * Math.cos(th) - ly * Math.sin(th)).toFixed(1)}px ${(cy + lx * Math.sin(th) + ly * Math.cos(th)).toFixed(1)}px`;
  const hw = W * 1.5;
  const hh = WIPE_SPAN / 2;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden" }}>
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <filter id={blurId} x="-2%" y="-10%" width="104%" height="120%">
          <feGaussianBlur stdDeviation={`0 ${sigma.toFixed(2)}`} />
        </filter>
      </svg>
      <div
        style={{
          position: "absolute",
          left: -W,
          top: y,
          width: W * 3,
          height: WIPE_SPAN,
          rotate: `${angle}deg`,
          background: `linear-gradient(180deg, ${edge} 0%, ${interpolateColors(0.5, [0, 1], [edge, core])} 5%, ${core} 16%, ${core} 84%, ${interpolateColors(
            0.5,
            [0, 1],
            [edge, core],
          )} 95%, ${edge} 100%)`,
          filter: sigma > 0.3 ? `url(#${blurId})` : undefined,
        }}
      />
      {/* Korn auf dem Band (wie überall im Spot) */}
      <AbsoluteFill style={{ clipPath: `polygon(${corner(-hw, -hh)}, ${corner(hw, -hh)}, ${corner(hw, hh)}, ${corner(-hw, hh)})` }}>
        <Grain opacity={0.07} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---- Match-Cut / Form-Morph ----------------------------------------------------------------
export type MorphBox = { x: number; y: number; w: number; h: number; r: number; color: string; opacity?: number };

export const morphBox = (frame: number, at: number, from: MorphBox, to: MorphBox, preset: SpringPreset = GLIDE) => {
  const p = sp(frame, at, preset);
  const c = clamp01(p);
  return {
    p,
    box: {
      x: mix(p, from.x, to.x),
      y: mix(p, from.y, to.y),
      w: mix(p, from.w, to.w),
      h: mix(p, from.h, to.h),
      r: mix(c, from.r, to.r),
      color: interpolateColors(c, [0, 1], [from.color, to.color]),
      opacity: mix(c, from.opacity ?? 1, to.opacity ?? 1),
    },
  };
};

export const MorphRect: React.FC<{
  at: number;
  from: MorphBox;
  to: MorphBox;
  preset?: SpringPreset;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ at, from, to, preset, children, style }) => {
  const f = useAbsFrame();
  const { box } = morphBox(f, at, from, to, preset);
  return (
    <div
      style={{
        position: "absolute",
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        borderRadius: box.r,
        backgroundColor: box.color,
        opacity: box.opacity,
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
};
