/**
 * Anordnung der Kennzahlen des Dashboards im einfachen Raster (`KpiCarousel`) – für Rollen ohne Mitgliederzahlen und die Größe
 * „Klein“. Gemessen wird die Breite des Inhalts, nicht des Fensters (Containerabfragen `kpis`, Größen `--container-bento`/
 * `--container-bento-wide` in globals.css, in rem – sie wachsen mit der Grundschrift). Die große Fassung (Stil „Analytics“, seit
 * 17.10.2026) ordnet `StudioFrame` in `app/(app)/dashboard/page.tsx` an.
 */

/**
 * Kennzahlen „Klein“: ohne Grafiken, deshalb schon ab 49 rem alle in einer Reihe (darunter zwei Spalten).
 *
 * Stehen drei oder vier Karten in einer Reihe, teilen sie sich die Zeilen für Kopf, Zahl und Kurs (`kpi-row` in
 * globals.css): Die Zahlen stehen auf einer Höhe, auch wenn manche Beschriftungen umbrechen – egal, auf wie viele Zeilen.
 */
export const SMALL_COLUMNS = [
  "",
  "@bento/kpis:grid-cols-1",
  "@bento/kpis:grid-cols-2",
  "@bento/kpis:grid-cols-3 @bento/kpis:kpi-row",
  "@bento/kpis:grid-cols-4 @bento/kpis:kpi-row",
] as const;

/**
 * Einfaches Raster (Rollen ohne Mitgliederzahlen, oder wenn Karten fehlen): so viele Spalten wie Karten, keine leeren Plätze –
 * vier nebeneinander erst ab 58 rem, schmaler wären die Karten zu eng (darunter zwei Spalten). In einer Reihe wie bei „Klein“
 * mit gemeinsamen Zeilen (`kpi-row`).
 */
export const GRID_COLUMNS = [
  "",
  "@bento/kpis:grid-cols-1",
  "@bento/kpis:grid-cols-2",
  "@bento/kpis:grid-cols-3 @bento/kpis:kpi-row",
  "@bento-wide/kpis:grid-cols-4 @bento-wide/kpis:kpi-row",
] as const;
