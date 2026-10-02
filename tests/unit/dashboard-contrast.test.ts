import { describe, expect, it } from "vitest";
import { KPI_ACCENT, TILE_ACCENT } from "@/components/shared/accent";
import { contrastRgb, mix, oklchToRgb, tailwindColor, tokens, type Rgb } from "./contrast-helpers";

/**
 * Textkontraste des Dashboards seit dem neuen Aussehen (02.10.2026): weiße Schrift auf den farbigen Kennzahlen, Schilder und
 * Sätze darauf, getönte Kacheln, runde Reiter, Hinweis „Helferschichten“ und Rollenschild. axe (tests/e2e) kann Text auf
 * Farbverläufen nicht messen und überspringt ihn – deshalb hier nachgerechnet, mit den echten Farbwerten aus Tailwind und
 * globals.css. Alles normal große Schrift: mindestens 4,5 : 1 (WCAG 1.4.3).
 */
const AA = 4.5;
const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];
const tw = (name: string) => oklchToRgb(tailwindColor(name));
const light = tokens(":root");
const dark = tokens(".dark");
const token = (set: Record<string, string>, name: string) => oklchToRgb(set[name]!);

/**
 * Höchster Anteil des hellen Scheins oben rechts dort, wo Beschriftung stehen kann. Der Schein (Spitze 10 % Weiß) sitzt genau
 * in der Kartenecke und ist nach 60 % seines Halbmessers (7 rem), also nach 4,2 rem, verblasst. Am nächsten kommt ihm eine
 * Beschriftung in einer schmalen Karte ohne Pfeil: 1,25 rem vom rechten, 1,5 rem vom oberen Rand – knapp 2 rem von der Ecke,
 * dort sind es gut 5 %.
 */
const SHEEN_AT_LABEL = 0.055;

/** Farben des Verlaufs aus den Klassen (`from-blue-600 via-blue-700 to-blue-900`). */
function stops(classes: string): { from: Rgb; via: Rgb; to: Rgb } {
  const pick = (prefix: "from" | "via" | "to") => {
    const name = classes.match(new RegExp(`(?:^|\\s)${prefix}-([a-z]+-\\d+)(?=\\s|$)`))?.[1];
    if (!name) throw new Error(`${prefix}-Farbe fehlt in „${classes}“`);
    return tw(name);
  };
  return { from: pick("from"), via: pick("via"), to: pick("to") };
}

describe.each(Object.entries(KPI_ACCENT))(
  "Kennzahlenkarte „%s“: weiße Schrift auf dem Verlauf",
  (_, colors) => {
    const { from, via, to } = stops(colors.card);

    it("Beschriftung und Zahl oben links (hellste Stelle, mit dem Schein): mindestens 4,5 : 1", () => {
      expect(contrastRgb(WHITE, mix(WHITE, SHEEN_AT_LABEL, from))).toBeGreaterThanOrEqual(AA);
    });

    it("Hinweis und Vergleichssatz (Weiß zu 95 %) oben: mindestens 4,5 : 1", () => {
      expect(contrastRgb(mix(WHITE, 0.95, from), from)).toBeGreaterThanOrEqual(AA);
    });

    it("Beschriftung unter der Grafik (Weiß) in der Mitte und unten: mindestens 4,5 : 1", () => {
      expect(contrastRgb(WHITE, via)).toBeGreaterThanOrEqual(AA);
      expect(contrastRgb(WHITE, to)).toBeGreaterThanOrEqual(AA);
    });
  },
);

