/**
 * Wort-für-Wort-Untertitel aus timeline.words (2–4 Wörter je Einblendung).
 * Manrope 800, 56 px, Band y 1330–1530. Aktives Wort: auf Tinte Himmel, auf Papier Vereinsblau
 * (Storyboard); eine kurze 4-px-Linie in derselben Farbe springt per Spring unter das aktive Wort –
 * unterhalb der Unterlängen. Orange bleibt dem Leitmotiv-Punkt vorbehalten.
 * Scrim: 62 % Tinte mit Backdrop-Blur (liegt außerhalb der gefilterten Ebene, damit der Blur auch
 * während Auf-/Abtritt wirkt).
 *
 * Szenen, deren große Typo den Text schon zeigt, werden über `muteSections` stummgeschaltet
 * (Abschnitts-ids aus abschnitte.json). `toneAt(frame)` sagt, ob gerade Tinte oder Papier liegt.
 */
import React from "react";
import { AbsoluteFill } from "remotion";
import { FONT_BOLD, fontFamily } from "../fonts";
import { textWidth } from "../lib/measure";
import { useAbsFrame } from "../lib/scene";
import { SubtitlePage, subtitlePageIndexAt, subtitlePages } from "../lib/timeline";
import { POP, SNAP, clamp01, mix, sp } from "../springs";
import { C, W, ZONES, rgba } from "../theme";

export type SubtitleTone = "ink" | "paper";

type Props = {
  /** Abschnitte ohne Untertitel (Typo trägt dort den Text) */
  muteSections?: number[];
  /** Welt in diesem Frame (bestimmt Farben) */
  toneAt?: (frame: number) => SubtitleTone;
  /** zusätzliche stumme Frame-Bereiche [from, to) */
  muteRanges?: [number, number][];
  /**
   * Bildwechsel (z. B. Band-Wipes): Eine Einblendung, die über einen solchen Frame hinaus stehen
   * würde, geht vorher weich ab – statt über dem Wipe zu schweben.
   */
  cuts?: number[];
};

const FONT = 56;
const MAX_LINE = 900;
const LINE_H = 70;
/** Indikator unter dem aktiven Wort: Breite, Höhe, Mitte unter der Zeilenoberkante (unter den Unterlängen) */
const IND_W = 34;
const IND_H = 4;
const IND_Y = LINE_H + 9;

const COLORS: Record<SubtitleTone, { text: string; active: string; scrim: string; upcoming: number }> = {
  ink: { text: C.paper, active: C.sky, scrim: rgba(C.ink, 0.62), upcoming: 0.42 },
  paper: { text: C.black, active: C.blue, scrim: rgba(C.paper, 0.78), upcoming: 0.38 },
};

export const Subtitles: React.FC<Props> = ({ muteSections = [], toneAt = () => "ink", muteRanges = [], cuts = [] }) => {
  const f = useAbsFrame();
  const pi = subtitlePageIndexAt(f);
  if (pi < 0) return null;
  const page = subtitlePages[pi];
  if (muteSections.includes(page.section)) return null;
  if (muteRanges.some(([a, b]) => f >= a && f < b)) return null;
  // erst nach dem letzten Wort kappen, nie mitten in der Einblendung
  const lastWordEnd = page.words[page.words.length - 1].to;
  const cut = cuts.find((c) => c > lastWordEnd && c < page.to);
  const to = cut ?? page.to;
  if (f >= to) return null;
  return <SubtitlePageView page={page} frame={f} tone={toneAt(f)} to={to} />;
};

type Placed = { x: number; w: number; line: number };

const layoutPage = (page: SubtitlePage) => {
  const space = textWidth(" ", FONT, FONT_BOLD);
  const widths = page.words.map((w) => textWidth(w.text, FONT, FONT_BOLD));
  const total = widths.reduce((a, b) => a + b, 0) + space * (widths.length - 1);
  // eine Zeile, wenn möglich – sonst ausgewogen auf zwei Zeilen
  let breakAt = widths.length;
  if (total > MAX_LINE) {
    let best = Infinity;
    for (let b = 1; b < widths.length; b++) {
      const l1 = widths.slice(0, b).reduce((a, c) => a + c, 0) + space * (b - 1);
      const l2 = widths.slice(b).reduce((a, c) => a + c, 0) + space * (widths.length - b - 1);
      const score = Math.abs(l1 - l2) + (Math.max(l1, l2) > MAX_LINE ? 10000 : 0);
      if (score < best) {
        best = score;
        breakAt = b;
      }
    }
  }
  const lines = breakAt === widths.length ? [widths] : [widths.slice(0, breakAt), widths.slice(breakAt)];
  const placed: Placed[] = [];
  const lineWidths: number[] = [];
  lines.forEach((ws, li) => {
    const lw = ws.reduce((a, c) => a + c, 0) + space * (ws.length - 1);
    lineWidths.push(lw);
    let x = (W - lw) / 2;
    ws.forEach((w) => {
      placed.push({ x, w, line: li });
      x += w + space;
    });
  });
  return { placed, lineCount: lines.length, lineWidths };
};

