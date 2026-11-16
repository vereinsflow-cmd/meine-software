// Drehbuch des Reels (szenen/reel.html, 60 s): ein Kameraflug ohne Schnitt durch die App, 128 BPM – ein Takt dauert
// 1,875 s, 60 s sind genau 32 Takte. Abschnitte beginnen auf einer Eins; Geräusche sitzen auf den Bildereignissen –
// die Zeiten hier müssen zu reel.html passen (T, KAMERA, Stationen).

export const DAUER = 60;
export const BILDER_PRO_SEKUNDE = 30;
export const BPM = 128;

export const SZENEN = [
  { id: "intro", von: 0, bis: 3.75 },
  { id: "dash", von: 3.75, bis: 11.25 },
  { id: "mitglieder", von: 11.25, bis: 18.75 },
  { id: "beitraege", von: 18.75, bis: 26.25 },
  { id: "termine", von: 26.25, bis: 33.75 },
  { id: "helfer", von: 33.75, bis: 41.25 },
  { id: "chat", von: 41.25, bis: 46.875 },
  { id: "warp", von: 46.875, bis: 52.5 },
  { id: "ende", von: 52.5, bis: 60 },
];

/**
 * Sprecher (ElevenLabs-Stimme „Daniel“, werkzeuge/stimme-elevenlabs.mjs): je Abschnitt ein Satz, Beginn in Sekunden.
 * Jeder Satz muss vor dem nächsten Abschnitt zu Ende sein; das Skript meldet Überschneidungen.
 */
export const SPRECHER = [
  { id: "reel-01-flow", start: 0.45, text: "Dein Verein. Willkommen im Flow." },
  { id: "reel-02-blick", start: 4.2, text: "Alles auf einen Blick: Mitglieder, Termine, Aufgaben." },
  { id: "reel-03-mitglieder", start: 11.7, text: "Neue Mitglieder? In Sekunden angelegt." },
  { id: "reel-04-beitraege", start: 19.1, text: "Beiträge laufen automatisch. Geprüft, erstellt, fertig." },
  { id: "reel-05-termine", start: 26.7, text: "Termine, die jeder sieht. Auch das Sommerfest." },
  { id: "reel-06-helfer", start: 34.3, text: "Helfer tragen sich selbst ein. Ganz ohne Telefonkette." },
  { id: "reel-07-chat", start: 41.7, text: "Und alles Wichtige steht im Vereins-Chat." },
  { id: "reel-08-flow", start: 48.85, text: "Alles in einem Flow." },
  { id: "reel-09-ende", start: 55.4, text: "VereinsFlow. Jetzt Demo anfragen." },
];
/** Bis wann ein Satz spätestens zu Ende sein muss (Beginn des nächsten Abschnitts bzw. der Schläge). */
export const SPRECHER_BIS = { "reel-01-flow": 3.75, "reel-02-blick": 11.25, "reel-03-mitglieder": 15.0, "reel-04-beitraege": 24.0, "reel-05-termine": 33.0, "reel-06-helfer": 38.1, "reel-07-chat": 46.875, "reel-08-flow": 52.5, "reel-09-ende": 59.5 };

/** Tippen: ein Anschlag je Zeichen (wie das Bild die Buchstaben zeigt), höchstens `max` Anschläge. */
function tippen(t0, dauer, zeichen, max = zeichen) {
  const n = Math.min(zeichen, max);
  return Array.from({ length: n }, (_, i) => ({ t: t0 + (dauer * (i + 0.5)) / n, art: "tippen" }));
}

export const GERAEUSCHE = [
  // Intro: Licht, die Balken des Logos fliegen zusammen, Punkt fällt, Flug durch das V, der Groove setzt ein
  { t: 0.15, art: "wusch", lang: 1.0 },
  ...[0.62, 0.74, 0.86, 0.98, 1.1].map((t) => ({ t, art: "karte" })),
  { t: 1.62, art: "plopp" },
  { t: 2.05, art: "glanz" },
  { t: 3.5, art: "wusch", lang: 0.9 },
  { t: 3.75, art: "aufprall" },
  // Tunnel aus Dashboard-Karten, 233 zählt hoch
  ...[4.7, 5.6, 6.5, 7.4, 8.3, 9.2, 10.1, 11.0].map((t) => ({ t, art: "auf" })),
  { t: 5.9, art: "haken" },
  // Mitglied anlegen
  ...tippen(13.0, 0.35, 3),
  ...tippen(13.45, 0.35, 8),
  ...tippen(13.95, 0.35, 10),
  { t: 14.55, art: "karte" },
  { t: 15.02, art: "tipp" },
  { t: 15.4, art: "auf" },
  { t: 15.92, art: "erfolg" },
  ...[16.0, 16.1].map((t) => ({ t, art: "karte" })),
  // drei Tore des Beitragslaufs, 7.240,00 €, die Karten fliegen auseinander
  ...[19.2, 20.0, 20.8].map((t) => ({ t, art: "haken" })),
  ...[19.6, 20.4, 21.2].map((t) => ({ t, art: "wusch", lang: 0.5 })),
  { t: 24.0, art: "erfolg" },
  { t: 25.15, art: "wusch", lang: 0.6 },
  // Kalender: Termine wachsen hoch, das Sommerfest leuchtet und steigt auf, Flug hinein
  { t: 26.6, art: "auf" },
  ...[27.2, 27.6, 28.0, 28.4, 28.8].map((t) => ({ t, art: "karte" })),
  { t: 29.8, art: "glanz" },
  { t: 30.3, art: "tief" },
  { t: 33.45, art: "wusch", lang: 0.9 },
  // Helferplan: an der Wand entlang nach unten, Antippen, eingetragen, durch die Wand
  { t: 34.0, art: "auf" },
  { t: 36.4, art: "wusch", lang: 2.0 },
  { t: 38.12, art: "tipp" },
  { t: 38.27, art: "haken" },
  { t: 40.45, art: "wusch", lang: 0.6 },
  // Vereins-Chat
  { t: 41.6, art: "karte" },
  { t: 42.4, art: "auf" },
  { t: 43.62, art: "plopp" },
  { t: 44.62, art: "glocke" },
  { t: 45.6, art: "auf" },
  // Warp: Schläge auf „Mitglieder. Beiträge. Termine.“, „Alles in einem Flow.“, hinein ins Handy
  ...[46.875, 47.344, 47.813].map((t) => ({ t, art: "schlag" })),
  { t: 48.6, art: "wusch", lang: 1.2 },
  { t: 48.75, art: "tief" },
  { t: 49.2, art: "strich" },
  { t: 52.35, art: "wusch", lang: 0.7 },
  // Ende: zurück aus dem Handy, es dreht sich, Logo, Schein
  { t: 52.8, art: "auf" },
  { t: 54.9, art: "wusch", lang: 0.7 },
  { t: 55.3125, art: "aufprall" },
  { t: 55.36, art: "glanz" },
  { t: 56.25, art: "schein" },
];
