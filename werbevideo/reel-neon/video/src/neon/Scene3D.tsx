/**
 * NeonScene3D + Layer3D – Perspektiv-Bühne mit Kamera (Dolly, Orbit, Schwenk) und automatischer Tiefenschärfe.
 *
 * Jede Ebene trägt die ganze Kamerakette in ihrem eigenen transform (perspective() zuerst) und wird nach Tiefe
 * sortiert (zIndex). So wirken Unschärfe-Filter je Ebene, ohne dass preserve-3d die Sortierung zerstört.
 * Unschärfe = Abstand zur Fokusebene (Kameratiefe) × dof, in Bildschirm-Pixeln (der Filter wird um die Projektion
 * korrigiert, sonst wären ferne Karten zu scharf). Dazu Abdunkeln mit dem Abstand und Ausblenden kurz vor der Linse.
 *
 *   <NeonScene3D camera={{ dolly: 120, orbitY: -8 }} focusZ={0} dof={4}>
 *     <Layer3D x={300} y={500} z={-400} rotY={12} width={520} height={360}><GlassPanel …/></Layer3D>
 *   </NeonScene3D>
 *
 * Koordinaten: x/y = Mitte der Ebene im Videoraum, z positiv = zur Kamera hin. Kamera:
 *   dolly              Fahrt in die Tiefe (px, positiv = Szene kommt näher)
 *   orbitX/orbitY/roll Drehung der ganzen Szene um den Drehpunkt (Grad)
 *   panX/panY          Schwenk (px, positiv = Kamera nach rechts/unten)
 *   pivot              Drehpunkt (Standard Bildmitte, z 0)
 * Layer3D muss direktes Kind von NeonScene3D sein (oder in Hüllen ohne eigenen Stapelkontext), sonst greift zIndex nicht.
 */
import React, { createContext, useContext } from "react";
import { H, W } from "../theme";
import { smoothstep } from "./util";

export type NeonCamera = {
  dolly?: number;
  orbitX?: number;
  orbitY?: number;
  roll?: number;
  panX?: number;
  panY?: number;
  pivot?: { x: number; y: number; z?: number };
};

export type Scene3DSettings = {
  cam: { dolly: number; orbitX: number; orbitY: number; roll: number; panX: number; panY: number; pivot: { x: number; y: number; z: number } };
  perspective: number;
  focusZ: number;
  dof: number;
  maxBlur: number;
  dim: number;
  dimRange: number;
  width: number;
  height: number;
};

const makeSettings = (p: Partial<Omit<Scene3DSettings, "cam">> & { camera?: NeonCamera }): Scene3DSettings => {
  const width = p.width ?? W;
  const height = p.height ?? H;
  const c = p.camera ?? {};
  return {
    cam: {
      dolly: c.dolly ?? 0,
      orbitX: c.orbitX ?? 0,
      orbitY: c.orbitY ?? 0,
      roll: c.roll ?? 0,
      panX: c.panX ?? 0,
      panY: c.panY ?? 0,
      pivot: { x: c.pivot?.x ?? width / 2, y: c.pivot?.y ?? height / 2, z: c.pivot?.z ?? 0 },
    },
    perspective: p.perspective ?? 1700,
    focusZ: p.focusZ ?? 0,
    dof: p.dof ?? 3.5,
    maxBlur: p.maxBlur ?? 22,
    dim: p.dim ?? 0.55,
    dimRange: p.dimRange ?? 1200,
    width,
    height,
  };
};

const Scene3DContext = createContext<Scene3DSettings>(makeSettings({}));

export const useScene3D = () => useContext(Scene3DContext);

const rad = (d: number) => (d * Math.PI) / 180;

/** Punkt (Videoraum + z) in Kamerakoordinaten relativ zur Bildmitte (z positiv = zur Kamera). */
export const toCamera = (s: Scene3DSettings, x: number, y: number, z: number) => {
  const { cam } = s;
  let px = x - cam.pivot.x;
  let py = y - cam.pivot.y;
  let pz = z - cam.pivot.z;
  // gleiche Reihenfolge wie der CSS-transform (rechts zuerst): rotateY → rotateX → rotateZ → translate
  let a = rad(cam.orbitY);
  let cs = Math.cos(a);
  let sn = Math.sin(a);
  [px, pz] = [px * cs + pz * sn, -px * sn + pz * cs];
  a = rad(cam.orbitX);
  cs = Math.cos(a);
  sn = Math.sin(a);
  [py, pz] = [py * cs - pz * sn, py * sn + pz * cs];
  a = rad(cam.roll);
  cs = Math.cos(a);
  sn = Math.sin(a);
  [px, py] = [px * cs - py * sn, px * sn + py * cs];
  return {
    x: px + cam.pivot.x - s.width / 2 - cam.panX,
    y: py + cam.pivot.y - s.height / 2 - cam.panY,
    z: pz + cam.pivot.z + cam.dolly,
  };
};

/** Bildposition (px) und Maßstab eines 3D-Punkts – z. B. um 2D-Overlays an eine Karte zu heften. */
export const project = (s: Scene3DSettings, x: number, y: number, z: number) => {
  const c = toCamera(s, x, y, z);
  const k = s.perspective / Math.max(1, s.perspective - c.z);
  return { x: s.width / 2 + c.x * k, y: s.height / 2 + c.y * k, scale: k, depth: c.z, visible: c.z < s.perspective - 1 };
};

