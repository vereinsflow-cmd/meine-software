/**
 * Szene „helfer“ – schwebende Neon-Kennzahlen (Werte nur aus SHIFTS im UI-Baukasten) und Lichter auf der App-Seite.
 *
 *   StaffRingCard   „Helferplätze“: Ring füllt sich bis 9 von 21 (Summe der Demo-Schichten)
 *   ShiftBarsCard   „Besetzung je Schicht“: ein Balken je Schicht, Grillstand (0 von 3) als leere Spur mit orangem Saum
 *   RowGlow         leuchtender Rahmen um eine Schichtzeile (in der Ebene der App-Seite)
 *   GapRing         oranger Lichtring um „0 von 3 · 3 frei“: zeichnet sich, dann Puls-Wellen im Takt
 */
import React, { useId } from "react";
import { fontFamily } from "../../fonts";
import { Bars, DonutRing, MetricCard, NEON, clamp01, easeOut, lerp, rgba, textGlow } from "../../neon";
import { SHIFTS } from "../../ui/shifts";
import { FILLED, GRILL, REQUIRED } from "./geometry";

/** dunkle, fast deckende Unterlage unter einer Glas-Kennzahl (die Seite dahinter scheint sonst durch) + weicher Schatten */
const Backing: React.FC<{
  w: number;
  h: number;
  children: React.ReactNode;
}> = ({ w, h, children }) => (
  <div style={{ position: "relative", width: w, height: h }}>
    <div
      style={{
        position: "absolute",
        inset: 2,
        borderRadius: 30,
        background: "rgba(4, 7, 16, 0.95)",
        boxShadow: "0 30px 70px rgba(0, 0, 0, 0.6), 0 8px 24px rgba(0, 0, 0, 0.45)",
      }}
    />
    <div style={{ position: "absolute", inset: 0 }}>{children}</div>
  </div>
);

// ---- Helferplätze -----------------------------------------------------------------------------
export const RING_CARD = { w: 330, h: 380 } as const;

export const StaffRingCard: React.FC<{ grow: number; appear: number }> = ({ grow, appear }) => {
  const g = clamp01(grow);
  const shown = Math.round(FILLED * g);
  return (
    <Backing w={RING_CARD.w} h={RING_CARD.h}>
      <MetricCard width={RING_CARD.w} height={RING_CARD.h} title="Helferplätze" appear={appear} glow={0.55}>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 6,
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div style={{ position: "relative", width: 262, height: 262 }}>
            <DonutRing size={262} value={FILLED / REQUIRED} progress={g} label=" " />
            {/* eigene Mitte: große Zahl, darunter „von 21“ (DonutRing-Schrift wäre für „9 von 21“ zu klein) */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                fontFamily,
              }}
            >
              <span
                style={{
                  fontWeight: 800,
                  fontSize: 66,
                  lineHeight: 1,
                  color: NEON.ice,
                  letterSpacing: "-0.02em",
                  fontVariantNumeric: "tabular-nums",
                  textShadow: textGlow(0.45, NEON.sky, NEON.blue, 0.7),
                }}
              >
                {shown}
              </span>
              <span
                style={{
                  marginTop: 6,
                  fontWeight: 500,
                  fontSize: 25,
                  color: NEON.mist,
                  whiteSpace: "nowrap",
                }}
              >
                von {REQUIRED}
              </span>
            </div>
          </div>
        </div>
      </MetricCard>
    </Backing>
  );
};

// ---- Besetzung je Schicht ---------------------------------------------------------------------
/** Schmal wie „Helferplätze“ (beide Karten stehen als Spalte links NEBEN dem Bildschirm und verdecken keine Zeile der
 *  Schichtenliste): je Schicht oben Name + Wert, darunter der Balken über die volle Breite */
