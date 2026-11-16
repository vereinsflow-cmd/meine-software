// Sprecher für das Reel mit einer ElevenLabs-Stimme: jeder Satz aus drehbuch-reel.mjs (SPRECHER) wird einzeln erzeugt
// und als 48-kHz-WAV für musik.mjs abgelegt.
//
//   node werbevideo/werkzeuge/stimme-elevenlabs.mjs          # fehlende Sätze erzeugen, vorhandene wiederverwenden
//   node werbevideo/werkzeuge/stimme-elevenlabs.mjs --neu    # alle Sätze neu erzeugen (verbraucht Zeichen-Guthaben)
//   node werbevideo/werkzeuge/musik.mjs --reel               # danach: Musik + Stimme mischen
//
// Schlüssel: ~/.config/elevenlabs/api-key (einmalig: bash werbevideo/werkzeuge/elevenlabs-schluessel.sh); er wird nie
// ausgegeben. Ergebnis: ausgabe/ton/stimme-reel/<id>.mp3 (Original von ElevenLabs) und ausgabe/ton/sprecher/<id>.wav.
// Werbung braucht bei ElevenLabs mindestens das Starter-Abo (der kostenlose Plan ist nur für nicht-kommerzielle Nutzung).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as D from "./drehbuch-reel.mjs";

// Stimme: „Brian – Deep, Resonant and Comforting“ (Standardstimme, auch im kostenlosen Plan über die Schnittstelle nutzbar).
// Wunschstimme war „Daniel – Corporate Narration“ (jdKpAe6rxAe99tFGbsAc, Stimmen-Bibliothek, deutsch) – Bibliotheksstimmen
// gehen über die Schnittstelle erst ab dem Starter-Abo; dann hier eintragen: { id: "jdKpAe6rxAe99tFGbsAc", …, suche: "Daniel" }
// und mit --neu alle Sätze neu erzeugen.
const STIMME = { id: "nPczCjzI2devNBz1zQrb", name: "Brian – Deep, Resonant and Comforting", suche: "Brian" };
const MODELL = "eleven_multilingual_v2";
const EINSTELLUNG = { stability: 0.5, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true };

const here = path.dirname(fileURLToPath(import.meta.url));
const base = path.resolve(here, "..");
const roh = path.join(base, "ausgabe", "ton", "stimme-reel");
const out = path.join(base, "ausgabe", "ton", "sprecher");
fs.mkdirSync(roh, { recursive: true });
fs.mkdirSync(out, { recursive: true });
const neu = process.argv.includes("--neu");

const keyFile = path.join(os.homedir(), ".config", "elevenlabs", "api-key");
if (!fs.existsSync(keyFile)) {
  console.error("Kein ElevenLabs-Schlüssel gefunden. Einmalig: bash werbevideo/werkzeuge/elevenlabs-schluessel.sh");
  process.exit(1);
}
const KEY = fs.readFileSync(keyFile, "utf8").trim();
async function api(pfad, opts = {}) {
  const r = await fetch(`https://api.elevenlabs.io${pfad}`, { ...opts, headers: { "xi-api-key": KEY, ...(opts.headers ?? {}) } });
  if (!r.ok) {
    const fehler = new Error(`${opts.method ?? "GET"} ${pfad}: ${r.status} ${(await r.text()).slice(0, 400)}`);
    fehler.status = r.status;
    throw fehler;
  }
  return r;
}

try {
  const abo = await (await api("/v1/user/subscription")).json();
  console.log(`ElevenLabs: Plan „${abo.tier}“, ${abo.character_count} von ${abo.character_limit} Zeichen verbraucht`);
  if (abo.tier === "free") console.warn("! Kostenloser Plan: nur nicht-kommerzielle Nutzung mit Namensnennung – für Werbung mindestens Starter.");
} catch {
  console.log("ElevenLabs: Plan unbekannt (der Schlüssel darf das Konto nicht lesen – für die Stimme nicht nötig)");
}

let stimmeId = STIMME.id;
async function stimmeHinzufuegen() {
  const such = await (await api(`/v1/shared-voices?page_size=100&search=${encodeURIComponent(STIMME.suche)}`)).json();
  const v = (such.voices ?? []).find((x) => x.voice_id === STIMME.id);
  if (!v) throw new Error(`Stimme ${STIMME.id} in der ElevenLabs-Bibliothek nicht gefunden`);
  const r = await (await api(`/v1/voices/add/${v.public_owner_id}/${STIMME.id}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ new_name: STIMME.name }),
  })).json();
  stimmeId = r.voice_id ?? STIMME.id;
  console.log(`Stimme zu „Meine Stimmen“ hinzugefügt: ${STIMME.name}`);
}
async function sprich(text) {
  const anfrage = () => api(`/v1/text-to-speech/${stimmeId}?output_format=mp3_44100_128`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: MODELL, voice_settings: EINSTELLUNG }),
  });
  try {
    return await anfrage();
  } catch (e) {
    // Stimmen aus der Bibliothek müssen erst in „Meine Stimmen“ – einmal hinzufügen, dann nochmal
    if ((e.status === 400 || e.status === 404) && /voice/i.test(e.message) && stimmeId === STIMME.id) {
      await stimmeHinzufuegen();
      return anfrage();
    }
    throw e;
  }
}

const dauer = (f) => Number(/estimated duration: ([\d.]+)/.exec(execFileSync("afinfo", [f], { encoding: "utf8" }))[1]);
let zeichen = 0;
for (const s of D.SPRECHER) {
  const mp3 = path.join(roh, `${s.id}.mp3`), wav = path.join(out, `${s.id}.wav`);
  if (neu || !fs.existsSync(mp3)) {
    const r = await sprich(s.text);
    fs.writeFileSync(mp3, Buffer.from(await r.arrayBuffer()));
    zeichen += s.text.length;
  }
  execFileSync("afconvert", ["-f", "WAVE", "-d", "LEI16@48000", "-c", "1", mp3, wav]);
  const d = dauer(wav);
  const bis = D.SPRECHER_BIS?.[s.id];
  const warnung = bis !== undefined && s.start + d > bis ? `  ! endet bei ${(s.start + d).toFixed(2)} s, spätestens ${bis} s` : "";
  console.log(`${s.id.padEnd(20)} ${s.start.toFixed(2)} s + ${d.toFixed(2)} s${warnung}`);
}
console.log(`✔ ausgabe/ton/sprecher/reel-*.wav (${zeichen} Zeichen neu erzeugt)`);
