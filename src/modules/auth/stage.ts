import {
  DEPARTMENT_IMAGE_WIDTHS,
  type DepartmentSport,
} from "@/modules/departments/department-image";

/**
 * Reine Hilfen für die Bühne der Anmeldeseiten, das „3D-Fotokarussell“ (`components/login-stage.tsx` und
 * `components/stage-scene.tsx`, seit 22.10.2026, Entwurf neu-3): welche Fotos im Ring stehen, wie ein Plakat je nach Lage im
 * Ring aussieht, wie Ziehen und Loslassen in Drehung umgerechnet werden, der Auftritt und die Farben, auf denen Schrift
 * steht. Ohne React und ohne DOM – im Browser und auf dem Server gleich, einzeln testbar (tests/unit/login-stage.test.ts).
 *
 * Winkel in Grad. Ein Plakat steht vorn, wenn sein Winkel im Ring plus die Drehung des Rings 0° ergibt (`azimuth`):
 * 0° = vorn, ±90° = seitlich (Kante), ±180° = hinten.
 */

// --- Fotos ------------------------------------------------------------------------------------------------------------

/** Eine Abteilung im Ring: Foto, Name auf dem Plakat, Bildausschnitt und die Lichtfarbe, die sie in den Raum wirft. */
export interface StageSport {
  sport: DepartmentSport;
  name: string;
  /** `object-position`: Die 4 : 3-Fotos werden im Hochformat-Plakat (4 : 5) seitlich beschnitten. */
  focus: string;
  /** Grundfarbe des Fotos als „R G B“ – so färbt das gerade vorn stehende Bild den Raum. */
  light: string;
}

/** Reihenfolge = Reihenfolge im Ring, warm und kühl im Wechsel, damit das Raumlicht beim Drehen die Farbe wechselt. */
export const STAGE_SPORTS: readonly StageSport[] = [
  { sport: "fussball", name: "Fußball", focus: "64% 55%", light: "255 170 70" },
  { sport: "badminton", name: "Badminton", focus: "60% 40%", light: "52 118 255" },
  { sport: "tennis", name: "Tennis", focus: "34% 50%", light: "255 104 48" },
  { sport: "dart", name: "Dart", focus: "52% 50%", light: "36 214 120" },
  { sport: "handball", name: "Handball", focus: "52% 60%", light: "255 186 74" },
  { sport: "tischtennis", name: "Tischtennis", focus: "42% 62%", light: "64 140 255" },
  { sport: "basketball", name: "Basketball", focus: "58% 50%", light: "255 116 40" },
  { sport: "volleyball", name: "Volleyball", focus: "40% 45%", light: "255 196 120" },
];

/**
 * Plakate im Ring: breit 16 (jede Abteilung zweimal, genau gegenüber), schmal (Handy, Tablet hochkant) 8 – jede einmal,
 * ohne Spiegelung, deutlich weniger Arbeit für das Handy. Im HTML stehen immer alle 16; schmal blendet CSS die zweite Hälfte
 * aus (`--panels` in login-stage.module.css muss dazu passen, die Schleife liest den Wert von dort).
 */
export const STAGE_PANELS = { wide: 16, narrow: 8 } as const;

/** Ab dieser Breite steht das Formular rechts neben der Bühne (wie `@media (min-width: 64rem)` im Stil). */
export const STAGE_WIDE_QUERY = "(min-width: 64rem)";

/** Dart (Nr. 04) steht im Standbild und am Ende des Auftritts vorn – das grüne Licht passt zur Nacht. */
export const STAGE_START_SPORT = 3;
/** Das Standbild steht eine Spur aus der Mitte gedreht: Das Glanzlicht liegt dann schon auf dem vorderen Plakat. */
export const STAGE_STILL_OFFSET = 0.08;

/** Abteilung des Plakats Nr. `index` (die zweite Hälfte wiederholt die erste). */
export const panelSport = (index: number) => index % STAGE_SPORTS.length;

const posterUrl = (sport: DepartmentSport, width: number) =>
  `/bilder/abteilungen/${sport}-${width}.webp`;

/** Foto eines Plakats: `src` (mittlere Größe) und `srcSet` mit den vorhandenen Breiten 480, 800, 1200 px. */
export function posterImage(sport: DepartmentSport): { src: string; srcSet: string } {
  return {
    src: posterUrl(sport, 800),
    srcSet: DEPARTMENT_IMAGE_WIDTHS.map((width) => `${posterUrl(sport, width)} ${width}w`).join(
      ", ",
    ),
  };
}

