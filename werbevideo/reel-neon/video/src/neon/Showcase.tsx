/**
 * Schaukasten der Neon-Bausteine: sieben Nachbauten von Referenz-Momenten in VereinsFlow-Farben. Jede Szene ist eine
 * Funktion des Frames (f relativ zum Szenenstart) – die Standbilder „Neon-1 … 7“ zeigen links den Nachbau, rechts das
 * Referenzbild; „Neon-Szenenbogen“ zeigt eine Szene zu mehreren Frames; „Neon-Demo“ spielt die Szenen hintereinander ab.
 * Alle Zahlen hier sind Demo-Werte (Platzhalter).
 */
import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { FontGate } from "../components/FontGate";
import { fontFamily } from "../fonts";
import { H, W } from "../theme";
import { Icon } from "../ui/icons";
import { AppShell } from "../ui/AppShell";
import { MembersPage } from "../ui/members";
import { CommandBar, ResponseCard, commandBarHeight } from "./CommandBar";
import { CurvedWall, TunnelMouth } from "./CurvedWall";
import { DotBurst, LightFloor, LogoReveal, fadeIn, logoDotPosition } from "./DotBurst";
import { GlassPanel, ScreenPanel, screenPanelHeight } from "./GlassPanel";
import { GlowPill, GlowText } from "./GlowText";
import { Bars, DonutRing, LineSpark, MetricCard } from "./Metrics";
import { NeonBackground, NeonVignette } from "./NeonBackground";
import { NEON, rgba } from "./palette";
import { Layer3D, NeonScene3D } from "./Scene3D";
import { easeInOut, easeOut, invLerp, lerp, smooth, typing } from "./util";

export const HOOK = "Ihr Verein läuft immer noch über Excel?";

/** f = Frame relativ zum Szenenstart; bg = eigenen Hintergrund zeichnen (aus, wenn ein durchgehender darunter liegt) */
export type SceneProps = { f: number; bg?: boolean };
export const QUESTION = "Wer kommt am Donnerstag?";

/** erster Frame, in dem `n` Zeichen getippt sind */
export const frameForChars = (start: number, text: string, cps: number, n: number) => {
  for (let f = start; f < start + 600; f++) if (typing(f, start, text, cps).shown >= n) return f;
  return start;
};

// ---- 1 Logo -------------------------------------------------------------------------------
const LOGO_W = 760;
const LOGO_X = 540;
const LOGO_Y = 880;

export const SceneLogo: React.FC<SceneProps> = ({ f, bg = true }) => {
  const dot = logoDotPosition(LOGO_X, LOGO_Y, LOGO_W);
  const fly = easeInOut(invLerp(0, 26, f));
  const settle = smooth(invLerp(30, 70, f));
  const path = [
    { x: -140, y: 1700 },
    { x: 250, y: 1430 },
    { x: 150, y: 1090 },
    { x: dot.x - 120, y: dot.y - 70 },
    { x: dot.x, y: dot.y },
  ];
  return (
    <AbsoluteFill>
      {bg ? <NeonBackground frame={f} layout="low" ribbons={0.22} particles={0.3} warm={0.4} lift={0.2} swooshAt={-2} /> : null}
      <LightFloor frame={f} intensity={1.1 * fadeIn(f, 18, 34)} y={1560} width={1500} height={1100} />
      <LogoReveal frame={f} start={24} x={LOGO_X} y={LOGO_Y} width={LOGO_W} hideDot />
      <DotBurst
        frame={f}
        path={path}
        pathProgress={fly}
        trail={f < 30 ? 0.24 : 0}
        size={dot.r * 2}
        glow={lerp(1.3, 0.55, settle)}
        flare={lerp(1, 0.22, settle)}
        rays={lerp(0.9, 0.22, settle)}
        burst={invLerp(26, 60, f)}
      />
    </AbsoluteFill>
  );
};

