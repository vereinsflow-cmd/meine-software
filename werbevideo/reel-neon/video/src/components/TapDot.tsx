/**
 * Der orange Punkt als Fingerkuppe: fliegt (optional) heran, tippt (Squash) und schickt einen
 * Ripple-Ring aus (1 → 2,2 in 12 Frames). `pressScale()` liefert die 0,97-Delle für das
 * angetippte Element.
 *
 *   <TapDot x={620} y={1010} at={cue("zu", {section: 4})} from={{x: 540, y: 960, at: cue(...) - 14}} />
 */
import React from "react";
import { useAbsFrame } from "../lib/scene";
import { GLIDE, SNAP, clamp01, mix, sp } from "../springs";
import { C, DOT, rgba } from "../theme";

type Props = {
  x: number;
  y: number;
  /** absoluter Frame des Tipps */
  at: number;
  size?: number;
  color?: string;
  /** Anflug: Startpunkt und Startframe */
  from?: { x: number; y: number; at: number };
  /** ab hier verschwindet der Punkt (Spring, 8 Frames) */
  leaveAt?: number;
  /** ab hier erscheint der Punkt (ohne `from`) */
  appearAt?: number;
  glow?: boolean;
};

export const TapDot: React.FC<Props> = ({
  x,
  y,
  at,
  size = 44,
  color = C.orange,
  from,
  leaveAt,
  appearAt,
  glow = true,
}) => {
  const f = useAbsFrame();
  const travel = from ? sp(f, from.at, GLIDE, { durationInFrames: Math.max(6, at - from.at) }) : 1;
  const cx = from ? mix(travel, from.x, x) : x;
  const cy = from ? mix(travel, from.y, y) - Math.sin(Math.PI * clamp01(travel)) * 40 : y;
  const appear = from ? 1 : appearAt !== undefined ? sp(f, appearAt, SNAP) : 1;
  const leave = leaveAt !== undefined ? sp(f, leaveAt, SNAP, { durationInFrames: 8 }) : 0;
  if ((from && f < from.at) || (appearAt !== undefined && f < appearAt) || leave >= 0.999) return null;

  // Druck: 1 → 0,82 → 1
  const press = sp(f, at - 2, SNAP, { durationInFrames: 4 }) - sp(f, at + 2, SNAP, { durationInFrames: 8 });
  const s = (1 - 0.18 * press) * mix(appear, 0.92, 1) * (1 - leave * 0.3);
  const ripple = sp(f, at, SNAP, { durationInFrames: 12 });
  const showRipple = f >= at && ripple < 0.995;
  return (
    <>
      {showRipple ? (
        <div
          style={{
            position: "absolute",
            left: cx - size / 2,
            top: cy - size / 2,
            width: size,
            height: size,
            borderRadius: "50%",
            border: `3px solid ${rgba(color, 0.9)}`,
            scale: String(mix(ripple, 1, 2.2)),
            opacity: (1 - ripple) * 0.85,
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          left: cx - size / 2,
          top: cy - size / 2,
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundColor: color,
          scale: String(s),
          opacity: appear * (1 - leave),
          boxShadow: glow ? `0 0 ${size * 0.8}px ${rgba(color, 0.55)}, 0 6px 16px ${rgba("#000000", 0.25)}` : undefined,
        }}
      />
    </>
  );
};

/** Delle des angetippten Elements: 1 → 0,97 → 1 um den Tipp-Frame. */
export const pressScale = (frame: number, at: number, depth = 0.03) =>
  1 - depth * (sp(frame, at - 1, SNAP, { durationInFrames: 4 }) - sp(frame, at + 3, SNAP, { durationInFrames: 8 }));

/** Leitmotiv-Punkt ohne Tipp – frei positionierbar (z. B. ruhig in der Bildmitte). */
export const LeitDot: React.FC<{
  x: number;
  y: number;
  size?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  color?: string;
  glow?: number;
  opacity?: number;
}> = ({ x, y, size = DOT.size, scale = 1, scaleX = 1, scaleY = 1, color = C.orange, glow = 1, opacity = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: x - size / 2,
      top: y - size / 2,
      width: size,
      height: size,
      borderRadius: "50%",
      backgroundColor: color,
      opacity,
      transform: `scale(${scale * scaleX}, ${scale * scaleY})`,
      boxShadow:
        glow > 0
          ? `0 0 ${size * 0.9 * glow}px ${rgba(color, 0.55 * glow)}, 0 0 ${size * 2.4 * glow}px ${rgba(color, 0.22 * glow)}`
          : undefined,
    }}
  />
);