/**
 * Breite, in der das Foto im Plakat wirklich gezeichnet wird – für `sizes`, damit der Browser nicht größer lädt als nötig.
 * Das Querformat füllt das Hochformat-Plakat in der Höhe, gezeichnet also Höhe × 4/3:
 *   breit   Halbmesser ≈ min(64vw, 104vh) (600–1200 px), Plakathöhe 0,444 × Halbmesser → Foto ≈ 0,59 × 64vw ≈ 38vw
 *   schmal  Halbmesser höchstens 68vw (bis 400 px), Plakathöhe 0,75 × Halbmesser → Foto ≈ 68vw, höchstens 400 px; auf
 *           kurzen Handys ist der Ring kleiner (an der sichtbaren Höhe, siehe `--r`) – die Datei reicht dann erst recht
 * Bei 1440 px und doppelter Pixeldichte lädt das 1200er Bild, bei 390 px am Handy (dreifach) das 800er.
 */
export const POSTER_SIZES = "(max-width: 36.75rem) 68vw, (max-width: 63.999rem) 400px, 38vw";

// --- Lage im Ring -------------------------------------------------------------------------------------------------------

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Winkel auf −180° … unter 180° (0° = vorn). */
export function normalizeAngle(degrees: number): number {
  return (((degrees % 360) + 540) % 360) - 180;
}

/** Wie ein Plakat aussieht, je nachdem wo es im Ring steht – alles Deckkräfte 0 … 1 (außer `blurStep`). */
export interface PanelLook {
  /** Abdunkeln: hinten fast schwarz (Tiefe), beim Tippen im Formular alle etwas dunkler. */
  shade: number;
  /** Spiegelbild im Boden – nur vorn. */
  reflection: number;
  /** Glanzlicht, wenn das Plakat schräg zum Spot oben links steht. */
  sheen: number;
  /** Name auf dem Plakat – hinten sähe man ihn spiegelverkehrt, dort ist er aus. */
  label: number;
  /** Farbiger Lichthof hinter den vorderen Plakaten. */
  halo: number;
  /** Unschärfe der hinteren Plakate in drei Stufen (0 = scharf), nur breit – sie springt, statt in jedem Bild neu zu rechnen. */
  blurStep: 0 | 1 | 2 | 3;
  /** Wie stark das Foto den Raum färbt (nur ganz vorn spürbar). */
  light: number;
}

/**
 * Aussehen eines Plakats bei `azimuth` (0° = vorn). `focusDim` 0 … 0,22 kommt vom Formular: Steht der Fokus in einem Feld,
 * tritt der Raum zurück (dunkler, weniger Licht und Spiegelung). Dieselben Formeln stehen für „Bewegung reduzieren“ als
 * CSS im Stil (Standbild ohne JavaScript).
 */
export function panelLook(azimuth: number, focusDim = 0): PanelLook {
  const facing = Math.cos(azimuth * RAD);
  const front = Math.max(0, facing);
  const depth = (1 - facing) / 2;
  return {
    shade: clamp(depth ** 1.15 * 0.88 + focusDim * 0.6, 0, 0.94),
    reflection: 0.46 * front ** 2.4 * (1 - focusDim),
    sheen: Math.max(0, Math.cos((azimuth + 34) * RAD)) ** 26 * 0.85,
    label: clamp((facing - 0.15) * 2.5, 0, 1),
    halo: front ** 5 * Math.max(0, 0.75 - focusDim),
    blurStep: depth > 0.84 ? 3 : depth > 0.66 ? 2 : depth > 0.48 ? 1 : 0,
    light: front ** 24,
  };
}

/** Das Plakat, das am weitesten vorn steht, und sein Winkel (bei Gleichstand das erste). */
export function frontPanel(
  angles: readonly number[],
  rotation: number,
): { index: number; azimuth: number } {
  let best = { index: 0, azimuth: normalizeAngle((angles[0] ?? 0) + rotation) };
  let bestFacing = -2;
  angles.forEach((angle, index) => {
    const azimuth = normalizeAngle(angle + rotation);
    const facing = Math.cos(azimuth * RAD);
    if (facing > bestFacing) {
      bestFacing = facing;
      best = { index, azimuth };
    }
  });
  return best;
}

/**
 * Balken unter „Im Fokus“: wie weit das vordere Plakat schon durch die Mitte gelaufen ist (0 … 1). Dreht der Ring rückwärts,
 * läuft der Balken andersherum – er füllt sich immer bis zum nächsten Wechsel.
 */
