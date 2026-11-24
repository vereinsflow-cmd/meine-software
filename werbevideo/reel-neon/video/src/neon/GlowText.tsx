/**
 * GlowText – große kinetische Zeile mit Neon-Glow: Wörter kommen einzeln (Unschärfe → scharf, leichtes Steigen,
 * kurzes Aufleuchten), oder der Text wird getippt (mit blinkendem Cursor). Optional leichte 3D-Tiefe (extrude).
 * Cursor – glühender Tipp-Balken, sitzt inline hinter dem letzten Zeichen.
 * GlowPill – die leuchtende Pille der Referenz (t02.75): Umriss zeichnet sich von links, wächst mit dem getippten
 * Text mit (Breite gleitet nach jedem Anschlag nach), Manrope 800 mit Glow, Cursor; optional mit Zeilenumbruch
 * (maxWidth) oder mit Kamera, die dem Cursor folgt (followX).
 *
 *   <GlowText text="Alle Mitglieder an einem Ort" frame={f} start={10} stagger={5} fontSize={88} />
 *   <GlowText text="Ihr Verein läuft …" frame={f} typeStart={0} cps={18} cursor />
 *   <GlowPill text="Ihr Verein läuft immer noch über Excel?" frame={f} typeStart={6} x={70} y={960} followX={940} />
 *
 * Breiten werden per Canvas gemessen (lib/measure) – Manrope muss geladen sein (FontGate / SceneRoot).
 */
import React, { useId } from "react";
import { fontFamily } from "../fonts";
import { textWidth } from "../lib/measure";
import { NEON, extrude as extrudeShadow, extrudeLit, rgba, textGlow } from "./palette";
import { clamp01, cursorBlink, easeOut, invLerp, lerp, typing, useF } from "./util";

export type GlowTextProps = {
  text: string;
  frame?: number;
  /** Startframe je Wort (Länge = Wortzahl); sonst start + i · stagger */
  wordStarts?: number[];
  start?: number;
  stagger?: number;
  /** Dauer eines Wort-Auftritts (Frames) */
  reveal?: number;
  /** "blur" weich aus der Unschärfe, "rise" deutlich von unten, "pop" aus dem Kleinen, "none" sofort */
  mode?: "blur" | "rise" | "pop" | "none";
  /** Tippen statt Wort-Auftritt: Startframe, Zeichen pro Sekunde */
  typeStart?: number;
  cps?: number;
  /** Cursor zeigen: true = beim Tippen und danach blinkend, "typing" = nur solange getippt wird */
  cursor?: boolean | "typing";
  cursorColor?: string;
  fontSize?: number;
  weight?: 500 | 800;
  color?: string;
  wordColors?: (string | undefined)[];
  /** Glow-Stärke (0 … ~1,6) */
  glow?: number;
  glowCore?: string;
  glowOuter?: string;
  /** zusätzliches Aufleuchten beim Auftritt, klingt in ~20 Frames ab */
  flare?: number;
  /** 3D-Tiefe in px (Stufen nach links unten) */
  extrude?: number;
  /** Flanke der 3D-Tiefe: "lit" = beleuchtet (Himmel → Vereinsblau, wie die Referenz), "dark" = Schattenkante */
  extrudeTone?: "lit" | "dark";
  align?: "left" | "center" | "right";
  maxWidth?: number;
  lineHeight?: number;
  /** Laufweite in em */
  letterSpacing?: number;
  /** 0..1 – Abgang (Unschärfe, Ausblenden, leichtes Wegsteigen) */
  exit?: number;
  /** Echo-Geister beim Wort-Auftritt (Anzahl, wie AE „Echo“ in der Referenz t07.75) und ihr Rückstand im Fortschritt */
  echo?: number;
  echoLag?: number;
  style?: React.CSSProperties;
};

/** Auftritt eines Worts (0..1) */
const wordP = (f: number, st: number, dur: number) => easeOut(invLerp(st, st + dur, f), 3);
/** Aufleuchten: steigt mit dem Auftritt, klingt danach ab */
const flareEnv = (f: number, st: number, dur: number) => {
  if (f < st) return 0;
  const up = clamp01((f - st) / Math.max(1, dur * 0.6));
  const down = Math.exp(-Math.max(0, f - st - dur * 0.6) / 12);
  return up * down;
};

