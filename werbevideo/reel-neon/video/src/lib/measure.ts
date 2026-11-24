/**
 * Textbreiten über Canvas messen (Manrope ist per loadFont geladen, bevor gerendert wird).
 * Ergebnisse werden erst gecacht, wenn die Schrift wirklich bereit ist; <FontGate> sorgt dafür, dass
 * erst danach gerendert (und gemessen) wird.
 */
import { fontFamily, fontsReady } from "../fonts";

let ctx: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();

export const textWidth = (text: string, fontSize: number, weight: 500 | 800 = 800, letterSpacingEm = 0) => {
  const font = `${weight} ${fontSize}px ${fontFamily}`;
  const key = `${font}|${letterSpacingEm}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (typeof document === "undefined") return text.length * fontSize * 0.58;
  if (!ctx) ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return text.length * fontSize * 0.58;
  ctx.font = font;
  const w = ctx.measureText(text).width + letterSpacingEm * fontSize * text.length;
  // erst cachen, wenn Manrope wirklich geladen ist (check() wäre vorher fälschlich true)
  if (fontsReady()) cache.set(key, w);
  return w;
};
