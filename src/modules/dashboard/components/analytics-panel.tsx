"use client";

import { useState } from "react";
import {
  ChartAreaIcon,
  ChartBarIcon,
  ChartColumnIcon,
  ChartLineIcon,
  ChartNoAxesColumnIcon,
  ChartPieIcon,
  TableIcon,
} from "lucide-react";
import { DistributionTable, TimeTable } from "@/components/charts/chart-table";
import { DistributionChart } from "@/components/charts/distribution-chart";
import { TimeChart } from "@/components/charts/time-chart";
import { Button } from "@/components/ui/button";
import { SegmentedControl, type SegmentOption } from "@/components/ui/segmented-control";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber } from "@/lib/charts/geometry";
import { GRANULARITY_LABEL } from "@/lib/charts/labels";
import type {
  AnalyticsData,
  AnalyticsTopic,
  AnalyticsTopicId,
  ChartDataset,
  Granularity,
  TimeDataset,
  TimeSeriesView,
} from "@/lib/charts/types";

interface Choice {
  type?: string;
  granularity?: Granularity;
}

const icon = (Icon: typeof ChartLineIcon) => <Icon aria-hidden="true" />;

/** Auswahl der Darstellung; Balken sind bei Verläufen Säulen, bei Verteilungen liegende Balken. */
const TIME_TYPE: Record<string, SegmentOption<string>> = {
  bar: { value: "bar", label: "Balken", icon: icon(ChartColumnIcon) },
  line: { value: "line", label: "Linie", icon: icon(ChartLineIcon) },
  area: { value: "area", label: "Fläche", icon: icon(ChartAreaIcon) },
};
const DISTRIBUTION_TYPE: Record<string, SegmentOption<string>> = {
  donut: { value: "donut", label: "Donut", icon: icon(ChartPieIcon) },
  bar: { value: "bar", label: "Balken", icon: icon(ChartBarIcon) },
};

const RANGE_OPTIONS = (granularities: readonly Granularity[]): SegmentOption<Granularity>[] =>
  granularities.map((granularity) => ({
    value: granularity,
    label: GRANULARITY_LABEL[granularity],
  }));

/** Leerer Zustand: freundlich statt wie ein Fehler – „noch nichts zu zählen“ ist normal, besonders in einem neuen Verein. */
function ChartEmpty() {
  return (
    <div className="flex items-center gap-4 rounded-xl bg-muted/50 px-4 py-5">
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300 [&_svg]:size-5"
        aria-hidden="true"
      >
        <ChartNoAxesColumnIcon />
      </span>
      <div>
        <p className="text-base font-semibold">Noch keine Daten</p>
        <p className="text-sm text-muted-foreground">
          Für diese Auswahl gibt es noch nichts zu zeigen. Sobald Daten da sind, erscheint hier das
          Diagramm.
        </p>
      </div>
    </div>
  );
}

