/**
 * Zähler mit Tabular-Ziffern, der per Spring hochzählt und GENAU in `end` den Zielwert zeigt
 * (davor nie). Ideal für „landet framegenau auf cue("zweihundert")“.
 *
 *   <Counter from={0} to={200} start={cue("im",{section:1}) - 6} end={cue("zweihundert")} />
 */
import React from "react";
import { FONT_BOLD, fontFamily } from "../fonts";
import { useAbsFrame } from "../lib/scene";
import { GLIDE, SpringPreset, sp } from "../springs";

export const counterValue = (
  frame: number,
  { from = 0, to, start, end, preset = GLIDE }: { from?: number; to: number; start: number; end: number; preset?: SpringPreset },
) => {
  if (frame < start) return from;
  if (frame >= end) return to;
  const p = sp(frame, start, preset, { durationInFrames: Math.max(1, end - start), overshootClamping: true });
  const v = from + (to - from) * p;
  // nie vor `end` am Ziel ankommen
  return to >= from ? Math.min(Math.floor(v), to - 1) : Math.max(Math.ceil(v), to + 1);
};

export const formatDe = (n: number, decimals = 0) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

type Props = {
  from?: number;
  to: number;
  start: number;
  end: number;
  preset?: SpringPreset;
  /** Formatierung (Standard: deutsche Tausenderpunkte) */
  format?: (n: number) => string;
  style?: React.CSSProperties;
};

export const Counter: React.FC<Props> = ({ from = 0, to, start, end, preset, format = (n) => formatDe(n), style }) => {
  const f = useAbsFrame();
  const v = counterValue(f, { from, to, start, end, preset });
  return (
    <span
      style={{
        fontFamily,
        fontWeight: FONT_BOLD,
        fontVariantNumeric: "tabular-nums",
        fontFeatureSettings: '"tnum" 1',
        ...style,
      }}
    >
      {format(v)}
    </span>
  );
};
