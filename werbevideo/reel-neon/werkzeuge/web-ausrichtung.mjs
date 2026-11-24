// Ausrichtung für eine Stimme aus der ElevenLabs-Weboberfläche (ohne API-Zeitstempel):
//   node werkzeuge/web-ausrichtung.mjs [--name stimme-web]
// Liest audio/NAME.mp3 (oder .m4a/.wav/.aiff; Text mit <break>-Pausen zwischen den Abschnitten aus plan/abschnitte.json),
// findet die Abschnittspausen (dynamische Programmierung: lange Stille nahe der erwarteten Lage),
// verteilt die Wörter je Abschnitt (Satzzeichen an erkannte kurze Pausen, dazwischen nach Buchstaben)
// und schreibt audio/NAME-ausrichtung.json im selben Format wie die API (alignment.characters + Zeiten).
// Danach: node werkzeuge/zeitplan-bauen.mjs --stimme NAME
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d; };
const NAME = arg("name", "stimme-web");
const SR = 48000;
const sections = JSON.parse(fs.readFileSync(path.join(ROOT, "plan/abschnitte.json"), "utf8"));

const wav = path.join(ROOT, `audio/${NAME}-48k.wav`);
const srcFile = ["mp3", "m4a", "wav", "aiff"].map((e) => path.join(ROOT, `audio/${NAME}.${e}`)).find((f) => fs.existsSync(f));
if (!srcFile) throw new Error(`audio/${NAME}.mp3 (oder .m4a/.wav/.aiff) fehlt`);
execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@48000", "-c", "1", srcFile, wav]);
const buf = fs.readFileSync(wav);
let o = 12; while (buf.toString("ascii", o, o + 4) !== "data") o += 8 + buf.readUInt32LE(o + 4); o += 8;
const N = (buf.length - o) / 2, x = new Float32Array(N);
for (let k = 0; k < N; k++) x[k] = buf.readInt16LE(o + k * 2) / 32768;

