/**
 * VereinsFlow-Logo als animierbares SVG, nachgebaut aus public/brand/logo.svg.
 *
 * Teile einzeln steuerbar (alle Fortschritte 0 = weg, 1 = an Ort und Stelle):
 *   segments  6 Etappen des V: [links oben, links Mitte, links unten, rechts oben, rechts Mitte, rechts unten]
 *             – gleiten entlang ihrer Neigung ein
 *   dot       Punkt im V: Versatz/Squash/Deckkraft (oder hideDot, wenn der Leitmotiv-Punkt separat fliegt)
 *   stripes   Tempo-Striche links vom Punkt (scaleX vom Punkt aus)
 *   word      Wortmarke „VereinsFlow“ – Maske von links nach rechts (mit Blur)
 *   iDot      oranger i-Punkt der Wortmarke
 *   underline orange Unterstreichung der Wortmarke
 *
 *   <Logo width={860} tone="light" parts={{segments: [1,1,1,1,1,1], stripes: 1, word: 0.5}} />
 *   logoDotCenter(860, "lockup") → Lage des V-Punkts in px relativ zur linken oberen SVG-Ecke
 */
import React, { useId } from "react";
import { WORD_FLOW, WORD_VEREINS } from "../brand/logoPaths";
import { C } from "../theme";

type Tone = "light" | "dark";

export type LogoParts = {
  segments?: number[];
  dot?: { dx?: number; dy?: number; scale?: number; sx?: number; sy?: number; opacity?: number };
  stripes?: number;
  /** waagerechte Bewegungsunschärfe der Tempo-Striche (px im Logo-Raum) */
  stripesBlur?: number;
  word?: number;
  iDot?: number;
  underline?: number;
};

const ALL_IN: Required<Omit<LogoParts, "dot" | "stripesBlur">> = {
  segments: [1, 1, 1, 1, 1, 1],
  stripes: 1,
  word: 1,
  iDot: 1,
  underline: 1,
};

// Geometrie aus logo.svg (Koordinaten innerhalb der Bildmarken-Gruppe)
const SEGMENTS = [
  "M42.32 -40.00 L91.40 -40.00 L104.49 21.58 L55.41 21.58 Z",
  "M57.33 30.58 L106.40 30.58 L116.87 79.84 L67.80 79.84 Z",
  "M69.71 88.84 L118.78 88.84 L127.16 128.25 L78.09 128.25 Z",
  "M286.49 -52.00 L232.13 -52.00 L193.00 21.58 L247.37 21.58 Z",
  "M242.58 30.58 L188.22 30.58 L162.03 79.84 L216.39 79.84 Z",
  "M211.60 88.84 L157.24 88.84 L136.29 128.25 L190.65 128.25 Z",
];
const DIR_LEFT = { x: 13.09 / 62.96, y: 61.58 / 62.96 };
const DIR_RIGHT = { x: -39.13 / 83.34, y: 73.58 / 83.34 };
const SLIDE = 150;
export const MARK_DOT = { cx: 126.68, cy: 162.47, r: 25 };
const MARK_GROUP = "translate(-40.62 53.08) scale(0.9969)";
const MARK_T = { x: -40.62, y: 53.08, s: 0.9969 };

export const LOGO_VIEWBOX = { x: -28.8, y: -28.8, w: 1324.7, h: 297.6 };
/** nur Bildmarke (V + Punkt + Striche), in Lockup-Koordinaten */
export const MARK_VIEWBOX = { x: -6, y: -6, w: 262, h: 260 };

const colors = (tone: Tone) =>
  tone === "light"
    ? { left: C.black, right: C.blue, word1: C.black, word2: C.blue }
    : { left: C.white, right: C.sky, word1: C.white, word2: C.sky };

/** Mittelpunkt des V-Punkts in px relativ zur linken oberen Ecke des SVG. */
export const logoDotCenter = (width: number, mode: "lockup" | "mark" = "lockup") => {
  const vb = mode === "lockup" ? LOGO_VIEWBOX : MARK_VIEWBOX;
  const k = width / vb.w;
  const x = MARK_T.x + MARK_DOT.cx * MARK_T.s;
  const y = MARK_T.y + MARK_DOT.cy * MARK_T.s;
  return { x: (x - vb.x) * k, y: (y - vb.y) * k, r: MARK_DOT.r * MARK_T.s * k };
};
export const logoHeight = (width: number, mode: "lockup" | "mark" = "lockup") => {
  const vb = mode === "lockup" ? LOGO_VIEWBOX : MARK_VIEWBOX;
  return (width / vb.w) * vb.h;
};

