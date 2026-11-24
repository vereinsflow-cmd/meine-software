/**
 * Geräusche des 60-s-Neon-Films: {file, frame, volume}. Alle Frames kommen aus cue()/cueEnd() bzw. aus den
 * Zeitplänen der Szenen – mit der Stimme wandern sie mit. Dateien: public/sfx/*.wav (selbst synthetisiert).
 * Fehlende Dateien überspringt AudioLayer. Lautstärken linear relativ zur Stimme (0,25 ≈ −12 dB).
 * Grundsatz: dezent. Jede Bewegung darf man fühlen, aber kaum hören.
 *
 * Wo eine Szene ihre Zeiten nicht exportiert, steht hier dieselbe Formel wie in der Szene (Kommentar = Konstante dort).
 */
import { S, TRANSITION } from "../film";
import { SCENE_IDS, cue, cueEnd } from "../lib/timeline";
import { T as FIN } from "../scenes/finanzen/Kasse";
import { HOOK_TIMES, SHRINK_AT } from "../scenes/hook/pille";
import { T as SCH } from "../scenes/leitsatz/zeit";
import { T as MIT, W3 } from "../scenes/mitglieder/zeiten";

export type SfxCue = {
  file: string;
  frame: number;
  volume?: number;
  /** Bezeichnung für die Studio-Zeitleiste */
  name?: string;
};

const sfx = (file: string, frame: number, volume: number, name: string): SfxCue => ({ file: `sfx/${file}.wav`, frame: Math.round(frame), volume, name });
const c = (section: number) => (w: string, nth = 0) => cue(w, { section, nth });
const c0 = c(0);
const c1 = c(1);
const c2 = c(2);
const c4 = c(4);
const c5 = c(5);
const c6 = c(6);
const c11 = c(11);

/** Kreuz-Zoom an den „zoom“-Grenzen (Video.tsx): Rauschen setzt kurz vor der Grenze ein */
const ZOOM_WHOOSHES = SCENE_IDS.filter((id) => TRANSITION[id] === "zoom").map((id) => sfx("whoosh-short", S[id].from - 9, 0.12, `Zoom zu ${id}`));

// ---- problem (problem.tsx: Blasen im Gruppenchat werden immer schneller) ----
const BUBBLES = (() => {
  const gaps = [0, 6, 5, 5, 4, 3, 3, 3, 3];
  let t = c1("im") + 2;
  return gaps.map((g, i) => sfx(i % 2 === 0 ? "bubble-pop" : "notify-tick", (t += g), 0.05 + 0.006 * i, `Blase ${i + 1}`));
})();

// ---- termine (termine.tsx) ----
const TER_TAP_1 = c4("sagt") + 1; // TAP_1
const TER_TAP_2 = c4("kann") + 2; // TAP_2
const TER_IMPACT = c4("rundfrage") + 3; // IMPACT

// ---- helfer (helfer.tsx) ----
const HEL_TAP = c5("fingertipp") + 6; // TAP
const HEL_RING = c5("fehlt") + 2; // RING_AT
const HEL_WAVES = [HEL_RING + 13, HEL_RING + 28, HEL_RING + 43]; // WAVES

// ---- nachrichten (nachrichten.tsx: Punkt lässt die Karten nacheinander aufleuchten) ----
const NAC_LIT = [0, 1, 2, 3].map((i) => c6("alle") - 6 + 4 * (i + 1) - 1); // litAt(i)
const NAC_SWITCH = cueEnd("helfer", { section: 6 }) + 2; // SWITCH

