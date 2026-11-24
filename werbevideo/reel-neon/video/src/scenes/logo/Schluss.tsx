/**
 * Schluss des Films als EIN durchgehendes Bild (leitsatz → logo → endkarte, Übergaben „cut“): jede der drei Szenen
 * zeichnet es nur in ihrem eigenen Bereich [from, to) – in den Überlappungs-Frames (LEAD/TAIL) zeichnet genau eine,
 * so stimmen die Übergaben pixelgenau. Dazu die Stimmungen des Hintergrunds.
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import { S } from "../../film";
import { invLerp, lerp, smooth } from "../../neon";
import type { BackgroundMood } from "../types";
import { EndBild } from "../endkarte/EndBild";
import { LeitsatzBild } from "../leitsatz/LeitsatzBild";
import { T } from "../leitsatz/zeit";
import { LogoBild, Punkt } from "./LogoBild";

/** Letzte Frames: alles wird ruhig und dunkel (Loop zu Frame 0) */
export const abblenden = (f: number) => smooth(invLerp(T.abblenden, T.ende, f));

/** Allerletzte 10 Frames: der Inhalt blendet fast ganz aus. Den Hintergrund führt Video.tsx in dieser Zeit schon in die
 *  Stimmung von Frame 0 über (Hero-Bänder, Wischer beginnt) – so läuft der Loop ohne Helligkeitssprung weiter. */
export const schwarz = (f: number) => smooth(invLerp(T.ende - 10, T.ende - 1, f));

/** Ganz langsame Kamerafahrt auf Logo und Endkarte (ab dem Logo-Auftritt), damit das Bild auch in den Ruhephasen lebt */
const fahrt = (f: number) => 1 + 0.035 * smooth(invLerp(T.logo, T.ende, f));

export const Schluss: React.FC<{ f: number }> = ({ f }) => {
  const sw = schwarz(f);
  const dim = (1 - 0.74 * abblenden(f)) * (1 - 0.85 * sw);
  const s = fahrt(f);
  return (
    <AbsoluteFill>
      {f < T.zuend + 12 ? <LeitsatzBild f={f} /> : null}
      {f >= T.sog ? (
        <AbsoluteFill style={{ opacity: dim, transform: s > 1.00001 ? `scale(${s.toFixed(5)})` : undefined, transformOrigin: "540px 960px" }}>
          <LogoBild f={f} dim={dim} />
          {f >= T.tippen - 10 ? <EndBild f={f} /> : null}
          <Punkt f={f} />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

/** Schluss-Bild nur im Bereich [from, to) der Szene zeigen (Übergabe „cut“ ohne Doppelzeichnung) */
export const schlussIn = (id: "leitsatz" | "logo" | "endkarte") => {
  const Comp: React.FC<{ f: number }> = ({ f }) => {
    const first = id === "leitsatz";
    const last = id === "endkarte";
    if ((!first && f < S[id].from) || (!last && f >= S[id].to)) return null;
    return <Schluss f={f} />;
  };
  Comp.displayName = `Schluss-${id}`;
  return Comp;
};

// ---- Hintergrund ----------------------------------------------------------------------------
/** Leitsatz: Bänder am Rand, gedämpft – die Wand ist hell genug */
export const moodLeitsatz = (): BackgroundMood => ({ layout: "drift", ribbons: 0.28, particles: 0.22, tint: 0.32, warm: 0, lift: 0 });

/** Logo und Endkarte: Bänder unten, etwas Orange; in den letzten Frames ruhig und dunkel */
export const moodLogo = (f: number): BackgroundMood => {
  const k = abblenden(f);
  const sw = schwarz(f);
  return {
    layout: "low",
    ribbons: lerp(0.46, 0.16, k) * (1 - 0.6 * sw),
    particles: lerp(0.3, 0.1, k) * (1 - 0.6 * sw),
    tint: 0.34,
    warm: lerp(0.32, 0.12, k),
    lift: lerp(0.08, 0, k),
  };
};
