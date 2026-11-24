/**
 * Der orange VereinsFlow-Punkt als Heldenlicht (ersetzt den Vierzackstern der Referenz).
 *
 *   DotBurst    glühende Kugel mit weißem Kern, Hof, anamorphotischem Streifen (orange + feine Himmel-Linie),
 *               Lichtstrahlen, Flug entlang eines Pfads mit Kometenschweif und Dehnung in Flugrichtung,
 *               Explosion/Puls (Lichtring + Blitz)
 *   LogoReveal  VereinsFlow-Logo (Bildmarke aus LogoMark, tone „dark“): V-Etappen gleiten ein, Wortmarke erscheint
 *               Buchstabe für Buchstabe mit weiter Laufweite, die sich zusammenzieht (Referenz t12.25–t13.75; echte
 *               Logo-Pfade, je Buchstabe verschoben), i-Punkt und Unterstreichung folgen
 *   LightFloor  breiter, weicher Lichtkegel vom unteren Bildrand (t13.25)
 *
 *   <DotBurst frame={f} path={[{x:-80,y:1500},{x:400,y:1100},{x:540,y:960}]} pathProgress={fly} trail={0.25} burst={b} />
 *   <LogoReveal frame={f} start={40} x={540} y={900} width={860} hideDot />   (Punkt: logoDotPosition(...))
 */
import React, { useId } from "react";
import { getBoundingBox, getSubpaths } from "@remotion/paths";
import { LOGO_VIEWBOX, Logo, logoDotCenter, logoHeight } from "../components/LogoMark";
import { WORD_FLOW, WORD_VEREINS } from "../brand/logoPaths";
import { H, W } from "../theme";
import { NEON, rgba } from "./palette";
import { Pt, catmull, clamp01, easeOut, easeOutExpo, hash, invLerp, lerp, smooth, useF } from "./util";

// ---- DotBurst -----------------------------------------------------------------------------

export type DotBurstProps = {
  frame?: number;
  /** Position im Videoraum (ohne Pfad) */
  x?: number;
  y?: number;
  /** Flugbahn (Catmull-Rom durch die Punkte) und Fortschritt 0..1 darauf */
  path?: Pt[];
  pathProgress?: number;
  /** Schweiflänge als Anteil der Bahn */
  trail?: number;
  /** Durchmesser (px) */
  size?: number;
  glow?: number;
  /** anamorphotischer Streifen 0..1 */
  flare?: number;
  /** Lichtstrahlen 0..1 */
  rays?: number;
  /** 0..1 – Explosion (Lichtring + Blitz) */
  burst?: number;
  /** 0..1 – Skalierungs-Puls (+40 %) */
  pulse?: number;
  opacity?: number;
  width?: number;
  height?: number;
};

