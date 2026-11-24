/**
 * Szene „logo“ (Abschnitt 10): die Wand zieht sich in den orangen Punkt zusammen, Lichtbänder kreisen um ihn,
 * auf „VereinsFlow“ Logo-Auftritt mit Lichtboden, darunter „Bringt Vereinsarbeit in Fluss“ Wort für Wort.
 * Übergaben zu leitsatz und endkarte: „cut“ im selben Bild (scenes/logo/Schluss.tsx).
 */
import { moodLogo, schlussIn } from "./logo/Schluss";
import type { NeonScene } from "./types";

export const logo: NeonScene = { id: "logo", Comp: schlussIn("logo"), mood: moodLogo };
