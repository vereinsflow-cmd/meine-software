/**
 * Gläserne Chat-Eingabe für „frage“ – Look der neon/CommandBar (Glas, Lichtkante oben links, satte blaue Eingabezeile),
 * aber eindeutig als Eingabe des alten Gruppenchats aus „problem“: Kopf „Eltern D-Jugend · Gruppe“ wie die Chat-Karte,
 * Platzhalter „Nachricht“, Anhängen-Plus und Papierflieger zum Senden (kein Suchfeld, keine Frage an die App – die
 * Rundfrage im Chat löst „termine“ später auf). Eingabe zweizeilig mit großer Schrift (56 px im Bildraum ≈ 57 px auf
 * dem Schirm), damit die Frage die 48-px-Regel erfüllt und die Leiste in der Safe Zone bleibt. Ohne Orange und ohne
 * Bildmarke – beides gehört dem Auftritt von VereinsFlow in „mitglieder“. Der Senden-Knopf wird erst nach dem letzten
 * Anschlag aktiv (Chat-Blau).
 */
import React, { useId } from "react";
import { fontFamily } from "../../fonts";
import { Cursor, NEON, blip, boxGlow, clamp01, cursorBlink, lerp, rgba, textGlow } from "../../neon";
import { Icon } from "../../ui/icons";

const PAD = 26;
const ROW1 = 84;
const GAP = 18;
const LINE = 68;
const IN_PAD = 22;
const ROW2 = IN_PAD * 2 + LINE * 2;
const FONT = 56;

export const FRAGE_BAR_W = 840;
export const FRAGE_BAR_H = PAD + ROW1 + GAP + ROW2 + PAD;

