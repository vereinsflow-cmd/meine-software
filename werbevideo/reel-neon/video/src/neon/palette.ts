/**
 * Neon-Palette in Markenfarben + Glow-Bausteine (mehrlagige Schatten: harter Kern, mittlerer Schein, weiter Hof).
 *
 *   textGlow(1)            text-shadow für leuchtende Schrift (Himmel innen, Vereinsblau außen)
 *   boxGlow(0.8)           box-shadow für Karten, Leisten, Ringe
 *   extrude(6)             3D-Tiefe der Schrift, dunkle Stufen nach links unten (Schattenkante)
 *   extrudeLit(6)          3D-Tiefe als beleuchtete Flanke: Himmel → Vereinsblau (wie die Referenz t02.75)
 */
import { C, rgba } from "../theme";

export const NEON = {
  /** Grund ganz unten / Ecken (fast schwarz mit Blaustich – Licht kommt nur aus den Elementen) */
  void: "#020409",
  /** Grund oben */
  night: "#050916",
  /** Nachtblau für weiche Umgebungsflecken */
  navy: "#0D1736",
  blue: C.blue,
  sky: C.sky,
  orange: C.orange,
  paper: C.paper,
  ink: C.ink,
  /** sattes Vereinsblau für leuchtende Flächen (Eingabezeile, Balken) */
  electric: "#2A5BEA",
  /** tiefes Vereinsblau (Chip, Kartenverlauf) */
  deep: "#1C42BE",
  /** sehr tiefes Blau (Schatten der Extrusion, Ringspur) */
  abyss: "#0E1F5E",
  /** fast Weiß mit Blaustich – Text auf Neon */
  ice: "#EEF3FF",
  /** gedämpfter Text auf Glas */
  mist: "rgba(214, 226, 255, 0.72)",
  /** weißglühender Kern des orangen Punkts */
  hot: "#FFF3EA",
  /** Glasfüllung (dunkel, durchscheinend) */
  glass: "rgba(10, 14, 26, 0.72)",
} as const;

/**
 * Leuchtende Schrift: 5 Lagen, Stärke k (0 … ~2), Größenfaktor s (1 = für ~90 px Schrift).
 * Der weiße Kernschein ist gedeckelt – beim Aufleuchten (k > 1) wächst nur der farbige Hof, die Buchstaben bleiben scharf.
 */
export const textGlow = (k = 1, core: string = NEON.sky, outer: string = NEON.blue, s = 1) => {
  if (k <= 0.001) return "none";
  const a = (v: number) => Math.min(1, v * k);
  return [
    `0 0 ${(1.5 * s).toFixed(1)}px ${rgba("#FFFFFF", Math.min(0.6, 0.55 * k))}`,
    `0 0 ${(7 * s).toFixed(1)}px ${rgba(core, a(0.75))}`,
    `0 0 ${(18 * s).toFixed(1)}px ${rgba(core, a(0.5))}`,
    `0 0 ${(40 * s).toFixed(1)}px ${rgba(outer, a(0.6))}`,
    `0 0 ${(90 * s).toFixed(1)}px ${rgba(outer, a(0.38))}`,
  ].join(", ");
};

/** 3D-Tiefe der Schrift: `depth` Stufen à 1 px nach links unten, dunkler werdend. */
export const extrude = (depth: number, color: string = NEON.abyss, scale = 1) => {
  const n = Math.max(0, Math.round(depth));
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const t = i / Math.max(1, n);
    out.push(`${(-0.55 * i * scale).toFixed(2)}px ${(0.85 * i * scale).toFixed(2)}px 0 ${rgba(color, 0.95 - 0.35 * t)}`);
  }
  return out;
};

/**
 * Beleuchtete 3D-Flanke: `depth` Stufen nach links unten, vorn hell (Himmel), hinten satt (Vereinsblau), letzte Stufe
 * als dunkle Kante – die Schrift wirkt wie ein leuchtender Körper statt wie ein Aufkleber mit Schatten.
 */
export const extrudeLit = (depth: number, scale = 1, front: string = "#A9C1FF", back: string = NEON.electric) => {
  const n = Math.max(0, Math.round(depth));
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const t = n > 1 ? (i - 1) / (n - 1) : 0;
    const col = i === n && n > 2 ? rgba(NEON.abyss, 0.9) : mixHex(front, back, Math.pow(t, 0.8));
    out.push(`${(-0.55 * i * scale).toFixed(2)}px ${(0.85 * i * scale).toFixed(2)}px 0 ${col}`);
  }
  return out;
};

/** Glow um Flächen (box-shadow, außen). */
export const boxGlow = (k = 1, color: string = NEON.blue, s = 1) => {
  if (k <= 0.001) return "none";
  const a = (v: number) => Math.min(1, v * k);
  return [
    `0 0 ${(2 * s).toFixed(1)}px ${rgba(NEON.sky, a(0.35))}`,
    `0 0 ${(18 * s).toFixed(1)}px ${rgba(color, a(0.42))}`,
    `0 0 ${(60 * s).toFixed(1)}px ${rgba(color, a(0.28))}`,
    `0 0 ${(140 * s).toFixed(1)}px ${rgba(color, a(0.16))}`,
  ].join(", ");
};

/** Farbe zwischen zwei Hex-Farben (0..1) als rgb(). */
export const mixHex = (a: string, b: string, t: number) => {
  const pa = hexRgb(a);
  const pb = hexRgb(b);
  const k = Math.min(1, Math.max(0, t));
  return `rgb(${Math.round(pa[0] + (pb[0] - pa[0]) * k)}, ${Math.round(pa[1] + (pb[1] - pa[1]) * k)}, ${Math.round(pa[2] + (pb[2] - pa[2]) * k)})`;
};

export const hexRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export { rgba };
