import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Kontraste der Farbwerte in `src/app/globals.css` für Bedienelemente (WCAG 1.4.11, mindestens 3:1): Feldränder und
 * Fokusring gegen Karte, Seitengrund und Dialog – hell und dunkel. axe (tests/e2e/a11y.spec.ts) prüft nur Textkontraste,
 * ein blasser Feldrand fiele dort nicht auf. Gerechnet wird wie im Browser: OKLCH → sRGB (8 bit) → relative Luminanz.
 */
const css = readFileSync(path.resolve(__dirname, "../../src/app/globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

type Rgb = [number, number, number];

/** Farbwerte eines Blocks (`:root` bzw. `.dark` am Zeilenanfang – nicht die eingerückte Variante in `@media`). */
function tokens(selector: ":root" | ".dark"): Record<string, string> {
  const escaped = selector.replace(".", "\\.");
  const block = css.match(new RegExp(`^${escaped} \\{([^}]*)\\}`, "m"))?.[1];
  if (!block) throw new Error(`Block ${selector} nicht gefunden`);
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  );
}

/** oklch(L C h) → sRGB mit 8 bit je Kanal (Matrizen nach Björn Ottosson, außerhalb von sRGB abgeschnitten). */
function oklchToRgb(value: string): Rgb {
  const match = value.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/);
  if (!match) throw new Error(`Kein deckender oklch-Wert: ${value}`);
  const [L, C, h] = match.slice(1).map(Number);
  const a = C * Math.cos((h * Math.PI) / 180);
  const b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return linear.map((channel) => {
    const c = Math.min(1, Math.max(0, channel));
    return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055));
  }) as Rgb;
}

/** Relative Luminanz nach WCAG 2.x. */
function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(first: string, second: string): number {
  const [light, dark] = [luminance(oklchToRgb(first)), luminance(oklchToRgb(second))].sort(
    (x, y) => y - x,
  );
  return (light + 0.05) / (dark + 0.05);
}

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
