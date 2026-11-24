/**
 * Szene „mitglieder“ (S.mitglieder, Übergang „sweep“ davor, „zoom“ danach) – Drehbuch: plan/storyboard.md.
 *
 *   Lichtstreif (Video.tsx, an dieser Grenze ohne zusätzlichen Band-Wischer – siehe mood), das Logo zündet im Höhepunkt
 *   des Streifs, der orange Punkt schießt herein und landet als Punkt im V: kurzer Logo-Moment auf „VereinsFlow“. Auf
 *   „alle Mitglieder“ kommt der große Glas-Bildschirm mit der Mitgliederseite (dunkel) aus der Tiefe,
 *   Zeilen fahren ein, „233 Einträge“ zählt hoch; der Punkt bleibt als Lichtpunkt an der Glaskante. Auf „Ihre“ gleitet
 *   er zum Knopf „Import“ und tippt ihn auf „Excel-Liste“ an; die Datei-Karte „mitglieder.csv“ fliegt groß und lesbar vor
 *   den Bildschirm und schrumpft auf „nehmen“ auf den Knopf (Druck, Haken). Dann tritt
 *   der Bildschirm zurück und die Import-Vorschau schiebt sich nach vorn: „1 fehlerhaft“, die Zeile leuchtet auf
 *   „fallen“ rot auf, hebt sich heraus (die Schärfe wandert mit) und zeigt den echten Hinweis.
 *
 * Alles in absoluten Frames aus mitglieder/zeiten.ts (cue/cueEnd). Hintergrund, Vignette, Korn und die Übergänge an
 * den Grenzen macht Video.tsx.
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import { LAYOUT } from "../film";
import { textWidth } from "../lib/measure";
import {
  DotBurst,
  GlassPanel,
  GlowText,
  Layer3D,
  LogoReveal,
  NEON,
  NeonScene3D,
  ScreenPanel,
  blip,
  clamp01,
  easeInOut,
  easeOut,
  invLerp,
  lerp,
  logoDotPosition,
  project,
  rgba,
  screenPanelHeight,
  smooth,
  textGlow,
  toCamera,
} from "../neon";
import type { NeonCamera, Pt, Scene3DSettings } from "../neon";
import { easeIn } from "../neon/util";
import { AppShell } from "../ui/AppShell";
import { IMPORT_ROWS, MEMBERS, MembersPage } from "../ui/members";
import { appear, countUp, formatDE, press, stagger } from "../ui/motion";
import { fontFamily } from "../fonts";
import type { NeonScene } from "./types";
import { CONTENT_PX, CONTENT_X, DateiKarte, ERROR_ROW_TOP, FK_HINT, FK_LINE, FK_W, Fehlerkarte, IMPORT_ROW_H, IMPORT_TABLE_TOP, ImportVorschau, PruefBand, ZeilenGlut, ZeilenSchleier } from "./mitglieder/app";
import { T, W3 } from "./mitglieder/zeiten";

// ---- Bühne ----------------------------------------------------------------------------------
const VW = 1080;
const VH = 1920;
const PERSP = 1700;
const DOF = 2.4;
const MAX_BLUR = 20;
const DIM = 0.45;
const BEZEL = 12;

/** Mitglieder-Bildschirm: 860 breit, zeigt die Seite bis Zeile 4 (unten weich ausgeblendet) */
const MW = 860;
const MSH = 1900;
const MH = screenPanelHeight(MW, MSH);
const MK = (MW - 2 * BEZEL) / 1170;
/** Import-Vorschau: gescrollt bis Schritt 2 + Tabelle (Unterkante von Schritt 1 knapp unter der Kopfzeile) */
const IW = 900;
const ISH = 1520;
const IH = screenPanelHeight(IW, ISH);
const IK = (IW - 2 * BEZEL) / 1170;
const ISCROLL = 1398;
/** Oberkante der Bildschirme */
const TOP = 548;

/** Logo-Moment */
const LOGO_X = 540;
const LOGO_Y = 900;
const LOGO_W = 720;
const LOGO_DOT = logoDotPosition(LOGO_X, LOGO_Y, LOGO_W);

type Pose = { x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number; opacity: number };

const rad = (d: number) => (d * Math.PI) / 180;

