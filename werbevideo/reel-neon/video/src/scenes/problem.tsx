/**
 * Szene „problem“ (75–240, Vorbild t03.25–t04.25): Die Hook-Pille schrumpft zur kleinen Mittelzeile, dunkle Glas-Karten
 * kommen aus der Tiefe und schweben um sie herum (Tiefenschärfe). „Dienstagabend, nach der Arbeit.“ als Leuchtschrift.
 * Auf „dreimal“ fächern drei fast gleiche Tabellen-Karten auf, auf „zweihundert Nachrichten“ stapeln sich Chat-Blasen und
 * das Abzeichen zählt bis 200. Übergabe von „hook“ per „cut“ (gleiche Pille), an „frage“ per Zoom (Video.tsx).
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import { LAYOUT, S } from "../film";
import { cue, cueEnd } from "../lib/timeline";
import { GlowText, Layer3D, NEON, NeonScene3D, blip, clamp01, easeInOut, invLerp, lerp, smooth } from "../neon";
import { easeIn } from "../neon/util";
import { GLIDE, POP, sp } from "../springs";
import { HANDOVER, SHRINK_AT, ShrinkingPill } from "./hook/pille";
import { BokehDot, CHAT, CHAT_H, CHAT_W, ChatCard, CountBadge, FilesCard, LinesCard, NoticeCard, SHEET_H, SHEET_W, SheetCard } from "./problem/karten";
import type { NeonScene } from "./types";

const P = S.problem;
const C = {
  dienstag: cue("dienstagabend", { section: 1 }),
  nach: cue("nach", { section: 1 }),
  der: cue("der", { section: 1 }),
  arbeit: cue("arbeit", { section: 1 }),
  die: cue("die", { section: 1 }),
  liste: cue("liste", { section: 1 }),
  gibt: cue("gibt", { section: 1 }),
  es: cue("es", { section: 1 }),
  dreimal: cue("dreimal", { section: 1 }),
  dreimalEnd: cueEnd("dreimal", { section: 1 }),
  im: cue("im", { section: 1 }),
  chat: cue("chat", { section: 1 }),
  zwei: cue("zweihundert", { section: 1 }),
  zweiEnd: cueEnd("zweihundert", { section: 1 }),
  nachr: cue("nachrichten", { section: 1 }),
};

/** Abschnitts-Fenster: A Dienstagabend · B dreimal · C Chat */
const A_OUT = C.die - 11;
const B_IN = C.die - 14;
/** „dreimal.“ und die drei Tabellen stehen, bis das Wort zu Ende gesprochen ist (≈ 10 Frames lesbar) */
const B_OUT = C.dreimalEnd;
/** Chat gleitet herein, während die Tabellen abgehen; „Im Chat:“ erst, wenn „Die Liste gibt es dreimal.“ weg ist */
const C_IN = C.im - 3;
const IM_IN = C.im + 2;

/** Blasen im Gruppenchat: werden immer schneller (Chaos) */
const ARRIVALS: number[] = (() => {
  const gaps = [0, 6, 5, 5, 4, 3, 3, 3, 3];
  let t = C.im + 2;
  // drei ältere Blasen stehen schon da, wenn der Chat hereingleitet
  return [C_IN - 60, C_IN - 60, C_IN - 60, ...gaps.map((g) => (t += g))];
})();

/** Zähler: bis „zweihundert“ die Zahl der Blasen, dann hoch bis 200 (fertig am Wortende) */
const countAt = (f: number) => {
  const n = ARRIVALS.filter((a) => a <= f).length + 9;
  if (f < C.zwei - 1) return n;
  const k = easeInOut(invLerp(C.zwei - 1, C.zweiEnd, f));
  return Math.round(lerp(n, 200, k));
};

// ---- Leuchtschrift ------------------------------------------------------------------------

const Line: React.FC<{ top: number; children: React.ReactNode }> = ({ top, children }) => (
  <div style={{ position: "absolute", left: 60, right: 60, top, display: "flex", justifyContent: "center" }}>{children}</div>
);

