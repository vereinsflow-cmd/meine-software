/**
 * Szene „feierabend“ (1380–1425): „Dann ist Feierabend.“ – alles fährt ruhig herunter, die Bänder werden warm.
 * Gleiche Bildfolge wie finanzen (finanzen/Kasse.tsx, Übergabe „cut“): diese Szene zeichnet sie ab S.feierabend.from.
 */
import { S } from "../film";
import { Kasse, kasseMood } from "./finanzen/Kasse";
import type { NeonScene } from "./types";

export const feierabend: NeonScene = {
  id: "feierabend",
  Comp: ({ f }) => (f >= S.feierabend.from ? <Kasse f={f} /> : null),
  mood: kasseMood,
};
