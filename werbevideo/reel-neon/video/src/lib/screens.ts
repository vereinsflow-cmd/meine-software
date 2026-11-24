/**
 * Echte Handy-Aufnahmen (public/screens, 1170 px breit, Faktor 3) und ihre Markierungen aus
 * manifest.json – Knöpfe, Zeilen, Zahlen in Bildpixeln. Taps und Overlays rechnen damit, statt
 * Koordinaten zu raten.
 *
 *   box("schichten-liste.png", "knopf-grillstand")  → {x, y, w, h}
 *   ganzY("schichten-liste.png", 927)               → y derselben Stelle in schichten-ganz.png
 */
import manifest from "../../public/screens/manifest.json";

export type Box = { x: number; y: number; w: number; h: number };

type Mark = { id: string; label?: string; text?: string; box?: Box; visible?: string; found?: boolean };
type ManifestImage = { file: string; width: number; height: number; page: string; variant: string; scrollY: number; marks: Mark[] };

const images = (manifest as unknown as { images: ManifestImage[] }).images;

export const SCREEN_W = 1170;
export const SCREEN_H = 2532;
/** App-Kopfzeile (weiß, Linie bei y = 190) */
export const APP_HEADER_H = 191;
/** leere Statusleiste über dem Screenshot (Bildpixel) */
export const STATUS_BAR = 132;

export const screen = (file: string): ManifestImage => {
  const img = images.find((i) => i.file === file);
  if (!img) throw new Error(`[Screens] ${file} fehlt in public/screens/manifest.json`);
  return img;
};

export const screenSrc = (file: string) => `screens/${file}`;
export const screenHeight = (file: string) => screen(file).height;

export const box = (file: string, id: string): Box => {
  const m = screen(file).marks.find((x) => x.id === id);
  if (!m || !m.box) {
    throw new Error(
      `[Screens] Markierung "${id}" in ${file} fehlt. Vorhanden: ${screen(file)
        .marks.map((x) => x.id)
        .join(", ")}`,
    );
  }
  return m.box;
};

export const center = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

/** y einer gescrollten Fassung („…-liste“, „…-donnerstag“) in der ganzen Seite („…-ganz“) */
export const ganzY = (file: string, y: number) => screen(file).scrollY + y;
