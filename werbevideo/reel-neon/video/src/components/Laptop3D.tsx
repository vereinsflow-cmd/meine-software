/**
 * Neutraler 3D-Laptop (CSS-3D, selbst gezeichnet, ohne Herstellerlogo) für Desktop-Aufnahmen.
 *
 *   x / y        Mitte des Displays im Bild (px)
 *   width        Außenbreite des Deckels (px)
 *   rotateX/Y    Neigung in Grad
 *   masks        Rechtecke im Bildraum der Aufnahme (z. B. E-Mail-Symbol ausblenden)
 *   children     Overlays im Bildraum der Aufnahme
 *   blur         Unschärfe nur des Displays (Rack-Focus)
 *
 * projectLaptop(pose, X, Y) → Videokoordinaten eines Bildpunkts (inkl. Drehung und Perspektive).
 */
import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { rgba } from "../theme";
import { PhoneMask } from "./Phone3D";

export type LaptopPose = {
  width?: number;
  x?: number;
  y?: number;
  rotateX?: number;
  rotateY?: number;
  perspective?: number;
  imageWidth?: number;
  imageHeight?: number;
};

const D = { width: 980, x: 540, y: 960, perspective: 2400, imageWidth: 1760, imageHeight: 1100 };

export const laptopGeometry = (pose: LaptopPose) => {
  const width = pose.width ?? D.width;
  const iw = pose.imageWidth ?? D.imageWidth;
  const ih = pose.imageHeight ?? D.imageHeight;
  const bezel = width * 0.022;
  const screenW = width - bezel * 2;
  const k = screenW / iw;
  const screenH = ih * k;
  const chin = bezel * 1.6;
  const height = screenH + bezel + chin;
  return { width, height, bezel, chin, screenW, screenH, k, iw, ih };
};

const rad = (d: number) => (d * Math.PI) / 180;

export const projectLaptop = (pose: LaptopPose, X: number, Y: number) => {
  const g = laptopGeometry(pose);
  // Display-Mitte liegt bei (x, y); Punkt relativ dazu
  let vx = (X - g.iw / 2) * g.k;
  let vy = (Y - g.ih / 2) * g.k;
  let vz = 1;
  const ry = rad(pose.rotateY ?? 0);
  const rx = rad(pose.rotateX ?? 0);
  [vx, vz] = [vx * Math.cos(ry) + vz * Math.sin(ry), -vx * Math.sin(ry) + vz * Math.cos(ry)];
  [vy, vz] = [vy * Math.cos(rx) - vz * Math.sin(rx), vy * Math.sin(rx) + vz * Math.cos(rx)];
  const d = pose.perspective ?? D.perspective;
  const persp = d / (d - vz);
  return { x: (pose.x ?? D.x) + vx * persp, y: (pose.y ?? D.y) + vy * persp, s: g.k * persp };
};

type Props = LaptopPose & {
  src: string;
  masks?: PhoneMask[];
  children?: React.ReactNode;
  blur?: number;
  brightness?: number;
  opacity?: number;
  /** Unschärfe des ganzen Geräts */
  deviceBlur?: number;
  shadow?: number;
};

