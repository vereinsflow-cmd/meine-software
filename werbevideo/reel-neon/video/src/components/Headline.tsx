/**
 * Zweizeilige Überschrift im Produktfilm-Stil: Zeile 1 weiß, Zeile 2 Himmel, der Schlusspunkt von Zeile 2 orange.
 * Wörter erscheinen nacheinander aus der Unschärfe (von unten), am Ende gehen alle gemeinsam nach oben weg.
 * Zu lange Zeilen werden automatisch kleiner gesetzt (Breite gemessen, nicht geschätzt).
 *
 *   <Headline lines={["Alle Mitglieder.", "An einem Ort."]} at={124} out={231} />
 */
import React from "react";
import { FONT_BOLD } from "../fonts";
import { textWidth } from "../lib/measure";
import { useAbsFrame } from "../lib/scene";
import { SNAP, SpringPreset, clamp01, sp } from "../springs";
import { C } from "../theme";

const WORD_IN: SpringPreset = { damping: 18, stiffness: 110, mass: 0.9 };
const LS = -0.032;

export type HeadlineProps = {
  lines: string[];
  /** Auftritt (absoluter Frame) */
  at: number;
  /** Abgang (absoluter Frame); weglassen = bleibt stehen */
  out?: number;
  top?: number;
  fontSize?: number;
  maxWidth?: number;
  /** Abstand zwischen den Wörtern beim Auftritt (Frames) */
  stagger?: number;
  colors?: string[];
  /** Schlusspunkt der letzten Zeile in Orange */
  orangeStop?: boolean;
  /** eigener Startframe für Zeile 2 (z. B. auf ein späteres Wort der Stimme) */
  line2At?: number;
};

export const headlineFontSize = (lines: string[], fontSize: number, maxWidth: number) => {
  const widest = Math.max(...lines.map((l) => textWidth(l, fontSize, FONT_BOLD, LS)));
  return widest > maxWidth ? Math.floor((fontSize * maxWidth) / widest) : fontSize;
};

export const Headline: React.FC<HeadlineProps> = ({
  lines,
  at,
  out,
  top = 300,
  fontSize = 80,
  maxWidth = 900,
  stagger = 3,
  colors = [C.white, C.sky],
  orangeStop = true,
  line2At,
}) => {
  const f = useAbsFrame();
  if (f < at - 1) return null;
  const size = headlineFontSize(lines, fontSize, maxWidth);
  const lh = size * 1.08;
  const leave = out !== undefined ? sp(f, out, SNAP, { durationInFrames: 12, overshootClamping: true }) : 0;
  if (leave >= 0.999) return null;
  let wi = 0;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top, textAlign: "center" }}>
      {lines.map((line, li) => {
        const words = line.split(" ");
        const lineStart = li === 1 && line2At !== undefined ? line2At : null;
        return (
          <div
            key={li}
            style={{
              height: lh,
              lineHeight: `${lh}px`,
              fontSize: size,
              fontWeight: FONT_BOLD,
              letterSpacing: `${LS}em`,
              color: colors[li] ?? C.white,
              whiteSpace: "nowrap",
            }}
          >
            {words.map((w, k) => {
              const start = lineStart !== null ? lineStart + k * stagger : at + wi * stagger + (li > 0 ? 3 : 0);
              wi++;
              const p = sp(f, start, WORD_IN, { durationInFrames: 22 });
              const q = clamp01(leave * 1.15 - k * 0.04);
              const isLast = li === lines.length - 1 && k === words.length - 1;
              const stop = orangeStop && isLast && w.endsWith(".");
              const body = stop ? w.slice(0, -1) : w;
              return (
                <React.Fragment key={k}>
                  <span
                    style={{
                      display: "inline-block",
                      opacity: clamp01(p * 1.3) * (1 - q),
                      transform: `translateY(${((1 - p) * 34 - q * 26).toFixed(2)}px)`,
                      filter: p < 0.98 || q > 0.02 ? `blur(${((1 - clamp01(p)) * 14 + q * 12).toFixed(2)}px)` : undefined,
                    }}
                  >
                    {body}
                    {stop ? <span style={{ color: C.orange }}>.</span> : null}
                  </span>
                  {k < words.length - 1 ? " " : null}
                </React.Fragment>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

/**
 * Zeile, deren Text im Takt wechselt (Finanzen: „Beiträge.“ → „Kassenbuch.“ → „Rechnungen.“).
 * Das alte Wort geht mit Blur nach oben, das neue kommt von unten.
 */
export const CyclingLine: React.FC<{
  items: { text: string; at: number }[];
  out?: number;
  top: number;
  fontSize?: number;
  color?: string;
}> = ({ items, out, top, fontSize = 80, color = C.sky }) => {
  const f = useAbsFrame();
  const leave = out !== undefined ? sp(f, out, SNAP, { durationInFrames: 12, overshootClamping: true }) : 0;
  if (leave >= 0.999 || f < items[0].at - 1) return null;
  const lh = fontSize * 1.08;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top, height: lh }}>
      {items.map((it, i) => {
        const next = items[i + 1];
        const p = sp(f, it.at, WORD_IN, { durationInFrames: 18 });
        const q = Math.max(next ? sp(f, next.at - 1, SNAP, { durationInFrames: 9, overshootClamping: true }) : 0, leave);
        if (f < it.at - 1 || q >= 0.999) return null;
        const stop = it.text.endsWith(".");
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              textAlign: "center",
              lineHeight: `${lh}px`,
              fontSize,
              fontWeight: FONT_BOLD,
              letterSpacing: `${LS}em`,
              color,
              whiteSpace: "nowrap",
              opacity: clamp01(p * 1.3) * (1 - q),
              transform: `translateY(${((1 - p) * 34 - q * 30).toFixed(2)}px)`,
              filter: p < 0.98 || q > 0.02 ? `blur(${((1 - clamp01(p)) * 14 + q * 12).toFixed(2)}px)` : undefined,
            }}
          >
            {stop ? it.text.slice(0, -1) : it.text}
            {stop ? <span style={{ color: C.orange }}>.</span> : null}
          </div>
        );
      })}
    </div>
  );
};
