import { describe, expect, it } from "vitest";
import { contrast, oklchToRgb, tokens } from "./contrast-helpers";

/**
 * Kontraste der Farbwerte in `src/app/globals.css` für Bedienelemente (WCAG 1.4.11, mindestens 3:1): Feldränder und
 * Fokusring gegen Karte, Seitengrund und Dialog – hell und dunkel. axe (tests/e2e/a11y.spec.ts) prüft nur Textkontraste,
 * ein blasser Feldrand fiele dort nicht auf. Gerechnet wird wie im Browser: OKLCH → sRGB (8 bit) → relative Luminanz.
 */

describe("Umrechnung OKLCH → sRGB → Kontrast", () => {
  it("trifft bekannte Werte", () => {
    expect(oklchToRgb("oklch(1 0 0)")).toEqual([255, 255, 255]);
    expect(oklchToRgb("oklch(0 0 0)")).toEqual([0, 0, 0]);
    expect(oklchToRgb("oklch(0.922 0 0)")).toEqual([229, 229, 229]); // bisheriger Feldrand
    expect(contrast("oklch(1 0 0)", "oklch(0 0 0)")).toBeCloseTo(21, 5);
    expect(contrast("oklch(1 0 0)", "oklch(0.922 0 0)")).toBeCloseTo(1.26, 2);
  });
});

describe.each([
  { scheme: "hell", selector: ":root" as const },
  { scheme: "dunkel", selector: ".dark" as const },
])("Bedienelemente heben sich ab ($scheme)", ({ selector }) => {
  const t = tokens(selector);
  const surfaces = { Karte: t["--card"], Seitengrund: t["--background"], Dialog: t["--popover"] };

  it.each(Object.entries(surfaces))("Feldrand auf %s: mindestens 3:1", (_, surface) => {
    expect(contrast(t["--field-border"], surface)).toBeGreaterThanOrEqual(3);
  });

  it.each(Object.entries(surfaces))("Fokusring auf %s: mindestens 3:1", (_, surface) => {
    expect(contrast(t["--ring"], surface)).toBeGreaterThanOrEqual(3);
  });

  it("Fokusring in der Markenfarbe, auch in der Seitenleiste", () => {
    expect(t["--ring"]).toBe(t["--primary"]);
    expect(t["--sidebar-ring"]).toBe(t["--sidebar-primary"]);
    expect(contrast(t["--sidebar-ring"], t["--sidebar"])).toBeGreaterThanOrEqual(3);
  });

  it("Fehlerrand (rot) auf der Karte: mindestens 3:1", () => {
    expect(contrast(t["--destructive"], t["--card"])).toBeGreaterThanOrEqual(3);
  });
});
