/** Kompositionen der Neon-Bausteine (Schaukasten zum Abgleich mit dem Referenzvideo). */
import React from "react";
import { Composition, Folder, Still } from "remotion";
import { NEON_DEMO_FRAMES, NeonDemo, NeonDemoSheet } from "./Demo";
import { CMD, COMPARE_H, COMPARE_W, Compare, HOOK, PILL, QUESTION, SCENES, SceneCards, SceneCommand, SceneHero, SceneLogo, SceneMetrics, ScenePill, SceneSheet, SceneWall, frameForChars } from "./Showcase";

/** Links Nachbau (Frame f der Szene), rechts das Referenzbild – je eine Tafel 2160 × 1920. */
const STILLS: { id: string; ref: string; label: string; Scene: React.FC<{ f: number }>; f: number }[] = [
  { id: "Neon-1", ref: "t13.25.jpg", label: "t13.25", Scene: SceneLogo, f: 66 },
  { id: "Neon-2", ref: "t02.75.jpg", label: "t02.75", Scene: ScenePill, f: frameForChars(PILL.typeStart, HOOK, PILL.cps, 13) + 2 },
  { id: "Neon-3", ref: "t04.25.jpg", label: "t04.25", Scene: SceneCards, f: 64 },
  { id: "Neon-4", ref: "t05.25.jpg", label: "t05.25", Scene: SceneCommand, f: frameForChars(CMD.typeStart, QUESTION, CMD.cps, 17) + 1 },
  { id: "Neon-5", ref: "t08.75.jpg", label: "t08.75", Scene: SceneMetrics, f: 60 },
  { id: "Neon-6", ref: "t09.75.jpg", label: "t09.75", Scene: SceneWall, f: 44 },
  { id: "Neon-7", ref: "t00.25.jpg", label: "t00.25", Scene: SceneHero, f: 26 },
];

const makeStill = (s: (typeof STILLS)[number]): React.FC<{ f?: number }> => {
  const C: React.FC<{ f?: number }> = ({ f }) => (
    <Compare refFile={s.ref} label={s.label}>
      <s.Scene f={f ?? s.f} />
    </Compare>
  );
  C.displayName = s.id;
  return C;
};

const COMPS = STILLS.map((s) => ({ ...s, component: makeStill(s) }));

export const NeonCompositions: React.FC = () => (
  <Folder name="Neon">
    {COMPS.map((s) => (
      <Still key={s.id} id={s.id} component={s.component} width={COMPARE_W} height={COMPARE_H} defaultProps={{ f: s.f }} />
    ))}
    {/* Bewegungsprobe aller Bausteine (Frame für Frame prüfen) */}
    <Composition id="Neon-Demo" component={NeonDemo} durationInFrames={NEON_DEMO_FRAMES} fps={30} width={1080} height={1920} />
    {/* Szenenbogen: eine Schaukasten-Szene zu mehreren Frames (Props scene, frames, cols, scale) */}
    <Still
      id="Neon-Szenenbogen"
      component={SceneSheet}
      width={1080}
      height={1936}
      calculateMetadata={({ props }) => {
        const cols = props.cols ?? 3;
        const sc = props.scale ?? 0.33;
        const rows = Math.ceil(props.frames.length / cols);
        return { width: Math.round(cols * 1080 * sc), height: Math.round(rows * (1920 * sc + 34)) };
      }}
      defaultProps={{ scene: "logo", frames: [10, 24, 34, 46, 60, 84], cols: 3, scale: 0.33 } as { scene: keyof typeof SCENES; frames: number[]; cols?: number; scale?: number }}
    />
    {/* Prüfbogen der Demo: Frames als Raster (Props frames, cols, scale) */}
    <Still
      id="Neon-Pruefbogen"
      component={NeonDemoSheet}
      width={1080}
      height={1936}
      calculateMetadata={({ props }) => {
        const cols = props.cols ?? 4;
        const sc = props.scale ?? 0.25;
        const rows = Math.ceil(props.frames.length / cols);
        return { width: Math.round(cols * 1080 * sc), height: Math.round(rows * (1920 * sc + 34)) };
      }}
      defaultProps={{ frames: [0, 12, 24, 30, 40, 52, 58, 70, 84, 96, 112, 120, 130, 140, 149], cols: 5, scale: 0.2 } as { frames: number[]; cols?: number; scale?: number }}
    />
  </Folder>
);
