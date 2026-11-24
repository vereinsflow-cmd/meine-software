/**
 * Absolute Frames in Szenen.
 *
 * Szenen rechnen mit ABSOLUTEN Frames (wie cue() sie liefert). Video.tsx legt jede Szene in eine
 * <AbsSequence>, die den Versatz per Kontext weitergibt. Wird eine Szene einzeln als Komposition
 * geöffnet, setzt <SceneRoot id=…> den Versatz auf sceneFrom(id) – dieselbe Szene zeigt dann
 * exakt dieselben Bilder.
 */
import React, { createContext, useContext } from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { FontGate } from "../components/FontGate";
import { fontFamily } from "../fonts";
import { FPS, SceneId, sceneFrom } from "./timeline";

const SceneOffsetContext = createContext<number | null>(null);

/** Absoluter Video-Frame (0…1799), egal wie tief in Sequenzen verschachtelt. */
export const useAbsFrame = () => {
  const frame = useCurrentFrame();
  const offset = useContext(SceneOffsetContext);
  return frame + (offset ?? 0);
};

/** <Sequence>, deren `from` als absoluter Frame angegeben wird. */
export const AbsSequence: React.FC<{
  from: number;
  durationInFrames: number;
  name?: string;
  children: React.ReactNode;
  premount?: boolean;
}> = ({ from, durationInFrames, name, children, premount = true }) => {
  const offset = useContext(SceneOffsetContext) ?? 0;
  return (
    <Sequence from={from - offset} durationInFrames={Math.max(1, durationInFrames)} name={name} premountFor={premount ? FPS : undefined}>
      <SceneOffsetContext.Provider value={from}>{children}</SceneOffsetContext.Provider>
    </Sequence>
  );
};

/** Wurzel jeder Szene: Schrift, Vollfläche, Versatz für Einzel-Vorschau. */
export const SceneRoot: React.FC<{
  id: SceneId;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ id, children, style }) => {
  const offset = useContext(SceneOffsetContext);
  const body = (
    <AbsoluteFill style={{ fontFamily, overflow: "hidden", ...style }}>
      <FontGate>{children}</FontGate>
    </AbsoluteFill>
  );
  if (offset !== null) return body;
  return <SceneOffsetContext.Provider value={sceneFrom(id)}>{body}</SceneOffsetContext.Provider>;
};

/**
 * Für Standbilder (<Still>, Dauer 1 Frame): verschiebt die ganze Zeitachse, sodass
 * useAbsFrame() den gewünschten Video-Frame liefert. (<Freeze> würde auf die 1-Frame-Dauer
 * der Still-Komposition geklemmt.)
 */
export const ShowFrame: React.FC<{
  frame: number;
  children: React.ReactNode;
}> = ({ frame, children }) => <SceneOffsetContext.Provider value={frame}>{children}</SceneOffsetContext.Provider>;
