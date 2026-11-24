/**
 * 3D-Smartphone (CSS-3D, selbst gezeichnet, neutraler Rahmen ohne Herstellerlogo).
 *
 * Koordinaten:
 *   x / y          Mittelpunkt des Geräts im Bild (px)
 *   rotateX/Y/Z    Neigung in Grad (perspective 2000)
 *   statusBar      Höhe der (leeren) Statusleiste in Bildpixeln – der Screenshot rückt darunter,
 *                  damit die Kamera-Pille nicht über der App-Kopfzeile liegt
 *   scrollY        Scroll des Basis-Screenshots (Bildpixel)
 *   zoom           {cx, cy, scale} – auf einen Punkt im Screen-Bildraum zoomen (Bildpixel, inkl.
 *                  Statusleiste, nach Scroll). Ohne Zoom: zoomCenter(pose)
 *   layers         weitere Screenshots übereinander (eigener Scroll, Deckkraft, Versatz, Masken) –
 *                  für Seitenwechsel, Crossfades, Schnitte
 *   fixedTop       App-Kopfzeile aus einem Screenshot, die beim Scrollen stehen bleibt
 *   overlay        Inhalte im Screen-Bildraum (zoomt mit, scrollt nicht)
 *   children       Overlays im Bildraum des Basis-Screenshots (scrollen mit)
 *
 * projectPhone(pose, X, Y) rechnet einen Punkt des Screen-Bildraums exakt (inkl. 3D-Drehung
 * und Perspektive) in Videokoordinaten um – damit Tipp-Punkte genau auf Knöpfen landen.
 */
import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, rgba } from "../theme";

export type PhoneMask = {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Füllfarbe oder CSS-Verlauf (Standard: Screen-Weiß) */
  color?: string;
  radius?: number;
  /** stattdessen weichzeichnen (px) */
  blur?: number;
  opacity?: number;
  /** weiche Kante (px) */
  feather?: number;
};

export type ScreenLayer = {
  /** leer = nur Overlays (children) ohne Bild */
  src: string;
  imageHeight?: number;
  scrollY?: number;
  /** horizontaler Versatz in Bildpixeln (z. B. Push-Übergang) */
  x?: number;
  /** zusätzlicher vertikaler Versatz im Screen-Bildraum */
  y?: number;
  opacity?: number;
  blur?: number;
  masks?: PhoneMask[];
  /** oberen Bildrand abschneiden (Bildpixel des Layers, z. B. deckende Kopfzeile einer gescrollten Aufnahme) */
  cropTop?: number;
  /** nur diesen Bereich (Screen-Bildraum, nach Scroll) zeigen */
  clipTop?: number;
  clipBottom?: number;
  children?: React.ReactNode;
  /** Hintergrund des Layers (verdeckt darunterliegende) */
  bg?: string;
};

export type PhonePose = {
  /** Außenbreite des Geräts in px */
  width?: number;
  x?: number;
  y?: number;
  rotateX?: number;
  rotateY?: number;
  rotateZ?: number;
  scale?: number;
  imageWidth?: number;
  statusBar?: number;
  zoom?: { cx: number; cy: number; scale: number };
  parallax?: { x: number; y: number };
  perspective?: number;
};

type Props = PhonePose & {
  src?: string;
  imageHeight?: number;
  scrollY?: number;
  masks?: PhoneMask[];
  layers?: ScreenLayer[];
  fixedTop?: { src: string; height: number; opacity?: number };
  overlay?: React.ReactNode;
  /** 0..1 – Stärke des weichen Schattens */
  shadow?: number;
  /** Helligkeit des Displays (1 = normal) */
  brightness?: number;
  /** Bildschirmhintergrund hinter dem Screenshot */
  screenColor?: string;
  opacity?: number;
  blur?: number;
  children?: React.ReactNode;
  style?: React.CSSProperties;
};

export const PHONE_ASPECT = 2.06; // Außenhöhe / Außenbreite
export const APP_BG = "#F4F6F9"; // Seitenhintergrund der App (aus den Aufnahmen gemessen)

const D = { width: 600, x: 540, y: 960, imageWidth: 1170, perspective: 2000, statusBar: 0 };

export const phoneGeometry = (pose: PhonePose) => {
  const width = pose.width ?? D.width;
  const height = width * PHONE_ASPECT;
  const bezel = width * 0.034;
  const radius = width * 0.15;
  const screenW = width - bezel * 2;
  const screenH = height - bezel * 2;
  const iw = pose.imageWidth ?? D.imageWidth;
  const k = screenW / iw;
  return { width, height, bezel, radius, screenW, screenH, k, iw };
};

