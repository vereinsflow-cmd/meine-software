// Mastert die Tonspur des fertigen Reels auf Social-Media-Lautheit und setzt sie wieder ein (Bild bleibt unverändert).
//   node werkzeuge/mastern.mjs out/VereinsFlow-Reel-60s.mp4 out/VereinsFlow-Reel-60s-final.mp4 [--ziel -14]
// Messung nach ITU-R BS.1770-4 (K-Filter, 400-ms-Blöcke, Gates −70 LUFS / −10 LU), dann Verstärkung und ein
// Begrenzer mit 5 ms Vorschau (Decke −1,5 dBFS, 4-fach überabgetastete Spitzenschätzung). Muxen mit bin/vfvideo (AAC 320 kbit/s).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [, , inArg, outArg] = process.argv;
const TARGET = Number((() => { const i = process.argv.indexOf("--ziel"); return i > 0 ? process.argv[i + 1] : "-14"; })());
const IN = path.resolve(ROOT, inArg), OUT = path.resolve(ROOT, outArg);
const TMP = fs.mkdtempSync("/tmp/vf-master-");
const SR = 48000;

execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@48000", "-c", "2", IN, path.join(TMP, "mix.wav")]);
const b = fs.readFileSync(path.join(TMP, "mix.wav"));
let o = 12; while (b.toString("ascii", o, o + 4) !== "data") o += 8 + b.readUInt32LE(o + 4); o += 8;
const n = Math.floor((b.length - o) / 4);
const L = new Float32Array(n), R = new Float32Array(n);
for (let i = 0; i < n; i++) { L[i] = b.readInt16LE(o + i * 4) / 32768; R[i] = b.readInt16LE(o + i * 4 + 2) / 32768; }

function biquad(x, b0, b1, b2, a1, a2) { const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0; for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; } return y; }
// K-Filter-Koeffizienten für 48 kHz (BS.1770-4)
const kf = (x) => biquad(biquad(x, 1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585), 1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621);
function loudness(l, r) {
  const kl = kf(l), kr = kf(r), blk = 0.4 * SR, hop = 0.1 * SR, z = [];
  for (let s = 0; s + blk <= l.length; s += hop) { let q = 0; for (let i = s; i < s + blk; i++) q += kl[i] * kl[i] + kr[i] * kr[i]; z.push(q / blk); }
  const lk = (m) => -0.691 + 10 * Math.log10(m);
  const abs = z.filter((m) => lk(m) > -70); const rel = lk(abs.reduce((a, c) => a + c, 0) / abs.length) - 10;
  const g = abs.filter((m) => lk(m) > rel); return lk(g.reduce((a, c) => a + c, 0) / g.length);
}
function truePeak(l, r) { // 4-fach Überabtastung per kubischer Interpolation (Schätzung)
  let p = 0; for (const x of [l, r]) for (let i = 1; i < x.length - 2; i++) { const a = x[i - 1], b0 = x[i], c = x[i + 1], d = x[i + 2]; for (let k = 0; k < 4; k++) { const t = k / 4; const v = b0 + 0.5 * t * (c - a + t * (2 * a - 5 * b0 + 4 * c - d + t * (3 * (b0 - c) + d - a))); if (Math.abs(v) > p) p = Math.abs(v); } }
  return 20 * Math.log10(p);
}
const before = loudness(L, R), tpBefore = truePeak(L, R);
const gain = Math.pow(10, (TARGET - before) / 20);
// Begrenzer: Vorschau 5 ms, Release 120 ms, Decke −1,5 dBFS (Spitze je Sample über beide Kanäle)
const CEIL = Math.pow(10, -1.5 / 20), LA = Math.round(0.005 * SR), REL = Math.exp(-1 / (0.12 * SR));
const need = new Float32Array(n);
for (let i = 0; i < n; i++) { const p = Math.max(Math.abs(L[i]), Math.abs(R[i])) * gain * 1.06; need[i] = p > CEIL ? CEIL / p : 1; }
// Minimum über das Vorschaufenster, dann weiche Rückkehr
const env = new Float32Array(n); let g = 1;
const dq = []; // gleitendes Minimum
for (let i = 0; i < n + LA; i++) {
  if (i < n) { while (dq.length && need[dq.at(-1)] >= need[i]) dq.pop(); dq.push(i); }
  const j = i - LA; if (j < 0) continue;
  while (dq.length && dq[0] < j) dq.shift();
  const target = dq.length ? need[dq[0]] : 1;
  g = target < g ? target : Math.min(target, 1 - (1 - g) * REL); // sofort runter, exponentiell zurück
  env[j] = g;
}
// Attack weich machen: rückwärts höchstens linear über die Vorschau-Länge absenken (kein Sprung → kein Knacken)
for (let i = n - 2; i >= 0; i--) env[i] = Math.min(env[i], env[i + 1] + (1 - env[i + 1]) / LA);
const oL = new Float32Array(n), oR = new Float32Array(n);
for (let i = 0; i < n; i++) { oL[i] = L[i] * gain * env[i]; oR[i] = R[i] * gain * env[i]; }
const after = loudness(oL, oR), tpAfter = truePeak(oL, oR);
const out = Buffer.alloc(44 + n * 4);
out.write("RIFF", 0); out.writeUInt32LE(36 + n * 4, 4); out.write("WAVE", 8); out.write("fmt ", 12); out.writeUInt32LE(16, 16);
out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34);
out.write("data", 36); out.writeUInt32LE(n * 4, 40);
for (let i = 0; i < n; i++) { out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, oL[i])) * 32767), 44 + i * 4); out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, oR[i])) * 32767), 46 + i * 4); }
const master = path.join(path.dirname(OUT), "ton-master.wav");
fs.writeFileSync(master, out);
let reduced = 0; for (let i = 0; i < n; i++) if (env[i] < 0.98) reduced++;
console.log(`Vorher: ${before.toFixed(1)} LUFS, Spitze ${tpBefore.toFixed(1)} dBTP · Verstärkung ${(TARGET - before).toFixed(1)} dB`);
console.log(`Nachher: ${after.toFixed(1)} LUFS, Spitze ${tpAfter.toFixed(1)} dBTP · Begrenzer aktiv in ${((100 * reduced) / n).toFixed(2)} % der Samples`);
execFileSync(path.join(ROOT, "werkzeuge/bin/vfvideo"), ["mux", IN, master, OUT], { stdio: "inherit" });