export const BARS_CARD = { w: 340, h: 426 } as const;
const BARS_PAD = 24;
/** Zeile mit Name + Wert, darunter (nach BAR_TOP) der Balken; Abstand der Schichten = PITCH */
const LINE_H = 30;
const BAR_H = 14;
const BAR_TOP = LINE_H + 5;
const PITCH = BAR_TOP + BAR_H + 16;

export const ShiftBarsCard: React.FC<{
  grow: number;
  appear: number;
  gapGlow: number;
}> = ({ grow, appear, gapGlow }) => {
  const trackW = BARS_CARD.w - BARS_PAD * 2;
  const values = SHIFTS.map((s) => Math.min(1, s.names.length / s.capacity));
  return (
    <Backing w={BARS_CARD.w} h={BARS_CARD.h}>
      <MetricCard width={BARS_CARD.w} height={BARS_CARD.h} title="Besetzung je Schicht" appear={appear} glow={0.55} padding={BARS_PAD}>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 22,
            fontFamily,
          }}
        >
          {SHIFTS.map((s, i) => {
            const gap = i === GRILL;
            const top = i * PITCH;
            const lit = clamp01((grow - i * 0.08) * 3);
            return (
              <React.Fragment key={s.title}>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top,
                    width: trackW - 76,
                    height: LINE_H,
                    display: "flex",
                    alignItems: "center",
                    fontWeight: gap ? 800 : 500,
                    fontSize: 24,
                    color: gap ? lerp01Color(gapGlow) : NEON.mist,
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.title}
                </div>
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top,
                    width: 70,
                    height: LINE_H,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    fontWeight: 800,
                    fontSize: 24,
                    fontVariantNumeric: "tabular-nums",
                    color: gap ? NEON.orange : NEON.ice,
                    opacity: lit,
                    textShadow: gap ? textGlow(0.5 * gapGlow + 0.2, "#FFB08F", NEON.orange, 0.45) : undefined,
                  }}
                >
                  {s.names.length}/{s.capacity}
                </div>
                {gap ? (
                  // leere Spur mit orangem Saum: hier fehlt noch jemand
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: top + BAR_TOP,
                      width: trackW,
                      height: BAR_H,
                      borderRadius: 9,
                      boxShadow: `inset 0 0 0 ${1.5 + gapGlow}px ${rgba(NEON.orange, 0.35 + 0.5 * gapGlow)}, 0 0 ${8 + 18 * gapGlow}px ${rgba(NEON.orange, 0.15 + 0.4 * gapGlow)}`,
                      opacity: lit,
                    }}
                  />
                ) : null}
              </React.Fragment>
            );
          })}
          <Bars
            width={trackW}
            values={values}
            progress={grow}
            stagger={0.1}
            barHeight={BAR_H}
            gap={PITCH - BAR_H}
            glow={0.8}
            style={{ position: "absolute", left: 0, top: BAR_TOP }}
          />
        </div>
      </MetricCard>
    </Backing>
  );
};

/** Beschriftung der Lücke: Nebel → Orange */
const lerp01Color = (t: number) => {
  const a = [214, 226, 255];
  const b = [255, 176, 143];
  const k = clamp01(t);
  return `rgb(${Math.round(lerp(a[0], b[0], k))}, ${Math.round(lerp(a[1], b[1], k))}, ${Math.round(lerp(a[2], b[2], k))})`;
};

// ---- Lichter in der Ebene der App-Seite --------------------------------------------------------

/** Leuchtrahmen um eine Zeile (w/h in Welt-px), `glow` 0..1 – blüht beim Eintragen auf und klingt ab */
export const RowGlow: React.FC<{
  w: number;
  h: number;
  glow: number;
  color?: string;
  m?: number;
}> = ({ w, h, glow, color = NEON.sky, m = 40 }) => {
  const g = clamp01(glow);
  if (g <= 0.002) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: m,
        top: m,
        width: w,
        height: h,
        borderRadius: 14,
        mixBlendMode: "screen",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 14,
          boxShadow: [
            `inset 0 0 0 ${1.2 + 0.8 * g}px ${rgba(color, 0.75 * g)}`,
            `inset 0 0 ${24 * g}px ${rgba(NEON.blue, 0.35 * g)}`,
            `0 0 ${10 + 14 * g}px ${rgba(color, 0.45 * g)}`,
            `0 0 ${30 + 30 * g}px ${rgba(NEON.blue, 0.35 * g)}`,
          ].join(", "),
        }}
      />
    </div>
  );
};

