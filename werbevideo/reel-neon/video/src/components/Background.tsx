/**
 * Hintergrund: animierter Verlauf zwischen Tinte- und Papier-Welt + deterministisches Grain.
 *   tone  0 = Tinte, 1 = Papier (dazwischen wird gemischt – z. B. für den Wipe in Szene 9)
 *   glows zusätzliche weiche Lichtquellen (z. B. Lampenschein, Vereinsblau-Verlauf)
 */
import { noise2D } from "@remotion/noise";
import React, { useId } from "react";
import { AbsoluteFill, interpolateColors, random } from "remotion";
import { useAbsFrame } from "../lib/scene";
import { C, GRAIN, H, W, rgba } from "../theme";

export type Glow = {
  x: number;
  y: number;
  /** Radius in px */
  r: number;
  color: string;
  opacity: number;
};

type Props = {
  tone?: number;
  glows?: Glow[];
  /** Grain an/aus oder eigene Deckkraft */
  grain?: boolean | number;
  /** Stärke der langsamen Verlaufs-Drift (0 = still) */
  drift?: number;
  /** Vignette 0..1 */
  vignette?: number;
  /** Stärke der Umgebungs-Farbfelder (0..1) – z. B. zum Einblenden nach „Licht aus“ */
  ambient?: number;
  style?: React.CSSProperties;
};

const glowCss = (g: Glow) =>
  `radial-gradient(circle ${Math.round(g.r)}px at ${g.x.toFixed(1)}px ${g.y.toFixed(1)}px, ${rgba(
    g.color,
    g.opacity,
  )} 0%, ${rgba(g.color, g.opacity * 0.45)} 38%, ${rgba(g.color, 0)} 100%)`;

export const Background: React.FC<Props> = ({
  tone = 0,
  glows = [],
  grain = true,
  drift = 1,
  vignette = 1,
  ambient: ambientAmount = 1,
  style,
}) => {
  const f = useAbsFrame();
  const t = Math.min(1, Math.max(0, tone));
  const base = interpolateColors(t, [0, 1], [C.ink, C.paper]);

  // zwei langsam wandernde Farbfelder – geben der Fläche Tiefe, ohne aufzufallen
  const n1x = noise2D("bg-a-x", f * 0.006, 0) * 140 * drift;
  const n1y = noise2D("bg-a-y", 0, f * 0.006) * 160 * drift;
  const n2x = noise2D("bg-b-x", f * 0.005, 3) * 160 * drift;
  const n2y = noise2D("bg-b-y", 7, f * 0.005) * 140 * drift;
  const ambient: Glow[] = [
    {
      x: 860 + n1x,
      y: 420 + n1y,
      r: 900,
      color: interpolateColors(t, [0, 1], [C.blue, "#FFFFFF"]),
      opacity: (0.11 * (1 - t) + 0.55 * t) * ambientAmount,
    },
    {
      x: 160 + n2x,
      y: 1560 + n2y,
      r: 820,
      color: interpolateColors(t, [0, 1], ["#1E3557", "#EFE8DA"]),
      opacity: (0.55 * (1 - t) + 0.6 * t) * ambientAmount,
    },
  ];

  const layers = [...glows, ...ambient].map(glowCss);
  const vig =
    vignette > 0
      ? `radial-gradient(ellipse 120% 85% at 50% 48%, rgba(0,0,0,0) 55%, ${rgba(
          t < 0.5 ? "#050B14" : "#5C5243",
          (t < 0.5 ? 0.55 : 0.1) * vignette * ambientAmount,
        )} 100%)`
      : null;

  const grainOpacity =
    grain === false ? 0 : typeof grain === "number" ? grain : GRAIN.ink * (1 - t) + GRAIN.paper * t;

  return (
    <AbsoluteFill style={{ backgroundColor: base, ...style }}>
      <AbsoluteFill style={{ backgroundImage: layers.join(", ") }} />
      {vig ? <AbsoluteFill style={{ backgroundImage: vig }} /> : null}
      {grainOpacity > 0 ? <Grain opacity={grainOpacity} light={t >= 0.5} /> : null}
    </AbsoluteFill>
  );
};

/**
 * Filmkorn: SVG-feTurbulence, Seed wechselt alle 2 Frames (deterministisch über random()).
 */
export const Grain: React.FC<{ opacity: number; light?: boolean; scale?: number }> = ({
  opacity,
  light = false,
  scale = 1,
}) => {
  const f = useAbsFrame();
  const rawId = useId();
  const id = `grain-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const seed = Math.floor(random(`grain-${Math.floor(f / 2)}`) * 10000);
  return (
    <AbsoluteFill style={{ pointerEvents: "none", opacity, mixBlendMode: light ? "multiply" : "screen" }}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", inset: 0 }}>
        <filter id={id} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency={0.82 / scale} numOctaves={2} seed={seed} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="linear" slope={1.6} intercept={-0.3} />
            <feFuncG type="linear" slope={1.6} intercept={-0.3} />
            <feFuncB type="linear" slope={1.6} intercept={-0.3} />
          </feComponentTransfer>
        </filter>
        <rect width={W} height={H} filter={`url(#${id})`} />
      </svg>
    </AbsoluteFill>
  );
};
