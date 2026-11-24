/**
 * Audio-Ebene: Stimme (timeline.voice), Musik mit Ducking aus den Wort-Zeitstempeln und SFX aus
 * data/sfx.ts. Fehlende Dateien werden übersprungen – das Rendern bricht nie wegen Audio.
 */
import React from "react";
import { Audio, Sequence, getStaticFiles, staticFile } from "remotion";
import { AUDIO, dbToGain } from "../data/audio";
import { MUSIC_GAPS, SFX } from "../data/sfx";
import { DURATION_IN_FRAMES, FPS, speechSpans, timeline } from "../lib/timeline";

const available = (): Set<string> => {
  try {
    return new Set(getStaticFiles().map((f) => f.name.replace(/^\/+/, "")));
  } catch {
    return new Set();
  }
};

const smooth = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** 0 = keine Sprache, 1 = Sprache (mit weichen Rampen) */
export const speechAmount = (frame: number) => {
  let amt = 0;
  for (const s of speechSpans) {
    const a = s.from - AUDIO.duckAttackFrames;
    const r = s.to + AUDIO.duckReleaseFrames;
    if (frame < a || frame > r) continue;
    let v = 1;
    if (frame < s.from) v = smooth((frame - a) / AUDIO.duckAttackFrames);
    else if (frame > s.to) v = 1 - smooth((frame - s.to) / AUDIO.duckReleaseFrames);
    amt = Math.max(amt, v);
  }
  return amt;
};

/** 0 in den Musik-Pausen (MUSIC_GAPS), mit kurzen Rampen an den Kanten */
export const musicGate = (frame: number) => {
  const R = 3;
  let g = 1;
  for (const [a, b] of MUSIC_GAPS) {
    if (frame < a - R || frame > b + R) continue;
    // vor der Pause ausblenden (nicht am Spotanfang), danach wieder einblenden
    const down = a <= 0 ? 0 : 1 - smooth((frame - (a - R)) / R);
    const up = smooth((frame - b) / R);
    g = Math.min(g, frame < a ? down : frame >= b ? up : 0);
  }
  return g;
};

/** Musik-Lautstärke pro Frame (linearer Gain) */
export const musicVolume = (frame: number) => {
  const sp = speechAmount(frame);
  const db = AUDIO.musicBaseDb + (AUDIO.musicDuckDb - AUDIO.musicBaseDb) * sp;
  const fadeOut = 1 - smooth((frame - (DURATION_IN_FRAMES - AUDIO.musicFadeOutFrames)) / AUDIO.musicFadeOutFrames);
  return dbToGain(db) * fadeOut * musicGate(frame);
};

export const AudioLayer: React.FC = () => {
  const files = available();
  const voiceFile = timeline.voice?.file ?? null;
  const hasVoice = voiceFile !== null && files.has(voiceFile);
  const hasMusic = files.has(AUDIO.music);
  const sfx = SFX.filter((c) => files.has(c.file) && c.frame >= 0 && c.frame < DURATION_IN_FRAMES);
  return (
    <>
      {hasVoice && voiceFile ? <Audio name="Stimme" src={staticFile(voiceFile)} volume={AUDIO.voiceVolume} /> : null}
      {hasMusic ? <Audio name="Musik (geduckt)" src={staticFile(AUDIO.music)} volume={(f) => musicVolume(f)} /> : null}
      {sfx.map((c, i) => (
        <Sequence key={`${c.file}-${i}`} from={c.frame} name={c.name ?? c.file} durationInFrames={FPS * 4} layout="none">
          <Audio src={staticFile(c.file)} volume={c.volume ?? 1} />
        </Sequence>
      ))}
    </>
  );
};
