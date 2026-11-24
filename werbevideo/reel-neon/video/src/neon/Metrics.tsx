/**
 * Kennzahlen im Neon-Stil (Referenz t08.25–t08.75), alle Werte kommen von außen – keine Zahlen in den Bausteinen.
 *
 *   DonutRing   dicker, glühender Ring wie ein Lichtschlauch (Spur, Bogen mit Verlauf, Glanz außen, Schatten innen,
 *               weißglühender Kopf am Bogenende), Wert in der Mitte zählt mit
 *   Bars        waagerechte Balken auf dunkler Spur, wachsen gestaffelt, leuchtende Spitze
 *   LineSpark   Linie zeichnet sich mit Glow, Fläche darunter, leuchtender Endpunkt
 *   MetricCard  dunkle Glaskarte mit Titel (+ optional Wert) für die drei oben
 *
 *   <DonutRing size={260} value={12 / 15} progress={appear(f, 20)} label="12 von 15" />
 */
import React, { useId } from "react";
import { getLength, getPointAtLength } from "@remotion/paths";
import { fontFamily } from "../fonts";
import { textWidth } from "../lib/measure";
import { GlassPanel } from "./GlassPanel";
import { NEON, rgba, textGlow } from "./palette";
import { clamp01, easeOut, lerp } from "./util";

export type DonutRingProps = {
  size: number;
  /** Zielanteil 0..1 */
  value: number;
  /** Animationsfortschritt 0..1 (der Bogen wächst bis value) */
  progress?: number;
  thickness?: number;
  /** Text in der Mitte; Standard: Prozent des aktuell gezeigten Anteils */
  label?: string;
  sublabel?: string;
  /** eigener Formatierer für den gezeigten Anteil (z. B. f => `${Math.round(f * 15)} von 15`) */
  format?: (shown: number) => string;
  head?: boolean;
  glow?: number;
  /** Bogenfarben [Anfang, Ende] */
  colors?: [string, string];
  style?: React.CSSProperties;
};

const ringPath = (cx: number, cy: number, r: number) => `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.001} ${cy - r}`;

