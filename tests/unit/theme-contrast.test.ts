import { describe, expect, it } from "vitest";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { contrast, contrastRgb, mix, oklchToRgb, tokens } from "./contrast-helpers";

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

/**
 * Kontrast dessen, was ein Knopf im Fokus um sich zeigt (Klassen wie im Browser zusammengeführt, `cn` wie in `Button`):
 * Ein deckender Rahmen (`outline`, 2 px) mit Abstand liegt auf der Fläche um den Knopf. Sonst bleibt bei gefüllten Knöpfen
 * nur der Saum (`ring-<farbe>/<deckkraft>`) – der Rand im Fokus hat dort die Farbe der Fläche des Knopfs.
 */
function focusContrast(classes: string, t: Record<string, string>, surface: string): number {
  const list = classes.split(/\s+/);
  const colorOf = (kind: "outline" | "ring") =>
    list
      .map((name) => name.match(new RegExp(`^focus-visible:${kind}-([a-z-]+)(?:/(\\d+))?$`)))
      .find((match) => match !== null && t[`--${match[1]}`] !== undefined);
  const outline = colorOf("outline");
  if (
    outline &&
    [
      "focus-visible:outline-solid",
      "focus-visible:outline-2",
      "focus-visible:outline-offset-2",
    ].every((name) => list.includes(name))
  ) {
    return contrast(t[`--${outline[1]}`]!, surface);
  }
  const ring = colorOf("ring");
  if (!ring) return 1;
  const ground = oklchToRgb(surface);
  const alpha = ring[2] ? Number(ring[2]) / 100 : 1;
  return contrastRgb(mix(oklchToRgb(t[`--${ring[1]}`]!), alpha, ground), ground);
}

describe.each([
  { scheme: "hell", selector: ":root" as const },
  { scheme: "dunkel", selector: ".dark" as const },
])("Tastaturfokus gefüllter Knöpfe ($scheme, WCAG 1.4.11)", ({ selector }) => {
  const t = tokens(selector);
  const surfaces = { Karte: t["--card"], Seitengrund: t["--background"], Dialog: t["--popover"] };

  it.each(["default", "success", "destructive"] as const)(
    "„%s“: deckender Rahmen mit Abstand, auf Karte, Seitengrund und Dialog mindestens 3:1",
    (variant) => {
      const classes = cn(buttonVariants({ variant }));
      for (const [name, surface] of Object.entries(surfaces)) {
        expect(focusContrast(classes, t, surface!), name).toBeGreaterThanOrEqual(3);
      }
    },
  );

  it("der halbdurchsichtige Saum allein reichte nicht (≈ 2,4:1 hell)", () => {
    expect(focusContrast("focus-visible:ring-ring/50", t, t["--card"]!)).toBeLessThan(3);
  });
});
