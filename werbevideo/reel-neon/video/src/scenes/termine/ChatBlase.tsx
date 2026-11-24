/**
 * Alte Chat-Blase „Wer kommt Do??“ (Gruppenchat, stilisiert wie in der Problem-Szene) – treibt herein und zerfällt vom
 * Aufprallpunkt aus in Lichtpartikel: Maske wächst kreisförmig, an der Front glüht ein Saum, Partikel lösen sich genau
 * dort, fliegen nach außen und steigen auf. Alles aus dem Frame (Hash statt Zufall), ohne große Weichzeichner.
 */
import React from "react";
import { fontFamily } from "../../fonts";
import { NEON, rgba } from "../../neon";
import { hash } from "../../neon/util";
import { clamp01, easeOut, invLerp, lerp } from "../../neon";

export const BLASE_W = 690;
export const BLASE_H = 180;
const RADIUS = 52;
const N = 150;
/** Frames, bis die Zerfallsfront die ganze Blase überstrichen hat */
export const SPREAD = 15;

type P = { hx: number; hy: number; size: number; life: number; dist: number; lift: number; wob: number; col: string; core: string };

/** Partikel: Heimatpunkt in der Blase, Größe, Lebensdauer, Flugweite, Farbe (Himmel/Eis, ein Fünftel Orange) */
const PARTS: P[] = Array.from({ length: N }, (_, i) => {
  const r = hash(i * 7.31 + 2.1);
  const col = r < 0.2 ? NEON.orange : r < 0.55 ? NEON.sky : NEON.ice;
  const core = r < 0.2 ? "#FFE3D6" : "#FFFFFF";
  // dichter im Textband (Mitte), lockerer am Rand
  const gx = hash(i * 1.71 + 0.3);
  const gy = 0.5 + (hash(i * 2.93 + 5.2) - 0.5) * (hash(i * 3.3) < 0.7 ? 0.62 : 1);
  return {
    hx: 18 + gx * (BLASE_W - 36),
    hy: 12 + gy * (BLASE_H - 24),
    size: 5 + 11 * Math.pow(hash(i * 4.13 + 1.7), 1.6),
    life: 15 + 12 * hash(i * 6.71 + 0.9),
    dist: 70 + 230 * hash(i * 5.37 + 3.3),
    lift: 40 + 110 * hash(i * 8.11 + 4.4),
    wob: (hash(i * 9.7 + 0.2) - 0.5) * 1.4,
    col,
    core,
  };
});

export type ChatBlaseProps = {
  f: number;
  /** Mitte im Videoraum */
  x: number;
  y: number;
  /** Drehung (Grad) */
  rot?: number;
  /** 0..1 Auftritt (Deckkraft, Unschärfe) */
  appear?: number;
  /** Frame des Aufpralls (Zerfall beginnt) */
  impactAt: number;
  /** Aufprallpunkt in Blasenkoordinaten (px ab links oben) */
  impact: { x: number; y: number };
};

