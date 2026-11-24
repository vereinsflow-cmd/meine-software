/**
 * VereinsFlow-Reel 60 s im Neon-Stil (Vorbild: plan/referenz/, Drehbuch: plan/storyboard.md).
 *
 * Ebenen (von hinten nach vorn):
 *   1 Neon-Hintergrund – läuft durchgehend; jede Szene gibt ihre Stimmung vor (scenes/types.ts → mood), an den Grenzen
 *     wird über ±BLEND Frames gemischt. Wechselt die Anordnung der Bänder, werden zwei Hintergründe überblendet.
 *   2 Szenen – jede von S.from − LEAD bis S.to + TAIL; an Grenzen „zoom“/„sweep“ (film.ts → TRANSITION) fährt die alte
 *     Szene durch die Kamera und die neue kommt aus der Tiefe (neon/ZoomThrough, überlappend), bei „cut“ übergeben die
 *     Szenen selbst.
 *   3 Lichtstreif bei „sweep“, Vignette und Korn über allem (ein Look für den ganzen Film).
 *   4 Ton: Stimme, Musik mit Ducking, Geräusche (data/sfx.ts).
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import { AudioLayer } from "./components/AudioLayer";
import { FontGate } from "./components/FontGate";
import { END, LEAD, S, TAIL, TRANSITION } from "./film";
import { fontFamily } from "./fonts";
import { ShowFrame, useAbsFrame } from "./lib/scene";
import { SceneId } from "./lib/timeline";
import { FlashSweep, NeonBackground, NeonGrain, NeonVignette, ZoomThrough, invLerp, moodMix, zoomCross } from "./neon";
import { SCENES } from "./scenes";
import type { BackgroundMood } from "./scenes/types";

/** Grund hinter allem (falls der Hintergrund-Canvas noch nicht gezeichnet ist) */
const INK = "#04060D";

/** Dauer des Kreuz-Zooms an „zoom“/„sweep“-Grenzen (Frames, überlappend um die Grenze) */
export const ZOOM_DUR = 16;
/** Breite der Stimmungs-Überblendung an jeder Grenze (± Frames) */
const BLEND = 10;
/** Lichtstreif an „sweep“-Grenzen: ± Frames um die Grenze */
const SWEEP_HALF = 10;

type Layout = NonNullable<BackgroundMood["layout"]>;
type Mood = { ribbons: number; warm: number; particles: number; tint: number; lift: number; layout: Layout; swooshAt?: number; swooshDirection?: BackgroundMood["swooshDirection"]; swooshGain?: number };

/** Loop: in den letzten LOOP_BLEND Frames gleitet der Hintergrund schon in die Stimmung von Frame 0 (Instagram spielt das Reel in Schleife) */
const LOOP_BLEND = 16;
/** Wischer einer verschobenen Stimmung mitverschieben (Stimmung des Anfangs, gezeigt am Ende) */
const shiftMood = (m: Mood, df: number): Mood => (m.swooshAt === undefined ? m : { ...m, swooshAt: m.swooshAt + df });

/** Stimmung, wenn eine Szene nichts vorgibt (Inhalt im Bild → Bänder gedämpft) */
export const BASE_MOOD: Mood = { ribbons: 0.45, warm: 0, particles: 0.35, tint: 0.25, lift: 0, layout: "drift" };

const moodOf = (i: number, f: number): Mood => ({ ...BASE_MOOD, ...(SCENES[i].mood?.(f) ?? {}) });

/** Index der Szene, in deren [from, to) der Frame liegt */
export const sceneIndexAt = (f: number) => {
  for (let i = SCENES.length - 1; i >= 0; i--) if (f >= S[SCENES[i].id].from) return i;
  return 0;
};

/** Grenzen mit Lichtstreif (dort auch ein Band-Wischer im Hintergrund) */
const SWEEPS = SCENES.filter((sc, i) => i > 0 && TRANSITION[sc.id] === "sweep").map((sc) => S[sc.id].from);

/** Stimmung am Frame: a, ggf. b (Nachbarszene) und Mischanteil t */
export const moodAt = (f: number): { a: Mood; b: Mood | null; t: number } => {
  const i = sceneIndexAt(f);
  const { from, to } = S[SCENES[i].id];
  const last = SCENES.length - 1;
  if (i === last && f >= END - LOOP_BLEND) return { a: moodOf(last, f), b: shiftMood(moodOf(0, f - END), END), t: invLerp(END - LOOP_BLEND, END, f) };
  if (i > 0 && f < from + BLEND) return { a: moodOf(i - 1, f), b: moodOf(i, f), t: invLerp(from - BLEND, from + BLEND, f) };
  if (i < SCENES.length - 1 && f >= to - BLEND) return { a: moodOf(i, f), b: moodOf(i + 1, f), t: invLerp(to - BLEND, to + BLEND, f) };
  return { a: moodOf(i, f), b: null, t: 0 };
};

