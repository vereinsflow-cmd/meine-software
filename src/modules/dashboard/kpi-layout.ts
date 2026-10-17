/**
 * Anordnung der Kennzahlen des Dashboards – gemeinsam für `KpiCarousel` und den Ladezustand (`app/(app)/dashboard/loading.tsx`),
 * damit Gerüst und fertige Seite nicht auseinanderlaufen. Gemessen wird die Breite des Inhalts, nicht des Fensters
 * (Containerabfragen `kpis`, Größen `--container-bento`/`--container-bento-wide` in globals.css, in rem – sie wachsen mit der
 * Grundschrift).
 *
 * Kachelraster (seit 17.10.2026 Entwurf 4 „Kacheln, aber gefüllt“; nur mit Mitgliedern, Terminen, Freien Helferplätzen und
 * Helferstunden, dazu auf Wunsch „Offene Zahlungen“ als fünfte, weiße Kachel), 12 Spalten und zwei gleich hohe Reihen
 * (`1fr`: so hoch wie die höchste Karte). Keine Kachel bleibt halb leer:
 *  - links über beide Reihen die Mitglieder (Kurs und darunter die Aufteilung nach Status),
 *  - in der Mitte Termine über Helferstunden,
 *  - rechts als Stapel über beide Reihen die Freien Helferplätze (nur so hoch wie ihr Inhalt) und darunter die Offenen
 *    Zahlungen, die den Rest füllen (`BENTO_STACK`) – ohne geplante Schichten stünde die grüne Kachel sonst halb leer da;
 *  - ohne Zahlungen: Termine und Freie Helferplätze oben nebeneinander, die Helferstunden darunter über Mitte und rechts.
 * Mit Zahlungen ist die Reihenfolge der Karten deshalb Mitglieder, Termine, Helferstunden, Freie Helferplätze, Zahlungen
 * (Spalte für Spalte), ohne sie Mitglieder, Termine, Freie Helferplätze, Helferstunden (Zeile für Zeile).
 * Ab 49 rem (bei 1280 px Fenster mit Seitenleiste erreicht) drei gleich breite Spalten, ab 58 rem (z. B. 1470 px Fenster) die
 * Mitglieder breiter (5/12), die Mitte 4/12, rechts 3/12. Die Reihenfolge im Code (und damit für Tastatur und Screenreader)
 * bleibt die der Karten. Die Reihen sind bei „Groß“ höher als beim Standard „Mittel“; „Klein“ hat kein Kachelraster (eine
 * schmale Reihe, siehe `SMALL_COLUMNS`).
 */
export const BENTO_GRID = {
  m: "@bento/kpis:grid-cols-12 @bento/kpis:grid-rows-[repeat(2,minmax(10.5rem,1fr))]",
  l: "@bento/kpis:grid-cols-12 @bento/kpis:grid-rows-[repeat(2,minmax(12.5rem,1fr))]",
} as const;

const MEMBERS_CELL = "@bento/kpis:col-span-4 @bento/kpis:row-span-2 @bento-wide/kpis:col-span-5";
const MIDDLE_TOP =
  "@bento/kpis:col-span-4 @bento/kpis:col-start-5 @bento/kpis:row-start-1 @bento-wide/kpis:col-start-6";
const RIGHT_TOP =
  "@bento/kpis:col-span-4 @bento/kpis:col-start-9 @bento/kpis:row-start-1 @bento-wide/kpis:col-span-3 @bento-wide/kpis:col-start-10";
const MIDDLE_BOTTOM =
  "@bento/kpis:col-span-4 @bento/kpis:col-start-5 @bento/kpis:row-start-2 @bento-wide/kpis:col-start-6";
/** Rechte Spalte über beide Reihen; ihre Karten stehen darin untereinander, die letzte füllt den Rest. */
export const BENTO_STACK =
  "@bento/kpis:col-span-4 @bento/kpis:col-start-9 @bento/kpis:row-span-2 @bento/kpis:row-start-1 @bento/kpis:flex @bento/kpis:flex-col @bento/kpis:gap-5 @bento-wide/kpis:col-span-3 @bento-wide/kpis:col-start-10";
const WIDE_BOTTOM =
  "@bento/kpis:col-span-8 @bento/kpis:col-start-5 @bento/kpis:row-start-2 @bento-wide/kpis:col-span-7 @bento-wide/kpis:col-start-6";

/**
 * Zellen des Kachelrasters je Anzahl der Karten. Bei fünf Karten bilden die letzten beiden den Stapel rechts (`BENTO_STACK`,
 * eigene Zellen haben sie dann nicht – `""`).
 */
export const BENTO_CELLS = {
  4: [MEMBERS_CELL, MIDDLE_TOP, RIGHT_TOP, WIDE_BOTTOM],
  5: [MEMBERS_CELL, MIDDLE_TOP, MIDDLE_BOTTOM, "", ""],
} as const;

/** Wie viele Karten am Ende den Stapel rechts bilden (0 = kein Stapel). */
export const stackedCount = (count: number) => (count === 5 ? 2 : 0);

/** Zellen für eine Anzahl von Karten – `null`, wenn es dafür kein Kachelraster gibt. */
export function bentoCells(count: number): readonly string[] | null {
  return count === 4 || count === 5 ? BENTO_CELLS[count] : null;
}

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
