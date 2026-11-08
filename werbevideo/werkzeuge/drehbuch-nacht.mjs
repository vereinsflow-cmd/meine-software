// Drehbuch des Spots „Nacht“ (szenen/nacht.html, 60 s): Zeiten in Sekunden, 120 BPM (Takt = 2 s). Die Musik
// (musik.mjs --nacht) legt ihre Takte so, dass der Groove mit dem Handy (2,5 s) auf einer Eins einsetzt; alle Schnitte
// liegen auf Schlägen. Geräusche sitzen auf den Bildereignissen – die Zeiten hier müssen zu nacht.html passen.

export const DAUER = 60;
export const BILDER_PRO_SEKUNDE = 30;
export const BPM = 120;

export const SZENEN = [
  { id: "logo", von: 0, bis: 2.5 },
  { id: "handy", von: 2.5, bis: 7 },
  { id: "mitglieder", von: 7, bis: 12 },
  { id: "beitraege", von: 12, bis: 17 },
  { id: "termine", von: 17, bis: 21.5 },
  { id: "zusage", von: 21.5, bis: 24.5 },
  { id: "stadt", von: 24.5, bis: 28.5 },
  { id: "helfer", von: 28.5, bis: 33.5 },
  { id: "chat", von: 33.5, bis: 37.5 },
  { id: "symbol", von: 37.5, bis: 40.5 },
  { id: "gefuehl", von: 40.5, bis: 49.5 },
  { id: "saetze", von: 49.5, bis: 53.5 },
  { id: "ende", von: 53.5, bis: 60 },
];

/** Kein Sprecher – die Sätze stehen groß im Bild. */
export const SPRECHER = [];

/** Tippen: ein Anschlag je Zeichen (wie das Bild die Buchstaben zeigt), höchstens `max` Anschläge. */
function tippen(t0, dauer, zeichen, max = zeichen) {
  const n = Math.min(zeichen, max);
  return Array.from({ length: n }, (_, i) => ({ t: t0 + (dauer * (i + 0.5)) / n, art: "tippen" }));
}

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
  { t: 6.75, art: "wusch", lang: 0.5 },
  // Mitglieder: Formular, „Mia“, „Schröder“, Geburtsdatum, Knopf, angelegt
  { t: 7.15, art: "auf" },
  ...tippen(7.75, 0.35, 3),
  ...tippen(8.15, 0.35, 8),
  ...tippen(8.7, 0.35, 10),
  { t: 9.2, art: "karte" },
  { t: 9.57, art: "tipp" },
  { t: 9.95, art: "erfolg" },
  ...[10.1, 10.25].map((t) => ({ t, art: "karte" })),
  { t: 11.9, art: "wusch", lang: 0.4 },
  // Beiträge: Schritte des Beitragslaufs, vier Kennzahlen, Betrag zählt hoch
  { t: 12.25, art: "karte" },
  ...[12.75, 13.15, 13.55].map((t) => ({ t, art: "plopp" })),
  ...[13.6, 13.76, 13.92, 14.08].map((t) => ({ t, art: "karte" })),
  { t: 14.7, art: "erfolg" },
  { t: 16.95, art: "wusch", lang: 0.4 },
  // Termine: Kalender kippt herein, Termine ploppen auf, Sommerfest leuchtet, Flug hinein
  { t: 17.15, art: "auf" },
  ...[17.6, 17.85, 18.1, 18.35].map((t) => ({ t, art: "karte" })),
  { t: 19.4, art: "glanz" },
  { t: 21.4, art: "wusch", lang: 0.8 },
  // Zusage
  { t: 21.8, art: "karte" },
  { t: 22.37, art: "tipp" },
  { t: 22.42, art: "erfolg" },
  { t: 24.4, art: "wusch", lang: 0.5 },
  // Stadt: Spuren, Pin, Schritte
  { t: 24.8, art: "strich" },
  { t: 26.0, art: "plopp" },
  ...[26.3, 27.1, 27.9].map((t) => ({ t, art: "haken" })),
  { t: 28.4, art: "wusch", lang: 0.4 },
  // Helfer: Handy, Antippen „In Abbau eintragen“, eingetragen
  { t: 28.65, art: "auf" },
  { t: 31.02, art: "tipp" },
  { t: 31.17, art: "haken" },
  { t: 33.4, art: "wusch", lang: 0.4 },
  // Vereins-Chat: Liste fliegt heraus, Nachricht tippen, senden, Antwort kommt
  { t: 33.65, art: "auf" },
  { t: 33.95, art: "karte" },
  ...tippen(34.6, 0.9, 27, 14),
  { t: 35.52, art: "tipp" },
  { t: 35.6, art: "plopp" },
  { t: 36.35, art: "glocke" },
  { t: 37.4, art: "wusch", lang: 0.4 },
  // App-Symbol
  { t: 37.5, art: "tief" },
  { t: 38.1, art: "glanz" },
  // Sätze
  ...[49.5, 50.0, 50.5].map((t) => ({ t, art: "schlag" })),
  { t: 51.1, art: "karte" },
  { t: 51.55, art: "strich" },
  { t: 53.4, art: "wusch", lang: 0.5 },
  // Logo, Schein
  { t: 53.5, art: "aufprall" },
  { t: 53.55, art: "glanz" },
  { t: 56.9, art: "schein" },
];