export const GlowText: React.FC<GlowTextProps> = ({
  text,
  frame,
  wordStarts,
  start = 0,
  stagger = 4,
  reveal = 16,
  mode = "blur",
  typeStart,
  cps = 18,
  cursor = false,
  cursorColor = NEON.sky,
  fontSize = 88,
  weight = 800,
  color = NEON.ice,
  wordColors,
  glow = 1,
  glowCore = NEON.sky,
  glowOuter = NEON.blue,
  flare = 0.8,
  extrude = 0,
  extrudeTone = "lit",
  align = "center",
  maxWidth,
  lineHeight = 1.12,
  letterSpacing = -0.01,
  exit = 0,
  echo = 0,
  echoLag = 0.2,
  style,
}) => {
  const f = useF(frame);
  const s = fontSize / 90;
  const ex = extrude > 0 ? (extrudeTone === "lit" ? extrudeLit(extrude, s) : extrudeShadow(extrude, NEON.abyss, s)) : [];
  const shadow = (k: number) => {
    const g = textGlow(k, glowCore, glowOuter, s);
    return [...ex, ...(g === "none" ? [] : [g])].join(", ") || "none";
  };
  const e = clamp01(exit);
  const base: React.CSSProperties = {
    fontFamily,
    fontWeight: weight,
    fontSize,
    lineHeight,
    letterSpacing: `${letterSpacing}em`,
    color,
    textAlign: align,
    maxWidth,
    whiteSpace: "normal",
    opacity: 1 - e,
    filter: e > 0.01 ? `blur(${(e * 0.14 * fontSize).toFixed(2)}px)` : undefined,
    transform: e > 0.01 ? `translateY(${(-e * 0.3 * fontSize).toFixed(2)}px)` : undefined,
    ...style,
  };

  if (typeStart !== undefined) {
    const ty = typing(f, typeStart, text, cps);
    const shown = text.slice(0, ty.shown);
    const rest = text.slice(ty.shown);
    const showCursor = cursor === true || (cursor === "typing" && !ty.done && f >= typeStart - 4);
    const k = glow + flare * Math.exp(-Math.max(0, f - ty.last) / 10) * 0.35;
    return (
      <div style={base}>
        <span style={{ textShadow: shadow(k) }}>{shown}</span>
        {showCursor ? <Cursor opacity={cursorBlink(f, ty.last)} color={cursorColor} /> : null}
        <span style={{ visibility: "hidden" }}>{rest}</span>
      </div>
    );
  }

  const words = text.split(" ");
  // Lage eines Worts zum Fortschritt p (für das Wort selbst und seine Echo-Geister)
  const look = (p: number) => {
    const blurPx = mode === "blur" ? (1 - p) * 0.17 * fontSize : mode === "rise" ? (1 - p) * 0.08 * fontSize : (1 - p) * 0.1 * fontSize;
    const y = mode === "rise" ? (1 - p) * 0.55 * fontSize : mode === "blur" ? (1 - p) * 0.22 * fontSize : 0;
    const sc = mode === "pop" ? lerp(0.82, 1, p) : 1 + (1 - p) * 0.04;
    return {
      opacity: clamp01(p * 1.5),
      filter: blurPx > 0.2 ? `blur(${blurPx.toFixed(2)}px)` : undefined,
      transform: p < 1 ? `translateY(${y.toFixed(2)}px) scale(${sc.toFixed(4)})` : undefined,
    };
  };
  return (
    <div style={base}>
      {words.map((w, i) => {
        const st = wordStarts?.[i] ?? start + i * stagger;
        const pAt = (ff: number) => (mode === "none" ? (ff >= st ? 1 : 0) : wordP(ff, st, reveal));
        const p = pAt(f);
        const k = glow + flare * flareEnv(f, st, reveal);
        const ghosts = echo > 0 && p > 0 && p < 0.995 ? Array.from({ length: echo }, (_, g) => g + 1) : [];
        return (
          <React.Fragment key={i}>
            <span style={{ display: "inline-block", position: "relative", color: wordColors?.[i] ?? color }}>
              {ghosts.map((g) => {
                const pg = clamp01(p - g * echoLag);
                if (pg <= 0.001) return null;
                const L = look(pg);
                return (
                  <span key={g} style={{ position: "absolute", left: 0, top: 0, whiteSpace: "nowrap", ...L, opacity: L.opacity * 0.6 * Math.pow(0.6, g - 1) * Math.sqrt(1 - p), textShadow: shadow(k * 0.6) }}>
                    {w}
                  </span>
                );
              })}
              <span style={{ display: "inline-block", ...look(p), textShadow: shadow(k) }}>{w}</span>
            </span>
            {i < words.length - 1 ? " " : null}
          </React.Fragment>
        );
      })}
    </div>
  );
};

