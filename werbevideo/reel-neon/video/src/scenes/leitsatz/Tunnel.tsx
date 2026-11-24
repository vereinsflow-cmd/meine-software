/**
 * Gebogene Wand aus echten App-Seiten (Dunkelmodus) als Tunnel um die Blickachse (Vorbild t09.25–t09.75):
 * zwölf Paneele liegen längs an den Wänden, jede Seite quer darauf (Kopfzeile am fernen, hellen Ende), die Wand dreht
 * sich langsam um die Mitte. Dunkle Mündung mit Lichtsaum in der Mitte – dort steht die Schrift.
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import { AppShell } from "../../ui/AppShell";
import { CalendarAgenda, EventDetailPage } from "../../ui/events";
import { FinancePage, LedgerTable } from "../../ui/finance";
import { ImportPage, MembersPage } from "../../ui/members";
import { ChatView, MessagesListPage } from "../../ui/messages";
import { ShiftsPage } from "../../ui/shifts";
import { CurvedWall, NEON, NeonScene3D, TunnelMouth, invLerp, project, rgba } from "../../neon";
import type { Scene3DSettings } from "../../neon";
import { easeIn } from "../../neon/util";
import { H, W } from "../../theme";
import { T } from "./zeit";

/** Lichtimpulse: laufen auf den ersten Wörtern der beiden Sätze vom Tunnelende über alle Wände auf die Kamera zu */
const PULSE = [T.satz1[0] - 3, T.satz2[0] - 3];
const PULSE_DUR = 26;
const pulseAt = (f: number) => {
  for (const p of PULSE) {
    const t = invLerp(p, p + PULSE_DUR, f);
    if (t > 0 && t < 1) return t;
  }
  return -1;
};

/** Bildraum der App-Seiten; 2040 hoch abgeschnitten (Finanzen: nur Kontostand und Offene Rechnungen, kein Überschuss) */
const PAGE_W = 1170;
const PAGE_H = 2040;

/** Zwölf verschiedene Seiten der Wand (Mitglieder, Termin, Schichten, Nachrichten, Finanzen, Kalender, Chat, Import,
 *  Kassenbuch …) – Finanzen nur einmal, damit die orange Rechnungs-Karte nicht doppelt leuchtet */
const SEITEN: React.ReactNode[] = [
  <AppShell key="mitglieder" height={PAGE_H}>
    <MembersPage />
  </AppShell>,
  <AppShell key="termin" height={PAGE_H}>
    <EventDetailPage rsvp={1} />
  </AppShell>,
  <AppShell key="schichten" height={PAGE_H} scrollY={1821}>
    <ShiftsPage />
  </AppShell>,
  <AppShell key="nachrichten" height={PAGE_H}>
    <MessagesListPage />
  </AppShell>,
  <AppShell key="finanzen" height={PAGE_H}>
    <FinancePage />
  </AppShell>,
  <AppShell key="kalender" height={PAGE_H} scrollY={12}>
    <CalendarAgenda />
  </AppShell>,
  <AppShell key="chat" height={PAGE_H}>
    <ChatView />
  </AppShell>,
  <AppShell key="import" height={PAGE_H}>
    <ImportPage rowHighlight={[0, 0, 1]} />
  </AppShell>,
  <AppShell key="schichten-kopf" height={PAGE_H}>
    <ShiftsPage />
  </AppShell>,
  <AppShell key="kassenbuch" height={PAGE_H} scrollY={13}>
    <LedgerTable />
  </AppShell>,
  <AppShell key="mitglieder-tabelle" height={PAGE_H} scrollY={760}>
    <MembersPage />
  </AppShell>,
  <AppShell key="termin-offen" height={PAGE_H}>
    <EventDetailPage />
  </AppShell>,
];

export const WAND = {
  count: 12,
  /** Halbachsen des Tunnels (hochformatig oval) */
  R: 640,
  RY: 900,
  /** Paneel: Länge entlang der Blickachse × Breite entlang des Umfangs */
  PW: 860,
  PH: 400,
  /** Mitte der Paneele in der Tiefe */
  cz: -430,
  P: 1150,
} as const;

/**
 * Flacher Platzhalter für eine App-Seite (nur für die weichgezeichneten Geister der Bewegungsunschärfe im Sog): gleiche
 * mittlere Helligkeit, dazu die großen Farbflächen der Seite (Finanzen: Kontostand blau, Rechnung orange; Kalender:
 * grüne Termine) – nach dem Weichzeichnen sieht er aus wie die Seite, kostet aber nur ein paar Flächen statt einer AppShell.
 * Maße im Innenraum des Paneels (840 × 380, Seite quer: fernes Ende links, Seitenbreite = Paneelhöhe).
 */
