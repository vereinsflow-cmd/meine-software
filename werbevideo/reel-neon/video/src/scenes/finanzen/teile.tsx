/**
 * Bausteine der Kassen-Bildfolge (finanzen → feierabend): Neon-Reiterleiste, Buchungsstreifen mit Beleg, schwebende
 * Karte „Offene Rechnungen“, Hintergrund-Glaskarten, warmes Abendlicht und der orange Punkt als Schlusspunkt.
 * Alles nur aus Props (Fortschritte 0..1) – die Zeit steuert Kasse.tsx.
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import { fontFamily } from "../../fonts";
import { textWidth } from "../../lib/measure";
import { GlassPanel, NEON, boxGlow, clamp01, lerp, mixHex, rgba, textGlow } from "../../neon";
import { Icon } from "../../ui/icons";
import { OffeneRechnungenCard, type LedgerEntry } from "../../ui/finance";
import { formatEuro } from "../../ui/motion";
import { C as UI, CONTENT_W, FONT, S as X } from "../../ui/tokens";

/* ------------------------------------------------------------------ Neon-Reiterleiste */

/**
 * Reiter in der Reihenfolge der App-Leiste („Übersicht · Beiträge · Kassenbuch · Rechnungen …“, ohne Übersicht) – so
 * widerspricht die Neon-Leiste nie der echten Leiste im Bildschirm darunter. Die Stimme nennt sie anders („Beiträge,
 * Rechnungen und das Kassenbuch“): die Leuchtkachel springt deshalb im Takt der Stimme (Kasse.tsx), statt zu gleiten.
 */
export const TAB_LABELS = ["Beiträge", "Kassenbuch", "Rechnungen"] as const;
/** Lage der Reiter in TAB_LABELS */
export const TAB = { beitraege: 0, kassenbuch: 1, rechnungen: 2 } as const;

/** Maße der Leiste (für die Mitte im Bild) */
export const neonTabsLayout = (fontSize: number) => {
  // schmaler Innenabstand, damit die Leiste bei 48 px Schrift in die Safe Zone (70…1010) passt
  const padX = fontSize * 0.44;
  const gap = 6;
  const pad = 10;
  const h = Math.round(fontSize * 1.86);
  const widths = TAB_LABELS.map((t) => textWidth(t, fontSize, 800, -0.01) + padX * 2);
  const xs: number[] = [];
  let x = pad;
  for (const w of widths) {
    xs.push(x);
    x += w + gap;
  }
  return { padX, gap, pad, h, widths, xs, width: x - gap + pad, height: h + pad * 2 };
};

/**
 * Die Reiterleiste der App, groß und leuchtend: dunkle Glasleiste, darin eine Leuchtkachel, die von Reiter zu Reiter
 * springt (erlischt am alten Reiter, leuchtet am neuen auf – kein Gleiten über den Reiter dazwischen), und Reiter, die im
 * Takt aufleuchten.
 */
