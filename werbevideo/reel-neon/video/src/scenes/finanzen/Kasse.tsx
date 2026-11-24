/**
 * Kasse → Feierabend: eine durchgehende Bildfolge für finanzen (1155–1380) und feierabend (1380–1425), Übergabe „cut“.
 * Beide Szenen zeichnen dieselbe Komponente, jede nur in ihrem Teil (Grenze S.feierabend.from) – so passt jeder Frame.
 *
 *   Kasse       Glas-Bildschirm mit der Finanz-Übersicht der App (dunkel): „Kontostand gesamt“ zählt hoch, der Kurs
 *               zeichnet sich; links unten schwebt die echte Karte „Offene Rechnungen“. Leuchtschrift „Bleibt noch die Kasse.“
 *   Reiter      Neon-Reiterleiste in App-Reihenfolge „Beiträge · Kassenbuch · Rechnungen“; die Leuchtkachel springt im
 *               Takt der Stimme (Beiträge → Rechnungen → Kassenbuch). Auf „Kassenbuch“ wechselt die App ins Kassenbuch
 *               (Seiten schieben sich wie ein Pager), auf „mit Belegen“ lösen sich drei Buchungen mit Beleg als
 *               Glasstreifen heraus (Schärfe zieht mit), die Belege leuchten nacheinander auf.
 *   Offen       „Offene Rechnungen“ hebt sich leuchtend nach vorn in die Bildmitte, Glanzstreif auf „sofort“;
 *               Leuchtschrift „Offene Rechnungen?“ / „Sofort im Blick.“
 *   Feierabend  alles fährt ruhig herunter: Bildschirm erlischt, Karten sinken in die Tiefe, Bänder werden warm (mood);
 *               „Dann ist / Feierabend“ in der Mitte, der orange Punkt setzt den Schlusspunkt.
 *
 * Kein Überschuss-Betrag: die Seite im Bildschirm ist selbst zusammengesetzt (Kopf + Kontostand bzw. Kassenbuch) und
 * oberhalb der zweiten Karte abgeschnitten – die Überschuss-Karte kommt nicht vor.
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import { LAYOUT, LEAD, S, TAIL } from "../../film";
import { cue, cueEnd } from "../../lib/timeline";
import { GlowText, Layer3D, NEON, NeonScene3D, ScreenPanel, blip, clamp01, easeInOut, invLerp, lerp, screenPanelHeight, smooth, smoothstep } from "../../neon";
import { easeIn } from "../../neon/util";
import { GLIDE, POP, SNAP, sp } from "../../springs";
import { AppShell } from "../../ui/AppShell";
import { FinanceHeader, KontostandCard, LEDGER, LedgerTable } from "../../ui/finance";
import { countUp } from "../../ui/motion";
import { X3 } from "../../ui/primitives";
import { CONTENT_W, CSS_W } from "../../ui/tokens";
import type { BackgroundMood } from "../types";
import { AMBER_H, AMBER_W, AmberCard, BackCard, Bokeh, EndDot, LedgerStrip, NeonTabs, STRIP_H, STRIP_W, TAB, WarmLight, neonTabsLayout } from "./teile";

/* ------------------------------------------------------------------ Zeiten (alles aus der Stimme) */

const c7 = (w: string, nth = 0) => cue(w, { section: 7, nth });
const c8 = (w: string) => cue(w, { section: 8 });

export const T = {
  /** erster gezeigter Frame (Zoom aus der Tiefe von Video.tsx) */
  from: S.finanzen.from - LEAD,
  bleibt: c7("bleibt"),
  noch: c7("noch"),
  die: c7("die"),
  kasse: c7("kasse"),
  beitraege: c7("beiträge"),
  rechnungen: c7("rechnungen"),
  kassenbuch: c7("kassenbuch"),
  mit: c7("mit"),
  belegen: c7("belegen"),
  offene: c7("offene"),
  rechnungen2: c7("rechnungen", 1),
  sehen: c7("sehen"),
  sofort: c7("sofort"),
  /** Herunterfahren beginnt, wenn „sofort“ verklungen ist */
  down: cueEnd("sofort", { section: 7 }),
  dann: c8("dann"),
  ist: c8("ist"),
  feierabend: c8("feierabend"),
  feierabendEnd: cueEnd("feierabend", { section: 8 }),
  /** Übergabe an feierabend (cut) */
  cut: S.feierabend.from,
  /** letzter gezeigter Frame + 1 */
  end: S.feierabend.to + TAIL,
};