/** Glühender Tipp-Balken, inline hinter dem letzten Zeichen (Höhe in em der umgebenden Schrift): weißer Kern, farbiger Schein. */
export const Cursor: React.FC<{ opacity?: number; color?: string; width?: number; gap?: number; glow?: number }> = ({
  opacity = 1,
  color = NEON.sky,
  width = 0.075,
  gap = 0.07,
  glow = 1,
}) => (
  <span style={{ display: "inline-block", position: "relative", width: 0, height: "1em", verticalAlign: "baseline" }}>
    <span
      style={{
        position: "absolute",
        left: `${gap}em`,
        bottom: "-0.16em",
        width: `${width}em`,
        height: "1.06em",
        borderRadius: "0.04em",
        background: `linear-gradient(90deg, ${color} 0%, ${rgba("#FFFFFF", 0.92)} 50%, ${color} 100%)`,
        opacity: clamp01(opacity),
        boxShadow:
          glow > 0
            ? `0 0 0.05em ${rgba("#FFFFFF", 0.7 * glow)}, 0 0 0.16em ${rgba(color, 0.95 * glow)}, 0 0 0.42em ${rgba(color, 0.6 * glow)}, 0 0 0.9em ${rgba(NEON.blue, 0.45 * glow)}`
            : undefined,
      }}
    />
  </span>
);

// ---- GlowPill -----------------------------------------------------------------------------

export type GlowPillProps = {
  text: string;
  frame?: number;
  typeStart?: number;
  cps?: number;
  fontSize?: number;
  /** Ankerpunkt im Videoraum: linke Kante (anchor "left") oder Mitte (anchor "center"), vertikal immer Mitte */
  x?: number;
  y?: number;
  anchor?: "left" | "center";
  /** Kamera folgt dem Cursor: er bleibt höchstens bei dieser x-Position (Videoraum) */
  followX?: number;
  /** Zeilenumbruch ab dieser Textbreite (px) */
  maxWidth?: number;
  /** Umriss 0..1 (Standard: zeichnet sich ab typeStart − 8 in 22 Frames) */
  draw?: number;
  glow?: number;
  extrude?: number;
  /** Flanke der 3D-Tiefe (siehe GlowText) */
  extrudeTone?: "lit" | "dark";
  cursorColor?: string;
  /** 0..1 – Gesamtauftritt (Deckkraft + Unschärfe) */
  appear?: number;
  /** Mindestbreite des Texts (px), bevor getippt wird */
  minTextWidth?: number;
  style?: React.CSSProperties;
};

type PillLine = { s: number; e: number };

const wrapLines = (text: string, fontSize: number, maxWidth: number | undefined, ls: number): PillLine[] => {
  if (!maxWidth) return [{ s: 0, e: text.length }];
  const words = text.split(" ");
  const lines: PillLine[] = [];
  let s = 0;
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (cur && textWidth(test, fontSize, 800, ls) > maxWidth) {
      lines.push({ s, e: s + cur.length + 1 });
      s += cur.length + 1;
      cur = w;
    } else cur = test;
  }
  lines.push({ s, e: text.length });
  return lines;
};

