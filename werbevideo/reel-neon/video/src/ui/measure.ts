/**
 * Textbreite per Canvas messen (synchron, deterministisch) – für gleitende Reiter-Kacheln und Knöpfe,
 * die ihre Beschriftung wechseln. Schrift wie in der App (System-Schrift).
 */
import { FONT } from "./tokens";

let ctx: CanvasRenderingContext2D | null = null;
const cache = new Map<string, number>();

/** Breite von `text` in Bildpixeln bei `size` px und Gewicht `weight` (ohne Laufweite). */
export const textWidth = (text: string, size: number, weight = 400, letterSpacing = 0) => {
  const key = `${weight}|${size}|${letterSpacing}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let w = text.length * size * 0.55;
  if (typeof document !== "undefined") {
    if (!ctx) ctx = document.createElement("canvas").getContext("2d");
    if (ctx) {
      ctx.font = `${weight} ${size}px ${FONT}`;
      w = ctx.measureText(text).width;
    }
  }
  w += letterSpacing * text.length;
  cache.set(key, w);
  return w;
};