/** Zoom-Mitte ohne Zoom (Bildschirmmitte im Screen-Bildraum) */
export const zoomCenter = (pose: PhonePose) => {
  const g = phoneGeometry(pose);
  return { cx: g.iw / 2, cy: g.screenH / 2 / g.k, scale: 1 };
};

/** Höhe des sichtbaren Screen-Bildraums (Bildpixel) */
export const screenImageHeight = (pose: PhonePose) => {
  const g = phoneGeometry(pose);
  return g.screenH / g.k;
};

const rad = (d: number) => (d * Math.PI) / 180;

/**
 * Punkt im Screen-Bildraum (Bildpixel; y inkl. Statusleiste, nach Scroll) → Videokoordinaten.
 * Liefert auch `s` (Maßstab Bildpixel → Videopixel an dieser Stelle).
 */
export const projectPhone = (pose: PhonePose, X: number, Y: number) => {
  const g = phoneGeometry(pose);
  const z = pose.zoom ?? zoomCenter(pose);
  const px = pose.parallax?.x ?? 0;
  const py = pose.parallax?.y ?? 0;
  const sx = px + g.screenW / 2 + g.k * z.scale * (X - z.cx);
  const sy = py + g.screenH / 2 + g.k * z.scale * (Y - z.cy);
  // relativ zur Gerätemitte
  let vx = g.bezel + sx - g.width / 2;
  let vy = g.bezel + sy - g.height / 2;
  let vz = 0.5;
  const rz = rad(pose.rotateZ ?? 0);
  const ry = rad(pose.rotateY ?? 0);
  const rx = rad(pose.rotateX ?? 0);
  // M = S · Rx · Ry · Rz  → zuerst Rz
  [vx, vy] = [vx * Math.cos(rz) - vy * Math.sin(rz), vx * Math.sin(rz) + vy * Math.cos(rz)];
  [vx, vz] = [vx * Math.cos(ry) + vz * Math.sin(ry), -vx * Math.sin(ry) + vz * Math.cos(ry)];
  [vy, vz] = [vy * Math.cos(rx) - vz * Math.sin(rx), vy * Math.sin(rx) + vz * Math.cos(rx)];
  const s = pose.scale ?? 1;
  vx *= s;
  vy *= s;
  vz *= s;
  const d = pose.perspective ?? D.perspective;
  const persp = d / (d - vz);
  return {
    x: (pose.x ?? D.x) + vx * persp,
    y: (pose.y ?? D.y) + vy * persp,
    s: g.k * z.scale * s * persp,
  };
};

/** Bildausschnitt eines Screenshots als eigenes Element (z. B. Knopf-Delle, Zeile schütteln). */
export const ImgCrop: React.FC<{
  src: string;
  imageWidth?: number;
  imageHeight?: number;
  box: { x: number; y: number; w: number; h: number };
  /** Lage im Layer (Standard: wie box) */
  at?: { x: number; y: number };
  scale?: number;
  dx?: number;
  dy?: number;
  opacity?: number;
  /** Hintergrund hinter dem Ausschnitt (verdeckt das Original bei scale < 1) */
  bg?: string;
  radius?: number;
  filter?: string;
  shadow?: string;
}> = ({ src, imageWidth = 1170, imageHeight = 2532, box, at, scale = 1, dx = 0, dy = 0, opacity = 1, bg, radius = 0, filter, shadow }) => {
  const ax = at?.x ?? box.x;
  const ay = at?.y ?? box.y;
  return (
    <>
      {bg ? <div style={{ position: "absolute", left: ax, top: ay, width: box.w, height: box.h, backgroundColor: bg, opacity }} /> : null}
      <div
        style={{
          position: "absolute",
          left: ax,
          top: ay,
          width: box.w,
          height: box.h,
          overflow: "hidden",
          borderRadius: radius,
          opacity,
          transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
          filter,
          boxShadow: shadow,
        }}
      >
        <Img
          src={staticFile(src)}
          style={{ position: "absolute", left: -box.x, top: -box.y, width: imageWidth, height: imageHeight, display: "block", maxWidth: "none" }}
        />
      </div>
    </>
  );
};

