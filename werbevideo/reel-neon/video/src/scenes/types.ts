/**
 * Vertrag zwischen Film (Video.tsx) und Szenen.
 *
 * Der Hintergrund (Neon-Lichtbänder, Partikel, Korn) läuft durchgehend in Video.tsx. Jede Szene zeichnet nur ihren Inhalt
 * im Videoraum (1080 × 1920) und wird von S.<id>.from − LEAD bis S.<id>.to + TAIL gezeigt. Den Übergang an den Grenzen
 * macht Video.tsx (film.ts → TRANSITION): bei "zoom"/"sweep" fährt der Inhalt der alten Szene auf die Kamera zu und
 * verschwimmt, die neue kommt aus der Tiefe. Deshalb gilt:
 *  - An der eigenen Anfangs- und Endgrenze ist das Bild GEFÜLLT (kein leerer Moment) – der Übergang braucht Inhalt.
 *  - Bei "cut" übergeben die Szenen selbst (gleicher Agent): dann exakt abstimmen, was in den Überlappungs-Frames liegt.
 *  - Alle Zeiten sind ABSOLUTE Frames. Sprachgebundenes nur über cue()/cueEnd() aus lib/timeline.
 *  - Nur deterministische Animation aus dem Frame (springs.ts, ui/motion.ts, neon/*), keine CSS-Transitions, kein Math.random.
 */
import type React from "react";
import type { SceneId } from "../lib/timeline";

export type BackgroundMood = {
  /** Helligkeit der Lichtbänder (0…1, im Film Standard 0,45 – mit Inhalt im Bild; ohne Inhalt bis 1) */
  ribbons?: number;
  /** Anteil Orange in den Bändern und Partikeln (0…1, Standard 0) */
  warm?: number;
  /** Bokeh-Partikel (0…1, Standard 0,35) */
  particles?: number;
  /** Farbton der Bänder: 0 = tiefes Vereinsblau, 1 = heller Himmel (Standard 0,25) */
  tint?: number;
  /** Grund etwas anheben (0…1, Standard 0) */
  lift?: number;
  /** Anordnung der Bänder: "drift" (am Rand, Mitte frei; Standard) | "hero" (große senkrechte Bänder) | "low" (unten, fürs Logo).
   *  Wechselt die Anordnung an einer Grenze, blendet Video.tsx die beiden Hintergründe über. */
  layout?: "drift" | "hero" | "low";
  /** Absoluter Frame eines schnellen Band-Wischers quer durchs Bild (16 Frames) – z. B. am Anfang des Films */
  swooshAt?: number;
  swooshDirection?: "up" | "down" | "left" | "right";
  /** Stärke des Wischers (Standard 0,8) */
  swooshGain?: number;
};

export type NeonScene = {
  id: SceneId;
  /** Inhalt der Szene im Videoraum; f = absoluter Frame */
  Comp: React.FC<{ f: number }>;
  /** Stimmung des durchgehenden Hintergrunds während der Szene (wird an den Grenzen überblendet) */
  mood?: (f: number) => BackgroundMood;
};