export const FrageBar: React.FC<{
  f: number;
  /** voller Text und Zeichen-Index, an dem Zeile 2 beginnt */
  text: string;
  breakAt: number;
  /** Zahl der getippten Zeichen und Frame des letzten Anschlags */
  shown: number;
  lastKey: number;
  /** Frame, an dem die Frage fertig getippt ist (Senden-Knopf wird orange) */
  doneAt: number;
  appear?: number;
  glow?: number;
  placeholder?: string;
}> = ({ f, text, breakAt, shown, lastKey, doneAt, appear = 1, glow = 1, placeholder = "Nachricht" }) => {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const W = FRAGE_BAR_W;
  const H = FRAGE_BAR_H;
  const a = clamp01(appear);
  const r = 46;
  const chars = Array.from(text);
  const n = Math.max(0, Math.min(chars.length, shown));
  const l1 = chars.slice(0, Math.min(n, breakAt)).join("").replace(/\s+$/, "");
  const l2 = n > breakAt ? chars.slice(breakAt, n).join("") : "";
  const onLine2 = n > breakAt;
  const done = f >= doneAt;
  const ready = blip(f, doneAt, 2, 16);
  const placeholderIn = n === 0 ? 1 - clamp01((f - (lastKey - 4)) / 4) : 0;
  const blink = cursorBlink(f, lastKey);
  const inputTop = PAD + ROW1 + GAP;
  const lineStyle: React.CSSProperties = {
    height: LINE,
    display: "flex",
    alignItems: "center",
    fontWeight: 500,
    fontSize: FONT,
    color: NEON.ice,
    whiteSpace: "pre",
    letterSpacing: "-0.012em",
    textShadow: textGlow(0.3, NEON.sky, NEON.blue, 0.45),
  };
  const cursor = <Cursor opacity={blink} color={NEON.ice} gap={0.05} width={0.055} />;

  return (
    <div
      style={{
        position: "relative",
        width: W,
        height: H,
        opacity: a,
        filter: a < 0.999 ? `blur(${((1 - a) * 14).toFixed(2)}px)` : undefined,
        transform: a < 0.999 ? `scale(${lerp(0.94, 1, a).toFixed(4)})` : undefined,
        fontFamily,
      }}
    >
      {/* Glas */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: r,
          background: "linear-gradient(170deg, rgba(18, 30, 72, 0.9) 0%, rgba(7, 11, 26, 0.92) 42%, rgba(4, 7, 20, 0.95) 100%)",
          boxShadow: [
            boxGlow(0.75 * glow + 0.35 * ready, NEON.blue),
            `-10px -12px 46px ${rgba(NEON.sky, 0.16 * glow)}`,
            `inset 0 0 16px ${rgba(NEON.sky, 0.2 * glow)}`,
            `inset 0 0 54px ${rgba(NEON.blue, 0.2 * glow)}`,
            `inset 0 1px 0 ${rgba("#FFFFFF", 0.3)}`,
          ].join(", "),
        }}
      />
      {/* Lichtkante */}
      <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
        <defs>
          <linearGradient id={`fb-rim-${uid}`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={W * 0.75} y2={H * 1.6}>
            <stop offset={0} stopColor="#FFFFFF" stopOpacity={0.98} />
            <stop offset={0.28} stopColor={NEON.sky} stopOpacity={0.92} />
            <stop offset={0.62} stopColor={NEON.blue} stopOpacity={0.72} />
            <stop offset={1} stopColor={NEON.electric} stopOpacity={0.4} />
          </linearGradient>
          <filter id={`fb-glow-${uid}`} x="-5%" y="-20%" width="110%" height="140%">
            <feGaussianBlur stdDeviation={4} />
          </filter>
        </defs>
        <rect x={1.5} y={1.5} width={W - 3} height={H - 3} rx={r - 1.5} fill="none" stroke={`url(#fb-rim-${uid})`} strokeWidth={5} filter={`url(#fb-glow-${uid})`} opacity={0.9 * glow} />
        <rect x={1.2} y={1.2} width={W - 2.4} height={H - 2.4} rx={r - 1.2} fill="none" stroke={`url(#fb-rim-${uid})`} strokeWidth={2.4} />
      </svg>
      {/* Zeile 1: Kopf des Gruppenchats (wie die Chat-Karte in „problem“) */}
      <div style={{ position: "absolute", left: PAD + 8, top: PAD, height: ROW1, display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            width: 66,
            height: 66,
            borderRadius: 33,
            background: `linear-gradient(160deg, ${rgba("#2F5CF2", 0.95)}, ${rgba(NEON.deep, 0.95)})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 0 20px ${rgba(NEON.blue, 0.5)}, inset 0 1px 0 ${rgba("#FFFFFF", 0.22)}`,
          }}
        >
          <Icon name="users" size={34} color={NEON.ice} strokeWidth={2.2} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontWeight: 800, fontSize: 34, color: NEON.ice, letterSpacing: "-0.01em", whiteSpace: "nowrap", textShadow: textGlow(0.3, NEON.sky, NEON.blue, 0.4) }}>Eltern D-Jugend</span>
          <span style={{ fontWeight: 500, fontSize: 24, color: NEON.mist, whiteSpace: "nowrap" }}>Gruppe</span>
        </div>
      </div>
      {/* Zeile 2: zweizeilige Eingabe */}
      <div
        style={{
          position: "absolute",
          left: PAD,
          right: PAD,
          top: inputTop,
          height: ROW2,
          borderRadius: 30,
          overflow: "hidden",
          background: `linear-gradient(90deg, ${rgba("#3A6BF4", 0.97)} 0%, ${rgba("#2650DC", 0.93)} 32%, ${rgba("#1A38B0", 0.88)} 68%, ${rgba("#0F2378", 0.86)} 100%)`,
          boxShadow: [`0 0 24px ${rgba(NEON.blue, 0.5)}`, `inset 0 1px 0 ${rgba("#FFFFFF", 0.32)}`, `inset 0 0 0 1px ${rgba(NEON.sky, 0.16)}`, `inset 0 -18px 30px ${rgba(NEON.abyss, 0.5)}`].join(", "),
        }}
      >
        {/* Anhängen-Plus wie in jedem Messenger (neutral, kein VereinsFlow-Orange) */}
        <div style={{ position: "absolute", left: 18, top: IN_PAD + LINE / 2 - 20, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="plus" size={36} color={rgba(NEON.ice, 0.72)} strokeWidth={2.4} />
        </div>
        <div style={{ position: "absolute", left: 70, right: 104, top: IN_PAD }}>
          {placeholderIn > 0.01 ? (
            <div style={{ ...lineStyle, position: "absolute", left: 0, top: 0, color: rgba(NEON.ice, 0.6), textShadow: "none", opacity: placeholderIn }}>{placeholder}</div>
          ) : null}
          {n > 0 || f >= lastKey - 2 ? (
            <>
              <div style={lineStyle}>
                {l1}
                {!onLine2 ? cursor : null}
              </div>
              <div style={lineStyle}>
                {l2}
                {onLine2 ? cursor : null}
              </div>
            </>
          ) : null}
        </div>
        {/* Senden-Knopf (Papierflieger): grau, bis die Frage fertig ist, dann Chat-Blau */}
        <div
          style={{
            position: "absolute",
            right: 18,
            top: IN_PAD + LINE + LINE / 2 - 36,
            width: 72,
            height: 72,
            borderRadius: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: done ? `radial-gradient(circle at 35% 30%, ${NEON.sky} 0%, #2F5CF2 55%, #1A36B4 100%)` : rgba(NEON.ice, 0.14),
            boxShadow: done ? `0 0 ${(12 + 22 * ready).toFixed(1)}px ${rgba(NEON.sky, 0.55 + 0.3 * ready)}, inset 0 1px 0 ${rgba("#FFFFFF", 0.3)}` : undefined,
            transform: `scale(${(1 + 0.1 * ready).toFixed(4)})`,
          }}
        >
          <Icon name="send-horizontal" size={34} color={done ? "#FFFFFF" : rgba(NEON.ice, 0.6)} strokeWidth={2.4} />
        </div>
      </div>
    </div>
  );
};