export type GapRingProps = {
  /** Größe des Rings (Welt-px) */
  w: number;
  h: number;
  /** Rand um den Ring in der Ebene (Platz für Schein und Wellen) */
  m: number;
  /** 0..1 – Ring zeichnet sich (ab Mitte rechts im Uhrzeigersinn) */
  draw: number;
  /** Puls-Wellen: Fortschritt je Welle 0..1 */
  waves: number[];
  /** 0..1 – Gesamtstärke */
  glow: number;
  /** 0..1 – Taktschlag: Ring und Schein blitzen kurz auf (mit jeder Welle) */
  beat?: number;
};

/** Kapselweg ab Mitte RECHTS im Uhrzeigersinn (rechts → unten → links → oben → rechts), pathLength = 1 –
 *  der Lichtpunkt kommt von rechts oben herein und zeichnet den Ring von dort aus */
const capsule = (x: number, y: number, w: number, h: number) => {
  const r = h / 2;
  return `M ${x + w} ${y + r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} L ${x + r} ${y + h} A ${r} ${r} 0 0 1 ${x} ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} L ${x + w - r} ${y} A ${r} ${r} 0 0 1 ${x + w} ${y + r} Z`;
};

/** Punkt auf dem Kapselweg bei Anteil t (gleicher Start wie `capsule`: Mitte rechts, im Uhrzeigersinn) – lokale Koordinaten ohne Rand */
export const capsulePoint = (w: number, h: number, t: number) => {
  const r = h / 2;
  const straight = w - 2 * r;
  const arc = Math.PI * r;
  const total = 2 * straight + 2 * arc;
  // intern ab Mitte links gerechnet; Mitte rechts liegt (symmetrisch) genau bei 0,5
  let d = ((((t + 0.5) % 1) + 1) % 1) * total;
  // linker Bogen (obere Hälfte): von Mitte links nach oben
  if (d < arc / 2) {
    const a = Math.PI + (d / arc) * Math.PI;
    return { x: r + r * Math.cos(a), y: r + r * Math.sin(a) };
  }
  d -= arc / 2;
  if (d < straight) return { x: r + d, y: 0 };
  d -= straight;
  if (d < arc) {
    const a = -Math.PI / 2 + (d / arc) * Math.PI;
    return { x: w - r + r * Math.cos(a), y: r + r * Math.sin(a) };
  }
  d -= arc;
  if (d < straight) return { x: w - r - d, y: h };
  d -= straight;
  const a = Math.PI / 2 + (d / arc) * Math.PI;
  return { x: r + r * Math.cos(a), y: r + r * Math.sin(a) };
};

