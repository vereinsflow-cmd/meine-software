/**
 * GlassPanel – dunkle, durchscheinende Karte mit Lichtkante, Innenlicht, äußerem Glow und Glanzstreifen.
 * Glaswirkung aus wenigen Verläufen (kein Weichzeichner): Rahmen zur Lichtseite fast weiß, Glanzpunkt in der Lichtecke,
 * Fresnel-Saum an den Rändern, ruhiger Spiegelstreif, Innenschein in Markenblau, Schatten innen unten (Glasdicke).
 * ScreenPanel – dieselbe Karte als „Bildschirm“: zeigt eine App-Seite aus src/ui (Bildraum 1170 px breit), skaliert.
 *
 *   tint   0 = dunkles Glas (Kennzahlenkarten, Referenz t08.25) … 1 = sattes Vereinsblau-Glas (schwebende Karten, t03.75)
 *   glow   äußerer Schein in Vereinsblau (0 … ~1,5)
 *   edge   Helligkeit des 1-px-Rahmens (oben am hellsten, Lichtrichtung `light` in Grad, 0 = von oben)
 *   sheen  0..1 – diagonaler Glanzstreifen läuft einmal durch (undefined = keiner)
 *   frost  Milchglas (backdrop-filter, px) – teuer, nur wenn wirklich etwas dahinter liegt
 *
 *   <ScreenPanel width={420} screenHeight={1500}><AppShell><MembersPage /></AppShell></ScreenPanel>
 *   tone: "native" = App-Seite unverändert (der UI-Baukasten zeigt den echten Dunkelmodus der App),
 *         "dim" = zusätzlich abgedunkelt und leicht blau getönt (für Karten im Hintergrund)
 */
import React, { useId } from "react";
import { NEON, boxGlow, rgba } from "./palette";
import { clamp01, lerp } from "./util";

export type GlassPanelProps = {
  width: number;
  height: number;
  radius?: number;
  tint?: number;
  glow?: number;
  glowColor?: string;
  edge?: number;
  /** Lichtrichtung in Grad (0 = von oben, −40 = von oben links) */
  light?: number;
  sheen?: number;
  frost?: number;
  /** Innenabstand des Inhalts */
  padding?: number | string;
  style?: React.CSSProperties;
  contentStyle?: React.CSSProperties;
  children?: React.ReactNode;
};

