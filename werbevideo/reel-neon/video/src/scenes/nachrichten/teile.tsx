/**
 * Bausteine der Szene „nachrichten“: Gruppen-Karte (echte Chatzeile der App auf Glas), Leuchtring, Chat-Bildschirm der
 * gewählten Gruppe mit der Ankündigung „Arbeitseinsatz am Vereinsheim“ und die große leuchtende Lesezahl ✓✓ n/5 (nur
 * Zahl, keine Namen).
 * Alles nur aus Props – die Zeit steuert nachrichten.tsx.
 */
import React from "react";
import { fontFamily } from "../../fonts";
import { GlassPanel, NEON, ScreenPanel, boxGlow, clamp01, lerp, rgba, screenPanelHeight, textGlow } from "../../neon";
import { Icon } from "../../ui/icons";
import { Bubble, type ChatSummary, ChatHeader, ChatListRow, DayChip } from "../../ui/messages";
import { X3 } from "../../ui/primitives";
import { C, CONTENT_W } from "../../ui/tokens";

// ---- Gruppen-Karte ------------------------------------------------------------------------

/** Chatzeile im Bildraum: (CONTENT_W − 2) CSS-px × 3 breit, 218 hoch (davon 3 px Trennlinie unten) */
const ROW_W = (CONTENT_W - 2) * 3;
const ROW_H = 218;
const ROW_CLIP = 3;

export const CARD_W = 780;
const CARD_PAD_X = 22;
const CARD_PAD_Y = 20;
const ROW_K = (CARD_W - 2 * CARD_PAD_X) / ROW_W;
export const CARD_H = Math.round((ROW_H - ROW_CLIP) * ROW_K + 2 * CARD_PAD_Y);
export const CARD_R = 30;
/** Mitte des runden Chatbilds ab linker Kartenkante (12 CSS-px Abstand + halbes 44er-Bild) */
export const AVATAR_X = CARD_PAD_X + (12 + 22) * 3 * ROW_K;

/** Leuchtring um eine gewählte Karte; `pulse` 0..1 schickt eine Welle nach außen */
const SelectRing: React.FC<{ w: number; h: number; r: number; on: number; pulse: number }> = ({ w, h, r, on, pulse }) => {
  const o = clamp01(on);
  if (o <= 0.004 && (pulse <= 0 || pulse >= 1)) return null;
  const gap = 12;
  const ring = (grow: number, alpha: number, width: number, glow: number) => (
    <div
      style={{
        position: "absolute",
        left: -gap - grow,
        top: -gap - grow,
        width: w + 2 * (gap + grow),
        height: h + 2 * (gap + grow),
        boxSizing: "border-box",
        borderRadius: r + gap + grow,
        border: `${width}px solid ${rgba(NEON.sky, alpha)}`,
        boxShadow: glow > 0.004 ? `${boxGlow(glow, NEON.blue)}, inset 0 0 22px ${rgba(NEON.sky, 0.45 * glow)}` : undefined,
        pointerEvents: "none",
      }}
    />
  );
  const p = clamp01(pulse);
  return (
    <>
      {o > 0.004 ? ring(0, 0.95 * o, 3, 1.15 * o) : null}
      {/* weißer, dünner Kern auf dem Ring */}
      {o > 0.004 ? (
        <div
          style={{
            position: "absolute",
            left: -gap + 1,
            top: -gap + 1,
            width: w + 2 * gap - 2,
            height: h + 2 * gap - 2,
            boxSizing: "border-box",
            borderRadius: r + gap - 1,
            border: `1px solid ${rgba("#FFFFFF", 0.7 * o)}`,
            pointerEvents: "none",
          }}
        />
      ) : null}
      {p > 0 && p < 1 ? ring(lerp(0, 46, p), 0.7 * Math.pow(1 - p, 1.6), 2, 0.6 * (1 - p)) : null}
    </>
  );
};

export type GroupCardProps = {
  chat: ChatSummary;
  /** 0..1 – Karte leuchtet (Glas satter, Rand heller, Schein außen) */
  lit: number;
  /** 0..1 – Leuchtring sichtbar */
  ring?: number;
  /** 0..1 – Welle des Rings */
  ringPulse?: number;
  /** 0..1 – Glanzstreifen läuft durch (undefined = keiner) */
  sheen?: number;
};

