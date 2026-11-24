/**
 * Übergänge im Neon-Stil (alle nur aus Fortschrittswerten – Aufrufer steuert die Zeit).
 *
 *   FlashSweep    schräges Lichtband fegt über das Bild (weißer Kern, Himmel, Vereinsblau; optional orange Vorderkante),
 *                 dazu kurzes Aufhellen des ganzen Bilds – als Overlay ÜBER beide Szenen legen, Schnitt bei progress ≈ 0,5
 *   ZoomThrough   Szene fährt durch die Kamera (t 0 → 1: wird groß, unscharf, blendet aus) oder kommt aus der Tiefe
 *                 (t −1 → 0: klein, unscharf → scharf); mit Zoom-Geistern als Bewegungsunschärfe
 *   GlowDissolve  Szene glüht kurz auf (Bloom) und sinkt ins Dunkel (t 0 → 1)
 *   Echo          Echo-Geister einer Bewegung (wie AE „Echo“, Referenz t01.25/t03.25): render(f) wird für frühere
 *                 Frames halbtransparent wiederholt
 *
 *   zoomCross(f, cut, 14) → { out, in }: alte Szene fährt durch die Kamera (out 0 → 1), die neue kommt schon vorher aus
 *   der Tiefe (in −1 → 0) – beide überlappen, am Schnitt ist das Bild nie leer:
 *   <ZoomThrough t={zoomCross(f, cut).out}><Alt /></ZoomThrough>  <ZoomThrough t={zoomCross(f, cut).in}><Neu /></ZoomThrough>
 *   (alte Szene bis cut + 0,2·dur zeigen, neue ab cut − 0,4·dur)
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import { H, W } from "../theme";
import { NEON, rgba } from "./palette";
import { clamp01, easeIn, easeOut, invLerp, lerp, smooth, smoothstep, useF } from "./util";

/** Kreuz-Zoom an einem Schnitt (überlappend, kein leerer Frame). */
export const zoomCross = (f: number, cut: number, dur = 14) => ({
  out: easeIn(invLerp(cut - dur * 0.65, cut + dur * 0.15, f), 2),
  in: -(1 - easeOut(invLerp(cut - dur * 0.35, cut + dur * 0.65, f), 3)),
});

/** Abgang vor einem Schnitt: 0 … 1 in den letzten `dur` Frames (beschleunigt). */
export const exitT = (f: number, cut: number, dur = 10) => easeIn(invLerp(cut - dur, cut, f), 2);
/** Auftritt nach einem Schnitt: −1 … 0 in den ersten `dur` Frames (bremst ab). */
export const enterT = (f: number, cut: number, dur = 12) => -(1 - easeOut(invLerp(cut, cut + dur, f), 3));

export type FlashSweepProps = {
  /** 0..1 – Band läuft einmal durch (0,5 = Mitte des Bilds) */
  progress: number;
  /** Neigung in Grad (0 = waagerechtes Band, das nach oben läuft) */
  angle?: number;
  /** Bandbreite (px) */
  width?: number;
  intensity?: number;
  /** Aufhellen des ganzen Bilds in der Mitte des Durchlaufs (0..1) */
  flash?: number;
  /** dünne orange Vorderkante */
  accent?: boolean;
};