/** Unschärfe (Bildschirm-px) und Helligkeit einer Tiefe nach den Szenen-Einstellungen. */
export const depthLook = (s: Scene3DSettings, depth: number) => {
  const delta = Math.abs(depth - s.focusZ);
  return {
    blur: Math.min(s.maxBlur, (delta * s.dof) / 100),
    bright: 1 - s.dim * smoothstep(0, s.dimRange, delta),
  };
};

export type NeonScene3DProps = {
  camera?: NeonCamera;
  /** Abstand der Kamera zur Ebene z = 0 (px); kleiner = stärkere Perspektive */
  perspective?: number;
  /** Fokusebene in Kameratiefe (0 = Ebene des Drehpunkts nach der Kamerafahrt) */
  focusZ?: number;
  /** Unschärfe (px) je 100 px Abstand zur Fokusebene */
  dof?: number;
  maxBlur?: number;
  /** Abdunkeln mit dem Abstand (0..1) und Abstand, ab dem voll abgedunkelt wird */
  dim?: number;
  dimRange?: number;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

export const NeonScene3D: React.FC<NeonScene3DProps> = ({ children, style, ...p }) => {
  const s = makeSettings(p);
  return (
    // eigener Stapelkontext: die zIndex-Werte der Ebenen bleiben in der Bühne (Text darüber bleibt oben)
    <div style={{ position: "absolute", left: 0, top: 0, width: s.width, height: s.height, isolation: "isolate", ...style }}>
      <Scene3DContext.Provider value={s}>{children}</Scene3DContext.Provider>
    </div>
  );
};

export type Layer3DProps = {
  x?: number;
  y?: number;
  z?: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  scale?: number;
  width: number;
  height: number;
  opacity?: number;
  /** zusätzliche Unschärfe (Bildschirm-px) */
  blur?: number;
  /** ohne Tiefenschärfe (z. B. Text in der Fokusebene) */
  sharp?: boolean;
  /** ohne Abdunkeln */
  noDim?: boolean;
  /** Reihenfolge der eigenen Drehungen: "xyz" = rotateX rotateY rotateZ (Standard), "zyx" = rotateZ rotateY rotateX */
  order?: "xyz" | "zyx";
  /** Rückseite verstecken (für Wände, bei denen die Kamera innen steht) */
  hideBackface?: boolean;
  /** Sortierung feinjustieren (wird zur Tiefe addiert) */
  zBias?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
};

export const Layer3D: React.FC<Layer3DProps> = ({
  x,
  y,
  z = 0,
  rotX = 0,
  rotY = 0,
  rotZ = 0,
  scale = 1,
  width,
  height,
  opacity = 1,
  blur = 0,
  sharp = false,
  noDim = false,
  order = "xyz",
  hideBackface = false,
  zBias = 0,
  style,
  children,
}) => {
  const s = useScene3D();
  const lx = x ?? s.width / 2;
  const ly = y ?? s.height / 2;
  const P = s.perspective;
  const c = toCamera(s, lx, ly, z);
  const proj = P / Math.max(1, P - c.z);
  const look = depthLook(s, c.z);
  const blurScreen = (sharp ? 0 : look.blur) + blur;
  const blurLocal = blurScreen / Math.max(0.05, proj * Math.abs(scale));
  const bright = noDim ? 1 : look.bright;
  // kurz vor der Linse ausblenden (sonst riesige, verzerrte Flächen)
  const near = 1 - smoothstep(P * 0.7, P * 0.9, c.z);
  const alpha = opacity * near;
  if (alpha <= 0.002) return null;
  const { cam } = s;
  const tx = cam.pivot.x - s.width / 2 - cam.panX;
  const ty = cam.pivot.y - s.height / 2 - cam.panY;
  const tz = cam.dolly + cam.pivot.z;
  const rot = order === "xyz" ? `rotateX(${rotX}deg) rotateY(${rotY}deg) rotateZ(${rotZ}deg)` : `rotateZ(${rotZ}deg) rotateY(${rotY}deg) rotateX(${rotX}deg)`;
  const transform = [
    `perspective(${P}px)`,
    `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, ${tz.toFixed(2)}px)`,
    `rotateZ(${cam.roll}deg) rotateX(${cam.orbitX}deg) rotateY(${cam.orbitY}deg)`,
    `translate3d(${(lx - cam.pivot.x).toFixed(2)}px, ${(ly - cam.pivot.y).toFixed(2)}px, ${(z - cam.pivot.z).toFixed(2)}px)`,
    rot,
    `scale(${scale})`,
  ].join(" ");
  const filters: string[] = [];
  if (blurLocal > 0.15) filters.push(`blur(${blurLocal.toFixed(2)}px)`);
  if (bright < 0.995) filters.push(`brightness(${bright.toFixed(3)})`);
  return (
    <div
      style={{
        position: "absolute",
        left: s.width / 2 - width / 2,
        top: s.height / 2 - height / 2,
        width,
        height,
        transform,
        transformOrigin: "50% 50%",
        zIndex: Math.round((c.z + zBias) * 4) + 40000,
        filter: filters.length ? filters.join(" ") : undefined,
        opacity: alpha,
        backfaceVisibility: hideBackface ? "hidden" : "visible",
        ...style,
      }}
    >
      {children}
    </div>
  );
};