/** Maße der Pille zum Frame: Breite/Höhe, Cursor-Position (lokal), sichtbare Zeilen. */
export const glowPillLayout = (p: { text: string; f: number; typeStart: number; cps?: number; fontSize?: number; maxWidth?: number; minTextWidth?: number }) => {
  const fontSize = p.fontSize ?? 104;
  const ls = -0.012;
  const padX = fontSize * 0.62;
  const padY = fontSize * 0.34;
  const lineH = fontSize * 1.18;
  const ty = typing(p.f, p.typeStart, p.text, p.cps ?? 16);
  const lines = wrapLines(p.text, fontSize, p.maxWidth, ls);
  const n = ty.shown;
  let li = lines.findIndex((l) => n < l.e);
  if (li < 0) li = lines.length - 1;
  // Breite gleitet nach jedem Anschlag in 4 Frames nach (wie ein weicher Caret)
  const glide = easeOut(clamp01((p.f - ty.last) / 4), 2);
  // fertige Zeilen ohne Leerzeichen am Umbruch messen; in der Cursor-Zeile zählt ein getipptes Leerzeichen mit
  const lineW = (i: number, upto: number, keepSpace: boolean) => {
    const l = lines[i];
    const raw = p.text.slice(l.s, Math.max(l.s, Math.min(l.e, upto)));
    const str = keepSpace ? raw : raw.replace(/\s+$/, "");
    return str ? textWidth(str, fontSize, 800, ls) : 0;
  };
  const cur = n > lines[li].s ? lerp(lineW(li, n - 1, true), lineW(li, n, true), glide) : 0;
  let maxW = p.minTextWidth ?? fontSize * 0.6;
  for (let i = 0; i < li; i++) maxW = Math.max(maxW, lineW(i, lines[i].e, false));
  maxW = Math.max(maxW, cur);
  const cursorSpace = fontSize * 0.3;
  const width = padX * 2 + maxW + cursorSpace;
  const height = padY * 2 + lineH * (li + 1);
  return { width, height, padX, padY, lineH, lines, lineIndex: li, cursorX: padX + cur, cursorY: padY + li * lineH, shown: n, last: ty.last, done: ty.done, ls };
};