/** Punkt auf der Ebene einer Layer3D (lokal, Mitte = 0) → Welt – gleiche Reihenfolge wie der CSS-transform (X · Y · Z) */
const onLayer = (L: Pose, lx: number, ly: number, lz = 0) => {
  let x = lx;
  let y = ly;
  let z = lz;
  let a = rad(L.rotZ);
  [x, y] = [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)];
  a = rad(L.rotY);
  [x, z] = [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
  a = rad(L.rotX);
  [y, z] = [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
  return { x: L.x + x, y: L.y + y, z: L.z + z };
};

/** Bildraum-Punkt einer App-Seite (1170 breit) → lokale Lage auf dem Glas-Bildschirm */
const onScreen = (pw: number, ph: number, k: number, ix: number, iy: number) => ({ x: -pw / 2 + BEZEL + ix * k, y: -ph / 2 + BEZEL + iy * k });

/** Kamera: ruhige, durchgehende Fahrt in die Szene */
const cameraAt = (f: number): NeonCamera => {
  const m = smooth(invLerp(W3.from - 8, W3.to + 8, f));
  return { dolly: lerp(-50, 70, m), orbitY: lerp(-2.5, 2.5, m), orbitX: lerp(1.2, -0.8, m) };
};

const settingsOf = (cam: NeonCamera, focusZ: number): Scene3DSettings => ({
  cam: { dolly: cam.dolly ?? 0, orbitX: cam.orbitX ?? 0, orbitY: cam.orbitY ?? 0, roll: 0, panX: 0, panY: 0, pivot: { x: VW / 2, y: VH / 2, z: 0 } },
  perspective: PERSP,
  focusZ,
  dof: DOF,
  maxBlur: MAX_BLUR,
  dim: DIM,
  dimRange: 1200,
  width: VW,
  height: VH,
});

// ---- Lagen der Ebenen -------------------------------------------------------------------------
const membersPose = (f: number): Pose => {
  const pin = appear(f, T.panelIn, 34);
  const back = appear(f, T.swap, 32);
  return {
    // steigt von unten aus der Tiefe auf (unter dem gehenden Logo durch), tritt beim Wechsel nach links hinten zurück
    x: lerp(540, 290, back),
    y: lerp(2250, TOP + MH / 2, pin),
    z: lerp(-700, 0, pin) - 760 * back,
    rotX: lerp(28, 5, pin),
    rotY: lerp(-18, -7, pin) + 18 * back,
    rotZ: lerp(3, 0, pin),
    opacity: clamp01(pin * 1.8) * (1 - 0.5 * back),
  };
};

const importPose = (f: number): Pose => {
  // schwenkt von rechts vorn herein – immer vor dem zurücktretenden Mitglieder-Bildschirm (kein Durchdringen)
  const p = appear(f, T.swap + 2, 34);
  return {
    x: lerp(1500, 540, p),
    y: lerp(TOP + IH / 2 + 60, TOP + IH / 2, p),
    z: lerp(140, 0, p),
    rotX: lerp(3, 5, p),
    rotY: lerp(-30, -6, p),
    rotZ: lerp(-2, 0, p),
    opacity: clamp01(p * 5),
  };
};

/** Knopf „Import“ (Bildraum x 48–349, y 606–714) auf dem Mitglieder-Bildschirm */
const IMPORT_BTN = onScreen(MW, MH, MK, 198, 660);
/** fehlerhafte Zeile auf der Import-Vorschau (Mitte) */
const ERR_ROW = onScreen(IW, IH, IK, CONTENT_X + CONTENT_PX / 2, ERROR_ROW_TOP - ISCROLL + IMPORT_ROW_H / 2);
/** Fehlerkarte in Bildschirm-px (Maßstab der Vorschau) */
const FK_SW = FK_W * 3 * IK;
const FK_SH = (FK_LINE + FK_HINT) * 3 * IK;
const FK_LINE_S = FK_LINE * 3 * IK;
/**
 * Datei-Karte in Bildschirm-px (Maßstab des Mitglieder-Bildschirms). Die Ebene hat ihre Größe beim Zeigen (× DK_BIG, vor
 * dem Bildschirm: Schrift ≈ 45 / 39 px) – so bleibt die Schrift scharf; zum Landen auf „Import“ wird sie verkleinert.
 */
const DK_BIG = 1.3;
const DK_W = 262 * 3 * MK * DK_BIG;
const DK_H = 62 * 3 * MK * DK_BIG;
/** Maßstab beim Landen (0,8 der Bildschirm-Größe, wie die Knopfreihe) */
const DK_LAND = 0.8 / DK_BIG;
/** Lage beim Zeigen: vor dem Bildschirm über der Liste, unter den Knopfreihen (der Knopf „Import“ bleibt frei) */
const DK_SHOW = { x: 548, y: 1236, z: 100, rotX: 4, rotY: -10, rotZ: -1.5 };

/** so weit (Bildschirm-px) steigt die Fehlerkarte: ihre Unterkante endet knapp über dem leeren Fach (+40 gleicht die Perspektive aus) */
const FK_RISE = FK_SH + 40;
const errorCardPose = (f: number, I: Pose) => {
  const lift = appear(f, T.lift, 26);
  // Start: Zeile der Karte deckt die Tabellenzeile; dann hebt sie sich zur Kamera und etwas nach oben
  const local = { x: ERR_ROW.x, y: ERR_ROW.y + (FK_SH - FK_LINE_S) / 2 - FK_RISE * lift, z: 3 + 150 * lift };
  const p = onLayer(I, local.x, local.y, local.z);
  return {
    ...p,
    rotX: I.rotX * (1 - lift) - 3 * lift,
    rotY: I.rotY * (1 - lift) + 4 * lift,
    rotZ: 0,
    opacity: clamp01((f - T.lift) / 3),
    lift,
  };
};

const chipPose = (f: number, M: Pose) => {
  // 1 fliegt von vorn rechts unten im Bogen groß vor den Bildschirm …
  const pin = appear(f, T.chipIn, T.chipShow - T.chipIn);
  // 2 … schwebt dort lesbar (leichtes Treiben) …
  const hold = smooth(invLerp(T.chipShow, T.chipDrop, f));
  // 3 … und schrumpft im Bogen auf den Knopf „Import“
  const pd = easeInOut(invLerp(T.chipDrop, T.chipLand, f));
  const target = onLayer(M, IMPORT_BTN.x, IMPORT_BTN.y, 10);
  const show = { x: DK_SHOW.x - 8 * hold, y: DK_SHOW.y - 12 * hold, z: DK_SHOW.z + 12 * hold };
  const start = { x: 1260, y: 1820, z: 520 };
  const c1 = { x: 1130, y: 1330, z: 300 };
  const c2 = { x: lerp(show.x, target.x, 0.45), y: Math.min(show.y, target.y) - 40, z: show.z + 20 };
  // quadratische Bahnen (Anflug, dann Ablage)
  const q = (p: number, a: number, b: number, c: number) => (1 - p) * (1 - p) * a + 2 * (1 - p) * p * b + p * p * c;
  const pos =
    pd > 0
      ? { x: q(pd, show.x, c2.x, target.x), y: q(pd, show.y, c2.y, target.y), z: q(pd, show.z, c2.z, target.z) }
      : { x: q(pin, start.x, c1.x, show.x), y: q(pin, start.y, c1.y, show.y), z: q(pin, start.z, c1.z, show.z) };
  // landet, sinkt in den Knopf (Druck), Haken – dann vom Knopf aufgesogen (der Knopf „Import“ ist danach wieder frei)
  const drop = appear(f, T.chipLand, 8);
  const absorb = easeIn(invLerp(T.chipAbsorb, T.chipAbsorb + 8, f), 2);
  const rot = (from: number, shown: number, land: number) => lerp(lerp(from, shown, pin), land, pd);
  return {
    ...pos,
    rotX: rot(-12, DK_SHOW.rotX, M.rotX),
    rotY: rot(-32, DK_SHOW.rotY + 3 * hold, M.rotY),
    rotZ: rot(16, DK_SHOW.rotZ, 0),
    scale: lerp(lerp(1.2, 1, pin), DK_LAND, pd) * (1 - 0.14 * drop) * (1 - 0.78 * absorb),
    opacity: clamp01(pin * 3) * (1 - absorb),
    // Bewegungsunschärfe nur im schnellen Anflug; beim Zeigen scharf
    blur: 10 * (1 - pin) * (1 - pin),
    p: pd,
  };
};

// ---- kleine Teile ------------------------------------------------------------------------------
/** großer weicher Lichtfleck (additiv) für Tiefe im Raum */
const Bokeh: React.FC<{ size: number; color: string; alpha: number }> = ({ size, color, alpha }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      mixBlendMode: "screen",
      background: `radial-gradient(circle, ${rgba(color, alpha)} 0%, ${rgba(color, alpha * 0.55)} 36%, ${rgba(color, alpha * 0.14)} 58%, ${rgba(color, 0)} 70%)`,
    }}
  />
);

