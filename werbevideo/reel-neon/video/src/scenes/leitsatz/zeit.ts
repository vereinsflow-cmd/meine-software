/**
 * Zeitplan und Lage für den Schluss des Films (leitsatz → logo → endkarte, Übergaben „cut“ im selben Bild).
 * Alle sprachgebundenen Frames aus cue()/cueEnd() – nichts fest verdrahtet.
 */
import { S } from "../../film";
import { cue, cueEnd } from "../../lib/timeline";

const s9 = (w: string) => cue(w, { section: 9 });
const s10 = (w: string) => cue(w, { section: 10 });
const s11 = (w: string) => cue(w, { section: 11 });

export const T = {
  // ---- leitsatz (Abschnitt 9) ----
  /** „Vereinsarbeit ist Ehrenamt.“ Wort für Wort */
  satz1: [s9("vereinsarbeit"), s9("ist"), s9("ehrenamt")],
  /** „Die Verwaltung sollte es nicht schwerer machen.“ Wort für Wort */
  satz2: [s9("die"), s9("verwaltung"), s9("sollte"), s9("es"), s9("nicht"), s9("schwerer"), s9("machen")],
  /** Satz 1 steigt weg (6 Frames, schneller als der Auftritt) und ist weg, wenn „Die“ erscheint – keine Schrift auf Schrift */
  satz1Weg: s9("die") - 6,
  /** Satz 2 wird mit der Wand in die Mitte gesogen, nachdem „machen.“ ausgesprochen und gelesen ist */
  satz2Weg: cueEnd("machen", { section: 9 }) + 8,
  /** Wand dreht schneller und zieht sich in die Tiefe zusammen */
  sog: cueEnd("machen", { section: 9 }) + 1,
  sogDauer: 20,
  // ---- logo (Abschnitt 10) ----
  /** Der Punkt zündet in der Mitte, dort wo die Wand verschwindet */
  zuend: s10("vereinsflow") - 9,
  /** Logo-Auftritt (V-Etappen gleiten um den Punkt herum ein), knapp vor „VereinsFlow“ */
  logo: s10("vereinsflow") - 3,
  /** Punkt springt in das V */
  flugStart: s10("vereinsflow") - 5,
  flugDauer: 13,
  /** „Bringt Vereinsarbeit in Fluss“ Wort für Wort */
  claim: [s10("bringt"), s10("vereinsarbeit"), s10("in"), s10("fluss")],
  // ---- endkarte (Abschnitt 11) ----
  /** Logo und Zeile gleiten nach oben, Platz für den Aufruf */
  hoch: S.endkarte.from + 1,
  /** Pille tippt „Jetzt Demo anfragen“ im Takt der Stimme (17 Zeichen/s: „D“ auf „Demo“, „a“ auf „anfragen“) */
  tippen: s11("jetzt") - 2,
  tippCps: 17,
  /** Punkt verlässt das Logo und tippt auf die Pille, wenn „anfragen“ ausgesprochen ist */
  tippFlug: s11("anfragen") + 4,
  tipp: cueEnd("anfragen", { section: 11 }) + 1,
  /** Rückflug ins Logo */
  zurueck: cueEnd("anfragen", { section: 11 }) + 12,
  /** Adresse und „Link in der Bio“ */
  adresse: cueEnd("anfragen", { section: 11 }) + 6,
  bio: cueEnd("anfragen", { section: 11 }) + 15,
  /** letzte 20 Frames: ruhig und dunkel für den Loop zu Frame 0 */
  abblenden: S.endkarte.to - 22,
  ende: S.endkarte.to,
};

/** Lage im Endbild (Videoraum); während der Logo-Szene liegt die Gruppe um GRUPPE_DY tiefer */
export const L = {
  cx: 540,
  /** Fluchtpunkt der Wand = Zündpunkt des Punkts */
  mitte: { x: 540, y: 960 },
  logoW: 760,
  logoY: 700,
  claimY: 872,
  pilleY: 1088,
  adresseY: 1232,
  bioY: 1296,
  gruppeDy: 140,
} as const;
