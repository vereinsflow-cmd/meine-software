/**
 * Kennzahlenkarten mit Farbverlauf (KpiShell der App) und der kleine Kurs darauf (QuoteChart der App).
 * Gemeinsam genutzt von finance.tsx (Kontostand, Offene Rechnungen, Überschuss) und dashboard.tsx (Mitglieder).
 */
import React, { useId } from "react";
import { KPI_GRADIENT, type KpiAccent, W } from "./tokens";
import { Icon, type IconName } from "./icons";
import { clamp01 } from "./motion";

/** Kursfläche der App: viewBox 100 × 40, Linie im Band 22 %–82 % der Höhe, Punkte mit 6 % Rand links/rechts. */
const VB_H = 40;
const LINE_TOP = VB_H * 0.22;
const LINE_BAND = VB_H * 0.6;
const INSET = 6;

const quoteX = (i: number, n: number) => (n > 1 ? INSET + (i / (n - 1)) * (100 - INSET * 2) : 50);

export type SparklineProps = {
  /** Werte (beliebige Einheit – die Kurve nutzt ihren eigenen Wertebereich wie die App) */
  points: number[];
  /** Breite/Höhe in CSS-px (Karte 358 × 56) */
  width: number;
  height?: number;
  /** 0..1 – Linie zeichnet sich von links nach rechts, der Endpunkt läuft an der Spitze mit */
  draw?: number;
  /** Farbe des Rings um den Endpunkt (Kartenfarbe, --kpi-ink) */
  ink: string;
};

/** Weiße Kurslinie mit ausblendender Fläche, gestrichelter Startlinie und großem Endpunkt („jetzt“). */
export const Sparkline: React.FC<SparklineProps> = ({ points, width, height = 56, draw = 1, ink }) => {
  const id = useId().replace(/:/g, "");
  const n = points.length;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const sx = width / 100;
  const sy = height / VB_H;
  const xy = points.map((v, i) => {
    const t = max === min ? 0.5 : (v - min) / (max - min);
    return [quoteX(i, n) * sx, (LINE_TOP + LINE_BAND * (1 - t)) * sy] as const;
  });
  const first = xy[0];
  const last = xy[n - 1];
  const all = [[0, first[1]] as const, ...xy];
  const line = all.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const area = `${line} L${last[0].toFixed(2)} ${height} L0 ${height} Z`;
  const d = clamp01(draw);
  // Spitze der Linie: x wandert von 0 bis zum letzten Punkt
  const headX = d * last[0];
  let headY = first[1];
  for (let i = 1; i < all.length; i++) {
    const [x0, y0] = all[i - 1];
    const [x1, y1] = all[i];
    if (headX <= x1 || i === all.length - 1) {
      const t = x1 === x0 ? 1 : clamp01((headX - x0) / (x1 - x0));
      headY = y0 + (y1 - y0) * t;
      break;
    }
  }
  const clipW = d >= 1 ? width + 20 : headX;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2={height} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff" stopOpacity={0.26} />
          <stop offset="0.3" stopColor="#fff" stopOpacity={0.26} />
          <stop offset="1" stopColor="#fff" stopOpacity={0} />
        </linearGradient>
        <clipPath id={`c${id}`}>
          <rect x={-10} y={-20} width={clipW + 10} height={height + 40} />
        </clipPath>
      </defs>
      <line x1={0} x2={width} y1={first[1]} y2={first[1]} stroke="#fff" strokeOpacity={0.55} strokeDasharray="4 4" strokeWidth={1} />
      <g clipPath={`url(#c${id})`}>
        <path d={area} fill={`url(#f${id})`} />
        <path d={line} fill="none" stroke="#fff" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {d > 0 ? (
        <>
          <circle cx={headX} cy={headY} r={6.5} fill={ink} />
          <circle cx={headX} cy={headY} r={4.5} fill="#fff" />
        </>
      ) : null}
    </svg>
  );
};

export type KpiShellProps = {
  label: string;
  accent: KpiAccent;
  icon: IconName;
  /** Pfeil oben rechts (Karte führt weiter) */
  arrow?: boolean;
  /** Breite in CSS-px */
  width: number;
  /** Innenabstand unten (Finanzen pb-3.5 = 14) */
  padBottom?: number;
  children: React.ReactNode;
  /** unten angeschlagener Bereich (Kurs) */
  extra?: React.ReactNode;
  /** 0..1 – Karte hebt sich (stärkerer Schimmer, leicht größer) */
  lift?: number;
  style?: React.CSSProperties;
};

/** Hülle der farbigen Kennzahlenkarte: Verlauf 160°, weiße Schrift, Symbolkachel links, Pfeil rechts, Schimmer darunter. */
export const KpiShell: React.FC<KpiShellProps> = ({ label, accent, icon, arrow = true, width, padBottom = 14, children, extra, lift = 0, style }) => {
  const g = KPI_GRADIENT[accent];
  const l = clamp01(lift);
  return (
    <div
      style={{
        position: "relative",
        isolation: "isolate",
        width,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        borderRadius: 28,
        color: "#fff",
        fontSize: 15,
        lineHeight: "21.75px",
        backgroundImage: `linear-gradient(160deg in oklab, ${g.stops[0]}, ${g.stops[1]}, ${g.stops[2]})`,
        boxShadow: [
          "inset 0 1px 0 rgba(255,255,255,0.28)",
          // ring-white/15, dunkel dark:ring-white/10
          "0 0 0 1px rgba(255,255,255,0.1)",
          `0 ${22 + 10 * l}px ${40 + 20 * l}px -24px ${g.glow}`,
          `0 10px 20px -14px ${g.glow}`,
        ].join(", "),
        transform: l > 0 ? `translateY(${-4 * l}px) scale(${1 + 0.02 * l})` : undefined,
        ...style,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: -112,
          right: -112,
          zIndex: -1,
          width: 224,
          height: 224,
          borderRadius: "50%",
          background: "radial-gradient(circle closest-side, rgba(255,255,255,0.1), transparent 60%)",
          pointerEvents: "none",
        }}
      />
      <div style={{ display: "flex", flex: 1, flexDirection: "column", padding: `16px 20px ${padBottom}px` }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span
            style={{
              display: "flex",
              width: 32,
              height: 32,
              flexShrink: 0,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 11.2,
              background: "rgba(255,255,255,0.18)",
              boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.2)",
            }}
          >
            <Icon name={icon} size={16} />
          </span>
          <div style={{ minWidth: 0, flex: 1, paddingTop: 4, fontSize: 15, lineHeight: 1.375, fontWeight: W.semibold }}>{label}</div>
          {arrow ? (
            <span
              style={{
                display: "flex",
                width: 32,
                height: 32,
                flexShrink: 0,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "50%",
                background: "rgba(255,255,255,0.12)",
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.15)",
              }}
            >
              <Icon name="arrow-up-right" size={16} />
            </span>
          ) : null}
        </div>
        {children}
        {extra}
      </div>
    </div>
  );
};

/** Große Zahl der Karte (extrafett, enge Laufweite, leichter Schatten). */
export const KpiValue: React.FC<{ children: React.ReactNode; fontSize: number; style?: React.CSSProperties }> = ({ children, fontSize, style }) => (
  <div
    style={{
      fontSize,
      lineHeight: 1,
      fontWeight: W.extrabold,
      letterSpacing: "-0.035em",
      fontVariantNumeric: "tabular-nums",
      textShadow: "0 2px 12px rgba(0,0,0,0.12)",
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </div>
);