export const DotBurst: React.FC<DotBurstProps> = ({
  frame,
  x = W / 2,
  y = H / 2,
  path,
  pathProgress = 1,
  trail = 0.18,
  size = 44,
  glow = 1,
  flare = 0.6,
  rays = 0.5,
  burst = 0,
  pulse = 0,
  opacity = 1,
  width = W,
  height = H,
}) => {
  const f = useF(frame);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const pp = clamp01(pathProgress);
  const pos = path ? catmull(path, pp) : { x, y };
  // Geschwindigkeit → Dehnung in Flugrichtung
  let angle = 0;
  let stretch = 1;
  if (path && pp > 0 && pp < 1) {
    const a = catmull(path, Math.max(0, pp - 0.01));
    const b = catmull(path, Math.min(1, pp + 0.01));
    angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    stretch = 1 + Math.min(1.6, Math.hypot(b.x - a.x, b.y - a.y) / (size * 0.9));
  }
  const sz = size * (1 + 0.4 * pulse);
  const bu = clamp01(burst);
  // Blitz: schneller Anstieg, kurzes Nachglühen (sonst steht eine helle Scheibe im Bild)
  const flash = burst > 0 && burst < 1 ? (bu < 0.08 ? bu / 0.08 : Math.pow(1 - (bu - 0.08) / 0.92, 4)) : 0;
  const g = glow * (1 + 1.2 * flash);
  // Schweif: Stützpunkte hinter dem Punkt
  const trailPts: Pt[] = [];
  if (path && trail > 0 && pp > 0) {
    const N = 18;
    for (let k = 0; k <= N; k++) {
      const q = pp - (trail * k) / N;
      if (q < 0) break;
      trailPts.push(catmull(path, q));
    }
  }
  const rot = f * 0.35;
  const abs = (l: number, t: number, w: number, h: number, extra?: React.CSSProperties): React.CSSProperties => ({ position: "absolute", left: l - w / 2, top: t - h / 2, width: w, height: h, ...extra });

  return (
    <div style={{ position: "absolute", left: 0, top: 0, width, height, pointerEvents: "none", opacity, mixBlendMode: "screen" }}>
      {/* Schweif */}
      {trailPts.length > 2 ? (
        <svg width={width} height={height} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
          <defs>
            <filter id={`dot-trail-${uid}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation={sz * 0.35} />
            </filter>
          </defs>
          {trailPts.slice(0, -1).map((p, k) => {
            const q = trailPts[k + 1];
            const t = k / (trailPts.length - 1);
            return (
              <g key={k}>
                <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={rgba(NEON.orange, 0.5 * (1 - t))} strokeWidth={sz * 1.4 * (1 - t)} strokeLinecap="round" filter={`url(#dot-trail-${uid})`} />
                <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={rgba("#FFD9C7", 0.85 * Math.pow(1 - t, 1.5))} strokeWidth={sz * 0.42 * (1 - t)} strokeLinecap="round" />
              </g>
            );
          })}
        </svg>
      ) : null}
      {/* weiter Dunst + Hof */}
      <div style={abs(pos.x, pos.y, sz * 22 * g, sz * 22 * g, { borderRadius: "50%", background: `radial-gradient(circle, ${rgba(NEON.orange, 0.16)} 0%, ${rgba(NEON.orange, 0.05)} 35%, ${rgba(NEON.orange, 0)} 70%)` })} />
      <div style={abs(pos.x, pos.y, sz * 7 * g, sz * 7 * g, { borderRadius: "50%", background: `radial-gradient(circle, ${rgba("#FFB08F", 0.62)} 0%, ${rgba(NEON.orange, 0.3)} 30%, ${rgba(NEON.orange, 0)} 70%)` })} />
      {/* Lichtstrahlen */}
      {rays > 0.01
        ? Array.from({ length: 12 }, (_, i) => {
            const len = sz * (3.5 + 7 * hash(i * 1.37)) * (0.6 + 0.4 * rays) * (1 + flash);
            const ang = (i / 12) * 360 + hash(i * 3.1) * 18 + rot;
            const a = (0.18 + 0.32 * hash(i * 5.7)) * rays * (0.7 + 0.3 * Math.sin(f * 0.11 + i * 1.9));
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: pos.x,
                  top: pos.y - sz * 0.07,
                  width: len,
                  height: sz * 0.14,
                  transformOrigin: "0 50%",
                  transform: `rotate(${ang.toFixed(2)}deg)`,
                  background: `linear-gradient(90deg, ${rgba("#FFE3D6", a)} 0%, ${rgba(NEON.orange, a * 0.6)} 35%, ${rgba(NEON.orange, 0)} 100%)`,
                  filter: "blur(2px)",
                  borderRadius: sz,
                }}
              />
            );
          })
        : null}
      {/* anamorphotischer Streifen: orange Kern, feine Himmel-Linie */}
      {flare > 0.01 ? (
        <>
          <div style={abs(pos.x, pos.y, sz * 26 * flare * (1 + flash), sz * 0.34, { borderRadius: "50%", background: `linear-gradient(90deg, ${rgba(NEON.orange, 0)} 0%, ${rgba(NEON.orange, 0.42)} 35%, ${rgba("#FFF1EA", 0.95)} 50%, ${rgba(NEON.orange, 0.42)} 65%, ${rgba(NEON.orange, 0)} 100%)`, filter: "blur(1.5px)" })} />
          <div style={abs(pos.x, pos.y, sz * 38 * flare * (1 + flash), Math.max(1.5, sz * 0.05), { background: `linear-gradient(90deg, ${rgba(NEON.sky, 0)} 0%, ${rgba(NEON.sky, 0.55)} 50%, ${rgba(NEON.sky, 0)} 100%)` })} />
        </>
      ) : null}
      {/* Explosion: weiche Licht-Druckwelle (Verlaufsring statt Strich) + Blitz */}
      {bu > 0.001 && bu < 0.999
        ? (() => {
            const ringD = sz * (1.2 + 20 * easeOut(bu, 3));
            const fade = Math.pow(1 - bu, 2);
            // Ringbreite schrumpft mit dem Wachsen; Innenseite weich, Außenkante hell (Druckwelle)
            const thick = lerp(0.14, 0.035, bu);
            const warm = bu < 0.45;
            const st = (v: number) => `${Math.min(99.4, v).toFixed(2)}%`;
            return (
              <>
                <div
                  style={abs(pos.x, pos.y, ringD, ringD, {
                    borderRadius: "50%",
                    background: `radial-gradient(circle closest-side, ${rgba(NEON.orange, 0)} ${st(100 - thick * 100)}, ${rgba(warm ? "#FFB696" : NEON.sky, 0.3 * fade)} ${st(100 - thick * 45)}, ${rgba("#FFFFFF", 0.6 * fade)} ${st(100 - thick * 12)}, ${rgba(warm ? NEON.orange : NEON.blue, 0.32 * fade)} 99.5%, ${rgba(NEON.blue, 0)} 100%)`,
                  })}
                />
                <div style={abs(pos.x, pos.y, sz * 10, sz * 10, { borderRadius: "50%", background: `radial-gradient(circle closest-side, ${rgba("#FFFFFF", 0.85 * flash)} 0%, ${rgba("#FFD2BC", 0.42 * flash)} 22%, ${rgba(NEON.orange, 0.12 * flash)} 55%, ${rgba(NEON.orange, 0)} 100%)` })} />
              </>
            );
          })()
        : null}
      {/* Kern (gedehnt in Flugrichtung) */}
      <div
        style={abs(pos.x, pos.y, sz, sz, {
          borderRadius: "50%",
          transform: `rotate(${angle.toFixed(2)}deg) scale(${stretch.toFixed(3)}, ${(1 / Math.sqrt(stretch)).toFixed(3)})`,
          background: `radial-gradient(circle at 38% 34%, ${NEON.hot} 0%, #FFD3BF 22%, ${NEON.orange} 52%, #F06B3E 100%)`,
          boxShadow: `0 0 ${(sz * 0.35).toFixed(1)}px ${rgba("#FFE2D4", 0.9)}, 0 0 ${(sz * 0.9 * g).toFixed(1)}px ${rgba(NEON.orange, 0.85)}, 0 0 ${(sz * 2.2 * g).toFixed(1)}px ${rgba(NEON.orange, 0.45)}`,
        })}
      />
    </div>
  );
};

