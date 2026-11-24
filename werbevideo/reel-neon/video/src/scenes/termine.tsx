/**
 * Szene „termine“ (18–26 s): Abschnitt 4 der Stimme – „Das Training am Donnerstag steht im Kalender. Wer kommt, sagt zu.
 * Wer nicht kann, – Ganz ohne Rundfrage im Chat.“
 *
 * Ablauf (alle Zeiten aus cue(), Abschnitt 4):
 *   Kalender   Glas-Bildschirm mit dem Kalender der App (dunkel) kommt aus der Tiefe; auf „Das Training“ scrollt die Liste
 *              zum Donnerstag. Auf „Kalender“ leuchtet „Fußball-Training D-Jugend · Donnerstag, 3. Juni 2027“ auf und
 *              steigt als Glaskarte aus dem Bildschirm. Leuchtschrift „Steht im Kalender.“ (steht/im/kalender).
 *   Zusage     Kamera fährt seitlich zur Terminseite; auf „kommt“ hebt sich „Deine Teilnahme“ heraus, der orange Punkt
 *              tippt auf „sagt“ „Zusagen“ → „Du hast zugesagt.“ + „Abmelden“. Leuchtschrift „Wer kommt, sagt zu.“
 *   Absage     Auf „Wer nicht kann“ schwebt darunter eine zweite Karte ein, der Punkt tippt auf „kann“ „Absagen“ →
 *              „Du hast abgesagt.“ + „Doch zusagen“ (Zustand der App laut rsvp-panel.tsx; dass die App dort derzeit
 *              zusätzlich „Zusagen“ zeigt, ist ein App-Fehler – der Film zeigt den gemeinten Zustand). Zweite Zeile
 *              „Wer nicht kann, sagt ab.“
 *   Chat       Auf „Ganz“ treibt die alte Blase „Wer kommt Do??“ herein, der Punkt trifft sie auf „Rundfrage“, sie
 *              zerfällt in Lichtpartikel. Leuchtschrift „Ohne Rundfrage im Chat.“
 * Beide Grenzen sind „zoom“ (Video.tsx): am Anfang steht der Kalender schon im Bild, am Ende die beiden Karten mit Schrift.
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import { LAYOUT, LEAD, S, TAIL } from "../film";
import { cue, cueEnd } from "../lib/timeline";
import {
  DotBurst,
  GlassPanel,
  GlowText,
  Layer3D,
  NEON,
  NeonScene3D,
  ScreenPanel,
  blip,
  clamp01,
  easeInOut,
  invLerp,
  lerp,
  project,
  rgba,
  screenPanelHeight,
  smooth,
  type Pt,
} from "../neon";
import { AppShell } from "../ui/AppShell";
import { EventDetailPage, RsvpCard } from "../ui/events";
import { appear, press } from "../ui/motion";
import { BLASE_H, BLASE_W, ChatBlase } from "./termine/ChatBlase";
import { DonnerstagBlock, KAL_SCREEN_H, KalenderSeite, KAL_SCROLL, THU_BLOCK_H, THU_SHOW } from "./termine/KalenderSeite";
import { AbsageKarte, KARTE_W, SCHWEBE_H, SCHWEBE_W, SchwebeKarte, absagenPunkt, zusagenPunkt } from "./termine/Karten";
import { type Cam, DIM, DIM_RANGE, DOF, MAX_BLUR, PERSPECTIVE, type Pose, mixPose, onPlane, pivotOf, stageSettings } from "./termine/raum";
import { Welle } from "./termine/Welle";
import type { NeonScene } from "./types";

// ---- Zeiten (absolute Frames) -------------------------------------------------------------------------------------
const A = S.termine.from;
const B = S.termine.to;
const c4 = (w: string, nth = 0) => cue(w, { section: 4, nth });
const T = {
  das: c4("das"),
  steht: c4("steht"),
  im: c4("im"),
  kalender: c4("kalender"),
  wer: c4("wer"),
  kommt: c4("kommt"),
  sagt: c4("sagt"),
  zu: c4("zu"),
  wer2: c4("wer", 1),
  nicht: c4("nicht"),
  kann: c4("kann"),
  kannEnd: cueEnd("kann", { section: 4 }),
  ganz: c4("ganz"),
  ohne: c4("ohne"),
  rundfrage: c4("rundfrage"),
  im2: c4("im", 1),
  chat: c4("chat"),
};
/** Liste scrollt zum Donnerstag (landet um „Donnerstag“) */
const SCROLL_AT = T.das;
const SCROLL_DUR = 44;
/** Donnerstag steigt als Glaskarte aus dem Bildschirm */
const LIFT_E = T.kalender;
/** Kamera fährt seitlich zur Terminseite */
const TRUCK = T.kalender + 15;
const TRUCK_DUR = 24;
/** „Deine Teilnahme“ hebt sich */
const LIFT_1 = T.kommt;
const LIFT_DUR = 22;
/** Punkt fliegt ein und tippt „Zusagen“ */
const DOT_IN = T.kommt + 6;
const TAP_1 = T.sagt + 1;
/** zweite Karte schwebt ein, Punkt tippt „Absagen“ */
const CARD_2 = T.wer2 - 6;
const DOT_2 = TAP_1 + 15;
const TAP_2 = T.kann + 2;
/** Leuchtschrift „Wer kommt …“ geht kurz vor „Ganz“, „Ohne Rundfrage im Chat.“ steht kurz vor dem gesprochenen „ohne“ */
const TEXT2_OUT = T.ganz - 2;
const TEXT4_AT = TEXT2_OUT + 5;
/** Chat-Blase treibt herein, Punkt trifft sie, sie zerfällt */
const BUBBLE_IN = T.ganz;
const DOT_3 = T.ohne + 2;
const IMPACT = T.rundfrage + 3;

