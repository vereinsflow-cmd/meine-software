/**
 * Anordnung der Kennzahlen des Dashboards – gemeinsam für `KpiCarousel` und den Ladezustand (`app/(app)/dashboard/loading.tsx`),
 * damit Gerüst und fertige Seite nicht auseinanderlaufen. Gemessen wird die Breite des Inhalts, nicht des Fensters
 * (Containerabfragen `kpis`, Größen `--container-bento`/`--container-bento-wide` in globals.css, in rem – sie wachsen mit der
 * Grundschrift).
 *
 * Kachelraster (seit 02.10.2026, wie im Entwurf 2; nur mit genau den vier Karten Mitglieder, Termine, Freie Helferplätze,
 * Helferstunden), 12 Spalten und zwei gleich hohe Reihen (`1fr`: so hoch wie die höchste Karte):
 *  - ab 49 rem (bei 1280 px Fenster mit Seitenleiste erreicht) drei gleich breite Spalten – links die Mitglieder über beide
 *    Reihen, in der Mitte Termine über Helferstunden, rechts die freien Helferplätze über beide Reihen;
 *  - ab 58 rem (z. B. 1470 px Fenster) wie im Entwurf: Mitglieder breiter (5/12), die Mitte 4/12, die freien Plätze 3/12.
 *    Schmaler wäre die hohe Ring-Kachel zu eng für Beschriftung und Aufschlüsselung.
 * Die Reihenfolge im Code (und damit für Tastatur und Screenreader) bleibt die der Karten. Die Reihen sind bei „Groß“ höher
 * als beim Standard „Mittel“; „Klein“ hat kein Kachelraster (eine schmale Reihe, siehe `SMALL_COLUMNS`).
 */
export const BENTO_GRID = {
  m: "@bento/kpis:grid-cols-12 @bento/kpis:grid-rows-[repeat(2,minmax(10.5rem,1fr))]",
  l: "@bento/kpis:grid-cols-12 @bento/kpis:grid-rows-[repeat(2,minmax(12.5rem,1fr))]",
} as const;

export const BENTO_CELL = [
  "@bento/kpis:col-span-4 @bento/kpis:row-span-2 @bento-wide/kpis:col-span-5",
  "@bento/kpis:col-span-4 @bento/kpis:col-start-5 @bento/kpis:row-start-1 @bento-wide/kpis:col-start-6",
  "@bento/kpis:col-span-4 @bento/kpis:col-start-9 @bento/kpis:row-span-2 @bento/kpis:row-start-1 @bento-wide/kpis:col-span-3 @bento-wide/kpis:col-start-10",
  "@bento/kpis:col-span-4 @bento/kpis:col-start-5 @bento/kpis:row-start-2 @bento-wide/kpis:col-start-6",
] as const;

/**
 * Einfaches Raster (Rollen ohne Mitgliederzahlen, oder wenn Karten fehlen): so viele Spalten wie Karten, keine leeren Plätze –
 * vier nebeneinander erst ab 58 rem, schmaler wären die Karten zu eng (darunter zwei Spalten). Stehen drei oder vier in einer
 * Reihe, bekommt jede Beschriftung Platz für zwei Zeilen, damit die Zahlen auf einer Höhe stehen, auch wenn nur manche
 * Beschriftungen umbrechen.
 */
/**
 * Kennzahlen „Klein“: ohne Grafiken, deshalb schon ab 49 rem alle in einer Reihe (darunter zwei Spalten); jede Beschriftung
 * hat zwei Zeilen Platz.
 */
export const SMALL_COLUMNS = [
  "",
  "@bento/kpis:grid-cols-1",
  "@bento/kpis:grid-cols-2",
  "@bento/kpis:grid-cols-3 @bento/kpis:[&_[data-slot=kpi-label]]:min-h-[calc(2lh+0.25rem)]",
  "@bento/kpis:grid-cols-4 @bento/kpis:[&_[data-slot=kpi-label]]:min-h-[calc(2lh+0.25rem)]",
] as const;

export const GRID_COLUMNS = [
  "",
  "@bento/kpis:grid-cols-1",
  "@bento/kpis:grid-cols-2",
  "@bento/kpis:grid-cols-3 @bento/kpis:[&_[data-slot=kpi-label]]:min-h-[calc(2lh+0.25rem)]",
  "@bento-wide/kpis:grid-cols-4 @bento-wide/kpis:[&_[data-slot=kpi-label]]:min-h-[calc(2lh+0.25rem)]",
] as const;