// ---- LogoReveal ---------------------------------------------------------------------------

type Letter = { d: string; i: number };

/** Wortmarke in Buchstaben zerlegt (Teilpfade nach Lage zugeordnet). */
const LETTERS: Letter[] = (() => {
  const out: Letter[] = [];
  const assign = (d: string, bounds: number[], offset: number) => {
    const groups: string[][] = bounds.map(() => []);
    groups.push([]);
    for (const sp of getSubpaths(d)) {
      const b = getBoundingBox(sp);
      const c = (b.x1 + b.x2) / 2;
      let k = bounds.findIndex((x) => c < x);
      if (k < 0) k = bounds.length;
      groups[k].push(sp);
    }
    groups.forEach((g, k) => out.push({ d: g.join(" "), i: offset + k }));
  };
  assign(WORD_VEREINS, [100, 190, 260, 340, 395, 500], 0);
  assign(WORD_FLOW, [90, 130, 240], 7);
  return out;
})();
const FLOW_X = 580;
const I_DOT = { cx: 373.17, cy: -112.5, r: 12.69 };

export type LogoRevealProps = {
  frame?: number;
  /** Startframe der Enthüllung */
  start: number;
  width?: number;
  /** Mitte des Logos im Videoraum */
  x?: number;
  y?: number;
  /** Laufweite am Start (Logo-Einheiten je Buchstabe; Wortmarke ist ~940 breit) */
  spacingFrom?: number;
  /** Frames, bis die Laufweite eng ist */
  tighten?: number;
  /** Punkt im V nicht zeichnen (kommt als DotBurst) */
  hideDot?: boolean;
  glow?: number;
  /** 0..1 – Abgang */
  exit?: number;
  style?: React.CSSProperties;
};

/** Lage des V-Punkts (Videoraum) für ein LogoReveal mit gleicher Breite/Mitte – Ziel für den fliegenden DotBurst. */
export const logoDotPosition = (x: number, y: number, width = 860) => {
  const h = logoHeight(width);
  const d = logoDotCenter(width);
  return { x: x - width / 2 + d.x, y: y - h / 2 + d.y, r: d.r };
};