/** Schriftgröße, damit eine Zeile in die Breite passt (Manrope 800) */
const fit = (text: string, max: number, width = VW - 2 * 105) => Math.min(max, (width / Math.max(1, textWidth(text, 100, 800, -0.01))) * 100);

type Line = { text: string; starts: number[]; size: number; color?: string; wordColors?: (string | undefined)[] };

/** Kernaussage als Leuchtschrift oben (LAYOUT.headTop), Zeile für Zeile, Wörter im Takt der Stimme */
const Headline: React.FC<{ f: number; lines: Line[]; exit: number; top?: number }> = ({ f, lines, exit, top = LAYOUT.headTop }) => {
  if (exit >= 0.999 || f < lines[0].starts[0] - 2) return null;
  return (
    <div style={{ position: "absolute", left: 0, top, width: VW, display: "flex", flexDirection: "column", alignItems: "center", pointerEvents: "none" }}>
      {lines.map((l, i) => (
        <GlowText
          key={i}
          text={l.text}
          frame={f}
          wordStarts={l.starts}
          fontSize={l.size}
          mode="rise"
          reveal={14}
          echo={2}
          echoLag={0.22}
          glow={1}
          flare={0.9}
          color={l.color}
          wordColors={l.wordColors}
          lineHeight={1.14}
          exit={exit}
          style={{ whiteSpace: "nowrap" }}
        />
      ))}
    </div>
  );
};

