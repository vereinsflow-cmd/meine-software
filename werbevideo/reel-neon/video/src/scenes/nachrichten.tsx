/**
 * Szene „nachrichten“ (S.nachrichten, Abschnitt 6): „Ihre Nachricht geht an alle, an eine Abteilung oder nur an die
 * Helfer. Und Sie sehen, wie viele schon gelesen haben.“
 *
 * Bild 1 – die vier Gruppen der Nachrichtenliste (echte Chatzeilen der App, dunkel) als Glaskarten, in die Tiefe
 *   gefächert. „alle“: alle Karten leuchten nacheinander auf. „eine Abteilung“: nur „Abteilung Fußball“ hebt sich nach
 *   vorn, die Schärfe zieht mit, der Rest sinkt ins Unscharfe. „nur an die Helfer“: dasselbe für „Helfer · Sommerfest
 *   2027“ mit blauem Leuchtring. Leuchtschrift oben: „Ihre Nachricht“ / „An alle. Oder gezielt.“
 * Bild 2 – kurze Fahrt in die Tiefe (wie die Kreuz-Zooms an den Szenengrenzen, aber als echte Kamerafahrt mit
 *   Tiefenschärfe): Die Kamera taucht durch die gewählte Karte „Helfer · Sommerfest 2027“, dahinter kommt deren Chat
 *   unscharf aus der Tiefe und wird scharf – Ankündigung „Arbeitseinsatz am Vereinsheim“, „Erreicht 5 Personen“. Die
 *   Lesezahl ✓✓ zählt 1/5 → 4/5 im Takt von „wie viele schon gelesen“, oben groß als leuchtende Zahl (keine Namen).
 * Beide Grenzen sind „zoom“ (Video.tsx): Am Anfang stehen die Karten schon im Bild, am Ende steht der Chat ruhig.
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import { LAYOUT, S } from "../film";
import { cue, cueEnd } from "../lib/timeline";
import { DotBurst, GlowText, Layer3D, NEON, NeonScene3D, type Scene3DSettings, blip, clamp01, invLerp, lerp, project, rgba, toCamera, zoomCross } from "../neon";
import { GLIDE, SNAP, sp } from "../springs";
import { CHATS } from "../ui/messages";
import type { NeonScene } from "./types";
import { AVATAR_X, BigReadCount, CARD_H, CARD_W, CHAT_H, CHAT_W, ChatScreen, GroupCard } from "./nachrichten/teile";

// ---- Zeitplan (alles aus der Stimme) --------------------------------------------------------
const A = S.nachrichten.from;
const w6 = (key: string, nth = 0) => cue(key, { section: 6, nth });
const T = {
  ihre: w6("ihre"),
  nachricht: w6("nachricht"),
  an: w6("an"),
  alle: w6("alle"),
  eine: w6("eine"),
  abteilung: w6("abteilung"),
  oder: w6("oder"),
  nur: w6("nur"),
  die: w6("die"),
  helfer: w6("helfer"),
  helferEnd: cueEnd("helfer", { section: 6 }),
  und: w6("und"),
  sehen: w6("sehen"),
  wie: w6("wie"),
  viele: w6("viele"),
  schon: w6("schon"),
  gelesen: w6("gelesen"),
};
/** Fahrt in die Tiefe von den Karten zum Chat (nach „Helfer.“, vor „Und Sie sehen“) */
const SWITCH = T.helferEnd + 2;
/**
 * Kreuz-Zoom mit den Kurven der Szenengrenzen (zoomCross), nur kürzer: Karten fahren SWITCH … SWITCH+8 durch die
 * Kamera (out 0 → 1, beschleunigt), der Chat kommt SWITCH+3 … SWITCH+13 aus der Tiefe (in −1 → 0, bremst ab).
 */
const DIVE_DUR = 10;
const dive = (f: number) => zoomCross(f, SWITCH + 0.65 * DIVE_DUR, DIVE_DUR);
/** so weit fährt die Kamera durch den Fächer (px Kameratiefe; die Helfer-Karte erreicht die Linse) */
const DIVE_DEPTH = 1500;
/** so tief steht der Chat beim Auftritt hinter seiner Ruhelage (Maßstab ≈ 0,55 wie ZoomThrough) */
const ARRIVE_DEPTH = 1300;
/** Zählschritte der Lesezahl 1 → 2 → 3 → 4 */
const READ_STEPS = [T.viele, T.schon, T.gelesen];

