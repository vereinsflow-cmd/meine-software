// Erzeugt das Voiceover mit ElevenLabs (Text-to-Speech mit Zeitstempeln) und legt MP3 + Ausrichtung ab.
//   node werkzeuge/stimme-erzeugen.mjs [--tempo 1.0] [--name stimme]
// Der API-Schlüssel kommt aus ../.env (ELEVENLABS_API_KEY) und wird nie ausgegeben.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const env = fs.readFileSync(path.join(ROOT, ".env"), "utf8").match(/^ELEVENLABS_API_KEY=(.*)$/m);
const KEY = env ? env[1].trim() : "";
if (!KEY) { console.error("ELEVENLABS_API_KEY fehlt in .env"); process.exit(1); }

const VOICE_ID = "60UU378MZ8YbeLyaF7TI"; // Jonas – Confident and Trustworthy (deutsch)
const sections = JSON.parse(fs.readFileSync(path.join(ROOT, "plan/abschnitte.json"), "utf8"));
const text = sections.map((s) => s.text).join("\n\n");
const name = arg("name", "stimme");
const body = {
  text,
  model_id: "eleven_multilingual_v2",
  voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.15, use_speaker_boost: true, speed: Number(arg("tempo", "1.0")) },
};

const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/with-timestamps?output_format=mp3_44100_128`, {
  method: "POST",
  headers: { "xi-api-key": KEY, "content-type": "application/json" },
  body: JSON.stringify(body),
});
if (!res.ok) { console.error("HTTP", res.status, (await res.text()).slice(0, 400)); process.exit(1); }
const j = await res.json();
const out = path.join(ROOT, "audio");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, `${name}.mp3`), Buffer.from(j.audio_base64, "base64"));
fs.writeFileSync(path.join(out, `${name}-ausrichtung.json`), JSON.stringify({ text, settings: body.voice_settings, model: body.model_id, alignment: j.alignment, normalized: j.normalized_alignment }, null, 1));
const a = j.alignment;
console.log(`Zeichen: ${text.length} · Kosten laut Header: ${res.headers.get("x-character-count") ?? "?"} · Länge: ${a.character_end_times_seconds.at(-1).toFixed(2)} s`);