export const GlassPanel: React.FC<GlassPanelProps> = ({
  width,
  height,
  radius = 34,
  tint = 0,
  glow = 0.6,
  glowColor = NEON.blue,
  edge = 1,
  light = -25,
  sheen,
  frost = 0,
  padding = 0,
  style,
  contentStyle,
  children,
}) => {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const t = clamp01(tint);
  // Verlaufsachse des Rahmens aus der Lichtrichtung
  const a = (light * Math.PI) / 180;
  const cx = width / 2;
  const cy = height / 2;
  const L = Math.hypot(width, height) / 2;
  const x1 = cx + Math.sin(a) * L;
  const y1 = cy - Math.cos(a) * L;
  const x2 = cx - Math.sin(a) * L;
  const y2 = cy + Math.cos(a) * L;
  const r = Math.min(radius, width / 2, height / 2);

  // dunkles Glas: fast Grundfarbe, oben ein Hauch Blau; sattes Glas: oben leuchtendes Vereinsblau, unten tiefes Blau
  const dark = `linear-gradient(168deg, rgba(22, 36, 84, 0.8) 0%, rgba(10, 16, 36, 0.76) 40%, rgba(4, 7, 17, 0.88) 100%)`;
  const sat = `linear-gradient(166deg, rgba(64, 110, 244, 0.8) 0%, rgba(38, 76, 214, 0.66) 30%, rgba(20, 44, 160, 0.66) 62%, rgba(9, 20, 82, 0.84) 100%)`;
  const sheenX = sheen === undefined ? null : lerp(-0.75, 1.15, clamp01(sheen));
  // Glasdicke: Lichtkante innen oben, Innenschein an den Rändern, Schatten innen unten
  const inner = [
    `inset 0 1px 0 ${rgba("#FFFFFF", 0.2 + 0.14 * t)}`,
    `inset 0 0 0 1px ${rgba(NEON.sky, 0.05 + 0.05 * t)}`,
    `inset 0 0 ${Math.round(18 + 16 * t)}px ${rgba(glowColor, 0.14 + 0.22 * t)}`,
    `inset 0 ${-Math.round(height * 0.12)}px ${Math.round(height * 0.22)}px ${rgba(NEON.void, 0.22 + 0.2 * t)}`,
  ].join(", ");

  return (
    <div style={{ position: "relative", width, height, borderRadius: r, boxShadow: boxGlow(glow, glowColor), ...style }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: r,
          overflow: "hidden",
          backdropFilter: frost > 0 ? `blur(${frost}px) saturate(1.2)` : undefined,
          WebkitBackdropFilter: frost > 0 ? `blur(${frost}px) saturate(1.2)` : undefined,
        }}
      >
        {t < 0.999 ? <div style={{ position: "absolute", inset: 0, background: dark, opacity: 1 - t }} /> : null}
        {t > 0.001 ? <div style={{ position: "absolute", inset: 0, background: sat, opacity: t }} /> : null}
        {/* Innenlicht aus der Lichtecke, Fresnel-Saum an den Rändern, ruhiger Spiegelstreif */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: [
              `radial-gradient(110% 60% at 20% -6%, ${rgba(NEON.sky, 0.16 + 0.14 * t)} 0%, ${rgba(NEON.sky, 0.04 + 0.04 * t)} 38%, ${rgba(NEON.sky, 0)} 64%)`,
              `radial-gradient(140% 130% at 50% 42%, ${rgba(NEON.sky, 0)} 60%, ${rgba(NEON.sky, 0.05 + 0.06 * t)} 100%)`,
              `linear-gradient(116deg, ${rgba("#FFFFFF", 0)} 12%, ${rgba("#FFFFFF", 0.06 + 0.03 * t)} 21%, ${rgba("#FFFFFF", 0.02)} 32%, ${rgba("#FFFFFF", 0)} 40%)`,
            ].join(", "),
            boxShadow: inner,
            borderRadius: r,
          }}
        />
        {/* Glanzpunkt: Licht fängt sich in der Kante der Lichtecke */}
        {edge > 0.05 ? (
          <div
            style={{
              position: "absolute",
              left: cx + Math.sin(a) * (width / 2) - Math.min(width, height) * 0.35,
              top: cy - Math.cos(a) * (height / 2) - Math.min(width, height) * 0.35,
              width: Math.min(width, height) * 0.7,
              height: Math.min(width, height) * 0.7,
              borderRadius: "50%",
              background: `radial-gradient(circle, ${rgba("#FFFFFF", 0.13 * Math.min(1.5, edge))} 0%, ${rgba(NEON.sky, 0.05 * Math.min(1.5, edge))} 35%, ${rgba(NEON.sky, 0)} 70%)`,
              mixBlendMode: "screen",
            }}
          />
        ) : null}
        {sheenX !== null ? (
          <div
            style={{
              position: "absolute",
              top: -height * 0.2,
              left: `${(sheenX * 100).toFixed(2)}%`,
              width: "55%",
              height: height * 1.4,
              transform: "skewX(-22deg)",
              background: `linear-gradient(90deg, ${rgba("#FFFFFF", 0)} 0%, ${rgba(NEON.ice, 0.13)} 48%, ${rgba("#FFFFFF", 0.2)} 52%, ${rgba("#FFFFFF", 0)} 100%)`,
              mixBlendMode: "screen",
            }}
          />
        ) : null}
        <div style={{ position: "absolute", inset: 0, padding, boxSizing: "border-box", ...contentStyle }}>{children}</div>
      </div>
      {/* Rahmen: 1,5 px, zur Lichtseite hell (fast weiß), gegenüber gedämpft */}
      <svg width={width} height={height} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
        <defs>
          <linearGradient id={`ge-${uid}`} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
            <stop offset={0} stopColor={NEON.ice} stopOpacity={Math.min(1, 0.9 * edge)} />
            <stop offset={0.22} stopColor={NEON.sky} stopOpacity={Math.min(1, 0.5 * edge)} />
            <stop offset={0.55} stopColor={NEON.blue} stopOpacity={Math.min(1, 0.2 * edge)} />
            <stop offset={1} stopColor={NEON.sky} stopOpacity={Math.min(1, 0.32 * edge)} />
          </linearGradient>
          <filter id={`gb-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation={3} />
          </filter>
        </defs>
        {/* weicher Saum unter der Kante (leuchtet etwas über den Rand) */}
        <rect x={1} y={1} width={width - 2} height={height - 2} rx={Math.max(0, r - 1)} fill="none" stroke={`url(#ge-${uid})`} strokeWidth={3} filter={`url(#gb-${uid})`} opacity={0.7} />
        <rect x={0.75} y={0.75} width={width - 1.5} height={height - 1.5} rx={Math.max(0, r - 0.75)} fill="none" stroke={`url(#ge-${uid})`} strokeWidth={1.5} />
      </svg>
    </div>
  );
};