// ---- 0 Opener: Lichtbänder ----------------------------------------------------------------
/** Opener wie t00.25: große Lichtseide, am Anfang ein Wischer, der orange Punkt blitzt kurz auf */
export const SceneHero: React.FC<SceneProps> = ({ f }) => (
  <AbsoluteFill>
    <NeonBackground frame={f} layout="hero" ribbons={1} particles={0.4} swooshAt={0} swooshDuration={18} />
    <DotBurst frame={f} x={560} y={1130} size={30} glow={0.9} flare={0.8} rays={0.5} opacity={smooth(invLerp(14, 22, f)) * (1 - smooth(invLerp(40, 52, f)))} pulse={Math.sin(Math.PI * smooth(invLerp(14, 34, f))) * 0.6} />
  </AbsoluteFill>
);

// ---- 2 Pille ------------------------------------------------------------------------------
export const PILL = { typeStart: 8, cps: 16, fontSize: 124, x: 64, y: 940, followX: 990 } as const;

export const ScenePill: React.FC<SceneProps> = ({ f, bg = true }) => (
  <AbsoluteFill>
    {bg ? <NeonBackground frame={f} layout="drift" ribbons={0.42} particles={0.3} /> : null}
    <GlowPill frame={f} text={HOOK} typeStart={PILL.typeStart} cps={PILL.cps} fontSize={PILL.fontSize} x={PILL.x} y={PILL.y} followX={PILL.followX} appear={easeOut(invLerp(0, 10, f))} />
  </AbsoluteFill>
);

// ---- 3 Schwebende Karten mit Tiefenschärfe --------------------------------------------------
const Bubble: React.FC<{ text: string; mine?: boolean }> = ({ text, mine }) => (
  <div style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
    <div
      style={{
        maxWidth: "82%",
        padding: "14px 22px",
        borderRadius: 22,
        borderBottomLeftRadius: mine ? 22 : 6,
        borderBottomRightRadius: mine ? 6 : 22,
        background: mine ? rgba(NEON.ice, 0.92) : rgba(NEON.abyss, 0.55),
        color: mine ? NEON.deep : NEON.ice,
        fontFamily,
        fontWeight: 500,
        fontSize: 29,
        lineHeight: 1.25,
        boxShadow: mine ? `0 0 18px ${rgba(NEON.sky, 0.4)}` : undefined,
      }}
    >
      {text}
    </div>
  </div>
);

const ChatCard: React.FC<{ w: number; h: number }> = ({ w, h }) => (
  <GlassPanel width={w} height={h} tint={0.8} glow={0.7} padding={30}>
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Bubble text="Kommt Donnerstag jemand?" />
      <Bubble text="Welche Liste gilt jetzt?" mine />
      <Bubble text="Hab’s nicht gesehen …" />
      <Bubble text="Bitte alle nochmal eintragen!" mine />
    </div>
  </GlassPanel>
);

const FilesCard: React.FC<{ w: number; h: number; sheen?: number }> = ({ w, h, sheen }) => (
  <GlassPanel width={w} height={h} tint={0.85} glow={0.6} padding={34} sheen={sheen}>
    <div style={{ display: "flex", flexDirection: "column", gap: 22, fontFamily }}>
      {["Mitglieder_2025.xlsx", "Mitglieder_neu.xlsx", "Mitglieder_final_v3.xlsx"].map((n, i) => (
        <div key={n} style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 58, height: 58, borderRadius: 14, background: rgba(NEON.ice, 0.14), display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `inset 0 0 0 1px ${rgba(NEON.ice, 0.18)}` }}>
            <Icon name="file-text" size={30} color={NEON.ice} />
          </div>
          <span style={{ fontWeight: i === 2 ? 800 : 500, fontSize: 31, color: NEON.ice, whiteSpace: "nowrap" }}>{n}</span>
        </div>
      ))}
    </div>
  </GlassPanel>
);