const FLECKEN: Record<number, { x: number; w: number; y: number; h: number; c: string; a: number }[]> = {
  4: [
    { x: 92, w: 150, y: 196, h: 172, c: "#2B6BF0", a: 0.8 },
    { x: 92, w: 150, y: 12, h: 172, c: "#F26A1B", a: 0.8 },
  ],
  5: [
    { x: 120, w: 430, y: 26, h: 150, c: "#00A878", a: 0.55 },
    { x: 120, w: 430, y: 204, h: 150, c: "#00A878", a: 0.55 },
  ],
};

const SeitenPlatzhalter: React.FC<{ i: number; len: number; ih: number }> = ({ i, len, ih }) => (
  <>
    <div style={{ position: "absolute", left: 0, top: 0, width: len, height: ih, background: `linear-gradient(90deg, ${rgba("#2A2D36", 0.9)} 0%, ${rgba("#1B1D24", 0.9)} 12%, ${rgba("#16181E", 0.9)} 100%)` }} />
    {(FLECKEN[i % SEITEN.length] ?? []).map((b, k) => (
      <div key={k} style={{ position: "absolute", left: b.x, top: b.y, width: b.w, height: b.h, borderRadius: 14, background: rgba(b.c, b.a) }} />
    ))}
  </>
);

/** Paneel-Inhalt: dunkles Glas mit einer quer liegenden App-Seite; Kopfzeile links = fernes Ende.
 *  platzhalter: flacher Platzhalter statt App-Seite (für die Geister im Sog) */
