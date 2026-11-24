// Baut plan/musik-prompt.json für ElevenLabs Music – die Abschnitte folgen den Szenengrenzen aus
// video/src/data/timeline.json. Nach jedem neuen Zeitplan (z. B. mit der echten Stimme) neu ausführen:
//   node werkzeuge/musik-prompt-bauen.mjs
// Erzeugt nur die JSON-Datei, ruft keine API auf und braucht keinen Schlüssel.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tl = JSON.parse(fs.readFileSync(path.join(ROOT, "video/src/data/timeline.json"), "utf8"));
const at = (id, key = "from") => {
  const s = tl.scenes.find((x) => x.id === id);
  if (!s) throw new Error(`Szene ${id} fehlt im Zeitplan`);
  return s[key];
};
const total = tl.durationInFrames / tl.fps;
const ms = (a, b) => Math.round((b - a) * 1000);

const GLOBAL_POS = [
  "modern driving corporate tech pop",
  "instrumental",
  "120 BPM",
  "4/4",
  "key of C major",
  "warm and optimistic",
  "felt piano chords",
  "soft synth plucks",
  "clean punchy kick",
  "light claps",
  "round sub bass",
  "polished, spacious, premium mix",
];
const GLOBAL_NEG = ["vocals", "singing", "choir", "spoken word", "rap", "aggressive EDM drops", "dubstep", "heavy distortion", "epic trailer brass", "lo-fi vinyl crackle"];

// Abschnitte entlang der Szenen (Mindestlänge je Abschnitt laut API: 3 s)
const plan = [
  {
    name: "Intro – filtered tension",
    from: 0,
    to: at("mitglieder"),
    text: "[Intro]",
    pos: ["heavily low-pass filtered", "muffled, as if heard through a wall", "tense and restless", "ticking hi-hat", "pulsing muted bass", "slowly building", "short riser in the last two seconds"],
    neg: ["full drums", "bright open sound", "melody hook"],
    note: "Szenen 1–3 (Hook, Problem, Falten). Die ersten 0,3 s und die 0,5 s vor dem Einsatz schaltet AudioLayer stumm (MUSIC_GAPS in data/sfx.ts) – der Riser darf also bis zum Ende laufen.",
  },
  {
    name: "Drop – main groove A",
    from: at("mitglieder"),
    to: at("helfer"),
    text: "[Main Theme]",
    pos: ["full band enters on the first downbeat with a warm major chord", "filter fully open", "driving four-on-the-floor kick", "claps on 2 and 4", "bright felt piano chords", "plucked synth arpeggio", "confident and light"],
    neg: ["filter", "muffled"],
    note: "Szenen 4–5 (Mitglieder, Termine): Einsatz genau auf dem Kreis-Wipe.",
  },
  {
    name: "Main groove B – lift",
    from: at("helfer"),
    to: at("finanzen"),
    text: "[Main Theme Variation]",
    pos: ["same groove with a slight lift", "added marimba counter-melody in C major", "airy pad layer", "steady and flowing"],
    neg: ["key change", "tempo change"],
    note: "Szenen 6–7 (Helfer, Nachrichten). Die Helfer-Taps spielen C–E–G als SFX darüber.",
  },
  {
    name: "Main groove C – winding down",
    from: at("finanzen"),
    to: at("leitsatz"),
    text: "[Bridge]",
    pos: ["groove continues", "drums and percussion fade out during the final two seconds", "piano and pad remain", "evening calm arriving"],
    neg: ["build-up", "riser"],
    note: "Szene 8 (Finanzen, Feierabend): ab „Dann ist Feierabend“ geht die Percussion raus.",
  },
  {
    name: "Breakdown",
    from: at("leitsatz"),
    to: at("logo"),
    text: "[Breakdown]",
    pos: ["only soft felt piano and a warm pad", "lots of space", "calm and sincere", "no drums"],
    neg: ["drums", "percussion", "bass groove"],
    note: "Szene 9 (Leitsatz): ruhige Stimme, viel Raum.",
  },
  {
    name: "Resolution and final chord",
    from: at("logo"),
    to: total,
    text: "[Outro]",
    pos: ["gentle lift", "soft pluck motif C, E, G, high C", "resolving into a sustained warm C major final chord", "chord rings out and decays naturally", "silence in the last 0.3 seconds"],
    neg: ["drums", "fade into a new section", "abrupt ending"],
    note: "Szenen 10–11 (Logo, Endkarte): Schlussakkord klingt bis ca. 59,7 s aus, damit das Reel sauber loopt.",
  },
];