// ---- Raum ---------------------------------------------------------------------------------
/** Karten der Liste (Reihenfolge wie in der App), oben weiter hinten: Fächer in die Tiefe */
const CARDS = [
  { x: 548, y: 668, z: -380 },
  { x: 536, y: 892, z: -250 },
  { x: 524, y: 1116, z: -120 },
  { x: 512, y: 1340, z: 10 },
];
const I_HELFER = 1;
const I_FUSSBALL = 3;
/** Der Chat steht seitlich neben dem Fächer (eigene Bühne); seine Kamera blickt um diesen Versatz verschoben auf ihn */
const TRUCK = 1080;
const CHAT_POS = { x: 540 + TRUCK, y: 1048, z: -60 };
const PERSPECTIVE = 1700;

const settingsFor = (cam: Cam): Scene3DSettings => ({
  cam: { ...cam, roll: 0, pivot: { x: 540, y: 960, z: 0 } },
  perspective: PERSPECTIVE,
  focusZ: 0,
  dof: 0,
  maxBlur: 0,
  dim: 0,
  dimRange: 1,
  width: 1080,
  height: 1920,
});

type Cam = { dolly: number; orbitX: number; orbitY: number; panX: number; panY: number };

// ---- Zustände -----------------------------------------------------------------------------
/** Flug des orangen Punkts bei „alle“: von der Leuchtschrift an allen Karten vorbei (je DOT_STEP Frames eine Karte) */
const DOT_START = T.alle - 6;
const DOT_STEP = 4;
const DOT_END = DOT_START + DOT_STEP * 4;
/** alle Karten leuchten, sobald der Punkt sie erreicht (von oben nach unten) */
const litAt = (i: number) => DOT_START + DOT_STEP * (i + 1) - 1;
const allLit = (f: number, i: number) => sp(f, litAt(i), SNAP);
/** Auswahl beginnt: Rest dimmt */
const narrow = (f: number) => sp(f, T.eine - 3, GLIDE);
/** Abteilung Fußball gewählt (bis „nur“) */
const selFussball = (f: number) => sp(f, T.eine - 3, GLIDE) - sp(f, T.nur - 3, GLIDE);
/** Helfer gewählt */
const selHelfer = (f: number) => sp(f, T.nur - 1, GLIDE);
const introAt = (f: number) => sp(f, A - 10, GLIDE, { durationInFrames: 60, overshootClamping: true });

/** Kamera Bild 1 (Karten), ohne die Fahrt in die Tiefe */
const camCards = (f: number): Cam => {
  const intro = introAt(f);
  const sf = selFussball(f);
  const sh = selHelfer(f);
  // gleichmäßiges Weiterfahren in Bild 1 (nach dem Intro-Spring kein Stillstand bis zur Fahrt in die Tiefe)
  const drift = clamp01((f - A) / (SWITCH - A));
  return {
    // langsames Heranfahren, Auswahl zieht die Kamera leicht zur Karte
    dolly: lerp(-140, 0, intro) + 48 * drift + 30 * sf + 40 * sh,
    orbitX: lerp(12, 7, intro),
    orbitY: lerp(-16, -8, intro) + 5 * drift + 3 * sh,
    // Auswahl „Abteilung Fußball“ (Karte sitzt links im Fächer) leicht zur Mitte holen – Rand bleibt im Bild
    panX: -24 * sf,
    panY: 46 * sf - 52 * sh,
  };
};

/** Kamera Bild 2 (Chat): Ruhelage wie bisher am Ende; beim Auftritt steht der Chat ARRIVE_DEPTH tiefer im Raum */
const camChat = (f: number): Cam => {
  const intro = introAt(f);
  const sf = selFussball(f);
  const settle = sp(f, SWITCH + 14, GLIDE, { durationInFrames: 70, overshootClamping: true });
  return {
    dolly: lerp(-140, 0, intro) + 30 * sf + lerp(0, 70, settle) + ARRIVE_DEPTH * dive(f).in,
    orbitX: lerp(12, 7, intro) - 2,
    orbitY: lerp(-16, -8, intro) + 14 - 6 * settle,
    panX: TRUCK - 24 * sf,
    panY: 46 * sf,
  };
};

/** Bühne mit Aufhellen (wie ZoomThrough: Licht rauscht beim Durchfahren vorbei) */
const Bright: React.FC<{ k: number; children: React.ReactNode }> = ({ k, children }) =>
  k > 1.005 ? <AbsoluteFill style={{ filter: `brightness(${k.toFixed(3)})` }}>{children}</AbsoluteFill> : <>{children}</>;