const SheetCard: React.FC<{ w: number; h: number }> = ({ w, h }) => {
  const cols = 4;
  const rows = 7;
  return (
    <GlassPanel width={w} height={h} tint={0.7} glow={0.6} padding={28}>
      <div style={{ fontFamily, fontWeight: 800, fontSize: 28, color: NEON.ice, marginBottom: 18, whiteSpace: "nowrap" }}>Mitgliederliste.xlsx</div>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 0, border: `1px solid ${rgba(NEON.sky, 0.22)}`, borderRadius: 8, overflow: "hidden" }}>
        {Array.from({ length: cols * rows }, (_, i) => {
          const r = Math.floor(i / cols);
          const c = i % cols;
          const wbar = 30 + ((i * 37) % 55);
          return (
            <div key={i} style={{ height: 44, borderRight: c < cols - 1 ? `1px solid ${rgba(NEON.sky, 0.14)}` : undefined, borderBottom: r < rows - 1 ? `1px solid ${rgba(NEON.sky, 0.14)}` : undefined, background: r === 0 ? rgba(NEON.blue, 0.22) : undefined, display: "flex", alignItems: "center", padding: "0 10px" }}>
              <div style={{ width: `${wbar}%`, height: 10, borderRadius: 5, background: rgba(NEON.ice, r === 0 ? 0.6 : 0.28) }} />
            </div>
          );
        })}
      </div>
    </GlassPanel>
  );
};

/** großer unscharfer Lichtpunkt (Vordergrund/Hintergrund), ersetzt die unscharfen Sterne der Referenz */
const BokehDot: React.FC<{ size: number; color: string; alpha?: number }> = ({ size, color, alpha = 0.6 }) => (
  // additiv (screen): Licht hellt den Grund auf – mit normaler Deckung wird Orange auf Dunkel braun
  <div style={{ width: size, height: size, borderRadius: "50%", mixBlendMode: "screen", background: `radial-gradient(circle, ${rgba(color, alpha)} 0%, ${rgba(color, alpha * 0.62)} 38%, ${rgba(color, alpha * 0.18)} 58%, ${rgba(color, 0)} 70%)` }} />
);

export const SceneCards: React.FC<SceneProps> = ({ f, bg = true }) => {
  const m = smooth(invLerp(0, 150, f));
  const cam = { dolly: lerp(-160, 90, m), orbitY: lerp(6, -4, m), orbitX: lerp(-4, 2, m) };
  const shot = (i: number) => easeOut(invLerp(i * 3, i * 3 + 22, f));
  const scrH = 1500;
  return (
    <AbsoluteFill>
      {bg ? <NeonBackground frame={f} layout="drift" ribbons={0.3} particles={0.35} /> : null}
      <NeonScene3D camera={cam} focusZ={0} dof={3.4} maxBlur={22} dim={0.45}>
        <Layer3D x={150} y={1560} z={-900} width={460} height={460} opacity={0.8}>
          <BokehDot size={460} color={NEON.blue} alpha={0.55} />
        </Layer3D>
        <Layer3D x={1000} y={1340} z={-150} rotY={-26} rotX={-3} width={460} height={screenPanelHeight(460, scrH)} opacity={shot(4)}>
          <ScreenPanel width={460} screenHeight={scrH} glow={1} tint={0.6} edge={1.3}>
            <AppShell height={scrH}>
              <MembersPage />
            </AppShell>
          </ScreenPanel>
        </Layer3D>
        <Layer3D x={820} y={480} z={-330} rotY={-18} rotX={4} width={520} height={460} opacity={shot(1)}>
          <SheetCard w={520} h={460} />
        </Layer3D>
        <Layer3D x={300} y={1420} z={70} rotY={12} rotX={-4} width={600} height={300} opacity={shot(2)}>
          <FilesCard w={600} h={300} sheen={invLerp(26, 58, f)} />
        </Layer3D>
        <Layer3D x={210} y={470} z={330} rotY={16} rotX={6} width={560} height={420} opacity={shot(0)}>
          <ChatCard w={560} h={420} />
        </Layer3D>
        <Layer3D x={900} y={1640} z={560} width={360} height={360} opacity={0.9}>
          <BokehDot size={360} color={NEON.sky} alpha={0.32} />
        </Layer3D>
      </NeonScene3D>
      <div style={{ position: "absolute", left: 90, right: 90, top: 905, display: "flex", justifyContent: "center" }}>
        <GlowText text={HOOK} frame={f} typeStart={6} cps={26} cursor fontSize={58} weight={500} glow={0.45} flare={0.6} maxWidth={820} lineHeight={1.2} />
      </div>
    </AbsoluteFill>
  );
};

