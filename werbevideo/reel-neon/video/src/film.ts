/**
 * Drehbuch des 60-s-Neon-Films in Zahlen: Schlagraster, Szenengrenzen, Übergänge.
 *
 * Die Stimme („Jonas“, Aufnahme des 60-s-Reels) läuft in ihrem natürlichen Tempo ab 0,3 s. Die Szenengrenzen liegen auf
 * dem Schlagraster (120 BPM, 1 Schlag = 15 Frames), jeweils kurz vor dem ersten Wort ihres Abschnitts. Alles, was zur
 * Stimme passen muss, kommt aus cue()/cueEnd() (lib/timeline).
 */
import { SCENE_IDS, SceneId, sceneFrom, sceneTo } from "./lib/timeline";

export const BEAT = 15;
export const BAR = 60;

/** Szenengrenzen (absolute Frames): S.mitglieder.from … S.mitglieder.to */
export const S = Object.fromEntries(SCENE_IDS.map((id) => [id, { from: sceneFrom(id), to: sceneTo(id) }])) as Record<
  SceneId,
  { from: number; to: number }
>;
export const END = sceneTo("endkarte");

/** So viele Frames vor S.from wird eine Szene schon gezeigt, so viele nach S.to noch (für die Übergänge) */
export const LEAD = 8;
export const TAIL = 8;

/**
 * Übergang AN DER GRENZE vor einer Szene (Schlüssel = Szene, die beginnt):
 *   "zoom"  – alte Szene fährt auf die Kamera zu und verschwimmt, neue kommt aus der Tiefe (wie die Kamerafahrten im Vorbild)
 *   "sweep" – wie "zoom", dazu ein diagonaler Lichtstreif über das ganze Bild
 *   "cut"   – kein Effekt von außen: die beiden Szenen übergeben selbst (gleicher Agent, durchgehende Bewegung)
 */
export const TRANSITION: Partial<Record<SceneId, "zoom" | "sweep" | "cut">> = {
  problem: "cut",
  frage: "zoom",
  mitglieder: "sweep",
  termine: "zoom",
  helfer: "zoom",
  nachrichten: "zoom",
  finanzen: "zoom",
  feierabend: "cut",
  leitsatz: "zoom",
  logo: "cut",
  endkarte: "cut",
};

/** Lage und Größen, die alle Szenen gemeinsam nutzen */
export const LAYOUT = {
  /** Kernaussage als Leuchtschrift oben (Oberkante), wenn darunter Karten/App zu sehen sind */
  headTop: 290,
  /** Mitte für Leuchtschrift, wenn nichts anderes im Bild ist */
  centerY: 900,
  /** Bereich für schwebende App-Karten */
  stage: { top: 560, bottom: 1500 },
  /** Instagram: nichts Wichtiges über y 250 oder unter y 1570 */
  safe: { top: 250, bottom: 1570, side: 70 },
} as const;