// ---- Szene --------------------------------------------------------------------------------
const NachrichtenComp: React.FC<{ f: number }> = ({ f }) => {
  const { out: zOut, in: zIn } = dive(f);
  const camBase = camCards(f);
  const cam = { ...camBase, dolly: camBase.dolly + DIVE_DEPTH * zOut };
  const sBase = settingsFor(camBase);
  const s3 = settingsFor(cam);
  const camC = camChat(f);
  const sChat = settingsFor(camC);

  // Fächer öffnet sich nach dem Hereinzoomen
  const unfold = sp(f, A - 4, GLIDE, { durationInFrames: 54, overshootClamping: true });
  const nr = narrow(f);
  const sf = selFussball(f);
  const sh = selHelfer(f);
  const sel = (i: number) => (i === I_FUSSBALL ? sf : i === I_HELFER ? sh : 0);
  const lift = sel;
  const pos = (i: number) => {
    const c = CARDS[i];
    const k = lerp(0.7, 1, unfold);
    // leichtes Schweben, je Karte versetzt (nie ganz still)
    const bob = 7 * Math.sin((2 * Math.PI * (f - A)) / 84 + i * 1.35);
    return { x: c.x, y: 1004 + (c.y - 1004) * k + bob, z: c.z * k + 100 * lift(i) };
  };

  // Schärfe: alle Karten fast scharf, bei Auswahl auf die gewählte Karte (Kameratiefe ohne die Fahrt in die Tiefe –
  // beim Durchfahren verlassen die Karten die Schärfe und verschwimmen weich)
  const depth = (i: number) => {
    const p = pos(i);
    return toCamera(sBase, p.x, p.y, p.z).z;
  };
  const wAll = 1 - nr;
  const wF = Math.max(0, sf);
  const wH = Math.max(0, sh);
  const focusAll = (depth(1) + depth(2)) / 2;
  const focusCards = (wAll * focusAll + wF * depth(I_FUSSBALL) + wH * depth(I_HELFER)) / Math.max(1e-4, wAll + wF + wH);
  // Chat: Schärfe auf seiner Ruhelage – aus der Tiefe kommt er unscharf und wird scharf
  const chatFocus = toCamera(sChat, CHAT_POS.x, CHAT_POS.y, CHAT_POS.z).z - ARRIVE_DEPTH * zIn;

  // Lesezahl
  const roll = READ_STEPS.reduce((acc, at) => acc + sp(f, at, SNAP, { durationInFrames: 6, overshootClamping: true }), 0);
  const read = 1 + READ_STEPS.filter((at) => f >= at + 2).length;
  const readPulse = Math.max(...READ_STEPS.map((at) => blip(f, at, 2, 10)));
  const countAppear = sp(f, T.sehen - 6, GLIDE, { durationInFrames: 14, overshootClamping: true });
  const countFlare = Math.max(...READ_STEPS.map((at, i) => blip(f, at, 3, 16) * (i === READ_STEPS.length - 1 ? 1.0 : 0.5)));

  // Leuchtschrift Bild 1 geht vor der Fahrt (schneller als ihr Auftritt)
  const head1Exit = sp(f, SWITCH - 3, SNAP, { durationInFrames: 12, overshootClamping: true });

  // Bahn des Punkts: von „alle.“ zu den runden Bildern der vier Karten (Bildschirmkoordinaten)
  const dotOn = f >= DOT_START - 2 && f <= DOT_END + 14;
  const dotPath = dotOn
    ? [
        { x: 640, y: LAYOUT.headTop + 150 },
        ...CARDS.map((_, i) => {
          const p = pos(i);
          const q = project(s3, p.x - CARD_W / 2 + AVATAR_X, p.y, p.z);
          return { x: q.x, y: q.y };
        }),
      ]
    : [];
  const dotP = invLerp(DOT_START, DOT_END, f);
  const dotFade = 1 - invLerp(DOT_END + 4, DOT_END + 14, f);

  const showCards = zOut < 0.999;
  const showChat = zIn > -0.999;

  return (
    <AbsoluteFill>
      {/* Bild 2 hinten: Chat kommt aus der Tiefe */}
      {showChat ? (
        <Bright k={1 - 0.3 * zIn}>
          <NeonScene3D camera={camC} perspective={PERSPECTIVE} focusZ={chatFocus} dof={1.4} maxBlur={16} dim={0.42} dimRange={900}>
            <Layer3D x={CHAT_POS.x} y={CHAT_POS.y} z={CHAT_POS.z} rotY={-6 + 12 * zIn} rotX={2} width={CHAT_W} height={CHAT_H} opacity={1 - Math.pow(-zIn, 1.6)}>
              <ChatScreen chat={CHATS[I_HELFER]} read={read} readPulse={readPulse} glow={0.8 + 0.5 * countFlare} />
            </Layer3D>
          </NeonScene3D>
        </Bright>
      ) : null}

      {/* Bild 1 vorn: Kamera fährt durch den Fächer (Helfer-Karte voraus), Karten verschwimmen und blenden aus */}
      {showCards ? (
        <Bright k={1 + 0.45 * zOut}>
          <NeonScene3D camera={cam} perspective={PERSPECTIVE} focusZ={focusCards} dof={lerp(0.7, 2.6, nr)} maxBlur={lerp(16, 28, zOut)} dim={0.42 * (1 - zOut)} dimRange={900}>
            {CHATS.map((chat, i) => {
              const p = pos(i);
              const lAll = allLit(f, i) * (1 - nr);
              const lit = Math.max(lAll, sel(i));
              const dimmed = nr * (1 - sel(i));
              const sheenAt = litAt(i);
              const sheen = f >= sheenAt && f <= sheenAt + 20 ? invLerp(sheenAt, sheenAt + 20, f) : undefined;
              // Welle des Rings: bei „alle“ auf jeder Karte, dann auf der gewählten
              const selAt = i === I_FUSSBALL ? T.abteilung : i === I_HELFER ? T.helfer : Infinity;
              const ringPulse = f >= selAt ? invLerp(selAt, selAt + 18, f) : invLerp(sheenAt + 2, sheenAt + 15, f);
              return (
                <Layer3D
                  key={chat.title}
                  x={p.x}
                  y={p.y}
                  z={p.z}
                  rotX={-2}
                  rotY={-4 + 4 * lift(i)}
                  scale={1 + 0.03 * lift(i)}
                  width={CARD_W}
                  height={CARD_H}
                  opacity={lerp(1, 0.42, dimmed) * (1 - Math.pow(zOut, 1.3))}
                >
                  <GroupCard chat={chat} lit={lit} ring={Math.max(0.7 * lAll, sel(i))} ringPulse={ringPulse} sheen={sheen} />
                </Layer3D>
              );
            })}
          </NeonScene3D>
        </Bright>
      ) : null}

      {dotOn && dotFade > 0.002 ? (
        <DotBurst
          frame={f}
          path={dotPath}
          pathProgress={dotP}
          trail={0.32}
          size={24}
          glow={1.1}
          flare={0.7}
          rays={0.35}
          burst={invLerp(DOT_END, DOT_END + 16, f)}
          opacity={Math.min(1, invLerp(DOT_START - 2, DOT_START + 2, f)) * dotFade}
        />
      ) : null}

      {/* Leuchtschrift Bild 1: jede Zeile für sich mittig (kein halb leerer Satz) */}
      {head1Exit < 0.999 ? (
        <div style={{ position: "absolute", left: 60, right: 60, top: LAYOUT.headTop, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <GlowText text="Ihre Nachricht" frame={f} wordStarts={[T.ihre, T.nachricht]} fontSize={50} weight={500} glow={0.45} flare={0.5} mode="blur" color={rgba(NEON.ice, 0.9)} exit={head1Exit} />
          <GlowText text="An alle." frame={f} wordStarts={[T.an, T.alle]} fontSize={84} weight={800} glow={0.9} flare={1.1} mode="rise" echo={2} exit={head1Exit} />
          <GlowText text="Oder gezielt." frame={f} wordStarts={[T.eine - 1, T.abteilung - 2]} fontSize={84} weight={800} glow={0.9} flare={1.1} mode="rise" echo={2} exit={head1Exit} />
        </div>
      ) : null}

      {/* Bild 2: große Lesezahl */}
      {countAppear > 0.002 ? (
        <div style={{ position: "absolute", left: 40, right: 40, top: LAYOUT.headTop - 20, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <BigReadCount roll={roll} appear={countAppear} flare={countFlare} fontSize={200} />
          <div style={{ marginTop: 4 }}>
            <GlowText text="gelesen" frame={f} start={T.gelesen} fontSize={68} weight={800} glow={0.85} flare={1.0} mode="rise" echo={2} />
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

export const nachrichten: NeonScene = {
  id: "nachrichten",
  Comp: NachrichtenComp,
  mood: () => ({ ribbons: 0.42, tint: 0.32, particles: 0.35 }),
};

