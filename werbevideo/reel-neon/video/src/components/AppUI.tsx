/**
 * Kleine Bausteine für die Lösungsszenen (4–8):
 *   <Callout>     Karte, die als 3D-Element aus dem Handy springt (Fehlerhinweis, Status)
 *   <AppBadge>    Badge im App-Stil (z. B. „Fehler“, „wird importiert“)
 *   <InkChip>     Chip auf Tinte (Himmel, Outline) – z. B. „Daten jedes Vereins strikt getrennt“
 *   <IconCheck>/<IconX>/<IconCheckDouble>  Linien-Icons, die sich zeichnen (draw 0..1)
 */
import React from "react";
import { FONT_BOLD, FONT_REGULAR, fontFamily } from "../fonts";
import { useAbsFrame } from "../lib/scene";
import { GLIDE, POP, SNAP, clamp01, mix, sp } from "../springs";
import { C, rgba } from "../theme";
import { Pt } from "./Fingertip";

export const APP = {
  blue: "#0555B7",
  text: "#0A0A0A",
  muted: "#6B7280",
  red: "#B91C1C",
  redBg: "#FFE2E2",
  green: "#047857",
  greenBg: "#D0FAE5",
  amber: "#B45309",
  bubble: "#D9FDD3",
} as const;

// ---- Linien-Icons (24er-Raster wie lucide) ----------------------------------------------------
const Stroke: React.FC<{ d: string; color: string; width: number; draw: number; len: number }> = ({ d, color, width, draw, len }) => (
  <path
    d={d}
    fill="none"
    stroke={color}
    strokeWidth={width}
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeDasharray={len}
    strokeDashoffset={len * (1 - clamp01(draw))}
  />
);

type IconProps = { size: number; color: string; draw?: number; width?: number };

export const IconCheck: React.FC<IconProps> = ({ size, color, draw = 1, width = 2.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ overflow: "visible", flex: "none" }}>
    <Stroke d="M20 6 9 17l-5-5" color={color} draw={draw} width={width} len={24} />
  </svg>
);

export const IconX: React.FC<IconProps> = ({ size, color, draw = 1, width = 2.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ overflow: "visible", flex: "none" }}>
    <Stroke d="M18 6 6 18" color={color} draw={clamp01(draw * 2)} width={width} len={18} />
    <Stroke d="M6 6l12 12" color={color} draw={clamp01(draw * 2 - 1)} width={width} len={18} />
  </svg>
);

export const IconCheckDouble: React.FC<IconProps> = ({ size, color, draw = 1, width = 2.6 }) => (
  <svg width={size * 1.25} height={size} viewBox="0 0 30 24" style={{ overflow: "visible", flex: "none" }}>
    <Stroke d="M2 12.5l4.5 4.5L17 6.5" color={color} draw={clamp01(draw * 1.8)} width={width} len={22} />
    <Stroke d="M12.5 16l1 1L27 6.5" color={color} draw={clamp01(draw * 1.8 - 0.8)} width={width} len={18} />
  </svg>
);

