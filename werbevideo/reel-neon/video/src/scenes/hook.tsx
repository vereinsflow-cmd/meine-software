/**
 * Szene „hook“ (0–75, Vorbild t00.25–t02.75): Lichtbänder fegen durchs Bild, der orange VereinsFlow-Punkt fliegt herein
 * und zündet an der linken Spitze den Umriss der Pille; „Ihr Verein läuft / immer noch / über Excel?“ tippt sich dreizeilig
 * im Takt der Stimme ein (die Pille wächst nach unten, die ganze Frage steht groß im Bild); nach dem „?“ steht sie kurz,
 * dann schrumpft sie zur gleich umbrochenen kleinen Mittelzeile (hook/pille.tsx).
 * Übergabe an „problem“ per „cut“: ab HANDOVER (erster problem-Frame) zeichnet problem dieselbe Pille weiter.
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import { DotBurst, clamp01, easeInOut, invLerp, lerp, smooth } from "../neon";
import { HANDOVER, HOOK_TIMES, ShrinkingPill, pillGeometry } from "./hook/pille";
import type { NeonScene } from "./types";

const T0 = HOOK_TIMES[0];
/** Punkt landet an der linken Spitze der Pille, kurz bevor der Umriss sich zeichnet */
const LAND = T0 - 3;

const HookComp: React.FC<{ f: number }> = ({ f }) => {
  // Schnitt zu „problem“: ab HANDOVER zeichnet problem die Pille (gleiche Funktion von f → nahtlos)
  if (f >= HANDOVER) return null;
  const g = pillGeometry(f);
  // Punkt: Flug von unten links auf die Pillenspitze, Blitz beim Landen, dann reitet er auf der Spitze mit aus dem Bild
  const fly = easeInOut(invLerp(-2, LAND, f));
  const tip = { x: g.left + 4, y: g.tipY };
  const path = [
    { x: -150, y: 1640 },
    { x: 250, y: 1370 },
    { x: 300, y: 1080 },
    { x: tip.x + 40, y: tip.y + 40 },
    tip,
  ];
  const settle = smooth(invLerp(LAND, LAND + 18, f));
  const fade = 1 - smooth(invLerp(LAND + 14, LAND + 30, f));
  return (
    <AbsoluteFill>
      <ShrinkingPill f={f} />
      {fade > 0.002 ? (
        <DotBurst
          frame={f}
          path={path}
          pathProgress={fly}
          trail={f < LAND ? 0.26 : 0}
          size={lerp(30, 22, settle)}
          glow={lerp(1.25, 0.6, settle)}
          flare={lerp(0.95, 0.3, settle)}
          rays={lerp(0.8, 0.2, settle)}
          burst={clamp01(invLerp(LAND, LAND + 26, f))}
          opacity={fade * smooth(invLerp(-2, 2, f))}
        />
      ) : null}
    </AbsoluteFill>
  );
};

export const hook: NeonScene = {
  id: "hook",
  Comp: HookComp,
  // Opener: große Lichtseide mit Wischer, dann gedämpft, sobald die Pille steht
  mood: (f) => ({
    layout: "hero",
    ribbons: lerp(1, 0.34, smooth(invLerp(4, 26, f))),
    tint: 0.3,
    particles: 0.42,
    swooshAt: -4,
    swooshDirection: "up",
  }),
};