export const ChatBlase: React.FC<ChatBlaseProps> = ({ f, x, y, rot = 0, appear = 1, impactAt, impact }) => {
  const a = clamp01(appear);
  const maxD = Math.max(
    Math.hypot(impact.x, impact.y),
    Math.hypot(BLASE_W - impact.x, impact.y),
    Math.hypot(impact.x, BLASE_H - impact.y),
    Math.hypot(BLASE_W - impact.x, BLASE_H - impact.y),
  );
  const t = f - impactAt;
  // Radius der Front: zuerst schnell, dann langsamer
  const front = t <= 0 ? -1 : maxD * 1.08 * easeOut(clamp01(t / SPREAD), 1.6);
  const feather = 26;
  const gone = front > maxD + feather;
  const dissolving = front > 0;
  const mask = dissolving
    ? `radial-gradient(circle at ${impact.x.toFixed(1)}px ${impact.y.toFixed(1)}px, rgba(0,0,0,0) ${Math.max(0, front - feather).toFixed(1)}px, #000 ${(front + 2).toFixed(1)}px)`
    : undefined;
  // Auslöse-Frame eines Partikels: wann die Front seinen Heimatpunkt erreicht
  const releaseOf = (p: P) => {
    const d = Math.hypot(p.hx - impact.x, p.hy - impact.y);
    // Umkehrung von easeOut(u, 1.6) für front = d
    const u = 1 - Math.pow(1 - clamp01(d / (maxD * 1.08)), 1 / 1.6);
    return impactAt + u * SPREAD;
  };
  if (a <= 0.001) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x - BLASE_W / 2,
        top: y - BLASE_H / 2,
        width: BLASE_W,
        height: BLASE_H,
        transform: `rotate(${rot.toFixed(2)}deg)`,
        transformOrigin: "50% 50%",
      }}
    >
      {!gone ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            opacity: a,
            filter: a < 0.995 ? `blur(${((1 - a) * 12).toFixed(2)}px)` : undefined,
            maskImage: mask,
            WebkitMaskImage: mask,
          }}
        >
          {/* Schwanz unten links (wie eine fremde Nachricht im Gruppenchat) */}
          <svg width={70} height={60} style={{ position: "absolute", left: -22, top: BLASE_H - 54, overflow: "visible" }}>
            <path d="M 56 0 L 56 36 Q 36 54 4 56 Q 27 41 27 12 Z" fill="#1E2A30" />
          </svg>
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: RADIUS,
              borderBottomLeftRadius: 14,
              background: "linear-gradient(175deg, #2B3A43 0%, #202C33 60%, #1B262C 100%)",
              boxShadow: `inset 0 1px 0 ${rgba("#FFFFFF", 0.1)}, inset 0 0 0 1px ${rgba("#FFFFFF", 0.06)}, 0 18px 50px ${rgba("#000000", 0.55)}`,
              display: "flex",
              alignItems: "center",
              paddingLeft: 56,
              boxSizing: "border-box",
            }}
          >
            <span style={{ fontFamily, fontWeight: 600, fontSize: 74, letterSpacing: "-0.01em", color: "#E9EDEF", whiteSpace: "nowrap" }}>Wer kommt Do??</span>
          </div>
          {/* glühender Saum an der Zerfallsfront, auf die Blasenform beschnitten */}
          {dissolving ? (
            <div style={{ position: "absolute", inset: 0, borderRadius: RADIUS, borderBottomLeftRadius: 14, overflow: "hidden", mixBlendMode: "screen" }}>
              <div
                style={{
                  position: "absolute",
                  left: impact.x - front - 40,
                  top: impact.y - front - 40,
                  width: (front + 40) * 2,
                  height: (front + 40) * 2,
                  borderRadius: "50%",
                  background: `radial-gradient(circle closest-side, ${rgba(NEON.sky, 0)} ${(((front - 30) / (front + 40)) * 100).toFixed(2)}%, ${rgba(NEON.ice, 0.9)} ${(((front - 4) / (front + 40)) * 100).toFixed(2)}%, ${rgba(NEON.orange, 0.55)} ${(((front + 8) / (front + 40)) * 100).toFixed(2)}%, ${rgba(NEON.orange, 0)} 100%)`,
                }}
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {/* Lichtpartikel */}
      {dissolving ? (
        <div style={{ position: "absolute", left: 0, top: 0, width: BLASE_W, height: BLASE_H, overflow: "visible", mixBlendMode: "screen" }}>
          {PARTS.map((p, i) => {
            const age = f - releaseOf(p);
            if (age < 0 || age > p.life) return null;
            const u = age / p.life;
            const dx = p.hx - impact.x;
            const dy = p.hy - impact.y;
            const len = Math.max(1, Math.hypot(dx, dy));
            // Richtung: weg vom Aufprall, leicht verwirbelt
            const ang = Math.atan2(dy, dx) + p.wob * (0.4 + u);
            const go = easeOut(u, 2.2) * p.dist * (0.55 + 0.45 * Math.min(1, len / 120));
            const px = p.hx + Math.cos(ang) * go + Math.sin(age * 0.35 + i) * 3;
            const py = p.hy + Math.sin(ang) * go * 0.6 - p.lift * easeOut(u, 1.4);
            const flash = invLerp(0, 3, age);
            const op = flash * Math.pow(1 - u, 1.3);
            const s = p.size * lerp(1.25, 0.35, u);
            const glow = s * 3.2;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: px - glow / 2,
                  top: py - glow / 2,
                  width: glow,
                  height: glow,
                  borderRadius: "50%",
                  opacity: op,
                  background: `radial-gradient(circle, ${p.core} 0%, ${rgba(p.col, 0.95)} 16%, ${rgba(p.col, 0.35)} 36%, ${rgba(p.col, 0)} 68%)`,
                }}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