export const GapRing: React.FC<GapRingProps> = ({ w, h, m, draw, waves, glow, beat = 0 }) => {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const g = clamp01(glow);
  if (g <= 0.002) return null;
  const d = clamp01(draw);
  const path = capsule(m, m, w, h);
  const W2 = w + 2 * m;
  const H2 = h + 2 * m;
  const dash = `${Math.max(0.0001, d)} 2`;
  const b = clamp01(beat);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: W2,
        height: H2,
        mixBlendMode: "screen",
      }}
    >
      {/* warmer Schein hinter der Zeile */}
      <div
        style={{
          position: "absolute",
          left: m - w * 0.15,
          top: m - h * 0.9,
          width: w * 1.3,
          height: h * 2.8,
          borderRadius: "50%",
          background: `radial-gradient(50% 50% at 50% 50%, ${rgba(NEON.orange, (0.2 + 0.16 * b) * g * d)} 0%, ${rgba(NEON.orange, (0.07 + 0.06 * b) * g * d)} 45%, ${rgba(NEON.orange, 0)} 75%)`,
        }}
      />
      <svg width={W2} height={H2} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        <defs>
          <filter id={`gr-b-${uid}`} x="-30%" y="-80%" width="160%" height="260%">
            <feGaussianBlur stdDeviation={7} />
          </filter>
          <filter id={`gr-s-${uid}`} x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation={2.2} />
          </filter>
          <filter id={`gr-w-${uid}`} x="-30%" y="-80%" width="160%" height="260%">
            <feGaussianBlur stdDeviation={6} />
          </filter>
        </defs>
        {/* Puls-Wellen: weicher Lichtsaum, der aus dem Ring wächst und verblasst – bewusst ohne scharfe Linie, damit er
            die Nachbarzeilen („Verantwortlich …“, „Noch niemand eingetragen“) nicht wie durchgestrichen aussehen lässt */}
        {waves.map((p, i) => {
          if (p <= 0.001 || p >= 0.999) return null;
          const e = easeOut(p, 2.4);
          const sx = 1 + 0.36 * e;
          const sy = 1 + 0.5 * e;
          const a = Math.pow(1 - p, 1.5) * g;
          return (
            <g key={i} transform={`translate(${W2 / 2} ${H2 / 2}) scale(${sx} ${sy}) translate(${-W2 / 2} ${-H2 / 2})`}>
              <path d={path} fill="none" stroke={NEON.orange} strokeWidth={16 / sx} opacity={0.85 * a} filter={`url(#gr-w-${uid})`} />
            </g>
          );
        })}
        <path
          d={path}
          pathLength={1}
          fill="none"
          stroke={NEON.orange}
          strokeWidth={10 + 4 * b}
          strokeDasharray={dash}
          strokeLinecap="round"
          opacity={Math.min(1, (0.6 + 0.3 * b) * g)}
          filter={`url(#gr-b-${uid})`}
        />
        <path
          d={path}
          pathLength={1}
          fill="none"
          stroke="#FF9E78"
          strokeWidth={5 + 1.5 * b}
          strokeDasharray={dash}
          strokeLinecap="round"
          opacity={Math.min(1, (0.75 + 0.2 * b) * g)}
          filter={`url(#gr-s-${uid})`}
        />
        <path
          d={path}
          pathLength={1}
          fill="none"
          stroke="#FFE6DA"
          strokeWidth={2.2}
          strokeDasharray={dash}
          strokeLinecap="round"
          opacity={0.95 * g}
        />
      </svg>
    </div>
  );
};

/** Tipp-Welle in der Ebene der App (um den Knopf): weicher Lichtkreis wächst und verblasst, `p` 0..1 */
export const TapRipple: React.FC<{ size: number; p: number }> = ({ size, p }) => {
  if (p <= 0.001 || p >= 0.999) return null;
  const e = easeOut(p, 3);
  const d = lerp(0.18, 1, e) * size;
  const a = Math.pow(1 - p, 1.5);
  return (
    <div
      style={{
        position: "absolute",
        left: (size - d) / 2,
        top: (size - d) / 2,
        width: d,
        height: d,
        borderRadius: "50%",
        mixBlendMode: "screen",
        background: `radial-gradient(circle closest-side, ${rgba(NEON.orange, 0)} 62%, ${rgba(NEON.orange, 0.14 * a)} 80%, ${rgba("#FFE6DA", 0.6 * a)} 93%, ${rgba(NEON.orange, 0)} 100%)`,
      }}
    />
  );
};

/** Stärke einer Leuchtzeile: blüht auf (`at`), klingt auf `rest` ab */
export const bloom = (f: number, at: number, rest = 0.35) => {
  if (f < at) return 0;
  const up = clamp01((f - at) / 5);
  const down = Math.exp(-Math.max(0, f - at - 5) / 14);
  return up * (rest + (1 - rest) * down);
};
