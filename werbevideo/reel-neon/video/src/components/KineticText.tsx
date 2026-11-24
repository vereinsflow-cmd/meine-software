/**
 * Kinetische Typografie: jedes Wort in einer Maske, translateY 105 % → 0, Blur 10 → 0,
 * leichter Overshoot über das pop-Preset. Abgang schneller als Auftritt (8 Frames, nach oben,
 * Blur 0 → 6). Startframes kommen aus dem Zeitplan (cue()).
 *
 *   <KineticText lines={[[{text:"Wer", at: cue("wer",{section:2})}, …], […]]} fontSize={96} />
 */
import React from "react";
import { FONT_BOLD, fontFamily, FontWeight } from "../fonts";
import { useAbsFrame } from "../lib/scene";
import { POP, SNAP, SpringPreset, clamp01, sp } from "../springs";
import { C } from "../theme";

export type KWord = {
  text: string;
  /** absoluter Frame, an dem das Wort einsetzt */
  at: number;
  color?: string;
  weight?: FontWeight;
  /** eigener Inhalt statt `text` (z. B. Fragezeichen mit separatem Punkt) */
  node?: React.ReactNode;
};

type Props = {
  lines: KWord[][];
  fontSize: number;
  color?: string;
  weight?: FontWeight;
  /** Zeilenhöhe als Faktor */
  lineHeight?: number;
  align?: "left" | "center" | "right";
  /** absoluter Frame, ab dem die Wörter abgehen (null = bleiben) */
  exitAt?: number | null;
  exitStagger?: number;
  preset?: SpringPreset;
  /** Wortabstand in em */
  gap?: number;
  letterSpacing?: number;
  /** Frame einfrieren (Hit-Stop) */
  freezeAt?: number;
  style?: React.CSSProperties;
};

export const KineticText: React.FC<Props> = ({
  lines,
  fontSize,
  color = C.paper,
  weight = FONT_BOLD,
  lineHeight = 1.06,
  align = "left",
  exitAt = null,
  exitStagger = 1,
  preset = POP,
  gap = 0.26,
  letterSpacing = -0.02,
  freezeAt,
  style,
}) => {
  const f0 = useAbsFrame();
  const f = freezeAt !== undefined ? Math.min(f0, freezeAt) : f0;
  let idx = 0;
  return (
    <div
      style={{
        position: "absolute",
        fontFamily,
        fontWeight: weight,
        fontSize,
        lineHeight,
        color,
        textAlign: align,
        letterSpacing: `${letterSpacing}em`,
        ...style,
      }}
    >
      {lines.map((line, li) => (
        <div key={li} style={{ whiteSpace: "nowrap" }}>
          {line.map((w, wi) => {
            const i = idx++;
            return (
              <WordMask
                key={wi}
                word={w}
                frame={f}
                preset={preset}
                exitAt={exitAt === null ? null : exitAt + i * exitStagger}
                last={wi === line.length - 1}
                gap={gap}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
};

const WordMask: React.FC<{
  word: KWord;
  frame: number;
  preset: SpringPreset;
  exitAt: number | null;
  last: boolean;
  gap: number;
}> = ({ word, frame, preset, exitAt, last, gap }) => {
  const p = sp(frame, word.at, preset);
  const q = exitAt === null ? 0 : sp(frame, exitAt, SNAP, { durationInFrames: 8 });
  const y = (1 - p) * 105 - q * 80;
  const blur = 10 * clamp01(1 - p) + 6 * q;
  const opacity = clamp01(p * 1.8) * (1 - q);
  const padT = 0.16;
  const padB = 0.14;
  const padX = 0.08;
  return (
    <span
      style={{
        display: "inline-block",
        overflow: "hidden",
        verticalAlign: "top",
        padding: `${padT}em ${padX}em ${padB}em`,
        margin: `-${padT}em ${last ? -padX : gap - padX}em -${padB}em -${padX}em`,
      }}
    >
      <span
        style={{
          display: "inline-block",
          translate: `0 ${y.toFixed(3)}%`,
          filter: blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : undefined,
          opacity,
          color: word.color,
          fontWeight: word.weight,
        }}
      >
        {word.node ?? word.text}
      </span>
    </span>
  );
};