/** weicher Auftritt 0..1 (Spring ohne Überschwingen, auf `dur` Frames gestreckt) */
const ap = (f: number, at: number, dur: number) => clamp01(sp(f, at, GLIDE, { durationInFrames: dur, overshootClamping: true }));
/** schnelles Einrasten 0..1 */
const sn = (f: number, at: number, dur: number) => clamp01(sp(f, at, SNAP, { durationInFrames: dur, overshootClamping: true }));
/** Abgang 0..1 (beschleunigt, schneller als Auftritte) */
const ex = (f: number, at: number, dur: number) => easeIn(invLerp(at, at + dur, f), 2);

/* ------------------------------------------------------------------ Stimmung des Hintergrunds */

/** Bänder blau und gedämpft, solange Karten im Bild sind; zum Feierabend warm, ruhiger und etwas heller (Mitte frei) */
export const kasseMood = (f: number): BackgroundMood => {
  const w = smoothstep(T.down - 4, T.feierabend + 6, f);
  const k = 0.12 * blip(f, T.offene, 6, 30);
  return {
    ribbons: lerp(0.4, 0.56, w),
    warm: lerp(0.06 + k, 0.82, w),
    particles: lerp(0.32, 0.22, w),
    tint: lerp(0.3, 0.12, w),
    lift: 0,
    layout: "drift",
  };
};

/* ------------------------------------------------------------------ Bühne */

const SCREEN_W = 680;
/** Bildraum-Höhe der Seite: Kopf, Reiter und „Kontostand gesamt“ (Karte endet bei 1494, die nächste beginnt bei 1542) */
const SCREEN_H = 1520;
const SCREEN_PANEL_H = screenPanelHeight(SCREEN_W, SCREEN_H);

/** Ruhelage der Karte „Offene Rechnungen“ (links unten vor dem Bildschirm) und ihre Lage, wenn sie sich hebt */
// liegt unter der Kurve der Kontostand-Karte (die zeichnet sich in den ersten Sekunden – nicht verdecken)
const AMBER_BASE = { x: 356, y: 1486, z: 100, rotY: 12, rotX: -3, scale: 1 };
const AMBER_LIFT = { x: 540, y: 1000, z: 380, rotY: 0, rotX: 0, scale: 1.06 };

/** Buchungsstreifen: Endlage (gefächert vor dem Bildschirm) */
const STRIP_POSE = [
  { x: 526, y: 688, z: 226, rotY: -5, rotX: 4 },
  { x: 556, y: 888, z: 250, rotY: -3, rotX: 3 },
  { x: 532, y: 1088, z: 274, rotY: -1, rotX: 2 },
];

/**
 * App-Seite im Bildschirm: Finanzen-Übersicht; auf „Kassenbuch“ gleitet die Reiterkachel der App, und die Seiten wechseln
 * wie ein Pager: Übersicht und Kassenbuch schieben sich gemeinsam um eine Bildschirmbreite nach links (die Übersicht
 * verlässt den Bildschirm links, das Kassenbuch kommt von rechts; AppShell schneidet am Rand ab) – nie zwei Seiten
 * übereinander. Unterzeile ohne Datum („Stand …“ veraltet, die App setzt dort das Tagesdatum).
 */
const FinanceScreen: React.FC<{ f: number; off: number }> = ({ f, off }) => {
  // zählt schon, während der Bildschirm aus der Tiefe kommt – fertig auf „Kasse“
  const balance = countUp(f, S.finanzen.from + 2, 40, 0, 13944.47);
  const draw = easeInOut(invLerp(S.finanzen.from + 4, T.kasse + 10, f));
  const tab = ap(f, T.kassenbuch - 3, 14);
  // Versatz der Seiten in CSS-px (eine ganze Bildschirmbreite: der Abstand zwischen beiden = Seitenrand links + rechts)
  const dx = -CSS_W * tab;
  return (
    <AppShell height={SCREEN_H}>
      <X3 width={CONTENT_W}>
        <FinanceHeader tab={2 * tab} description="Geschäftsjahr 2026" />
        <div style={{ position: "relative" }}>
          {/* Übersicht bleibt im Fluss (hält die Höhe), gleitet hinaus und tritt dabei leicht zurück */}
          <div
            style={{
              opacity: 1 - 0.3 * tab,
              transform: tab > 0 ? `translateX(${dx.toFixed(2)}px)` : undefined,
              visibility: tab >= 0.999 ? "hidden" : undefined,
            }}
          >
            <KontostandCard value={balance} draw={draw} />
          </div>
          {tab > 0.001 ? (
            <div style={{ position: "absolute", left: 0, top: 0, width: CONTENT_W, transform: `translateX(${(CSS_W + dx).toFixed(2)}px)` }}>
              <LedgerTable />
            </div>
          ) : null}
        </div>
      </X3>
      {/* Bildschirm erlischt (Feierabend) bzw. tritt zurück, wenn vorn etwas scharf ist */}
      {off > 0.002 ? <div style={{ position: "absolute", inset: 0, background: "#020307", opacity: off }} /> : null}
    </AppShell>
  );
};

