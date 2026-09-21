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
import { GRANULARITY_LABEL } from "@/lib/charts/labels";
import type {
  AnalyticsData,
  AnalyticsTopic,
  AnalyticsTopicId,
  ChartDataset,
  Granularity,
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
      <div className="grid gap-3">
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
      {/* Alle Auswahlen in EINER Zeile über dem Diagramm; sie gelten für alles darunter. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {topic.datasets.length > 1 && (
          <SegmentedControl
            label="Ansicht"
            value={dataset.id}
            onValueChange={onDataset}
            options={topic.datasets.map((d) => ({ value: d.id, label: d.shortTitle }))}
          />
        )}
        {typeOptions.length > 1 && (
          <SegmentedControl
            label="Diagrammtyp"
            value={activeType}
            onValueChange={(type) => onChoice(dataset.id, { ...choice, type })}
            options={typeOptions}
          />
        )}
        {granularities && granularities.length > 1 && activeGranularity && (
          <SegmentedControl
            label="Zeitraum"
            value={activeGranularity}
            onValueChange={(next) => onChoice(dataset.id, { ...choice, granularity: next })}
            options={RANGE_OPTIONS(granularities)}
          />
        )}
      </div>

      {/* Kopf des Diagramms: Titel und Zeitraum links, die Umschaltung Diagramm ↔ Tabelle rechts (keine Auswahl, sondern eine Ansicht). */}
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <h3 className="text-base font-semibold">{dataset.title}</h3>
          <p className="text-sm text-muted-foreground">
            {dataset.description}
            {activeGranularity && ` · Letzte ${GRANULARITY_LABEL[activeGranularity]}`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          aria-pressed={table}
          onClick={() => onTable(!table)}
        >
          <TableIcon aria-hidden="true" /> Als Tabelle
        </Button>
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
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <TabsList aria-label="Thema der Auswertung" className="w-max">
          {data.topics.map((topic) => (
            <TabsTrigger key={topic.id} value={topic.id} className="flex-none px-3">
              {topic.label}
            </TabsTrigger>
          ))}
        </TabsList>
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
