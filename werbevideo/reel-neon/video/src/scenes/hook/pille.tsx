/**
 * Die Hook-Pille (Vorbild t02.75): „Ihr Verein läuft immer noch über Excel?“ tippt sich Wort für Wort im Takt der Stimme
 * in die leuchtende Pille – dreizeilig („Ihr Verein läuft / immer noch / über Excel?“), damit die ganze Frage groß und
 * vollständig im Bild steht. Die Pille wächst beim Tippen nach unten (die getippten Zeilen bleiben stehen), die Kamera
 * steht still. Nach dem „?“ steht die fertige Frage, dann schrumpft sie (Vorbild t03.25 → t03.75) zur kleinen,
 * gleich umbrochenen Mittelzeile: Pille und Mittelzeile liegen in jedem Frame deckungsgleich übereinander (gleiche Zeilen,
 * gleiche Kamera), daher ist die Überblendung ein Wechsel der Schriftstärke statt einer Doppelbelichtung. Vor
 * „Dienstagabend“ zieht sich die Mittelzeile nach hinten oben zurück und gibt die Bildmitte frei.
 * Geteilt von hook und problem: beide zeichnen dieselbe <ShrinkingPill>; hook bis HANDOVER, problem ab HANDOVER –
 * so ist der Schnitt nahtlos und problem kann seine Glas-Karten schon während des Schrumpfens aus der Tiefe holen.
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import { LEAD, S } from "../../film";
import { textWidth } from "../../lib/measure";
import { cue } from "../../lib/timeline";
import { GlowPill, GlowText, clamp01, easeOut, glowPillLayout, invLerp, lerp, smooth } from "../../neon";
import { easeIn } from "../../neon/util";
import { sp } from "../../springs";
import { synthTypingFull, wordKeyTimes } from "./tippen";

export const HOOK_TEXT = "Ihr Verein läuft immer noch über Excel?";
/** Zeilen der Pille und der kleinen Mittelzeile (gleicher Umbruch → deckungsgleiche Überblendung) */
export const HOOK_LINES = ["Ihr Verein läuft", "immer noch", "über Excel?"] as const;

/**
 * Pille: Schriftgröße, Mitte der fertigen dreizeiligen Pille (y). Tipp-Takt kommt aus der Stimme (HOOK_TIMES); cps ist
 * nur das Grundtempo, mit dem GlowPill rechnet – es muss langsamer sein als jeder Anschlagsabstand (siehe synthTypingFull).
 */
export const PILL = { fontSize: 100, cy: 930, cps: 6 } as const;
/** Laufweite der Pillenschrift (wie in glowPillLayout) */
const PILL_LS = -0.012;
/** kleine Mittelzeile (Medium wie t04.25) */
const SMALL = { fontSize: 60, weight: 500, ls: -0.01 } as const;

const HOOK_KEYS = ["ihr", "verein", "läuft", "immer", "noch", "über", "excel"];
/** Anschläge im Takt der Stimme (je Wort ab Wortanfang − 2 Frames) */
export const HOOK_TIMES = wordKeyTimes(
  HOOK_TEXT,
  HOOK_KEYS.map((k) => cue(k, { section: 0 })),
  2,
);
export const HOOK_TYPED = HOOK_TIMES[HOOK_TIMES.length - 1];

/** Schrumpfen beginnt 9 Frames nach dem „?“ (Stimme endet bei ≈ 63): so lange steht die fertige Frage groß und ruhig */
export const SHRINK_AT = Math.round(HOOK_TYPED) + 9;
/** Ab hier zeichnet problem die Pille (und seine Karten); erster Frame, in dem problem gezeigt wird */
export const HANDOVER = S.problem.from - LEAD;

const DIENSTAG = cue("dienstagabend", { section: 1 });
/** Abgang der Mittelzeile: fertig, bevor „Dienstagabend,“ in derselben Bildmitte aufsteigt */
const EXIT_FROM = DIENSTAG - 8;
const EXIT_TO = DIENSTAG - 2;

/** Umriss zeichnet sich ab kurz vor dem ersten Anschlag (der Punkt zündet ihn) */
export const pillDraw = (f: number) => easeOut(invLerp(HOOK_TIMES[0] - 5, HOOK_TIMES[0] + 15, f), 2);

