/**
 * Aufruf-Pille „Jetzt Demo anfragen“ – Look der GlowPill (Hook-Pille, t02.75): Umriss zeichnet sich von links,
 * Breite wächst mit jedem Anschlag, Manrope 800 mit Glow und Cursor. Dazu, was die GlowPill nicht kann:
 * am Ende mittig stehen, beim Tipp eindrücken, danach als Knopf aufleuchten (satte Füllung) und den Cursor abgeben.
 */
import React from "react";
import { fontFamily } from "../../fonts";
import { Cursor, NEON, clamp01, cursorBlink, easeOut, extrudeLit, glowPillLayout, invLerp, rgba, textGlow } from "../../neon";
import { L, T } from "../leitsatz/zeit";

export const CTA_TEXT = "Jetzt Demo anfragen";
export const CTA_SIZE = 62;

export const ctaLayout = (f: number) => glowPillLayout({ text: CTA_TEXT, f, typeStart: T.tippen, cps: T.tippCps, fontSize: CTA_SIZE });

/** Maße der fertig getippten Pille; linke Kante so, dass sie am Ende mittig steht */
export const ctaFinal = () => {
  const l = ctaLayout(T.tippen + 600);
  return { width: l.width, height: l.height, left: L.cx - l.width / 2, padX: l.padX };
};