/** Eine Gruppe der Nachrichtenliste als Glaskarte: echte Chatzeile (Bild, Name, Zeit, Vorschau) auf dunklem Glas */
export const GroupCard: React.FC<GroupCardProps> = ({ chat, lit, ring = 0, ringPulse = 0, sheen }) => {
  const l = clamp01(lit);
  return (
    <div style={{ position: "relative", width: CARD_W, height: CARD_H }}>
      <GlassPanel width={CARD_W} height={CARD_H} radius={CARD_R} tint={lerp(0.1, 0.55, l)} glow={lerp(0.15, 1.5, l)} edge={lerp(0.55, 1.7, l)} sheen={sheen}>
        <div style={{ position: "absolute", left: CARD_PAD_X, top: CARD_PAD_Y, width: ROW_W * ROW_K, height: (ROW_H - ROW_CLIP) * ROW_K, overflow: "hidden" }}>
          <div style={{ width: ROW_W, transform: `scale(${ROW_K})`, transformOrigin: "0 0" }}>
            <ChatListRow {...chat} />
          </div>
        </div>
      </GlassPanel>
      <SelectRing w={CARD_W} h={CARD_H} r={CARD_R} on={ring} pulse={ringPulse} />
    </div>
  );
};

// ---- Chat-Bildschirm ----------------------------------------------------------------------

export const CHAT_W = 860;
const CHAT_BEZEL = 14;
/** Ausschnitt des Chats im Bildraum (1074 breit = Inhaltsbreite der App): Kopf + „Gestern“ + Ankündigung */
const CHAT_SCREEN_W = CONTENT_W * 3;
const CHAT_SCREEN_H = 930;
export const CHAT_H = screenPanelHeight(CHAT_W, CHAT_SCREEN_H, CHAT_BEZEL, CHAT_SCREEN_W);

export const ANNOUNCEMENT = {
  title: "Arbeitseinsatz am Vereinsheim",
  body: "Wir streichen den Gastraum und räumen das Lager auf. Wer mit anpackt, trägt sich bitte im Helferplan bei „Malerarbeiten“ ein – für Verpflegung ist gesorgt!",
  time: "18:30",
} as const;

/** Empfänger des gezeigten Chats (Kopf „Erreicht 5 Personen“, Lesezahl n/5) */
export const READ_TOTAL = 5;

export type ChatScreenProps = {
  /** Gruppe, deren Chat offen ist (Name, Bild, Farbe wie in der Liste) */
  chat: ChatSummary;
  /** Lesezahl (darf hochzählen, die Blase rundet) */
  read: number;
  readPulse?: number;
  /** Leuchten des Rahmens */
  glow?: number;
};

/** Geöffneter Gruppenchat (echte Bausteine der App, dunkel), unten angeschlagen wie nach dem Öffnen */
export const ChatScreen: React.FC<ChatScreenProps> = ({ chat, read, readPulse = 0, glow = 0.9 }) => (
  <ScreenPanel width={CHAT_W} screenWidth={CHAT_SCREEN_W} screenHeight={CHAT_SCREEN_H} bezel={CHAT_BEZEL} tint={0.35} glow={glow} edge={1.3}>
    <X3 width={CONTENT_W} height={CHAT_SCREEN_H / 3}>
      <div style={{ display: "flex", flexDirection: "column", height: CHAT_SCREEN_H / 3, background: C.card }}>
        <ChatHeader title={chat.title} icon={chat.icon} tone={chat.tone} subtitle={`Erreicht ${READ_TOTAL} Personen`} />
        <div style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden", background: C.chatWall }}>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: "0 12px 14px" }}>
            <DayChip label="Gestern" />
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Bubble
                mine
                announcement
                title={ANNOUNCEMENT.title}
                body={ANNOUNCEMENT.body}
                time={ANNOUNCEMENT.time}
                read={read}
                total={READ_TOTAL}
                readPulse={readPulse}
                style={{ paddingBottom: 5 }}
              />
            </div>
          </div>
        </div>
      </div>
    </X3>
  </ScreenPanel>
);

