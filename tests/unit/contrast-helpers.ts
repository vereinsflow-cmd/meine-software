import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Hilfen für die Kontrastprüfungen (`theme-contrast.test.ts`, `dashboard-contrast.test.ts`). Gerechnet wird wie im Browser:
 * OKLCH → sRGB (8 bit) → relative Luminanz; durchscheinende Farben werden in sRGB über ihren Grund gemischt.
 */
export type Rgb = [number, number, number];

const globals = readFileSync(path.resolve(__dirname, "../../src/app/globals.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);
const tailwindTheme = readFileSync(
  path.resolve(__dirname, "../../node_modules/tailwindcss/theme.css"),
  "utf8",
);

/** Farbwerte eines Blocks in globals.css (`:root` bzw. `.dark` am Zeilenanfang – nicht die eingerückte Variante in `@media`). */
export function tokens(selector: ":root" | ".dark"): Record<string, string> {
  const escaped = selector.replace(".", "\\.");
  const block = globals.match(new RegExp(`^${escaped} \\{([^}]*)\\}`, "m"))?.[1];
  if (!block) throw new Error(`Block ${selector} nicht gefunden`);
  return Object.fromEntries(
    [...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]),
  );
}

/** Eine Tailwind-Farbe (z. B. „amber-700“) als `oklch(L C h)` mit L als Anteil, wie in globals.css. */
export function tailwindColor(name: string): string {
  const match = tailwindTheme.match(
    new RegExp(`--color-${name}:\\s*oklch\\(([\\d.]+)%\\s+([\\d.]+)\\s+([\\d.]+)\\)`),
  );
  if (!match) throw new Error(`Tailwind-Farbe ${name} nicht gefunden`);
  return `oklch(${Number(match[1]) / 100} ${match[2]} ${match[3]})`;
}

/** oklch(L C h) → sRGB mit 8 bit je Kanal (Matrizen nach Björn Ottosson, außerhalb von sRGB abgeschnitten). */
export function oklchToRgb(value: string): Rgb {
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
export function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRgb(first: Rgb, second: Rgb): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Kontrast zweier deckender oklch-Werte. */
export function contrast(first: string, second: string): number {
  return contrastRgb(oklchToRgb(first), oklchToRgb(second));
}

/** `top` mit Deckkraft `alpha` über `base` (wie `bg-white/15` über dem Kartengrund). */
export function mix(top: Rgb, alpha: number, base: Rgb): Rgb {
  return top.map((channel, index) =>
    Math.round(channel * alpha + base[index]! * (1 - alpha)),
  ) as Rgb;
}