const MaskRect: React.FC<{ m: PhoneMask; fallback: string }> = ({ m, fallback }) => {
  const fill = m.color ?? fallback;
  const isGradient = fill.includes("gradient");
  const feather = m.feather ?? 0;
  const maskImg =
    feather > 0
      ? `linear-gradient(90deg, transparent 0, #000 ${feather}px, #000 calc(100% - ${feather}px), transparent 100%), linear-gradient(180deg, transparent 0, #000 ${feather}px, #000 calc(100% - ${feather}px), transparent 100%)`
      : undefined;
  return (
    <div
      style={{
        position: "absolute",
        left: m.x,
        top: m.y,
        width: m.w,
        height: m.h,
        borderRadius: m.radius ?? 0,
        background: m.blur ? undefined : isGradient ? fill : undefined,
        backgroundColor: m.blur || isGradient ? undefined : fill,
        backdropFilter: m.blur ? `blur(${m.blur}px)` : undefined,
        opacity: m.opacity ?? 1,
        WebkitMaskImage: maskImg,
        maskImage: maskImg,
        WebkitMaskComposite: maskImg ? "source-in" : undefined,
        maskComposite: maskImg ? "intersect" : undefined,
      }}
    />
  );
};

const LayerView: React.FC<{ layer: ScreenLayer; iw: number; defaultH: number; statusBar: number; screenColor: string }> = ({
  layer,
  iw,
  defaultH,
  statusBar,
  screenColor,
}) => {
  const ih = layer.imageHeight ?? defaultH;
  const scroll = layer.scrollY ?? 0;
  const top = statusBar - scroll + (layer.y ?? 0);
  const opacity = layer.opacity ?? 1;
  if (opacity <= 0.001) return null;
  const clip =
    layer.clipTop !== undefined || layer.clipBottom !== undefined || layer.cropTop !== undefined
      ? `inset(${Math.max(layer.cropTop ?? 0, (layer.clipTop ?? -1e5) - top)}px 0px ${Math.max(0, ih - ((layer.clipBottom ?? 1e5) - top))}px 0px)`
      : undefined;
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: iw,
        height: ih,
        transform: `translate(${layer.x ?? 0}px, ${top}px)`,
        opacity,
        filter: layer.blur && layer.blur > 0.05 ? `blur(${layer.blur.toFixed(2)}px)` : undefined,
        clipPath: clip,
        backgroundColor: layer.bg,
      }}
    >
      {layer.src ? <Img src={staticFile(layer.src)} style={{ width: iw, height: ih, display: "block", maxWidth: "none" }} /> : null}
      {(layer.masks ?? []).map((m, i) => (
        <MaskRect key={i} m={m} fallback={screenColor} />
      ))}
      {layer.children}
    </div>
  );
};