// ---- 4 Befehlsleiste ----------------------------------------------------------------------
export const CMD = { typeStart: 10, cps: 15, sendAt: 62, expandAt: 66 } as const;

export const SceneCommand: React.FC<SceneProps> = ({ f, bg = true }) => {
  const e = smooth(invLerp(CMD.expandAt, CMD.expandAt + 18, f));
  const expandH = 560;
  const h = commandBarHeight(e, expandH);
  const m = smooth(invLerp(0, 120, f));
  return (
    <AbsoluteFill>
      {bg ? <NeonBackground frame={f} layout="drift" ribbons={0.42} particles={0.3} /> : null}
      <NeonScene3D camera={{ orbitX: lerp(7, 3, m), orbitY: lerp(-10, -4, m), dolly: lerp(60, 0, m) }} dof={2.5}>
        <Layer3D x={540} y={920} width={960} height={h} sharp>
          <CommandBar frame={f} width={960} text={QUESTION} typeStart={CMD.typeStart} cps={CMD.cps} sendAt={CMD.sendAt} expand={e} expandHeight={expandH} appear={easeOut(invLerp(0, 12, f))}>
            <ResponseCard
              frame={f}
              width={880}
              start={CMD.expandAt + 6}
              fontSize={31}
              lines={[
                { text: "Donnerstag, 3. Juni 2027", strong: true },
                { text: "17:00 – 18:30  Fußball-Training D-Jugend", dot: "#D97706" },
                { text: "19:00 – 20:30  Sitzung der Abteilungsleitungen", dot: "#8E51FF" },
              ]}
            />
          </CommandBar>
        </Layer3D>
      </NeonScene3D>
    </AbsoluteFill>
  );
};

// ---- 5 Kennzahlen -------------------------------------------------------------------------
const MEMBER_CURVE = [171, 176, 180, 178, 189, 203, 211, 224, 238]; // Platzhalter