// ---- Raum ---------------------------------------------------------------------------------------------------------
/** seitlicher Weg der Kamera vom Kalender zur Terminseite */
const PAN = 1000;

const camAt = (f: number): Cam => {
  const tr = appear(f, TRUCK, TRUCK_DUR);
  const bump = Math.sin(Math.PI * tr);
  const dA = smooth(invLerp(A - LEAD, TRUCK, f));
  const dB = smooth(invLerp(TRUCK + TRUCK_DUR, B + TAIL, f));
  return {
    panX: PAN * tr,
    // langsame Fahrt hinein, beim Schwenk kurz zurück (Raum öffnet sich), danach wieder sanft heran
    dolly: lerp(-80, 0, dA) - 160 * bump + 60 * dB,
    orbitY: lerp(5, 1.5, dA) + 5 * bump - 3 * dB,
    orbitX: lerp(3.5, 2, dA) + 1.2 * dB,
  };
};

/** Kalender-Bildschirm */
const PA_W = 860;
const PA_H = screenPanelHeight(PA_W, KAL_SCREEN_H);
const KA = (PA_W - 24) / 1170;
const PA: Pose = { x: 540, y: 1032, z: 0, rotX: 4, rotY: 8, scale: 1 };

/** Terminseite */
const EV_SCREEN_H = 1700;
const PB_W = 820;
const PB_H = screenPanelHeight(PB_W, EV_SCREEN_H);
const KB = (PB_W - 24) / 1170;
const PB: Pose = { x: 540 + PAN, y: 1060, z: -260, rotX: 4, rotY: -6, scale: 1 };
/** so weit weicht die Terminseite zurück, wenn „Deine Teilnahme“ herauskommt */
const PB_BACK = 260;
/**
 * Mit dem Herausheben blendet der untere Teil der Terminseite (leerer Kartenplatz + „Details“) nach unten aus – sonst
 * steht dort, abgedunkelt und unscharf, ein flacher schwarzer Kasten unter der Karte. Kopf, Titel und Knöpfe bleiben.
 * Werte in px der Glasfläche (Höhe PB_H ≈ 1181): Knöpfe enden bei ≈ 553, der Kartenplatz liegt bei ≈ 606–977.
 */
