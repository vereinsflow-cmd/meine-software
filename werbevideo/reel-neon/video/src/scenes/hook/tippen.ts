/**
 * Tippen im Takt der Stimme (für GlowPill und CommandBar, die selbst nur mit festem Tempo tippen):
 * Jedes Wort tippt sich ab seinem Wortanfang (cue − lead) Zeichen für Zeichen ein. synthTyping() rechnet daraus die
 * Props text/typeStart, mit denen der Baustein genau die bis f getippten Zeichen zeigt und den letzten Anschlag (für
 * Cursor, Nachgleiten der Breite und Aufglühen) exakt auf den echten Anschlag legt.
 */
import { typing, typingEnd } from "../../neon";

/** Anschlagzeit (Frame) je Zeichen; Wörter beginnen bei wordStarts[i] − lead, das Leerzeichen gehört zum Wort davor */
export const wordKeyTimes = (text: string, wordStarts: number[], lead = 2, maxPerChar = 1.6, minPerChar = 0.7): number[] => {
  const words = text.split(" ");
  const out: number[] = [];
  words.forEach((w, i) => {
    const s = wordStarts[i] - lead;
    const isLast = i === words.length - 1;
    const chars = Array.from(w).length + (isLast ? 0 : 1);
    const span = isLast ? chars * maxPerChar : wordStarts[i + 1] - lead - s;
    const per = Math.max(minPerChar, Math.min(maxPerChar, span / chars));
    for (let k = 0; k < chars; k++) out.push(s + k * per);
  });
  return out;
};

/** Zahl der bis Frame f getippten Zeichen */
export const typedAt = (times: number[], f: number) => {
  let n = 0;
  while (n < times.length && times[n] <= f) n++;
  return n;
};

/** Props für GlowPill/CommandBar: zeigt genau die bis f getippten Zeichen, letzter Anschlag = times[n − 1] */
export const synthTyping = (full: string, times: number[], f: number, cps = 16) => {
  const n = typedAt(times, f);
  if (n === 0) return { text: full, typeStart: times[0], n, last: times[0] };
  const text = Array.from(full).slice(0, n).join("");
  const last = times[n - 1];
  return { text, typeStart: last - typingEnd(0, text, cps) - 1e-6, n, last };
};

/**
 * Wie synthTyping, aber GlowPill bekommt den VOLLEN Text (dann bricht sie mit maxWidth stabil um, statt ein halb
 * getipptes Wort in die nächste Zeile springen zu lassen): typeStart wird so gelegt, dass typing() genau die bis f
 * getippten n Zeichen zeigt und der n-te Anschlag auf times[n − 1] fällt.
 * Voraussetzung: jeder Anschlagsabstand ist kürzer als die kürzeste Zeichendauer bei `cps` (≈ 0,5 · 30/cps Frames) –
 * bei höchstens 1,6 Frames je Zeichen also cps ≤ 9.
 */
export const synthTypingFull = (full: string, times: number[], f: number, cps: number) => {
  const n = typedAt(times, f);
  const k = Math.max(1, n);
  // Zeit bis zum k-ten Zeichen bei typing(…, start = 0): kleinstes t mit shown ≥ k (typing() ist monoton in t)
  let lo = 0;
  let hi = typingEnd(0, full, cps) + 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (typing(mid, 0, full, cps).shown >= k) hi = mid;
    else lo = mid;
  }
  return { typeStart: times[k - 1] - hi - 1e-6, n, last: times[k - 1] };
};