/** schwebende Kennzahl-Kachel „233 Einträge“ (Glas, leuchtende Zahl) – zählt mit der Seite hoch */
const ZK_W = 300;
const ZK_H = 184;
const ZaehlerKachel: React.FC<{ value: number; glow: number }> = ({ value, glow }) => (
  <GlassPanel width={ZK_W} height={ZK_H} tint={0.35} glow={0.75} edge={1.3} radius={30}>
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily }}>
      <div
        style={{
          fontWeight: 800,
          fontSize: 92,
          lineHeight: 1,
          letterSpacing: "-0.02em",
          color: NEON.ice,
          fontVariantNumeric: "tabular-nums",
          textShadow: textGlow(glow, NEON.sky, NEON.blue, 1.05),
        }}
      >
        {formatDE(Math.round(value))}
      </div>
      <div style={{ marginTop: 6, fontWeight: 500, fontSize: 30, color: NEON.mist, letterSpacing: "0.01em" }}>Einträge</div>
    </div>
  </GlassPanel>
);

/** Knopf „Import“ als Ablageziel: blaue Lichtkante um den Knopf (Bildraum der Mitgliederseite, x 48–349, y 606–714) */
const KnopfGlut: React.FC<{ k: number; flare: number }> = ({ k, flare }) => {
  if (k <= 0.001) return null;
  const pad = 10;
  return (
    <div
      style={{
        position: "absolute",
        left: 48 - pad,
        top: 606 - pad,
        width: 301 + 2 * pad,
        height: 108 + 2 * pad,
        borderRadius: 40,
        pointerEvents: "none",
        opacity: clamp01(k),
        background: rgba(NEON.blue, 0.12 + 0.2 * flare),
        boxShadow: [
          `inset 0 0 0 4px ${rgba(NEON.sky, 0.9)}`,
          `0 0 24px ${rgba(NEON.sky, 0.6 + 0.3 * flare)}`,
          `0 0 70px ${rgba(NEON.blue, 0.5 + 0.3 * flare)}`,
        ].join(", "),
      }}
    />
  );
};