export const Phone3D: React.FC<Props> = (props) => {
  const {
    src,
    imageHeight = 2532,
    scrollY = 0,
    masks = [],
    layers = [],
    fixedTop,
    overlay,
    shadow = 1,
    brightness = 1,
    screenColor = "#FFFFFF",
    opacity = 1,
    blur = 0,
    children,
    style,
  } = props;
  const pose: PhonePose = props;
  const g = phoneGeometry(pose);
  const x = pose.x ?? D.x;
  const y = pose.y ?? D.y;
  const rotateX = pose.rotateX ?? 0;
  const rotateY = pose.rotateY ?? 0;
  const rotateZ = pose.rotateZ ?? 0;
  const scale = pose.scale ?? 1;
  const statusBar = pose.statusBar ?? D.statusBar;
  const perspective = pose.perspective ?? D.perspective;
  const z = pose.zoom ?? zoomCenter(pose);
  const px = pose.parallax?.x ?? 0;
  const py = pose.parallax?.y ?? 0;
  const { width, height, bezel, radius, screenW, screenH, k, iw } = g;
  const screenR = radius - bezel;
  const thickness = width * 0.028;
  // wandernde Glanzkante: folgt der Drehung
  const glarePos = 50 + rotateY * 3.2 - rotateX * 1.2;

  const allLayers: ScreenLayer[] = [...(src ? [{ src, imageHeight, scrollY, masks, children }] : []), ...layers];

  return (
    <AbsoluteFill style={{ perspective, perspectiveOrigin: `${x}px ${y}px`, opacity, ...style }}>
      {/* Schatten auf dem „Boden“ – weich und farbig, nicht schwarz */}
      {shadow > 0 ? (
        <div
          style={{
            position: "absolute",
            left: x - width * 0.55 * scale,
            top: y + height * 0.36 * scale,
            width: width * 1.1 * scale,
            height: height * 0.22 * scale,
            borderRadius: "50%",
            background: `radial-gradient(ellipse at 50% 40%, ${rgba("#02060D", 0.55 * shadow)} 0%, ${rgba("#02060D", 0)} 70%)`,
            filter: "blur(30px)",
            translate: `${rotateY * -4}px 0`,
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          left: x - width / 2,
          top: y - height / 2,
          width,
          height,
          transformStyle: "preserve-3d",
          transform: `scale(${scale}) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotateZ(${rotateZ}deg)`,
          filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
        }}
      >
        {/* Gehäusetiefe */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: radius,
            background: "linear-gradient(160deg, #2A3343 0%, #0E131B 60%, #1B2230 100%)",
            transform: `translateZ(${-thickness}px)`,
            boxShadow: `0 ${width * 0.08}px ${width * 0.18}px ${rgba("#02060D", 0.45 * shadow)}`,
          }}
        />
        {/* Rahmen */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: radius,
            background: `linear-gradient(135deg, #3B4556 0%, #1A202B 28%, #10151D 55%, #2B3443 100%)`,
            boxShadow: `inset 0 0 0 ${Math.max(1.5, width * 0.004)}px rgba(255,255,255,0.14), inset 0 0 ${width * 0.02}px rgba(0,0,0,0.6)`,
          }}
        />
        {/* Seitentasten (neutral) */}
        <SideButton left={-width * 0.008} top={height * 0.2} h={height * 0.07} w={width * 0.012} />
        <SideButton left={-width * 0.008} top={height * 0.3} h={height * 0.1} w={width * 0.012} />
        <SideButton left={width - width * 0.004} top={height * 0.26} h={height * 0.13} w={width * 0.012} />
        {/* Display */}
        <div
          style={{
            position: "absolute",
            left: bezel,
            top: bezel,
            width: screenW,
            height: screenH,
            borderRadius: screenR,
            overflow: "hidden",
            backgroundColor: screenColor,
            transform: "translateZ(0.5px)",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: iw,
              height: imageHeight,
              transformOrigin: "0 0",
              transform: `translate(${px + screenW / 2}px, ${py + screenH / 2}px) scale(${k * z.scale}) translate(${-z.cx}px, ${-z.cy}px)`,
              filter: brightness !== 1 ? `brightness(${brightness.toFixed(3)})` : undefined,
            }}
          >
            {allLayers.map((l, i) => (
              <LayerView key={i} layer={l} iw={iw} defaultH={imageHeight} statusBar={statusBar} screenColor={screenColor} />
            ))}
            {fixedTop ? (
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: statusBar,
                  width: iw,
                  height: fixedTop.height,
                  overflow: "hidden",
                  opacity: fixedTop.opacity ?? 1,
                }}
              >
                <Img src={staticFile(fixedTop.src)} style={{ width: iw, display: "block", maxWidth: "none" }} />
              </div>
            ) : null}
            {statusBar > 0 ? (
              // 3 px Überlappung in die (oben weiße) Kopfzeile: sonst blitzen an der schrägen Kante gescrollte
              // Inhalte als gestrichelte Haarlinie durch (Kantenglättung)
              <div style={{ position: "absolute", left: 0, top: -2000, width: iw, height: statusBar + 2000 + (fixedTop ? 3 : 0), backgroundColor: "#FFFFFF" }} />
            ) : null}
            {overlay}
          </div>
          {/* Kamera-Pille (neutral) */}
          <div
            style={{
              position: "absolute",
              left: screenW / 2 - width * 0.13,
              top: width * 0.03,
              width: width * 0.26,
              height: width * 0.07,
              borderRadius: width * 0.05,
              backgroundColor: "#06090E",
            }}
          />
          {/* Glanzkante */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: `linear-gradient(115deg, rgba(255,255,255,0) ${glarePos - 18}%, rgba(255,255,255,0.16) ${glarePos}%, rgba(255,255,255,0) ${glarePos + 14}%)`,
              mixBlendMode: "screen",
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};

const SideButton: React.FC<{ left: number; top: number; w: number; h: number }> = ({ left, top, w, h }) => (
  <div
    style={{
      position: "absolute",
      left,
      top,
      width: w,
      height: h,
      borderRadius: w,
      background: "linear-gradient(90deg, #2C3546, #121821)",
      transform: "translateZ(-2px)",
    }}
  />
);

/** Standard für die Lösungsszenen: die UI läuft bis y 1300 ganz in Tinte aus – das Untertitel-Band (ab y 1330) liegt ruhig auf Tinte. */
export const FLOOR = { from: 1120, to: 1300 } as const;

/** Verlauf, unter dem der Geräteboden ausläuft (Storyboard: „Geräteboden läuft unter Tinte aus“). */
export const FloorFade: React.FC<{ color?: string; from?: number; to?: number; opacity?: number }> = ({
  color = C.ink,
  from = 1240,
  to = 1640,
  opacity = 1,
}) => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      opacity,
      background: `linear-gradient(180deg, ${rgba(color, 0)} ${(from / 1920) * 100}%, ${rgba(color, 0.92)} ${(to / 1920) * 100}%, ${color} 100%)`,
    }}
  />
);
