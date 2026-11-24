/**
 * Szene „frage“ (240–300, Vorbild t04.75–t05.25): Das Chaos verschwimmt nach hinten, die gläserne Eingabe des
 * Gruppenchats („Eltern D-Jugend“) gleitet in die Mitte, „Und wer kommt am Donnerstag?“ tippt sich (zweizeilig, groß) im
 * Takt der Stimme ein – die nächste Rundfrage im Chat, keine Frage an die App. Knapp vor der Stimme, damit die fertige
 * Frage vor dem Sweep noch ≈ 8 Frames steht; erst dann wird der Senden-Knopf aktiv. Ruhig, klar.
 * Auftritt per Zoom aus „problem“, Abgang per „sweep“ zu „mitglieder“ (beides Video.tsx).
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import { S } from "../film";
import { cue } from "../lib/timeline";
import { Layer3D, NEON, NeonScene3D, clamp01, easeOut, invLerp, lerp, smooth } from "../neon";
import { GLIDE, sp } from "../springs";
import { FRAGE_BAR_H, FRAGE_BAR_W, FrageBar } from "./frage/leiste";
import { typedAt, wordKeyTimes } from "./hook/tippen";
import { BokehDot, CHAT, ChatBubble, SHEET_H, SHEET_W, SheetCard } from "./problem/karten";
import type { NeonScene } from "./types";

const Q = "Und wer kommt am Donnerstag?";
const Q_KEYS = ["und", "wer", "kommt", "am", "donnerstag"];
/** je Wort 4 Frames vor dem Wortanfang, höchstens 0,75 Frames je Zeichen → fertig bei ≈ 286 (Sweep ab 292) */
const Q_TIMES = wordKeyTimes(
  Q,
  Q_KEYS.map((k) => cue(k, { section: 2 })),
  4,
  0.75,
);
const Q_DONE = Q_TIMES[Q_TIMES.length - 1];
/** Zeile 2 beginnt mit „Donnerstag?“ */
const Q_BREAK = Q.indexOf("Donnerstag");

const FrageComp: React.FC<{ f: number }> = ({ f }) => {
  const from = S.frage.from;
  // Leiste gleitet aus der Tiefe/von unten in die Mitte und dreht sich gerade (Kamera beruhigt sich)
  const g = sp(f, from - 8, GLIDE);
  const m = smooth(invLerp(from - 8, S.frage.to + 8, f));
  const cam = { orbitX: lerp(10, 2.5, g), orbitY: lerp(-12, -3, g) + lerp(0, 1.5, m), dolly: lerp(-140, 0, g) + lerp(0, 50, m) };
  const n = typedAt(Q_TIMES, f);
  const lastKey = n === 0 ? Q_TIMES[0] : Q_TIMES[n - 1];
  // Chaos dahinter: treibt nach hinten weg, wird dunkler und weicher
  const back = smooth(invLerp(from - 8, S.frage.to, f));
  const zBack = (z: number) => z + 160 - 560 * back;
  const opBack = 1 - 0.5 * back;
  return (
    <AbsoluteFill>
      <NeonScene3D camera={cam} focusZ={cam.dolly} dof={3.2} maxBlur={22} dim={0.5}>
        <Layer3D x={180} y={560} z={zBack(-520)} rotY={18} rotZ={-4} width={560} height={110} opacity={opBack}>
          <ChatBubble m={CHAT[0]} />
        </Layer3D>
        <Layer3D x={860} y={700} z={zBack(-760)} rotY={-20} rotZ={3} scale={0.8} width={SHEET_W} height={SHEET_H} opacity={opBack * 0.9}>
          <SheetCard index={2} tint={0.4} glow={0.4} />
        </Layer3D>
        <Layer3D x={840} y={1330} z={zBack(-420)} rotY={-14} rotZ={2} width={560} height={110} opacity={opBack}>
          <ChatBubble m={CHAT[3]} />
        </Layer3D>
        <Layer3D x={250} y={1420} z={zBack(-650)} rotY={16} rotZ={-3} width={560} height={110} opacity={opBack * 0.9}>
          <ChatBubble m={CHAT[1]} />
        </Layer3D>
        <Layer3D x={170} y={1640} z={-900} width={420} height={420} opacity={0.75}>
          <BokehDot size={420} color={NEON.blue} alpha={0.5} />
        </Layer3D>
        <Layer3D x={540} y={950} z={0} width={FRAGE_BAR_W} height={FRAGE_BAR_H} sharp noDim>
          <FrageBar f={f} text={Q} breakAt={Q_BREAK} shown={n} lastKey={lastKey} doneAt={Q_DONE} appear={clamp01(easeOut(invLerp(from - 7, from + 6, f)))} />
        </Layer3D>
      </NeonScene3D>
    </AbsoluteFill>
  );
};

export const frage: NeonScene = {
  id: "frage",
  Comp: FrageComp,
  mood: () => ({ layout: "drift", ribbons: 0.36, tint: 0.3, particles: 0.3 }),
};