function Legend({ series }: { series: { id: string; label: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Legende">
      {series.map((s, index) => (
        <li key={s.id} className="flex items-center gap-2">
          <span
            className="size-3 rounded-[3px]"
            style={{ backgroundColor: `var(--chart-${Math.min(index, 5) + 1})` }}
            aria-hidden="true"
          />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Kennzahlen über einem Verlauf – das Wichtigste in Zahlen, bevor man das Diagramm liest. Mengen je Zeitraum
 * (Veranstaltungen, Stunden): Gesamt, höchster Wert, aktueller Zeitraum. Bestände (Mitglieder): aktuell, Veränderung im
 * gewählten Zeitraum, höchster Stand. Nur bei einer Reihe; die Zahlen stammen aus denselben Werten wie das Diagramm.
 */
function TimeSummary({ dataset, view }: { dataset: TimeDataset; view: TimeSeriesView }) {
  const row = view.values[0];
  if (dataset.series.length !== 1 || !row || row.length === 0) return null;
  const { unit } = dataset;
  const number = (value: number) => formatNumber(value, unit.decimals);
  const unitOf = (value: number) => (value === 1 ? unit.singular : unit.plural);
  const last = row[row.length - 1]!;
  const lastBucket = view.buckets[view.buckets.length - 1]!;
  const peak = row.indexOf(Math.max(...row));
  // „im Oktober 2026“, „im 3. Quartal 2026“, „in KW 38 (…)“, „im Jahr 2026“ – nicht „Okt 26“ (läse sich wie ein Datum).
  const inBucket = (index: number) => {
    const bucket = view.buckets[index]!;
    if (bucket.key.includes("-W")) return `in ${bucket.fullLabel}`;
    if (/^\d{4}$/.test(bucket.key)) return `im Jahr ${bucket.fullLabel}`;
    return `im ${bucket.fullLabel}`;
  };
  const peakItem = (label: string) => ({
    label,
    value: number(row[peak]!),
    detail: inBucket(peak),
  });
  const items: { label: string; value: string; detail?: string }[] =
    dataset.aggregate === "sum"
      ? (() => {
          const total = row.reduce((sum, value) => sum + value, 0);
          return [
            { label: "Gesamt", value: number(total), detail: unitOf(total) },
            peakItem("Höchster Wert"),
            {
              label: lastBucket.partial ? "Laufend" : "Zuletzt",
              value: number(last),
              detail: unitOf(last),
            },
          ];
        })()
      : [
          { label: "Aktuell", value: number(last), detail: unitOf(last) },
          {
            label: "Veränderung",
            value: (() => {
              const change = last - row[0]!;
              const text = number(Math.abs(change));
              return change > 0 ? `+${text}` : change < 0 ? `−${text}` : "±0";
            })(),
            // Gemessen vom Stand am Ende des ersten Zeitraums bis jetzt – so steht es auch da.
            detail: `seit Ende ${view.buckets[0]!.fullLabel}`,
          },
          peakItem("Höchster Stand"),
        ];
  return (
    // Am Handy als Liste (Bezeichnung links, Zahl rechts), ab 640 px nebeneinander mit der Zahl unter der Bezeichnung.
    <dl className="grid gap-1.5 sm:flex sm:flex-wrap sm:gap-x-10 sm:gap-y-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5 last:border-0 sm:grid sm:content-start sm:justify-start sm:gap-0.5 sm:border-0 sm:pb-0"
        >
          <dt className="text-sm text-muted-foreground">{item.label}</dt>
          <dd className="flex flex-wrap items-baseline justify-end gap-x-1.5 sm:justify-start">
            <span className="text-xl leading-tight font-bold tabular-nums sm:text-2xl">
              {item.value}
            </span>
            {item.detail && <span className="text-sm text-muted-foreground">{item.detail}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function DatasetView({
  dataset,
  choice,
  table,
}: {
  dataset: ChartDataset;
  choice: Choice;
  table: boolean;
}) {
  const type =
    choice.type && (dataset.types as string[]).includes(choice.type)
      ? choice.type
      : dataset.defaultType;
  const granularities = dataset.granularities;
  const granularity: Granularity | undefined =
    granularities && granularities.length > 0
      ? choice.granularity && granularities.includes(choice.granularity)
        ? choice.granularity
        : (dataset.defaultGranularity ?? granularities[0])
      : undefined;
  const rangeLabel = granularity ? `Letzte ${GRANULARITY_LABEL[granularity]}` : "Aktueller Stand";

  if (dataset.kind === "time") {
    const view = granularity ? dataset.views[granularity] : undefined;
    if (!view || view.values.every((row) => row.every((value) => value === 0))) {
      return <ChartEmpty />;
    }
    if (table) {
      return (
        <TimeTable
          caption={`${dataset.title}, ${rangeLabel}`}
          buckets={view.buckets}
          series={dataset.series}
          values={view.values}
          unit={dataset.unit}
        />
      );
    }
    return (
      <div className="grid gap-4">
        <TimeSummary dataset={dataset} view={view} />
        {dataset.series.length > 1 && <Legend series={dataset.series} />}
        <TimeChart
          type={type as "bar" | "line" | "area"}
          title={dataset.title}
          rangeLabel={rangeLabel}
          buckets={view.buckets}
          series={dataset.series}
          values={view.values}
          unit={dataset.unit}
        />
      </div>
    );
  }

  const slices = dataset.views[granularity ?? "ALL"] ?? [];
  if (slices.length === 0) return <ChartEmpty />;
  return table ? (
    <DistributionTable
      caption={`${dataset.title}, ${rangeLabel}`}
      slices={slices}
      unit={dataset.unit}
    />
  ) : (
    <DistributionChart
      type={type as "donut" | "bar"}
      title={dataset.title}
      slices={slices}
      unit={dataset.unit}
    />
  );
}

function TopicView({
  topic,
  datasetId,
  onDataset,
  choices,
  onChoice,
  table,
  onTable,
}: {
  topic: AnalyticsTopic;
  datasetId: string | undefined;
  onDataset: (id: string) => void;
  choices: Record<string, Choice>;
  onChoice: (datasetId: string, choice: Choice) => void;
  table: boolean;
  onTable: (value: boolean) => void;
}) {
  const dataset = topic.datasets.find((d) => d.id === datasetId) ?? topic.datasets[0]!;
  const choice = choices[dataset.id] ?? {};
  const typeOptions = dataset.types.map(
    (t) => (dataset.kind === "time" ? TIME_TYPE : DISTRIBUTION_TYPE)[t]!,
  );
  const activeType =
    choice.type && (dataset.types as string[]).includes(choice.type)
      ? choice.type
      : dataset.defaultType;
  const granularities = dataset.granularities;
  const activeGranularity =
    choice.granularity && granularities?.includes(choice.granularity)
      ? choice.granularity
      : (dataset.defaultGranularity ?? granularities?.[0]);

  return (
    <div className="grid gap-5">
      {/* Alle Auswahlen in EINER Zeile über dem Diagramm; sie gelten für alles darunter. Links, WAS gezeigt wird (Ansicht,
          Diagrammtyp), dann der Zeitraum. Auf dem Handy jede Auswahl über die volle Breite. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {topic.datasets.length > 1 && (
          <SegmentedControl
            label="Ansicht"
            value={dataset.id}
            onValueChange={onDataset}
            options={topic.datasets.map((d) => ({ value: d.id, label: d.shortTitle }))}
            stretch
          />
        )}
        {typeOptions.length > 1 && (
          <SegmentedControl
            label="Diagrammtyp"
            value={activeType}
            onValueChange={(type) => onChoice(dataset.id, { ...choice, type })}
            options={typeOptions}
            stretch
          />
        )}
        {granularities && granularities.length > 1 && activeGranularity && (
          <SegmentedControl
            label="Zeitraum"
            value={activeGranularity}
            onValueChange={(next) => onChoice(dataset.id, { ...choice, granularity: next })}
            options={RANGE_OPTIONS(granularities)}
            stretch
          />
        )}
      </div>

      {/* Kopf des Diagramms: Titel links, die Umschaltung Diagramm ↔ Tabelle rechts (keine Auswahl, sondern eine Ansicht);
          die Beschreibung darunter über die volle Breite. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1">
        <h3 className="text-lg font-semibold">{dataset.title}</h3>
        <Button
          variant="ghost"
          size="sm"
          className="-mt-1 shrink-0"
          aria-pressed={table}
          onClick={() => onTable(!table)}
        >
          <TableIcon aria-hidden="true" /> Als Tabelle
        </Button>
        <p className="col-span-2 text-sm text-muted-foreground">
          {dataset.description}
          {activeGranularity && ` · Letzte ${GRANULARITY_LABEL[activeGranularity]}`}
        </p>
      </div>

      <DatasetView dataset={dataset} choice={choice} table={table} />

      {dataset.note && <p className="text-sm text-muted-foreground">{dataset.note}</p>}
    </div>
  );
}

/**
 * Themen als Reiter, darunter Ansicht, Diagrammtyp und Zeitraum wählbar. Nur das gewählte Diagramm wird gezeichnet – das hält
 * die Seite ruhig. Auswahlen bleiben je Diagramm erhalten, solange die Seite offen ist.
 */
export function AnalyticsPanel({ data }: { data: AnalyticsData }) {
  const [topicId, setTopicId] = useState<AnalyticsTopicId>(data.topics[0]!.id);
  const [datasetByTopic, setDatasetByTopic] = useState<Partial<Record<AnalyticsTopicId, string>>>(
    {},
  );
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [table, setTable] = useState(false);

  // Gehört nur ein Thema zu diesem Dashboard-Reiter, braucht es keinen inneren Reiter – dann nur die Auswahl darunter.
  if (data.topics.length === 1) {
    const topic = data.topics[0]!;
    return (
      <TopicView
        topic={topic}
        datasetId={datasetByTopic[topic.id]}
        onDataset={(id) => setDatasetByTopic((current) => ({ ...current, [topic.id]: id }))}
        choices={choices}
        onChoice={(id, choice) => setChoices((current) => ({ ...current, [id]: choice }))}
        table={table}
        onTable={setTable}
      />
    );
  }

  return (
    <Tabs value={topicId} onValueChange={(value) => setTopicId(value as AnalyticsTopicId)}>
      {/* Themen als Reiter mit Unterstrich – sichtbar etwas anderes als die Auswahl-Leisten darunter (die gelten nur für
          das gewählte Thema). */}
      <div className="border-b">
        <div className="-mx-1 overflow-x-auto overflow-y-hidden px-1 pt-1">
          <TabsList variant="line" aria-label="Thema der Auswertung" className="w-max gap-5 p-0">
            {data.topics.map((topic) => (
              <TabsTrigger
                key={topic.id}
                value={topic.id}
                // Strich innerhalb des Reiters (sonst schneidet die waagerecht scrollende Leiste ihn ab)
                className="flex-none px-0.5 pb-2 text-base group-data-horizontal/tabs:after:bottom-0 data-active:font-semibold data-active:text-foreground"
              >
                {topic.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
      </div>
      {data.topics.map((topic) => (
        <TabsContent key={topic.id} value={topic.id} className="mt-4 text-base">
          <TopicView
            topic={topic}
            datasetId={datasetByTopic[topic.id]}
            onDataset={(id) => setDatasetByTopic((current) => ({ ...current, [topic.id]: id }))}
            choices={choices}
            onChoice={(id, choice) => setChoices((current) => ({ ...current, [id]: choice }))}
            table={table}
            onTable={setTable}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
