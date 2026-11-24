/**
 * Audio-Konfiguration. Dateien liegen in public/ – fehlen sie, wird die Ebene einfach übersprungen
 * (geprüft per getStaticFiles(), Rendern bricht nicht).
 *
 * Stimme: kommt aus timeline.voice.file (setzt werkzeuge/zeitplan-bauen.mjs --stimme …).
 */
export const AUDIO = {
  /** Musikbett (selbst synthetisiert: werkzeuge/ton-synth.mjs, 60,000 s, 120 BPM, Groove ab 10,0 s) */
  music: "audio/music.wav",
  /** Grundpegel der Musik ohne Sprache (dB relativ zu 0 dB) – mit der echten Stimme gemessen: so liegt die Musik in den Pausen knapp unter der Stimme */
  musicBaseDb: -10,
  /** Pegel der Musik unter Sprache (dB relativ zu 0 dB = Stimme) – Storyboard: ca. −18 dB */
  musicDuckDb: -21,
  /** Rampen (Frames): vor Sprachbeginn absenken, nach Sprachende wieder anheben */
  duckAttackFrames: 6,
  duckReleaseFrames: 14,
  /** Musik am Spotende ausblenden (Frames) – damit das Reel sauber loopt */
  musicFadeOutFrames: 18,
  voiceVolume: 1,
} as const;

export const dbToGain = (db: number) => Math.pow(10, db / 20);