export const Laptop3D: React.FC<Props> = (props) => {
  const { src, masks = [], children, blur = 0, brightness = 1, opacity = 1, deviceBlur = 0, shadow = 1 } = props;
  const g = laptopGeometry(props);
  const x = props.x ?? D.x;
  const y = props.y ?? D.y;
  const rx = props.rotateX ?? 0;
  const ry = props.rotateY ?? 0;
  const persp = props.perspective ?? D.perspective;
  const { width, height, bezel, screenW, screenH, k, iw, ih } = g;
  const lidTop = -bezel - screenH / 2; // relativ zur Display-Mitte
  const radius = width * 0.028;
  const baseDepth = width * 0.62;
  const glarePos = 40 + ry * 3 - rx * 1.5;
  return (
    <AbsoluteFill style={{ perspective: persp, perspectiveOrigin: `${x}px ${y}px`, opacity }}>
      {shadow > 0 ? (
        <div
          style={{
            position: "absolute",
            left: x - width * 0.62,
            top: y + screenH / 2 + width * 0.05,
            width: width * 1.24,
            height: width * 0.32,
            borderRadius: "50%",
            background: `radial-gradient(ellipse at 50% 40%, ${rgba("#02060D", 0.6 * shadow)} 0%, ${rgba("#02060D", 0)} 70%)`,
            filter: "blur(34px)",
          }}
        />
      ) : null}
      {/* Unterteil in eigenem 3D-Kontext (sonst schneidet Chrome den Deckel an der Schnittebene) */}
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: 0,
          height: 0,
          transformStyle: "preserve-3d",
          transform: `rotateX(${rx}deg) rotateY(${ry}deg)`,
          filter: deviceBlur > 0.05 ? `blur(${deviceBlur.toFixed(2)}px)` : undefined,
        }}
      >
        {/* Unterteil (Tastatur-Deck) – klappt nach vorn */}
        <div
          style={{
            position: "absolute",
            left: -width * 0.52,
            top: lidTop + height - 2,
            width: width * 1.04,
            height: baseDepth,
            transformOrigin: "50% 0%",
            transform: "rotateX(84deg)",
            borderRadius: `${radius * 0.6}px ${radius * 0.6}px ${radius * 1.4}px ${radius * 1.4}px`,
            background: "linear-gradient(180deg, #2B3443 0%, #1B222D 40%, #141A23 100%)",
            boxShadow: "inset 0 2px 0 rgba(255,255,255,0.10)",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: "9%",
              right: "9%",
              top: "8%",
              height: "52%",
              borderRadius: radius * 0.5,
              background: "repeating-linear-gradient(90deg, rgba(0,0,0,0.35) 0 5.6%, rgba(255,255,255,0.03) 5.6% 6.4%)",
            }}
          />
          <div style={{ position: "absolute", left: "35%", right: "35%", top: "66%", height: "26%", borderRadius: radius * 0.5, backgroundColor: "rgba(255,255,255,0.05)" }} />
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: 0,
          height: 0,
          transformStyle: "preserve-3d",
          transform: `rotateX(${rx}deg) rotateY(${ry}deg)`,
          filter: deviceBlur > 0.05 ? `blur(${deviceBlur.toFixed(2)}px)` : undefined,
        }}
      >
        {/* Deckel */}
        <div
          style={{
            position: "absolute",
            left: -width / 2,
            top: lidTop,
            width,
            height,
            borderRadius: radius,
            background: "linear-gradient(135deg, #3B4556 0%, #1A202B 30%, #10151D 60%, #2B3443 100%)",
            boxShadow: `inset 0 0 0 ${Math.max(1.5, width * 0.0025)}px rgba(255,255,255,0.14), 0 ${width * 0.04}px ${width * 0.1}px ${rgba("#02060D", 0.45 * shadow)}`,
          }}
        >
          <div
            style={{
              position: "absolute",
              left: bezel,
              top: bezel,
              width: screenW,
              height: screenH,
              borderRadius: radius * 0.35,
              overflow: "hidden",
              backgroundColor: "#FFFFFF",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: iw,
                height: ih,
                transformOrigin: "0 0",
                transform: `scale(${k})`,
                filter: [blur > 0.05 ? `blur(${(blur / Math.max(0.2, k)).toFixed(2)}px)` : "", brightness !== 1 ? `brightness(${brightness.toFixed(3)})` : ""].join(" ").trim() || undefined,
              }}
            >
              <Img src={staticFile(src)} style={{ width: iw, height: ih, display: "block", maxWidth: "none" }} />
              {masks.map((m, i) => (
                <div
                  key={i}
                  style={{ position: "absolute", left: m.x, top: m.y, width: m.w, height: m.h, borderRadius: m.radius ?? 0, backgroundColor: m.color ?? "#FFFFFF", opacity: m.opacity ?? 1 }}
                />
              ))}
            </div>
            {/* scharfe Overlays (nicht mit unscharf) */}
            <div style={{ position: "absolute", left: 0, top: 0, width: iw, height: ih, transformOrigin: "0 0", transform: `scale(${k})`, filter: brightness !== 1 ? `brightness(${brightness.toFixed(3)})` : undefined }}>
              {children}
            </div>
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: `linear-gradient(115deg, rgba(255,255,255,0) ${glarePos - 20}%, rgba(255,255,255,0.12) ${glarePos}%, rgba(255,255,255,0) ${glarePos + 16}%)`,
                mixBlendMode: "screen",
              }}
            />
          </div>
          {/* Kamera-Punkt */}
          <div style={{ position: "absolute", left: width / 2 - 4, top: bezel * 0.35, width: 8, height: 8, borderRadius: 4, backgroundColor: "#06090E", boxShadow: "inset 0 0 2px rgba(120,140,170,0.6)" }} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