// ---- Szene ------------------------------------------------------------------------------------
const MitgliederComp: React.FC<{ f: number }> = ({ f }) => {
  const cam = cameraAt(f);
  const M = membersPose(f);
  const I = importPose(f);
  const E = errorCardPose(f, I);
  const D = chipPose(f, M);
  const s0 = settingsOf(cam, 0);
  const showImport = f >= T.swap + 2;
  // Fokus gleitet vom Mitglieder-Bildschirm zur Vorschau (während des Wechsels), dann zur Fehlerkarte
  const swapP = appear(f, T.swap + 2, 34);
  const focusBase = lerp(toCamera(s0, M.x, M.y, M.z).z, toCamera(s0, I.x, I.y, I.z).z, swapP);
  const focusZ = lerp(focusBase, toCamera(s0, E.x, E.y, E.z).z, E.lift * 0.85);
  const s = settingsOf(cam, focusZ);

  // App-Zustände
  const count = countUp(f, T.countAt, T.countEnd - T.countAt, 0, 233);
  const rows = MEMBERS.map((_, i) => stagger(f, T.rowsAt, i, 3));
  const importPressed = Math.max(press(f, T.dotTap, 4), press(f, T.chipLand, 5), press(f, T.chipAbsorb + 6, 5));
  const check = appear(f, T.chipLand + 2, 10);
  // nach dem Tipp des Punkts leuchtet der Knopf als Ablageziel
  const dropTarget = appear(f, T.dotTap + 1, 10) * (1 - appear(f, T.swap - 2, 10));
  // Kachel: kommt mit dem Zählen von vorn, geht (schneller) auf „Ihre“
  const zkIn = appear(f, T.countAt + 10, 22);
  const zkOut = appear(f, T.dotToImport - 8, 9);
  const zk = { x: lerp(980, 790, zkIn) + 60 * zkOut, y: 796 - 30 * zkOut, z: lerp(480, 140, zkIn) + 260 * zkOut, opacity: clamp01(zkIn * 1.6) * (1 - zkOut) };
  const summary = appear(f, T.summaryAt, 10);
  const importRows = IMPORT_ROWS.map((_, i) => stagger(f, T.importRowsAt, i, 3));
  const rowRed = appear(f, T.rowRed, 10);
  // Prüf-Lichtband läuft über die Tabelle und erreicht die fehlerhafte Zeile genau, wenn sie rot wird
  const scanTop = IMPORT_TABLE_TOP + IMPORT_ROW_H - ISCROLL;
  const scanBottom = IMPORT_TABLE_TOP + IMPORT_ROW_H * 7 - ISCROLL;
  const scanHit = ERROR_ROW_TOP + IMPORT_ROW_H / 2 - ISCROLL;
  const scanStart = T.rowRed - 8;
  const scanEnd = scanStart + 8 * ((scanBottom - scanTop) / Math.max(1, scanHit - scanTop));
  const scanP = invLerp(scanStart, scanEnd, f);
  const scanY = lerp(scanTop, scanBottom, scanP);
  const scanA = Math.sin(Math.PI * scanP);
  const rowFlare = blip(f, T.rowRed, 3, 16);
  const open = appear(f, T.hint, 14);

  // Logo-Moment
  const logoExit = easeIn(invLerp(T.logoOut, T.logoOut + 10, f), 2);
  const showLogo = f >= T.logoStart && logoExit < 0.999;

  // Punkt (2D über der Bühne, folgt den Ebenen per project())
  const park = project(s, ...xyz(onLayer(M, -MW / 2 + 10, -MH / 2 + 10, 6)));
  const btn = project(s, ...xyz(onLayer(M, IMPORT_BTN.x, IMPORT_BTN.y, 12)));
  const dot = dotState(f, park, btn);

  // Kernaussagen
  const h1Exit = easeIn(invLerp(T.dotToImport - 6, T.dotToImport + 3, f), 2);
  const h2Exit = easeIn(invLerp(W3.fehler - 10, W3.fehler - 2, f), 2);
  // beide Zeilen gleich groß (die längere bestimmt die Größe)
  const s1 = fit("Alle Mitglieder.", 88);
  const L1: Line[] = [
    { text: "Alle Mitglieder.", starts: [W3.alle - 3, W3.mitglieder - 3], size: s1 },
    { text: "An einem Ort.", starts: [W3.an - 3, W3.einem - 3, W3.ort - 3], size: s1 },
  ];
  const L2: Line[] = [
    { text: "Excel-Liste", starts: [W3.excel - 3], size: 88 },
    { text: "mitnehmen.", starts: [W3.nehmen - 3], size: 88 },
  ];
  const L3: Line[] = [
    { text: "Fehler?", starts: [W3.fehler - 3], size: 88 },
    { text: "Schon vor dem Speichern.", starts: [W3.schon - 3, W3.vor - 3, W3.dem - 3, W3.speichern - 3], size: fit("Schon vor dem Speichern.", 88) },
  ];

  return (
    <AbsoluteFill>
      <NeonScene3D camera={cam} perspective={PERSP} focusZ={focusZ} dof={DOF} maxBlur={MAX_BLUR} dim={DIM}>
        {/* Tiefe: weiche Lichtflecken hinten und vorn */}
        <Layer3D x={150} y={1560} z={-1000} width={620} height={620} sharp noDim opacity={0.9}>
          <Bokeh size={620} color={NEON.blue} alpha={0.42} />
        </Layer3D>
        <Layer3D x={980} y={520} z={-1400} width={760} height={760} sharp noDim opacity={0.8}>
          <Bokeh size={760} color={NEON.deep} alpha={0.4} />
        </Layer3D>
        <Layer3D x={990} y={1740} z={640} width={420} height={420} sharp noDim opacity={smooth(invLerp(T.panelIn, T.panelIn + 30, f))}>
          <Bokeh size={420} color={NEON.sky} alpha={0.2} />
        </Layer3D>

        {/* Mitglieder-Bildschirm */}
        {M.opacity > 0.01 && f < T.swap + 60 ? (
          <Layer3D
            x={M.x}
            y={M.y}
            z={M.z}
            rotX={M.rotX}
            rotY={M.rotY}
            rotZ={M.rotZ}
            width={MW}
            height={MH}
            opacity={M.opacity}
            style={{ maskImage: "linear-gradient(180deg, #000 0%, #000 74%, rgba(0,0,0,0) 98%)", WebkitMaskImage: "linear-gradient(180deg, #000 0%, #000 74%, rgba(0,0,0,0) 98%)" }}
          >
            <ScreenPanel width={MW} screenHeight={MSH} glow={0.9} tint={0.5} edge={1.25} sheen={invLerp(T.panelIn + 8, T.panelIn + 44, f)}>
              <div style={{ position: "relative", width: 1170, height: MSH }}>
                <AppShell height={MSH}>
                  <MembersPage count={count} rowAppear={rows} importPressed={importPressed} headAppear={appear(f, T.panelIn + 6, 16)} />
                </AppShell>
                {/* Ziel leuchtet auf, sobald die Datei-Karte kommt */}
                <KnopfGlut k={dropTarget} flare={0.7 * blip(f, T.dotTap + 1, 2, 12) + blip(f, T.chipLand, 2, 14) + 0.9 * blip(f, T.chipAbsorb + 6, 2, 14)} />
              </div>
            </ScreenPanel>
          </Layer3D>
        ) : null}

        {/* Kennzahl schwebt vor dem Bildschirm, solange gezählt wird */}
        {zk.opacity > 0.01 ? (
          <Layer3D x={zk.x} y={zk.y} z={zk.z} rotY={-14} rotX={4} width={ZK_W} height={ZK_H} opacity={zk.opacity} zBias={300} sharp>
            <ZaehlerKachel value={count} glow={1 + 0.5 * blip(f, T.countEnd - 4, 3, 16)} />
          </Layer3D>
        ) : null}

        {/* Datei-Karte fliegt auf „Import“ */}
        {f >= T.chipIn && D.opacity > 0.01 ? (
          <Layer3D x={D.x} y={D.y} z={D.z} rotX={D.rotX} rotY={D.rotY} rotZ={D.rotZ} scale={D.scale} width={DK_W} height={DK_H} opacity={D.opacity} zBias={400} sharp blur={D.blur}>
            <div style={{ width: 262 * 3, height: 62 * 3, transform: `scale(${MK * DK_BIG})`, transformOrigin: "0 0" }}>
              <DateiKarte check={check} glow={lerp(1.25, 0.8, D.p)} />
            </div>
          </Layer3D>
        ) : null}

        {/* Import-Vorschau */}
        {showImport && I.opacity > 0.01 ? (
          <Layer3D x={I.x} y={I.y} z={I.z} rotX={I.rotX} rotY={I.rotY} rotZ={I.rotZ} width={IW} height={IH} opacity={I.opacity}>
            <ScreenPanel width={IW} screenHeight={ISH} glow={0.95} tint={0.5} edge={1.3} sheen={invLerp(T.swap + 20, T.swap + 56, f)}>
              <div style={{ position: "relative", width: 1170, height: ISH }}>
                <AppShell height={ISH} scrollY={ISCROLL}>
                  <ImportVorschau summaryAppear={summary} rowAppear={importRows} />
                </AppShell>
                <PruefBand y={scanY} alpha={scanA} />
                <ZeilenSchleier top={IMPORT_TABLE_TOP - ISCROLL - 4} bottom={ERROR_ROW_TOP - ISCROLL - 6} k={smooth(invLerp(0.1, 0.75, E.lift))} />
                {/* nach dem Abheben bleibt nur ein dunkles Fach mit schwachem Rest-Rot (≤ 20 %) – das Leuchten gehört zur Karte */}
                <ZeilenGlut
                  top={ERROR_ROW_TOP - ISCROLL}
                  k={rowRed}
                  flare={rowFlare + 0.18 * rowRed * (0.5 + 0.5 * Math.sin((f - T.rowRed) * 0.22))}
                  hollow={smooth(invLerp(0.02, 0.3, E.lift))}
                  rest={lerp(1, 0.2, smooth(invLerp(0.05, 0.7, E.lift)))}
                />
              </div>
            </ScreenPanel>
          </Layer3D>
        ) : null}

        {/* fehlerhafte Zeile hebt sich heraus */}
        {f >= T.lift && E.opacity > 0.01 ? (
          <Layer3D x={E.x} y={E.y} z={E.z} rotX={E.rotX} rotY={E.rotY} rotZ={E.rotZ} scale={1 - 0.04 * E.lift} width={FK_SW} height={FK_SH} opacity={E.opacity} zBias={400} sharp>
            <div style={{ width: FK_W * 3, height: (FK_LINE + FK_HINT) * 3, transform: `scale(${IK})`, transformOrigin: "0 0" }}>
              <Fehlerkarte open={open} glow={lerp(0.6, 1.25, E.lift) + 0.4 * blip(f, T.hint, 3, 14)} />
            </div>
          </Layer3D>
        ) : null}
      </NeonScene3D>

      {/* Logo-Moment auf „VereinsFlow“ */}
      {showLogo ? (
        <AbsoluteFill style={{ transform: `translateY(${(-70 * logoExit).toFixed(2)}px) scale(${(1 - 0.1 * logoExit).toFixed(4)})`, transformOrigin: `${LOGO_X}px ${LOGO_Y}px` }}>
          <LogoReveal frame={f} start={T.logoStart} x={LOGO_X} y={LOGO_Y} width={LOGO_W} hideDot tighten={34} exit={logoExit} />
        </AbsoluteFill>
      ) : null}

      {dot ? <DotBurst frame={f} {...dot} /> : null}

      <Headline f={f} lines={L1} exit={h1Exit} />
      <Headline f={f} lines={L2} exit={h2Exit} />
      <Headline f={f} lines={L3} exit={0} />
    </AbsoluteFill>
  );
};