for (const c of plan) if (ms(c.from, c.to) < 3000) throw new Error(`Abschnitt „${c.name}“ ist kürzer als 3 s – Abschnitte zusammenlegen`);

const out = {
  zweck: "Musikbett für das 60-s-Reel – ElevenLabs Music (POST /v1/music, model_id music_v2_5). Ablage: video/public/audio/music.mp3. AudioLayer duckt die Musik unter der Stimme auf −18 dB (ohne Stimme −6 dB) und setzt die Pausen aus MUSIC_GAPS.",
  erzeugt_aus: `video/src/data/timeline.json (${tl.placeholder ? "Platzhalter-Zeiten" : "echte Stimme"}) – neu bauen mit: node werkzeuge/musik-prompt-bauen.mjs`,
  hinweis:
    "music_v2/v2_5 halten die Abschnittslängen nur ungefähr ein (respect_sections_durations wird ignoriert). Nach dem Erzeugen prüfen, ob der Einsatz bei ca. " +
    at("mitglieder").toFixed(2) +
    " s liegt; sonst neu erzeugen oder die Musik in AudioLayer per Startversatz anlegen.",
  variante_kompositionsplan: {
    model_id: "music_v2_5",
    output_format: "mp3_48000_192",
    composition_plan: {
      chunks: plan.map((c) => ({
        text: c.text,
        duration_ms: ms(c.from, c.to),
        positive_styles: [...GLOBAL_POS, ...c.pos],
        negative_styles: [...GLOBAL_NEG, ...c.neg],
        context_adherence: "high",
      })),
    },
  },
  variante_prompt: {
    model_id: "music_v2_5",
    music_length_ms: Math.round(total * 1000),
    force_instrumental: true,
    output_format: "mp3_48000_192",
    prompt:
      `Modern, driving corporate tech pop instrumental at 120 BPM in C major, warm and optimistic, for a ${Math.round(total)}-second product video. ` +
      `0:00–${fmt(at("mitglieder"))}: heavily low-pass filtered, muffled and tense, ticking hi-hat and pulsing muted bass, short riser at the end. ` +
      `${fmt(at("mitglieder"))}: the full band enters on the downbeat with a warm major chord – four-on-the-floor kick, claps on 2 and 4, felt piano chords, plucked synth arpeggio, round sub bass. ` +
      `${fmt(at("helfer"))}: slight lift with a marimba counter-melody. ` +
      `From ${fmt(at("leitsatz") - 1.5)} the drums fade out; ${fmt(at("leitsatz"))}–${fmt(at("logo"))}: breakdown with only soft felt piano and a warm pad. ` +
      `${fmt(at("logo"))}: gentle resolution with a soft C–E–G–high C pluck motif into a sustained warm C major final chord that rings out and is silent in the last 0.3 seconds. ` +
      "Polished, spacious, premium mix. No vocals, no aggressive EDM drops, no trailer brass.",
  },
  abschnitte: plan.map((c) => ({ name: c.name, von_s: +c.from.toFixed(2), bis_s: +c.to.toFixed(2), szenen: c.note })),
};

function fmt(s) {
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${m}:${r.toFixed(1).padStart(4, "0")}`;
}

const OUT = path.join(ROOT, "plan/musik-prompt.json");
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`${OUT}: ${plan.length} Abschnitte`);
for (const c of plan) console.log(`  ${c.name.padEnd(30)} ${c.from.toFixed(2)}–${c.to.toFixed(2)} s`);
