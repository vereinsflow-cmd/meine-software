// Drehbuch des Werbevideos: alle Zeiten in Sekunden. Bild (szenen/index.html), Sprecher (sprecher.mjs) und Musik
// (musik.mjs) lesen ihre Zeiten von hier – so bleiben Schnitte, Stimme und Takt beieinander.
//
// Takt: 120 Schläge pro Minute – ein Schlag dauert 0,5 s, ein Takt 2 s. Schnitte liegen auf Schlägen.

export const DAUER = 60;
export const BILDER_PRO_SEKUNDE = 30;
export const BPM = 120;

/** Szenen in der Reihenfolge des Videos (Beginn, Ende). */
export const SZENEN = [
  { id: "haken", von: 0, bis: 3 }, // Zettelchaos, Handy brummt
  { id: "problem", von: 3, bis: 10 }, // Mitgliederlisten, Beiträge, Termine – grau
  { id: "wisch", von: 10, bis: 14 }, // Wisch, Logo, Laptop öffnet sich
  { id: "dashboard", von: 14, bis: 19 },
  { id: "mitglieder", von: 19, bis: 24 },
  { id: "finanzen", von: 24, bis: 29 },
  { id: "termine", von: 29, bis: 34 },
  { id: "handy", von: 34, bis: 38.5 },
  { id: "helfer", von: 38.5, bis: 44 },
  { id: "gefuehl", von: 44, bis: 54 },
  { id: "schluss", von: 54, bis: 60 },
];

/**
 * Sprechertext in Stücken (jedes Stück eine eigene Aufnahme, damit es genau auf dem Schnitt beginnt).
 * art "unten": Untertitel unten im Bild; art "gross": der Text steht ohnehin groß im Bild (Schlagworte).
 * teile: lange Sätze werden als zwei Untertitel nacheinander gezeigt.
 */
export const SPRECHER = [
  { id: "01-kennst", start: 0.3, text: "Kennst du das?", art: "unten" },
  { id: "02-listen", start: 3.05, text: "Mitgliederlisten,", art: "gross" },
  { id: "03-beitraege", start: 4.05, text: "Beiträge,", art: "gross" },
  { id: "04-termine", start: 5.05, text: "Termine –", art: "gross" },
  { id: "05-anders", start: 6.1, text: "und alles liegt irgendwo anders.", art: "gross" },
  { id: "06-schluss", start: 10.15, text: "Damit ist jetzt Schluss.", art: "unten" },
  {
    id: "07-ein-ort",
    start: 14.35,
    text: "Mit VereinsFlow verwaltest du Mitglieder, Beiträge und Termine an einem Ort.",
    art: "unten",
    teile: ["Mit VereinsFlow verwaltest du Mitglieder,", "Beiträge und Termine an einem Ort."],
  },
  {
    id: "08-einfach",
    start: 29.4,
    text: "Modern, übersichtlich – und so einfach, dass jeder im Vorstand sofort loslegen kann.",
    art: "unten",
    teile: ["Modern, übersichtlich –", "und so einfach, dass jeder im Vorstand sofort loslegen kann."],
  },
  { id: "09-weniger", start: 49.55, text: "Weniger Verwaltung.", art: "gross" },
  { id: "10-mehr", start: 50.8, text: "Mehr Verein.", art: "gross" },
  { id: "11-name", start: 54.55, text: "VereinsFlow.", art: "unten" },
  { id: "12-demo", start: 55.5, text: "Jetzt Demo anfragen.", art: "unten" },
];

/** Geräusche, die zu Bildereignissen gehören (Klicks, Benachrichtigungen, Häkchen). */
export const GERAEUSCHE = [
  // Haken: Gruppenchat brummt
  ...[0.15, 0.55, 0.95, 1.35].flatMap((t) => [
    { t, art: "brummen" },
    { t: t + 0.02, art: "plopp" },
  ]),
  // Problem: Schläge auf den Schnitten, Suchfeld tippt „Krüger“
  ...[3, 4, 5, 6].map((t) => ({ t, art: "schlag" })),
  ...Array.from({ length: 6 }, (_, i) => ({ t: 3.2 + i * 0.06, art: "tippen" })),
  // Wisch, Logo, Laptop
  { t: 9.8, art: "wusch", lang: 0.7 },
  { t: 10, art: "aufprall" },
  { t: 11.75, art: "glanz" },
  { t: 12.55, art: "auf" },
  { t: 13.85, art: "wusch" },
  // Dashboard: Karten
  ...[14.5, 14.75, 15].map((t) => ({ t, art: "karte" })),
  // Mitglieder
  { t: 18.85, art: "wusch" },
  { t: 19.9, art: "klick" },
  ...[[20.25, 3], [20.6, 8], [21.15, 6], [21.6, 9]].flatMap(([t0, n]) =>
    Array.from({ length: n }, (_, i) => ({ t: t0 + i * (0.42 / n) + 0.02, art: "tippen" })),
  ),
  { t: 22.45, art: "klick" },
  { t: 22.65, art: "erfolg" },
  // Finanzen
  { t: 23.85, art: "wusch" },
  ...[24.25, 24.45, 24.65, 24.85].map((t) => ({ t, art: "karte" })),
  { t: 25.15, art: "klick" },
  { t: 25.45, art: "erfolg" },
  { t: 26.35, art: "wusch" },
  { t: 27.5, art: "klick" },
  { t: 27.55, art: "haken" },
  { t: 28.3, art: "klick" },
  { t: 28.35, art: "haken" },
  // Termine
  { t: 28.85, art: "wusch" },
  { t: 30.95, art: "wusch", lang: 0.5 },
  // Handy
  { t: 33.85, art: "wusch", lang: 0.6 },
  { t: 35.6, art: "glocke" },
  // Helfer
  { t: 38.5, art: "tipp" },
  { t: 40.3, art: "tipp" },
  { t: 40.5, art: "haken" },
  // Schluss
  { t: 54, art: "aufprall" },
  { t: 54.7, art: "glanz" },
  { t: 55.25, art: "karte" },
];