export const LogoReveal: React.FC<LogoRevealProps> = ({ frame, start, width = 860, x = W / 2, y = H / 2, spacingFrom = 46, tighten = 44, hideDot = false, glow = 0.8, exit = 0, style }) => {
  const f = useF(frame);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const t = f - start;
  const h = logoHeight(width);
  const segs = Array.from({ length: 6 }, (_, i) => easeOut(invLerp(i * 2.5, i * 2.5 + 14, t), 3));
  const stripes = easeOut(invLerp(12, 22, t), 3);
  const spacing = spacingFrom * (1 - easeOutExpo(invLerp(4, 4 + tighten, t)));
  const letterP = (i: number) => easeOut(invLerp(6 + i * 2.2, 6 + i * 2.2 + 12, t), 2);
  const iDot = easeOut(invLerp(28, 36, t), 2) * (1 + 0.25 * Math.sin(clamp01((t - 28) / 10) * Math.PI));
  const under = easeOut(invLerp(30, 50, t), 3);
  const dotPop = easeOut(invLerp(0, 10, t), 2);
  const e = clamp01(exit);
  const vb = LOGO_VIEWBOX;
  const blurId = (i: number) => `lr-b-${uid}-${i}`;
  // Glanzlicht läuft einmal über die Wortmarke, sobald die Laufweite eng ist (Logo-Einheiten, −260 … 1180)
  const sheenP = invLerp(4 + tighten, 4 + tighten + 26, t);
  const sheenX = lerp(-260, 1180, easeOut(sheenP, 2));
  const sheenA = Math.sin(Math.PI * clamp01(sheenP));
  // weicher Lichthof hinter dem Logo: blüht mit den Buchstaben auf
  const halo = glow * easeOut(invLerp(6, 40, t), 2);
  return (
    <div
      style={{
        position: "absolute",
        left: x - width / 2,
        top: y - h / 2,
        width,
        height: h,
        opacity: (1 - e) * clamp01(t / 3 + 0.0001),
        filter: e > 0.01 ? `blur(${(e * 14).toFixed(2)}px)` : undefined,
        ...style,
      }}
    >
      {halo > 0.01 ? (
        <div
          style={{
            position: "absolute",
            left: -width * 0.2,
            top: -h * 1.1,
            width: width * 1.4,
            height: h * 3.2,
            pointerEvents: "none",
            mixBlendMode: "screen",
            background: `radial-gradient(50% 50% at 50% 50%, ${rgba(NEON.blue, 0.2 * halo)} 0%, ${rgba(NEON.deep, 0.1 * halo)} 42%, ${rgba(NEON.deep, 0)} 72%)`,
          }}
        />
      ) : null}
      <Logo
        width={width}
        tone="dark"
        mode="lockup"
        hideDot={hideDot}
        parts={{ segments: segs, stripes, word: 0, iDot: 0, underline: 0, dot: { scale: dotPop, opacity: dotPop } }}
        style={{ position: "absolute", left: 0, top: 0, filter: glow > 0 ? `drop-shadow(0 0 ${(10 * glow).toFixed(1)}px ${rgba(NEON.sky, 0.45 * glow)})` : undefined }}
      />
      <svg width={width} height={h} viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <defs>
          {LETTERS.map((l) => {
            const p = letterP(l.i);
            const b = (1 - p) * 9;
            return b > 0.05 ? (
              <filter key={l.i} id={blurId(l.i)} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation={`${b} ${b * 0.5}`} />
              </filter>
            ) : null;
          })}
          <filter id={`lr-glow-${uid}`} x="-10%" y="-60%" width="120%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={7} result="b" />
            <feColorMatrix in="b" type="matrix" values="0 0 0 0 0.56  0 0 0 0 0.69  0 0 0 0 1  0 0 0 0.75 0" result="c" />
            <feMerge>
              <feMergeNode in="c" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {sheenA > 0.01 ? (
            <>
              <clipPath id={`lr-clip-${uid}`}>
                {LETTERS.map((l) => (
                  <path key={l.i} d={l.d} transform={`translate(${(spacing * l.i + (l.i >= 7 ? FLOW_X : 0)).toFixed(2)} 0)`} />
                ))}
              </clipPath>
              <linearGradient id={`lr-sheen-${uid}`} gradientUnits="userSpaceOnUse" x1={sheenX - 120} y1={0} x2={sheenX + 120} y2={0}>
                <stop offset={0} stopColor="#FFFFFF" stopOpacity={0} />
                <stop offset={0.45} stopColor={NEON.ice} stopOpacity={0.55 * sheenA} />
                <stop offset={0.5} stopColor="#FFFFFF" stopOpacity={0.95 * sheenA} />
                <stop offset={0.55} stopColor={NEON.ice} stopOpacity={0.55 * sheenA} />
                <stop offset={1} stopColor="#FFFFFF" stopOpacity={0} />
              </linearGradient>
            </>
          ) : null}
        </defs>
        <g transform="translate(308.63 180.00)">
          <g transform="skewX(-9)" filter={glow > 0 ? `url(#lr-glow-${uid})` : undefined}>
            {LETTERS.map((l) => {
              const p = letterP(l.i);
              if (p <= 0.001) return null;
              const dx = spacing * l.i + (l.i >= 7 ? FLOW_X : 0) + (1 - p) * 30;
              const fill = l.i >= 7 ? NEON.sky : "#FFFFFF";
              const ghost = spacingFrom > 0 ? (spacing / spacingFrom) * 0.35 : 0;
              return (
                <g key={l.i} opacity={clamp01(p * 1.4)} filter={(1 - p) * 9 > 0.05 ? `url(#${blurId(l.i)})` : undefined}>
                  {/* Echo-Geist, solange die Laufweite noch weit ist */}
                  {ghost > 0.02 ? <path d={l.d} transform={`translate(${(dx + spacing * 0.7).toFixed(2)} 0)`} fill={fill} opacity={ghost} /> : null}
                  <path d={l.d} transform={`translate(${dx.toFixed(2)} 0)`} fill={fill} />
                </g>
              );
            })}
            {/* Glanzlicht nur auf den Buchstaben */}
            {sheenA > 0.01 ? <rect x={-300} y={-260} width={1600} height={320} fill={`url(#lr-sheen-${uid})`} clipPath={`url(#lr-clip-${uid})`} /> : null}
            {iDot > 0.001 ? <circle cx={I_DOT.cx + spacing * 4} cy={I_DOT.cy} r={I_DOT.r * iDot} fill={NEON.orange} /> : null}
            {under > 0.001 ? (
              <g transform={`translate(2.4 30) scale(${Math.max(0.0001, under)} 1) translate(-2.4 -30)`}>
                <rect x={2.4} y={24} width={824.8 + spacing * 10} height={13.2} rx={6.6} fill={NEON.orange} />
                <rect x={838.56 + spacing * 10} y={24} width={33} height={13.2} rx={6.6} fill={NEON.orange} />
                <rect x={882.91 + spacing * 10} y={24} width={22.44} height={13.2} rx={6.6} fill={NEON.orange} />
                <rect x={916.7 + spacing * 10} y={24} width={13.2} height={13.2} rx={6.6} fill={NEON.orange} />
              </g>
            ) : null}
          </g>
        </g>
      </svg>
    </div>
  );
};

