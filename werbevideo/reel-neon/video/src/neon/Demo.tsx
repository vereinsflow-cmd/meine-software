/**
 * Bewegungsprobe „Neon-Demo“ (150 Frames, 1080 × 1920): alle Bausteine hintereinander mit echten Übergängen –
 * Durchgehender Hintergrund mit Lichtwischer, Pille tippt → Zoom durch die Kamera (mit Echo) → Karten in Tiefenschärfe (Kamerafahrt, Glanzstreifen) → Lichtwischer →
 * Befehlsleiste (Tippen, Senden, Aufklappen, Antwortzeilen) → Zoom → Kennzahlen (Ring, Balken, Linie) → Tunnelwand
 * (schneller Umlauf mit Bewegungsunschärfe) → Glühen ins Dunkel → oranger Punkt fliegt ein, Logo, Bodenlicht.
 * Nur zur Kontrolle (Frame für Frame), nicht im Film.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { FontGate } from "../components/FontGate";
import { fontFamily } from "../fonts";
import { NeonBackground } from "./NeonBackground";
import { SceneCards, SceneCommand, SceneLogo, SceneMetrics, ScenePill, SceneWall } from "./Showcase";
import { Echo, FlashSweep, GlowDissolve, ZoomThrough, zoomCross } from "./Transitions";
import { invLerp } from "./util";

export const NEON_DEMO_FRAMES = 150;

/** Szene nur im Fenster [from, to) zeigen; lokaler Frame = f − from + offset */
const Window: React.FC<{ f: number; from: number; to: number; children: (local: number) => React.ReactNode; offset?: number }> = ({ f, from, to, offset = 0, children }) =>
  f >= from && f < to ? <AbsoluteFill>{children(f - from + offset)}</AbsoluteFill> : null;

const CUT_AB = 28;
const CUT_BC = 54;
const CUT_CD = 92;
const CUT_DE = 112;
const CUT_EF = 126;

export const NeonDemo: React.FC<{ frame?: number }> = ({ frame }) => {
  const cur = useCurrentFrame();
  const f = frame ?? cur;
  return (
    <AbsoluteFill style={{ background: "#04060D", fontFamily }}>
      <FontGate>
        {/* durchgehender Hintergrund (wie im Film: Video.tsx), am Anfang ein Lichtwischer; zum Logo Bänder nach unten */}
        <NeonBackground frame={f} layout="drift" ribbons={0.42} particles={0.3} swooshAt={0} swooshDuration={18} />
        {f >= CUT_EF - 6 ? (
          <AbsoluteFill style={{ opacity: invLerp(CUT_EF - 6, CUT_EF + 12, f) }}>
            <NeonBackground frame={f} layout="low" ribbons={0.42} particles={0.35} warm={0.4} lift={0.3} />
          </AbsoluteFill>
        ) : null}
        {/* A: Pille tippt, fliegt mit Echo-Geistern durch die Kamera */}
        <Window f={f} from={0} to={CUT_AB + 4}>
          {() => (
            <Echo frame={f} count={f > CUT_AB - 10 ? 2 : 0} step={2} decay={0.4} render={(ff) => (
              <ZoomThrough t={zoomCross(ff, CUT_AB).out} ghosts={1}>
                <ScenePill f={ff + 6} bg={false} />
              </ZoomThrough>
            )} />
          )}
        </Window>
        {/* B: Karten in Tiefenschärfe, kommen aus der Tiefe */}
        <Window f={f} from={CUT_AB - 6} to={CUT_BC} offset={10}>
          {(l) => (
            <ZoomThrough t={zoomCross(f, CUT_AB).in}>
              <SceneCards f={l} bg={false} />
            </ZoomThrough>
          )}
        </Window>
        {/* C: Befehlsleiste (Schnitt unter dem Lichtwischer) */}
        <Window f={f} from={CUT_BC} to={CUT_CD + 4} offset={48}>
          {(l) => (
            <ZoomThrough t={zoomCross(f, CUT_CD).out} ghosts={2}>
              <SceneCommand f={l} bg={false} />
            </ZoomThrough>
          )}
        </Window>
        {/* D: Kennzahlen */}
        <Window f={f} from={CUT_CD - 6} to={CUT_DE + 4} offset={20}>
          {(l) => (
            <ZoomThrough t={f < CUT_DE - 10 ? zoomCross(f, CUT_CD).in : zoomCross(f, CUT_DE).out}>
              <SceneMetrics f={l} bg={false} />
            </ZoomThrough>
          )}
        </Window>
        {/* E: Tunnelwand, schneller Umlauf */}
        <Window f={f} from={CUT_DE - 6} to={CUT_EF + 10} offset={6}>
          {(l) => (
            <GlowDissolve t={invLerp(CUT_EF - 4, CUT_EF + 10, f)}>
              <ZoomThrough t={zoomCross(f, CUT_DE).in}>
                <SceneWall f={l} bg={false} />
              </ZoomThrough>
            </GlowDissolve>
          )}
        </Window>
        {/* F: Punkt fliegt ein, Logo, Bodenlicht */}
        <Window f={f} from={CUT_EF} to={NEON_DEMO_FRAMES} offset={10}>
          {(l) => (
            <AbsoluteFill style={{ opacity: invLerp(CUT_EF, CUT_EF + 6, f) }}>
              <SceneLogo f={l} bg={false} />
            </AbsoluteFill>
          )}
        </Window>
        {/* Lichtwischer über dem Schnitt B → C */}
        <FlashSweep progress={invLerp(CUT_BC - 7, CUT_BC + 7, f)} />
      </FontGate>
    </AbsoluteFill>
  );
};

/** Prüfbogen: mehrere Frames der Demo als Raster (z. B. --props='{"frames":[0,10,20],"cols":3}'). */
export const NeonDemoSheet: React.FC<{ frames: number[]; cols?: number; scale?: number }> = ({ frames, cols = 4, scale = 0.25 }) => {
  const w = 1080 * scale;
  const h = 1920 * scale;
  return (
    <AbsoluteFill style={{ background: "#000", fontFamily }}>
      {frames.map((fr, i) => (
        <div key={i} style={{ position: "absolute", left: (i % cols) * w, top: Math.floor(i / cols) * (h + 34), width: w, height: h + 34, overflow: "hidden" }}>
          <div style={{ position: "absolute", left: 0, top: 0, width: 1080, height: 1920, transform: `scale(${scale})`, transformOrigin: "0 0", overflow: "hidden" }}>
            <NeonDemo frame={fr} />
          </div>
          <div style={{ position: "absolute", left: 0, top: h, width: w, height: 34, color: "#fff", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", background: "#111" }}>Frame {fr}</div>
        </div>
      ))}
    </AbsoluteFill>
  );
};
