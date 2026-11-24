/**
 * Szene „helfer“ – Lage der App-Seite im Raum und Kamera-Rig.
 *
 * Die Schichtenseite „Sommerfest 2027“ liegt als EIN hoher Glas-Bildschirm (ScreenPanel, ganze Seite) in der Ebene z = 0.
 * Die Kamera fährt an ihr entlang: Seitenkopf → Getränkestand (Tipp) → Grillstand (Lücke). Positionen in der App sind
 * Bildraum-Pixel (1170 breit, y = 0 Oberkante der Kopfzeile, scrollY 0) – gemessen am UI-Baukasten (Messbild 24.11.).
 */
import type { Scene3DSettings } from "../../neon";
import { lerp } from "../../neon";
import { SHIFTS } from "../../ui/shifts";

// ---- Daten nur aus den Demo-Schichten -------------------------------------------------------
export const DRINKS = SHIFTS.findIndex((s) => s.title === "Getränkestand");
export const GRILL = SHIFTS.findIndex((s) => s.title === "Grillstand");
/** Plätze gesamt / besetzt (wie der Kopf „9 von 21 Plätzen besetzt“ der App) */
export const REQUIRED = SHIFTS.reduce((n, s) => n + s.capacity, 0);
export const FILLED = SHIFTS.reduce((n, s) => n + Math.min(s.names.length, s.capacity), 0);
export const ME = "Anna Adler";

// ---- Glas-Bildschirm --------------------------------------------------------------------------
export const PANEL = { w: 680, bezel: 12, sh: 4300, x: 540, y: 960 } as const;
/** Maßstab Bildraum → Welt */
export const K = (PANEL.w - 2 * PANEL.bezel) / 1170;
export const PANEL_H = 2 * PANEL.bezel + PANEL.sh * K;
/** Rand der Ebene um die Glaskarte (Platz für den äußeren Schein, der sonst an der Maske abreißt) */
export const PAD = 110;

/** Lage in der App-Seite (Bildraum, scrollY 0) */
export const PAGE = {
  title: 404,
  drinks: {
    top: 2049,
    bottom: 2714,
    button: { x: 818, y: 2146 },
    status: { x0: 100, x1: 330, y: 2558 },
  },
  grill: { top: 2715, bottom: 3380, status: { x0: 100, x1: 401, y: 3225 } },
  cake: { top: 3380 },
} as const;

/** Punkt der App-Seite → Welt (Mitte der Ebene = PANEL.x/y) */
export const pagePt = (px: number, py: number) => ({
  x: PANEL.x - PANEL.w / 2 + PANEL.bezel + px * K,
  y: PANEL.y - PANEL_H / 2 + PANEL.bezel + py * K,
  z: 0,
});
/** y in der Ebene (Ebenen-Koordinaten inkl. PAD) einer Seitenzeile – für Masken */
export const layerY = (py: number) => PAD + PANEL.bezel + py * K;

// ---- Kamera -----------------------------------------------------------------------------------
export const PERSPECTIVE = 1700;

/** Einstellung: Blickpunkt (Seitenkoordinaten) landet an Bildposition xs/ys; Kamera kreist um ihn */
export type Shot = {
  lx: number;
  ly: number;
  xs: number;
  ys: number;
  dolly: number;
  orbitX: number;
  orbitY: number;
};

export const mixShot = (a: Shot, b: Shot, t: number): Shot => ({
  lx: lerp(a.lx, b.lx, t),
  ly: lerp(a.ly, b.ly, t),
  xs: lerp(a.xs, b.xs, t),
  ys: lerp(a.ys, b.ys, t),
  dolly: lerp(a.dolly, b.dolly, t),
  orbitX: lerp(a.orbitX, b.orbitX, t),
  orbitY: lerp(a.orbitY, b.orbitY, t),
});

export const STAGE = {
  dof: 0.9,
  maxBlur: 14,
  dim: 0.42,
  dimRange: 1100,
} as const;

/** Kamera + gleiche Einstellungen wie NeonScene3D (für project()) */
export const rig = (s: Shot) => {
  const L = pagePt(s.lx, s.ly);
  const sc = PERSPECTIVE / (PERSPECTIVE - s.dolly);
  const cam = {
    dolly: s.dolly,
    orbitX: s.orbitX,
    orbitY: s.orbitY,
    roll: 0,
    panX: L.x - 540 - (s.xs - 540) / sc,
    panY: L.y - 960 - (s.ys - 960) / sc,
    pivot: { x: L.x, y: L.y, z: 0 },
  };
  const settings: Scene3DSettings = {
    cam,
    perspective: PERSPECTIVE,
    focusZ: s.dolly,
    dof: STAGE.dof,
    maxBlur: STAGE.maxBlur,
    dim: STAGE.dim,
    dimRange: STAGE.dimRange,
    width: 1080,
    height: 1920,
  };
  return { cam, settings };
};

/** Weltpunkt, der in Einstellung `s` (ohne Kreisen gerechnet) bei Bildposition xs/ys in Tiefe z liegt – zum Setzen der Karten */
export const placeAt = (s: Shot, xs: number, ys: number, z: number) => {
  const { cam } = rig(s);
  const k = PERSPECTIVE / (PERSPECTIVE - z - s.dolly);
  return {
    x: (xs - 540) / k + 540 + cam.panX,
    y: (ys - 960) / k + 960 + cam.panY,
    z,
  };
};