/* ------------------------------------------------------------------ Bildfolge */

export const Kasse: React.FC<{ f: number }> = ({ f }) => {
  if (f < T.from || f >= T.end) return null;

  // Kamera: ruhige Fahrt nach vorn, zum Feierabend leicht zurück und nach unten geneigt
  const drift = smooth(invLerp(T.from, T.down, f));
  const sink = smoothstep(T.down - 2, T.down + 42, f);
  const cam = {
    dolly: lerp(-80, 40, drift) - 110 * sink,
    orbitY: lerp(5, -3, drift),
    orbitX: lerp(-3, 2, drift) + 3 * sink,
  };

  // Schärfe: Bildschirm → Buchungen → Rechnungskarte → zurück
  const fStrips = ap(f, T.mit - 10, 16);
  const fCard = ap(f, T.offene - 5, 22);
  // zum Feierabend bleibt die Schärfe vorn: was zurücksinkt, verschwimmt
  const focusRel = 250 * fStrips * (1 - fCard) + 390 * fCard;
  const away = Math.max(fStrips, fCard);

  // Bildschirm
  const scrSink = smoothstep(T.down, T.down + 46, f);
  const scrOff = smoothstep(T.down - 2, T.down + 24, f);
  const screen = {
    y: 930 + 70 * scrSink,
    z: -700 * scrSink,
    rotY: lerp(-8, -4, drift),
    rotX: lerp(5, 3, drift) + 8 * scrSink,
    opacity: 1 - smoothstep(0.3, 0.85, scrSink),
  };

  // Karte „Offene Rechnungen“: hebt sich auf „Offene“, Glanz auf „sofort“, setzt sich zum Feierabend und sinkt
  const rise = ap(f, T.offene - 3, 26);
  const lift = rise * (1 - ap(f, T.down - 2, 22));
  const amberSink = smoothstep(T.down, T.down + 40, f);
  const amberPulse = blip(f, T.sofort - 1, 4, 22);
  // leiser Vorbote auf „Rechnungen“ (Reiter leuchtet, die Karte glimmt kurz mit)
  const hint = blip(f, T.rechnungen, 4, 20);
  const peek = ap(f, T.rechnungen - 2, 12) * (1 - ap(f, T.rechnungen + 12, 18)) * (1 - rise);
  // zum Feierabend erlischt die Karte (wie der Bildschirm) – kein unscharfer Farbfleck hinter „Dann ist“
  const amberOff = smoothstep(T.down, T.down + 26, f);
  const amber = {
    x: lerp(AMBER_BASE.x, AMBER_LIFT.x, rise),
    y: lerp(AMBER_BASE.y, AMBER_LIFT.y, rise) - 54 * peek + 150 * amberSink,
    z: lerp(AMBER_BASE.z, AMBER_LIFT.z, rise) - 820 * amberSink,
    rotY: lerp(AMBER_BASE.rotY, AMBER_LIFT.rotY, rise) - 7 * peek,
    rotX: lerp(AMBER_BASE.rotX, AMBER_LIFT.rotX, rise) + 10 * amberSink,
    scale: lerp(AMBER_BASE.scale, AMBER_LIFT.scale, rise) * (1 + 0.035 * amberPulse + 0.04 * peek),
    opacity: 1 - smoothstep(0.4, 1, amberSink),
    glow: (0.3 + 1.0 * lift + 0.6 * amberPulse + 0.3 * hint + 0.45 * peek) * (1 - 0.85 * amberOff),
  };

  // Hintergrund sinkt mit
  const bgSink = smoothstep(T.down + 2, T.down + 44, f);
  const showFinance = f < T.down + 50;

  // Buchungsstreifen (zwischen „mit“ und „Offene“)
  const showStrips = f >= T.mit - 11 && f < T.offene + 10;

  // Leuchtschrift
  const h1Exit = ex(f, T.beitraege - 10, 8);
  const tabsIn = ap(f, T.beitraege - 9, 14);
  const tabsOut = ex(f, T.offene - 13, 8);
  // Neon-Reiterleiste in App-Reihenfolge (Beiträge · Kassenbuch · Rechnungen), Leuchtkachel springt im Takt der Stimme:
  // Beiträge → Rechnungen → Kassenbuch (dort landet zugleich die Reiterkachel der App im Bildschirm)
  const tabCues: number[] = [];
  tabCues[TAB.beitraege] = T.beitraege;
  tabCues[TAB.kassenbuch] = T.kassenbuch;
  tabCues[TAB.rechnungen] = T.rechnungen;
  const lit = tabCues.map((c) => sn(f, c - 2, 8));
  const flare = tabCues.map((c) => blip(f, c - 1, 3, 16));
  // Sprung: die alte Kachel erlischt schnell, die neue leuchtet einen Frame später auf (wie der erste Auftritt)
  const tileOn = (c: number) => sn(f, c - 1, 8);
  const tileOff = (c: number) => sn(f, c - 2, 5);
  const tile: number[] = [];
  tile[TAB.beitraege] = sn(f, T.beitraege - 2, 8) * (1 - tileOff(T.rechnungen));
  tile[TAB.rechnungen] = tileOn(T.rechnungen) * (1 - tileOff(T.kassenbuch));
  tile[TAB.kassenbuch] = tileOn(T.kassenbuch);
  // „Sofort im Blick.“ steht ab ~1356 vollständig und bleibt bis T.down + 8 stehen (Lesepause), dann ruhiger Abgang
  const h3Exit = ex(f, T.down + 8, 9);
  const tabsFs = 48;
  const tabsL = neonTabsLayout(tabsFs);

  // Feierabend
  const warm = smoothstep(T.down + 4, T.feierabend + 4, f);
  // der Punkt setzt sich, sobald „Feierabend“ steht – vor dem Zoom in die nächste Szene
  const dotP = f >= T.feierabend + 6 ? sp(f, T.feierabend + 6, POP) : 0;
  const dotFlare = blip(f, T.feierabend + 6, 3, 18);

  return (
    <AbsoluteFill>
      <WarmLight k={warm} textY={LAYOUT.centerY} />
      {showFinance ? (
        <NeonScene3D camera={cam} focusZ={cam.dolly + focusRel} dof={3} maxBlur={18} dim={0.5}>
          {/* weit hinten: Lichtfleck und zwei dunkle Glaskarten */}
          <Layer3D x={170} y={1250} z={-900 - 400 * bgSink} width={440} height={440} opacity={0.9 * (1 - bgSink)} noDim>
            <Bokeh size={440} color={NEON.blue} alpha={0.42} />
          </Layer3D>
          <Layer3D x={150} y={650} z={-620 - 520 * bgSink} rotY={26} rotX={-6} width={380} height={250} opacity={1 - bgSink}>
            <BackCard w={380} h={250} />
          </Layer3D>
          <Layer3D x={958} y={1500} z={-480 - 520 * bgSink} rotY={-24} rotX={5} width={400} height={270} opacity={1 - bgSink}>
            <BackCard w={400} h={270} rows={3} tint={0.5} />
          </Layer3D>

          {/* Glas-Bildschirm mit der App */}
          <Layer3D x={540} y={screen.y} z={screen.z} rotY={screen.rotY} rotX={screen.rotX} width={SCREEN_W} height={SCREEN_PANEL_H} opacity={screen.opacity}>
            <ScreenPanel width={SCREEN_W} screenHeight={SCREEN_H} glow={lerp(0.95, 0.2, scrOff)} tint={0.55} edge={lerp(1.25, 0.5, scrOff)}>
              <FinanceScreen f={f} off={Math.max(0.3 * away, 0.9 * scrOff)} />
            </ScreenPanel>
          </Layer3D>

          {/* Karte „Offene Rechnungen“ */}
          <Layer3D x={amber.x} y={amber.y} z={amber.z} rotY={amber.rotY} rotX={amber.rotX} scale={amber.scale} width={AMBER_W} height={AMBER_H} opacity={amber.opacity}>
            <AmberCard lift={Math.max(lift, 0.55 * peek)} glow={amber.glow} off={amberOff} sheen={invLerp(T.sofort - 3, T.sofort + 15, f)} />
          </Layer3D>

          {/* Buchungen mit Beleg lösen sich aus dem Bildschirm */}
          {showStrips
            ? STRIP_POSE.map((pose, i) => {
                const pIn = ap(f, T.mit - 10 + 4 * i, 20);
                // zurück in den Bildschirm, während sich die Rechnungskarte hebt (schneller als der Auftritt)
                const pOut = ex(f, T.offene - 10 + 2 * i, 10);
                if (pIn <= 0.001 || pOut >= 0.999) return null;
                const x = lerp(540, pose.x, pIn);
                const y = lerp(820 + 130 * i, pose.y, pIn) + 40 * pOut;
                const z = lerp(10, pose.z, pIn) - 230 * pOut;
                const rotY = lerp(screen.rotY, pose.rotY, pIn);
                const rotX = lerp(screen.rotX, pose.rotX, pIn);
                const scale = lerp(0.84, 1, pIn);
                const link = ap(f, T.belegen - 1 + 3 * i, 12);
                return (
                  <Layer3D key={i} x={x} y={y} z={z} rotY={rotY} rotX={rotX} scale={scale} width={STRIP_W} height={STRIP_H} opacity={clamp01(pIn * 1.5) * (1 - pOut)}>
                    <LedgerStrip entry={LEDGER[i]} link={link} glow={0.5 + 0.4 * link} />
                  </Layer3D>
                );
              })
            : null}

          {/* Lichtfleck ganz vorn (unscharf, gibt Tiefe) */}
          <Layer3D x={985} y={820} z={420} width={220} height={220} opacity={0.75 * (1 - bgSink)} noDim>
            <Bokeh size={220} color={NEON.sky} alpha={0.16} />
          </Layer3D>
        </NeonScene3D>
      ) : null}

      {/* Leuchtschrift oben */}
      {f < T.beitraege && h1Exit < 1 ? (
        <div style={{ position: "absolute", left: 40, right: 40, top: LAYOUT.headTop, display: "flex", justifyContent: "center" }}>
          <GlowText
            text="Bleibt noch die Kasse."
            frame={f}
            wordStarts={[T.bleibt - 2, T.noch - 2, T.die - 2, T.kasse - 2]}
            mode="rise"
            reveal={14}
            fontSize={72}
            glow={1}
            flare={0.8}
            extrude={3}
            echo={2}
            exit={h1Exit}
          />
        </div>
      ) : null}
      {tabsIn > 0.001 && tabsOut < 1 ? (
        <div
          style={{
            position: "absolute",
            left: 540 - tabsL.width / 2,
            top: LAYOUT.headTop - 4,
            opacity: tabsIn * (1 - tabsOut),
            transform: `translateY(${(26 * (1 - tabsIn) - 30 * tabsOut).toFixed(2)}px) scale(${(0.94 + 0.06 * tabsIn).toFixed(4)})`,
            filter: tabsIn < 0.99 || tabsOut > 0.01 ? `blur(${(10 * (1 - tabsIn) + 8 * tabsOut).toFixed(2)}px)` : undefined,
          }}
        >
          <NeonTabs lit={lit} tile={tile} flare={flare} fontSize={tabsFs} />
        </div>
      ) : null}
      {f >= T.offene - 6 && h3Exit < 1 ? (
        <div style={{ position: "absolute", left: 40, right: 40, top: LAYOUT.headTop - 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <GlowText text="Offene Rechnungen?" frame={f} wordStarts={[T.offene - 2, T.rechnungen2 - 2]} mode="rise" reveal={14} fontSize={68} glow={1} flare={0.8} extrude={3} echo={2} exit={h3Exit} />
          <GlowText
            text="Sofort im Blick."
            frame={f}
            wordStarts={[T.sehen - 1, T.sehen + 4, T.sehen + 8]}
            mode="rise"
            reveal={14}
            fontSize={68}
            color={NEON.hot}
            glow={1}
            glowCore="#FFB48F"
            glowOuter={NEON.orange}
            flare={0.9}
            extrude={0}
            echo={2}
            exit={h3Exit}
          />
        </div>
      ) : null}

      {/* Feierabend: ruhig in der Mitte, Punkt als Schlusspunkt */}
      {f >= T.dann - 4 ? (
        <div style={{ position: "absolute", left: 40, right: 40, top: LAYOUT.centerY - 150, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <GlowText
            text="Dann ist"
            frame={f}
            wordStarts={[T.dann - 2, T.ist - 2]}
            mode="blur"
            reveal={18}
            fontSize={60}
            weight={500}
            color={NEON.hot}
            glow={0.7}
            glowCore="#FFC9AE"
            glowOuter={NEON.orange}
            flare={0.5}
          />
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", marginTop: 2 }}>
            <GlowText
              text="Feierabend"
              frame={f}
              wordStarts={[T.feierabend - 3]}
              mode="blur"
              reveal={14}
              fontSize={118}
              color={NEON.hot}
              glow={1.05}
              glowCore="#FFB892"
              glowOuter={NEON.orange}
              flare={0.7}
              extrude={0}
            />
            <div style={{ marginLeft: 10 }}>
              <EndDot size={24} p={dotP} flare={dotFlare} />
            </div>
          </div>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
