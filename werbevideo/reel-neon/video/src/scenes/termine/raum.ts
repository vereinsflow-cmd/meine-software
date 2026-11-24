/**
 * Raum-Helfer der Szene „termine“: Kamera als Scene3DSettings (für project(), damit Tipp-Punkt und Karten genau
 * übereinanderliegen) und Punkte auf gedrehten Ebenen – in derselben Reihenfolge wie Layer3D
 * (scale → rotateY → rotateX → translate).
 */
import type { Scene3DSettings } from "../../neon";
import { lerp } from "../../neon";

/** Lage einer Ebene im Raum (x/y Mitte im Videoraum, z + = zur Kamera, Drehung in Grad, Maßstab) */
export type Pose = { x: number; y: number; z: number; rotX: number; rotY: number; scale: number };

export const PERSPECTIVE = 1700;
export const DOF = 2.4;
export const MAX_BLUR = 14;
export const DIM = 0.42;
export const DIM_RANGE = 1100;

export type Cam = { panX: number; dolly: number; orbitX: number; orbitY: number };

/** Drehpunkt wandert mit dem Schwenk mit (sonst kippt die Szene beim Orbit um einen Punkt weit links) */
export const pivotOf = (c: Cam) => ({ x: 540 + c.panX, y: 960, z: 0 });

/** Dieselben Einstellungen wie NeonScene3D – für project() */
export const stageSettings = (c: Cam, focusZ: number): Scene3DSettings => ({
  cam: { dolly: c.dolly, orbitX: c.orbitX, orbitY: c.orbitY, roll: 0, panX: c.panX, panY: 0, pivot: pivotOf(c) },
  perspective: PERSPECTIVE,
  focusZ,
  dof: DOF,
  maxBlur: MAX_BLUR,
  dim: DIM,
  dimRange: DIM_RANGE,
  width: 1080,
  height: 1920,
});

const rad = (d: number) => (d * Math.PI) / 180;

/**
 * Punkt auf einer Ebene: lokaler Versatz (lx, ly) in px der Ebene (vor scale), lz = Abstand entlang der Normalen
 * (Weltpixel, + = zur Kamera) → Weltkoordinaten.
 */
export const onPlane = (p: Pose, lx: number, ly: number, lz = 0) => {
  const sx = lx * p.scale;
  const sy = ly * p.scale;
  let a = rad(p.rotY);
  const x1 = sx * Math.cos(a) + lz * Math.sin(a);
  const z1 = -sx * Math.sin(a) + lz * Math.cos(a);
  a = rad(p.rotX);
  const y2 = sy * Math.cos(a) - z1 * Math.sin(a);
  const z2 = sy * Math.sin(a) + z1 * Math.cos(a);
  return { x: p.x + x1, y: p.y + y2, z: p.z + z2 };
};

export const mixPose = (a: Pose, b: Pose, t: number): Pose => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  z: lerp(a.z, b.z, t),
  rotX: lerp(a.rotX, b.rotX, t),
  rotY: lerp(a.rotY, b.rotY, t),
  scale: lerp(a.scale, b.scale, t),
});
