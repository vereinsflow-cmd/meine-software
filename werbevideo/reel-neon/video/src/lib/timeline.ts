/**
 * Typisierter Zugriff auf den Zeitplan-Vertrag (src/data/timeline.json).
 *
 * ALLE sprachgebundenen Ereignisse (Szenengrenzen, Taps, Zähler, Typo-Reveals, Untertitel)
 * werden hier aus den Wort-Zeitstempeln abgeleitet – nie feste Frames im Szenen-Code.
 * Die JSON-Datei wird später durch echte ElevenLabs-Zeiten ersetzt; die Struktur bleibt gleich.
 *
 *   cue("zweihundert")                 → Frame, an dem das Wort beginnt
 *   cue("zu", { section: 4 })          → Wort nur in Abschnitt 4 suchen
 *   cue("excel", { nth: 1 })           → zweites Vorkommen (0-basiert)
 *   cue("ehrenamt", { offset: -3 })    → 3 Frames vor dem Wortanfang
 *   cueEnd("nachrichten")              → Frame, an dem das Wort endet
 *   sceneFrom("termine") / sceneTo("termine") / sceneDuration("termine")
 *   wordsActiveAt(frame)               → Wörter, die in diesem Frame gesprochen werden
 *   subtitlePageAt(frame)              → Untertitel-Einblendung (2–4 Wörter) für diesen Frame
 */
import raw from "../data/timeline.json";

export const SCENE_IDS = ["hook", "problem", "frage", "mitglieder", "termine", "helfer", "nachrichten", "finanzen", "feierabend", "leitsatz", "logo", "endkarte"] as const;
export type SceneId = (typeof SCENE_IDS)[number];

export type TimelineScene = {
  id: SceneId;
  from: number;
  to: number;
  fromFrame: number;
  toFrame: number;
};
export type TimelineSection = {
  id: number;
  name: string;
  scene: SceneId;
  text: string;
  start: number;
  end: number;
};
export type TimelineWord = {
  text: string;
  key: string;
  section: number;
  i: number;
  start: number;
  end: number;
};
export type VoiceInfo = {
  file: string;
  source?: string;
  placed?: unknown[];
};
export type Timeline = {
  fps: number;
  durationInFrames: number;
  placeholder: boolean;
  voice: VoiceInfo | null;
  scenes: TimelineScene[];
  sections: TimelineSection[];
  words: TimelineWord[];
};

export const timeline = raw as unknown as Timeline;

const fail = (msg: string): never => {
  throw new Error(`[Zeitplan] ${msg} – bitte src/data/timeline.json bzw. werkzeuge/zeitplan-bauen.mjs prüfen.`);
};

// ---- Validierung beim Laden: lieber früh und verständlich scheitern -------------------------
if (!timeline || typeof timeline.fps !== "number" || !Array.isArray(timeline.words)) {
  fail("timeline.json hat nicht die erwartete Struktur {fps, durationInFrames, scenes, sections, words, voice}");
}
for (const id of SCENE_IDS) {
  if (!timeline.scenes.some((s) => s.id === id)) fail(`Szene "${id}" fehlt in timeline.scenes`);
}

export const FPS = timeline.fps;
export const DURATION_IN_FRAMES = timeline.durationInFrames;
export const IS_PLACEHOLDER_TIMING = timeline.placeholder;

export const secToFrame = (s: number) => Math.round(s * FPS);