const SubtitlePageView: React.FC<{ page: SubtitlePage; frame: number; tone: SubtitleTone; to: number }> = ({
  page,
  frame: f,
  tone,
  to,
}) => {
  const col = COLORS[tone];
  const { placed, lineCount, lineWidths } = layoutPage(page);
  const bandMid = (ZONES.subtitles.top + ZONES.subtitles.bottom) / 2 - 8;
  const blockH = lineCount * LINE_H;
  const top = bandMid - blockH / 2;

  // Auftritt der ganzen Einblendung
  const enter = sp(f, page.from, POP);
  const exitStart = to - 6;
  const exit = sp(f, exitStart, SNAP, { durationInFrames: 6 });
  const showExit = to - page.from > 10 && (to < page.to || isLastBeforeGap(page));
  const q = showExit ? exit : 0;

  // aktives Wort
  let active = -1;
  page.words.forEach((w, i) => {
    if (f >= w.activeFrom && f < w.activeTo) active = i;
  });
  const lastSpoken = page.words.reduce((acc, w, i) => (f >= w.activeFrom ? i : acc), -1);
  const dotIndex = active >= 0 ? active : lastSpoken;

  // Punkt springt von Wort zu Wort
  let dotX = 0;
  let dotY = 0;
  let dotScale = 0;
  if (dotIndex >= 0) {
    const target = placed[dotIndex];
    const at = page.words[dotIndex].activeFrom;
    const prev = dotIndex > 0 ? placed[dotIndex - 1] : null;
    const p = sp(f, at, SNAP);
    const tx = target.x + target.w / 2;
    const ty = top + target.line * LINE_H + IND_Y;
    if (prev) {
      const px = prev.x + prev.w / 2;
      const py = top + prev.line * LINE_H + IND_Y;
      dotX = mix(p, px, tx);
      dotY = mix(p, py, ty) - Math.sin(Math.PI * clamp01(p)) * 10;
    } else {
      dotX = tx;
      dotY = ty;
    }
    dotScale = dotIndex === 0 ? sp(f, at, POP) : 1;
  }

  const padX = 34;
  const padY = 18;
  const scrimW = Math.max(...lineWidths) + padX * 2;
  const scrimH = blockH + padY * 2 + 10;

  const op = clamp01(enter * 1.6) * (1 - q);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {/* Scrim ohne Eltern-Filter/-Deckkraft: nur so greift backdrop-filter in jedem Frame */}
      <div
        style={{
          position: "absolute",
          left: (W - scrimW) / 2,
          top: top - padY,
          width: scrimW,
          height: scrimH,
          borderRadius: 30,
          backgroundColor: col.scrim,
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          boxShadow: `0 0 48px 14px ${col.scrim}`,
          opacity: op,
          translate: `0 ${((1 - enter) * 18 - q * 14).toFixed(2)}px`,
          scale: String(mix(enter, 0.96, 1)),
        }}
      />
      <AbsoluteFill
        style={{
          opacity: op,
          translate: `0 ${((1 - enter) * 18 - q * 14).toFixed(2)}px`,
          filter: enter < 0.98 || q > 0.02 ? `blur(${(6 * clamp01(1 - enter) + 4 * q).toFixed(2)}px)` : undefined,
        }}
      >
      {page.words.map((w, i) => {
        const pl = placed[i];
        const spoken = f >= w.activeFrom;
        const isActive = i === active;
        const pop = isActive ? sp(f, w.activeFrom, POP) - sp(f, w.activeFrom + 3, POP) : 0;
        return (
          <div
            key={w.index}
            style={{
              position: "absolute",
              left: pl.x,
              top: top + pl.line * LINE_H,
              height: LINE_H,
              lineHeight: `${LINE_H}px`,
              fontFamily,
              fontWeight: FONT_BOLD,
              fontSize: FONT,
              whiteSpace: "nowrap",
              color: isActive ? col.active : col.text,
              opacity: spoken ? 1 : col.upcoming,
              scale: String(1 + 0.06 * pop),
              transformOrigin: "50% 70%",
            }}
          >
            {w.text}
          </div>
        );
      })}
      {dotIndex >= 0 ? (
        <div
          style={{
            position: "absolute",
            left: dotX - IND_W / 2,
            top: dotY - IND_H / 2,
            width: IND_W,
            height: IND_H,
            borderRadius: IND_H,
            backgroundColor: col.active,
            opacity: clamp01(dotScale * 1.5),
            scale: `${mix(clamp01(dotScale), 0.3, 1).toFixed(4)} 1`,
          }}
        />
      ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** true, wenn nach dieser Einblendung eine Pause folgt (dann sanft abgehen statt hart wechseln). */
const isLastBeforeGap = (page: SubtitlePage) => {
  const i = subtitlePages.indexOf(page);
  const next = subtitlePages[i + 1];
  return !next || next.from - page.to > 2 || next.section !== page.section;
};
