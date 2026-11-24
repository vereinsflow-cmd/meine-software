// Baut den Zeitplan (video/src/data/timeline.json), auf den ALLE Animationen und Untertitel des Reels hören.
//   node werkzeuge/zeitplan-bauen.mjs                 Platzhalter: Wörter nach Plan-Zeiten verteilt (bis die Stimme da ist)
//   node werkzeuge/zeitplan-bauen.mjs --stimme NAME   echte Zeiten aus audio/NAME-ausrichtung.json (ElevenLabs-Zeitstempel);
//                                                     jeder Abschnitt wird an seinen Plan-Start gelegt (Stille dazwischen
//                                                     angepasst) und als audio/voice.wav für Remotion zusammengesetzt.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "video/src/data/timeline.json");
const FPS = 30, DUR = 60;
const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : null; };
const sections = JSON.parse(fs.readFileSync(path.join(ROOT, "plan/abschnitte.json"), "utf8"));

/** Szenen (Sekunden) – Grenzen auf dem Schlagraster (120 BPM, 1 Schlag = 0,5 s), je ca. 0,2–0,7 s vor dem ersten Wort ihres Abschnitts. */
const SCENES = [
  ["hook", 0, 2.5], ["problem", 2.5, 8], ["frage", 8, 10], ["mitglieder", 10, 18], ["termine", 18, 26], ["helfer", 26, 32],
  ["nachrichten", 32, 38.5], ["finanzen", 38.5, 46], ["feierabend", 46, 47.5], ["leitsatz", 47.5, 51.5], ["logo", 51.5, 55.5],
  ["endkarte", 55.5, 60],
];
/** Abschnitt → Szene, in der er gesprochen wird */
const SECTION_SCENE = ["hook", "problem", "frage", "mitglieder", "termine", "helfer", "nachrichten", "finanzen", "feierabend", "leitsatz", "logo", "endkarte"];

const tokenize = (t) => t.split(/\s+/).filter(Boolean);
const clean = (w) => w.replace(/[.,:;!?„“"–-]+$/g, "").replace(/^[„“"]+/, "");

