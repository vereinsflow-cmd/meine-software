import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEPARTMENT_SPORTS } from "@/modules/departments/department-image";
import {
  ENTRANCE_SECONDS,
  ENTRANCE_SPIN,
  POSTER_SIZES,
  STAGE_BUTTON,
  STAGE_GLASS,
  STAGE_INK,
  STAGE_MAX_SPEED,
  STAGE_PANELS,
  STAGE_QUALITY,
  STAGE_SPORTS,
  STAGE_START_SPORT,
  STAGE_TEXT_ALPHA,
  dragDegrees,
  entrance,
  focusProgress,
  frontPanel,
  isSlowStage,
  normalizeAngle,
  panelLook,
  panelSport,
  posterImage,
  releaseSpeed,
  smoothing,
  stageCssVariables,
} from "@/modules/auth/stage";
import { contrastRgb, mix, oklchToRgb, type Rgb } from "./contrast-helpers";

/** Bühne der Anmeldeseiten („3D-Fotokarussell“): Fotos, Lage der Plakate, Ziehen und Schwung, Auftritt, Kontraste. */

const css = readFileSync(
  path.resolve(__dirname, "../../src/modules/auth/components/login-stage.module.css"),
  "utf8",
);

describe("Fotos im Ring", () => {
  it("jede vorbereitete Abteilung genau einmal, mit Ausschnitt und Lichtfarbe", () => {
    expect(STAGE_SPORTS.map((s) => s.sport).sort()).toEqual([...DEPARTMENT_SPORTS].sort());
    for (const sport of STAGE_SPORTS) {
      expect(sport.focus).toMatch(/^\d+% \d+%$/);
      expect(sport.light).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
    }
    // Warm und kühl im Wechsel (Rot über bzw. unter Blau), damit das Raumlicht beim Drehen die Farbe wechselt
    const warm = STAGE_SPORTS.map(({ light }) => {
      const [r, , b] = light.split(" ").map(Number);
      return r > b;
    });
    expect(warm.slice(0, 7)).toEqual([true, false, true, false, true, false, true]);
  });

  it("Dart (Nr. 04) steht im Standbild vorn", () => {
    expect(STAGE_SPORTS[STAGE_START_SPORT].name).toBe("Dart");
    expect(String(STAGE_START_SPORT + 1).padStart(2, "0")).toBe("04");
  });

  it("16 Plakate breit (jede Abteilung zweimal, genau gegenüber), 8 schmal (jede einmal)", () => {
    expect(STAGE_PANELS).toEqual({ wide: 16, narrow: 8 });
    for (let i = 0; i < 8; i++) expect(panelSport(i + 8)).toBe(panelSport(i));
    expect(new Set(Array.from({ length: 8 }, (_, i) => panelSport(i))).size).toBe(8);
    // Der Stil blendet schmal genau die zweite Hälfte aus und zählt so viele Plakate wie hier.
    expect(css).toMatch(/--panels: 8;/);
    expect(css).toMatch(/--panels: 16;/);
    expect(css).toMatch(/\.panel:nth-child\(n \+ 9\)\s*\{\s*display: none;/);
  });

  it("Bildsatz mit den vorhandenen Größen, Standard 800 px", () => {
    expect(posterImage("dart")).toEqual({
      src: "/bilder/abteilungen/dart-800.webp",
      srcSet:
        "/bilder/abteilungen/dart-480.webp 480w, /bilder/abteilungen/dart-800.webp 800w, /bilder/abteilungen/dart-1200.webp 1200w",
    });
  });

  it("`sizes` folgt der gezeichneten Fotobreite: schmal 68vw (höchstens 400 px), breit 38vw", () => {
    expect(POSTER_SIZES).toBe("(max-width: 36.75rem) 68vw, (max-width: 63.999rem) 400px, 38vw");
    // breit: Halbmesser min(64vw, …), Plakat 0,355 × Halbmesser, Höhe × 1,25, Foto in der Höhe × 4/3
    expect(0.64 * 0.355 * 1.25 * (4 / 3) * 100).toBeCloseTo(37.9, 1);
    // schmal: Halbmesser 68vw, Plakat 0,6 × Halbmesser → Foto genau so breit wie der Halbmesser
    expect(0.6 * 1.25 * (4 / 3)).toBeCloseTo(1, 5);
    expect(css).toMatch(/--r: clamp\(240px, 68vw, 400px\);/);
    expect(400 / 0.68 / 16).toBeCloseTo(36.76, 1);
  });
});

describe("Lage eines Plakats im Ring", () => {
  it.each([
    [0, 0],
    [180, -180],
    [-180, -180],
    [190, -170],
    [-190, 170],
    [725, 5],
    [-725, -5],
  ])("Winkel %d° → %d°", (input, expected) => {
    expect(normalizeAngle(input)).toBeCloseTo(expected, 10);
  });

  it("vorn: hell, scharf, mit Name, Lichthof und Spiegelbild", () => {
    const look = panelLook(0);
    expect(look.shade).toBe(0);
    expect(look.label).toBe(1);
    expect(look.halo).toBeCloseTo(0.75);
    expect(look.reflection).toBeCloseTo(0.46);
    expect(look.blurStep).toBe(0);
    expect(look.light).toBe(1);
  });

  it("hinten: dunkel, unscharf, ohne Name (er wäre spiegelverkehrt), ohne Licht", () => {
    const look = panelLook(180);
    expect(look.shade).toBeCloseTo(0.88);
    expect(look.label).toBe(0);
    expect(look.halo).toBe(0);
    expect(look.reflection).toBe(0);
    expect(look.blurStep).toBe(3);
    expect(look.light).toBe(0);
  });

  it("Unschärfe in drei Stufen nach der Tiefe (Grenzen bei rund 88°, 109° und 133°)", () => {
    expect([0, 60, 85, 95, 105, 115, 130, 140, 180].map((az) => panelLook(az).blurStep)).toEqual([
      0, 0, 0, 1, 1, 2, 2, 3, 3,
    ]);
  });

  it("das Glanzlicht liegt auf Plakaten schräg zum Spot oben links (−34°)", () => {
    expect(panelLook(-34).sheen).toBeCloseTo(0.85);
    expect(panelLook(30).sheen).toBeLessThan(0.01);
  });

  it("Fokus im Formular: Raum tritt zurück (dunkler, weniger Lichthof und Spiegelung)", () => {
    const calm = panelLook(0);
    const typing = panelLook(0, 0.22);
    expect(typing.shade).toBeCloseTo(0.132);
    expect(typing.halo).toBeLessThan(calm.halo);
    expect(typing.reflection).toBeLessThan(calm.reflection);
    expect(panelLook(180, 0.22).shade).toBeLessThanOrEqual(0.94);
  });

  it("vorderstes Plakat und sein Winkel", () => {
    const angles = Array.from({ length: 16 }, (_, i) => i * 22.5);
    expect(frontPanel(angles, -3 * 22.5)).toEqual({ index: 3, azimuth: 0 });
    expect(frontPanel(angles, -3 * 22.5 + 10).index).toBe(3);
    expect(frontPanel(angles, -3 * 22.5 + 12).index).toBe(2);
    expect(frontPanel(angles, 360 * 5 - 22.5).index).toBe(1);
  });

  it("Balken „Im Fokus“ füllt sich bis zum nächsten Wechsel – auch rückwärts", () => {
    expect(focusProgress(-11.25, 22.5, 7)).toBe(0);
    expect(focusProgress(0, 22.5, 7)).toBe(0.5);
    expect(focusProgress(11.25, 22.5, 7)).toBe(1);
    expect(focusProgress(11.25, 22.5, -7)).toBe(0);
  });
});

describe("Ziehen und Schwung", () => {
  it("1 : 1 – ein Halbmesser Weg ist ein Bogenmaß (≈ 57,3°)", () => {
    expect(dragDegrees(1000, 1000)).toBeCloseTo(57.2958, 3);
    expect(dragDegrees(-500, 1000)).toBeCloseTo(-28.6479, 3);
  });

  it("Schwung aus den letzten Punkten, begrenzt; abgebrochen kein Wurf", () => {
    const history = [
      { x: 0, t: 0 },
      { x: 100, t: 100 },
    ];
    // 1000 px/s bei Halbmesser 1000 → 57,3 °/s
    expect(releaseSpeed(history, 1000)).toBeCloseTo(57.2958, 3);
    expect(releaseSpeed(history, 1000, true)).toBe(0);
    expect(
      releaseSpeed(
        [
          { x: 0, t: 0 },
          { x: 2000, t: 50 },
        ],
        400,
      ),
    ).toBe(STAGE_MAX_SPEED);
    expect(
      releaseSpeed(
        [
          { x: 2000, t: 0 },
          { x: 0, t: 50 },
        ],
        400,
      ),
    ).toBe(-STAGE_MAX_SPEED);
    expect(releaseSpeed([{ x: 5, t: 10 }], 1000)).toBe(0); // nur ein Punkt: Klick ohne Bewegung
  });

  it("Glätten unabhängig von der Bildrate: zwei halbe Schritte = ein ganzer", () => {
    const half = smoothing(1 / 120, 0.5);
    const whole = smoothing(1 / 60, 0.5);
    expect(1 - (1 - half) * (1 - half)).toBeCloseTo(whole, 12);
    expect(smoothing(0, 0.5)).toBe(0);
  });
});

describe("Auftritt", () => {
  it("beginnt als enge Blüte weit hinten, unsichtbar, um 150° verdreht", () => {
    const start = entrance(0);
    expect(start.bloom).toBeCloseTo(0.07);
    expect(start.depth).toBe(0);
    expect(start.opacity).toBe(0);
    expect(start.spin).toBe(-ENTRANCE_SPIN);
    expect(start.done).toBe(false);
  });

  it("endet genau im Standbild", () => {
    expect(entrance(ENTRANCE_SECONDS)).toEqual({
      spin: -0,
      depth: 1,
      bloom: 1,
      opacity: 1,
      done: true,
    });
    expect(entrance(60)).toEqual(entrance(ENTRANCE_SECONDS));
  });

  it("läuft stark aus: nach der Hälfte der Zeit ist fast alles geschafft", () => {
    const half = entrance(ENTRANCE_SECONDS / 2);
    expect(half.bloom).toBeGreaterThan(0.85);
    expect(Math.abs(half.spin)).toBeLessThan(ENTRANCE_SPIN * 0.07);
  });
});

describe("Schwache Grafik", () => {
  const frames = (ms: number, count: number = STAGE_QUALITY.frames) =>
    Array.from({ length: count }, () => ms);

  it("60 Bilder/s (auch 50 Hz) bleiben in voller Pracht, 25 und 30 Bilder/s zeichnen leichter", () => {
    expect(isSlowStage(frames(1000 / 60))).toBe(false);
    expect(isSlowStage(frames(20))).toBe(false);
    expect(isSlowStage(frames(1000 / 30))).toBe(true);
    expect(isSlowStage(frames(40))).toBe(true);
  });

  it("entscheidet erst nach genug Bildern", () => {
    expect(isSlowStage(frames(40, STAGE_QUALITY.frames - 1))).toBe(false);
  });

  it("einzelnes Ruckeln (Foto dekodiert, Tab kurz verdeckt) kippt die Entscheidung nicht", () => {
    const times = frames(1000 / 60);
    times[5] = times[30] = times[50] = 900;
    expect(isSlowStage(times)).toBe(false);
  });

  it("der Stil lässt dann Spiegelung, Lichthöfe, Boden und Weichzeichner hinter dem Glas weg", () => {
    for (const part of ["reflection", "halo", "floor"]) {
      expect(css).toMatch(new RegExp(`\\.stage\\[data-quality="low"\\] \\.${part}[,\\s{]`));
    }
    expect(css).toMatch(/\.stage\[data-quality="low"\] \.glass,[\s\S]*?backdrop-filter: none;/);
  });
});

describe("Kontraste auf der Glasfläche", () => {
  // Strengster Fall: hinter dem Glas läge eine rein weiße Stelle (der Weichzeichner macht daraus höchstens Weiß).
  const WHITE: Rgb = [255, 255, 255];
  const glassTop = mix(
    [...STAGE_GLASS.tint],
    STAGE_GLASS.tintAlpha,
    mix([...STAGE_GLASS.top], STAGE_GLASS.topAlpha, WHITE),
  );
  const glassBottom = mix([...STAGE_GLASS.bottom], STAGE_GLASS.bottomAlpha, WHITE);
  const grounds = [glassTop, glassBottom];

  it.each(Object.entries(STAGE_TEXT_ALPHA))("Weiß zu %s (%s) über 4,5 : 1", (_, alpha) => {
    for (const ground of grounds) {
      expect(contrastRgb(mix(WHITE, alpha, ground), ground)).toBeGreaterThan(4.5);
    }
  });

  it("Links und Fehlertexte über 4,5 : 1", () => {
    for (const ground of grounds) {
      expect(contrastRgb(oklchToRgb(STAGE_INK.link), ground)).toBeGreaterThan(4.5);
      expect(contrastRgb(oklchToRgb(STAGE_INK.error), ground)).toBeGreaterThan(4.5);
    }
  });

  it("Rand der Eingabefelder über 3 : 1 (WCAG 1.4.11)", () => {
    const alpha = Number(/--input: rgb\(255 255 255 \/ ([\d.]+)\)/.exec(css)?.[1]);
    expect(alpha).toBeGreaterThan(0);
    for (const ground of grounds) {
      // Das Feld selbst ist ein Hauch heller (Weiß zu 5 %), der Rand liegt darüber.
      expect(contrastRgb(mix(WHITE, alpha, ground), ground)).toBeGreaterThan(3);
    }
  });

  it("Weiß auf dem Anmelden-Knopf über 4,5 : 1 an der hellsten Stelle des Verlaufs", () => {
    const hex = (value: string): Rgb =>
      [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb;
    const lightest = Math.min(
      ...Object.values(STAGE_BUTTON).map((value) => contrastRgb(WHITE, hex(value))),
    );
    expect(lightest).toBeGreaterThan(4.5);
  });

  it("die Werte kommen als CSS-Variablen an die Bühne und werden im Stil benutzt", () => {
    const variables = stageCssVariables();
    expect(variables["--glass-top"]).toBe("rgb(12 17 36 / 0.8)");
    expect(variables["--text-soft"]).toBe(`rgb(255 255 255 / ${STAGE_TEXT_ALPHA.soft})`);
    for (const name of Object.keys(variables)) expect(css, name).toContain(`var(${name})`);
  });
});
