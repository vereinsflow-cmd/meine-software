/**
 * CurvedWall – Paneele auf einem Zylinder um die Kamera (Referenz t09.25–t10.25): glühende Kanten, sattes Glas,
 * Tiefenschärfe aus der Bühne. Muss in einer <NeonScene3D> stehen (nutzt Layer3D).
 *
 *   axis "y"  Zylinder um die senkrechte Achse (Karussell; Kamera innen = Paneele rundherum links/rechts)
 *   axis "x"  Zylinder um die waagerechte Achse (Paneele über und unter der Kamera)
 *   axis "z"  Tunnel um die Blickachse: Paneele liegen längs an den Wänden (links, rechts, oben, unten) und fluchten
 *             zur Bildmitte – der „Kamera-im-Raum“-Blick aus t09.75; die Schrift steht auf den Seitenwänden quer
 *   rotation  Drehung der Wand um ihre Achse (Grad) – für den schnellen Umlauf (t10.25) blurSpan/samples setzen:
 *             jedes Paneel wird zusätzlich an früheren Winkeln halbtransparent gezeichnet (Bewegungsunschärfe)
 *   inside    Kamera innen (Paneele schauen zur Achse) oder außen (Paneele schauen nach außen)
 *
 *   <NeonScene3D focusZ={-300} dof={2.5}>
 *     <CurvedWall count={10} radius={900} panelWidth={640} panelHeight={420} axis="z" rotation={rot}
 *                 renderPanel={(i) => <MetricCard … />} />
 *   </NeonScene3D>
 */
import React from "react";
import { H, W } from "../theme";
import { NEON, rgba } from "./palette";
import { Layer3D } from "./Scene3D";

export type CurvedWallProps = {
  count: number;
  renderPanel: (i: number) => React.ReactNode;
  panelWidth: number;
  panelHeight: number;
  radius: number;
  /** nur axis "z": zweiter Radius (senkrecht) – ovaler Tunnel, im Hochformat höher als breit */
  radiusY?: number;
  /** Winkelabstand der Paneele (Grad), Standard 360 / count */
  step?: number;
  rotation?: number;
  axis?: "x" | "y" | "z";
  inside?: boolean;
  /** Mittelpunkt der Wand (Videoraum + Tiefe) */
  center?: { x?: number; y?: number; z?: number };
  /** Glühen der Paneelkanten 0..1,5 */
  edgeGlow?: number;
  /** Bewegungsunschärfe: Winkelspanne der Belichtung (Grad, in Drehrichtung zurück) und Zahl der Proben */
  blurSpan?: number;
  samples?: number;
  /** Paneele, die gerade hinter der Kamera/Wand liegen, ausblenden (nur axis y/x innen) */
  cull?: boolean;
  /** nur axis "z": Ende zur Kamera abdunkeln / fernes Ende abdunkeln (0..1), nahes Ende weichzeichnen (px) */
  nearDark?: number;
  fogFar?: number;
  nearBlur?: number;
  /** nur axis "z": Lichtkante am fernen Paneelende 0..1 (0 = keine; mit <TunnelMouth> entsteht dann ein runder Saum) */
  farEdge?: number;
  style?: React.CSSProperties;
};

type Placement = { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number; order: "xyz" | "zyx" };

const place = (axis: "x" | "y" | "z", inside: boolean, deg: number, R: number, cx: number, cy: number, cz: number, RY = R): Placement => {
  const t = (deg * Math.PI) / 180;
  if (axis === "y") {
    return inside
      ? { x: cx + R * Math.sin(t), y: cy, z: cz - R * Math.cos(t), rotX: 0, rotY: -deg, rotZ: 0, order: "xyz" }
      : { x: cx + R * Math.sin(t), y: cy, z: cz + R * Math.cos(t), rotX: 0, rotY: deg, rotZ: 0, order: "xyz" };
  }
  if (axis === "x") {
    return inside
      ? { x: cx, y: cy - R * Math.sin(t), z: cz - R * Math.cos(t), rotX: -deg, rotY: 0, rotZ: 0, order: "xyz" }
      : { x: cx, y: cy - R * Math.sin(t), z: cz + R * Math.cos(t), rotX: deg, rotY: 0, rotZ: 0, order: "xyz" };
  }
  // Tunnel: Paneel liegt längs (Breite entlang der Blickachse), Fläche zur Achse hin (Normale der Ellipse)
  const nAng = (Math.atan2(R * Math.sin(t), RY * Math.cos(t)) * 180) / Math.PI;
  return { x: cx + R * Math.cos(t), y: cy + RY * Math.sin(t), z: cz, rotX: 0, rotY: inside ? -90 : 90, rotZ: nAng, order: "zyx" };
};