const xyz = (p: { x: number; y: number; z: number }): [number, number, number] => [p.x, p.y, p.z];

type DotProps = React.ComponentProps<typeof DotBurst>;

/** Der orange Punkt: Flug ins Logo, Logo-Moment, Lichtpunkt an der Glaskante, Tipp auf „Import“, dann aufgesogen */
type Spot = { x: number; y: number; scale: number };
const dotState = (f: number, park: Spot, btn: Spot): DotProps | null => {
  const r0 = LOGO_DOT.r * 2;
  if (f < T.dotStart) return null;
  // 1 Flug ins V
  if (f < T.dotLand) {
    const path: Pt[] = [
      { x: -170, y: 1760 },
      { x: 220, y: 1440 },
      { x: 300, y: 1110 },
      { x: LOGO_DOT.x - 150, y: LOGO_DOT.y - 30 },
      { x: LOGO_DOT.x, y: LOGO_DOT.y },
    ];
    return { path, pathProgress: easeOut(invLerp(T.dotStart, T.dotLand, f), 2.2), trail: 0.26, size: r0, glow: 1.3, flare: 1, rays: 0.9 };
  }
  // 2 Logo-Moment: Punkt sitzt im V, Druckwelle bei der Landung; bleibt kurz allein stehen, wenn die Wortmarke geht
  const settle = smooth(invLerp(T.dotLand + 4, T.dotLand + 40, f));
  if (f < T.dotLeave) {
    return { x: LOGO_DOT.x, y: LOGO_DOT.y, size: r0, glow: lerp(1.3, 0.6, settle), flare: lerp(1, 0.3, settle), rays: lerp(0.9, 0.25, settle), burst: invLerp(T.dotLand, T.dotLand + 34, f) };
  }
  const small = 20 * park.scale;
  // 3 Flug an die Glaskante (oben links am Mitglieder-Bildschirm)
  if (f < T.dotPark) {
    const p = easeInOut(invLerp(T.dotLeave, T.dotPark, f));
    const path: Pt[] = [
      { x: LOGO_DOT.x, y: LOGO_DOT.y },
      { x: LOGO_DOT.x - 120, y: LOGO_DOT.y - 10 },
      { x: park.x + 30, y: park.y - 60 },
      { x: park.x, y: park.y },
    ];
    return { path, pathProgress: p, trail: 0.2, size: lerp(r0, small, p), glow: lerp(0.7, 0.75, p), flare: lerp(0.35, 0.5, p), rays: 0.3 };
  }
  // 4 Lichtpunkt an der Glaskante
  if (f < T.dotToImport) {
    const breathe = 0.5 + 0.5 * Math.sin((f - T.dotPark) * 0.16);
    // kurzes Aufglimmen beim Ankommen an der Kante, dann ruhiges Atmen
    return { x: park.x, y: park.y, size: small, glow: 0.7 + 0.12 * breathe + 0.5 * blip(f, T.dotPark, 2, 12), flare: 0.45, rays: 0.3, pulse: 0.08 * breathe + 0.35 * blip(f, T.dotPark, 2, 10) };
  }
  // 5 gleitet auf „Ihre“ zum Knopf „Import“ …
  const tapSize = 22 * btn.scale;
  const fade = smooth(invLerp(T.dotTap + 2, T.dotTap + 12, f));
  if (fade >= 0.999) return null;
  const g = easeInOut(invLerp(T.dotToImport, T.dotTap, f));
  const path: Pt[] = [
    { x: park.x, y: park.y },
    { x: lerp(park.x, btn.x, 0.5) - 40, y: lerp(park.y, btn.y, 0.5) },
    { x: btn.x, y: btn.y },
  ];
  // 6 … tippt ihn auf „Excel-Liste“ an (Druck, Druckwelle) und sinkt in den Knopf, während die Datei-Karte groß vor dem
  //   Bildschirm erscheint. Die Karte landet später ohne Punkt – kein Tipp-Ring und kein Lichtstreif auf ihrer Schrift.
  return {
    path,
    pathProgress: g,
    trail: g < 1 ? 0.18 : 0,
    size: lerp(small, tapSize, g) * (1 - 0.6 * fade),
    glow: 0.8 + 0.5 * blip(f, T.dotTap, 2, 12),
    flare: 0.45,
    rays: 0.35,
    burst: invLerp(T.dotTap, T.dotTap + 16, f),
    opacity: 1 - fade,
  };
};

export const mitglieder: NeonScene = {
  id: "mitglieder",
  Comp: MitgliederComp,
  // Logo-Moment mit etwas helleren, leicht warmen Bändern; danach gedämpft, damit die App wirkt
  mood: (f) => {
    const k = smooth(invLerp(T.logoOut - 4, T.logoOut + 16, f));
    // An der sweep-Grenze ist der Lichtstreif (Video.tsx) das einzige Lichtereignis – keinen eigenen Wischer setzen.
    return { ribbons: lerp(0.62, 0.38, k), tint: lerp(0.34, 0.25, k), warm: lerp(0.14, 0, k), particles: 0.35 };
  },
};