const Texts: React.FC<{ f: number }> = ({ f }) => {
  const exA = easeIn(invLerp(A_OUT - 1, A_OUT + 7, f), 2);
  const exB = easeIn(invLerp(B_OUT, B_OUT + 5, f), 2);
  return (
    <>
      {f >= C.dienstag - 2 && exA < 0.999 ? (
        <>
          <Line top={LAYOUT.centerY - 120}>
            <GlowText text="Dienstagabend," frame={f} wordStarts={[C.dienstag]} fontSize={100} weight={800} mode="rise" echo={2} glow={0.95} flare={1.1} extrude={4} exit={exA} />
          </Line>
          <Line top={LAYOUT.centerY + 4}>
            <GlowText text="nach der Arbeit." frame={f} wordStarts={[C.nach, C.der, C.arbeit]} fontSize={64} weight={500} mode="rise" echo={1} glow={0.55} flare={0.7} exit={exA} />
          </Line>
        </>
      ) : null}
      {f >= C.die - 2 && exB < 0.999 ? (
        <>
          <Line top={LAYOUT.headTop}>
            <GlowText text="Die Liste gibt es" frame={f} wordStarts={[C.die, C.liste, C.gibt, C.es]} fontSize={62} weight={500} mode="rise" glow={0.55} flare={0.6} exit={exB} />
          </Line>
          <Line top={LAYOUT.headTop + 70}>
            <GlowText text="dreimal." frame={f} wordStarts={[C.dreimal]} fontSize={128} weight={800} mode="pop" echo={2} glow={1.05} flare={1.3} extrude={5} exit={exB} />
          </Line>
        </>
      ) : null}
      {f >= IM_IN - 2 ? (
        <>
          <Line top={LAYOUT.headTop}>
            <GlowText text="Im Chat:" frame={f} wordStarts={[IM_IN, C.chat]} fontSize={62} weight={500} mode="rise" glow={0.55} flare={0.6} />
          </Line>
          <Line top={LAYOUT.headTop + 70}>
            <GlowText text="200 Nachrichten." frame={f} wordStarts={[C.zwei, C.nachr]} fontSize={96} weight={800} mode="pop" echo={2} glow={1} flare={1.2} extrude={4} />
          </Line>
        </>
      ) : null}
    </>
  );
};

// ---- Bühne --------------------------------------------------------------------------------

