/**
 * Szene „helfer“ (780–960, Stimme Abschnitt 5): „Fürs Sommerfest tragen sich die Helfer per Fingertipp selbst ein. Und wo
 * noch jemand fehlt, erkennen Sie auf einen Blick.“
 *
 * Ein hoher Glas-Bildschirm mit der Schichtenseite „Sommerfest 2027“ (echter Dunkelmodus) steht im Raum, daneben schweben
 * Neon-Kennzahlen aus den Demo-Schichten (Helferplätze 9 von 21, Besetzung je Schicht). Die Kamera fährt an der Seite
 * entlang:
 *   1 Seitenkopf + Kennzahlen („Fürs Sommerfest“) – Ring und Balken füllen sich
 *   2 Getränkestand („tragen sich die Helfer“ → Kamerafahrt; „Fingertipp“ → der orange Punkt tippt „Eintragen“ →
 *     „Austragen“, „3 von 4 · 1 frei“, „Anna Adler (du)“) – Leuchtschrift „Ein Tipp. Eingetragen.“
 *   3 Grillstand („wo noch jemand fehlt“ → Kamerafahrt; der Punkt zeichnet einen orangen Lichtring um „0 von 3 · 3 frei“,
 *     der im Takt pulsiert) – Leuchtschrift „Lücken auf einen Blick.“
 * Übergänge an beiden Grenzen („zoom“) macht Video.tsx – das Bild ist dort gefüllt.
 */
import React from "react";
import { LAYOUT, S } from "../film";
import { cue, type CueOptions } from "../lib/timeline";
import {
  DotBurst,
  GlassPanel,
  GlowText,
  Layer3D,
  NEON,
  NeonScene3D,
  ScreenPanel,
  invLerp,
  lerp,
  project,
  rgba,
  smooth,
  smoothstep,
  type Pt,
  type Scene3DSettings,
} from "../neon";
import { easeIn } from "../neon/util";
import { GLIDE, POP, sp } from "../springs";
import { AppShell } from "../ui/AppShell";
import { appear, press } from "../ui/motion";
import { ShiftsPage } from "../ui/shifts";
import { C } from "../ui/tokens";
import { BARS_CARD, GapRing, RING_CARD, RowGlow, ShiftBarsCard, StaffRingCard, TapRipple, bloom, capsulePoint } from "./helfer/cards";
import { DRINKS, K, ME, PAD, PAGE, PANEL, PANEL_H, Shot, layerY, mixShot, pagePt, placeAt, rig } from "./helfer/geometry";
import type { NeonScene } from "./types";

// ---- Zeiten (nur aus der Stimme) ----------------------------------------------------------------
const c5 = (w: string, o: CueOptions = {}) => cue(w, { section: 5, ...o });
const T = {
  tragen: c5("tragen"),
  tipp: c5("fingertipp"),
  selbst: c5("selbst"),
  und: c5("und"),
  wo: c5("wo"),
  fehlt: c5("fehlt"),
  auf: c5("auf"),
  einen: c5("einen"),
  blick: c5("blick"),
};
const FROM = S.helfer.from;
/** Kennzahlen füllen sich, sobald der Zoom-Auftritt steht */
const GROW = FROM + 12;
/** Fahrt 1 → Getränkestand (auf „tragen sich die Helfer“) – 34 Frames gestreckt: Spitzentempo ~80 statt ~105 px/Frame */
const TRAVEL1 = T.tragen + 8;
const TRAVEL1_DUR = 34;
/** Der Punkt tippt „Eintragen“ auf der Betonung von „Fingertipp“ */
const TAP = T.tipp + 6;
/** Anflug: kurz und schnell, landet genau zum Tipp (Spring auf DOT_FLY Frames gestreckt) */
const DOT_IN = TAP - 11;
const DOT_FLY = 13;
/** Fahrt 2 → Grillstand (auf „wo noch jemand fehlt“) */
const TRAVEL2 = T.wo - 2;
const TRAVEL2_DUR = 26;
/** Der Punkt hebt vom Getränkestand ab (kurz nach Beginn von Fahrt 2) */
const LIFT = TRAVEL2 + 1;
/** Der Punkt erreicht den Grillstand auf „fehlt“ und zeichnet den Ring */
const RING_AT = T.fehlt + 2;
const RING_DUR = 13;
/** Puls-Wellen im Takt (120 BPM = 15 Frames) */
const WAVES = [RING_AT + RING_DUR, RING_AT + RING_DUR + 15, RING_AT + RING_DUR + 30];