export const FlashSweep: React.FC<FlashSweepProps> = ({ progress, angle = -24, width = 560, intensity = 1, flash = 0.6, accent = true }) => {
  const p = clamp01(progress);
  if (p <= 0.001 || p >= 0.999) return null;
  const diag = Math.hypot(W, H);
  const travel = diag + width * 2;
  // Bandmitte entlang der Normalen, von unten links nach oben rechts
  const d = lerp(travel / 2, -travel / 2, smooth(p));
  const k = intensity;
  const env = Math.sin(Math.PI * p);
  // Lichtband ohne Plateau: schmaler heißer Kern, weiter, weicher Hof (Gauß-ähnliche Stopps statt Weichzeichner)
  const band = `linear-gradient(180deg,
    ${rgba(NEON.blue, 0)} 0%,
    ${rgba(NEON.blue, 0.07 * k)} 14%,
    ${rgba(NEON.blue, 0.2 * k)} 28%,
    ${rgba(NEON.sky, 0.36 * k)} 39%,
    ${rgba(NEON.ice, 0.62 * k)} 46.5%,
    ${rgba("#FFFFFF", 0.78 * k)} 50%,
    ${rgba(NEON.ice, 0.62 * k)} 53.5%,
    ${rgba(NEON.sky, 0.36 * k)} 61%,
    ${rgba(NEON.blue, 0.2 * k)} 72%,
    ${rgba(NEON.blue, 0.07 * k)} 86%,
    ${rgba(NEON.blue, 0)} 100%)`;
  // entlang des Bands: Mitte hell, Enden blenden aus (sonst wirkt es wie ein Balken)
  const along = `linear-gradient(90deg, rgba(0,0,0,0) 18%, #000 40%, #000 60%, rgba(0,0,0,0) 82%)`;
  return (
    <AbsoluteFill style={{ pointerEvents: "none", overflow: "hidden", mixBlendMode: "screen" }}>
      {flash > 0 ? (
        <AbsoluteFill
          style={{
            background: `radial-gradient(85% 60% at 50% 50%, ${rgba(NEON.sky, 0.24 * flash * env)} 0%, ${rgba(NEON.blue, 0.14 * flash * env)} 55%, ${rgba(NEON.blue, 0.04 * flash * env)} 100%)`,
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          left: W / 2 - diag,
          top: H / 2 - width / 2,
          width: diag * 2,
          height: width,
          transform: `rotate(${angle}deg) translateY(${d.toFixed(2)}px)`,
          transformOrigin: "50% 50%",
          background: band,
          maskImage: along,
          WebkitMaskImage: along,
        }}
      />
      {accent ? (
        // dünne orange Vorderkante (Leitfarbe), weich statt Strich
        <div
          style={{
            position: "absolute",
            left: W / 2 - diag,
            top: H / 2 - 7,
            width: diag * 2,
            height: 14,
            transform: `rotate(${angle}deg) translateY(${(d - width * 0.4).toFixed(2)}px)`,
            transformOrigin: "50% 50%",
            background: `linear-gradient(180deg, ${rgba(NEON.orange, 0)} 0%, ${rgba(NEON.orange, 0.5 * k)} 42%, ${rgba("#FFD9C7", 0.75 * k)} 50%, ${rgba(NEON.orange, 0.5 * k)} 58%, ${rgba(NEON.orange, 0)} 100%)`,
            // nur ein kurzes Aufblitzen in der Bildmitte (±300 px), keine durchgehende Laserlinie
            maskImage: `linear-gradient(90deg, rgba(0,0,0,0) 42.5%, #000 49%, #000 51%, rgba(0,0,0,0) 57.5%)`,
            WebkitMaskImage: `linear-gradient(90deg, rgba(0,0,0,0) 42.5%, #000 49%, #000 51%, rgba(0,0,0,0) 57.5%)`,
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
};

export type ZoomThroughProps = {
  /** −1 … 0 Auftritt aus der Tiefe, 0 ruhig, 0 … 1 Abgang durch die Kamera */
  t: number;
  /** Fluchtpunkt (Videoraum) */
  origin?: { x: number; y: number };
  /** Zoom-Geister (Bewegungsunschärfe), 0 = keine */
  ghosts?: number;
  /** Maßstab am Ende des Abgangs */
  maxScale?: number;
  /** Maßstab am Anfang des Auftritts */
  minScale?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
};

const zoomLook = (t: number, maxScale: number, minScale: number) => {
  if (t > 0) {
    const x = clamp01(t);
    return { scale: 1 + (maxScale - 1) * Math.pow(x, 1.6), blur: 26 * x, opacity: 1 - Math.pow(x, 1.3), bright: 1 + 0.5 * x };
  }
  const x = clamp01(-t);
  return { scale: lerp(1, minScale, Math.pow(x, 1.2)), blur: 20 * x, opacity: 1 - Math.pow(x, 1.6), bright: 1 + 0.35 * x };
};

export const ZoomThrough: React.FC<ZoomThroughProps> = ({ t, origin = { x: W / 2, y: H / 2 }, ghosts = 2, maxScale = 3.2, minScale = 0.55, children, style }) => {
  const L = zoomLook(t, maxScale, minScale);
  if (L.opacity <= 0.002) return null;
  const layer = (sc: number, bl: number, op: number, key: string) => (
    <AbsoluteFill
      key={key}
      style={{
        transform: Math.abs(sc - 1) > 0.0005 ? `scale(${sc.toFixed(4)})` : undefined,
        transformOrigin: `${origin.x}px ${origin.y}px`,
        filter: [bl > 0.2 ? `blur(${bl.toFixed(2)}px)` : "", L.bright > 1.005 ? `brightness(${L.bright.toFixed(3)})` : ""].join(" ").trim() || undefined,
        opacity: op,
      }}
    >
      {children}
    </AbsoluteFill>
  );
  // Geister weich ein- und ausblenden (harte Schwelle machte das Bild in einem Frame weicher/heller); bei starker
  // Unschärfe sind sie unsichtbar und werden gar nicht erst gezeichnet (spart Renderzeit)
  const ghostK = smoothstep(0.02, 0.12, Math.abs(t)) * (1 - smoothstep(9, 15, L.blur));
  const out: React.ReactNode[] = [];
  if (ghostK > 0.01 && ghosts > 0) {
    for (let k = ghosts; k >= 1; k--) {
      // Geister liegen „zeitlich davor“: beim Abgang kleiner, beim Auftritt größer
      const tt = t > 0 ? Math.max(0, t - 0.09 * k) : Math.min(0, t + 0.09 * k);
      const G = zoomLook(tt, maxScale, minScale);
      out.push(layer(G.scale, G.blur + 4, L.opacity * (0.32 / k) * ghostK, `g${k}`));
    }
  }
  out.push(layer(L.scale, L.blur, L.opacity, "main"));
  return <AbsoluteFill style={{ ...style }}>{out}</AbsoluteFill>;
};

export type GlowDissolveProps = {
  /** 0 … 1 – glüht auf und sinkt ins Dunkel */
  t: number;
  /** weichgezeichnete Kopie als Bloom (verdoppelt den Inhalt) */
  bloom?: boolean;
  color?: string;
  children: React.ReactNode;
};

export const GlowDissolve: React.FC<GlowDissolveProps> = ({ t, bloom = true, color = NEON.blue, children }) => {
  const x = clamp01(t);
  const rise = smooth(x / 0.45) * (1 - smooth((x - 0.45) / 0.55));
  const fade = 1 - smooth((x - 0.3) / 0.7);
  if (fade <= 0.002) return null;
  const bright = 1 + 0.9 * rise;
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ opacity: fade, filter: x > 0.001 ? `brightness(${bright.toFixed(3)}) saturate(${(1 + 0.2 * rise).toFixed(3)})` : undefined }}>{children}</AbsoluteFill>
      {bloom && rise > 0.01 ? (
        <AbsoluteFill style={{ opacity: 0.75 * rise * fade, filter: `blur(${(18 + 30 * x).toFixed(1)}px) brightness(1.6)`, mixBlendMode: "screen" }}>{children}</AbsoluteFill>
      ) : null}
      {rise > 0.01 ? <AbsoluteFill style={{ background: `radial-gradient(70% 50% at 50% 50%, ${rgba(color, 0.3 * rise)} 0%, ${rgba(color, 0)} 75%)`, mixBlendMode: "screen" }} /> : null}
    </AbsoluteFill>
  );
};

export type EchoProps = {
  frame?: number;
  /** Zahl der Geister */
  count?: number;
  /** Frames zwischen den Geistern */
  step?: number;
  /** Deckkraft-Faktor je Geist */
  decay?: number;
  /** Geister additiv (screen) statt normal */
  additive?: boolean;
  render: (f: number) => React.ReactNode;
};

export const Echo: React.FC<EchoProps> = ({ frame, count = 3, step = 2, decay = 0.45, additive = true, render }) => {
  const f = useF(frame);
  const ghosts: React.ReactNode[] = [];
  for (let k = count; k >= 1; k--) {
    ghosts.push(
      <AbsoluteFill key={k} style={{ opacity: Math.pow(decay, k), mixBlendMode: additive ? "screen" : undefined }}>
        {render(f - k * step)}
      </AbsoluteFill>,
    );
  }
  return (
    <AbsoluteFill>
      {ghosts}
      <AbsoluteFill>{render(f)}</AbsoluteFill>
    </AbsoluteFill>
  );
};