const PB_FADE_FROM = 540;
const PB_FADE_TO = 760;
/** Rand der Maske, damit der Schein der Glaskante oben und seitlich nicht abgeschnitten wird */
const PB_MASK_PAD = 140;
const pageMask = (u: number): React.CSSProperties | undefined => {
  if (u <= 0.001) return undefined;
  const full = PB_H + 2 * PB_MASK_PAD;
  const a = lerp(full, PB_MASK_PAD + PB_FADE_FROM, u);
  const b = lerp(full + 320, PB_MASK_PAD + PB_FADE_TO, u);
  const g = `linear-gradient(180deg, #000 ${a.toFixed(1)}px, rgba(0,0,0,0) ${b.toFixed(1)}px)`;
  return { maskImage: g, WebkitMaskImage: g, maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat" };
};

/** Glaskarte „Donnerstag“ (Überschrift + Training) – Lage im Kalender-Bildschirm */
const E_PAD = 30;
const E_W = KARTE_W + 2 * E_PAD;
const E_H = THU_BLOCK_H + 2 * E_PAD;
const E_LX = -PA_W / 2 + 12 + 585 * KA;
const E_LY = -PA_H / 2 + 12 + (THU_SHOW + THU_BLOCK_H / 2) * KA;

const ePose = (u: number): Pose => {
  const p = onPlane(PA, E_LX, E_LY, 2 + 170 * u);
  return { ...p, rotX: PA.rotX * (1 - 0.5 * u), rotY: PA.rotY * (1 - 0.5 * u), scale: KA * (1 + 0.03 * u) };
};

/** „Deine Teilnahme“: im Bildschirm (Karte y 873–1419, Mitte 1146) → schwebend */
const C1_START = (() => {
  const p = onPlane(PB, -PB_W / 2 + 12 + 585 * KB, -PB_H / 2 + 12 + 1146 * KB, 2);
  return { ...p, rotX: PB.rotX, rotY: PB.rotY, scale: KB };
})();
/** erst mittig (allein im Bild), mit der zweiten Karte nach oben */
const C1_MID: Pose = { x: 540 + PAN, y: 900, z: 90, rotX: 2, rotY: -4, scale: 0.71 };
const C1_END: Pose = { ...C1_MID, y: 742 };
const c1Pose = (f: number): Pose => {
  const u = appear(f, LIFT_1, LIFT_DUR);
  const p = mixPose(mixPose(C1_START, C1_MID, u), C1_END, appear(f, CARD_2 - 2, 18));
  // Bogen: steigt erst zur Kamera, dann an seinen Platz
  return { ...p, z: p.z + 140 * Math.sin(Math.PI * u) };
};

/** zweite Karte (Absage) schwebt von rechts aus der Tiefe ein */
const C2_START: Pose = { x: 556 + PAN + 620, y: 1300, z: -220, rotX: 2, rotY: -30, scale: 0.71 };
const C2_END: Pose = { x: 556 + PAN, y: 1242, z: 120, rotX: 2, rotY: -4, scale: 0.71 };
const c2Pose = (f: number): Pose => mixPose(C2_START, C2_END, appear(f, CARD_2, 18));

/** Schärfe: Kalender → Terminseite → schwebende Karten */
const focusWorld = (f: number) => {
  const tr = appear(f, TRUCK, TRUCK_DUR);
  const l1 = appear(f, LIFT_1, LIFT_DUR);
  return lerp(lerp(PA.z, PB.z, tr), C1_END.z, l1);
};

/** Bewegungsunschärfe beim Schwenk (px) */
const truckBlur = (f: number) => Math.min(5, Math.abs(camAt(f + 0.5).panX - camAt(f - 0.5).panX) * 0.05);

// ---- Chat-Blase ---------------------------------------------------------------------------------------------------
const bubbleState = (f: number) => {
  const u = appear(f, BUBBLE_IN, 18);
  const drift = Math.max(0, f - (BUBBLE_IN + 18)) * 0.5;
  return { u, x: lerp(-440, 500, u) + drift, y: lerp(1050, 992, u), rot: lerp(-10, -3, u) };
};
const IMPACT_LOCAL = { x: BLASE_W - 70, y: BLASE_H / 2 - 4 };
const bubbleImpact = (f: number): Pt => {
  const b = bubbleState(f);
  const a = (b.rot * Math.PI) / 180;
  const dx = IMPACT_LOCAL.x - BLASE_W / 2;
  const dy = IMPACT_LOCAL.y - BLASE_H / 2;
  return { x: b.x + dx * Math.cos(a) - dy * Math.sin(a), y: b.y + dx * Math.sin(a) + dy * Math.cos(a) };
};

// ---- Bausteine ----------------------------------------------------------------------------------------------------
/** ferne, dunkle Glaskarten (Tiefe, Parallaxe beim Schwenk) */
const DECO = [
  { x: -70, y: 610, z: -700, rotY: 22, w: 420, h: 300 },
  { x: 1150, y: 1500, z: -560, rotY: -24, w: 340, h: 440 },
  { x: 1130, y: 470, z: -900, rotY: -18, w: 380, h: 260 },
  { x: PAN + 1150, y: 600, z: -720, rotY: -22, w: 440, h: 300 },
  { x: PAN - 140, y: 1560, z: -600, rotY: 20, w: 360, h: 260 },
  { x: PAN + 1060, y: 1560, z: -980, rotY: -16, w: 420, h: 300 },
];

const DecoCard: React.FC<{ w: number; h: number; i: number }> = ({ w, h, i }) => (
  <GlassPanel width={w} height={h} tint={0.5} glow={0.35} radius={30} padding={30}>
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {[0.62, 0.9, 0.48, 0.75].slice(0, 2 + (i % 3)).map((k, j) => (
        <div key={j} style={{ width: `${k * 100}%`, height: j === 0 ? 22 : 14, borderRadius: 8, background: rgba(NEON.ice, j === 0 ? 0.3 : 0.16) }} />
      ))}
    </div>
  </GlassPanel>
);

/** weicher Lichtpunkt (ersetzt unscharfe Sterne der Referenz) */
const Bokeh: React.FC<{ size: number; color: string; alpha: number }> = ({ size, color, alpha }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      mixBlendMode: "screen",
      background: `radial-gradient(circle, ${rgba(color, alpha)} 0%, ${rgba(color, alpha * 0.6)} 36%, ${rgba(color, alpha * 0.16)} 58%, ${rgba(color, 0)} 70%)`,
    }}
  />
);

