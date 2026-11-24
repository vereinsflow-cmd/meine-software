/**
 * Endkarte: Aufruf-Pille tippt „Jetzt Demo anfragen“ im Takt der Stimme, der Punkt tippt darauf (Druck, Lichtring),
 * der Knopf leuchtet auf; darunter „vereins-flow.com“ und klein „Link in der Bio“.
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import { GlowText, NEON, clamp01, easeOut, invLerp, lerp, rgba, smooth } from "../../neon";
import { press } from "../../ui/motion";
import { L, T } from "../leitsatz/zeit";
import { tippPunkt } from "../logo/LogoBild";
import { CtaPill } from "./CtaPill";

/** Lichtring vom Tipp-Punkt (läuft über die Pille hinaus) */
const TippRing: React.FC<{ f: number }> = ({ f }) => {
  const t = invLerp(T.tipp, T.tipp + 18, f);
  if (t <= 0.001 || t >= 0.999) return null;
  const p = tippPunkt();
  const d = lerp(40, 400, easeOut(t, 3));
  const a = Math.pow(1 - t, 2);
  return (
    <div
      style={{
        position: "absolute",
        left: p.x - d / 2,
        top: p.y - d / 2,
        width: d,
        height: d,
        borderRadius: "50%",
        mixBlendMode: "screen",
        background: `radial-gradient(circle closest-side, ${rgba(NEON.sky, 0)} 62%, ${rgba(NEON.sky, 0.12 * a)} 80%, ${rgba("#FFFFFF", 0.42 * a)} 92%, ${rgba(NEON.orange, 0.26 * a)} 97%, ${rgba(NEON.orange, 0)} 100%)`,
      }}
    />
  );
};

export const EndBild: React.FC<{ f: number }> = ({ f }) => {
  const druck = press(f, T.tipp - 1, 4);
  const active = smooth(invLerp(T.tipp + 1, T.tipp + 12, f));
  const cursorOn = 1 - clamp01(invLerp(T.tipp, T.tipp + 3, f));
  return (
    <AbsoluteFill>
      <CtaPill f={f} press={druck} active={active} cursorOn={cursorOn} sheen={invLerp(T.tipp + 30, T.tipp + 54, f)} />
      <TippRing f={f} />
      {f >= T.adresse - 2 ? (
        <div style={{ position: "absolute", left: 60, right: 60, top: L.adresseY, height: 0, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <GlowText text="vereins-flow.com" frame={f} start={T.adresse} reveal={16} fontSize={50} weight={800} color={NEON.ice} glow={0.7} flare={0.9} mode="rise" style={{ whiteSpace: "nowrap" }} />
        </div>
      ) : null}
      {f >= T.bio - 2 ? (
        <div style={{ position: "absolute", left: 60, right: 60, top: L.bioY, height: 0, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <GlowText text="Link in der Bio" frame={f} start={T.bio} stagger={3} reveal={14} fontSize={36} weight={500} color={NEON.mist} glow={0.25} flare={0.4} mode="blur" style={{ whiteSpace: "nowrap" }} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
