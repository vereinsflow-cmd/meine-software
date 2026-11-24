// Erzeugt Soundeffekte und Musik mit ElevenLabs (Prompts aus plan/sfx-prompts.json und plan/musik-prompt.json).
//   node werkzeuge/ton-erzeugen.mjs [--nur sfx|musik] [--neu]   (--neu: vorhandene Dateien überschreiben)
// Ablage: video/public/sfx/*.mp3 und video/public/audio/music.mp3. Der API-Schlüssel kommt aus .env und wird nie ausgegeben.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUB = path.join(ROOT, "video/public");
const env = fs.readFileSync(path.join(ROOT, ".env"), "utf8").match(/^ELEVENLABS_API_KEY=(.*)$/m);
const KEY = env ? env[1].trim() : "";
if (!KEY) { console.error("ELEVENLABS_API_KEY fehlt in .env"); process.exit(1); }
const only = (() => { const i = process.argv.indexOf("--nur"); return i > 0 ? process.argv[i + 1] : null; })();
const force = process.argv.includes("--neu");

async function post(url, body) {
  const res = await fetch(url, { method: "POST", headers: { "xi-api-key": KEY, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

let ok = 0, fail = 0;
if (only !== "musik") {
  const plan = JSON.parse(fs.readFileSync(path.join(ROOT, "plan/sfx-prompts.json"), "utf8"));
  const std = plan.standard;
  for (const d of plan.dateien) {
    const out = path.join(PUB, d.datei);
    if (!force && fs.existsSync(out)) { ok++; continue; }
    fs.mkdirSync(path.dirname(out), { recursive: true });
    try {
      const buf = await post(`https://api.elevenlabs.io/v1/sound-generation?output_format=${std.output_format}`, {
        text: d.prompt, model_id: std.model_id, duration_seconds: Math.max(0.5, Math.min(30, d.dauer_s)),
        prompt_influence: d.prompt_influence ?? std.prompt_influence, loop: d.loop ?? std.loop,
      });
      fs.writeFileSync(out, buf); ok++;
      console.log(`SFX ✓ ${d.datei} (${(buf.length / 1024).toFixed(0)} KB)`);
    } catch (e) {
      fail++; console.log(`SFX ✗ ${d.datei}: ${e.message}`);
      if (/40[13]/.test(e.message)) break; // fehlende Berechtigung / Tarif: nicht 46-mal wiederholen
    }
  }
}
if (only !== "sfx") {
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, "plan/musik-prompt.json"), "utf8"));
  const out = path.join(PUB, "audio/music.mp3");
  if (force || !fs.existsSync(out)) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    for (const [name, v] of [["Kompositionsplan", m.variante_kompositionsplan], ["Prompt", m.variante_prompt]]) {
      const { output_format, ...body } = v;
      try {
        const buf = await post(`https://api.elevenlabs.io/v1/music?output_format=${output_format}`, body);
        fs.writeFileSync(out, buf); ok++;
        console.log(`Musik ✓ (${name}, ${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
        break;
      } catch (e) { fail++; console.log(`Musik ✗ (${name}): ${e.message}`); }
    }
  }
}
console.log(`fertig: ${ok} ok, ${fail} Fehler`);