export type ScreenTone = "native" | "dim";

export type ScreenPanelProps = Omit<GlassPanelProps, "height" | "children" | "padding"> & {
  /** sichtbare Höhe des App-Bildschirms im Bildraum (px bei 1170 Breite) */
  screenHeight?: number;
  /** Bildraum-Breite der Seite (Standard 1170) */
  screenWidth?: number;
  /** Scroll im Bildraum (px) – verschiebt den ganzen Inhalt (für Scroll nur des Inhalts: AppShell scrollY) */
  scrollY?: number;
  tone?: ScreenTone;
  /** Rahmenbreite zwischen Glaskante und Bildschirm (px) */
  bezel?: number;
  children: React.ReactNode;
};

/** Höhe eines ScreenPanel bei gegebener Breite. */
export const screenPanelHeight = (width: number, screenHeight = 1500, bezel = 12, screenWidth = 1170) =>
  bezel * 2 + ((width - bezel * 2) * screenHeight) / screenWidth;

export const ScreenPanel: React.FC<ScreenPanelProps> = ({
  width,
  screenHeight = 1500,
  screenWidth = 1170,
  scrollY = 0,
  tone = "native",
  bezel = 12,
  radius = 34,
  children,
  ...glass
}) => {
  const inner = width - bezel * 2;
  const k = inner / screenWidth;
  const height = screenPanelHeight(width, screenHeight, bezel, screenWidth);
  const filter = tone === "dim" ? "brightness(0.82) saturate(0.95)" : undefined;
  return (
    <GlassPanel width={width} height={height} radius={radius} {...glass}>
      <div
        style={{
          position: "absolute",
          left: bezel,
          top: bezel,
          width: inner,
          height: height - bezel * 2,
          borderRadius: Math.max(4, radius - bezel),
          overflow: "hidden",
          background: "#0A0A0B",
        }}
      >
        <div style={{ position: "absolute", left: 0, top: 0, width: screenWidth, height: screenHeight + scrollY, transform: `scale(${k}) translateY(${-scrollY}px)`, transformOrigin: "0 0", filter }}>
          {children}
        </div>
        {tone === "dim" ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(180deg, ${rgba(NEON.blue, 0.12)} 0%, ${rgba("#04060D", 0.1)} 55%, ${rgba("#04060D", 0.4)} 100%)`,
            }}
          />
        ) : null}
        {/* Glasreflex über dem Bildschirm */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(160deg, ${rgba("#FFFFFF", 0.08)} 0%, ${rgba("#FFFFFF", 0)} 38%)`,
            pointerEvents: "none",
          }}
        />
      </div>
    </GlassPanel>
  );
};
