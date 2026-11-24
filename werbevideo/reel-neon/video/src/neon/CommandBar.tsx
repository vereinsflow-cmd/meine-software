/**
 * CommandBar – gläserne Such-/Befehlsleiste wie in der Referenz (t05.25–t06.25): leuchtender Rahmen, oben Bildmarke +
 * Such-Chip, darunter die satte Eingabezeile in Vereinsblau mit getipptem Text, Cursor und Senden-Knopf.
 * Bei `sendAt` drückt der Knopf (Puls + Lichtring), der Text steigt als Echo weg, der Platzhalter kehrt zurück; die
 * Frage erscheint als Blase oben rechts. `expand` klappt die Leiste zur Antwortfläche auf (Eingabe wandert nach unten,
 * `children` – z. B. <ResponseCard> – füllen den Raum dazwischen, t06.75–t07.25).
 * ResponseCard – Antwortblock: Leuchtlinie links wächst mit, Zeilen kommen gestaffelt aus der Unschärfe.
 *
 *   <CommandBar frame={f} text="Wer kommt am Donnerstag?" typeStart={8} sendAt={60} expand={appear(f, 64)}>
 *     <ResponseCard frame={f} width={820} start={74} lines={[{ text: "Donnerstag, 3. Juni 2027", strong: true }]} />
 *   </CommandBar>
 */
import React, { useId } from "react";
import { Logo } from "../components/LogoMark";
import { fontFamily } from "../fonts";
import { Icon } from "../ui/icons";
import { NEON, boxGlow, rgba, textGlow } from "./palette";
import { Cursor } from "./GlowText";
import { blip, clamp01, cursorBlink, easeOut, invLerp, lerp, smooth, typing, useF } from "./util";

export type CommandBarProps = {
  frame?: number;
  width?: number;
  text: string;
  typeStart: number;
  cps?: number;
  /** Frame des Abschickens (Enter-Puls); undefined = nie */
  sendAt?: number;
  chipLabel?: string;
  placeholder?: string;
  /** 0..1 – klappt zur Antwortfläche auf */
  expand?: number;
  /** zusätzliche Höhe im aufgeklappten Zustand (px) */
  expandHeight?: number;
  /** Frage nach dem Senden als Blase oben rechts zeigen */
  question?: boolean;
  glow?: number;
  /** 0..1 – Auftritt (Rahmen zeichnet sich, Inhalt blendet ein) */
  appear?: number;
  children?: React.ReactNode;
  style?: React.CSSProperties;
};

const PAD = 28;
const ROW1 = 96;
const GAP = 22;
const ROW2 = 104;
export const COMMAND_BAR_COLLAPSED = PAD + ROW1 + GAP + ROW2 + PAD;

/** Höhe der Leiste bei gegebenem Aufklapp-Fortschritt. */
export const commandBarHeight = (expand = 0, expandHeight = 620) => COMMAND_BAR_COLLAPSED + expandHeight * clamp01(expand);

