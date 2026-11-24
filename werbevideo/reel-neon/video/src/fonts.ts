/** Manrope – nur die Gewichte 500 und 800 (Typo-Regel: max. 2 Schnitte). */
import { loadFont } from "@remotion/google-fonts/Manrope";

const loaded = loadFont("normal", { weights: ["500", "800"], subsets: ["latin"] });

export const fontFamily = loaded.fontFamily;
export const FONT_REGULAR = 500 as const;
export const FONT_BOLD = 800 as const;
export type FontWeight = typeof FONT_REGULAR | typeof FONT_BOLD;

/**
 * true, sobald beide Schnitte im Browser bereitstehen (Textmessung per Canvas ist dann exakt).
 * Achtung: document.fonts.check() hilft hier nicht – loadFont() fügt die FontFace erst NACH dem
 * Laden hinzu, und check() meldet für eine noch unbekannte Familie „true“.
 */
export const fontsReady = () => {
  if (typeof document === "undefined") return true;
  try {
    const have = new Set<string>();
    document.fonts.forEach((ff) => {
      if (ff.status === "loaded" && ff.family.replace(/["']/g, "") === fontFamily.replace(/["']/g, "")) have.add(String(ff.weight));
    });
    return have.has(String(FONT_BOLD)) && have.has(String(FONT_REGULAR));
  } catch {
    return false;
  }
};

/** Wartet auf beide Schnitte (für FontGate). */
export const waitForFonts = () => loaded.waitUntilDone().then(() => undefined);
