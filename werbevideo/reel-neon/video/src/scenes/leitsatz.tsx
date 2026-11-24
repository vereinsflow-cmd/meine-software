/**
 * Szene „leitsatz“ (Abschnitt 9): Tunnel aus echten App-Seiten dreht sich langsam um die Mitte, darin
 * „Vereinsarbeit ist Ehrenamt.“ → „Die Verwaltung sollte es nicht schwerer machen.“; am Ende Sog in die Tiefe.
 * Bild: scenes/leitsatz/LeitsatzBild.tsx; Schluss als ein durchgehendes Bild: scenes/logo/Schluss.tsx.
 */
import { moodLeitsatz, schlussIn } from "./logo/Schluss";
import type { NeonScene } from "./types";

export const leitsatz: NeonScene = { id: "leitsatz", Comp: schlussIn("leitsatz"), mood: moodLeitsatz };