export const CurvedWall: React.FC<CurvedWallProps> = ({
  count,
  renderPanel,
  panelWidth,
  panelHeight,
  radius,
  radiusY,
  step,
  rotation = 0,
  axis = "y",
  inside = true,
  center,
  edgeGlow = 1,
  blurSpan = 0,
  samples = 4,
  cull = true,
  nearDark = 0.55,
  fogFar = 0,
  nearBlur = 10,
  farEdge = 1,
  style,
}) => {
  const st = step ?? 360 / count;
  const cx = center?.x ?? W / 2;
  const cy = center?.y ?? H / 2;
  const cz = center?.z ?? 0;
  // Bewegungsunschärfe erst ab spürbarer Drehung; je ~6° Spanne eine Probe (höchstens `samples`) – langsame Drehung
  // kostet so nur 2 statt 5 Kopien. Geister zusätzlich weich, damit sie verschmieren statt zu doppeln.
  const n = blurSpan > 3 ? Math.min(Math.max(2, samples), 1 + Math.ceil(blurSpan / 6)) : 1;
  const gap = n > 1 ? (((blurSpan / (n - 1)) * Math.PI) / 180) * radius : 0;
  const smear = n > 1 ? Math.min(28, gap * 0.6) : 0;
  const layers: React.ReactNode[] = [];
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < n; k++) {
      const deg = rotation + i * st - (n > 1 ? (blurSpan * k) / (n - 1) : 0);
      const norm = ((deg % 360) + 540) % 360 - 180; // −180 … 180, 0 = vorn
      // innen: Paneele weit hinter der Kamera (|Winkel| > 120°) weglassen
      if (cull && inside && axis !== "z" && Math.abs(norm) > 125) continue;
      const pl = place(axis, inside, deg, radius, cx, cy, cz, radiusY ?? radius);
      const alpha = n > 1 ? (k === 0 ? 0.7 : 0.55 / (n - 1)) : 1;
      layers.push(
        <Layer3D
          key={`${i}-${k}`}
          x={pl.x}
          y={pl.y}
          z={pl.z}
          rotX={pl.rotX}
          rotY={pl.rotY}
          rotZ={pl.rotZ}
          order={pl.order}
          width={panelWidth}
          height={panelHeight}
          opacity={alpha}
          blur={k === 0 ? smear * 0.15 : smear}
          zBias={-k * 0.5}
          style={style}
        >
          {axis === "z" ? (
            // Geister sind schon weich: ohne zweite, weichgezeichnete Kopie (spart die Hälfte der Filter)
            <TunnelPanel width={panelWidth} height={panelHeight} glow={edgeGlow} nearDark={nearDark} fogFar={fogFar} nearBlur={k === 0 ? nearBlur : 0} farEdge={farEdge} near={inside ? "right" : "left"}>
              {renderPanel(i)}
            </TunnelPanel>
          ) : (
            <WallFrame width={panelWidth} height={panelHeight} glow={edgeGlow}>
              {renderPanel(i)}
            </WallFrame>
          )}
        </Layer3D>,
      );
    }
  }
  return <>{layers}</>;
};

/** Leuchtende Kante um ein Wandpaneel (liegt über dem Inhalt). */
export const WallFrame: React.FC<{ width: number; height: number; glow?: number; radius?: number; children?: React.ReactNode }> = ({ width, height, glow = 1, radius = 30, children }) => (
  <div style={{ position: "relative", width, height }}>
    {children}
    {glow > 0.01 ? (
      <div
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: radius,
          border: `2px solid ${rgba(NEON.sky, Math.min(1, 0.75 * glow))}`,
          boxShadow: `0 0 18px ${rgba(NEON.blue, 0.7 * glow)}, 0 0 60px ${rgba(NEON.blue, 0.35 * glow)}, inset 0 0 26px ${rgba(NEON.blue, 0.4 * glow)}`,
          pointerEvents: "none",
        }}
      />
    ) : null}
  </div>
);

/**
 * Tunnel-Paneel: liegt längs der Blickachse. Wie in der Referenz (t09.75) kommt das Licht vom Ende des Tunnels: das
 * ferne Ende ist hell, das nahe Ende dunkler und weich (Tiefenschärfe entlang des Paneels). Der Inhalt wird dafür
 * zweimal gezeichnet (scharf + weich, je mit Verlaufsmaske).
 */
