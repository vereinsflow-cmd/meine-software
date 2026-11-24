// Technische Prüfung der synthetisierten Tonspur (Musik + Soundeffekte). Ändert nichts, beendet sich mit Code 1 bei Fehlern.
//   node werkzeuge/ton-pruefen.mjs [--bild pruefung/musik-spektrogramm.png]
//
// Prüft music.wav und sfx/*.wav: Dauer, Spitze ≤ −1 dBFS, Gleichanteil, Anfang/Ende bei 0, Übersteuerung, ungültige Werte,
// Lautheit der Musik je Szene (Intro leiser und gefiltert, ab „Mitglieder“ voller, Breakdown leiser, Schlussklang stumm),
// und ob src/data/sfx.ts / audio.ts nur auf vorhandene Dateien zeigen.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUB = path.join(ROOT, "video/public");
const SR = 48000;
const db = (x) => 20 * Math.log10(Math.max(1e-12, x));

let errors = 0, warnings = 0;
const fail = (m) => { errors++; console.log(`  ✗ ${m}`); };
const warn = (m) => { warnings++; console.log(`  ! ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);

// ---- WAV lesen -------------------------------------------------------------------------------------
function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") throw new Error("kein RIFF/WAVE");
  let o = 12, fmt = null, data = null;
  while (o + 8 <= b.length) {
    const id = b.toString("ascii", o, o + 4), len = b.readUInt32LE(o + 4);
    if (id === "fmt ") fmt = { tag: b.readUInt16LE(o + 8), ch: b.readUInt16LE(o + 10), sr: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
    if (id === "data") { data = { off: o + 8, len }; break; }
    o += 8 + len + (len & 1);
  }
  if (!fmt || !data) throw new Error("fmt/data fehlt");
  if (fmt.tag !== 1 || fmt.bits !== 16) throw new Error(`nur 16-Bit-PCM unterstützt (tag ${fmt.tag}, ${fmt.bits} Bit)`);
  const truncated = data.off + data.len > b.length;
  const n = Math.floor(Math.min(data.len, b.length - data.off) / (2 * fmt.ch));
  const chans = Array.from({ length: fmt.ch }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < fmt.ch; c++) chans[c][i] = b.readInt16LE(data.off + (i * fmt.ch + c) * 2) / 32768;
  return { ...fmt, n, chans, truncated, raw: b, dataOff: data.off };
}
const mono = (w) => {
  if (w.ch === 1) return w.chans[0];
  const m = new Float32Array(w.n);
  for (let i = 0; i < w.n; i++) { let s = 0; for (let c = 0; c < w.ch; c++) s += w.chans[c][i]; m[i] = s / w.ch; }
  return m;
};
function biquad2(x, type, fc, q = Math.SQRT1_2) {
  const w = (2 * Math.PI * fc) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q), a0 = 1 + al;
  const hp = type === "hp";
  const b0 = (hp ? (1 + c) : (1 - c)) / 2 / a0, b1 = (hp ? -(1 + c) : (1 - c)) / a0, b2 = b0, a1 = (-2 * c) / a0, a2 = (1 - al) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
const rmsRange = (x, t0, t1) => {
  const a = Math.max(0, Math.round(t0 * SR)), b = Math.min(x.length, Math.round(t1 * SR));
  let s = 0;
  for (let i = a; i < b; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, b - a));
};

// ---- Einzeldatei-Prüfung ---------------------------------------------------------------------------
function checkFile(label, file, { expectDur = null, tolS = 0.0005, channels = null, edgeLimit = 0.002 } = {}) {
  console.log(label);
  let w;
  try { w = readWav(file); } catch (e) { fail(`nicht lesbar: ${e.message}`); return null; }
  if (w.sr !== SR) fail(`Abtastrate ${w.sr} statt ${SR}`);
  if (channels && w.ch !== channels) fail(`${w.ch} Kanäle statt ${channels}`);
  if (w.truncated) fail("Datei kürzer als im Header angegeben");
  const dur = w.n / w.sr;
  if (expectDur != null) (Math.abs(dur - expectDur) <= tolS ? ok : fail)(`Dauer ${dur.toFixed(4)} s (soll ${expectDur} s)`);
  let peak = 0, nonFinite = 0, clipRun = 0, maxRun = 0, atFull = 0;
  for (const x of w.chans) {
    let run = 0;
    for (let i = 0; i < x.length; i++) {
      const v = x[i];
      if (!Number.isFinite(v)) { nonFinite++; continue; }
      const a = Math.abs(v);
      if (a > peak) peak = a;
      if (a >= 32767 / 32768) { atFull++; run++; if (run > maxRun) maxRun = run; } else run = 0;
    }
  }
  clipRun = maxRun;
  (db(peak) <= -1 ? ok : fail)(`Spitze ${db(peak).toFixed(2)} dBFS (Grenze −1)`);
  (nonFinite === 0 ? ok : fail)(`ungültige Werte (NaN/Inf): ${nonFinite}`);
  (clipRun < 3 && atFull === 0 ? ok : fail)(`Übersteuerung: ${atFull} Samples auf Vollausschlag, längste Folge ${clipRun}`);
  const dc = Math.max(...w.chans.map((x) => Math.abs(x.reduce((s, v) => s + v, 0) / x.length)));
  (dc < 0.001 ? ok : fail)(`Gleichanteil ${dc.toExponential(1)} (Grenze 1e-3)`);
  const first = Math.max(...w.chans.map((x) => Math.abs(x[0]))), last = Math.max(...w.chans.map((x) => Math.abs(x[x.length - 1])));
  (first <= edgeLimit ? ok : fail)(`erstes Sample ${first.toExponential(1)} (Grenze ${edgeLimit})`);
  (last <= edgeLimit ? ok : fail)(`letztes Sample ${last.toExponential(1)} (Grenze ${edgeLimit})`);
  // Knackser am Rand: Sprünge zwischen aufeinanderfolgenden Samples in den ersten/letzten 6 Samples (0,125 ms)
  const m = w.chans[0];
  const jump = (a, b) => { let j = 0; for (let i = Math.max(1, a); i < Math.min(m.length, b); i++) j = Math.max(j, Math.abs(m[i] - m[i - 1])); return j; };
  const jIn = jump(0, 6), jOut = jump(m.length - 6, m.length);
  (jIn < 0.02 ? ok : fail)(`größter Sprung in den ersten 6 Samples ${jIn.toFixed(4)}`);
  (jOut < 0.02 ? ok : fail)(`größter Sprung in den letzten 6 Samples ${jOut.toFixed(4)}`);
  return w;
}

// ---- Hauptteil -------------------------------------------------------------------------------------
const plan = JSON.parse(fs.readFileSync(path.join(ROOT, "plan/sfx-prompts.json"), "utf8"));
const timeline = JSON.parse(fs.readFileSync(path.join(ROOT, "video/src/data/timeline.json"), "utf8"));

// 1) Musik
const musicFile = path.join(PUB, "audio/music.wav");
const mw = checkFile("Musik  video/public/audio/music.wav", musicFile, { expectDur: 60, tolS: 1 / SR, channels: 2 });
if (mw) {
  const m = mono(mw);
  console.log("  Lautheit je Szene (RMS, mono)");
  const hf = biquad2(biquad2(m, "hp", 4000), "hp", 4000);
  const lo = biquad2(biquad2(m, "lp", 150), "lp", 150);
  const rows = {};
  for (const s of timeline.scenes) {
    const r = rmsRange(m, s.from, s.to), h = rmsRange(hf, s.from, s.to);
    rows[s.id] = { r: db(r), h: db(h) - db(r) };
    console.log(`    ${s.id.padEnd(12)} ${s.from.toFixed(2).padStart(6)}–${s.to.toFixed(2).padStart(6)} s   ${db(r).toFixed(1).padStart(6)} dBFS   Anteil > 4 kHz ${(db(h) - db(r)).toFixed(1).padStart(6)} dB`);
  }
  const win = (name, a, b) => { const r = rmsRange(m, a, b), h = rmsRange(hf, a, b); rows[name] = { r: db(r), h: db(h) - db(r) }; console.log(`    ${name.padEnd(12)} ${a.toFixed(2).padStart(6)}–${b.toFixed(2).padStart(6)} s   ${db(r).toFixed(1).padStart(6)} dBFS   Anteil > 4 kHz ${(db(h) - db(r)).toFixed(1).padStart(6)} dB`); };
  win("Intro", 0.4, 7.8);
  win("Riser", 8.0, 9.8);
  win("Drop A", 10, 26);
  win("Lift B", 26, 41.85);
  win("Abwärts C", 41.85, 48.4);
  win("Breakdown", 50.2, 54.3);
  win("Schluss", 54.6, 59.0);
  const R = (k) => rows[k].r;
  const mainMin = Math.min(R("mitglieder"), R("termine"), R("helfer"), R("nachrichten"));
  (R("hook") < R("mitglieder") - 4 && R("problem") < R("mitglieder") - 4 ? ok : fail)(`Intro (Hook ${R("hook").toFixed(1)}, Problem ${R("problem").toFixed(1)}) mind. 4 dB leiser als Mitglieder (${R("mitglieder").toFixed(1)})`);
  (rows.Intro.h < rows["Drop A"].h - 10 ? ok : fail)(`Intro gefiltert: Höhenanteil ${rows.Intro.h.toFixed(1)} dB gegenüber ${rows["Drop A"].h.toFixed(1)} dB im Drop`);
  (R("mitglieder") > R("falten") + 3 ? ok : fail)(`ab Mitglieder voller: ${R("mitglieder").toFixed(1)} dBFS gegenüber Falten ${R("falten").toFixed(1)}`);
  (mainMin > R("hook") + 4 ? ok : fail)(`Hauptteil (Mitglieder bis Nachrichten) durchgehend voller als der Intro (leisester Teil ${mainMin.toFixed(1)} dBFS)`);
  (R("leitsatz") < mainMin - 5 ? ok : fail)(`Breakdown (Leitsatz ${R("leitsatz").toFixed(1)} dBFS) mind. 5 dB leiser als der Hauptteil (${mainMin.toFixed(1)})`);
  const tail = rmsRange(m, 59.7, 60);
  (tail < 1e-4 ? ok : fail)(`letzte 0,3 s stumm (RMS ${db(tail).toFixed(1)} dBFS)`);
  const early = rmsRange(m, 0, 0.3);
  console.log(`    erste 0,3 s: ${db(early).toFixed(1)} dBFS (das Video blendet sie ohnehin aus, MUSIC_GAPS)`);
  const dropJump = db(rmsRange(m, 10, 10.5)) - db(rmsRange(m, 9.4, 9.8));
  const dropLow = db(rmsRange(lo, 10, 10.5)) - db(rmsRange(lo, 9.4, 9.8));
  (dropJump > 3 && dropLow > 6 ? ok : fail)(`Einsatz bei 10,0 s: gesamt +${dropJump.toFixed(1)} dB, Tiefen (< 150 Hz) +${dropLow.toFixed(1)} dB gegenüber den 0,4 s davor`);
  // Spektrogramm
  const bi = process.argv.indexOf("--bild");
  if (bi > 0) writeSpectrogram(m, path.resolve(process.argv[bi + 1]), timeline.scenes.map((s) => s.from));
}

// 2) Soundeffekte
const sfxDir = path.join(PUB, "sfx");
const files = fs.existsSync(sfxDir) ? fs.readdirSync(sfxDir).filter((f) => !f.startsWith(".")).sort() : [];
console.log(`\nSoundeffekte (${files.length} Dateien in video/public/sfx)`);
const planNames = plan.dateien.map((d) => ({ name: path.basename(d.datei, path.extname(d.datei)) + ".wav", dur: d.dauer_s }));
for (const p of planNames) if (!files.includes(p.name)) fail(`Plan-Datei fehlt: sfx/${p.name}`);
for (const f of files) if (!planNames.some((p) => p.name === f)) warn(`nicht im Plan: sfx/${f}`);
const nonWav = files.filter((f) => !f.endsWith(".wav"));
nonWav.forEach((f) => warn(`keine WAV-Datei: sfx/${f}`));
const sfxQuiet = process.argv.includes("--leise");
const sfxStats = [];
for (const p of planNames) {
  if (!files.includes(p.name)) continue;
  const before = { e: errors, w: warnings };
  const origLog = console.log;
  if (sfxQuiet) console.log = () => {};
  const w = checkFile(`sfx/${p.name}`, path.join(sfxDir, p.name), { expectDur: p.dur, tolS: 1 / SR, channels: 1 });
  console.log = origLog;
  if (sfxQuiet) {
    const bad = errors - before.e;
    if (bad) { console.log(`sfx/${p.name}: ${bad} Fehler (ohne --leise anzeigen)`); }
  }
  if (w) { const x = w.chans[0]; let pk = 0, s = 0; for (const v of x) { pk = Math.max(pk, Math.abs(v)); s += v * v; } sfxStats.push([p.name, db(pk), db(Math.sqrt(s / x.length))]); }
}
console.log(`  ${sfxStats.length}/${planNames.length} Effekte geprüft; Spitze min/max ${Math.min(...sfxStats.map((s) => s[1])).toFixed(2)} / ${Math.max(...sfxStats.map((s) => s[1])).toFixed(2)} dBFS`);

// 3) Verweise im Quelltext
console.log("\nVerweise im Quelltext");
const sfxTs = fs.readFileSync(path.join(ROOT, "video/src/data/sfx.ts"), "utf8");
const audioTs = fs.readFileSync(path.join(ROOT, "video/src/data/audio.ts"), "utf8");
const code = sfxTs.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
const used = Array.from(new Set([...code.matchAll(/"(sfx\/[^"]+)"/g)].map((m) => m[1]))).sort();
console.log(`  sfx.ts nennt ${used.length} verschiedene Dateien`);
let missing = 0;
for (const u of used) if (!fs.existsSync(path.join(PUB, u))) { fail(`sfx.ts verweist auf fehlende Datei ${u}`); missing++; }
if (!missing) ok("alle Dateinamen in sfx.ts existieren in public/sfx");
for (const u of used) if (!u.endsWith(".wav")) fail(`sfx.ts: ${u} ist keine .wav-Datei`);
const unused = files.filter((f) => !used.includes(`sfx/${f}`));
if (unused.length) warn(`in public/sfx, aber nicht in sfx.ts verwendet: ${unused.join(", ")}`);
else ok("jede Datei in public/sfx wird in sfx.ts verwendet");
const mus = /music:\s*"([^"]+)"/.exec(audioTs);
(mus && mus[1] === "audio/music.wav" ? ok : fail)(`audio.ts: music zeigt auf ${mus ? mus[1] : "nichts"} (soll audio/music.wav)`);
if (mus && !fs.existsSync(path.join(PUB, mus[1]))) fail(`audio.ts: ${mus[1]} existiert nicht`);
const lens = /LEN\s*=\s*\{([^}]*)\}/.exec(sfxTs);
if (lens) {
  const get = (k) => Number(new RegExp(`${k}:\\s*(\\d+)`).exec(lens[1])?.[1]);
  const dur = (nm) => planNames.find((p) => p.name === nm)?.dur;
  for (const [k, nm] of [["keysRiser", "keys-riser.wav"], ["reverseSwell", "reverse-swell.wav"]]) {
    const fr = Math.round(dur(nm) * 30);
    (get(k) === fr ? ok : fail)(`sfx.ts LEN.${k} = ${get(k)} Frames, Datei ${nm} dauert ${fr} Frames`);
  }
}

console.log(`\n${errors ? "FEHLER" : "OK"}: ${errors} Fehler, ${warnings} Hinweise`);
process.exit(errors ? 1 : 0);

// ---- Spektrogramm als PNG --------------------------------------------------------------------------
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function writePng(file, w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
}
function writeSpectrogram(x, file, marks) {
  const W = 1200, H = 420, NF = 4096, hop = Math.floor((x.length - NF) / W);
  const img = Buffer.alloc(W * H * 3);
  const win = new Float32Array(NF).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / NF));
  const fmin = 40, fmax = 16000;
  const cm = (v) => { v = Math.min(1, Math.max(0, v)); const r = Math.min(255, Math.round(255 * Math.min(1, v * 1.6))), g = Math.round(255 * Math.max(0, Math.min(1, (v - 0.35) * 1.8))), b = Math.round(255 * Math.max(0, 0.55 * Math.sin(Math.PI * Math.min(1, v * 1.4)) - 0.25 * v)); return [r, g, b]; };
  for (let col = 0; col < W; col++) {
    const re = new Float64Array(NF), im = new Float64Array(NF);
    for (let i = 0; i < NF; i++) re[i] = (x[col * hop + i] ?? 0) * win[i];
    fft(re, im);
    for (let row = 0; row < H; row++) {
      const f = fmin * Math.pow(fmax / fmin, 1 - row / (H - 1));
      const k = (f / SR) * NF, k0 = Math.floor(k), k1 = Math.min(NF / 2 - 1, Math.max(k0 + 1, Math.floor((f * 1.012 / SR) * NF)));
      let m = 0;
      for (let q = k0; q <= k1; q++) m = Math.max(m, Math.hypot(re[q], im[q]));
      const v = (db(m / (NF / 4)) + 95) / 70;
      const [r, g, b] = cm(v);
      const o = (row * W + col) * 3; img[o] = r; img[o + 1] = g; img[o + 2] = b;
    }
  }
  const line = (col, r, g, b) => { for (let row = 0; row < H; row++) { const o = (row * W + col) * 3; img[o] = r; img[o + 1] = g; img[o + 2] = b; } };
  for (const t of marks) line(Math.min(W - 1, Math.round(((t * SR - NF / 2) / (x.length - NF)) * W)), 60, 160, 255);
  for (const f of [100, 1000, 10000]) { const row = Math.round((1 - Math.log(f / fmin) / Math.log(fmax / fmin)) * (H - 1)); for (let col = 0; col < W; col += 3) { const o = (row * W + col) * 3; img[o] = 255; img[o + 1] = 255; img[o + 2] = 255; } }
  writePng(file, W, H, img);
  console.log(`  Spektrogramm: ${file}`);
}