/** Rahmen der fertigen Pille im Bild (Maße wie glowPillLayout) und Lage der kleinen Mittelzeile */
const frameOf = () => {
  const F = PILL.fontSize;
  const padX = F * 0.62;
  const padY = F * 0.34;
  const lineH = F * 1.18;
  const textW = Math.max(...HOOK_LINES.map((l) => textWidth(l, F, 800, PILL_LS)));
  const width = padX * 2 + textW + F * 0.3;
  const height = padY * 2 + lineH * HOOK_LINES.length;
  const left = (1080 - width) / 2;
  const top = PILL.cy - height / 2;
  // kleine Mittelzeile: gleicher Umbruch, Maßstab aus den Zeilenbreiten (Medium 60 px ≈ 0,58 × Pillenschrift)
  const smallW = Math.max(...HOOK_LINES.map((l) => textWidth(l, SMALL.fontSize, SMALL.weight, SMALL.ls)));
  const s = smallW / textW;
  const smallLineH = lineH * s;
  return {
    F,
    padY,
    lineH,
    left,
    top,
    // Umbruch nach „läuft“ und „noch“: knapp breiter als die längste Zeile
    maxWidth: textW + 4,
    /** Schrift-Ursprung der Pille (linke Kante der Zeilen, Oberkante Zeile 1) */
    ox: left + padX,
    oy: top + padY,
    s,
    smallW,
    smallLineH,
    /** Schrift-Ursprung der Mittelzeile: Block mittig im Bild, Zeilen linksbündig wie in der Pille */
    sx: 540 - smallW / 2,
    sy: PILL.cy - (smallLineH * HOOK_LINES.length) / 2,
  };
};

/** Tipp-Zustand der Pille zu f: voller Text (stabile Zeilen), genau die bis f getippten Zeichen */
const pillTyping = (f: number) => {
  const P = frameOf();
  const t = synthTypingFull(HOOK_TEXT, HOOK_TIMES, f, PILL.cps);
  const L = glowPillLayout({ text: HOOK_TEXT, f, typeStart: t.typeStart, cps: PILL.cps, fontSize: P.F, maxWidth: P.maxWidth });
  return { P, t, L };
};

/** Maße der Pille und ihre Lage im Bild (wächst nach unten; Spitze links auf Höhe der ersten Zeile) */
export const pillGeometry = (f: number) => {
  const { P, L } = pillTyping(f);
  return { L, left: P.left, top: P.top, width: L.width, height: L.height, tipY: P.top + P.padY + P.lineH / 2, cx: P.left + L.width / 2, cy: P.top + L.height / 2 };
};

export const HookPill: React.FC<{ f: number; glow?: number; appear?: number; draw?: number; style?: React.CSSProperties }> = ({ f, glow = 1.25, appear, draw, style }) => {
  const { P, t, L } = pillTyping(f);
  return (
    <GlowPill
      frame={f}
      text={HOOK_TEXT}
      typeStart={t.typeStart}
      cps={PILL.cps}
      fontSize={P.F}
      maxWidth={P.maxWidth}
      x={P.left}
      // Oberkante steht, die Pille wächst mit jeder neuen Zeile nach unten
      y={P.top + L.height / 2}
      draw={draw ?? pillDraw(f)}
      glow={glow}
      extrude={5}
      appear={appear ?? clamp01(easeOut(invLerp(HOOK_TIMES[0] - 6, HOOK_TIMES[0] + 4, f)))}
      style={style}
    />
  );
};

// ---- Pille → kleine Mittelzeile ----------------------------------------------------------------

/** schnelle Feder fürs Schrumpfen der Pille */
const SHRINK = { damping: 26, stiffness: 180, mass: 0.8 };