export const CtaPill: React.FC<{
  f: number;
  /** 0..1 Druck beim Tipp */
  press: number;
  /** 0..1 Knopf leuchtet (nach dem Tipp) */
  active: number;
  /** 0..1 Cursor sichtbar */
  cursorOn: number;
  /** 0..1 Glanzlicht läuft einmal über den Knopf (undefined = keins) */
  sheen?: number;
}> = ({ f, press, active, cursorOn, sheen }) => {
  const Lp = ctaLayout(f);
  const d = easeOut(invLerp(T.tippen - 8, T.tippen + 14, f), 2);
  if (d <= 0.001) return null;
  // ohne Cursor fällt der Platz rechts weg, die Pille bleibt mittig
  const noCursor = (1 - clamp01(cursorOn)) * CTA_SIZE * 0.3;
  const w = Lp.width - noCursor;
  const h = Lp.height;
  const r = Math.min(h / 2, Lp.lineH / 2 + Lp.padY);
  const s = CTA_SIZE / 90;
  // als Knopf atmet das Leuchten ganz leicht
  const act = clamp01(active) * (1 + 0.08 * Math.sin((f - T.tipp) * 0.12) * clamp01(active));
  const glowK = 1.15 + 0.4 * Math.exp(-Math.max(0, f - Lp.last) / 8) + 0.35 * act;
  const shadow = [...extrudeLit(4, s), textGlow(glowK, NEON.sky, NEON.electric, s)].join(", ");
  const upper = `M 0 ${h / 2} L 0 ${r} A ${r} ${r} 0 0 1 ${r} 0 L ${w - r} 0 A ${r} ${r} 0 0 1 ${w} ${r} L ${w} ${h / 2}`;
  const lower = `M 0 ${h / 2} L 0 ${h - r} A ${r} ${r} 0 0 0 ${r} ${h} L ${w - r} ${h} A ${r} ${r} 0 0 0 ${w} ${h - r} L ${w} ${h / 2}`;
  const textW = Math.max(40, Lp.cursorX - Lp.padX);
  const sc = 1 - 0.055 * clamp01(press);
  const str = CTA_TEXT.slice(0, Lp.shown);
  const id = "cta";
  return (
    <div
      style={{
        position: "absolute",
        // wächst von der Mitte aus nach beiden Seiten (Endkarte ist mittig gesetzt)
        left: L.cx - w / 2,
        top: L.pilleY - h / 2,
        width: w,
        height: h,
        transform: sc < 0.9999 ? `scale(${sc.toFixed(4)})` : undefined,
        transformOrigin: "50% 50%",
      }}
    >
      {/* Dunst hinter der Pille; als Knopf deutlich heller */}
      <div
        style={{
          position: "absolute",
          left: -w * 0.14,
          top: -h * 0.9,
          width: w * 1.28,
          height: h * 2.8,
          background: `radial-gradient(50% 50% at 50% 50%, ${rgba(NEON.blue, 0.2 + 0.22 * act)} 0%, ${rgba(NEON.blue, 0.07 + 0.08 * act)} 45%, ${rgba(NEON.blue, 0)} 75%)`,
        }}
      />
      <svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <defs>
          <linearGradient id={`${id}-u`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={w} y2={0}>
            <stop offset={0} stopColor={NEON.ice} stopOpacity={1} />
            <stop offset={Math.min(0.3, (r * 1.2) / w)} stopColor={NEON.sky} stopOpacity={0.95} />
            <stop offset={0.55} stopColor={NEON.blue} stopOpacity={0.62 + 0.3 * act} />
            <stop offset={1} stopColor={NEON.electric} stopOpacity={0.22 + 0.5 * act} />
          </linearGradient>
          <linearGradient id={`${id}-l`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={w} y2={0}>
            <stop offset={0} stopColor={NEON.sky} stopOpacity={0.85} />
            <stop offset={0.4} stopColor={NEON.blue} stopOpacity={0.85} />
            <stop offset={1} stopColor={NEON.electric} stopOpacity={0.55 + 0.35 * act} />
          </linearGradient>
          <linearGradient id={`${id}-f`} x1={0} y1={0} x2={0} y2={1}>
            <stop offset={0} stopColor={NEON.blue} stopOpacity={0.09 * d} />
            <stop offset={1} stopColor={NEON.abyss} stopOpacity={0.18 * d} />
          </linearGradient>
          {/* Knopf-Füllung: satiniertes Vereinsblau, oben heller */}
          <linearGradient id={`${id}-a`} x1={0} y1={0} x2={0} y2={1}>
            <stop offset={0} stopColor="#4F7FF5" stopOpacity={0.78} />
            <stop offset={0.5} stopColor={NEON.electric} stopOpacity={0.62} />
            <stop offset={1} stopColor={NEON.deep} stopOpacity={0.7} />
          </linearGradient>
          <filter id={`${id}-b1`} x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation={3 * s} />
          </filter>
          <filter id={`${id}-b2`} x="-30%" y="-80%" width="160%" height="260%">
            <feGaussianBlur stdDeviation={13 * s} />
          </filter>
        </defs>
        <rect x={0} y={0} width={w} height={h} rx={r} fill={`url(#${id}-f)`} />
        {act > 0.002 ? <rect x={1} y={1} width={w - 2} height={h - 2} rx={r - 1} fill={`url(#${id}-a)`} opacity={act} /> : null}
        <ellipse cx={Lp.padX + textW / 2} cy={h / 2} rx={textW * 0.58} ry={h * 0.32} fill={rgba(NEON.electric, 0.3 + 0.2 * act)} filter={`url(#${id}-b2)`} />
        {[upper, lower].map((path, i) => {
          const dd = clamp01(i === 0 ? d * 0.96 : d * 1.04);
          if (dd <= 0.001) return null;
          const stroke = `url(#${id}-${i === 0 ? "u" : "l"})`;
          return (
            <g key={i}>
              <path d={path} pathLength={1} fill="none" stroke={NEON.blue} strokeWidth={9 * s} strokeDasharray={`${dd} 2`} filter={`url(#${id}-b2)`} opacity={0.42 + 0.3 * act} />
              <path d={path} pathLength={1} fill="none" stroke={stroke} strokeWidth={4.5 * s} strokeDasharray={`${dd} 2`} filter={`url(#${id}-b1)`} opacity={0.6} />
              <path d={path} pathLength={1} fill="none" stroke={stroke} strokeWidth={2 * s} strokeDasharray={`${dd} 2`} strokeLinecap="round" />
            </g>
          );
        })}
      </svg>
      <div
        style={{
          position: "absolute",
          left: Lp.padX,
          top: Lp.padY,
          height: Lp.lineH,
          lineHeight: `${Lp.lineH}px`,
          whiteSpace: "pre",
          fontFamily,
          fontWeight: 800,
          fontSize: CTA_SIZE,
          letterSpacing: `${Lp.ls}em`,
          color: NEON.ice,
          textShadow: shadow,
        }}
      >
        {str}
        {cursorOn > 0.01 ? <Cursor opacity={cursorBlink(f, Lp.last) * cursorOn} color={NEON.sky} gap={0.09} width={0.085} glow={1.2} /> : null}
      </div>
      {sheen !== undefined && sheen > 0.001 && sheen < 0.999 ? (
        <div style={{ position: "absolute", inset: 0, borderRadius: r, overflow: "hidden", pointerEvents: "none", mixBlendMode: "screen" }}>
          <div
            style={{
              position: "absolute",
              top: -h * 0.3,
              left: (-0.35 + 1.5 * easeOut(sheen, 2)) * w,
              width: w * 0.22,
              height: h * 1.6,
              transform: "skewX(-24deg)",
              background: `linear-gradient(90deg, ${rgba("#FFFFFF", 0)} 0%, ${rgba(NEON.ice, 0.28 * Math.sin(Math.PI * sheen))} 50%, ${rgba("#FFFFFF", 0)} 100%)`,
            }}
          />
        </div>
      ) : null}
    </div>
  );
};
