/**
 * Gemessene Glyphen-Maße von Manrope 800 (in em, Ursprung = linker Rand / Grundlinie).
 * Ermittelt per Canvas-Pixelscan (siehe Szenen-Doku). Für das Fragezeichen, dessen Punkt
 * zum Leitmotiv wird: Glyphe ohne Punkt rendern + eigenen Punkt exakt daraufsetzen.
 */
export const MANROPE = {
  ascent: 1.065,
  descent: 0.3,
  capHeight: 0.72,
} as const;

export const QMARK = {
  advance: 0.563,
  dotCx: 0.2675,
  dotCy: -0.0725,
  dotD: 0.14,
  /** oberhalb dieser Linie (über der Grundlinie) liegt nur noch der Haken */
  cut: 0.17,
} as const;

/** Abstand Zeilenoberkante → Grundlinie (em) bei gegebener Zeilenhöhe (em) */
export const baselineFromTop = (lineHeightEm: number) =>
  (lineHeightEm - (MANROPE.ascent + MANROPE.descent)) / 2 + MANROPE.ascent;