export const GlowPill: React.FC<GlowPillProps> = ({
  text,
  frame,
  typeStart = 0,
  cps = 16,
  fontSize = 104,
  x = 80,
  y = 960,
  anchor = "left",
  followX,
  maxWidth,
  draw,
  glow = 1.25,
  extrude = 5,
  extrudeTone = "lit",
  cursorColor = NEON.sky,
  appear = 1,
  minTextWidth,
  style,
}) => {
  const f = useF(frame);
  const L = glowPillLayout({ text, f, typeStart, cps, fontSize, maxWidth, minTextWidth });
  const d = draw ?? easeOut(invLerp(typeStart - 8, typeStart + 14, f), 2);
  const r = Math.min(L.height / 2, L.lineH / 2 + L.padY);
  const w = L.width;
  const h = L.height;
  const left = anchor === "center" ? x - w / 2 : x;
  const shift = followX !== undefined ? Math.min(0, followX - (left + L.cursorX)) : 0;
  const a = clamp01(appear);
  const s = fontSize / 90;
  const ex = extrude > 0 ? (extrudeTone === "lit" ? extrudeLit(extrude, s) : extrudeShadow(extrude, NEON.abyss, s)) : [];
  // Anschlag lässt die Schrift kurz aufglühen
  const shadow = [...ex, textGlow(glow + 0.4 * Math.exp(-Math.max(0, f - L.last) / 8), NEON.sky, NEON.electric, s)].join(", ");
  // Umriss: obere und untere Hälfte, beide von der Mitte links nach rechts
  const upper = `M 0 ${h / 2} L 0 ${r} A ${r} ${r} 0 0 1 ${r} 0 L ${w - r} 0 A ${r} ${r} 0 0 1 ${w} ${r} L ${w} ${h / 2}`;
  const lower = `M 0 ${h / 2} L 0 ${h - r} A ${r} ${r} 0 0 0 ${r} ${h} L ${w - r} ${h} A ${r} ${r} 0 0 0 ${w} ${h - r} L ${w} ${h / 2}`;
  const dTop = clamp01(d * 0.96);
  const dBot = clamp01(d * 1.04);
  const gid = `gp-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const textW = Math.max(40, L.cursorX - L.padX);
  return (
    <div
      style={{
        position: "absolute",
        left: left + shift,
        top: y - h / 2,
        width: w,
        height: h,
        opacity: a,
        filter: a < 0.999 ? `blur(${((1 - a) * 12).toFixed(2)}px)` : undefined,
        ...style,
      }}
    >
      {/* schwacher Dunst hinter der Pille (das Licht kommt aus Schrift und Kante, nicht aus einer Fläche) */}
      <div
        style={{
          position: "absolute",
          left: -w * 0.12,
          top: -h * 0.8,
          width: w * 1.24,
          height: h * 2.6,
          background: `radial-gradient(50% 50% at ${(((L.padX + textW / 2) / w) * 100).toFixed(1)}% 50%, ${rgba(NEON.blue, 0.2 * glow)} 0%, ${rgba(NEON.blue, 0.07 * glow)} 45%, ${rgba(NEON.blue, 0)} 75%)`,
        }}
      />
      <svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <defs>
          {/* oben: Lichtbogen links fast weiß, läuft nach rechts aus; unten: gleichmäßiger, satter (wie t02.75) */}
          <linearGradient id={`${gid}-u`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={w} y2={0}>
            <stop offset={0} stopColor={NEON.ice} stopOpacity={1} />
            <stop offset={Math.min(0.3, (r * 1.2) / w)} stopColor={NEON.sky} stopOpacity={0.95} />
            <stop offset={0.55} stopColor={NEON.blue} stopOpacity={0.62} />
            <stop offset={1} stopColor={NEON.electric} stopOpacity={0.22} />
          </linearGradient>
          <linearGradient id={`${gid}-l`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={w} y2={0}>
            <stop offset={0} stopColor={NEON.sky} stopOpacity={0.85} />
            <stop offset={0.4} stopColor={NEON.blue} stopOpacity={0.85} />
            <stop offset={1} stopColor={NEON.electric} stopOpacity={0.55} />
          </linearGradient>
          <linearGradient id={`${gid}-f`} x1={0} y1={0} x2={0} y2={1}>
            <stop offset={0} stopColor={NEON.blue} stopOpacity={0.09 * d} />
            <stop offset={1} stopColor={NEON.abyss} stopOpacity={0.18 * d} />
          </linearGradient>
          <filter id={`${gid}-b1`} x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation={3 * s} />
          </filter>
          <filter id={`${gid}-b2`} x="-30%" y="-80%" width="160%" height="260%">
            <feGaussianBlur stdDeviation={13 * s} />
          </filter>
        </defs>
        {/* Innenfläche (Hauch) + Licht, das die Schrift in die Pille wirft */}
        <rect x={0} y={0} width={w} height={h} rx={r} fill={`url(#${gid}-f)`} />
        <ellipse cx={L.padX + textW / 2} cy={h / 2} rx={textW * 0.58} ry={h * 0.32} fill={rgba(NEON.electric, 0.3 * glow)} filter={`url(#${gid}-b2)`} />
        {[upper, lower].map((path, i) => {
          const dd = i === 0 ? dTop : dBot;
          if (dd <= 0.001) return null;
          const stroke = `url(#${gid}-${i === 0 ? "u" : "l"})`;
          return (
            <g key={i}>
              <path d={path} pathLength={1} fill="none" stroke={NEON.blue} strokeWidth={9 * s} strokeDasharray={`${dd} 2`} filter={`url(#${gid}-b2)`} opacity={0.4 * glow} />
              <path d={path} pathLength={1} fill="none" stroke={stroke} strokeWidth={4.5 * s} strokeDasharray={`${dd} 2`} filter={`url(#${gid}-b1)`} opacity={0.6} />
              <path d={path} pathLength={1} fill="none" stroke={stroke} strokeWidth={2 * s} strokeDasharray={`${dd} 2`} strokeLinecap="round" />
            </g>
          );
        })}
      </svg>
      {L.lines.slice(0, L.lineIndex + 1).map((l, i) => {
        const isCur = i === L.lineIndex;
        const raw = text.slice(l.s, isCur ? L.shown : l.e);
        // fertige Zeilen ohne Leerzeichen am Umbruch; in der aktuellen Zeile steht der Cursor auch hinter einem Leerzeichen
        const str = isCur ? raw : raw.replace(/\s+$/, "");
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: L.padX,
              top: L.padY + i * L.lineH,
              height: L.lineH,
              lineHeight: `${L.lineH}px`,
              whiteSpace: "pre",
              fontFamily,
              fontWeight: 800,
              fontSize,
              letterSpacing: `${L.ls}em`,
              color: NEON.ice,
              textShadow: shadow,
            }}
          >
            {str}
            {isCur ? <Cursor opacity={cursorBlink(f, L.last)} color={cursorColor} gap={0.09} width={0.085} glow={1.2} /> : null}
          </div>
        );
      })}
    </div>
  );
};