export const SceneMetrics: React.FC<SceneProps> = ({ f, bg = true }) => {
  const m = smooth(invLerp(0, 150, f));
  const cam = { orbitY: lerp(-7, 5, m), orbitX: lerp(3, -2, m), dolly: lerp(-60, 60, m) };
  const ap = (i: number) => easeOut(invLerp(4 + i * 4, 26 + i * 4, f));
  const grow = (i: number) => easeInOut(invLerp(14 + i * 5, 56 + i * 5, f));
  return (
    <AbsoluteFill>
      {bg ? <NeonBackground frame={f} layout="drift" ribbons={0.36} particles={0.3} /> : null}
      <NeonScene3D camera={cam} focusZ={-200} dof={1.1} maxBlur={12} dim={0.38}>
        <Layer3D x={300} y={500} z={-160} rotY={14} rotX={3} width={480} height={420} opacity={ap(0)}>
          <MetricCard width={480} height={420} title="Mitglieder" value={`${Math.round(lerp(171, 238, grow(0)))}`} appear={ap(0)}>
            <LineSpark width={412} height={170} values={MEMBER_CURVE} progress={grow(0)} style={{ position: "absolute", left: 0, bottom: 0 }} />
          </MetricCard>
        </Layer3D>
        <Layer3D x={800} y={430} z={-330} rotY={-15} width={420} height={480} opacity={ap(1)}>
          <MetricCard width={420} height={480} title="Helferplätze" appear={ap(1)}>
            <div style={{ position: "absolute", left: 0, right: 0, top: 18, display: "flex", justifyContent: "center" }}>
              <DonutRing size={330} value={12 / 15} progress={grow(1)} format={(v) => `${Math.round(v * 15)} von 15`} />
            </div>
          </MetricCard>
        </Layer3D>
        <Layer3D x={810} y={1430} z={-90} rotY={-16} rotX={-3} width={470} height={440} opacity={ap(2)}>
          <MetricCard width={470} height={440} title="Zusagen" appear={ap(2)}>
            <Bars width={402} values={[0.82, 0.64, 0.92, 0.5, 0.74]} progress={grow(2)} highlight={2} barHeight={34} gap={20} style={{ position: "absolute", left: 0, bottom: 4 }} />
          </MetricCard>
        </Layer3D>
        <Layer3D x={260} y={1400} z={-420} rotY={12} width={420} height={420} opacity={ap(3)}>
          <MetricCard width={420} height={420} title="Rückmeldungen" appear={ap(3)}>
            <div style={{ position: "absolute", left: 0, right: 0, top: 14, display: "flex", justifyContent: "center" }}>
              <DonutRing size={300} value={0.68} progress={grow(3)} />
            </div>
          </MetricCard>
        </Layer3D>
        <Layer3D x={980} y={980} z={480} rotY={-20} width={300} height={360} opacity={ap(2)}>
          <GlassPanel width={300} height={360} tint={0.6} glow={0.5} />
        </Layer3D>
      </NeonScene3D>
      <div style={{ position: "absolute", left: 60, right: 60, top: 908, display: "flex", justifyContent: "center" }}>
        <GlowText text="Alle Mitglieder an einem Ort" frame={f} start={10} stagger={5} fontSize={72} weight={800} glow={0.9} flare={1.1} maxWidth={560} mode="rise" echo={2} />
      </div>
    </AbsoluteFill>
  );
};

// ---- 6 Gekrümmte Wand ---------------------------------------------------------------------
const WallPanel: React.FC<{ i: number; f: number }> = ({ i, f }) => {
  const kind = i % 3;
  const w = 1200;
  const h = 330;
  const g = easeInOut(invLerp(6 + i * 2, 50 + i * 2, f));
  return (
    // dunkle Paneele, helle Grafik: der Kontrast macht die Wand (Referenz t09.75), nicht eine blaue Fläche
    <GlassPanel width={w} height={h} tint={0.35} glow={0} radius={26} padding={30}>
      {kind === 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 40, height: "100%" }}>
          <DonutRing size={260} value={0.8} progress={g} format={(v) => `${Math.round(v * 15)} von 15`} colors={[NEON.ice, NEON.sky]} glow={1.4} />
          <div style={{ fontFamily, fontWeight: 800, fontSize: 46, color: NEON.ice, whiteSpace: "nowrap" }}>Helferplätze</div>
        </div>
      ) : kind === 1 ? (
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: "100%", gap: 22 }}>
          <div style={{ fontFamily, fontWeight: 800, fontSize: 40, color: NEON.ice }}>Zusagen</div>
          <Bars width={1100} values={[0.9, 0.7, 0.82, 0.55]} progress={g} barHeight={32} gap={18} />
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
          <div style={{ fontFamily, fontWeight: 800, fontSize: 40, color: NEON.ice }}>Mitglieder</div>
          <LineSpark width={1100} height={210} values={MEMBER_CURVE} progress={g} strokeWidth={7} />
        </div>
      )}
    </GlassPanel>
  );
};