export const DonutRing: React.FC<DonutRingProps> = ({
  size,
  value,
  progress = 1,
  thickness,
  label,
  sublabel,
  format,
  head = true,
  glow = 1,
  colors = [NEON.sky, NEON.electric],
  style,
}) => {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const th = thickness ?? size * 0.13;
  const pad = th * 0.9;
  const c = size / 2;
  const R = c - th / 2 - pad;
  const v = clamp01(value) * clamp01(progress);
  const d = ringPath(c, c, R);
  const dHi = ringPath(c, c, R + th * 0.2);
  const dLo = ringPath(c, c, R - th * 0.26);
  const ang = v * Math.PI * 2 - Math.PI / 2;
  const hx = c + Math.cos(ang) * R;
  const hy = c + Math.sin(ang) * R;
  const text = label ?? (format ? format(v) : `${Math.round(v * 100)} %`);
  // Schrift so groß wie möglich, aber innerhalb des Lochs (78 % des Innendurchmessers)
  const inner = 2 * (R - th / 2);
  const fs = Math.min(size * 0.17, (inner * 0.78) / Math.max(0.01, textWidth(text, 100, 800, -0.02) / 100));
  const dash = (k: number) => `${Math.max(0.0001, k)} 2`;
  return (
    <div style={{ position: "relative", width: size, height: size, ...style }}>
      <svg width={size} height={size} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <defs>
          <linearGradient id={`dr-g-${uid}`} gradientUnits="userSpaceOnUse" x1={c} y1={0} x2={c * 0.6} y2={size}>
            <stop offset={0} stopColor={colors[0]} />
            <stop offset={1} stopColor={colors[1]} />
          </linearGradient>
          <filter id={`dr-b-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation={th * 0.55} />
          </filter>
          <filter id={`dr-s-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation={th * 0.08} />
          </filter>
        </defs>
        {/* Spur */}
        <circle cx={c} cy={c} r={R} fill="none" stroke={rgba(NEON.blue, 0.13)} strokeWidth={th} />
        <circle cx={c} cy={c} r={R + th / 2} fill="none" stroke={rgba(NEON.sky, 0.08)} strokeWidth={1} />
        <circle cx={c} cy={c} r={R - th / 2} fill="none" stroke={rgba(NEON.sky, 0.06)} strokeWidth={1} />
        {v > 0.002 ? (
          <>
            {/* Glow */}
            <path d={d} pathLength={1} fill="none" stroke={NEON.blue} strokeWidth={th * 1.1} strokeLinecap="round" strokeDasharray={dash(v)} filter={`url(#dr-b-${uid})`} opacity={0.9 * glow} />
            {/* Körper */}
            <path d={d} pathLength={1} fill="none" stroke={`url(#dr-g-${uid})`} strokeWidth={th} strokeLinecap="round" strokeDasharray={dash(v)} />
            {/* Schatten innen, Glanz außen (Schlauch-Wirkung) */}
            <path d={dLo} pathLength={1} fill="none" stroke={NEON.abyss} strokeWidth={th * 0.22} strokeLinecap="round" strokeDasharray={dash(v)} opacity={0.45} filter={`url(#dr-s-${uid})`} />
            <path d={dHi} pathLength={1} fill="none" stroke={NEON.ice} strokeWidth={th * 0.24} strokeLinecap="round" strokeDasharray={dash(v)} opacity={0.5} filter={`url(#dr-s-${uid})`} />
            {head ? (
              <>
                <circle cx={hx} cy={hy} r={th * 0.9} fill={rgba(NEON.sky, 0.35 * glow)} filter={`url(#dr-b-${uid})`} />
                <circle cx={hx} cy={hy} r={th * 0.3} fill={NEON.ice} opacity={0.95} />
              </>
            ) : null}
          </>
        ) : null}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily }}>
        <span style={{ fontWeight: 800, fontSize: fs, color: NEON.ice, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums", textShadow: textGlow(0.3, NEON.sky, NEON.blue, size / 600), whiteSpace: "nowrap" }}>
          {text}
        </span>
        {sublabel ? <span style={{ marginTop: size * 0.01, fontWeight: 500, fontSize: size * 0.075, color: NEON.mist, whiteSpace: "nowrap" }}>{sublabel}</span> : null}
      </div>
    </div>
  );
};

export type BarsProps = {
  width: number;
  /** Anteile 0..1 je Balken */
  values: number[];
  /** Fortschritt 0..1 (Balken wachsen gestaffelt) */
  progress?: number;
  /** Versatz je Balken als Anteil der Gesamtzeit */
  stagger?: number;
  barHeight?: number;
  gap?: number;
  labels?: string[];
  labelWidth?: number;
  /** hervorgehobener Balken (Index) bekommt die orange Spitze */
  highlight?: number;
  glow?: number;
  style?: React.CSSProperties;
};

export const Bars: React.FC<BarsProps> = ({ width, values, progress = 1, stagger = 0.1, barHeight = 34, gap = 18, labels, labelWidth = 170, highlight, glow = 1, style }) => {
  const n = values.length;
  const lw = labels ? labelWidth : 0;
  const trackW = width - lw;
  const span = 1 - stagger * (n - 1);
  return (
    <div style={{ position: "relative", width, height: n * barHeight + (n - 1) * gap, fontFamily, ...style }}>
      {values.map((v, i) => {
        const p = easeOut(clamp01((progress - i * stagger) / Math.max(0.05, span)), 3);
        const w = Math.max(0, trackW * clamp01(v) * p);
        const hot = highlight === i;
        const top = i * (barHeight + gap);
        return (
          <React.Fragment key={i}>
            {labels ? (
              <div style={{ position: "absolute", left: 0, top, width: lw - 18, height: barHeight, display: "flex", alignItems: "center", fontWeight: 500, fontSize: barHeight * 0.7, color: NEON.mist, whiteSpace: "nowrap" }}>
                {labels[i]}
              </div>
            ) : null}
            <div style={{ position: "absolute", left: lw, top, width: trackW, height: barHeight, borderRadius: 9, background: rgba(NEON.blue, 0.12), boxShadow: `inset 0 0 0 1px ${rgba(NEON.sky, 0.06)}` }} />
            {w > 0.5 ? (
              <div
                style={{
                  position: "absolute",
                  left: lw,
                  top,
                  width: w,
                  height: barHeight,
                  borderRadius: 9,
                  background: `linear-gradient(90deg, ${NEON.deep} 0%, ${NEON.electric} 55%, ${hot ? NEON.orange : NEON.sky} 100%)`,
                  boxShadow: `0 0 ${18 * glow}px ${rgba(hot ? NEON.orange : NEON.blue, 0.55 * glow)}, inset 0 1px 0 ${rgba("#FFFFFF", 0.25)}`,
                }}
              >
                {/* leuchtende Spitze */}
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: 0,
                    width: Math.min(w, barHeight * 1.2),
                    height: barHeight,
                    borderRadius: 9,
                    background: `linear-gradient(90deg, ${rgba("#FFFFFF", 0)} 0%, ${rgba("#FFFFFF", 0.45)} 100%)`,
                  }}
                />
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export type LineSparkProps = {
  width: number;
  height: number;
  values: number[];
  /** Zeichenfortschritt 0..1 */
  progress?: number;
  min?: number;
  max?: number;
  strokeWidth?: number;
  area?: boolean;
  dot?: boolean;
  /** Farbe des Endpunkts (Standard weißglühend; orange als Akzent möglich) */
  dotColor?: string;
  glow?: number;
  style?: React.CSSProperties;
};

/** glatte Kurve (Catmull-Rom → Bézier) durch die Punkte */
const smoothPath = (pts: { x: number; y: number }[]) => {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C ${c1.x.toFixed(2)} ${c1.y.toFixed(2)} ${c2.x.toFixed(2)} ${c2.y.toFixed(2)} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
};

export const LineSpark: React.FC<LineSparkProps> = ({ width, height, values, progress = 1, min, max, strokeWidth = 5, area = true, dot = true, dotColor = NEON.ice, glow = 1, style }) => {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  const pad = strokeWidth * 2;
  const pts = values.map((v, i) => ({
    x: pad + (i / Math.max(1, values.length - 1)) * (width - pad * 2),
    y: pad + (1 - (v - lo) / Math.max(1e-6, hi - lo)) * (height - pad * 2),
  }));
  const d = smoothPath(pts);
  const p = clamp01(progress);
  const len = d ? getLength(d) : 0;
  const end = (d && p > 0 ? getPointAtLength(d, len * p) : null) ?? { x: pad, y: height / 2 };
  return (
    <div style={{ position: "relative", width, height, ...style }}>
      <svg width={width} height={height} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <defs>
          <linearGradient id={`ls-a-${uid}`} x1={0} y1={0} x2={0} y2={1}>
            <stop offset={0} stopColor={NEON.blue} stopOpacity={0.42} />
            <stop offset={1} stopColor={NEON.blue} stopOpacity={0} />
          </linearGradient>
          <linearGradient id={`ls-s-${uid}`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={width} y2={0}>
            <stop offset={0} stopColor={NEON.electric} />
            <stop offset={1} stopColor={NEON.sky} />
          </linearGradient>
          <filter id={`ls-b-${uid}`} x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation={strokeWidth * 1.6} />
          </filter>
          <clipPath id={`ls-c-${uid}`}>
            <rect x={0} y={-height} width={Math.max(0, end.x)} height={height * 3} />
          </clipPath>
        </defs>
        {area && p > 0 ? <path d={`${d} L ${pts[pts.length - 1].x} ${height} L ${pts[0].x} ${height} Z`} fill={`url(#ls-a-${uid})`} clipPath={`url(#ls-c-${uid})`} /> : null}
        {p > 0 ? (
          <>
            <path d={d} pathLength={1} fill="none" stroke={NEON.blue} strokeWidth={strokeWidth * 2.4} strokeLinecap="round" strokeDasharray={`${p} 2`} filter={`url(#ls-b-${uid})`} opacity={0.85 * glow} />
            <path d={d} pathLength={1} fill="none" stroke={`url(#ls-s-${uid})`} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={`${p} 2`} />
          </>
        ) : null}
        {dot && p > 0.01 ? (
          <>
            <circle cx={end.x} cy={end.y} r={strokeWidth * 4} fill={rgba(dotColor === NEON.ice ? NEON.sky : dotColor, 0.45 * glow)} filter={`url(#ls-b-${uid})`} />
            <circle cx={end.x} cy={end.y} r={strokeWidth * 1.3} fill={dotColor} />
          </>
        ) : null}
      </svg>
    </div>
  );
};

export type MetricCardProps = {
  width: number;
  height: number;
  title: string;
  /** großer Wert unter dem Titel (optional) */
  value?: string;
  caption?: string;
  tint?: number;
  glow?: number;
  /** 0..1 – Auftritt (Karte hebt sich aus der Tiefe, Inhalt blendet ein) */
  appear?: number;
  padding?: number;
  children?: React.ReactNode;
  style?: React.CSSProperties;
};

export const MetricCard: React.FC<MetricCardProps> = ({ width, height, title, value, caption, tint = 0, glow = 0.5, appear = 1, padding = 34, children, style }) => {
  const a = clamp01(appear);
  return (
    <GlassPanel width={width} height={height} radius={30} tint={tint} glow={glow * a} edge={0.9} style={{ opacity: a, ...style }}>
      <div style={{ position: "absolute", inset: padding, fontFamily, display: "flex", flexDirection: "column" }}>
        <div style={{ fontWeight: 500, fontSize: 30, color: NEON.mist, letterSpacing: "-0.005em", whiteSpace: "nowrap" }}>{title}</div>
        {value ? (
          <div
            style={{
              marginTop: 6,
              fontWeight: 800,
              fontSize: 64,
              lineHeight: 1.05,
              color: NEON.ice,
              letterSpacing: "-0.02em",
              fontVariantNumeric: "tabular-nums",
              textShadow: textGlow(0.35, NEON.sky, NEON.blue, 0.7),
              transform: `translateY(${lerp(10, 0, easeOut(a)).toFixed(2)}px)`,
            }}
          >
            {value}
          </div>
        ) : null}
        {caption ? <div style={{ marginTop: 4, fontWeight: 500, fontSize: 24, color: rgba(NEON.ice, 0.5) }}>{caption}</div> : null}
        <div style={{ position: "relative", flex: 1 }}>{children}</div>
      </div>
    </GlassPanel>
  );
};