const ProblemComp: React.FC<{ f: number }> = ({ f }) => {
  // Schnitt von „hook“: vor HANDOVER zeichnet hook die Pille (ab HANDOVER problem, gleiche Funktion von f)
  if (f < HANDOVER) return null;

  // Kamera: langsame Fahrt nach vorn mit leichtem Orbit (Parallaxe), ab dem Schrumpfen über die ganze Szene
  const m = smooth(invLerp(SHRINK_AT, P.to, f));
  const cam = { dolly: lerp(-120, 110, m), orbitY: lerp(5, -4, m), orbitX: lerp(-3, 2.5, m) };

  // A: Karten kommen schon während des Schrumpfens aus der Tiefe (um die kleine Mittelzeile, t03.75) und fliegen später an der Kamera vorbei
  const inA = (i: number) => sp(f, SHRINK_AT + 2 + i * 3, GLIDE);
  const outA = easeIn(invLerp(A_OUT - 4, A_OUT + 10, f), 2);
  const zA = (i: number, z: number) => z + lerp(-760, 0, inA(i)) + 1250 * outA;
  const opA = (i: number) => clamp01(inA(i) * 1.6) * (1 - smooth(invLerp(A_OUT + 2, A_OUT + 10, f)));

  // B: eine Tabelle kommt nach vorn, auf „dreimal“ fächern zwei Kopien dahinter nach oben auf
  const inB = sp(f, B_IN, GLIDE);
  const fan = (i: number) => sp(f, C.dreimal - 2 + i * 2, POP);
  const outB = easeIn(invLerp(B_OUT, B_OUT + 10, f), 2);
  const sheet = (i: number) => {
    const k = i === 0 ? 0 : fan(i - 1);
    const base = { x: 545, y: 1110, z: 0, rotZ: 0 };
    const target = [
      { x: 590, y: 1172, z: 30, rotZ: 2.5 },
      { x: 520, y: 1000, z: -60, rotZ: -2 },
      { x: 455, y: 838, z: -125, rotZ: -6 },
    ][i];
    const fz = i === 0 ? fan(0) : k;
    return {
      x: lerp(base.x, target.x, fz) - 560 * outB,
      y: lerp(base.y, target.y, fz) + lerp(160, 0, inB),
      z: lerp(base.z, target.z, fz) + lerp(-900, 0, inB) - 420 * outB,
      rotZ: lerp(base.rotZ, target.rotZ, fz),
      rotY: lerp(-12, -4, inB) + 26 * outB,
      rotX: lerp(9, 4, inB),
      op: (i === 0 ? clamp01(inB * 1.6) : clamp01(k * 3)) * (1 - smooth(invLerp(B_OUT + 3, B_OUT + 10, f))),
    };
  };

  // C: Gruppenchat gleitet von rechts aus der Tiefe in die Mitte, dahinter zwei weitere Chats
  const inC = sp(f, C_IN, GLIDE);
  const badgeIn = sp(f, C.chat, POP);
  const pulse = blip(f, C.nachr, 2, 16) + 0.6 * blip(f, C.zwei, 2, 10);
  const shake = Math.sin(f * 1.7) * 3 * smooth(invLerp(C.zwei, C.zwei + 4, f)) * (1 - smooth(invLerp(C.zweiEnd, C.zweiEnd + 8, f)));
  const chatX = lerp(990, 540, inC);
  const chatY = 1060;
  const chatZ = lerp(-650, 0, inC);
  const bgArr = (o: number) => ARRIVALS.map((a, i) => (i < 6 ? a + o : undefined));

  return (
    <AbsoluteFill>
      <NeonScene3D camera={cam} focusZ={cam.dolly} dof={3.1} maxBlur={20} dim={0.45}>
        {/* Tiefe: Lichtpunkte vorn und hinten, darunter ein kleiner oranger (der VereinsFlow-Punkt lauert) */}
        <Layer3D x={160} y={1600} z={-900} width={460} height={460} opacity={0.85}>
          <BokehDot size={460} color={NEON.blue} alpha={0.55} />
        </Layer3D>
        <Layer3D x={760} y={640} z={-700} width={110} height={110} opacity={0.75 * clamp01(inA(2) * 1.4)} noDim>
          <BokehDot size={110} color={NEON.orange} alpha={0.8} />
        </Layer3D>
        <Layer3D x={930} y={1660} z={520} width={360} height={360} opacity={0.85}>
          <BokehDot size={360} color={NEON.sky} alpha={0.3} />
        </Layer3D>

        {/* A: schwebende Glas-Karten um die Mittelzeile */}
        {opA(0) > 0.002 ? (
          <Layer3D x={238} y={560} z={zA(0, 280)} rotY={16} rotX={6} width={520} height={320} opacity={opA(0)}>
            <LinesCard w={520} h={320} tint={0.92} />
          </Layer3D>
        ) : null}
        {opA(1) > 0.002 ? (
          <Layer3D x={850} y={590} z={zA(1, -380)} rotY={-20} rotX={4} scale={0.72} width={SHEET_W} height={SHEET_H} opacity={opA(1)}>
            <SheetCard index={1} tint={0.75} />
          </Layer3D>
        ) : null}
        {opA(2) > 0.002 ? (
          <Layer3D x={300} y={1330} z={zA(2, 40)} rotY={12} rotX={-4} width={600} height={300} opacity={opA(2)}>
            <FilesCard w={600} h={300} />
          </Layer3D>
        ) : null}
        {opA(3) > 0.002 ? (
          <Layer3D x={805} y={1250} z={zA(3, -210)} rotY={-16} rotX={-2} width={470} height={150} opacity={opA(3)}>
            <NoticeCard w={470} h={150} text="Wer kommt Do??" />
          </Layer3D>
        ) : null}
        {opA(4) > 0.002 ? (
          <Layer3D x={1060} y={900} z={zA(4, 450)} rotY={-24} width={300} height={420} opacity={opA(4)}>
            <LinesCard w={300} h={420} tint={0.45} lines={[0.8, 0.6, 0.7]} />
          </Layer3D>
        ) : null}

        {/* B: drei fast gleiche Listen (hinten zuerst, damit die vordere sie verdeckt) */}
        {f >= B_IN - 2
          ? [2, 1, 0].map((i) => {
              const s = sheet(i);
              if (s.op <= 0.002) return null;
              return (
                <Layer3D key={`s${i}`} x={s.x} y={s.y} z={s.z} rotX={s.rotX} rotY={s.rotY} rotZ={s.rotZ} scale={1.08} width={SHEET_W} height={SHEET_H} opacity={s.op} zBias={i === 0 ? 40 : 0}>
                  <SheetCard index={i} tint={i === 0 ? 0.3 : 0.38} glow={i === 0 ? 0.8 : 0.55} solid />
                </Layer3D>
              );
            })
          : null}

        {/* C: Chats in der Tiefe, vorn der Gruppenchat mit Zähler */}
        {f >= C_IN - 2 ? (
          <>
            <Layer3D x={lerp(-80, 210, inC)} y={760} z={-560} rotY={20} rotX={4} scale={0.8} width={CHAT_W} height={CHAT_H} opacity={clamp01(inC * 1.5) * 0.9}>
              <ChatCard f={f} arrivals={bgArr(2)} msgs={[CHAT[3], CHAT[0], CHAT[6], CHAT[9], CHAT[1], CHAT[7]]} title="Abteilung Fußball" tint={0.5} glow={0.5} />
            </Layer3D>
            <Layer3D x={lerp(1200, 900, inC)} y={1330} z={-380} rotY={-22} rotX={-3} scale={0.72} width={CHAT_W} height={CHAT_H} opacity={clamp01(inC * 1.5) * 0.9}>
              <ChatCard f={f} arrivals={bgArr(4)} msgs={[CHAT[8], CHAT[2], CHAT[10], CHAT[5], CHAT[11], CHAT[4]]} title="Helfer Sommerfest" tint={0.5} glow={0.5} />
            </Layer3D>
            <Layer3D x={chatX + shake} y={chatY} z={chatZ} rotY={lerp(-28, -5, inC)} rotX={lerp(6, 3, inC)} width={CHAT_W} height={CHAT_H} opacity={clamp01(inC * 1.4)}>
              <ChatCard f={f} arrivals={ARRIVALS} />
              {badgeIn > 0.01 ? (
                <div style={{ position: "absolute", right: -46, top: -54, transform: `scale(${(badgeIn * (1 + 0.14 * pulse)).toFixed(4)})`, transformOrigin: "70% 50%" }}>
                  <CountBadge value={countAt(f)} pulse={clamp01(pulse)} />
                </div>
              ) : null}
            </Layer3D>
          </>
        ) : null}
      </NeonScene3D>
      <ShrinkingPill f={f} />
      <Texts f={f} />
    </AbsoluteFill>
  );
};

export const problem: NeonScene = {
  id: "problem",
  Comp: ProblemComp,
  // Bänder am Rand, beim Chat-Chaos etwas gedämpfter (Kontrast für die Blasen)
  mood: (f) => ({ layout: "drift", ribbons: lerp(0.42, 0.34, smooth(invLerp(C.im - 10, C.im + 10, f))), tint: 0.25, particles: 0.35 }),
};
