/**
 * Prüfbogen (nur zur Kontrolle, kein Teil des Spots): zeigt mehrere Video-Frames als Raster in
 * einem Standbild – z. B. alle Frames rund um einen Szenenübergang.
 *
 *   npx remotion still Pruefbogen out.png --props='{"frames":[1498,1500,1502],"cols":3,"scale":0.33}'
 */
import React from "react";
import { AbsoluteFill, CalculateMetadataFunction } from "remotion";
import { fontFamily } from "../fonts";
import { ShowFrame } from "../lib/scene";
import { VideoContent } from "../Video";

export type PruefbogenProps = { frames: number[]; cols: number; scale: number };

const LABEL = 44;

export const pruefbogenMetadata: CalculateMetadataFunction<PruefbogenProps> = ({ props }) => {
  const rows = Math.max(1, Math.ceil(props.frames.length / props.cols));
  return {
    width: Math.round(props.cols * 1080 * props.scale),
    height: Math.round(rows * (1920 * props.scale + LABEL)),
  };
};

export const Pruefbogen: React.FC<PruefbogenProps> = ({ frames, cols, scale }) => (
  <AbsoluteFill style={{ backgroundColor: "#202020", display: "flex", flexDirection: "row", flexWrap: "wrap", alignContent: "flex-start" }}>
    {frames.map((fr, i) => (
      <div key={`${fr}-${i}`} style={{ width: `${100 / cols}%`, height: 1920 * scale + LABEL, position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, width: 1080 * scale, height: 1920 * scale, overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
            <ShowFrame frame={fr}>
              <VideoContent withAudio={false} />
            </ShowFrame>
          </div>
        </div>
        <div style={{ position: "absolute", left: 10, top: 1920 * scale + 6, fontFamily, fontWeight: 800, fontSize: 28, color: "#EEE" }}>f{fr}</div>
      </div>
    ))}
  </AbsoluteFill>
);
