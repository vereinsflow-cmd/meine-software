/**
 * Neon-Druckwelle der Szene „termine“ (Tipp auf „Zusagen“/„Absagen“, Aufprall auf der Chat-Blase): heller, additiver
 * Ring (warmer Kern → Orange-Schein) mit einem zweiten, späteren Eis-Ring und kurzem Blitz. Ersetzt den grauen,
 * flachen Ring von DotBurst (dort burst = 0).
 */
import React from "react";
import { NEON, clamp01, easeOut, lerp, rgba } from "../../neon";

export type WelleProps = {
  /** Mitte im Videoraum */
  x: number;
  y: number;
  /** 0..1 Verlauf (außerhalb nichts) */
  p: number;
  /** Enddurchmesser des äußeren Rings (px) */
  size?: number;
};

const Ring: React.FC<{ x: number; y: number; q: number; d1: number; w0: number; core: string; glow: string; a: number }> = ({ x, y, q, d1, w0, core, glow, a }) => {
  if (q <= 0 || q >= 1) return null;
  const d = lerp(22, d1, easeOut(q, 2.6));
  const fade = Math.pow(1 - q, 1.35) * clamp01(q / 0.06) * a;
  const w = lerp(w0, 1.6, q);
  return (
    <div
      style={{
        position: "absolute",
        left: x - d / 2,
        top: y - d / 2,
        width: d,
        height: d,
        borderRadius: "50%",
        boxSizing: "border-box",
        border: `${w.toFixed(2)}px solid ${rgba(core, fade)}`,
        boxShadow: `0 0 ${(w * 4 + 8).toFixed(1)}px ${rgba(glow, 0.8 * fade)}, inset 0 0 ${(w * 3 + 6).toFixed(1)}px ${rgba(glow, 0.55 * fade)}`,
      }}
    />
  );
};

export const Welle: React.FC<WelleProps> = ({ x, y, p, size = 280 }) => {
  if (p <= 0 || p >= 1) return null;
  const flash = Math.pow(1 - clamp01(p / 0.32), 2);
  const fs = size * 0.62;
  return (
    <div style={{ position: "absolute", inset: 0, mixBlendMode: "screen", pointerEvents: "none" }}>
      {flash > 0.01 ? (
        <div
          style={{
            position: "absolute",
            left: x - fs / 2,
            top: y - fs / 2,
            width: fs,
            height: fs,
            borderRadius: "50%",
            opacity: flash,
            background: `radial-gradient(circle, ${rgba("#FFFFFF", 0.85)} 0%, ${rgba("#FFC9B2", 0.5)} 18%, ${rgba(NEON.orange, 0.18)} 46%, ${rgba(NEON.orange, 0)} 70%)`,
          }}
        />
      ) : null}
      <Ring x={x} y={y} q={p} d1={size} w0={7} core="#FFE1D3" glow={NEON.orange} a={1} />
      <Ring x={x} y={y} q={(p - 0.16) / 0.84} d1={size * 0.74} w0={4} core={NEON.ice} glow={NEON.sky} a={0.75} />
    </div>
  );
};
