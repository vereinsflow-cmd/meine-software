/**
 * Virtuelle Kamera über einer Bühne: zoomt um einen Fokuspunkt und verschiebt das Bild.
 * camPoint() bildet Bühnenpunkte in Videokoordinaten ab (z. B. für Tipp-Punkte über dem Handy).
 *
 *   const cam = { s: 1.4, fx: 540, fy: 900, tx: 0, ty: -60 };
 *   <Camera cam={cam}><Phone3D …/></Camera>
 */
import React from "react";
import { AbsoluteFill } from "remotion";

export type Cam = { s: number; fx: number; fy: number; tx: number; ty: number };

export const CAM0: Cam = { s: 1, fx: 540, fy: 960, tx: 0, ty: 0 };

export const camPoint = (cam: Cam, p: { x: number; y: number }) => ({
  x: cam.fx + (p.x - cam.fx) * cam.s + cam.tx,
  y: cam.fy + (p.y - cam.fy) * cam.s + cam.ty,
});

/**
 * Kamera direkt aufs Gerät anwenden (statt das gerenderte Bild hochzuskalieren): Breite,
 * Lage und Perspektive wachsen mit – so bleiben Screenshots auch bei Zoom scharf.
 */
export const camPose = <P extends { width?: number; x?: number; y?: number; perspective?: number }>(pose: P, cam: Cam): P => {
  const c = camPoint(cam, { x: pose.x ?? 540, y: pose.y ?? 960 });
  return {
    ...pose,
    width: (pose.width ?? 600) * cam.s,
    x: c.x,
    y: c.y,
    perspective: (pose.perspective ?? 2000) * cam.s,
  };
};

export const Camera: React.FC<{ cam: Cam; children: React.ReactNode; style?: React.CSSProperties }> = ({ cam, children, style }) => (
  <AbsoluteFill
    style={{
      transformOrigin: `${cam.fx}px ${cam.fy}px`,
      transform: `translate(${cam.tx.toFixed(2)}px, ${cam.ty.toFixed(2)}px) scale(${cam.s.toFixed(4)})`,
      ...style,
    }}
  >
    {children}
  </AbsoluteFill>
);