describe("Auf den farbigen Kennzahlen", () => {
  it("Monate unter der Mitgliederlinie (Weiß zu 90 %) auf dem Blau: mindestens 4,5 : 1", () => {
    const { via, to } = stops(KPI_ACCENT.blue.card);
    expect(contrastRgb(mix(WHITE, 0.9, via), via)).toBeGreaterThanOrEqual(AA);
    expect(contrastRgb(mix(WHITE, 0.9, to), to)).toBeGreaterThanOrEqual(AA);
  });

  it.each([
    ["Grün auf Weiß (mehr als zuvor)", "emerald-800", WHITE],
    ["Blau auf Weiß (Information)", "blue-800", WHITE],
    ["Rot auf Weiß (unbesetzt)", "red-700", WHITE],
    ["Dunkelbernstein auf Bernstein (teilweise besetzt)", "amber-950", tw("amber-300")],
  ] as const)("Vergleichsschild %s: mindestens 4,5 : 1", (_, text, background) => {
    expect(contrastRgb(tw(text), background)).toBeGreaterThanOrEqual(AA);
  });

  it.each(["amber-200", "red-200"])(
    "Satz unter dem Ring (%s) auf dem Grün der hohen Kachel: mindestens 4,5 : 1",
    (text) => {
      // Der Satz steht etwa in der Mitte der hohen Kachel – dort liegt die mittlere Farbe des Verlaufs.
      const { via, to } = stops(KPI_ACCENT.emerald.card);
      expect(contrastRgb(tw(text), via)).toBeGreaterThanOrEqual(AA);
      expect(contrastRgb(tw(text), to)).toBeGreaterThanOrEqual(AA);
    },
  );

  it("Aufschlüsselung unter dem Ring (Weiß zu 90 % auf dunklem Kästchen): mindestens 4,5 : 1", () => {
    const { via } = stops(KPI_ACCENT.emerald.card);
    const box = mix(BLACK, 0.15, via);
    expect(contrastRgb(mix(WHITE, 0.9, box), box)).toBeGreaterThanOrEqual(AA);
  });
});

describe.each(Object.entries(TILE_ACCENT))("Getönte Kachel „%s“", (name) => {
  it("hell: gedämpfte Schrift auf der kräftigsten Tönung (Stufe 100): mindestens 4,5 : 1", () => {
    expect(
      contrastRgb(token(light, "--muted-foreground"), tw(`${name}-100`)),
    ).toBeGreaterThanOrEqual(AA);
  });

  it("dunkel: gedämpfte Schrift auf der Tönung (18 % Stufe 500 über der Karte): mindestens 4,5 : 1", () => {
    const tint = mix(tw(`${name}-500`), 0.18, token(dark, "--card"));
    expect(contrastRgb(token(dark, "--muted-foreground"), tint)).toBeGreaterThanOrEqual(AA);
  });
});

describe("Runde Reiter", () => {
  it("hell: gedämpfte Reiter auf der grauen Schiene: mindestens 4,5 : 1", () => {
    expect(contrastRgb(token(light, "--muted-foreground"), tw("slate-200"))).toBeGreaterThanOrEqual(
      AA,
    );
  });

  it("dunkel: gedämpfte Reiter auf der Schiene, der gewählte weiß auf seiner Fläche: mindestens 4,5 : 1", () => {
    const rail = mix(token(dark, "--card"), 0.9, token(dark, "--background"));
    expect(contrastRgb(token(dark, "--muted-foreground"), rail)).toBeGreaterThanOrEqual(AA);
    expect(contrastRgb(WHITE, mix(WHITE, 0.15, rail))).toBeGreaterThanOrEqual(AA);
  });
});

describe("Kopf und Hinweis", () => {
  it.each([
    ["hell", light, tw("amber-100")],
    ["dunkel", dark, mix(tw("amber-500"), 0.2, token(dark, "--background"))],
  ] as const)(
    "Hinweis „Helferschichten“ (%s): Text zu 80 % auf dem kräftigsten Bernstein: mindestens 4,5 : 1",
    (_, set, background) => {
      expect(
        contrastRgb(mix(token(set, "--foreground"), 0.8, background), background),
      ).toBeGreaterThanOrEqual(AA);
    },
  );

  it.each([
    ["hell", light],
    ["dunkel", dark],
  ] as const)(
    "Rollenschild (%s): Markenfarbe auf ihrer zarten Fläche: mindestens 4,5 : 1",
    (_, set) => {
      const primary = token(set, "--primary");
      expect(
        contrastRgb(primary, mix(primary, 0.1, token(set, "--background"))),
      ).toBeGreaterThanOrEqual(AA);
    },
  );
});
