/**
 * Schaukasten: links der Nachbau (1170 breit, dunkle Darstellung), rechts die echte Aufnahme (hell) – Maßvorlage zum Vergleich
 * Pixel für Pixel: Lage und Größen gleich, nur die Farben unterscheiden sich.
 */
import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, SCREEN_H, SCREEN_W } from "./tokens";

export const COMPARE_W = SCREEN_W * 2;
export const COMPARE_H = SCREEN_H;

/** Zwei Hälften: links `children` (Nachbau), rechts die Aufnahme `screens/<file>`. */
export const Compare: React.FC<{ file: string; children: React.ReactNode }> = ({ file, children }) => (
  <AbsoluteFill style={{ background: C.page }}>
    <div style={{ position: "absolute", left: 0, top: 0, width: SCREEN_W, height: SCREEN_H, overflow: "hidden" }}>{children}</div>
    <Img
      src={staticFile(`screens/${file}`)}
      style={{ position: "absolute", left: SCREEN_W, top: 0, width: SCREEN_W, height: SCREEN_H, objectFit: "cover", objectPosition: "top" }}
    />
  </AbsoluteFill>
);
