/**
 * Farben der Diagramme (Tokens `--chart-1…6`, `--chart-neutral` in `globals.css`).
 *
 * Kategorien behalten ihre Farbe (die Farbe hängt an der Kategorie, nicht am Rang) – und die Farbe passt zur Bedeutung
 * wie bei den Statusabzeichen: Grün für Gutes oder Erledigtes, Rot-Orange für Probleme, Grau für Beendetes oder
 * „Sonstiges“, Blau, Gelb und Rosa für neutrale Kategorien. Platz 0 ist das neutrale Grau.
 */
export const slotColor = (slot: number): string =>
  slot <= 0 ? "var(--chart-neutral)" : `var(--chart-${Math.min(slot, 6)})`;

/** Farbe der n-ten Reihe eines Verlaufs (0-basiert): feste Reihenfolge der Palette, nie zyklisch. */
export const seriesColor = (index: number): string => `var(--chart-${Math.min(index, 5) + 1})`;