/** Pille (tippt bis HOOK_TYPED, steht) → schrumpft ab SHRINK_AT zur Bildmitte und geht deckungsgleich in die kleine Mittelzeile über */
export const ShrinkingPill: React.FC<{ f: number }> = ({ f }) => {
  if (f < SHRINK_AT) return <HookPill f={f} />;
  const exit = easeIn(invLerp(EXIT_FROM, EXIT_TO, f), 2);
  if (exit >= 0.999) return null;
  const P = frameOf();
  // „Kamera“ zieht zurück: Maßstab 1 → s, Schrift-Ursprung der Pille wandert auf den der Mittelzeile
  const cam = (kk: number) => ({ sc: lerp(1, P.s, kk), x: lerp(P.ox, P.sx, kk), y: lerp(P.oy, P.sy, kk) });
  const k = sp(f, SHRINK_AT, SHRINK, { overshootClamping: true });
  const c = cam(k);
  // Umriss zieht sich zurück, Pille blendet aus, während die Mittelzeile an genau derselben Stelle einblendet
  const draw = pillDraw(f) * (1 - smooth(invLerp(SHRINK_AT, SHRINK_AT + 8, f)));
  const pillOut = smooth(invLerp(SHRINK_AT + 3, SHRINK_AT + 7, f));
  const small = smooth(invLerp(SHRINK_AT + 3, SHRINK_AT + 8, f));
  const pillLayer = (cc: { sc: number; x: number; y: number }, op: number, key: string, blur: number) => (
    <AbsoluteFill
      key={key}
      style={{
        transformOrigin: `${P.ox.toFixed(1)}px ${P.oy.toFixed(1)}px`,
        transform: `translate(${(cc.x - P.ox).toFixed(2)}px, ${(cc.y - P.oy).toFixed(2)}px) scale(${cc.sc.toFixed(4)})`,
        opacity: op,
        filter: blur > 0.3 ? `blur(${blur.toFixed(2)}px)` : undefined,
      }}
    >
      <HookPill f={f} glow={lerp(1.25, 0.8, k)} appear={1} draw={draw} />
    </AbsoluteFill>
  );
  // ein leiser Echo-Geist, solange die Pille schnell schrumpft (wie t03.25, aber ohne die Schrift zu verdoppeln)
  const kEcho = sp(f - 2, SHRINK_AT, SHRINK, { overshootClamping: true });
  const echo = k > 0.02 && k < 0.8 && pillOut < 0.9;
  // Mittelzeile: nach der Übernahme leichtes Nachschweben (Kamera zieht weiter zurück), Abgang nach hinten oben
  const drift = smooth(invLerp(SHRINK_AT + 8, EXIT_TO, f));
  const rel = (c.sc / P.s) * lerp(1, 0.97, drift) * lerp(1, 0.93, exit);
  const smallBlur = (1 - small) * 3 + exit * 10;
  const blockH = P.smallLineH * HOOK_LINES.length;
  return (
    <>
      {pillOut < 0.999 ? (
        <>
          {echo ? pillLayer(cam(kEcho), 0.22 * (1 - pillOut), "echo", 5) : null}
          {pillLayer(c, 1 - pillOut, "main", pillOut * 4)}
        </>
      ) : null}
      {small > 0.001 ? (
        <div
          style={{
            position: "absolute",
            left: P.sx,
            top: P.sy,
            width: P.smallW,
            height: blockH,
            // gleiche Kamera wie die Pille (Ursprung = Schrift-Ursprung), danach Nachschweben und Abgang um die Blockmitte
            transformOrigin: `0px 0px`,
            transform: `translate(${(c.x - P.sx + (P.smallW / 2) * (c.sc / P.s - rel)).toFixed(2)}px, ${(c.y - P.sy + (blockH / 2) * (c.sc / P.s - rel) - 60 * exit).toFixed(2)}px) scale(${rel.toFixed(4)})`,
            opacity: small * (1 - exit),
            filter: smallBlur > 0.3 ? `blur(${smallBlur.toFixed(2)}px)` : undefined,
          }}
        >
          {HOOK_LINES.map((line, i) => (
            <div key={line} style={{ position: "absolute", left: 0, top: i * P.smallLineH, height: P.smallLineH, display: "flex", alignItems: "center", whiteSpace: "nowrap" }}>
              <GlowText
                text={line}
                frame={f}
                mode="none"
                align="left"
                fontSize={SMALL.fontSize}
                weight={SMALL.weight}
                letterSpacing={SMALL.ls}
                lineHeight={P.smallLineH / SMALL.fontSize}
                glow={0.65}
                flare={0}
                style={{ whiteSpace: "nowrap" }}
              />
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
};