// ---- Kamera-Einstellungen ------------------------------------------------------------------------
// xs 672: Bildschirm etwas rechts der Mitte – links bleibt eine Spalte für die beiden Kennzahl-Karten
const K1: Shot = {
  lx: 585,
  ly: 950,
  xs: 672,
  ys: 905,
  dolly: -290,
  orbitX: 5,
  orbitY: -11,
};
const K2: Shot = {
  lx: 585,
  ly: 2330,
  xs: 540,
  ys: 791,
  dolly: 420,
  orbitX: 3,
  orbitY: -3,
};
const K3: Shot = {
  lx: 585,
  ly: 3130,
  xs: 540,
  ys: 914,
  dolly: 480,
  orbitX: 2,
  orbitY: 4,
};

const travel1 = (f: number) =>
  sp(f, TRAVEL1, GLIDE, {
    durationInFrames: TRAVEL1_DUR,
    overshootClamping: true,
  });
const travel2 = (f: number) =>
  sp(f, TRAVEL2, GLIDE, {
    durationInFrames: TRAVEL2_DUR,
    overshootClamping: true,
  });

const shotAt = (f: number): Shot => {
  // Einstellung 1 treibt langsam (Kamera nie ganz still)
  const drift = smooth(invLerp(FROM - 8, TRAVEL1 + TRAVEL1_DUR, f));
  const k1 = {
    ...K1,
    dolly: K1.dolly + lerp(-40, 40, drift),
    orbitY: K1.orbitY + lerp(-2, 2, drift),
  };
  let s = mixShot(k1, K2, travel1(f));
  s = mixShot(s, K3, travel2(f));
  // leichtes Weiterkreisen in den Haltepunkten
  return {
    ...s,
    orbitY: s.orbitY + 0.02 * (f - FROM),
    dolly: s.dolly + 0.25 * (f - FROM),
  };
};

// ---- Karten im Raum (gesetzt nach Bildlage in Einstellung 1) -------------------------------------------
// Beide Karten links in einer Spalte, linke Kanten bündig bei x ≈ 100 → 82 (Kamera treibt; nie unter 80 px Rand).
// „Besetzung je Schicht“ auf Höhe des Tagesablaufs; rechts endet sie ≥ 30 px vor dem Text der Schichtenliste (keine
// Zeile wird angeschnitten)
const RING_POS = placeAt(K1, 238, 520, 150);
const BARS_POS = placeAt(K1, 274, 1262, 230);
const BACK_POS = placeAt(K1, 930, 470, -650);
const BOKEH_FRONT = placeAt(K1, 1000, 1580, 520);
const BOKEH_BACK = placeAt(K1, 980, 1250, -900);
/** Licht hinter der Seite in der nahen Einstellung 3 (Vordergrund-Glas würde dort die App verdecken) */
const BOKEH3 = placeAt(K3, 90, 470, -800);
/** Karten fliegen bei Fahrt 1 an der Kamera vorbei (nach vorn und zur Seite) und blenden aus */
const cardExit = (t12: number) => ({
  z: 950 * smooth(invLerp(0.05, 0.8, t12)),
  x: -240 * smooth(invLerp(0.05, 0.8, t12)),
  a: 1 - smoothstep(0.4, 0.8, t12),
});

