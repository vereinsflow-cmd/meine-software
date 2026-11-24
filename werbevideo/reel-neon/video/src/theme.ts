/** Marke, Abstände, Safe Zones – eine Quelle für alle Szenen. */
export const C = {
  /** Tinte – dunkler Grund */
  ink: "#0F1C2E",
  /** etwas hellere Tinte für Flächen auf Tinte */
  inkRaised: "#17283F",
  /** tiefere Tinte für Vignetten / Hintergrund hinter Faltungen */
  inkDeep: "#0A1422",
  /** Vereinsblau */
  blue: "#3A6BEA",
  /** Himmel – Blau auf dunklem Grund */
  sky: "#8FB0FF",
  /** Signalorange – Akzent, Logo-Punkt, Leitmotiv */
  orange: "#FF8A5E",
  /** Papier – heller Grund */
  paper: "#F6F3EC",
  /** Schwarz der Marke */
  black: "#1A1A1A",
  white: "#FFFFFF",
} as const;

export const W = 1080;
export const H = 1920;

/** Instagram Safe Zones: nichts Wichtiges über TOP oder unter BOTTOM. */
export const SAFE = { top: 250, bottom: 1570, side: 80 } as const;

export const ZONES = {
  /** Headlines (Manrope 800, 84 px) */
  headline: { top: 300, bottom: 460 },
  /** große Typo mittig */
  bigType: { top: 700, bottom: 1100 },
  /** wichtige UI in Geräten */
  ui: { top: 480, bottom: 1280 },
  /** Untertitel-Band */
  subtitles: { top: 1330, bottom: 1530 },
} as const;

export const TYPE = {
  headline: 84,
  big: 96,
  subtitle: 56,
  chip: 40,
  support: 44,
} as const;

/** Der orange Punkt – Leitmotiv. Ruheposition in der Bildmitte. */
export const DOT = { size: 40, home: { x: 540, y: 960 } } as const;

/** Grain-Deckkraft je Welt */
export const GRAIN = { ink: 0.05, paper: 0.04 } as const;

/**
 * Farbe → rgba() mit neuer Deckkraft. Nimmt Hex („#3A6BEA“, „#FFF“) und auch rgb()/rgba()-Strings,
 * wie interpolateColors() sie liefert (sonst würden gemischte Farben zu Schwarz).
 */
export const rgba = (color: string, a: number) => {
  const m = color.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (m) return `rgba(${Math.round(+m[1])}, ${Math.round(+m[2])}, ${Math.round(+m[3])}, ${a})`;
  const h = color.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
