// Sprechertext: jedes Stück aus dem Drehbuch als eigene Aufnahme (48 kHz WAV) und die Zeiten für die Untertitel.
//
//   node werbevideo/werkzeuge/sprecher.mjs
//
// Standard ist die eingebaute Mac-Stimme „Anna“ (Platzhalter). Eigene Aufnahmen: als werbevideo/stimme/<id>.m4a
// (oder .wav/.aiff/.mp3) ablegen, z. B. „07-ein-ort.m4a“ – dann nimmt das Skript diese statt der Mac-Stimme.
// Ergebnis: werbevideo/ausgabe/ton/sprecher/<id>.wav und werbevideo/szenen/drehbuch.js (Zeiten fürs Bild).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as drehbuch from "./drehbuch.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const base = path.resolve(here, "..");
const out = path.join(base, "ausgabe", "ton", "sprecher");
const own = path.join(base, "stimme");
fs.mkdirSync(out, { recursive: true });

const STIMME = process.env.VF_STIMME ?? "Anna";
const TEMPO = process.env.VF_TEMPO ?? "185";

/** Was die Mac-Stimme anders sprechen soll, als der Untertitel schreibt. */
const AUSSPRACHE = [[/ –$/, ","], [/ – /g, ", "]];

function seconds(file) {
  const info = execFileSync("afinfo", [file], { encoding: "utf8" });
  return Number(/estimated duration: ([\d.]+)/.exec(info)[1]);
}

const result = [];
for (const stueck of drehbuch.SPRECHER) {
  const target = path.join(out, `${stueck.id}.wav`);
  const mine = ["m4a", "wav", "aiff", "mp3", "caf"].map((ext) => path.join(own, `${stueck.id}.${ext}`)).find((f) => fs.existsSync(f));
  if (mine) {
    execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@48000", "-c", "1", mine, target]);
  } else {
    let text = stueck.text;
    for (const [re, rep] of AUSSPRACHE) text = text.replace(re, rep);
    const tmp = path.join(out, `${stueck.id}.aiff`);
    execFileSync("say", ["-v", STIMME, "-r", TEMPO, "-o", tmp, text]);
    execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@48000", tmp, target]);
    fs.rmSync(tmp);
  }
  const dauer = seconds(target);
  result.push({ ...stueck, dauer: Math.round(dauer * 1000) / 1000, quelle: mine ? path.basename(mine) : `Mac-Stimme ${STIMME}` });
  console.log(`${stueck.id.padEnd(14)} ${stueck.start.toFixed(2)} s + ${dauer.toFixed(2)} s  ${mine ? "(eigene Aufnahme)" : ""}`);
}

// Überschneidungen melden (dann im Drehbuch verschieben)
for (let i = 1; i < result.length; i++) {
  const prev = result[i - 1];
  if (prev.start + prev.dauer > result[i].start - 0.05) {
    console.warn(`! ${prev.id} endet erst bei ${(prev.start + prev.dauer).toFixed(2)} s – ${result[i].id} beginnt bei ${result[i].start} s`);
  }
}

const js = `// Erzeugt von werkzeuge/sprecher.mjs aus werkzeuge/drehbuch.mjs – nicht von Hand ändern.\nwindow.DREHBUCH = ${JSON.stringify(
  { DAUER: drehbuch.DAUER, BILDER_PRO_SEKUNDE: drehbuch.BILDER_PRO_SEKUNDE, BPM: drehbuch.BPM, SZENEN: drehbuch.SZENEN, SPRECHER: result, GERAEUSCHE: drehbuch.GERAEUSCHE },
  null,
  1,
)};\n`;
fs.writeFileSync(path.join(base, "szenen", "drehbuch.js"), js);
fs.writeFileSync(path.join(out, "zeiten.json"), JSON.stringify(result, null, 1));
console.log("✔ szenen/drehbuch.js");