const BOKEH = [
  { x: 420 + PAN * 0.45, y: 1760, z: 470, size: 380, color: NEON.sky, alpha: 0.2 },
  { x: PAN + 980, y: 420, z: -1200, size: 560, color: NEON.blue, alpha: 0.38 },
  { x: -220, y: 1260, z: -1100, size: 600, color: NEON.blue, alpha: 0.34 },
];

/** Zeilenabstand der zweizeiligen Leuchtschrift (66 px · 1,12 + Luft) */
const LINE = 80;

/** eine Zeile Leuchtschrift, mittig, Oberkante `top` */
const HeadLine: React.FC<{ top: number; children: React.ReactNode }> = ({ top, children }) => (
  <div style={{ position: "absolute", left: 40, right: 40, top, display: "flex", justifyContent: "center" }}>{children}</div>
);

// ---- Szene --------------------------------------------------------------------------------------------------------
const TermineComp: React.FC<{ f: number }> = ({ f }) => {
  const cam = camAt(f);
  const focusZ = cam.dolly + focusWorld(f);
  const set = stageSettings(cam, focusZ);
  const mb = truckBlur(f);

  // Kalender: Scroll, Aufleuchten, Herausheben
  const scrollP = appear(f, SCROLL_AT, SCROLL_DUR);
  const scrollY = KAL_SCROLL * scrollP;
  const scrollV = Math.abs(appear(f + 0.5, SCROLL_AT, SCROLL_DUR) - appear(f - 0.5, SCROLL_AT, SCROLL_DUR)) * KAL_SCROLL;
  const eLift = appear(f, LIFT_E, 13);
  const eGlow = clamp01(invLerp(LIFT_E - 2, LIFT_E + 4, f)) * (0.75 + 0.9 * blip(f, LIFT_E, 4, 22));
  const showA = f < TRUCK + TRUCK_DUR + 4;

  // Terminseite und Karten
  const showB = f >= TRUCK - 4;
  const l1 = appear(f, LIFT_1, LIFT_DUR);
  const p1 = c1Pose(f);
  const c2u = appear(f, CARD_2, 18);
  const p2 = c2Pose(f);
  const rsvp1 = appear(f, TAP_1 + 3, 22);
  const rsvp2 = appear(f, TAP_2 + 3, 22);
  const glow1 = lerp(0, 0.75, l1) + 0.8 * blip(f, TAP_1, 3, 20);
  const glow2 = 0.75 * clamp01(c2u * 1.4) + 0.8 * blip(f, TAP_2, 3, 20);

  // Chat-Blase
  const bub = bubbleState(f);
  const dissolve = clamp01((f - IMPACT) / 16);
  const shade = bub.u * (1 - smooth(dissolve));

  // Tipp-Punkt: Ziele aus der Projektion der Knöpfe (bleibt auf den Knöpfen, auch wenn die Kamera driftet)
  const proj = (p: Pose, l: { x: number; y: number }) => {
    const w = onPlane(p, l.x, l.y, 0);
    const s = project(set, w.x, w.y, w.z);
    return { x: s.x, y: s.y };
  };
  const zTarget = proj(p1, zusagenPunkt());
  const aTarget = proj(p2, absagenPunkt());
  const bTarget = bubbleImpact(f);
  let dot: React.ReactNode = null;
  if (f >= DOT_IN) {
    const common = { frame: f, size: 26, rays: 0.3 };
    const fadeIn = smooth(invLerp(DOT_IN, DOT_IN + 4, f));
    const fadeOut = 1 - smooth(invLerp(IMPACT + 2, IMPACT + 14, f));
    const pulse = 0.5 * Math.sin(Math.PI * invLerp(TAP_1 - 1, TAP_1 + 8, f)) + 0.5 * Math.sin(Math.PI * invLerp(TAP_2 - 1, TAP_2 + 8, f)) + 0.8 * Math.sin(Math.PI * invLerp(IMPACT - 1, IMPACT + 10, f));
    const flight = (path: Pt[], from: number, to: number) => {
      const u = easeInOut(invLerp(from, to, f));
      return <DotBurst {...common} path={path} pathProgress={u} trail={0.22 * Math.sin(Math.PI * u)} glow={0.95} flare={0.45} burst={0} opacity={fadeIn * fadeOut} />;
    };
    const rest = (p: Pt) => <DotBurst {...common} x={p.x} y={p.y} glow={0.7} flare={0.2} burst={0} pulse={Math.max(0, pulse)} opacity={fadeIn * fadeOut} />;
    // nach dem Tipp gleitet der Punkt vom Knopf weg in die freie Kartenhälfte (der Knopf wechselt dort seine Bedeutung)
    const aside = (p: Pt, tap: number, dx: number) => {
      const k = appear(f, tap + 5, 12);
      return { x: p.x + dx * k, y: p.y - 18 * k };
    };
    const zRest = aside(zTarget, TAP_1, 330);
    const aRest = aside(aTarget, TAP_2, 190);
    if (f < TAP_1 - 2) dot = flight([{ x: 1180, y: 1540 }, { x: 960, y: 1260 }, { x: zTarget.x + 120, y: zTarget.y + 70 }, zTarget], DOT_IN, TAP_1 - 2);
    else if (f < DOT_2) dot = rest(zRest);
    else if (f < TAP_2 - 2) dot = flight([zRest, { x: Math.max(zRest.x, aTarget.x) + 150, y: (zRest.y + aTarget.y) / 2 }, aTarget], DOT_2, TAP_2 - 2);
    else if (f < DOT_3) dot = rest(aRest);
    else if (f < IMPACT) dot = flight([aRest, { x: aRest.x + 90, y: (aRest.y + bTarget.y) / 2 + 30 }, bTarget], DOT_3, IMPACT);
    else dot = rest(bTarget);
  }

  // Druckwellen bleiben am Tipp-/Aufprallort (wandern nicht mit dem Punkt weiter)
  const waves = (
    <>
      <Welle x={zTarget.x} y={zTarget.y} p={invLerp(TAP_1, TAP_1 + 18, f)} size={300} />
      <Welle x={aTarget.x} y={aTarget.y} p={invLerp(TAP_2, TAP_2 + 18, f)} size={300} />
      <Welle x={bTarget.x} y={bTarget.y} p={invLerp(IMPACT, IMPACT + 24, f)} size={470} />
    </>
  );

  // Leuchtschrift
  const out1 = appear(f, TRUCK, 9);
  const out2 = appear(f, TEXT2_OUT, 8);
  const head = { fontSize: 66, weight: 800 as const, glow: 0.95, flare: 1.1, mode: "rise" as const, echo: 2, reveal: 16 };

  return (
    <AbsoluteFill>
      {/* Bühnenlicht hinter den Bildschirmen */}
      <div
        style={{
          position: "absolute",
          left: 540 - 760,
          top: 1010 - 760,
          width: 1520,
          height: 1520,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${rgba(NEON.blue, 0.16)} 0%, ${rgba(NEON.blue, 0.06)} 40%, ${rgba(NEON.blue, 0)} 70%)`,
          mixBlendMode: "screen",
        }}
      />
      <NeonScene3D
        camera={{ dolly: cam.dolly, orbitX: cam.orbitX, orbitY: cam.orbitY, panX: cam.panX, pivot: pivotOf(cam) }}
        perspective={PERSPECTIVE}
        focusZ={focusZ}
        dof={DOF}
        maxBlur={MAX_BLUR}
        dim={DIM}
        dimRange={DIM_RANGE}
      >
        {BOKEH.map((b, i) => (
          <Layer3D key={`b${i}`} x={b.x} y={b.y} z={b.z} width={b.size} height={b.size} sharp noDim>
            <Bokeh size={b.size} color={b.color} alpha={b.alpha} />
          </Layer3D>
        ))}
        {DECO.map((d, i) => (
          <Layer3D key={`d${i}`} x={d.x} y={d.y} z={d.z} rotY={d.rotY} rotX={3} width={d.w} height={d.h} blur={mb} opacity={0.85}>
            <DecoCard w={d.w} h={d.h} i={i} />
          </Layer3D>
        ))}

        {/* Kalender auf Glas */}
        {showA ? (
          <Layer3D x={PA.x} y={PA.y} z={PA.z} rotX={PA.rotX} rotY={PA.rotY} width={PA_W} height={PA_H} blur={mb}>
            <ScreenPanel width={PA_W} screenHeight={KAL_SCREEN_H} glow={0.9} tint={0.3} edge={1.2}>
              <KalenderSeite scrollY={scrollY} motionBlur={Math.min(14, scrollV * 0.22)} lifted={eLift > 0.001 ? 1 : 0} highlight={0} />
              {/* Bildschirm tritt zurück, wenn die Karte heraussteigt */}
              <div style={{ position: "absolute", inset: 0, background: rgba("#020409", 0.42 * eLift) }} />
            </ScreenPanel>
          </Layer3D>
        ) : null}
        {showA && eLift > 0.001
          ? (() => {
              const p = ePose(eLift);
              return (
                <Layer3D x={p.x} y={p.y} z={p.z} rotX={p.rotX} rotY={p.rotY} scale={p.scale} width={E_W} height={E_H} sharp noDim zBias={200} blur={mb}>
                  <SchwebeKarte glass={eLift} glow={eGlow} width={E_W} height={E_H} pad={E_PAD} sheen={invLerp(LIFT_E + 4, LIFT_E + 30, f)}>
                    {/* Stück Seitengrund unter dem Block (wie aus dem Bildschirm geschnitten) */}
                    <div style={{ position: "absolute", left: -12, top: -12, width: KARTE_W + 24, height: THU_BLOCK_H + 24, borderRadius: 30, background: "#0A0A0B", opacity: eLift }} />
                    <div style={{ position: "relative" }}>
                      <DonnerstagBlock highlight={clamp01(invLerp(LIFT_E, LIFT_E + 6, f))} />
                    </div>
                  </SchwebeKarte>
                </Layer3D>
              );
            })()
          : null}

        {/* Terminseite auf Glas */}
        {showB ? (
          <Layer3D x={PB.x} y={PB.y + 40 * l1} z={PB.z - PB_BACK * l1} rotX={PB.rotX + 3 * l1} rotY={PB.rotY} width={PB_W} height={PB_H} blur={mb}>
            <div style={{ position: "absolute", left: -PB_MASK_PAD, top: -PB_MASK_PAD, boxSizing: "content-box", width: PB_W, height: PB_H, padding: PB_MASK_PAD, ...pageMask(l1) }}>
              <ScreenPanel width={PB_W} screenHeight={EV_SCREEN_H} glow={0.8} tint={0.3} edge={1.1}>
                <AppShell height={EV_SCREEN_H}>
                  <EventDetailPage cardAppear={l1 > 0.001 ? 0 : 1} />
                </AppShell>
                <div style={{ position: "absolute", inset: 0, background: rgba("#020409", 0.52 * l1) }} />
              </ScreenPanel>
            </div>
          </Layer3D>
        ) : null}
        {l1 > 0.001 ? (
          <Layer3D x={p1.x} y={p1.y} z={p1.z} rotX={p1.rotX} rotY={p1.rotY} scale={p1.scale} width={SCHWEBE_W} height={SCHWEBE_H} sharp noDim zBias={300}>
            <SchwebeKarte glass={l1} glow={glow1} sheen={invLerp(LIFT_1 + 6, LIFT_1 + 34, f)}>
              <RsvpCard progress={rsvp1} pressed={press(f, TAP_1)} />
            </SchwebeKarte>
          </Layer3D>
        ) : null}
        {c2u > 0.001 ? (
          <Layer3D x={p2.x} y={p2.y} z={p2.z} rotX={p2.rotX} rotY={p2.rotY} scale={p2.scale} width={SCHWEBE_W} height={SCHWEBE_H} sharp noDim zBias={300} opacity={clamp01(c2u * 1.6)}>
            <SchwebeKarte glass={1} glow={glow2} sheen={invLerp(CARD_2 + 8, CARD_2 + 36, f)}>
              <AbsageKarte progress={rsvp2} pressed={press(f, TAP_2)} />
            </SchwebeKarte>
          </Layer3D>
        ) : null}
      </NeonScene3D>

      {/* Chat-Blase: Schatten dahinter, Blase, Zerfall */}
      {shade > 0.002 ? (
        <div
          style={{
            position: "absolute",
            left: bub.x - 560,
            top: bub.y - 300,
            width: 1120,
            height: 600,
            borderRadius: "50%",
            opacity: shade,
            background: `radial-gradient(50% 50% at 50% 50%, ${rgba("#020409", 0.72)} 0%, ${rgba("#020409", 0.42)} 45%, ${rgba("#020409", 0)} 100%)`,
          }}
        />
      ) : null}
      {f >= BUBBLE_IN - 1 ? <ChatBlase f={f} x={bub.x} y={bub.y} rot={bub.rot} appear={bub.u * 1.3} impactAt={IMPACT} impact={IMPACT_LOCAL} /> : null}

      {waves}
      {dot}

      {/* Leuchtschrift oben – jede Zeile fest an ihrem Platz (Abgang und Auftritt dürfen sich überlappen, nichts rückt nach) */}
      {f < TRUCK + 12 ? (
        <HeadLine top={LAYOUT.headTop}>
          <GlowText text="Steht im Kalender." frame={f} wordStarts={[T.steht, T.im, T.kalender]} {...head} exit={out1} />
        </HeadLine>
      ) : null}
      {f >= T.wer - 1 && f < TEXT2_OUT + 11 ? (
        <HeadLine top={LAYOUT.headTop}>
          <GlowText text="Wer kommt, sagt zu." frame={f} wordStarts={[T.wer, T.kommt, T.sagt, T.zu]} {...head} exit={out2} />
        </HeadLine>
      ) : null}
      {f >= T.wer2 - 1 && f < TEXT2_OUT + 11 ? (
        <HeadLine top={LAYOUT.headTop + LINE}>
          {/* „sagt ab.“ spricht die Stimme nicht – folgt direkt auf „kann,“ (kürzerer Auftritt) */}
          <GlowText text="Wer nicht kann, sagt ab." frame={f} wordStarts={[T.wer2, T.nicht, T.kann, T.kannEnd - 1, T.kannEnd + 2]} {...head} reveal={11} exit={out2} />
        </HeadLine>
      ) : null}
      {f >= TEXT4_AT - 1 ? (
        <HeadLine top={LAYOUT.headTop}>
          {/* kürzerer Auftritt: „Chat.“ steht, bevor der Zoom zur nächsten Szene beginnt */}
          <GlowText text="Ohne Rundfrage im Chat." frame={f} wordStarts={[TEXT4_AT, Math.max(T.rundfrage, TEXT4_AT + 4), T.im2 - 2, T.chat - 3]} {...head} reveal={10} />
        </HeadLine>
      ) : null}
    </AbsoluteFill>
  );
};

export const termine: NeonScene = {
  id: "termine",
  Comp: TermineComp,
  // Bänder ruhig am Rand, etwas heller Himmel; beim Zerfall der Blase kurz ein Hauch Orange
  mood: (f) => ({ ribbons: 0.42, tint: 0.32, particles: 0.38, warm: 0.14 * blip(f, IMPACT, 4, 26), layout: "drift" }),
};
