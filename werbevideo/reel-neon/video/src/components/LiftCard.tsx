/**
 * Ein echter Ausschnitt einer App-Aufnahme löst sich aus dem Display und schwebt nach vorn („explodierte UI“).
 *
 * Bei p = 0 liegt der Ausschnitt exakt auf seiner Stelle im Handy (projectPhone, inkl. Drehung), bei p = 1
 * schwebt er groß und gerade vor dem Handy. Gezeichnet wird im Videoraum – die 1170-px-Aufnahme bleibt dadurch
 * auch vergrößert scharf. `children` liegen im Bildraum der Aufnahme (gleiche Koordinaten wie die Markierungen).
 *
 *   <LiftCard src="termin-detail.png" box={box(...)} pose={pose} p={p} to={{ x: 540, y: 1040, s: 0.62 }} />
 */
import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { Box } from "../lib/screens";
import { mix } from "../springs";
import { rgba } from "../theme";
import { PhonePose, projectPhone } from "./Phone3D";

export type LiftTarget = { x: number; y: number; s: number; rotate?: number };

/** Lage des Ausschnitts bei Fortschritt p (Mitte im Video, Maßstab Bildpixel → Videopixel) */
export const liftFrame = (pose: PhonePose, box: Box, p: number, to: LiftTarget, statusBar: number, scrollY = 0) => {
  const src = projectPhone(pose, box.x + box.w / 2, statusBar + box.y + box.h / 2 - scrollY);
  return {
    x: mix(p, src.x, to.x),
    y: mix(p, src.y, to.y),
    s: mix(p, src.s, to.s),
    rotY: mix(p, pose.rotateY ?? 0, 0),
    rotZ: mix(p, 0, to.rotate ?? 0),
  };
};

/** Punkt im Bildraum der Aufnahme → Videokoordinaten, wenn der Ausschnitt gerade schwebt (ohne Drehung) */
export const liftPoint = (lf: ReturnType<typeof liftFrame>, box: Box, X: number, Y: number) => ({
  x: lf.x + (X - (box.x + box.w / 2)) * lf.s,
  y: lf.y + (Y - (box.y + box.h / 2)) * lf.s,
});

export const LiftCard: React.FC<{
  src: string;
  box: Box;
  pose: PhonePose;
  p: number;
  to: LiftTarget;
  statusBar: number;
  scrollY?: number;
  imageWidth?: number;
  imageHeight?: number;
  /** Eckenradius in Bildpixeln */
  radius?: number;
  opacity?: number;
  /** zusätzliche Unschärfe (px im Video) */
  blur?: number;
  /** Rahmenlicht (z. B. Fokus-Ring) */
  ring?: { color: string; amount: number };
  extraScale?: number;
  children?: React.ReactNode;
}> = ({ src, box, pose, p, to, statusBar, scrollY = 0, imageWidth = 1170, imageHeight = 2532, radius = 0, opacity = 1, blur = 0, ring, extraScale = 1, children }) => {
  if (p <= 0.03) return null;
  const lf = liftFrame(pose, box, p, to, statusBar, scrollY);
  const s = lf.s * extraScale;
  // Schatten wächst mit der Höhe über dem Display
  const h = Math.max(0, Math.min(1.1, p));
  const shadow = [
    `0 ${(46 * h) / s}px ${(110 * h) / s}px ${rgba("#02060D", 0.5 * h)}`,
    `0 ${(10 * h) / s}px ${(26 * h) / s}px ${rgba("#02060D", 0.28 * h)}`,
    ring && ring.amount > 0.01 ? `0 0 0 ${6 / s}px ${rgba(ring.color, 0.9 * ring.amount)}, 0 0 ${60 / s}px ${rgba(ring.color, 0.45 * ring.amount)}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <AbsoluteFill style={{ perspective: 1800, perspectiveOrigin: `${lf.x}px ${lf.y}px`, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: lf.x - box.w / 2,
          top: lf.y - box.h / 2,
          width: box.w,
          height: box.h,
          transformOrigin: "50% 50%",
          transform: `rotateY(${lf.rotY.toFixed(3)}deg) rotateZ(${lf.rotZ.toFixed(3)}deg) scale(${s.toFixed(5)})`,
          borderRadius: radius,
          overflow: "hidden",
          boxShadow: shadow,
          opacity: Math.min(1, Math.max(0, (p - 0.03) * 6)) * opacity,
          filter: blur > 0.05 ? `blur(${(blur / s).toFixed(2)}px)` : undefined,
        }}
      >
        <Img
          src={staticFile(src)}
          style={{ position: "absolute", left: -box.x, top: -box.y, width: imageWidth, height: imageHeight, display: "block", maxWidth: "none" }}
        />
        {children ? <div style={{ position: "absolute", left: -box.x, top: -box.y, width: imageWidth, height: imageHeight }}>{children}</div> : null}
      </div>
    </AbsoluteFill>
  );
};