/** Gleiche Normalisierung wie zeitplan-bauen.mjs (clean + lowercase). */
export const normalizeKey = (s: string) =>
  s
    .replace(/[.,:;!?„“"–-]+$/g, "")
    .replace(/^[„“"]+/, "")
    .toLowerCase();

// ---- Szenen ---------------------------------------------------------------------------------
const sceneById = (id: SceneId): TimelineScene => {
  const s = timeline.scenes.find((x) => x.id === id);
  return s ?? fail(`Szene "${id}" nicht gefunden`);
};
export const sceneFrom = (id: SceneId) => sceneById(id).fromFrame;
export const sceneTo = (id: SceneId) => sceneById(id).toFrame;
export const sceneDuration = (id: SceneId) => sceneById(id).toFrame - sceneById(id).fromFrame;
export const sceneAt = (frame: number): SceneId => {
  const s = timeline.scenes.find((x) => frame >= x.fromFrame && frame < x.toFrame);
  return s ? s.id : frame < 0 ? "hook" : "endkarte";
};

// ---- Abschnitte -----------------------------------------------------------------------------
export const sectionById = (id: number): TimelineSection => {
  const s = timeline.sections.find((x) => x.id === id);
  return s ?? fail(`Abschnitt ${id} nicht gefunden`);
};
export const sectionFrom = (id: number) => secToFrame(sectionById(id).start);
export const sectionTo = (id: number) => secToFrame(sectionById(id).end);
export const sectionScene = (id: number): SceneId => sectionById(id).scene;

// ---- Wörter / Cues --------------------------------------------------------------------------
export type CueOptions = {
  /** Nur in diesem Abschnitt (id aus abschnitte.json) suchen */
  section?: number;
  /** Nur in Abschnitten suchen, die in dieser Szene gesprochen werden */
  scene?: SceneId;
  /** n-tes Vorkommen (0-basiert) innerhalb des Filters */
  nth?: number;
  /** Frames, die auf das Ergebnis addiert werden (negativ = früher) */
  offset?: number;
};

export const findWord = (key: string, opts: CueOptions = {}): TimelineWord => {
  const k = normalizeKey(key);
  const matches = timeline.words.filter(
    (w) =>
      (w.key === k || normalizeKey(w.text) === k) &&
      (opts.section === undefined || w.section === opts.section) &&
      (opts.scene === undefined || sectionScene(w.section) === opts.scene),
  );
  const nth = opts.nth ?? 0;
  const w = matches[nth];
  if (!w) {
    const where = [
      opts.section !== undefined ? `Abschnitt ${opts.section}` : null,
      opts.scene ? `Szene "${opts.scene}"` : null,
      nth ? `Vorkommen #${nth}` : null,
    ]
      .filter(Boolean)
      .join(", ");
    return fail(
      `Stichwort "${key}"${where ? ` (${where})` : ""} nicht gefunden (${matches.length} Treffer). ` +
        `Vorhandene Schlüssel: ${timeline.words.map((x) => x.key).join(" ")}`,
    );
  }
  return w;
};

/** Frame des Wortanfangs. */
export const cue = (key: string, opts: CueOptions = {}) =>
  secToFrame(findWord(key, opts).start) + (opts.offset ?? 0);
/** Frame des Wortendes. */
export const cueEnd = (key: string, opts: CueOptions = {}) =>
  secToFrame(findWord(key, opts).end) + (opts.offset ?? 0);

export type FramedWord = TimelineWord & { from: number; to: number; index: number };
export const framedWords: FramedWord[] = timeline.words.map((w, index) => ({
  ...w,
  index,
  from: secToFrame(w.start),
  to: Math.max(secToFrame(w.end), secToFrame(w.start) + 1),
}));

/** Wörter, die in `frame` gerade gesprochen werden. */
export const wordsActiveAt = (frame: number): FramedWord[] =>
  framedWords.filter((w) => frame >= w.from && frame < w.to);

/** true, wenn in `frame` (± Toleranz) gesprochen wird – z. B. für Musik-Ducking. */
export const speechSpans: { from: number; to: number }[] = (() => {
  const spans: { from: number; to: number }[] = [];
  const gap = Math.round(0.35 * FPS);
  for (const w of framedWords) {
    const last = spans[spans.length - 1];
    if (last && w.from - last.to <= gap) last.to = Math.max(last.to, w.to);
    else spans.push({ from: w.from, to: w.to });
  }
  return spans;
})();

// ---- Untertitel-Seiten (2–4 Wörter je Einblendung) -------------------------------------------
export type SubtitleWord = FramedWord & { activeFrom: number; activeTo: number };
export type SubtitlePage = {
  section: number;
  scene: SceneId;
  words: SubtitleWord[];
  from: number;
  to: number;
};

const MAX_WORDS = 4;
const MAX_CHARS = 24;
const LEAD = 2; // Einblendung 2 Frames vor dem ersten Wort
const HOLD = 14; // nach dem letzten Wort eines Satzes stehen lassen
const MIN_PAGE = 14; // Mindest-Standzeit einer Einblendung (Frames)

export const subtitlePages: SubtitlePage[] = (() => {
  const pages: SubtitlePage[] = [];
  for (const sec of timeline.sections) {
    const ws = framedWords.filter((w) => w.section === sec.id);
    const groups: FramedWord[][] = [];
    let cur: FramedWord[] = [];
    const chars = (g: FramedWord[]) => g.reduce((n, w) => n + w.text.length + 1, 0);
    for (const w of ws) {
      if (cur.length && (cur.length >= MAX_WORDS || chars(cur) + w.text.length > MAX_CHARS)) {
        groups.push(cur);
        cur = [];
      }
      cur.push(w);
      const endsSentence = /[.?!]$/.test(w.text);
      const endsClause = /[,;:]$/.test(w.text);
      if (endsSentence || (endsClause && (cur.length >= 2 || w.text.length >= 10))) {
        groups.push(cur);
        cur = [];
      }
    }
    if (cur.length) groups.push(cur);
    const endsSentence = (w: FramedWord) => /[.?!]$/.test(w.text);
    const endsClause = (w: FramedWord) => /[,;:]$/.test(w.text);
    // Einzelwort-Waisen an die vorige Gruppe hängen, wenn Platz ist – sonst ausbalancieren:
    // das letzte Wort der vollen Vorgruppe wandert zur Waise („alle Mitglieder an“ / „einem Ort.“)
    for (let g = groups.length - 1; g > 0; g--) {
      const prev = groups[g - 1];
      const prevLast = prev[prev.length - 1];
      if (groups[g].length !== 1 || endsSentence(prevLast)) continue;
      if (prev.length < MAX_WORDS && chars(prev) + groups[g][0].text.length <= MAX_CHARS + 4) {
        prev.push(...groups[g]);
        groups.splice(g, 1);
      } else if (prev.length >= 3 && !endsClause(prevLast)) {
        groups[g].unshift(prev.pop() as FramedWord);
      }
    }
    // Mindest-Standzeit je Einblendung: zu kurze Seiten mit der Nachbarseite zusammenlegen
    // (oder ein Wort von der vollen Vorgruppe leihen), solange es in die Grenzen passt.
    const span = (gi: number) => (groups[gi + 1] ? groups[gi + 1][0].from : groups[gi][groups[gi].length - 1].to + HOLD) - groups[gi][0].from;
    const fits = (a: FramedWord[], b: FramedWord[]) => a.length + b.length <= MAX_WORDS && chars(a) + chars(b) <= MAX_CHARS + 6;
    let gi = 0;
    while (gi < groups.length) {
      if (span(gi) >= MIN_PAGE) {
        gi++;
        continue;
      }
      const prev = groups[gi - 1];
      const next = groups[gi + 1];
      const cur = groups[gi];
      if (prev && !endsSentence(prev[prev.length - 1]) && fits(prev, cur)) {
        prev.push(...cur);
        groups.splice(gi, 1);
        gi = Math.max(0, gi - 1);
        continue;
      }
      if (next && !endsSentence(cur[cur.length - 1]) && fits(cur, next)) {
        cur.push(...next);
        groups.splice(gi + 1, 1);
        continue;
      }
      if (prev && prev.length >= 3 && !endsSentence(prev[prev.length - 1]) && !endsClause(prev[prev.length - 1])) {
        cur.unshift(prev.pop() as FramedWord);
        // keine neue zu kurze Seite erzeugen
        if (span(gi - 1) < MIN_PAGE) prev.push(cur.shift() as FramedWord);
      }
      if (span(gi) < MIN_PAGE && next && next.length >= 2 && !endsSentence(cur[cur.length - 1]) && fits(cur, [next[0]])) {
        // erstes Wort der Folgeseite herüberholen („Im Chat zweihundert“ / „Nachrichten.“)
        cur.push(next.shift() as FramedWord);
        if (span(gi + 1) < MIN_PAGE) next.unshift(cur.pop() as FramedWord);
      }
      gi++;
    }
    groups.forEach((g, gi) => {
      const next = groups[gi + 1];
      const words: SubtitleWord[] = g.map((w, wi) => ({
        ...w,
        activeFrom: w.from,
        activeTo: g[wi + 1] ? g[wi + 1].from : w.to + 6,
      }));
      pages.push({
        section: sec.id,
        scene: sec.scene,
        words,
        from: g[0].from - LEAD,
        to: next ? next[0].from - LEAD : g[g.length - 1].to + HOLD,
      });
    });
  }
  // Überlappungen zwischen Abschnitten auflösen
  for (let p = 0; p < pages.length - 1; p++) {
    if (pages[p].to > pages[p + 1].from) pages[p].to = pages[p + 1].from;
  }
  return pages;
})();

export const subtitlePageIndexAt = (frame: number) =>
  subtitlePages.findIndex((p) => frame >= p.from && frame < p.to);
export const subtitlePageAt = (frame: number): SubtitlePage | null => {
  const i = subtitlePageIndexAt(frame);
  return i >= 0 ? subtitlePages[i] : null;
};
