# VereinsFlow – Reel 60 s (Remotion)

Instagram-Reel 1080 × 1920, 30 fps, 1800 Frames. Alle Zeiten kommen aus `src/data/timeline.json`
(gebaut von `../werkzeuge/zeitplan-bauen.mjs`); nie feste Frames für sprachgebundene Ereignisse.

## Vorschau und Prüfung

```console
npm run dev                      # Studio: VereinsFlowReel60, Cover, Szenen/S01…S11, Pruefung/Pruefbogen
npx tsc --noEmit && npx eslint src
npx remotion still Cover out.png
npx remotion still Pruefbogen bogen.png --props='{"frames":[1496,1500,1504],"cols":3,"scale":0.33}'
```

## Ton (fehlende Dateien werden beim Rendern übersprungen)

| Datei | Quelle |
|---|---|
| `public/audio/voice.wav` | `node ../werkzeuge/zeitplan-bauen.mjs --stimme NAME` (setzt auch `timeline.voice`) |
| `public/audio/music.wav` | selbst synthetisiert: `node ../werkzeuge/ton-synth.mjs --nur musik` (120 BPM, C-Dur, 60,000 s, Einsatz bei 10,0 s) |
| `public/sfx/*.wav` | selbst synthetisiert: `node ../werkzeuge/ton-synth.mjs --nur sfx` (Namen und Dauern: `../plan/sfx-prompts.json`) |

Prüfen (Dauer, Spitze, Gleichanteil, Ränder, Lautheit je Szene, Verweise in `sfx.ts`/`audio.ts`):
`node ../werkzeuge/ton-pruefen.mjs [--leise] [--bild ../pruefung/musik-spektrogramm.png]`.
(`../werkzeuge/ton-erzeugen.mjs` ist der ElevenLabs-Weg und schreibt `.mp3`; für die Synth-Spur wird er nicht gebraucht.)

Cue-Zeiten und Lautstärken der SFX: `src/data/sfx.ts`. Musik-Ducking und Pausen: `src/components/AudioLayer.tsx`,
`src/data/audio.ts`, `MUSIC_GAPS` in `src/data/sfx.ts`.
