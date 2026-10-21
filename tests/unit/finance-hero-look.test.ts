import { describe, expect, it } from "vitest";
import { CARD_SCRIM_STOPS } from "@/modules/finance/account-cards";
import {
  FINANCE_GLASS,
  FINANCE_GLASS_HOVER,
  FINANCE_GLOWS,
  FINANCE_NIGHT,
  FINANCE_TEXT_ALPHA,
  FINANCE_TONE,
  financeGlowBackground,
} from "@/modules/finance/hero-look";
import { contrastRgb, mix, oklchToRgb, tailwindColor, type Rgb } from "./contrast-helpers";

/**
 * Kontraste im Kopf der Finanz-Übersicht und auf den Kontokarten – hell wie dunkel dieselben Flächen (die Nacht ändert sich
 * nicht mit der Darstellung). Gerechnet an der ungünstigsten Stelle: alle drei Lichter übereinander über der Nacht bzw. bei
 * den Karten eine rein weiße Stelle im Foto.
 */
const AA = 4.5;
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const hex = (value: string): Rgb =>
  [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as Rgb;
const NIGHT = hex(FINANCE_NIGHT);
const glassAlpha = (css: string) => Number(/\/ ([\d.]+)\)$/.exec(css)![1]);
/** Hellste Stelle des Kopfs: jedes Licht mit voller Deckkraft über der Nacht. */
const BRIGHTEST = FINANCE_GLOWS.reduce<Rgb>(
  (base, glow) => mix([...glow.rgb], glow.alpha, base),
  NIGHT,
);
const white = (alpha: number, behind: Rgb) => mix(WHITE, alpha, behind);
const tone = (className: string) => oklchToRgb(tailwindColor(className.replace(/^text-/, "")));

describe("Kopf: weiße Schrift auf der Nacht mit Lichtern", () => {
  it("die Lichter stehen so im CSS, wie hier gerechnet", () => {
    expect(financeGlowBackground()).toContain("rgb(37 99 235 / 0.55)");
    expect(FINANCE_GLOWS).toHaveLength(3);
  });

  it("Beschriftung (85 %), Chips (90 %), Achse (80 %) direkt auf der hellsten Stelle: mindestens 4,5 : 1", () => {
    for (const alpha of Object.values(FINANCE_TEXT_ALPHA)) {
      expect(contrastRgb(white(alpha, BRIGHTEST), BRIGHTEST), String(alpha)).toBeGreaterThanOrEqual(
        AA,
      );
    }
  });

  it("auf Glas (auch beim Darüberfahren): Weiß sowie Grün, Rosé und Bernstein der Beträge mindestens 4,5 : 1", () => {
    for (const css of [FINANCE_GLASS, FINANCE_GLASS_HOVER]) {
      const glass = mix(NIGHT, glassAlpha(css), BRIGHTEST);
      for (const alpha of Object.values(FINANCE_TEXT_ALPHA)) {
        expect(contrastRgb(white(alpha, glass), glass)).toBeGreaterThanOrEqual(AA);
      }
      for (const className of Object.values(FINANCE_TONE)) {
        expect(contrastRgb(tone(className), glass), className).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it("weiße Symbole der Schnellaktionen auf dem hellsten Ton ihres Kreises: mindestens 3 : 1 (WCAG 1.4.11)", () => {
    for (const color of ["blue-500", "orange-600", "emerald-600", "violet-500"]) {
      expect(contrastRgb(WHITE, oklchToRgb(tailwindColor(color))), color).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("Kontokarten: Schrift über Foto, Tönung und Abdeckung", () => {
  /** Deckkraft der Abdeckung an einer Stelle (linear zwischen den Stützstellen, wie der Browser). */
  const scrimAt = (percent: number) => {
    for (let i = 1; i < CARD_SCRIM_STOPS.length; i++) {
      const [x1, a1] = CARD_SCRIM_STOPS[i]!;
      const [x0, a0] = CARD_SCRIM_STOPS[i - 1]!;
      if (percent <= x1) return a0 + ((a1 - a0) * (percent - x0)) / (x1 - x0);
    }
    return CARD_SCRIM_STOPS.at(-1)![1];
  };

  it("oben (Name, Bank, Stand: bis 34 %) und unten (Vereinsname: ab 70 %) mindestens 60 % Schwarz", () => {
    for (let percent = 0; percent <= 34; percent++)
      expect(scrimAt(percent)).toBeGreaterThanOrEqual(0.6);
    for (let percent = 70; percent <= 100; percent++)
      expect(scrimAt(percent)).toBeGreaterThanOrEqual(0.6);
  });

  it("über einer rein weißen Bildstelle: Weiß (auch zu 85 %) und Rot-100 für Beträge im Minus mindestens 4,5 : 1", () => {
    const behind = mix(BLACK, 0.6, WHITE);
    expect(contrastRgb(WHITE, behind)).toBeGreaterThanOrEqual(AA);
    expect(contrastRgb(white(0.85, behind), behind)).toBeGreaterThanOrEqual(AA);
    expect(contrastRgb(white(0.9, behind), behind)).toBeGreaterThanOrEqual(AA);
    expect(contrastRgb(oklchToRgb(tailwindColor("red-100")), behind)).toBeGreaterThanOrEqual(AA);
  });

  it("Schild „Standardkonto“ (Weiß auf 60 % Schwarz) – auch in der Mitte, wo das Foto durchscheint", () => {
    const badge = mix(BLACK, 0.6, WHITE);
    expect(contrastRgb(WHITE, badge)).toBeGreaterThanOrEqual(AA);
  });

  it("Töpfe der Abteilungen: Saldo in Grün-100 und Rosé-100 auf mindestens 60 % Schwarz", () => {
    const behind = mix(BLACK, 0.6, WHITE);
    for (const color of ["emerald-100", "rose-100"]) {
      expect(contrastRgb(oklchToRgb(tailwindColor(color)), behind), color).toBeGreaterThanOrEqual(
        AA,
      );
    }
  });
});