export const CommandBar: React.FC<CommandBarProps> = ({
  frame,
  width = 940,
  text,
  typeStart,
  cps = 15,
  sendAt,
  chipLabel = "Suche",
  placeholder = "Mitglieder, Termine, Schichten …",
  expand = 0,
  expandHeight = 620,
  question = true,
  glow = 1,
  appear = 1,
  children,
  style,
}) => {
  const f = useF(frame);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const a = clamp01(appear);
  const e = smooth(clamp01(expand));
  const height = commandBarHeight(e, expandHeight);
  const ty = typing(f, typeStart, text, cps);
  const sent = sendAt !== undefined && f >= sendAt;
  const since = sendAt !== undefined ? f - sendAt : -1;
  // Text steigt nach dem Senden weg, Platzhalter kommt zurück
  const leave = sent ? easeOut(clamp01(since / 9), 2) : 0;
  const placeholderIn = sent ? easeOut(clamp01((since - 6) / 10), 2) : ty.shown === 0 ? 1 - clamp01((f - typeStart + 4) / 4) : 0;
  const pulse = sendAt !== undefined ? blip(f, sendAt, 2, 14) : 0;
  const press = sendAt !== undefined ? clamp01(1 - Math.abs(f - sendAt - 1.5) / 3) : 0;
  const shown = text.slice(0, ty.shown);
  const r = 46;
  const inputTop = height - PAD - ROW2;
  const qIn = sent && question ? easeOut(clamp01((since - 3) / 12), 3) : 0;

  return (
    <div
      style={{
        position: "relative",
        width,
        height,
        opacity: a,
        filter: a < 0.999 ? `blur(${((1 - a) * 14).toFixed(2)}px)` : undefined,
        transform: a < 0.999 ? `scale(${lerp(0.94, 1, a).toFixed(4)})` : undefined,
        fontFamily,
        ...style,
      }}
    >
      {/* Glas: fast schwarz, Innenschein am Rand, Glow nach oben links verschoben (Licht von dort) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: r,
          background: `linear-gradient(170deg, rgba(18, 30, 72, 0.88) 0%, rgba(7, 11, 26, 0.9) 42%, rgba(4, 7, 20, 0.94) 100%)`,
          boxShadow: [
            boxGlow(0.75 * glow + 0.6 * pulse, NEON.blue),
            `-10px -12px 46px ${rgba(NEON.sky, 0.16 * glow)}`,
            `inset 0 0 16px ${rgba(NEON.sky, 0.2 * glow)}`,
            `inset 0 0 54px ${rgba(NEON.blue, 0.2 * glow)}`,
            `inset 0 1px 0 ${rgba("#FFFFFF", 0.3)}`,
          ].join(", "),
        }}
      />
      {/* Lichtkante: dünn, oben links fast weiß, läuft nach unten rechts in Vereinsblau aus (+ weicher Saum) */}
      <svg width={width} height={height} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
        <defs>
          <linearGradient id={`cb-rim-${uid}`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={width * 0.75} y2={height * 1.6}>
            <stop offset={0} stopColor="#FFFFFF" stopOpacity={0.98} />
            <stop offset={0.28} stopColor={NEON.sky} stopOpacity={0.92} />
            <stop offset={0.62} stopColor={NEON.blue} stopOpacity={0.72} />
            <stop offset={1} stopColor={NEON.electric} stopOpacity={0.4} />
          </linearGradient>
          <filter id={`cb-glow-${uid}`} x="-5%" y="-20%" width="110%" height="140%">
            <feGaussianBlur stdDeviation={4} />
          </filter>
        </defs>
        <rect x={1.5} y={1.5} width={width - 3} height={height - 3} rx={r - 1.5} fill="none" stroke={`url(#cb-rim-${uid})`} strokeWidth={5} filter={`url(#cb-glow-${uid})`} opacity={0.9 * glow} />
        <rect x={1.2} y={1.2} width={width - 2.4} height={height - 2.4} rx={r - 1.2} fill="none" stroke={`url(#cb-rim-${uid})`} strokeWidth={2.4} />
      </svg>
      {/* Zeile 1: Bildmarke + Such-Chip */}
      <div style={{ position: "absolute", left: PAD + 12, top: PAD, height: ROW1, display: "flex", alignItems: "center", gap: 26 }}>
        <div style={{ filter: `drop-shadow(0 0 10px ${rgba(NEON.sky, 0.55)})` }}>
          <Logo width={58} mode="mark" tone="dark" />
        </div>
        <div
          style={{
            height: 80,
            padding: "0 30px 0 24px",
            borderRadius: 22,
            display: "flex",
            alignItems: "center",
            gap: 16,
            background: `linear-gradient(180deg, ${rgba("#2F5CF2", 0.98)} 0%, ${rgba("#1A36B4", 0.98)} 100%)`,
            boxShadow: `0 0 26px ${rgba(NEON.blue, 0.6)}, inset 0 1px 0 ${rgba("#FFFFFF", 0.24)}`,
          }}
        >
          <Icon name="search" size={32} color={NEON.ice} strokeWidth={2.4} />
          <span style={{ fontWeight: 800, fontSize: 32, color: NEON.ice, letterSpacing: "-0.01em", textShadow: textGlow(0.35, NEON.sky, NEON.blue, 0.4) }}>{chipLabel}</span>
        </div>
      </div>
      {/* aufgeklappter Bereich: Frage-Blase + Inhalt */}
      {e > 0.001 || qIn > 0.001 ? (
        <div style={{ position: "absolute", left: PAD, right: PAD, top: PAD + ROW1 + 18, height: Math.max(0, inputTop - (PAD + ROW1 + 18) - 18), overflow: "hidden" }}>
          {qIn > 0.001 ? (
            <div
              style={{
                position: "absolute",
                right: 6,
                top: 4,
                padding: "16px 26px",
                borderRadius: 24,
                borderBottomRightRadius: 8,
                background: `linear-gradient(180deg, ${rgba("#3466F0", 0.92)} 0%, ${rgba(NEON.deep, 0.92)} 100%)`,
                boxShadow: `0 0 30px ${rgba(NEON.blue, 0.5)}, inset 0 1px 0 ${rgba("#FFFFFF", 0.2)}`,
                color: NEON.ice,
                fontWeight: 800,
                fontSize: 32,
                letterSpacing: "-0.01em",
                opacity: qIn,
                transform: `translateY(${((1 - qIn) * 40).toFixed(2)}px) scale(${lerp(0.9, 1, qIn).toFixed(4)})`,
                transformOrigin: "100% 100%",
                filter: qIn < 0.99 ? `blur(${((1 - qIn) * 8).toFixed(2)}px)` : undefined,
                whiteSpace: "nowrap",
              }}
            >
              {text}
            </div>
          ) : null}
          <div style={{ position: "absolute", left: 0, right: 0, top: question ? 112 : 0, bottom: 0, opacity: clamp01(e * 1.4) }}>{children}</div>
        </div>
      ) : null}
      {/* Zeile 2: Eingabe */}
      <div
        style={{
          position: "absolute",
          left: PAD,
          right: PAD,
          top: inputTop,
          height: ROW2,
          borderRadius: 28,
          overflow: "hidden",
          // satte Eingabezeile: links leuchtend, nach rechts in tiefes Blau (wie t05.25)
          background: `linear-gradient(90deg, ${rgba("#3A6BF4", 0.97)} 0%, ${rgba("#2650DC", 0.93)} 32%, ${rgba("#1A38B0", 0.88)} 68%, ${rgba("#0F2378", 0.86)} 100%)`,
          boxShadow: [
            `0 0 ${(24 + 30 * pulse).toFixed(1)}px ${rgba(NEON.blue, 0.5 + 0.35 * pulse)}`,
            `inset 0 1px 0 ${rgba("#FFFFFF", 0.32)}`,
            `inset 0 0 0 1px ${rgba(NEON.sky, 0.16)}`,
            `inset 0 -14px 26px ${rgba(NEON.abyss, 0.5)}`,
          ].join(", "),
        }}
      >
        {/* heller Streifen beim Senden */}
        {pulse > 0.01 ? <div style={{ position: "absolute", inset: 0, background: `linear-gradient(90deg, ${rgba(NEON.sky, 0.35 * pulse)}, ${rgba(NEON.sky, 0)})` }} /> : null}
        {/* Prompt-Punkt (orange, Leitmotiv) */}
        <div
          style={{
            position: "absolute",
            left: 34,
            top: ROW2 / 2 - 9,
            width: 18,
            height: 18,
            borderRadius: 9,
            background: `radial-gradient(circle at 35% 35%, ${NEON.hot} 0%, ${NEON.orange} 45%, #E8643A 100%)`,
            boxShadow: `0 0 10px ${rgba(NEON.orange, 0.9)}, 0 0 26px ${rgba(NEON.orange, 0.5)}`,
          }}
        />
        <div style={{ position: "absolute", left: 76, right: 120, top: 0, height: ROW2, display: "flex", alignItems: "center" }}>
          {/* Platzhalter */}
          {placeholderIn > 0.01 ? (
            <span style={{ position: "absolute", left: 0, fontWeight: 500, fontSize: 38, color: rgba(NEON.ice, 0.62), opacity: placeholderIn, whiteSpace: "nowrap" }}>{placeholder}</span>
          ) : null}
          {/* getippter Text (steigt nach dem Senden als Echo weg) */}
          {leave < 0.999 && f >= typeStart - 2 ? (
            <span
              style={{
                position: "absolute",
                left: 0,
                fontWeight: 500,
                fontSize: 40,
                color: NEON.ice,
                whiteSpace: "pre",
                letterSpacing: "-0.005em",
                opacity: 1 - leave,
                transform: `translateY(${(-leave * 46).toFixed(2)}px)`,
                filter: leave > 0.01 ? `blur(${(leave * 6).toFixed(2)}px)` : undefined,
                textShadow: textGlow(0.28, NEON.sky, NEON.blue, 0.45),
              }}
            >
              {shown}
              {!sent ? <Cursor opacity={cursorBlink(f, ty.last)} color={NEON.ice} gap={0.06} width={0.06} /> : null}
            </span>
          ) : null}
        </div>
        {/* Senden-Knopf */}
        <div
          style={{
            position: "absolute",
            right: 18,
            top: ROW2 / 2 - 34,
            width: 68,
            height: 68,
            borderRadius: 34,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: ty.done || sent ? `radial-gradient(circle at 35% 30%, #FFB494 0%, ${NEON.orange} 55%, #E8643A 100%)` : rgba(NEON.ice, 0.14),
            boxShadow: ty.done || sent ? `0 0 ${(14 + 26 * pulse).toFixed(1)}px ${rgba(NEON.orange, 0.7 + 0.3 * pulse)}` : undefined,
            transform: `scale(${(1 - 0.12 * press + 0.08 * pulse).toFixed(4)})`,
          }}
        >
          <Icon name="arrow-up" size={34} color={ty.done || sent ? "#FFFFFF" : rgba(NEON.ice, 0.6)} strokeWidth={2.6} />
        </div>
      </div>
      {/* Lichtring beim Senden: weiche Druckwelle (Verlaufsring, wie beim Logo-Punkt) */}
      {sendAt !== undefined && since >= 0 && since < 18
        ? (() => {
            const q = since / 18;
            const R = 34 * lerp(1, 3.4, easeOut(q, 3));
            const fade = Math.pow(1 - q, 1.6);
            const th = lerp(0.3, 0.08, q);
            return (
              <div
                style={{
                  position: "absolute",
                  right: PAD + 18 + 34 - R,
                  top: inputTop + ROW2 / 2 - R,
                  width: R * 2,
                  height: R * 2,
                  borderRadius: "50%",
                  pointerEvents: "none",
                  background: `radial-gradient(circle closest-side, ${rgba(NEON.orange, 0)} ${((1 - th) * 100).toFixed(1)}%, ${rgba("#FFB696", 0.5 * fade)} ${((1 - th * 0.4) * 100).toFixed(1)}%, ${rgba("#FFFFFF", 0.7 * fade)} ${((1 - th * 0.12) * 100).toFixed(1)}%, ${rgba(NEON.orange, 0.3 * fade)} 99.5%, ${rgba(NEON.orange, 0)} 100%)`,
                }}
              />
            );
          })()
        : null}
    </div>
  );
};

export type ResponseLine = {
  text: string;
  strong?: boolean;
  color?: string;
  /** Farbpunkt links (z. B. Termin-Streifenfarbe) */
  dot?: string;
  /** eigene Schriftgröße */
  size?: number;
};

export type ResponseCardProps = {
  frame?: number;
  width: number;
  lines: ResponseLine[];
  /** Startframe der ersten Zeile */
  start: number;
  /** Abstand zwischen den Zeilen (Frames) */
  stagger?: number;
  /** Leuchtlinie links */
  accent?: boolean;
  fontSize?: number;
  lineGap?: number;
  style?: React.CSSProperties;
};

export const ResponseCard: React.FC<ResponseCardProps> = ({ frame, width, lines, start, stagger = 5, accent = true, fontSize = 34, lineGap = 18, style }) => {
  const f = useF(frame);
  const ps = lines.map((_, i) => easeOut(invLerp(start + i * stagger, start + i * stagger + 14, f), 3));
  const lh = (l: ResponseLine) => (l.size ?? (l.strong ? fontSize * 1.1 : fontSize)) * 1.3;
  const tops: number[] = [];
  let acc = 0;
  lines.forEach((l) => {
    tops.push(acc);
    acc += lh(l) + lineGap;
  });
  // Leuchtlinie wächst bis zur zuletzt erschienenen Zeile
  let lineH = 0;
  lines.forEach((l, i) => {
    if (ps[i] > 0) lineH = Math.max(lineH, tops[i] + lh(l) * ps[i]);
  });
  const ax = accent ? 30 : 0;
  return (
    <div style={{ position: "relative", width, height: acc, fontFamily, ...style }}>
      {accent && lineH > 0 ? (
        <div
          style={{
            position: "absolute",
            left: 4,
            top: 0,
            width: 4,
            height: lineH,
            borderRadius: 2,
            background: `linear-gradient(180deg, ${NEON.ice} 0%, ${NEON.sky} 30%, ${rgba(NEON.blue, 0.6)} 100%)`,
            boxShadow: `0 0 10px ${rgba(NEON.sky, 0.8)}, 0 0 26px ${rgba(NEON.blue, 0.6)}`,
          }}
        />
      ) : null}
      {lines.map((l, i) => {
        const p = ps[i];
        if (p <= 0.001) return null;
        const size = l.size ?? (l.strong ? fontSize * 1.1 : fontSize);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: ax,
              top: tops[i],
              right: 0,
              height: lh(l),
              display: "flex",
              alignItems: "center",
              gap: 16,
              opacity: clamp01(p * 1.3),
              transform: `translateX(${((1 - p) * -26).toFixed(2)}px)`,
              filter: p < 0.99 ? `blur(${((1 - p) * 8).toFixed(2)}px)` : undefined,
            }}
          >
            {l.dot ? <span style={{ width: 14, height: 14, borderRadius: 7, flexShrink: 0, background: l.dot, boxShadow: `0 0 12px ${rgba(l.dot, 0.8)}` }} /> : null}
            <span
              style={{
                fontWeight: l.strong ? 800 : 500,
                fontSize: size,
                color: l.color ?? (l.strong ? NEON.ice : rgba(NEON.ice, 0.8)),
                letterSpacing: "-0.01em",
                whiteSpace: "nowrap",
                textShadow: l.strong ? textGlow(0.35, NEON.sky, NEON.blue, 0.5) : undefined,
              }}
            >
              {l.text}
            </span>
          </div>
        );
      })}
    </div>
  );
};