const SWOOSH_DUR = 16;

/** Laufender Band-Wischer: aus den Stimmungen (swooshAt) oder automatisch an „sweep“-Grenzen */
const swooshFor = (f: number, moods: (Mood | null)[]) => {
  const cands: { at: number; dir?: Mood["swooshDirection"]; gain: number }[] = [];
  for (const m of moods) if (m?.swooshAt !== undefined) cands.push({ at: m.swooshAt, dir: m.swooshDirection, gain: m.swooshGain ?? 0.8 });
  // an „sweep“-Grenzen kein zusätzlicher Band-Wischer: der Lichtstreif ist das einzige Lichtereignis (sonst milchig-weiß)
  return cands.find((c) => f >= c.at - 1 && f <= c.at + SWOOSH_DUR + 1);
};

const Backdrop: React.FC<{ f: number }> = ({ f }) => {
  const { a, b, t } = moodAt(f);
  const mix = (k: "ribbons" | "warm" | "particles" | "tint" | "lift") => (b ? moodMix(a[k], b[k], t) : a[k]);
  const sw = swooshFor(f, [a, b]);
  const common = {
    frame: f,
    ribbons: mix("ribbons"),
    warm: mix("warm"),
    particles: mix("particles"),
    tint: mix("tint"),
    lift: mix("lift"),
    swooshAt: sw?.at,
    swooshDuration: SWOOSH_DUR,
    swooshDirection: sw?.dir ?? "up",
    swooshGain: sw?.gain ?? 1,
  };
  // gleiche Anordnung → ein Hintergrund; sonst zwei überblenden
  if (!b || b.layout === a.layout) return <NeonBackground {...common} layout={a.layout} />;
  const s = moodMix(0, 1, t);
  return (
    <>
      {/* unten deckend, oben mit Deckkraft s (der Hintergrund ist selbst deckend) – sonst sackt die Helligkeit in der Mitte ab */}
      {s < 0.999 ? <NeonBackground {...common} layout={a.layout} /> : null}
      {s > 0.001 ? (
        <AbsoluteFill style={{ opacity: s }}>
          <NeonBackground {...common} layout={b.layout} />
        </AbsoluteFill>
      ) : null}
    </>
  );
};

const zoomy = (id: SceneId | undefined) => id !== undefined && (TRANSITION[id] === "zoom" || TRANSITION[id] === "sweep");

/** Eine Szene in ihrem Fenster, mit Kreuz-Zoom an „zoom“/„sweep“-Grenzen */
const SceneLayer: React.FC<{ i: number; f: number }> = ({ i, f }) => {
  const sc = SCENES[i];
  const { from, to } = S[sc.id];
  if (f < from - LEAD || f >= to + TAIL) return null;
  const next = SCENES[i + 1]?.id;
  let t = 0;
  if (f < (from + to) / 2) {
    if (i > 0 && zoomy(sc.id)) t = zoomCross(f, from, ZOOM_DUR).in;
  } else if (zoomy(next)) {
    t = zoomCross(f, to, ZOOM_DUR).out;
  }
  const Comp = sc.Comp;
  if (t === 0) {
    return (
      <AbsoluteFill>
        <Comp f={f} />
      </AbsoluteFill>
    );
  }
  return (
    <ZoomThrough t={t} ghosts={2}>
      <Comp f={f} />
    </ZoomThrough>
  );
};

const Sweeps: React.FC<{ f: number }> = ({ f }) => (
  <>
    {SWEEPS.map((b) =>
      f >= b - SWEEP_HALF && f <= b + SWEEP_HALF ? <FlashSweep key={b} progress={invLerp(b - SWEEP_HALF, b + SWEEP_HALF, f)} flash={0.18} intensity={0.6} width={440} /> : null,
    )}
  </>
);

export const Film: React.FC = () => {
  const f = useAbsFrame();
  return (
    <>
      <Backdrop f={f} />
      {SCENES.map((sc, i) => (
        <SceneLayer key={sc.id} i={i} f={f} />
      ))}
      <Sweeps f={f} />
      <NeonVignette strength={0.45} />
      <NeonGrain frame={f} opacity={0.04} />
    </>
  );
};

export const VideoContent: React.FC<{ withAudio?: boolean }> = ({ withAudio = true }) => (
  <AbsoluteFill style={{ backgroundColor: INK, fontFamily, overflow: "hidden" }}>
    <FontGate>
      <Film />
      {withAudio ? <AudioLayer /> : null}
    </FontGate>
  </AbsoluteFill>
);

export const VereinsFlowReel60Neon: React.FC = () => <VideoContent />;

/** Einzelne Szene als eigene Komposition (Vorschau im Studio, gleiche Bilder wie im Film) */
export const SceneClip: React.FC<{ id: SceneId; pre?: number }> = ({ id, pre = LEAD }) => (
  <ShowFrame frame={S[id].from - pre}>
    <VideoContent withAudio={false} />
  </ShowFrame>
);