let words = [];
let voice = null;
const stimme = arg("stimme");
if (!stimme) {
  // Platzhalter: Wörter proportional zur Zeichenzahl über das Plan-Fenster verteilt
  for (const s of sections) {
    const toks = tokenize(s.text);
    const total = toks.reduce((n, w) => n + w.length + 1, 0);
    let t = s.plan_von;
    const span = s.plan_bis - s.plan_von;
    toks.forEach((w, i) => {
      const d = ((w.length + 1) / total) * span;
      words.push({ text: w, key: clean(w).toLowerCase(), section: s.id, i, start: +t.toFixed(3), end: +(t + d * 0.92).toFixed(3) });
      t += d;
    });
  }
} else {
  const a = JSON.parse(fs.readFileSync(path.join(ROOT, `audio/${stimme}-ausrichtung.json`), "utf8"));
  const { characters: ch, character_start_times_seconds: cs, character_end_times_seconds: ce } = a.alignment;
  // Zeichen zu Wörtern zusammenfassen (Leerraum trennt), Abschnitte über "\n\n"
  const raw = [];
  let cur = null, sec = 0, nl = 0;
  for (let k = 0; k < ch.length; k++) {
    const c = ch[k];
    if (/\s/.test(c)) {
      if (cur) { raw.push(cur); cur = null; }
      if (c === "\n") { nl++; if (nl === 2) { sec++; } } else nl = 0;
      continue;
    }
    nl = 0;
    if (!cur) cur = { text: "", section: sec, start: cs[k], end: ce[k] };
    cur.text += c; cur.end = ce[k];
  }
  if (cur) raw.push(cur);
  // Abschnitts-Audio an Plan-Start legen: Segment = [erstes Wort − 0,06 s, letztes Wort + 0,18 s]
  const SR = 48000;
  const wav = path.join(ROOT, `audio/${stimme}-48k.wav`);
  const srcFile = ["mp3", "m4a", "wav", "aiff"].map((e) => path.join(ROOT, `audio/${stimme}.${e}`)).find((f) => fs.existsSync(f));
  if (!srcFile) throw new Error(`audio/${stimme}.mp3 (oder .m4a/.wav/.aiff) fehlt`);
  execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@48000", "-c", "1", srcFile, wav]);
  const buf = fs.readFileSync(wav);
  let o = 12; while (buf.toString("ascii", o, o + 4) !== "data") o += 8 + buf.readUInt32LE(o + 4); o += 8;
  const n = (buf.length - o) / 2, src = new Float32Array(n);
  for (let k = 0; k < n; k++) src[k] = buf.readInt16LE(o + k * 2) / 32768;
  const outBuf = new Float32Array(DUR * SR);
  let cursor = 0; // frühester erlaubter Start (Ende des vorigen Abschnitts + Atempause)
  const placed = [];
  for (const s of sections) {
    const ws = raw.filter((w) => w.section === s.id);
    if (!ws.length) throw new Error(`Abschnitt ${s.id} ohne Wörter – Ausrichtung prüfen`);
    const a0 = Math.max(0, ws[0].start - 0.06), a1 = Math.min(n / SR, ws.at(-1).end + 0.18);
    const at = Math.max(s.plan_von - 0.06, cursor);
    const shift = at - a0;
    const i0 = Math.round(a0 * SR), i1 = Math.round(a1 * SR), j0 = Math.round(at * SR);
    for (let k = i0; k < i1 && j0 + k - i0 < outBuf.length; k++) {
      // 8-ms-Rampen an den Schnittkanten gegen Knackser
      const e = Math.min(1, (k - i0) / 384, (i1 - k) / 384);
      outBuf[j0 + k - i0] += src[k] * e;
    }
    ws.forEach((w, i) => words.push({ text: w.text, key: clean(w.text).toLowerCase(), section: s.id, i, start: +(w.start + shift).toFixed(3), end: +(w.end + shift).toFixed(3) }));
    placed.push({ id: s.id, plan: s.plan_von, at: +at.toFixed(3), len: +(a1 - a0).toFixed(3), endsAt: +(at + a1 - a0).toFixed(3), late: +(at - (s.plan_von - 0.06)).toFixed(3) });
    cursor = at + (a1 - a0) + 0.12;
  }
  // WAV schreiben (mono, 48 kHz, 16 bit)
  const out = Buffer.alloc(44 + outBuf.length * 2);
  out.write("RIFF", 0); out.writeUInt32LE(36 + outBuf.length * 2, 4); out.write("WAVE", 8); out.write("fmt ", 12);
  out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22); out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 2, 28);
  out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34); out.write("data", 36); out.writeUInt32LE(outBuf.length * 2, 40);
  for (let k = 0; k < outBuf.length; k++) out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, outBuf[k])) * 32767), 44 + k * 2);
  fs.mkdirSync(path.join(ROOT, "video/public/audio"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "video/public/audio/voice.wav"), out);
  voice = { file: "audio/voice.wav", source: path.basename(srcFile), placed };
  console.table(placed);
}

// Szenengrenzen bleiben auf dem Musikraster. Spricht ein Abschnitt über seine Szene hinaus, nur warnen.
const scenes = SCENES.map(([id, from, to]) => ({ id, from, to }));
for (const s of sections) {
  const ws = words.filter((w) => w.section === s.id);
  const sc = scenes.find((x) => x.id === SECTION_SCENE[s.id]);
  if (ws.at(-1).end > sc.to + 0.35) console.warn(`Achtung: Abschnitt ${s.id} („${s.abschnitt}“) endet bei ${ws.at(-1).end.toFixed(2)} s, Szene ${sc.id} schon bei ${sc.to} s`);
}
const timeline = {
  fps: FPS, durationInFrames: FPS * DUR, placeholder: !stimme, voice,
  scenes: scenes.map((s) => ({ ...s, fromFrame: Math.round(s.from * FPS), toFrame: Math.round(s.to * FPS) })),
  sections: sections.map((s) => { const ws = words.filter((w) => w.section === s.id); return { id: s.id, name: s.abschnitt, scene: SECTION_SCENE[s.id], text: s.text, start: ws[0].start, end: ws.at(-1).end }; }),
  words,
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(timeline, null, 1));
console.log(`${OUT}: ${words.length} Wörter, ${timeline.scenes.length} Szenen${stimme ? "" : " (Platzhalter)"}`);
for (const s of timeline.scenes) console.log(`  ${s.id.padEnd(12)} ${s.from.toFixed(2)}–${s.to.toFixed(2)} s`);
