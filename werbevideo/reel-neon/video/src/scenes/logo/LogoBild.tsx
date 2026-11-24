/**
 * Logo: der Punkt zündet dort, wo die Wand verschwunden ist, Lichtbänder kreisen ruhig um ihn, auf „VereinsFlow“
 * springt er ins V, um ihn herum baut sich das Logo auf (LogoReveal) über dem Lichtboden; darunter „Bringt
 * Vereinsarbeit in Fluss“ Wort für Wort. In der Endkarte gleitet die Gruppe hoch, der Punkt fliegt zur Aufruf-Pille,
 * tippt und geht im Knopf auf (das Logo behält seinen flachen Punkt).
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import { DotBurst, GlowText, LightFloor, LogoReveal, NEON, clamp01, easeInOut, easeOut, fadeIn, invLerp, lerp, logoDotPosition, rgba, smooth } from "../../neon";
import type { Pt } from "../../neon";
import { GLIDE, SNAP, sp } from "../../springs";
import { ctaFinal } from "../endkarte/CtaPill";
import { L, T } from "../leitsatz/zeit";
import { Orbits } from "./Orbits";

/** Gruppenversatz: während der Logo-Szene tiefer, zur Endkarte gleitet alles hoch */
export const gruppeDy = (f: number) => L.gruppeDy * (1 - clamp01(sp(f, T.hoch, GLIDE, { overshootClamping: true })));

/** Durchmesser des Punkts im V (Logo-Breite L.logoW) */
const DOT_D = logoDotPosition(L.cx, L.logoY, L.logoW).r * 2;

/** Tipp-Punkt auf der Pille (zwischen „Jetzt“ und „Demo“) */
export const tippPunkt = (): Pt => {
  const c = ctaFinal();
  return { x: c.left + c.width * 0.33, y: L.pilleY + 4 };
};

const landung = T.flugStart + T.flugDauer;
const tippAnkunft = T.tipp - 2;

/** Lage, Größe und Leuchten des Punkts zum Frame */
const punkt = (f: number) => {
  const dy = gruppeDy(f);
  const v = logoDotPosition(L.cx, L.logoY + dy, L.logoW);
  const vPt = { x: v.x, y: v.y };
  // Zündung: aus dem Nichts mit Überschwingen
  const zuend = clamp01(sp(f, T.zuend, { damping: 11, stiffness: 160, mass: 0.7 }));
  let pos: Pt = L.mitte;
  let trail = 0;
  let path: Pt[] | null = null;
  let prog = 0;
  if (f >= T.flugStart && f < landung) {
    // Sprung ins V: kleiner Bogen nach oben
    path = [L.mitte, { x: lerp(L.mitte.x, vPt.x, 0.38), y: Math.min(L.mitte.y, vPt.y) - 70 }, { x: lerp(L.mitte.x, vPt.x, 0.78), y: vPt.y - 46 }, vPt];
    prog = easeInOut(invLerp(T.flugStart, landung, f));
    trail = 0.26;
  } else if (f >= landung && f < T.tippFlug) {
    pos = vPt;
  } else if (f >= T.tippFlug && f < tippAnkunft) {
    // Flug zur Pille: links am Claim vorbei, von unten links heran
    const tp = tippPunkt();
    path = [vPt, { x: 66, y: L.claimY + 26 }, { x: 150, y: L.pilleY + 52 }, tp];
    prog = easeInOut(invLerp(T.tippFlug, tippAnkunft, f));
    trail = 0.14;
  } else if (f >= tippAnkunft) {
    pos = tippPunkt();
  }
  if (f < T.flugStart) pos = L.mitte;
  // Leuchten: hell bei Zündung und Flug, ruhig im Logo
  const ruhig = smooth(invLerp(landung, landung + 34, f));
  // Flug zur Pille: beim Vorbeiflug am Claim leise (kein Lichtstreifen über der Schrift), hell erst auf dem Tipp
  const inFlug2 = f >= T.tippFlug && f < tippAnkunft;
  const flugBogen = inFlug2 ? Math.sin(Math.PI * prog) : 0;
  const leise = inFlug2 ? Math.sin(Math.PI * clamp01(prog / 0.8)) : 0;
  const flug2 = Math.sin(Math.PI * invLerp(T.tipp - 7, T.tipp + 7, f));
  const glow = lerp(1.35, 0.55, ruhig) + 0.3 * flugBogen + 0.6 * flug2;
  const flare = (lerp(1, 0.24, ruhig) + 0.22 * flug2) * (1 - 0.85 * leise);
  const rays = (lerp(0.9, 0.2, ruhig) + 0.4 * flug2) * (1 - 0.6 * leise);
  // Größe: Zündung überschwingt, im Logo exakt der Logo-Punkt; beim Tipp eingedrückt, dann geht er im Knopf auf
  const druck = clamp01(sp(f, T.tipp - 1, SNAP, { overshootClamping: true })) - clamp01(sp(f, T.tipp + 3, SNAP, { overshootClamping: true }));
  const aufgehen = smooth(invLerp(T.tipp + 3, T.tipp + 14, f));
  const size = DOT_D * lerp(1.3, 1, smooth(invLerp(T.flugStart, landung + 4, f))) * zuend * (1 - 0.3 * druck) * (1 - 0.6 * aufgehen);
  const opacity = f < T.zuend ? 0 : 1 - aufgehen;
  // Landung im V: kurzer Puls
  const puls = Math.sin(Math.PI * clamp01((f - landung) / 10)) * (f >= landung ? 1 : 0);
  return { pos, path, prog, trail, glow, flare, rays, size, opacity, puls };
};