const WandSeite: React.FC<{ i: number; f: number; platzhalter?: boolean }> = ({ i, f, platzhalter = false }) => {
  const w = WAND.PW;
  const h = WAND.PH;
  const bezel = 10;
  const iw = w - bezel * 2;
  const ih = h - bezel * 2;
  const k = ih / PAGE_W;
  const len = Math.min(PAGE_H, iw / k);
  const pt = pulseAt(f);
  const pa = pt >= 0 ? Math.pow(Math.sin(Math.PI * pt), 0.8) : 0;
  return (
    <div
      style={{
        position: "relative",
        width: w,
        height: h,
        borderRadius: 28,
        overflow: "hidden",
        background: `linear-gradient(90deg, ${rgba(NEON.deep, 0.75)} 0%, ${rgba(NEON.abyss, 0.85)} 45%, ${rgba(NEON.void, 0.92)} 100%)`,
      }}
    >
      <div style={{ position: "absolute", left: bezel, top: bezel, width: iw, height: ih, borderRadius: 20, overflow: "hidden", background: "#0A0A0B" }}>
        {platzhalter ? (
          <SeitenPlatzhalter i={i} len={len * k} ih={ih} />
        ) : (
          <div style={{ position: "absolute", left: 0, top: ih, width: PAGE_W, height: len, overflow: "hidden", transformOrigin: "0 0", transform: `rotate(-90deg) scale(${k.toFixed(5)})` }}>
            {SEITEN[i % SEITEN.length]}
          </div>
        )}
        {/* Licht vom Tunnelende: das ferne Ende der Seite leuchtet bläulich an */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            mixBlendMode: "screen",
            background: `linear-gradient(90deg, ${rgba(NEON.sky, 0.26)} 0%, ${rgba(NEON.blue, 0.1)} 30%, ${rgba(NEON.blue, 0)} 62%)`,
          }}
        />
        {/* Lichtimpuls: helles Band läuft vom fernen Ende (links) zum nahen Ende, beschleunigt auf die Kamera zu */}
        {pa > 0.005 ? (
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${(-34 + 150 * easeIn(pt, 1.7)).toFixed(2)}%`,
              width: "34%",
              mixBlendMode: "screen",
              background: `linear-gradient(90deg, ${rgba(NEON.blue, 0)} 0%, ${rgba(NEON.sky, 0.3 * pa)} 42%, ${rgba("#FFFFFF", 0.4 * pa)} 50%, ${rgba(NEON.sky, 0.3 * pa)} 58%, ${rgba(NEON.blue, 0)} 100%)`,
            }}
          />
        ) : null}
      </div>
    </div>
  );
};

export type TunnelProps = {
  /** absoluter Frame (für die Lichtimpulse) */
  f: number;
  /** Drehung um die Blickachse (Grad) */
  rotation: number;
  /** Kamerafahrt (positiv = in den Tunnel hinein) */
  dolly: number;
  orbitX?: number;
  orbitY?: number;
  opacity?: number;
  edgeGlow?: number;
  /** Bewegungsunschärfe der Drehung (Grad) */
  blurSpan?: number;
  /** Abdunkeln der Mündung (Grund für die Schrift) */
  mouthDark?: number;
  mouthRim?: number;
  /** Weichzeichnen des nahen Paneelendes (px, 0 = ohne weiche Kopie) */
  nearBlur?: number;
};

/** Mitte und Halbachsen der Tunnelmündung im Bild (fernes Ende, mit Kamerafahrt mitgeführt) */
export const tunnelMouth = (dolly: number, orbitX = 0, orbitY = 0) => {
  const s: Scene3DSettings = {
    cam: { dolly, orbitX, orbitY, roll: 0, panX: 0, panY: 0, pivot: { x: W / 2, y: H / 2, z: 0 } },
    perspective: WAND.P,
    focusZ: 0,
    dof: 0,
    maxBlur: 0,
    dim: 0,
    dimRange: 1,
    width: W,
    height: H,
  };
  const p = project(s, W / 2, H / 2, WAND.cz - WAND.PW / 2);
  return { x: p.x, y: p.y, rx: WAND.R * p.scale, ry: WAND.RY * p.scale, scale: p.scale };
};

/** Maßstab der Paneelmitte im Bild (wie Layer3D: proj = P / (P − Tiefe)) */
const panelScale = (dolly: number, orbitX: number, orbitY: number) => {
  const s: Scene3DSettings = {
    cam: { dolly, orbitX, orbitY, roll: 0, panX: 0, panY: 0, pivot: { x: W / 2, y: H / 2, z: 0 } },
    perspective: WAND.P,
    focusZ: 0,
    dof: 0,
    maxBlur: 0,
    dim: 0,
    dimRange: 1,
    width: W,
    height: H,
  };
  return project(s, W / 2, H / 2, WAND.cz).scale;
};

/** Obergrenzen der Bewegungsunschärfe im Paneel (lokale px): beim Sog wird der Tunnel klein, die gleiche Unschärfe im
 *  Bild hieße sonst Filter mit 150 px und mehr auf jedem Paneel (Sekunden pro Frame), obwohl der Ring nur noch schmal ist */
const MAX_BLUR_HAUPT = 14;
const MAX_BLUR_GEIST = 80;

export const Tunnel: React.FC<TunnelProps> = ({
  f,
  rotation,
  dolly,
  orbitX = 0,
  orbitY = 0,
  opacity = 1,
  edgeGlow = 0.42,
  blurSpan = 0,
  mouthDark = 0.9,
  mouthRim = 0.9,
  nearBlur = 9,
}) => {
  if (opacity <= 0.002) return null;
  const m = tunnelMouth(dolly, orbitX, orbitY);
  const wall = {
    count: WAND.count,
    axis: "z" as const,
    radius: WAND.R,
    radiusY: WAND.RY,
    panelWidth: WAND.PW,
    panelHeight: WAND.PH,
    center: { z: WAND.cz },
    edgeGlow,
    nearDark: 0.5,
    fogFar: 0.28,
    farEdge: 0.2,
  };
  // Schnelle Drehung: Bewegungsunschärfe wie CurvedWall mit samples={2} (Hauptprobe 0,7 + ein Geist 0,55 um blurSpan
  // zurück, Geist stark weich), aber als zwei Wände – so trägt nur die Hauptprobe die App-Seiten, der Geist ist ein
  // flacher Platzhalter, und die Unschärfe ist in Paneel-px gedeckelt.
  const fast = blurSpan > 3;
  const proj = fast ? Math.max(0.05, panelScale(dolly, orbitX, orbitY)) : 1;
  const smear = fast ? Math.min(28, 0.6 * ((blurSpan * Math.PI) / 180) * WAND.R) : 0;
  // Tiefenschärfe der Bühne an der Paneelmitte (Fokus 90 px davor: 90 · dof / 100 ≈ 1 px)
  const depthBlur = (90 * 1.1) / 100;
  const blurHaupt = Math.min(MAX_BLUR_HAUPT, (depthBlur + 0.15 * smear) / proj);
  const blurGeist = Math.min(MAX_BLUR_GEIST, (depthBlur + smear) / proj);
  return (
    <AbsoluteFill style={{ opacity }}>
      <NeonScene3D perspective={WAND.P} camera={{ dolly, orbitX, orbitY }} focusZ={WAND.cz + dolly - 90} dof={1.1} maxBlur={12} dim={0.28} dimRange={900}>
        {fast ? (
          <>
            <CurvedWall
              {...wall}
              rotation={rotation - blurSpan}
              nearBlur={0}
              style={{ opacity: 0.55, filter: `blur(${blurGeist.toFixed(2)}px)` }}
              renderPanel={(i) => <WandSeite i={i} f={f} platzhalter />}
            />
            <CurvedWall
              {...wall}
              rotation={rotation}
              nearBlur={nearBlur}
              style={{ opacity: 0.7, filter: `blur(${blurHaupt.toFixed(2)}px)` }}
              renderPanel={(i) => <WandSeite i={i} f={f} />}
            />
          </>
        ) : (
          <CurvedWall {...wall} rotation={rotation} blurSpan={blurSpan} samples={2} nearBlur={nearBlur} renderPanel={(i) => <WandSeite i={i} f={f} />} />
        )}
      </NeonScene3D>
      {mouthDark > 0.01 || mouthRim > 0.01 ? (
        <TunnelMouth x={m.x} y={m.y} rx={m.rx + 6} ry={m.ry + 8} dark={mouthDark} rim={mouthRim} feather={0.22} />
      ) : null}
    </AbsoluteFill>
  );
};