export const NeonTabs: React.FC<{
  /** Leuchten je Reiter 0..1 (bleibt an, wenn die Kachel weiterzieht) */
  lit: number[];
  /** Leuchtkachel je Reiter 0..1 (während eines Sprungs kurz an zwei Reitern zugleich: alte erlischt, neue leuchtet auf) */
  tile: number[];
  /** kurzes Aufleuchten je Reiter (klingt ab) */
  flare: number[];
  fontSize?: number;
  style?: React.CSSProperties;
}> = ({ lit, tile, flare, fontSize = 46, style }) => {
  const L = neonTabsLayout(fontSize);
  const s = fontSize / 90;
  return (
    <div style={{ position: "relative", width: L.width, height: L.height, ...style }}>
      {/* Glasleiste: dunkel, Lichtkante oben, schwacher Schein */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: L.height / 2,
          background: `linear-gradient(180deg, ${rgba("#1B2B5E", 0.62)} 0%, ${rgba("#0A1028", 0.82)} 55%, ${rgba("#050816", 0.9)} 100%)`,
          boxShadow: [`inset 0 1.5px 0 ${rgba("#FFFFFF", 0.2)}`, `inset 0 0 0 1.5px ${rgba(NEON.sky, 0.2)}`, `inset 0 0 24px ${rgba(NEON.blue, 0.18)}`, boxGlow(0.5)].join(", "),
        }}
      />
      {/* Leuchtkachel (je Reiter; beim Sprung erlischt die alte, während die neue aufleuchtet) */}
      {TAB_LABELS.map((label, i) => {
        const a = clamp01(tile[i] ?? 0);
        return a > 0.01 ? (
          <div
            key={`kachel-${label}`}
            style={{
              position: "absolute",
              left: L.xs[i],
              top: L.pad,
              width: L.widths[i],
              height: L.h,
              borderRadius: L.h / 2,
              opacity: a,
              transform: `scale(${(0.9 + 0.1 * a).toFixed(4)})`,
              background: `linear-gradient(180deg, ${rgba("#6A96FF", 0.96)} 0%, ${rgba(NEON.electric, 0.92)} 52%, ${rgba(NEON.deep, 0.96)} 100%)`,
              boxShadow: [`inset 0 2px 0 ${rgba("#FFFFFF", 0.5)}`, `inset 0 -8px 16px ${rgba(NEON.abyss, 0.55)}`, boxGlow(1.15, NEON.blue)].join(", "),
            }}
          />
        ) : null;
      })}
      {TAB_LABELS.map((label, i) => {
        const l = clamp01(lit[i] ?? 0);
        const on = clamp01(tile[i] ?? 0);
        const k = 0.1 + 0.4 * l + 0.55 * on + 0.7 * (flare[i] ?? 0);
        return (
          <div
            key={label}
            style={{
              position: "absolute",
              left: L.xs[i],
              top: L.pad,
              width: L.widths[i],
              height: L.h,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily,
              fontWeight: 800,
              fontSize,
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
              color: mixHex("#6E7CA6", NEON.ice, Math.max(0.72 * l, on)),
              textShadow: textGlow(k, NEON.sky, NEON.blue, s),
            }}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
};

/* ------------------------------------------------------------------ Buchungsstreifen */

export const STRIP_W = 720;
export const STRIP_H = 168;

/**
 * Eine Buchung des Kassenbuchs als schwebender Glasstreifen (Daten und Farben wie die App: Titel, Nummer · Datum ·
 * Konto, Betrag – Einnahme grün –, Beleg in der Markenfarbe). `link` lässt den Beleg aufleuchten.
 */
export const LedgerStrip: React.FC<{ entry: LedgerEntry; link: number; glow?: number }> = ({ entry, link, glow = 0.6 }) => {
  const l = clamp01(link);
  const linkColor = mixHex(UI.primary, "#D8E6FF", 0.55 * l);
  return (
    <GlassPanel width={STRIP_W} height={STRIP_H} radius={30} tint={0.16} glow={glow} edge={1.1}>
      <div style={{ position: "absolute", left: 32, right: 32, top: 22, fontFamily: FONT, color: UI.fg }}>
        <div style={{ fontSize: 28, lineHeight: "36px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.title}</div>
        <div style={{ marginTop: 6, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
          <div style={{ fontSize: 22, lineHeight: "30px", color: UI.muted, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
            {entry.number} · {entry.date} · {entry.account}
          </div>
          <div style={{ fontSize: 29, lineHeight: "30px", fontWeight: 700, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: entry.amount > 0 ? UI.green : UI.fg }}>
            {formatEuro(entry.amount, true)}
          </div>
        </div>
        {entry.attachment ? (
          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ position: "relative", width: 28, height: 28, flexShrink: 0, filter: l > 0.01 ? `drop-shadow(0 0 ${(6 * l).toFixed(1)}px ${rgba(NEON.sky, 0.9 * l)})` : undefined }}>
              <Icon name="file-text" size={28} color={linkColor} strokeWidth={2} />
            </div>
            <div style={{ position: "relative", fontSize: 23, lineHeight: "30px", whiteSpace: "nowrap", color: linkColor, textShadow: l > 0.01 ? textGlow(0.55 * l, NEON.sky, NEON.blue, 0.32) : undefined }}>
              {entry.attachment}
              {/* Unterstreichung zeichnet sich beim Aufleuchten */}
              <div style={{ position: "absolute", left: 0, bottom: -2, height: 2, width: `${(100 * l).toFixed(1)}%`, borderRadius: 1, background: linkColor, boxShadow: `0 0 8px ${rgba(NEON.sky, 0.8 * l)}` }} />
            </div>
          </div>
        ) : null}
      </div>
    </GlassPanel>
  );
};

/* ------------------------------------------------------------------ Karte „Offene Rechnungen“ */

/** Höhe der App-Karte in CSS-px (Bildraum 1542–2034) */
const AMBER_CSS_H = 164;
export const AMBER_W = 540;
export const AMBER_H = Math.round((AMBER_W * AMBER_CSS_H) / CONTENT_W);

/**
 * Die echte Kennzahlkarte der App (amber), aus der Seite gelöst: oranger Lichthof, Lichtkante und Glanzstreif
 * wachsen mit `glow`; `lift` ist die Hervorhebung der App-Karte selbst.
 */
export const AmberCard: React.FC<{ lift: number; glow: number; sheen?: number; off?: number }> = ({ lift, glow, sheen, off = 0 }) => {
  const k = AMBER_W / (CONTENT_W * X);
  const r = 28 * X * k;
  const g = Math.max(0, glow);
  const sh = sheen === undefined ? -1 : clamp01(sheen);
  return (
    <div style={{ position: "relative", width: AMBER_W, height: AMBER_H }}>
      {/* Lichthof hinter der Karte (Signalorange, weich) */}
      <div
        style={{
          position: "absolute",
          left: -AMBER_W * 0.32,
          top: -AMBER_H * 0.55,
          width: AMBER_W * 1.64,
          height: AMBER_H * 2.1,
          borderRadius: "50%",
          background: `radial-gradient(50% 50% at 50% 52%, ${rgba(NEON.orange, Math.min(0.6, 0.34 * g))} 0%, ${rgba("#FF6A3A", Math.min(0.32, 0.16 * g))} 42%, ${rgba("#FF6A3A", 0)} 72%)`,
        }}
      />
      <div style={{ position: "absolute", left: 0, top: 0, width: CONTENT_W * X, transform: `scale(${k})`, transformOrigin: "0 0" }}>
        <OffeneRechnungenCard lift={clamp01(lift)} />
      </div>
      {/* in Ruhe gedämpft, damit sie neben dem Bildschirm nicht schreit – beim Heben volle Farbe */}
      {/* … und zum Feierabend erlischt sie (off → fast dunkel) */}
      {lift < 0.995 || off > 0.002 ? (
        <div style={{ position: "absolute", inset: 0, borderRadius: r, background: "#05070F", opacity: Math.max(0.4 * (1 - clamp01(lift)), 0.8 * clamp01(off)) }} />
      ) : null}
      {/* Lichtkante */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: r,
          boxShadow: [
            `inset 0 0 0 1.5px ${rgba("#FFD2B8", Math.min(0.85, 0.22 + 0.4 * g))}`,
            `0 0 ${(10 + 26 * g).toFixed(1)}px ${rgba(NEON.orange, Math.min(0.75, 0.3 * g))}`,
            `0 0 ${(40 + 70 * g).toFixed(1)}px ${rgba("#FF6A3A", Math.min(0.5, 0.18 * g))}`,
          ].join(", "),
        }}
      />
      {sh > 0 && sh < 1 ? (
        <div style={{ position: "absolute", inset: 0, borderRadius: r, overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              top: "-30%",
              left: `${lerp(-55, 125, sh).toFixed(2)}%`,
              width: "34%",
              height: "160%",
              transform: "skewX(-22deg)",
              background: `linear-gradient(90deg, ${rgba("#FFFFFF", 0)} 0%, ${rgba("#FFF1E6", 0.22)} 45%, ${rgba("#FFFFFF", 0.34)} 52%, ${rgba("#FFFFFF", 0)} 100%)`,
            }}
          />
        </div>
      ) : null}
    </div>
  );
};

/* ------------------------------------------------------------------ Hintergrund */

/** Dunkle Glaskarte mit angedeuteten Zeilen (liegt weit hinten in der Unschärfe) */
export const BackCard: React.FC<{ w: number; h: number; rows?: number; tint?: number }> = ({ w, h, rows = 3, tint = 0.4 }) => (
  <GlassPanel width={w} height={h} radius={28} tint={tint} glow={0.7} edge={1.1}>
    <div style={{ position: "absolute", left: 30, right: 30, top: 34, display: "grid", gap: 20 }}>
      <div style={{ width: "46%", height: 16, borderRadius: 8, background: rgba(NEON.ice, 0.55) }} />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: rgba(NEON.sky, 0.28) }} />
          <div style={{ flex: 1, height: 12, borderRadius: 6, background: rgba(NEON.sky, 0.22 - i * 0.04) }} />
          <div style={{ width: 70, height: 12, borderRadius: 6, background: rgba(NEON.ice, 0.3) }} />
        </div>
      ))}
    </div>
  </GlassPanel>
);

/** Weicher Lichtfleck (Bokeh) */
export const Bokeh: React.FC<{ size: number; color: string; alpha?: number }> = ({ size, color, alpha = 0.5 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      background: `radial-gradient(circle, ${rgba(color, alpha)} 0%, ${rgba(color, alpha * 0.6)} 36%, ${rgba(color, alpha * 0.16)} 58%, ${rgba(color, 0)} 70%)`,
    }}
  />
);

/* ------------------------------------------------------------------ Feierabend */

/** Warmes Abendlicht: Lichtkegel vom unteren Rand und ein Hauch Wärme hinter der Schrift (additiv) */
export const WarmLight: React.FC<{ k: number; textY?: number }> = ({ k, textY = 900 }) => {
  if (k <= 0.002) return null;
  const el = (cx: number, cy: number, w: number, h: number, bg: string): React.CSSProperties => ({
    position: "absolute",
    left: cx - w / 2,
    top: cy - h / 2,
    width: w,
    height: h,
    borderRadius: "50%",
    background: bg,
  });
  return (
    <AbsoluteFill style={{ pointerEvents: "none", mixBlendMode: "screen" }}>
      {/* Abendlicht vom unteren Rand */}
      <div style={el(540, 1960, 2000, 1150, `radial-gradient(50% 50% at 50% 50%, ${rgba(NEON.orange, 0.5 * k)} 0%, ${rgba("#F0703C", 0.26 * k)} 30%, ${rgba("#B8502A", 0.1 * k)} 58%, ${rgba("#B8502A", 0)} 80%)`)} />
      <div style={el(540, 1910, 900, 320, `radial-gradient(50% 50% at 50% 50%, ${rgba("#FFB089", 0.32 * k)} 0%, ${rgba("#FFB089", 0)} 100%)`)} />
      {/* warmer Schein auf den Bändern an den Rändern (die Bänder selbst bleiben blau – mood.warm färbt nur Akzent und Partikel) */}
      <div style={el(1060, 1150, 900, 1700, `radial-gradient(50% 50% at 50% 50%, ${rgba("#FF8A5E", 0.2 * k)} 0%, ${rgba("#FF8A5E", 0.08 * k)} 45%, ${rgba("#FF8A5E", 0)} 75%)`)} />
      <div style={el(20, 760, 760, 1300, `radial-gradient(50% 50% at 50% 50%, ${rgba("#FF9A6E", 0.14 * k)} 0%, ${rgba("#FF9A6E", 0.05 * k)} 45%, ${rgba("#FF9A6E", 0)} 75%)`)} />
      <div style={el(540, textY, 1300, 760, `radial-gradient(50% 50% at 50% 50%, ${rgba("#FF9A6E", 0.1 * k)} 0%, ${rgba("#FF9A6E", 0.04 * k)} 45%, ${rgba("#FF9A6E", 0)} 75%)`)} />
    </AbsoluteFill>
  );
};

/**
 * Der orange VereinsFlow-Punkt als Schlusspunkt hinter „Feierabend“: weißglühender Kern, oranger Hof,
 * kurzer anamorphotischer Streifen beim Aufleuchten. Sitzt im Fluss auf der Grundlinie (Flex „baseline“).
 */
export const EndDot: React.FC<{ size: number; p: number; flare: number }> = ({ size, p, flare }) => {
  const s = Math.max(0, p);
  const fl = clamp01(flare);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      {s > 0.001 ? (
        <>
          {fl > 0.01 ? (
            <div
              style={{
                position: "absolute",
                left: size / 2 - size * 6,
                top: size / 2 - size * 0.14,
                width: size * 12,
                height: size * 0.28,
                borderRadius: "50%",
                opacity: fl,
                background: `linear-gradient(90deg, ${rgba(NEON.orange, 0)} 0%, ${rgba(NEON.orange, 0.45)} 38%, ${rgba("#FFE2D2", 0.9)} 50%, ${rgba(NEON.orange, 0.45)} 62%, ${rgba(NEON.orange, 0)} 100%)`,
              }}
            />
          ) : null}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              transform: `scale(${s.toFixed(4)})`,
              background: `radial-gradient(circle at 42% 40%, ${NEON.hot} 0%, #FFC2A6 34%, ${NEON.orange} 70%, #F0703C 100%)`,
              boxShadow: [
                `0 0 ${(size * 0.3).toFixed(1)}px ${rgba("#FFFFFF", 0.55)}`,
                `0 0 ${(size * 0.8).toFixed(1)}px ${rgba(NEON.orange, 0.95)}`,
                `0 0 ${(size * 2).toFixed(1)}px ${rgba(NEON.orange, 0.6 + 0.3 * fl)}`,
                `0 0 ${(size * 4.6).toFixed(1)}px ${rgba("#FF6A3A", 0.35 + 0.25 * fl)}`,
              ].join(", "),
            }}
          />
        </>
      ) : null}
    </div>
  );
};