// ---- Lichtring um „0 von 3 · 3 frei“ ---------------------------------------------------------------
const CAP = {
  x0: PAGE.grill.status.x0 - 36,
  x1: PAGE.grill.status.x1 + 48,
  yc: PAGE.grill.status.y - 2,
  h: 86,
};
const CAP_W = (CAP.x1 - CAP.x0) * K;
const CAP_H = CAP.h * K;
const CAP_M = 64;
/** Weltpunkt auf dem Ring (t 0..1, ab Mitte rechts im Uhrzeigersinn) */
const capWorld = (t: number) => {
  const p = capsulePoint(CAP_W, CAP_H, t);
  const o = pagePt(CAP.x0, CAP.yc - CAP.h / 2);
  return { x: o.x + p.x, y: o.y + p.y, z: 2 };
};

const BokehDot: React.FC<{ size: number; color: string; alpha: number }> = ({ size, color, alpha }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: "50%",
      mixBlendMode: "screen",
      background: `radial-gradient(circle, ${rgba(color, alpha)} 0%, ${rgba(color, alpha * 0.6)} 38%, ${rgba(color, alpha * 0.16)} 58%, ${rgba(color, 0)} 70%)`,
    }}
  />
);

/** Weltpunkt → Bildschirm-Pixel (2D-Ebene des Lichtpunkts über der Bühne) */
const screenOf = (s: Scene3DSettings, w: { x: number; y: number; z: number }): Pt => {
  const p = project(s, w.x, w.y, w.z);
  return { x: p.x, y: p.y };
};

