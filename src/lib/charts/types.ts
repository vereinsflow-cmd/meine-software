/**
 * Datenformate der Diagramme auf dem Dashboard. Reine Typen ohne Abhängigkeiten – der Server baut die Daten aus den
 * Vereinsdaten (`modules/dashboard/analytics.ts`), die Oberfläche (`components/charts`) zeigt sie an. Alles ist einfaches
 * JSON und geht deshalb unverändert vom Server zum Browser.
 */

/** Zeiträume: Wochen, Monate, Quartale oder Jahre (jeweils die letzten N inklusive des laufenden). */
export type Granularity = "W" | "M" | "Q" | "Y";

/** Beschriftung einer Größe: "1 Mitglied", "12 Mitglieder", "4,5 Std.". */
export interface ChartUnit {
  singular: string;
  plural: string;
  /** Nachkommastellen bei der Anzeige. */
  decimals: number;
}

export interface BucketLabel {
  key: string;
  /** Kurz für die Achse, z. B. "Sep 26" oder "KW 38". */
  label: string;
  /** Ausführlich für Tooltip und Tabelle, z. B. "September 2026". */
  fullLabel: string;
  /** Der laufende Zeitraum ist noch nicht abgeschlossen. */
  partial: boolean;
}

export type TimeChartType = "bar" | "line" | "area";
export type DistributionChartType = "donut" | "bar";

export interface SeriesInfo {
  id: string;
  label: string;
}

export interface TimeSeriesView {
  buckets: BucketLabel[];
  /** values[Reihe][Zeitraum] */
  values: number[][];
}

/** Verlauf über die Zeit (Linie, Fläche oder Balken). */
export interface TimeDataset {
  kind: "time";
  id: string;
  title: string;
  /** Kurz für die Ansichtsauswahl innerhalb eines Themas, z. B. „Entwicklung“. */
  shortTitle: string;
  description: string;
  unit: ChartUnit;
  series: SeriesInfo[];
  granularities: Granularity[];
  defaultGranularity: Granularity;
  views: Partial<Record<Granularity, TimeSeriesView>>;
  types: TimeChartType[];
  defaultType: TimeChartType;
  /** Hinweis unter dem Diagramm, z. B. was nicht gezählt wird. */
  note?: string;
}

export interface DistributionSlice {
  id: string;
  label: string;
  value: number;
  /** Feste Farbposition (1–6) dieser Kategorie: Die Farbe hängt an der Kategorie, nicht an ihrem Rang. */
  slot: number;
}

/** Verteilung auf Kategorien (Ring oder Balken). Optional auf einen Zeitraum bezogen. */
export interface DistributionDataset {
  kind: "distribution";
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  unit: ChartUnit;
  /** Ohne Angabe gilt die Verteilung „jetzt“ (Schlüssel `ALL`). */
  granularities?: Granularity[];
  defaultGranularity?: Granularity;
  views: Partial<Record<Granularity | "ALL", DistributionSlice[]>>;
  types: DistributionChartType[];
  defaultType: DistributionChartType;
  note?: string;
}

export type ChartDataset = TimeDataset | DistributionDataset;

export type AnalyticsTopicId = "members" | "events" | "hours" | "tasks";

export interface AnalyticsTopic {
  id: AnalyticsTopicId;
  label: string;
  datasets: ChartDataset[];
}

export interface AnalyticsData {
  topics: AnalyticsTopic[];
}