export function focusProgress(azimuth: number, step: number, speed: number): number {
  const share = clamp((azimuth + step / 2) / step, 0, 1);
  return speed >= 0 ? share : 1 - share;
}

// --- Bewegung -----------------------------------------------------------------------------------------------------------

/** Grundtempo in Grad je Sekunde: breit eine Runde in gut 50 s, schmal (kleinerer Ring, weniger Plakate) etwas flotter. */
export const STAGE_SPEED = { wide: 7, narrow: 9 } as const;
/** Schneller dreht der Ring auch nach einem kräftigen Wurf nicht. */
export const STAGE_MAX_SPEED = 280;

/** Ziehen 1 : 1 – das vordere Plakat klebt am Zeiger (Bogenlänge auf dem Ring = Weg des Zeigers). */
export const dragDegrees = (dx: number, radius: number) => (dx / radius) * DEG;

/**
 * Schwung beim Loslassen in Grad je Sekunde: Geschwindigkeit des Zeigers über die letzten (höchstens 100 ms) Punkte,
 * begrenzt auf ±`STAGE_MAX_SPEED`. Ein abgebrochenes Ziehen (`cancelled`, etwa weil das Handy doch scrollt) wirft nicht.
 */
export function releaseSpeed(
  history: readonly { x: number; t: number }[],
  radius: number,
  cancelled = false,
): number {
  const first = history[0];
  const last = history.at(-1);
  if (cancelled || !first || !last || last.t <= first.t) return 0;
  const pixelsPerSecond = ((last.x - first.x) / (last.t - first.t)) * 1000;
  return clamp(dragDegrees(pixelsPerSecond, radius), -STAGE_MAX_SPEED, STAGE_MAX_SPEED);
}

/** Glätten unabhängig von der Bildrate: Anteil, um den sich ein Wert in `dt` Sekunden seinem Ziel nähert (Zeitkonstante `tau`). */
export const smoothing = (dt: number, tau: number) => 1 - Math.exp(-dt / tau);

/** Dauer des Auftritts in Sekunden. */
export const ENTRANCE_SECONDS = 2.8;
/** Um so viel Grad dreht sich der Ring während des Auftritts zusätzlich in seine Lage. */
export const ENTRANCE_SPIN = 150;

/**
 * Der Auftritt zum Zeitpunkt `time` (Sekunden seit dem Start): Die Plakate stehen zuerst als enge Blüte in der Mitte und
 * falten sich zum Ring auf (`bloom`: Anteil des Halbmessers), drehen sich in ihre Lage (`spin`, Grad, die noch fehlen) und
 * kommen aus der Tiefe nach vorn (`depth` 0 … 1). Alles läuft stark aus (ease-out), am Ende steht genau das Standbild.
 */
export function entrance(time: number): {
  spin: number;
  depth: number;
  bloom: number;
  opacity: number;
  done: boolean;
} {
  const p = clamp(time / ENTRANCE_SECONDS, 0, 1);
  const unfold = clamp((time - 0.1) / 2.1, 0, 1);
  return {
    spin: -ENTRANCE_SPIN * (1 - p) ** 4,
    depth: 1 - (1 - clamp(time / (ENTRANCE_SECONDS * 0.8), 0, 1)) ** 3,
    bloom: 0.07 + 0.93 * (1 - (1 - unfold) ** 4),
    opacity: clamp(time / 1.1, 0, 1) ** 1.5,
    done: p >= 1,
  };
}

/**
 * Schwache Grafik: So viele Bildabstände misst die Schleife gleich nach dem Auftritt (`frames`). Dauern sie im Mittel länger
 * als `slowMs`, zeichnet die Bühne leichter (`data-quality="low"`: ohne Spiegelung, Lichthöfe, Boden, Schlagschatten der
 * Plakate, Unschärfe-Stufen und Weichzeichner hinter dem Glas, weniger Lichtstaub). Gemessen 22.10.2026 bei 1440 × 900 mit
 * doppelter Pixeldichte: mit GPU 60 Bilder/s, in Software-Darstellung (Chromium ohne Grafikbeschleunigung) ≈ 25, mit der
 * leichten Stufe ≈ 45. Auch ein auf 30 Bilder/s gedrosselter Browser (Stromsparmodus) bekommt die leichte Stufe.
 */
export const STAGE_QUALITY = { frames: 60, slowMs: 28, capMs: 50 } as const;