export const SceneWall: React.FC<SceneProps> = ({ f, bg = true }) => {
  const rot = lerp(-40, 14, easeOut(invLerp(0, 70, f), 3)) + f * 0.12;
  const speed = 54 * Math.max(0, 1 - f / 60) * (3 / 70);
  return (
    <AbsoluteFill>
      {bg ? <NeonBackground frame={f} layout="drift" ribbons={0.22} particles={0.25} /> : null}
      <NeonScene3D perspective={1150} focusZ={-700} dof={1.2} maxBlur={12} dim={0.3} dimRange={900}>
        <CurvedWall
          count={14}
          axis="z"
          radius={640}
          radiusY={900}
          panelWidth={1200}
          panelHeight={330}
          center={{ z: -440 }}
          rotation={rot}
          edgeGlow={0.35}
          blurSpan={speed * 4}
          samples={5}
          nearBlur={12}
          nearDark={0.45}
          fogFar={0.3}
          farEdge={0.15}
          renderPanel={(i) => <WallPanel i={i} f={f} />}
        />
      </NeonScene3D>
      {/* fernes Tunnelende bei z = −1040 → Maßstab 1150 / 2190 ≈ 0,53: Halbachsen ≈ 336 × 473 px */}
      <TunnelMouth rx={344} ry={482} dark={0.92} rim={1} feather={0.22} />
      <NeonVignette strength={0.7} inner={34} />
      <div style={{ position: "absolute", left: 60, right: 60, top: 890, display: "flex", justifyContent: "center" }}>
        <GlowText text="Bringt Vereinsarbeit in Fluss." frame={f} start={18} stagger={5} fontSize={56} weight={800} glow={0.8} flare={0.9} maxWidth={560} mode="rise" echo={2} />
      </div>
    </AbsoluteFill>
  );
};

// ---- Szenenbogen --------------------------------------------------------------------------
export const SCENES = { hero: SceneHero, logo: SceneLogo, pill: ScenePill, cards: SceneCards, command: SceneCommand, metrics: SceneMetrics, wall: SceneWall } as const;

/** Eine Szene zu mehreren Frames als Raster (Prüfen von Bewegungsabläufen ohne Video). */
export const SceneSheet: React.FC<{ scene: keyof typeof SCENES; frames: number[]; cols?: number; scale?: number }> = ({ scene, frames, cols = 3, scale = 0.33 }) => {
  const Scene = SCENES[scene];
  const w = W * scale;
  const h = H * scale;
  return (
    <AbsoluteFill style={{ background: "#000", fontFamily }}>
      <FontGate>
        {frames.map((fr, i) => (
          <div key={i} style={{ position: "absolute", left: (i % cols) * w, top: Math.floor(i / cols) * (h + 34), width: w, height: h + 34, overflow: "hidden" }}>
            <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transform: `scale(${scale})`, transformOrigin: "0 0", overflow: "hidden" }}>
              <Scene f={fr} />
            </div>
            <div style={{ position: "absolute", left: 0, top: h, width: w, height: 34, color: "#fff", fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", background: "#111" }}>
              {scene} · f {fr}
            </div>
          </div>
        ))}
      </FontGate>
    </AbsoluteFill>
  );
};

// ---- Vergleichstafel ----------------------------------------------------------------------
export const COMPARE_W = W * 2;
export const COMPARE_H = H;

export const Compare: React.FC<{ refFile: string; label: string; children: React.ReactNode }> = ({ refFile, label, children }) => (
  <AbsoluteFill style={{ background: "#000", fontFamily }}>
    <FontGate>
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, overflow: "hidden" }}>{children}</div>
    </FontGate>
    <Img src={staticFile(`referenz/${refFile}`)} style={{ position: "absolute", left: W, top: 0, width: W, height: H, objectFit: "contain" }} />
    <div style={{ position: "absolute", left: W + 24, top: 24, padding: "8px 16px", borderRadius: 10, background: "rgba(0,0,0,0.6)", color: "#fff", fontSize: 28, fontWeight: 500 }}>Referenz {label}</div>
    <div style={{ position: "absolute", left: W - 2, top: 0, width: 4, height: H, background: rgba(NEON.sky, 0.4) }} />
  </AbsoluteFill>
);

