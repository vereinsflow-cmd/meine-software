// Drehbuch des Kurzspots „Nacht“ (szenen/nacht.html): Zeiten in Sekunden, 120 BPM. Die Musik (musik.mjs --nacht) legt
// ihre Takte so, dass der Groove mit dem Handy (2,5 s) auf einer Eins einsetzt; Geräusche sitzen auf den Bildereignissen.

export const DAUER = 22.5;
export const BILDER_PRO_SEKUNDE = 30;
export const BPM = 120;

export const SZENEN = [
  { id: "logo", von: 0, bis: 2.5 },
  { id: "handy", von: 2.5, bis: 5.5 },
  { id: "zusage", von: 5.5, bis: 8 },
  { id: "stadt", von: 8, bis: 11 },
  { id: "symbol", von: 11, bis: 14 },
  { id: "saetze", von: 14, bis: 17 },
  { id: "ende", von: 17, bis: 22.5 },
];

/** Kein Sprecher – die Sätze stehen groß im Bild. */
export const SPRECHER = [];

export const GERAEUSCHE = [
  // Logo: Licht fährt herein, Balken landen, Punkt fällt, Unterstrich als Lichtstreifen
  { t: 0.05, art: "wusch", lang: 0.8 },
  ...[0.3, 0.42, 0.56].map((t) => ({ t, art: "karte" })),
  { t: 0.8, art: "plopp" },
  { t: 1.5, art: "strich" },
  { t: 2.02, art: "glanz" },
  // Handy steigt auf (Einsatz des Grooves), Karten fliegen heraus
  { t: 2.5, art: "aufprall" },
  ...[3.0, 3.15, 3.3, 3.45].map((t) => ({ t, art: "karte" })),
  { t: 5.25, art: "wusch", lang: 0.5 },
  // Zusage
  { t: 6.12, art: "tipp" },
  { t: 6.35, art: "erfolg" },
  { t: 7.85, art: "wusch", lang: 0.5 },
  // Stadt: Spuren, Pin, Schritte
  { t: 8.3, art: "strich" },
  { t: 9.35, art: "plopp" },
  ...[9.6, 10.2, 10.8].map((t) => ({ t, art: "haken" })),
  // App-Symbol
  { t: 10.9, art: "wusch", lang: 0.4 },
  { t: 11.0, art: "tief" },
  { t: 11.7, art: "glanz" },
  { t: 13.85, art: "wusch", lang: 0.4 },
  // Sätze
  ...[14.0, 14.5, 15.0].map((t) => ({ t, art: "schlag" })),
  { t: 15.6, art: "karte" },
  { t: 16.05, art: "strich" },
  { t: 16.8, art: "wusch", lang: 0.5 },
  // Logo, Schein
  { t: 17.0, art: "aufprall" },
  { t: 17.05, art: "glanz" },
  { t: 19.4, art: "schein" },
];
