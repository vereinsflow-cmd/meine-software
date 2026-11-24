/**
 * Karte „Deine Teilnahme“ nach dem Tipp auf „Zusagen“ – Zustand wie in rsvp-panel.tsx der App:
 * „✓ Du hast zugesagt.“, der Knopf „Zusagen“ verschwindet, „Absagen“ rückt nach und heißt „Abmelden“.
 * Liegt im Bildraum von termin-detail.png (übernommen aus dem 60-s-Reel, Szene Termine).
 */
import React from "react";
import { FONT_REGULAR, fontFamily } from "../fonts";
import { box, screenSrc } from "../lib/screens";
import { GLIDE, SNAP, clamp01, mix, sp } from "../springs";
import { APP, IconCheck, IconX } from "./AppUI";
import { dent } from "./Fingertip";
import { ImgCrop } from "./Phone3D";

export const DETAIL = "termin-detail.png";
const STATUS = box(DETAIL, "status-teilnahme");
export const BTN_ZU = box(DETAIL, "knopf-zusagen");
const BTN_AB = box(DETAIL, "knopf-absagen");

const StatusLine: React.FC<{ f: number; at: number }> = ({ f, at }) => {
  if (f < at) return null;
  const p = sp(f, at, GLIDE, { durationInFrames: 10 });
  const draw = sp(f, at + 2, GLIDE, { durationInFrames: 10, overshootClamping: true });
  return (
    <>
      <div style={{ position: "absolute", left: STATUS.x - 6, top: STATUS.y - 8, width: STATUS.w + 120, height: STATUS.h + 16, backgroundColor: "#FFFFFF", opacity: clamp01(p * 3) }} />
      <div
        style={{
          position: "absolute",
          left: STATUS.x,
          top: STATUS.y - 4,
          height: STATUS.h + 8,
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontFamily,
          fontWeight: FONT_REGULAR,
          fontSize: 43,
          letterSpacing: "-0.01em",
          color: APP.text,
          whiteSpace: "nowrap",
          opacity: clamp01(p * 1.4),
          filter: p < 0.97 ? `blur(${(4 * (1 - p)).toFixed(2)}px)` : undefined,
        }}
      >
        <IconCheck size={46} color="#059669" draw={draw} width={2.8} />
        Du hast zugesagt.
      </div>
    </>
  );
};

const Buttons: React.FC<{ f: number; at: number }> = ({ f, at }) => {
  if (f < at - 3) return null;
  const press = dent(f, at);
  const gone = sp(f, at + 4, SNAP, { durationInFrames: 9 });
  const slide = sp(f, at + 7, GLIDE, { durationInFrames: 14 });
  const label = sp(f, at + 6, GLIDE, { durationInFrames: 8 });
  const src = screenSrc(DETAIL);
  return (
    <>
      <div style={{ position: "absolute", left: BTN_ZU.x - 8, top: BTN_ZU.y - 8, width: BTN_AB.x + BTN_AB.w - BTN_ZU.x + 16, height: BTN_ZU.h + 16, backgroundColor: "#FFFFFF" }} />
      <ImgCrop src={src} box={BTN_ZU} radius={24} scale={press * mix(gone, 1, 0.92)} opacity={1 - gone} />
      <div style={{ position: "absolute", left: BTN_AB.x + (BTN_ZU.x - BTN_AB.x) * slide, top: BTN_AB.y, width: BTN_AB.w, height: BTN_AB.h }}>
        <ImgCrop src={src} box={BTN_AB} at={{ x: 0, y: 0 }} radius={24} />
        <div style={{ position: "absolute", left: 14, top: 10, width: BTN_AB.w - 28, height: BTN_AB.h - 20, backgroundColor: "#FFFFFF", opacity: label }} />
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 18,
            fontFamily,
            fontWeight: FONT_REGULAR,
            fontSize: 42,
            color: APP.text,
            opacity: label,
            filter: label < 0.97 ? `blur(${(3 * (1 - label)).toFixed(2)}px)` : undefined,
          }}
        >
          <IconX size={36} color={APP.text} width={2.4} />
          Abmelden
        </div>
      </div>
    </>
  );
};

/** Zugesagt-Zustand ab dem Tipp-Frame `at` */
export const Zugesagt: React.FC<{ f: number; at: number }> = ({ f, at }) => (
  <>
    <Buttons f={f} at={at} />
    <StatusLine f={f} at={at + 3} />
  </>
);