// ---- Pegel und Stille (10-ms-Raster)
const HOP = 480;
const dbOf = (v) => 20 * Math.log10(Math.max(v, 1e-9));
function frameDb(s) { const n = Math.floor(s.length / HOP), out = new Float32Array(n); for (let f = 0; f < n; f++) { let q = 0; for (let i = f * HOP; i < (f + 1) * HOP; i++) q += s[i] * s[i]; out[f] = dbOf(Math.sqrt(q / HOP)); } return out; }
const pct = (arr, p) => { const a = Float32Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const DB = frameDb(x), LO = pct(DB, 0.1), HI = pct(DB, 0.9), THR = Math.max(LO + 6, HI - 32);
function silences(f0, f1, minDur, mergeGap = 0.06) {
  const runs = []; let s = -1;
  for (let f = f0; f <= f1; f++) {
    const q = f < f1 && DB[f] < THR;
    if (q && s < 0) s = f;
    if (!q && s >= 0) { runs.push({ a: s * 0.01, b: f * 0.01 }); s = -1; }
  }
  const merged = [];
  for (const r of runs) { const l = merged.at(-1); if (l && r.a - l.b <= mergeGap) l.b = r.b; else merged.push({ ...r }); }
  return merged.filter((r) => r.b - r.a >= minDur);
}
let first = 0; while (first < DB.length && DB[first] < THR) first++;
let last = DB.length - 1; while (last > 0 && DB[last] < THR) last--;
const S0 = first * 0.01, S1 = (last + 1) * 0.01;

// ---- 11 Abschnittspausen per DP
const weight = (w) => w.replace(/[^A-Za-zÄÖÜäöüß]/g, "").length + 1.6;
const secW = sections.map((s) => s.text.split(/\s+/).filter(Boolean).reduce((n, w) => n + weight(w), 0));
const cands = silences(first, last, 0.22).filter((r) => r.a > S0 + 0.3 && r.b < S1 - 0.3);
const K = sections.length - 1;
const BREAK = 0.6, totalW = secW.reduce((a, b) => a + b, 0), rate = (S1 - S0 - K * BREAK) / totalW;
const expect = []; { let t = S0; for (let k = 0; k < K; k++) { t += secW[k] * rate; expect.push(t + BREAK / 2); t += BREAK; } }
const cost = (c, k) => Math.pow(((c.a + c.b) / 2 - expect[k]) / 1.6, 2) - 6 * Math.min(c.b - c.a, 0.9);
// dp[k][j]: beste Kosten, wenn Pause k auf Kandidat j liegt
const dp = Array.from({ length: K }, () => new Array(cands.length).fill(Infinity)), from = Array.from({ length: K }, () => new Array(cands.length).fill(-1));
for (let j = 0; j < cands.length; j++) dp[0][j] = cost(cands[j], 0);
for (let k = 1; k < K; k++) for (let j = 0; j < cands.length; j++) for (let i = 0; i < j; i++) {
  const v = dp[k - 1][i] + cost(cands[j], k);
  if (v < dp[k][j]) { dp[k][j] = v; from[k][j] = i; }
}
let bj = -1, bv = Infinity; for (let j = 0; j < cands.length; j++) if (dp[K - 1][j] < bv) { bv = dp[K - 1][j]; bj = j; }
if (bj < 0) throw new Error(`Zu wenige Pausen gefunden (${cands.length}) – Aufnahme mit <break>-Pausen erzeugen`);
const cuts = []; for (let k = K - 1, j = bj; k >= 0; j = from[k][j], k--) cuts.unshift(cands[j]);

// ---- Wörter je Abschnitt
function wordTimes(text, a, b) {
  const ws = text.split(/\s+/).filter(Boolean);
  // Sprechgrenzen im Abschnitt enger fassen
  let fa = Math.round(a * 100), fb = Math.round(b * 100);
  while (fa < fb && DB[fa] < THR) fa++; while (fb > fa && DB[fb - 1] < THR) fb--;
  const s0 = fa * 0.01, s1 = fb * 0.01;
  const breaks = ws.map((w, i) => (/[.,:;!?–]$/.test(w) && i < ws.length - 1 ? i : -1)).filter((i) => i >= 0);
  const pauses = silences(fa, fb, 0.07).filter((p) => p.a > s0 + 0.12 && p.b < s1 - 0.12);
  const tot = ws.reduce((s, w) => s + weight(w), 0);
  let acc = 0; const est = ws.map((w) => { acc += weight(w); return s0 + ((s1 - s0) * acc) / tot; });
  const bounds = [{ i: -1, a: s0, b: s0 }], used = new Set();
  for (const bi of breaks) {
    let best = -1, bd = 0.7;
    pauses.forEach((p, k) => { if (used.has(k)) return; const d = Math.abs((p.a + p.b) / 2 - est[bi]); if (d < bd && p.a > bounds.at(-1).b) { bd = d; best = k; } });
    if (best >= 0) { used.add(best); bounds.push({ i: bi, a: pauses[best].a, b: pauses[best].b }); }
  }
  bounds.push({ i: ws.length - 1, a: s1, b: s1 });
  const out = [];
  for (let k = 1; k < bounds.length; k++) {
    const f = bounds[k - 1].i + 1, t = bounds[k].i, ta = bounds[k - 1].b, tb = bounds[k].a;
    const g = ws.slice(f, t + 1), gw = g.reduce((s, w) => s + weight(w), 0);
    let c = ta; g.forEach((w) => { const d = ((tb - ta) * weight(w)) / gw; out.push({ w, start: c, end: c + d * 0.94 }); c += d; });
  }
  return out;
}
const edges = [S0, ...cuts.flatMap((c) => [c.a, c.b]), S1];
const chars = [], cs = [], ce = [];
sections.forEach((s, k) => {
  const a = edges[2 * k], b = edges[2 * k + 1];
  const ws = wordTimes(s.text, a, b);
  ws.forEach((w, i) => {
    const L = w.w.length;
    for (let q = 0; q < L; q++) { chars.push(w.w[q]); cs.push(+(w.start + ((w.end - w.start) * q) / L).toFixed(3)); ce.push(+(w.start + ((w.end - w.start) * (q + 1)) / L).toFixed(3)); }
    if (i < ws.length - 1) { chars.push(" "); cs.push(+w.end.toFixed(3)); ce.push(+ws[i + 1].start.toFixed(3)); }
  });
  if (k < sections.length - 1) { const t0 = ce.at(-1), t1 = edges[2 * k + 2]; chars.push("\n", "\n"); cs.push(t0, t0); ce.push(+t1.toFixed(3), +t1.toFixed(3)); }
});
const text = sections.map((s) => s.text).join("\n\n");
fs.writeFileSync(path.join(ROOT, `audio/${NAME}-ausrichtung.json`), JSON.stringify({ text, source: "web (ohne API-Zeitstempel, Pausen-Ausrichtung)", alignment: { characters: chars, character_start_times_seconds: cs, character_end_times_seconds: ce } }, null, 1));
console.log(`Sprechbereich ${S0.toFixed(2)}–${S1.toFixed(2)} s, ${cands.length} Pausen-Kandidaten, Abschnittspausen:`);
cuts.forEach((c, k) => console.log(`  nach ${String(k).padStart(2)} (${sections[k].abschnitt.slice(0, 28).padEnd(28)}): ${c.a.toFixed(2)}–${c.b.toFixed(2)} (erwartet ${expect[k].toFixed(2)})`));