/** Zündblitz am Zündpunkt (ohne Ring – der Punkt bringt seinen eigenen Hof mit) */
const Zuendblitz: React.FC<{ f: number }> = ({ f }) => {
  const bu = invLerp(T.zuend, T.zuend + 18, f);
  if (bu <= 0.001 || bu >= 0.999) return null;
  const flash = bu < 0.12 ? bu / 0.12 : Math.pow(1 - (bu - 0.12) / 0.88, 2.2);
  const d = lerp(300, 560, easeOut(bu, 2));
  return (
    <div
      style={{
        position: "absolute",
        left: L.mitte.x - d / 2,
        top: L.mitte.y - d / 2,
        width: d,
        height: d,
        borderRadius: "50%",
        mixBlendMode: "screen",
        pointerEvents: "none",
        background: `radial-gradient(circle, ${rgba("#FFFFFF", 0.5 * flash)} 0%, ${rgba("#FFD2BC", 0.28 * flash)} 16%, ${rgba(NEON.blue, 0.14 * flash)} 42%, ${rgba(NEON.blue, 0)} 70%)`,
      }}
    />
  );
};

export const LogoBild: React.FC<{ f: number; dim?: number }> = ({ f, dim = 1 }) => {
  const dy = gruppeDy(f);
  const logoY = L.logoY + dy;
  const claimY = L.claimY + dy;
  // Lichtbänder um den Punkt: kommen mit dem Sog, ziehen sich zusammen, wenn der Punkt ins V springt
  const orbitIn = smooth(invLerp(T.sog + 5, T.sog + 13, f));
  const orbitOut = 1 - smooth(invLerp(T.flugStart, T.flugStart + 9, f));
  const wind = smooth(invLerp(T.sog + 5, T.flugStart + 6, f));
  return (
    <AbsoluteFill>
      <LightFloor frame={f} intensity={1.05 * fadeIn(f, T.logo + 2, 38) * dim} y={1650} width={1650} height={1150} />
      <Orbits f={f} x={L.mitte.x} y={L.mitte.y} intensity={0.9 * orbitIn * orbitOut} wind={wind} />
      <Zuendblitz f={f} />
      {f >= T.logo ? <LogoReveal frame={f} start={T.logo} x={L.cx} y={logoY} width={L.logoW} hideDot={f < landung} glow={0.85} /> : null}
      {f >= T.claim[0] - 2 ? (
        <div style={{ position: "absolute", left: 60, right: 60, top: claimY, height: 0, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <GlowText text="Bringt Vereinsarbeit in Fluss" frame={f} wordStarts={T.claim} reveal={14} fontSize={54} weight={500} color={NEON.ice} glow={0.62} flare={0.9} mode="blur" echo={2} style={{ whiteSpace: "nowrap" }} />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

/** Der Punkt als eigene, oberste Ebene (tippt auf die Pille, liegt also über der Endkarte) */
export const Punkt: React.FC<{ f: number }> = ({ f }) => {
  const p = punkt(f);
  if (p.opacity <= 0.002 || p.size <= 0.5) return null;
  return (
    <DotBurst
      frame={f}
      x={p.pos.x}
      y={p.pos.y}
      path={p.path ?? undefined}
      pathProgress={p.path ? p.prog : undefined}
      trail={p.trail}
      size={p.size}
      glow={p.glow}
      flare={p.flare}
      rays={p.rays}
      pulse={p.puls * 0.5}
      opacity={p.opacity}
    />
  );
};