export const TunnelPanel: React.FC<{
  width: number;
  height: number;
  glow?: number;
  nearDark?: number;
  fogFar?: number;
  nearBlur?: number;
  /** Seite des Paneels, die zur Kamera zeigt */
  near?: "left" | "right";
  /** Lichtkante am fernen Ende 0..1 */
  farEdge?: number;
  children?: React.ReactNode;
}> = ({ width, height, glow = 1, nearDark = 0.55, fogFar = 0, nearBlur = 10, near = "right", farEdge = 1, children }) => {
  const dir = near === "right" ? "90deg" : "270deg";
  // Maske von fern (0 %) nach nah (100 %)
  const fade = `linear-gradient(${dir}, rgba(0,0,0,${(1 - fogFar).toFixed(3)}) 0%, #000 30%, #000 50%, rgba(0,0,0,${(1 - nearDark).toFixed(3)}) 100%)`;
  // weiche Kopie nur am nahen Ende – und dort genauso abgedunkelt wie die scharfe
  const nearMask = `linear-gradient(${dir}, rgba(0,0,0,0) 45%, rgba(0,0,0,${(1 - nearDark).toFixed(3)}) 92%)`;
  return (
    <div style={{ position: "relative", width, height }}>
      <div style={{ position: "absolute", inset: 0, maskImage: fade, WebkitMaskImage: fade }}>
        <WallFrame width={width} height={height} glow={glow}>
          {children}
        </WallFrame>
        {/* Lichtkante am fernen Ende – bildet den leuchtenden Rand der Tunnelöffnung (weich, damit kein Vieleck aufblitzt) */}
        {farEdge > 0.01 ? (
          <div
            style={{
              position: "absolute",
              top: 6,
              bottom: 6,
              [near === "right" ? "left" : "right"]: 0,
              width: 26,
              background: `linear-gradient(${near === "right" ? "90deg" : "270deg"}, ${rgba("#FFFFFF", 0.7 * Math.min(1, farEdge))} 0%, ${rgba(NEON.sky, 0.38 * Math.min(1, farEdge))} 22%, ${rgba(NEON.blue, 0)} 100%)`,
              maskImage: "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, #000 30%, #000 70%, rgba(0,0,0,0.25) 100%)",
              WebkitMaskImage: "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, #000 30%, #000 70%, rgba(0,0,0,0.25) 100%)",
            }}
          />
        ) : null}
      </div>
      {nearBlur > 0.3 ? (
        <div style={{ position: "absolute", inset: 0, filter: `blur(${nearBlur}px)`, maskImage: nearMask, WebkitMaskImage: nearMask }}>
          <WallFrame width={width} height={height} glow={glow}>
            {children}
          </WallFrame>
        </div>
      ) : null}
    </div>
  );
};

/**
 * Mündung des Tunnels (2D, über die <NeonScene3D> legen, unter die Schrift): dunkle Mitte, die weich zur Kante ausläuft,
 * und ein glatter Lichtsaum genau auf der Kante. Rundet das Vieleck der flachen Paneele zur Ellipse ab und gibt der
 * Schrift ruhigen Grund. Mit CurvedWall farEdge≈0,2 und fogFar≈0,5 verschwinden die geraden Paneelkanten im Saum.
 *   x, y     Mitte der Öffnung (Videoraum)
 *   rx, ry   Halbachsen der Kante (≈ Projektion des fernen Tunnelendes: R · P / (P − zFern))
 *   dark     Abdunkeln innen 0..1, rim  Lichtsaum 0..1,5, feather  Breite des Übergangs (Anteil von rx)
 */
export const TunnelMouth: React.FC<{ x?: number; y?: number; rx: number; ry: number; dark?: number; rim?: number; feather?: number; color?: string }> = ({
  x = W / 2,
  y = H / 2,
  rx,
  ry,
  dark = 0.85,
  rim = 0.8,
  feather = 0.25,
  color = NEON.sky,
}) => {
  const g = (a: number, c: string) => rgba(c, Math.min(1, Math.max(0, a)));
  const pct = (v: number) => `${v.toFixed(2)}%`;
  const at = `${rx.toFixed(0)}px ${ry.toFixed(0)}px at ${x.toFixed(0)}px ${y.toFixed(0)}px`;
  const fz = feather * 100;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: W,
        height: H,
        pointerEvents: "none",
        backgroundImage: [
          // Lichtsaum: schmaler heller Kern auf der Kante, weicher Schein nach außen und innen
          `radial-gradient(${at}, ${g(0, color)} ${pct(100 - fz * 0.5)}, ${g(0.1 * rim, NEON.blue)} ${pct(100 - fz * 0.16)}, ${g(0.42 * rim, color)} ${pct(99)}, ${g(0.22 * rim, color)} ${pct(100 + fz * 0.1)}, ${g(0.08 * rim, NEON.blue)} ${pct(100 + fz * 0.4)}, ${g(0, NEON.blue)} ${pct(100 + fz)})`,
          // dunkle Mitte, läuft bis zur Kante aus
          `radial-gradient(${at}, ${g(0.94 * dark, NEON.void)} 0%, ${g(0.9 * dark, NEON.void)} ${pct(100 - fz * 1.6)}, ${g(0.7 * dark, NEON.void)} ${pct(100 - fz * 0.6)}, ${g(0.35 * dark, NEON.void)} ${pct(100 - fz * 0.1)}, ${g(0, NEON.void)} ${pct(100 + fz * 0.15)})`,
        ].join(", "),
      }}
    />
  );
};
