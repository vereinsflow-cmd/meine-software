import { HERO_GLASS_ALPHA, HERO_NIGHT } from "@/modules/dashboard/hero";

/**
 * Farben des Kopfs der Finanz-Übersicht („Kontostand · alle Konten“, seit 21.10.2026): dieselbe Nacht wie die Vereins-Bühne
 * des Dashboards (`HERO_NIGHT`, hell wie dunkel gleich), darüber drei weiche Lichter. Schrift steht weiß direkt auf der Nacht
 * oder auf Glas (Nacht zu 62 %, `HERO_GLASS_ALPHA.text`). Die Kontraste – auch an der hellsten Stelle, wo alle drei Lichter
 * übereinanderliegen – rechnet tests/unit/finance-hero-look.test.ts nach (mindestens 4,5 : 1).
 */

export const FINANCE_NIGHT = HERO_NIGHT;

/** Die Lichter: Farbe (sRGB), Deckkraft und Lage als `radial-gradient` – Blau oben links, Violett unten rechts, Himmelblau oben. */
export const FINANCE_GLOWS = [
  { rgb: [37, 99, 235], alpha: 0.55, at: "60% 80% at 8% 0%" },
  { rgb: [124, 58, 237], alpha: 0.38, at: "50% 70% at 100% 100%" },
  { rgb: [14, 165, 233], alpha: 0.18, at: "40% 50% at 70% 10%" },
] as const satisfies readonly {
  rgb: readonly [number, number, number];
  alpha: number;
  at: string;
}[];

/** Die Lichter als CSS-Hintergrund (über der Nacht). */
export function financeGlowBackground(): string {
  return FINANCE_GLOWS.map(
    ({ rgb, alpha, at }) =>
      `radial-gradient(${at}, rgb(${rgb.join(" ")} / ${alpha}), transparent 70%)`,
  ).join(", ");
}

/** Glas für Chips und die Tabelle: Nacht mit der Deckkraft der Vereins-Bühne, beim Darüberfahren dunkler. */
export const FINANCE_GLASS = `rgb(6 10 22 / ${HERO_GLASS_ALPHA.text})`;
export const FINANCE_GLASS_HOVER = `rgb(6 10 22 / ${HERO_GLASS_ALPHA.hover})`;

/** Deckkraft der weißen Schrift: Beschriftungen und Cent etwas zurückgenommen, Achse am leisesten. */
export const FINANCE_TEXT_ALPHA = { label: 0.85, chip: 0.9, axis: 0.8 } as const;

/**
 * Farben der Beträge auf der Nacht (Tailwind-Stufe 300 – auf dem dunklen Grund hell genug, hell wie dunkel gleich): rein grün,
 * raus rosé, Rechnungen bernstein. Als Klassen, damit Tailwind sie findet; der Unit-Test liest die Farbnamen daraus.
 */
export const FINANCE_TONE = {
  up: "text-emerald-300",
  down: "text-rose-300",
  invoice: "text-amber-300",
} as const;