// ---- Badge im App-Stil ----------------------------------------------------------------------
export const AppBadge: React.FC<{ text: string; bg: string; color: string; fontSize?: number; style?: React.CSSProperties }> = ({
  text,
  bg,
  color,
  fontSize = 28,
  style,
}) => (
  <span
    style={{
      display: "inline-flex",
      alignItems: "center",
      height: fontSize * 1.75,
      padding: `0 ${fontSize * 0.6}px`,
      borderRadius: fontSize,
      backgroundColor: bg,
      color,
      fontFamily,
      fontWeight: FONT_REGULAR,
      fontSize,
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {text}
  </span>
);

// ---- Callout: springt als 3D-Karte aus dem Screen ------------------------------------------
export const Callout: React.FC<{
  /** Punkt im Video, aus dem die Karte kommt (z. B. projizierte Zeile) */
  anchor: Pt;
  /** linke obere Ecke der Karte im Ziel */
  pos: Pt;
  width: number;
  at: number;
  exitAt?: number;
  children: React.ReactNode;
  /** Verbindungslinie zeichnen */
  connector?: boolean;
  accent?: string;
  tilt?: number;
  style?: React.CSSProperties;
}> = ({ anchor, pos, width, at, exitAt, children, connector = true, accent = APP.red, tilt = -10, style }) => {
  const f = useAbsFrame();
  if (f < at - 1) return null;
  const p = sp(f, at, POP);
  const g = sp(f, at, GLIDE, { durationInFrames: 16 });
  const q = exitAt !== undefined ? sp(f, exitAt, SNAP, { durationInFrames: 8 }) : 0;
  if (q > 0.995) return null;
  const x = mix(g, anchor.x - width * 0.35, pos.x);
  const y = mix(g, anchor.y - 30, pos.y) - q * 40;
  const op = clamp01(p * 2) * (1 - q);
  const lineDraw = clamp01((g - 0.2) / 0.8);
  return (
    <>
      {connector ? (
        <svg width={1080} height={1920} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity: op }}>
          <circle cx={anchor.x} cy={anchor.y} r={7 * clamp01(p)} fill={accent} />
          <line
            x1={anchor.x}
            y1={anchor.y}
            x2={mix(lineDraw, anchor.x, x + 26)}
            y2={mix(lineDraw, anchor.y, y + 40)}
            stroke={rgba(accent, 0.85)}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </svg>
      ) : null}
      <div style={{ position: "absolute", inset: 0, perspective: 1400, perspectiveOrigin: `${anchor.x}px ${anchor.y}px` }}>
        <div
          style={{
            position: "absolute",
            left: x,
            top: y,
            width,
            boxSizing: "border-box",
            padding: "26px 30px 28px",
            borderRadius: 30,
            backgroundColor: "#FFFFFF",
            fontFamily,
            color: APP.text,
            opacity: op,
            transformOrigin: "0% 50%",
            transform: `rotateY(${mix(clamp01(g), tilt * 2.2, tilt).toFixed(2)}deg) translateZ(${mix(clamp01(g), -80, 40).toFixed(1)}px) scale(${mix(
              clamp01(p),
              0.92,
              1,
            ).toFixed(4)})`,
            filter: p < 0.98 || q > 0.02 ? `blur(${(6 * clamp01(1 - p) + 6 * q).toFixed(2)}px)` : undefined,
            boxShadow: `0 ${mix(g, 8, 34).toFixed(1)}px ${mix(g, 20, 70).toFixed(1)}px ${rgba("#02060D", 0.45)}, 0 0 0 1px ${rgba("#0F1C2E", 0.06)}`,
            ...style,
          }}
        >
          {children}
        </div>
      </div>
    </>
  );
};

// ---- Chip auf Tinte -------------------------------------------------------------------------
export const InkChip: React.FC<{
  at: number;
  exitAt?: number;
  children: React.ReactNode;
  icon?: React.ReactNode;
  style?: React.CSSProperties;
  fontSize?: number;
  origin?: string;
}> = ({ at, exitAt, children, icon, style, fontSize = 40, origin = "50% 50%" }) => {
  const f = useAbsFrame();
  if (f < at - 1) return null;
  const p = sp(f, at, POP);
  const q = exitAt !== undefined ? sp(f, exitAt, SNAP, { durationInFrames: 8 }) : 0;
  return (
    <div
      style={{
        position: "absolute",
        height: fontSize * 1.9,
        padding: `0 ${fontSize * 0.75}px 0 ${fontSize * (icon ? 0.55 : 0.75)}px`,
        display: "flex",
        alignItems: "center",
        gap: fontSize * 0.4,
        borderRadius: fontSize,
        backgroundColor: rgba(C.sky, 0.09),
        boxShadow: `inset 0 0 0 1.5px ${rgba(C.sky, 0.32)}`,
        color: C.sky,
        fontFamily,
        fontSize,
        fontWeight: FONT_REGULAR,
        whiteSpace: "nowrap",
        opacity: clamp01(p * 1.6) * (1 - q),
        translate: `0 ${((1 - p) * 22 - q * 30).toFixed(2)}px`,
        scale: String(mix(clamp01(p), 0.94, 1)),
        transformOrigin: origin,
        filter: p < 0.97 || q > 0.02 ? `blur(${(6 * clamp01(1 - p) + 6 * q).toFixed(2)}px)` : undefined,
        ...style,
      }}
    >
      {icon}
      {children}
    </div>
  );
};

export const boldStyle: React.CSSProperties = { fontWeight: FONT_BOLD };
