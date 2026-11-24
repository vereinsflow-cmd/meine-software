/**
 * Titelbild (1080 × 1920): der Tunnel aus App-Seiten mit „Vereinsarbeit ist Ehrenamt.“ – das stärkste Neon-Bild des
 * Films, Text in der Bildmitte (übersteht auch den 4:5-Ausschnitt im Profilraster). Gleiche Bilder wie im Video.
 */
import React from "react";
import { ShowFrame } from "./lib/scene";
import { T as SCH } from "./scenes/leitsatz/zeit";
import { VideoContent } from "./Video";

/** „Ehrenamt.“ ist ganz da (Wort + Auftritt) */
export const COVER_FRAME = SCH.satz1[2] + 8;

export const Cover: React.FC = () => (
  <ShowFrame frame={COVER_FRAME}>
    <VideoContent withAudio={false} />
  </ShowFrame>
);