// ---- Große Lesezahl -----------------------------------------------------------------------

export type BigReadCountProps = {
  /** gezählte Schritte als Kommazahl: 0 = „1“, 1 = „2“ … (Rollen zwischen den Ziffern) */
  roll: number;
  /** erste Ziffer (Start der Zählung) */
  from?: number;
  total?: number;
  fontSize?: number;
  /** 0..1 – Auftritt (Unschärfe → scharf, leichtes Wachsen) */
  appear: number;
  /** Zusatz-Leuchten (Aufflammen bei jedem Schritt) */
  flare?: number;
};

/** ✓✓ n/5 als große Neon-Zahl; die Ziffer rollt wie ein Zählwerk nach oben */
export const BigReadCount: React.FC<BigReadCountProps> = ({ roll, from = 1, total = READ_TOTAL, fontSize = 210, appear, flare = 0 }) => {
  const a = clamp01(appear);
  if (a <= 0.002) return null;
  const s = fontSize / 90;
  const k = 1 + flare;
  const glow = textGlow(k, NEON.sky, NEON.blue, s * 0.8);
  const lineH = fontSize * 1.05;
  const maxStep = Math.ceil(roll) + 1;
  const digits = Array.from({ length: maxStep + 1 }, (_, i) => from + i);
  const digitW = fontSize * 0.64;
  const iconSize = fontSize * 0.62;
  const padX = fontSize * 0.45;
  const winH = lineH * 1.36;
  const mask = "linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: fontSize * 0.1,
        fontFamily,
        fontWeight: 800,
        fontSize,
        lineHeight: 1,
        color: NEON.ice,
        letterSpacing: "-0.02em",
        opacity: Math.min(1, a * 1.4),
        filter: a < 0.98 ? `blur(${((1 - a) * 18).toFixed(2)}px)` : undefined,
        transform: `scale(${lerp(0.86, 1, a).toFixed(4)})`,
      }}
    >
      {/* Doppelhaken wie in der App (check-check), als Lichtlinie */}
      <div style={{ filter: `drop-shadow(0 0 ${3 * s}px ${rgba("#FFFFFF", 0.6)}) drop-shadow(0 0 ${8 * s}px ${rgba(NEON.sky, 0.95 * Math.min(1.4, k))}) drop-shadow(0 0 ${24 * s}px ${rgba(NEON.blue, 0.8 * Math.min(1.4, k))})`, marginRight: fontSize * 0.04, display: "flex" }}>
        <Icon name="check-check" size={iconSize} color={NEON.ice} strokeWidth={2.6} />
      </div>
      {/* Zählwerk: Ziffernsäule; das Fenster ist breiter/höher als die Ziffer (Platz für den Schein), Rollen blendet oben/unten weich aus */}
      <div
        style={{
          position: "relative",
          width: digitW + 2 * padX,
          height: winH,
          margin: `${-(winH - lineH) / 2}px ${-padX}px`,
          overflow: "hidden",
          WebkitMaskImage: mask,
          maskImage: mask,
        }}
      >
        {digits.map((d, i) => {
          const off = i - roll;
          const ao = Math.abs(off);
          if (ao > 0.8) return null;
          // senkrechte Bewegungsunschärfe nur während des Rollens
          const moving = Math.sin(Math.PI * clamp01(roll - Math.floor(roll)));
          const blur = moving * s * 2.6;
          return (
            <div
              key={d}
              style={{
                position: "absolute",
                left: padX,
                top: (winH - lineH) / 2,
                width: digitW,
                height: lineH,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                transform: `translateY(${(off * lineH).toFixed(2)}px)`,
                opacity: clamp01(1 - ao * 1.35),
                filter: blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : undefined,
                textShadow: glow,
              }}
            >
              {d}
            </div>
          );
        })}
      </div>
      <div style={{ textShadow: glow, color: NEON.ice, marginLeft: -fontSize * 0.07 }}>/{total}</div>
    </div>
  );
};