export const SFX: SfxCue[] = [
  // Einstieg: Lichtband-Wischer, Punkt, Pille tippt im Takt der Stimme
  sfx("whoosh-whip", 0, 0.14, "Lichtband-Wischer"),
  sfx("dot-thump", 3, 0.2, "Punkt blitzt auf"),
  ...["ihr", "verein", "läuft", "immer", "noch", "über", "excel"].map((w) => sfx("key-clack", c0(w) - 2, 0.07, `Tippen „${w}“`)),
  sfx("key-clack", HOOK_TIMES[HOOK_TIMES.length - 1], 0.11, "„?“"),
  sfx("swish", SHRINK_AT, 0.08, "Pille schrumpft"),
  // Problem
  sfx("whoosh-short", c1("die") - 13, 0.1, "Karten fliegen vorbei"),
  sfx("paper-flutter", c1("dreimal") - 1, 0.14, "drei Tabellen fächern auf"),
  sfx("whoosh-short", c1("im") - 4, 0.08, "Gruppenchat gleitet herein"),
  ...BUBBLES,
  sfx("count-rattle", c1("zweihundert") - 1, 0.09, "Zähler bis 200"),
  sfx("buzz", c1("nachrichten"), 0.12, "Abzeichen pulsiert"),
  // Frage: Leiste tippt (je Wort 4 Frames vor dem Wort)
  ...["und", "wer", "kommt", "am", "donnerstag"].map((w) => sfx("key-clack", c2(w) - 4, 0.07, `Tippen „${w}“`)),
  sfx("tick", c2("donnerstag") + 5, 0.1, "Senden leuchtet"),
  // Szenenwechsel
  ...ZOOM_WHOOSHES,
  sfx("whoosh-whip", S.mitglieder.from - 10, 0.16, "Lichtstreif zu VereinsFlow"),
  // Mitglieder
  sfx("snap-bloom", MIT.dotLand - 1, 0.22, "Punkt landet im V"),
  sfx("chord-shimmer", W3.vereinsflow - 2, 0.12, "VereinsFlow"),
  sfx("whoosh-short", MIT.panelIn - 2, 0.1, "Bildschirm steigt auf"),
  sfx("count-rattle", MIT.countAt + 2, 0.07, "233 Einträge"),
  sfx("tap-soft", MIT.dotTap - 1, 0.3, "Punkt tippt auf Import"),
  sfx("whoosh-short", MIT.chipIn, 0.1, "Datei fliegt heran"),
  sfx("tap-soft", MIT.chipLand - 1, 0.32, "Datei landet auf Import"),
  sfx("click-soft", MIT.chipLand + 1, 0.14, "Import"),
  sfx("pen-stroke", MIT.chipLand + 2, 0.07, "Haken"),
  sfx("plop", MIT.chipAbsorb + 6, 0.12, "Karte im Knopf"),
  sfx("swish", MIT.swap, 0.08, "Import-Vorschau"),
  sfx("notify-tick", MIT.summaryAt, 0.1, "5 gültig · 1 fehlerhaft"),
  sfx("bonk", MIT.rowRed, 0.13, "fehlerhafte Zeile"),
  sfx("swish", MIT.lift, 0.07, "Fehlerkarte hebt sich"),
  sfx("glass-tink", MIT.hint, 0.1, "Hinweis E-Mail-Adresse"),
  // Termine
  sfx("swish", c4("das") + 2, 0.07, "Kalender scrollt"),
  sfx("glass-tink", c4("kalender"), 0.12, "Donnerstag steigt auf"),
  sfx("whoosh-short", c4("kalender") + 15, 0.09, "Kamera zur Terminseite"),
  sfx("tap-soft", TER_TAP_1 - 1, 0.36, "Tipp auf Zusagen"),
  sfx("piano-yes", TER_TAP_1 + 3, 0.14, "Du hast zugesagt"),
  sfx("swish", c4("wer", 1) - 6, 0.07, "zweite Karte"),
  sfx("tap-soft", TER_TAP_2 - 1, 0.36, "Tipp auf Absagen"),
  sfx("piano-no", TER_TAP_2 + 3, 0.12, "Du hast abgesagt"),
  sfx("bubble-pop", c4("ganz"), 0.07, "alte Chat-Blase"),
  sfx("bloom", TER_IMPACT - 2, 0.16, "Blase zerfällt in Licht"),
  // Helfer
  sfx("count-rattle", S.helfer.from + 14, 0.06, "Helferplätze zählen"),
  sfx("whoosh-short", c5("tragen") + 8, 0.1, "Fahrt zum Getränkestand"),
  sfx("tap-soft", HEL_TAP - 1, 0.38, "Tipp auf Eintragen"),
  sfx("marimba-c", HEL_TAP + 3, 0.12, "eingetragen"),
  sfx("marimba-g", HEL_TAP + 8, 0.1, "Eingetragen."),
  sfx("whoosh-short", c5("wo") - 2, 0.1, "Fahrt zum Grillstand"),
  sfx("pen-stroke", HEL_RING, 0.1, "Ring zeichnet sich"),
  sfx("dot-thump", HEL_WAVES[0], 0.14, "Punkt geht im Ring auf"),
  ...HEL_WAVES.map((w, i) => sfx("pulse-soft", w, 0.16, `3 frei ${i + 1}`)),
  // Nachrichten
  sfx("swish", S.nachrichten.from, 0.07, "Gruppen fächern auf"),
  ...NAC_LIT.map((f, i) => sfx(["marimba-c", "marimba-e", "marimba-g", "marimba-c"][i], f, 0.08, `Karte ${i + 1} leuchtet`)),
  sfx("swish", c6("eine") - 3, 0.07, "Abteilung Fußball"),
  sfx("glass-tink", c6("nur") - 1, 0.11, "Helfer"),
  sfx("whoosh-short", NAC_SWITCH, 0.12, "Schwenk zum Chat"),
  sfx("pulse-soft", c6("sehen") - 6, 0.1, "Lesezahl erscheint"),
  ...[c6("viele"), c6("schon"), c6("gelesen")].map((f, i) => sfx("double-tick", f, 0.14 + 0.02 * i, `${i + 2}/5 gelesen`)),
  // Finanzen und Feierabend
  sfx("count-rattle", FIN.from + 10, 0.08, "Kontostand zählt"),
  sfx("tick", FIN.beitraege, 0.1, "Beiträge"),
  sfx("tick", FIN.rechnungen, 0.1, "Rechnungen"),
  sfx("swish", FIN.rechnungen, 0.06, "Rechnungskarte hebt sich"),
  sfx("tick", FIN.kassenbuch, 0.1, "Kassenbuch"),
  sfx("swish", FIN.kassenbuch - 2, 0.07, "Seite Kassenbuch"),
  sfx("paper-fold", FIN.kassenbuch + 8, 0.08, "Buchungen lösen sich"),
  sfx("receipt-snap", FIN.belegen + 1, 0.12, "Belege"),
  sfx("accent-warm", FIN.offene - 2, 0.16, "Offene Rechnungen"),
  sfx("glass-tink", FIN.sofort, 0.12, "Sofort im Blick"),
  sfx("light-switch", FIN.down + 8, 0.14, "Licht aus"),
  sfx("chime-two", FIN.feierabend + 6, 0.1, "Punkt setzt sich"),
  // Leitsatz
  sfx("reverse-swell", SCH.satz1[0] - 3, 0.1, "Lichtwelle 1"),
  sfx("reverse-swell", SCH.satz2[0] - 3, 0.1, "Lichtwelle 2"),
  sfx("reverse-swell", SCH.sog - 8, 0.16, "Sog in die Tiefe"),
  sfx("whoosh-whip", SCH.sog + 6, 0.12, "Wand verschwindet"),
  // Logo und Endkarte
  sfx("swish", S.logo.from + 5, 0.07, "Lichtschweife"),
  sfx("dot-thump", SCH.zuend, 0.24, "Punkt zündet"),
  sfx("logo-sting", SCH.logo, 0.22, "Logo"),
  sfx("snap-bloom", SCH.flugStart + SCH.flugDauer - 1, 0.24, "Punkt rastet im V ein"),
  sfx("swish", SCH.hoch, 0.06, "Logo gleitet hoch"),
  ...["jetzt", "demo", "anfragen"].map((w) => sfx("key-clack", c11(w) - 1, 0.07, `Pille „${w}“`)),
  sfx("tap-soft", SCH.tipp - 1, 0.32, "Tipp auf Demo anfragen"),
  sfx("click-soft", SCH.tipp + 1, 0.2, "Knopf"),
  sfx("chord-shimmer", SCH.tipp + 4, 0.08, "Knopf leuchtet"),
];

/** keine Musikpausen in diesem Film */
export const MUSIC_GAPS: [number, number][] = [];
