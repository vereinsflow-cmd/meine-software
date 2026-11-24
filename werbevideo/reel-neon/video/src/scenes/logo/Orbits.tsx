/**
 * Lichtbänder, die ruhig um den Punkt kreisen (Vorbild t10.25–t11.25): drei hochovale, leicht geneigte Bahnen wie der
 * Rand der Tunnelwand, auf jeder ein Lichtschweif mit hellem Kopf, alle im Drehsinn der Wand. Mit `wind` ziehen sie
 * sich zum Punkt zusammen – so geht das Kreisen der Wand nahtlos in den Punkt über.
 */
import React from "react";
import { NEON, rgba } from "../../neon";

type Bahn = { rx: number; ry: number; tilt: number; speed: number; phase: number; color: string; width: number; tail: number };

const BAHNEN: Bahn[] = [
  { rx: 310, ry: 440, tilt: -9, speed: 6.6, phase: 10, color: NEON.sky, width: 8, tail: 125 },
  { rx: 270, ry: 390, tilt: 11, speed: 7.6, phase: 135, color: NEON.ice, width: 6, tail: 110 },
  { rx: 340, ry: 470, tilt: 2, speed: 5.6, phase: 250, color: NEON.orange, width: 4.5, tail: 95 },
];

const SEG = 26;

export const Orbits: React.FC<{ f: number; x: number; y: number; intensity: number; wind: number }> = ({ f, x, y, intensity, wind }) => {
  if (intensity <= 0.002) return null;
  const scale = 1 - 0.72 * wind;
  const paths = BAHNEN.map((b, bi) => {
    const head = b.phase + b.speed * f;
    const tilt = (b.tilt * Math.PI) / 180;
    const pt = (deg: number) => {
      const t = (deg * Math.PI) / 180;
      const ex = b.rx * scale * Math.cos(t);
      const ey = b.ry * scale * Math.sin(t);
      return { x: x + ex * Math.cos(tilt) - ey * Math.sin(tilt), y: y + ex * Math.sin(tilt) + ey * Math.cos(tilt) };
    };
    const dir = Math.sign(b.speed);
    const segs: React.ReactNode[] = [];
    for (let k = 0; k < SEG; k++) {
      const a0 = head - dir * (b.tail * k) / SEG;
      const a1 = head - dir * (b.tail * (k + 1)) / SEG;
      const p0 = pt(a0);
      const p1 = pt(a1);
      const u = k / SEG;
      const a = intensity * Math.pow(1 - u, 1.5);
      segs.push(<line key={k} x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={rgba(b.color, Math.min(1, a))} strokeWidth={b.width * (1 - 0.8 * u) * (0.7 + 0.3 * scale)} strokeLinecap="round" />);
    }
    return <g key={bi}>{segs}</g>;
  });
  return (
    <svg width={1080} height={1920} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", mixBlendMode: "screen", pointerEvents: "none" }}>
      <defs>
        <filter id="orbit-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation={9} />
        </filter>
      </defs>
      {/* weicher Schein (dieselben Schweife, weichgezeichnet) + scharfer Kern */}
      <g filter="url(#orbit-glow)" opacity={0.9}>
        {paths}
      </g>
      <g>{paths}</g>
    </svg>
  );
};