// ---- LightFloor ---------------------------------------------------------------------------

export type LightFloorProps = {
  /** Stärke 0 … ~1,5 */
  intensity?: number;
  /** Mitte des Lichtkegels (Standard knapp unter dem Bildrand) */
  x?: number;
  y?: number;
  /** Breite/Höhe der Ellipse */
  width?: number;
  height?: number;
  color?: string;
  frame?: number;
  /** leichtes Atmen der Helligkeit */
  breathe?: boolean;
};

export const LightFloor: React.FC<LightFloorProps> = ({ intensity = 1, x = W / 2, y = H - 120, width = 1500, height = 1300, color = NEON.blue, frame, breathe = true }) => {
  const f = useF(frame);
  const k = intensity * (breathe ? 0.94 + 0.06 * Math.sin(f * 0.07) : 1);
  if (k <= 0.001) return null;
  const el = (w: number, hh: number, bg: string): React.CSSProperties => ({ position: "absolute", left: x - w / 2, top: y - hh / 2, width: w, height: hh, borderRadius: "50%", background: bg });
  // satter Lichtkegel (Referenz t13.25: tiefes, leuchtendes Blau, nicht pastell); Kern nur knapp heller
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, pointerEvents: "none", mixBlendMode: "screen", overflow: "hidden" }}>
      <div
        style={el(
          width,
          height,
          `radial-gradient(50% 50% at 50% 50%, ${rgba(color, 0.5 * k)} 0%, ${rgba(color, 0.3 * k)} 26%, ${rgba(NEON.deep, 0.16 * k)} 52%, ${rgba(NEON.deep, 0.05 * k)} 76%, ${rgba(NEON.deep, 0)} 100%)`,
        )}
      />
      <div style={el(width * 0.58, height * 0.42, `radial-gradient(50% 50% at 50% 50%, ${rgba(NEON.electric, 0.55 * k)} 0%, ${rgba(NEON.electric, 0.22 * k)} 50%, ${rgba(NEON.electric, 0)} 100%)`)} />
      <div style={el(width * 0.3, height * 0.14, `radial-gradient(50% 50% at 50% 50%, ${rgba("#7E9DFF", 0.42 * k)} 0%, ${rgba("#7E9DFF", 0)} 100%)`)} />
    </div>
  );
};

/** weicher Übergang einer Stärke (für Aufrufer, z. B. Bodenlicht einblenden) */
export const fadeIn = (f: number, at: number, dur = 20) => smooth(invLerp(at, at + dur, f));
