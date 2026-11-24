/**
 * Szene „finanzen“ (1155–1380): „Bleibt noch die Kasse. Beiträge, Rechnungen und das Kassenbuch mit Belegen. Offene
 * Rechnungen sehen Sie sofort.“ Bildfolge in finanzen/Kasse.tsx – gemeinsam mit feierabend (Übergabe „cut“):
 * diese Szene zeichnet sie bis S.feierabend.from, danach übernimmt feierabend mit derselben Komponente.
 */
import { S } from "../film";
import { Kasse, kasseMood } from "./finanzen/Kasse";
import type { NeonScene } from "./types";

export const finanzen: NeonScene = {
  id: "finanzen",
  Comp: ({ f }) => (f < S.feierabend.from ? <Kasse f={f} /> : null),
  mood: kasseMood,
};