const HelferComp: React.FC<{ f: number }> = ({ f }) => {
  const shot = shotAt(f);
  const { cam, settings } = rig(shot);
  const t12 = travel1(f);
  const t23 = travel2(f);

  // App-Zustand Getränkestand
  const pressed = press(f, TAP, 3);
  const signedUp = appear(f, TAP + 3, 10);
  const meAppear = appear(f, TAP + 6, 12);
  const highlight = appear(f, TAP + 2, 10);

  // Seite blendet oben aus (Platz für die Leuchtschrift), unten weich ins Dunkel; die nächste Zeile ist gedimmt
  const fadeEnd = lerp(lerp(-400, PAGE.drinks.top + 40, smooth(invLerp(0.15, 0.85, t12))), PAGE.grill.top + 40, t23);
  const fadeStart = fadeEnd - 90;
  const mA = Math.max(0, layerY(fadeStart));
  const mB = Math.max(0.1, layerY(fadeEnd));
  const mC = layerY(PANEL.sh - 420);
  const mD = layerY(PANEL.sh) + PANEL.bezel;
  const mask = `linear-gradient(180deg, rgba(0,0,0,0) ${mA.toFixed(1)}px, #000 ${mB.toFixed(1)}px, #000 ${mC.toFixed(1)}px, rgba(0,0,0,0) ${mD.toFixed(1)}px)`;
  const dimY = lerp(PAGE.grill.top, PAGE.cake.top, t23);
  const dimA = lerp(0.58, 0.68, t23) * smooth(invLerp(0.3, 1, t12));

  // Kennzahlen
  const grow = appear(f, GROW, 24);
  const barsGrow = appear(f, GROW + 4, 24);
  const gapGlow = smoothstep(GROW + 16, GROW + 28, f);
  const ex = cardExit(t12);
  // Kennzahlen im ersten Bild scharf (lesbar); unscharf erst, wenn sie an der Kamera vorbeifliegen
  const exitBlur = 9 * smoothstep(0.1, 0.65, t12);
  // Bewegungsunschärfe der schnellen Fahrten (Bildschirm-px)
  const speed = Math.abs(travel1(f) - travel1(f - 1)) * 780 + Math.abs(travel2(f) - travel2(f - 1)) * 450;
  const mblur = Math.min(9, Math.max(0, speed - 10) * 0.14);

  // Lichtring + Wellen
  const ringDraw = smooth(invLerp(RING_AT, RING_AT + RING_DUR, f));
  const waves = WAVES.map((w) => invLerp(w, w + 26, f));
  const ringGlow = ringDraw > 0 ? 0.86 + 0.06 * Math.sin((f - RING_AT) * 0.21) : 0;
  // Taktschlag: Ring blitzt mit jeder Welle kurz auf (schnell an, weich ab)
  const beat = Math.max(0, ...WAVES.map((w) => (f < w ? 0 : Math.min(1, (f - w + 1) / 2) * Math.exp(-(f - w) / 6))));

  // Leuchtrahmen Getränkestand: blüht beim Eintragen auf, klingt ab, geht mit Fahrt 2
  const rowGlow = bloom(f, TAP + 6, 0.28) * (1 - smooth(invLerp(0, 0.6, t23)));

  // ---- Lichtpunkt ----
  const btn = screenOf(settings, pagePt(PAGE.drinks.button.x, PAGE.drinks.button.y));
  const rest = screenOf(settings, pagePt(PAGE.drinks.button.x + 6, PAGE.drinks.top + 4));
  const g0 = screenOf(settings, capWorld(0));
  const lift0 = screenOf(rig(shotAt(LIFT)).settings, pagePt(PAGE.drinks.button.x + 6, PAGE.drinks.top + 4));
  let dot: React.ReactNode = null;
  if (f >= DOT_IN && f < RING_AT + RING_DUR + 14) {
    if (f <= LIFT) {
      // Anflug von rechts oben, Tipp, dann ruht er über dem Knopf
      const pIn = sp(f, DOT_IN, GLIDE, {
        durationInFrames: DOT_FLY,
        overshootClamping: true,
      });
      const toRest = smooth(invLerp(TAP + 4, TAP + 16, f));
      const end = {
        x: lerp(btn.x, rest.x, toRest),
        y: lerp(btn.y, rest.y, toRest),
      };
      const path: Pt[] = [{ x: 1150, y: 300 }, { x: 960, y: 470 }, { x: end.x + 70, y: end.y - 110 }, end];
      const tapPulse = sp(f, TAP, POP) - sp(f, TAP + 4, POP);
      dot = (
        <DotBurst
          frame={f}
          path={path}
          pathProgress={pIn}
          trail={0.22 * (1 - smoothstep(0.7, 1, pIn))}
          size={lerp(34, 26, toRest)}
          glow={lerp(1.15, 0.75, toRest)}
          flare={lerp(0.75, 0.35, toRest)}
          rays={lerp(0.6, 0.25, toRest)}
          pulse={-0.35 * tapPulse}
          opacity={smooth(invLerp(DOT_IN, DOT_IN + 4, f))}
        />
      );
    } else if (f < RING_AT) {
      // Flug zum Grillstand: hebt dort ab, wo er ruhte (fest im Bild, die Seite zieht unter ihm weg), und schwingt in
      // einem Bogen nach unten links an das rechte Ende von „0 von 3 · 3 frei“ (das Ziel folgt der Kamera); landet zu „fehlt“
      const p = sp(f, LIFT, GLIDE, { durationInFrames: RING_AT - LIFT + 1, overshootClamping: true });
      const k = smooth(invLerp(LIFT, LIFT + 6, f));
      const path: Pt[] = [lift0, { x: lift0.x + 60, y: lerp(lift0.y, g0.y, 0.55) }, { x: g0.x + 90, y: g0.y - 36 }, g0];
      dot = (
        <DotBurst
          frame={f}
          path={path}
          pathProgress={p}
          trail={0.16 * k * (1 - smoothstep(0.7, 1, p))}
          size={lerp(26, 28, k)}
          glow={lerp(0.75, 0.95, k)}
          flare={lerp(0.35, 0.5, k)}
          rays={lerp(0.25, 0.4, k)}
        />
      );
    } else {
      // zeichnet den Ring einmal herum und geht in ihm auf: kurzes Aufglühen auf dem ersten Taktschlag des Rings statt
      // einer großen Explosion (deren Lichtkreis würde die Nachbarzeilen durchkreuzen)
      const pos = screenOf(settings, capWorld(ringDraw));
      const done = RING_AT + RING_DUR;
      const fade = 1 - smooth(invLerp(done - 1, done + 9, f));
      const pop = smoothstep(done - 3, done, f) * (1 - smoothstep(done, done + 9, f));
      dot = (
        <DotBurst frame={f} x={pos.x} y={pos.y} size={26} glow={1 + 0.7 * pop} flare={0.5 + 0.3 * pop} rays={0.4} pulse={0.6 * pop} opacity={fade} />
      );
    }
  }

  // ---- Leuchtschrift ----
  const head1Exit = easeIn(invLerp(T.und + 2, T.und + 10, f), 2);
  const showHead1 = f >= T.tipp - 2 && head1Exit < 0.999;
  const showHead2 = f >= RING_AT - 2;

  const rowW = 1074 * K;
  const rowH = (PAGE.drinks.bottom - PAGE.drinks.top) * K;
  const rowC = pagePt(585, (PAGE.drinks.top + PAGE.drinks.bottom) / 2);
  const capC = pagePt((CAP.x0 + CAP.x1) / 2, CAP.yc);
  const btnW = pagePt(PAGE.drinks.button.x, PAGE.drinks.button.y);

  return (
    <>
      <NeonScene3D
        camera={cam}
        perspective={settings.perspective}
        focusZ={settings.focusZ}
        dof={settings.dof}
        maxBlur={settings.maxBlur}
        dim={settings.dim}
        dimRange={settings.dimRange}
      >
        {/* Tiefe: unscharfe Glaskarte hinten, Lichtpunkte vorn/hinten */}
        <Layer3D x={BOKEH_BACK.x} y={BOKEH_BACK.y} z={BOKEH_BACK.z} width={300} height={300} opacity={0.8}>
          <BokehDot size={300} color={NEON.orange} alpha={0.22} />
        </Layer3D>
        <Layer3D x={BACK_POS.x} y={BACK_POS.y} z={BACK_POS.z} rotY={18} rotX={4} width={560} height={380} opacity={0.85}>
          <GlassPanel width={560} height={380} tint={0.75} glow={0.6} />
        </Layer3D>

        {/* der hohe Glas-Bildschirm mit der Schichtenseite */}
        <Layer3D x={PANEL.x} y={PANEL.y} z={0} width={PANEL.w + 2 * PAD} height={PANEL_H + 2 * PAD} sharp noDim blur={mblur}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              maskImage: mask,
              WebkitMaskImage: mask,
            }}
          >
            <ScreenPanel
              width={PANEL.w}
              screenHeight={PANEL.sh}
              glow={0.85}
              tint={0.45}
              edge={1.2}
              style={{ position: "absolute", left: PAD, top: PAD }}
            >
              <AppShell height={PANEL.sh}>
                <ShiftsPage
                  overrides={Object.assign([], {
                    [DRINKS]: {
                      me: ME,
                      meAppear,
                      signedUp,
                      pressed,
                      highlight,
                    },
                  })}
                />
              </AppShell>
              {dimA > 0.002 ? (
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    top: dimY,
                    width: 1170,
                    height: PANEL.sh - dimY + 10,
                    background: `linear-gradient(180deg, ${rgba(C.page, 0)} 0px, ${rgba(C.page, dimA)} 90px)`,
                  }}
                />
              ) : null}
            </ScreenPanel>
          </div>
        </Layer3D>

        {/* Leuchtrahmen um den Getränkestand nach dem Eintragen */}
        <Layer3D x={rowC.x} y={rowC.y} z={1} width={rowW + 80} height={rowH + 80} sharp noDim opacity={rowGlow > 0.002 ? 1 : 0}>
          <RowGlow w={rowW} h={rowH} glow={rowGlow} />
        </Layer3D>

        {/* Tipp-Welle um „Eintragen“ */}
        <Layer3D x={btnW.x} y={btnW.y} z={1} width={260} height={260} sharp noDim opacity={f >= TAP && f < TAP + 22 ? 1 : 0}>
          <TapRipple size={260} p={invLerp(TAP, TAP + 20, f)} />
        </Layer3D>

        {/* oranger Lichtring um „0 von 3 · 3 frei“ */}
        <Layer3D x={capC.x} y={capC.y} z={2} width={CAP_W + 2 * CAP_M} height={CAP_H + 2 * CAP_M} sharp noDim opacity={ringDraw > 0 ? 1 : 0}>
          <GapRing w={CAP_W} h={CAP_H} m={CAP_M} draw={ringDraw} waves={waves} glow={ringGlow} beat={beat} />
        </Layer3D>

        {/* Kennzahlen (schweben vor der Seite, fliegen bei Fahrt 1 an der Kamera vorbei) */}
        <Layer3D
          x={RING_POS.x + ex.x}
          y={RING_POS.y}
          z={RING_POS.z + ex.z}
          rotY={14}
          rotX={4}
          width={RING_CARD.w}
          height={RING_CARD.h}
          opacity={ex.a}
          sharp
          blur={mblur + exitBlur}
        >
          <StaffRingCard grow={grow} appear={1} />
        </Layer3D>
        <Layer3D
          x={BARS_POS.x + ex.x}
          y={BARS_POS.y}
          z={BARS_POS.z + ex.z}
          rotY={12}
          rotX={-3}
          width={BARS_CARD.w}
          height={BARS_CARD.h}
          opacity={ex.a}
          sharp
          blur={mblur + exitBlur}
        >
          <ShiftBarsCard grow={barsGrow} appear={1} gapGlow={gapGlow} />
        </Layer3D>
        <Layer3D x={BOKEH_FRONT.x} y={BOKEH_FRONT.y} z={BOKEH_FRONT.z} width={380} height={380} opacity={0.9}>
          <BokehDot size={380} color={NEON.sky} alpha={0.28} />
        </Layer3D>
        <Layer3D x={BOKEH3.x} y={BOKEH3.y} z={BOKEH3.z} width={360} height={360} opacity={0.85}>
          <BokehDot size={360} color={NEON.blue} alpha={0.3} />
        </Layer3D>
      </NeonScene3D>

      {dot}

      {/* Leuchtschrift oben */}
      <div
        style={{
          position: "absolute",
          left: 60,
          right: 60,
          top: LAYOUT.headTop,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {showHead1 ? (
          <>
            <GlowText
              text="Ein Tipp."
              frame={f}
              wordStarts={[T.tipp + 1, TAP]}
              reveal={14}
              fontSize={84}
              mode="blur"
              echo={2}
              flare={1}
              glow={1}
              exit={head1Exit}
            />
            <GlowText
              text="Eingetragen."
              frame={f}
              wordStarts={[T.selbst]}
              reveal={12}
              fontSize={84}
              mode="blur"
              echo={2}
              flare={1.1}
              glow={1}
              exit={head1Exit}
            />
          </>
        ) : null}
        {showHead2 ? (
          <>
            <GlowText
              text="Lücken"
              frame={f}
              wordStarts={[RING_AT]}
              reveal={14}
              fontSize={84}
              mode="blur"
              echo={2}
              flare={1.1}
              glow={1}
              color="#FFF1EA"
              glowCore="#FFB08F"
              glowOuter={NEON.orange}
            />
            <GlowText
              text="auf einen Blick."
              frame={f}
              wordStarts={[T.auf - 3, T.einen - 3, T.blick - 5]}
              reveal={12}
              fontSize={84}
              mode="blur"
              echo={2}
              flare={1}
              glow={1}
            />
          </>
        ) : null}
      </div>
    </>
  );
};

export const helfer: NeonScene = {
  id: "helfer",
  Comp: HelferComp,
  mood: (f) => ({
    ribbons: 0.4,
    tint: 0.3,
    particles: 0.32,
    warm: 0.22 * smoothstep(T.fehlt - 6, T.fehlt + 24, f),
  }),
};