/**
 * Ob die gemessenen Bildabstände (ms) auf schwache Grafik deuten. Jeder Wert zählt höchstens `capMs` – ein einzelnes Ruckeln
 * (ein Foto wird dekodiert, der Tab war kurz verdeckt) kippt die Entscheidung so nicht, erst durchgehend langsame Bilder.
 */
export function isSlowStage(frameTimes: readonly number[]): boolean {
  if (frameTimes.length < STAGE_QUALITY.frames) return false;
  const total = frameTimes.reduce((sum, ms) => sum + Math.min(ms, STAGE_QUALITY.capMs), 0);
  return total / frameTimes.length > STAGE_QUALITY.slowMs;
}

/** Gemerkte Wahl „Bewegung anhalten“ (nur in diesem Browser, `localStorage`). */
export const MOTION_STORAGE_KEY = "vf-anmelden-bewegung";

// --- Farben, auf denen Schrift steht ------------------------------------------------------------------------------------

export type Rgb = readonly [number, number, number];

/**
 * Die Glasfläche mit dem Formular: ein dunkler Kern (oben → unten) mit blauem Schimmer oben, darunter die Szene milchig
 * weichgezeichnet. Weiß und die Schriftstufen unten erreichen darauf selbst dann mehr als 4,5 : 1, wenn hinter dem Glas eine
 * rein weiße Stelle läge (nachgerechnet in tests/unit/login-stage.test.ts). Kommt als CSS-Variablen an die Bühne
 * (`stageCssVariables`), so stehen die Werte nur hier.
 */
export const STAGE_GLASS = {
  top: [12, 17, 36],
  topAlpha: 0.8,
  bottom: [5, 8, 20],
  bottomAlpha: 0.86,
  tint: [58, 107, 234],
  tintAlpha: 0.16,
} as const satisfies {
  top: Rgb;
  topAlpha: number;
  bottom: Rgb;
  bottomAlpha: number;
  tint: Rgb;
  tintAlpha: number;
};

/**
 * Deckkraft von Weiß für die Schriftstufen auf der Bühne:
 *   label  Feldnamen
 *   soft   Beschreibung, Hinweis unter dem Formular, Feldhinweise
 *   muted  kleine Versalien („Willkommen zurück“, „Im Fokus“)
 *   foot   Impressum, Datenschutz (unten links auf dem Boden)
 */
export const STAGE_TEXT_ALPHA = { label: 0.88, soft: 0.8, muted: 0.74, foot: 0.82 } as const;

/**
 * Farbige Schrift auf dem Glas: Links (wie „Passwort vergessen?“) in hellem Vereinsblau, Fehlertexte heller als im dunklen
 * Design (dessen Rot hätte auf diesem Glas nur 3,1 : 1).
 */
export const STAGE_INK = { link: "oklch(0.84 0.09 262)", error: "oklch(0.82 0.11 22)" } as const;

/** Der Anmelden-Knopf: Verlauf in Vereinsblau mit weißer Schrift, die hellste Stelle zählt. */
export const STAGE_BUTTON = { from: "#2f5fe4", via: "#3a6bea", to: "#3159d6" } as const;

const rgbCss = (rgb: Rgb, alpha?: number) =>
  alpha === undefined ? `rgb(${rgb.join(" ")})` : `rgb(${rgb.join(" ")} / ${alpha})`;

/** Die Werte oben als CSS-Variablen (Stil `style` der Bühne). */
export function stageCssVariables(): Record<`--${string}`, string> {
  return {
    "--glass-top": rgbCss(STAGE_GLASS.top, STAGE_GLASS.topAlpha),
    "--glass-bottom": rgbCss(STAGE_GLASS.bottom, STAGE_GLASS.bottomAlpha),
    "--glass-tint": rgbCss(STAGE_GLASS.tint, STAGE_GLASS.tintAlpha),
    "--text-label": `rgb(255 255 255 / ${STAGE_TEXT_ALPHA.label})`,
    "--text-soft": `rgb(255 255 255 / ${STAGE_TEXT_ALPHA.soft})`,
    "--text-muted": `rgb(255 255 255 / ${STAGE_TEXT_ALPHA.muted})`,
    "--text-foot": `rgb(255 255 255 / ${STAGE_TEXT_ALPHA.foot})`,
    "--ink-link": STAGE_INK.link,
    "--ink-error": STAGE_INK.error,
    "--button-from": STAGE_BUTTON.from,
    "--button-via": STAGE_BUTTON.via,
    "--button-to": STAGE_BUTTON.to,
  };
}
