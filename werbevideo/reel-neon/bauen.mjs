// Baut das 60-s-Neon-Reel komplett: Zeitplan → Video rendern → Ton mastern → Titelbild → Dokumente/Downloads.
//
//   node bauen.mjs                                    vorhandene Jonas-Aufnahme (audio/stimme-web.mp3, schon ausgerichtet)
//   node bauen.mjs --elevenlabs [--tempo 1.0]         Stimme neu per ElevenLabs-API („Jonas“, mit Wort-Zeitstempeln)
//   node bauen.mjs ~/Downloads/VereinsFlow-Sprecher-60s-neu.mp3   eigene ElevenLabs-Aufnahme aus der Weboberfläche
//
// Ergebnis: out/VereinsFlow-Reel-60s-Neon-final.mp4 (−14 LUFS) und Titelbild, kopiert nach
// ~/Downloads/VereinsFlow-Reel-60s-Neon/ (dazu Sprechertext, Bildunterschrift, Stimm-Anleitung) und das Video nach ~/Documents.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const VIDEO = path.join(ROOT, "video");
const NAME = "VereinsFlow-Reel-60s-Neon";
const DL = path.join(os.homedir(), `Downloads/${NAME}`);
const DOCS = path.join(os.homedir(), "Documents");
const run = (cmd, args, cwd = ROOT) => execFileSync(cmd, args, { cwd, stdio: "inherit" });
const log = (s) => console.log(`\n▶ ${s}`);

const api = process.argv.includes("--elevenlabs");
const tempoArg = process.argv.indexOf("--tempo");
const tempo = tempoArg > 0 ? process.argv[tempoArg + 1] : "1.0";
const fileArg = process.argv.slice(2).find((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--tempo");
const input = fileArg ? path.resolve(fileArg.replace(/^~/, os.homedir())) : null;

/** Neue Aufnahmen sprechen den vollständigen Text (die alte Jonas-Aufnahme hat „sagt ab“ verschluckt). */
const restoreFullText = () => {
  const file = path.join(ROOT, "plan/abschnitte.json");
  const sections = JSON.parse(fs.readFileSync(file, "utf8"));
  const original = JSON.parse(fs.readFileSync(path.join(ROOT, "plan/abschnitte-60s-original.json"), "utf8"));
  for (const s of sections) {
    const o = original.find((x) => x.id === s.id);
    if (o) s.text = o.text;
  }
  fs.writeFileSync(file, JSON.stringify(sections, null, 1) + "\n");
};

let name = "stimme-web";
let aligned = false;
if (api) {
  restoreFullText();
  name = "stimme";
  log(`Stimme per ElevenLabs-API (Tempo ${tempo})`);
  run("node", ["werkzeuge/stimme-erzeugen.mjs", "--name", name, "--tempo", tempo]);
  aligned = true;
} else if (input) {
  if (!fs.existsSync(input)) throw new Error(`Datei nicht gefunden: ${input}`);
  const ext = path.extname(input).toLowerCase().replace(".", "");
  if (!["mp3", "m4a", "wav", "aiff"].includes(ext)) throw new Error("Bitte eine MP3-, M4A-, WAV- oder AIFF-Datei angeben");
  restoreFullText();
  for (const e of ["mp3", "m4a", "wav", "aiff"]) fs.rmSync(path.join(ROOT, `audio/${name}.${e}`), { force: true });
  fs.copyFileSync(input, path.join(ROOT, `audio/${name}.${ext}`));
  log(`Stimme: ${input}`);
} else {
  // vorhandene Jonas-Aufnahme: nur neu ausrichten, wenn die Ausrichtung fehlt
  aligned = fs.existsSync(path.join(ROOT, `audio/${name}-ausrichtung.json`));
  log(`Stimme: vorhandene Jonas-Aufnahme (audio/${name}.mp3)`);
}

if (!aligned) {
  log("Abschnitte in der Aufnahme finden");
  run("node", ["werkzeuge/web-ausrichtung.mjs", "--name", name]);
}
log("Zeitplan bauen (Stimme an die Szenen legen)");
run("node", ["werkzeuge/zeitplan-bauen.mjs", "--stimme", name]);

fs.mkdirSync(path.join(ROOT, "out"), { recursive: true });
log("Video rendern (dauert etwa eine halbe Stunde)");
run("npx", ["remotion", "render", "VereinsFlowReel60Neon", `../out/${NAME}.mp4`, "--codec=h264", "--crf=16", "--audio-codec=aac", "--audio-bitrate=320k", "--log=error"], VIDEO);
log("Ton mastern (−14 LUFS)");
run("node", ["werkzeuge/mastern.mjs", `out/${NAME}.mp4`, `out/${NAME}-final.mp4`]);
log("Titelbild");
run("npx", ["remotion", "still", "Cover", "../out/Titelbild-60s-Neon.png", "--log=error"], VIDEO);
run("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "92", "out/Titelbild-60s-Neon.png", "--out", "out/Titelbild-60s-Neon.jpg"]);

fs.mkdirSync(DL, { recursive: true });
fs.copyFileSync(path.join(ROOT, `out/${NAME}-final.mp4`), path.join(DL, `${NAME}.mp4`));
fs.copyFileSync(path.join(ROOT, `out/${NAME}-final.mp4`), path.join(DOCS, `${NAME}.mp4`));
fs.copyFileSync(path.join(ROOT, "out/Titelbild-60s-Neon.jpg"), path.join(DL, "Titelbild-60s-Neon.jpg"));
for (const f of ["Sprechertext.txt", "ElevenLabs-Anleitung.txt", "Bildunterschrift.txt"]) {
  if (fs.existsSync(path.join(ROOT, f))) fs.copyFileSync(path.join(ROOT, f), path.join(DL, f));
}
log(`Fertig: ${path.join(DOCS, `${NAME}.mp4`)} (und ${DL})`);