export const Logo: React.FC<{
  width: number;
  tone?: Tone;
  mode?: "lockup" | "mark";
  parts?: LogoParts;
  hideDot?: boolean;
  style?: React.CSSProperties;
}> = ({ width, tone = "light", mode = "lockup", parts = {}, hideDot = false, style }) => {
  const rawId = useId();
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const col = colors(tone);
  const seg = parts.segments ?? ALL_IN.segments;
  const stripes = parts.stripes ?? ALL_IN.stripes;
  const word = parts.word ?? ALL_IN.word;
  const iDot = parts.iDot ?? ALL_IN.iDot;
  const underline = parts.underline ?? ALL_IN.underline;
  const d = parts.dot ?? {};
  const vb = mode === "lockup" ? LOGO_VIEWBOX : MARK_VIEWBOX;
  const wordBlur = 6 * (1 - Math.min(1, Math.max(0, word)));
  const stripesBlur = Math.max(0, parts.stripesBlur ?? 0);
  const WORD_W = 940;
  /** Lage der Maskenkante: −40 (alles verdeckt) … WORD_W + 110 (alles frei) */
  const wordEdge = -40 + Math.min(1, Math.max(0, word)) * (WORD_W + 150);

  return (
    <svg
      width={width}
      height={(width / vb.w) * vb.h}
      viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
      style={{ overflow: "visible", ...style }}
    >
      <defs>
        {/* weiche Maskenkante, die von links nach rechts über die Wortmarke läuft */}
        <linearGradient id={`wg-${uid}`} gradientUnits="userSpaceOnUse" x1={wordEdge - 90} y1={0} x2={wordEdge} y2={0}>
          <stop offset={0} stopColor="#FFFFFF" />
          <stop offset={1} stopColor="#000000" />
        </linearGradient>
        <mask id={`wm-${uid}`} maskUnits="userSpaceOnUse" x={-200} y={-260} width={WORD_W + 600} height={440}>
          <rect x={-200} y={-260} width={WORD_W + 600} height={440} fill={`url(#wg-${uid})`} />
        </mask>
        <filter id={`wb-${uid}`} x="-10%" y="-50%" width="120%" height="200%">
          <feGaussianBlur stdDeviation={`${wordBlur} ${wordBlur * 0.3}`} />
        </filter>
        <filter id={`sb-${uid}`} x="-60%" y="-200%" width="220%" height="500%">
          <feGaussianBlur stdDeviation={`${stripesBlur} 0`} />
        </filter>
      </defs>
      <g transform={MARK_GROUP}>
        {/* Tempo-Striche: schießen vom Punkt nach links heraus */}
        <g
          transform={`translate(91.18 162.47) scale(${Math.max(0.0001, stripes)} 1) translate(-91.18 -162.47)`}
          opacity={stripes > 0.01 ? 1 : 0}
          filter={stripesBlur > 0.05 ? `url(#sb-${uid})` : undefined}
        >
          <rect x={64.93} y={157.22} width={26.25} height={10.5} rx={5.25} fill={C.orange} />
          <rect x={40.93} y={157.22} width={15} height={10.5} rx={5.25} fill={C.orange} />
        </g>
        {SEGMENTS.map((path, i) => {
          const p = seg[i] ?? 1;
          const dir = i < 3 ? DIR_LEFT : DIR_RIGHT;
          const off = (1 - p) * SLIDE;
          const fill = i < 3 ? col.left : col.right;
          return (
            <path
              key={i}
              d={path}
              fill={fill}
              stroke={fill}
              strokeWidth={2.5}
              strokeLinejoin="round"
              opacity={Math.min(1, Math.max(0, p * 2.2))}
              transform={`translate(${(-dir.x * off).toFixed(2)} ${(-dir.y * off).toFixed(2)})`}
            />
          );
        })}
        {!hideDot ? (
          <g
            transform={`translate(${MARK_DOT.cx + (d.dx ?? 0)} ${MARK_DOT.cy + (d.dy ?? 0)}) scale(${
              (d.scale ?? 1) * (d.sx ?? 1)
            } ${(d.scale ?? 1) * (d.sy ?? 1)})`}
            opacity={d.opacity ?? 1}
          >
            <circle cx={0} cy={0} r={MARK_DOT.r} fill={C.orange} />
          </g>
        ) : null}
      </g>
      {mode === "lockup" ? (
        <g transform="translate(308.63 180.00)">
          <g transform="skewX(-9)">
            <g mask={word >= 0.999 ? undefined : `url(#wm-${uid})`} filter={wordBlur > 0.05 ? `url(#wb-${uid})` : undefined}>
              <path d={WORD_VEREINS} fill={col.word1} />
              <path d={WORD_FLOW} transform="translate(580.00 0)" fill={col.word2} />
            </g>
            <circle cx={373.17} cy={-112.5} r={12.69 * Math.max(0, iDot)} fill={C.orange} />
            <g
              transform={`translate(2.4 30) scale(${Math.max(0.0001, underline)} 1) translate(-2.4 -30)`}
              opacity={underline > 0.01 ? 1 : 0}
            >
              <rect x={2.4} y={24} width={824.8} height={13.2} rx={6.6} fill={C.orange} />
              <rect x={838.56} y={24} width={33} height={13.2} rx={6.6} fill={C.orange} />
              <rect x={882.91} y={24} width={22.44} height={13.2} rx={6.6} fill={C.orange} />
              <rect x={916.7} y={24} width={13.2} height={13.2} rx={6.6} fill={C.orange} />
            </g>
          </g>
        </g>
      ) : null}
    </svg>
  );
};
