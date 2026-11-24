/**
 * Szene „endkarte“ (Abschnitt 11): Logo und Zeile gleiten hoch, die Aufruf-Pille tippt „Jetzt Demo anfragen“,
 * der Punkt tippt darauf, der Knopf leuchtet; „vereins-flow.com“ und „Link in der Bio“. Die letzten 20 Frames
 * werden ruhig und dunkel (Loop zu Frame 0). Bild: scenes/endkarte/EndBild.tsx, Schluss: scenes/logo/Schluss.tsx.
 */
import { moodLogo, schlussIn } from "./logo/Schluss";
import type { NeonScene } from "./types";

export const endkarte: NeonScene = { id: "endkarte", Comp: schlussIn("endkarte"), mood: moodLogo };
