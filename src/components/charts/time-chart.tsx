"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { seriesColor } from "@/lib/charts/colors";
import {
  areaPath,
  formatNumber,
  formatWithUnit,
  labelStride,
  linePath,
  linearScale,
  nearestIndex,
  niceScale,
} from "@/lib/charts/geometry";
import type { BucketLabel, ChartUnit, SeriesInfo, TimeChartType } from "@/lib/charts/types";
import { cn } from "@/lib/utils";
import { ChartTooltip } from "./chart-tooltip";
import { useElementWidth } from "./use-element-width";

const TYPE_LABEL: Record<TimeChartType, string> = {
  bar: "Balkendiagramm",
  line: "Liniendiagramm",
  area: "Flächendiagramm",
};

const MARGIN = { top: 26, right: 14 };
/** Unterer Rand: eine Zeile Beschriftung (Wochen, Jahre) oder zwei (Monat/Quartal und darunter das Jahr). */
const BOTTOM = { oneLine: 30, twoLines: 46 };
/**
 * Balken: bei einer Reihe höchstens 40 px breit (sonst wirken wenige Werte verloren), bei mehreren je 24 px; der Rest der
 * Spalte bleibt Luft. Lücke zwischen zwei Balken einer Gruppe: 2 px.
 */
const BAR_MAX = { single: 40, multi: 24 };
const BAR_GAP = 2;
/** Bis zu so vielen Balken mit Wert steht jeder Wert direkt am Balken – darüber nur der aktuelle und der höchste. */
const LABEL_ALL_UP_TO = 8;

const colorOf = seriesColor;
/** Monate („Sep 26“) und Quartale („Q3 26“): oben Monat bzw. Quartal, darunter das Jahr – nur dort, wo es wechselt. */
const TWO_LINE_KEY = /^\d{4}-(\d{2}|Q\d)$/;

/** Oben abgerundeter Balken (Radius 4 px), unten bündig auf der Grundlinie. */
function barPath(x: number, width: number, top: number, baseline: number): string {
  const r = Math.min(4, width / 2, baseline - top);
  return (
    `M${x} ${baseline} V${top + r} Q${x} ${top} ${x + r} ${top} H${x + width - r} ` +
    `Q${x + width} ${top} ${x + width} ${top + r} V${baseline} Z`
  );
}

/**
 * Verlaufsdiagramm (Balken, Linie oder Fläche) über Zeiträume, in echter Pixelgröße gezeichnet.
 *
 * Bedienung: Am Zeiger sucht ein Fadenkreuz den nächsten Zeitraum (man muss keinen Punkt treffen), der Tooltip nennt alle
 * Werte. Mit der Tastatur geht man mit den Pfeiltasten (Pos1/Ende springen) durch die Zeiträume – dasselbe wird
 * Screenreadern angesagt. Das Diagramm selbst ist für Screenreader ausgeblendet; seine Zusammenfassung steht im Namen der
 * Gruppe, und die Tabellenansicht (im Panel) liefert alle Werte.
 */
export function TimeChart({
  type,
  title,
  rangeLabel,
  buckets,
  series,
  values,
  unit,
}: {
  type: TimeChartType;
  title: string;
  rangeLabel: string;
  buckets: BucketLabel[];
  series: SeriesInfo[];
  /** values[Reihe][Zeitraum] */
  values: number[][];
  unit: ChartUnit;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const hatchId = (seriesIndex: number) => `${uid}-laufend-${seriesIndex}`;

  const count = buckets.length;
  const twoLines = count > 0 && buckets.every((bucket) => TWO_LINE_KEY.test(bucket.key));
  const mainLabel = (bucket: BucketLabel) =>
    twoLines ? (bucket.label.split(" ")[0] ?? bucket.label) : bucket.label;
  const yearOf = (bucket: BucketLabel) => bucket.key.slice(0, 4);
  const marginBottom = twoLines ? BOTTOM.twoLines : BOTTOM.oneLine;
  const height = width < 520 ? 240 : 300;
  const max = Math.max(0, ...values.flat());
  const scale = niceScale(max, 4, unit.decimals === 0);
  // So viele Nachkommastellen, wie die Teilstriche brauchen (0,25 darf nicht als „0,3“ erscheinen).
  const tickDecimals =
    [0, 1, 2].find((d) => scale.ticks.every((t) => Math.abs(t - Number(t.toFixed(d))) < 1e-9)) ?? 2;
  const tickText = scale.ticks.map((tick) => formatNumber(tick, tickDecimals));
  const left = Math.max(...tickText.map((text) => text.length)) * 7.6 + 16;
  const plotWidth = Math.max(0, width - left - MARGIN.right);
  const baseline = height - marginBottom;
  const y = linearScale([0, scale.max], [baseline, MARGIN.top]);
  const band = count > 0 ? plotWidth / count : 0;
  const centers = buckets.map((_, index) => left + band * (index + 0.5));
  const stride = labelStride(
    count,
    plotWidth,
    Math.max(...buckets.map((bucket) => mainLabel(bucket).length)) * 7 + 12,
  );
  const single = series.length === 1;
  // Welche Zeiträume eine Beschriftung tragen (der laufende immer) – und wo darunter das Jahr steht.
  const labelled = buckets.map((_, index) => (count - 1 - index) % stride === 0);
  const showYear = buckets.map((bucket, index) => {
    if (!twoLines || !labelled[index]) return false;
    const previous = buckets.findLast((_, before) => before < index && labelled[before]);
    return !previous || yearOf(previous) !== yearOf(bucket);
  });

  // Direkte Werte (nur bei einer Reihe): bei wenigen Balken jeder Wert, sonst der aktuelle und der höchste.
  const directLabels = new Set<number>();
  if (single && count > 0) {
    const row = values[0]!;
    const filled = row.flatMap((value, index) => (value > 0 ? [index] : []));
    if (type === "bar" && filled.length <= LABEL_ALL_UP_TO && band >= 22) {
      filled.forEach((index) => directLabels.add(index));
    } else {
      directLabels.add(count - 1);
      const peak = row.indexOf(Math.max(...row));
      if (row[peak]! > 0) directLabels.add(peak);
    }
  }

  // Zusammenfassung für Screenreader: Art, Thema, Zeitraum und der Höchstwert.
  let peakSeries = 0;
  let peakIndex = 0;
  values.forEach((row, seriesIndex) =>
    row.forEach((value, index) => {
      if (value > (values[peakSeries]?.[peakIndex] ?? 0)) {
        peakSeries = seriesIndex;
        peakIndex = index;
      }
    }),
  );
  const summary =
    `${TYPE_LABEL[type]}: ${title}, ${rangeLabel}. ` +
    `${buckets[0]?.fullLabel ?? ""} bis ${buckets[count - 1]?.fullLabel ?? ""}. ` +
    (max > 0
      ? `Höchster Wert: ${formatWithUnit(values[peakSeries]?.[peakIndex] ?? 0, unit)} (${buckets[peakIndex]?.fullLabel}). `
      : "Alle Werte sind 0. ");

  const describe = (index: number) => {
    const bucket = buckets[index]!;
    const parts = series.map(
      (s, seriesIndex) =>
        `${single ? "" : `${s.label}: `}${formatWithUnit(values[seriesIndex]![index]!, unit)}`,
    );
    return `${bucket.fullLabel}${bucket.partial ? " (laufend)" : ""}: ${parts.join(", ")}`;
  };

  function pick(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setActive(nearestIndex(event.clientX - rect.left, centers));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = count - 1;
    switch (event.key) {
      case "ArrowRight":
        setActive(active === null ? last : Math.min(last, active + 1));
        break;
      case "ArrowLeft":
        setActive(active === null ? last : Math.max(0, active - 1));
        break;
      case "Home":
        setActive(0);
        break;
      case "End":
        setActive(last);
        break;
      case "Escape":
        setActive(null);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  const activeBucket = active !== null ? buckets[active] : undefined;

  return (
    <div
      ref={ref}
      role="group"
      aria-roledescription="Diagramm"
      aria-label={`${summary}Mit den Pfeiltasten gehst du die Werte einzeln durch.`}
      tabIndex={0}
      data-no-swipe // Wischen über dem Diagramm wählt Werte – es blättert nicht durch die Dashboard-Bereiche
      onKeyDown={onKeyDown}
      onBlur={() => setActive(null)}
      className="relative w-full rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      style={{ height }}
    >
      {width > 0 && (
        <svg
          width={width}
          height={height}
          aria-hidden="true"
          onPointerMove={pick}
          onPointerDown={pick}
          onPointerLeave={() => setActive(null)}
          className="touch-pan-y select-none"
        >
          {/* Bei Balken hebt ein heller Streifen den gewählten Zeitraum hervor. */}
          {type === "bar" && active !== null && (
            <rect
              x={centers[active]! - band / 2}
              y={MARGIN.top}
              width={band}
              height={baseline - MARGIN.top}
              className="fill-muted"
              opacity={0.6}
            />
          )}

          {/* Raster und y-Achse: solide Haarlinien, zurückhaltend; die Grundlinie ist einen Tick kräftiger. */}
          {scale.ticks.map((tick, index) => (
            <g key={tick}>
              <line
                x1={left}
                x2={width - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
                stroke={tick === 0 ? "var(--chart-axis)" : "var(--chart-grid)"}
                strokeWidth={1}
              />
              <text
                x={left - 8}
                y={y(tick)}
                dy="0.32em"
                textAnchor="end"
                className="fill-muted-foreground text-xs tabular-nums"
              >
                {tickText[index]}
              </text>
            </g>
          ))}

          {/* Schraffur für den laufenden Zeitraum: kräftige Streifen in der Reihenfarbe – „noch nicht fertig“, aber nicht blass. */}
          <defs>
            {series.map((_, seriesIndex) => (
              <pattern
                key={seriesIndex}
                id={hatchId(seriesIndex)}
                width={6}
                height={6}
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width={6} height={6} fill={colorOf(seriesIndex)} fillOpacity={0.3} />
                <rect width={2.5} height={6} fill={colorOf(seriesIndex)} />
              </pattern>
            ))}
          </defs>

          {/* x-Achse: so viele Beschriftungen, wie nebeneinander passen; der laufende Zeitraum ist immer beschriftet. Bei
              Monaten und Quartalen steht das Jahr in einer zweiten Zeile – nur am Anfang und dort, wo es wechselt. */}
          {buckets.map((bucket, index) =>
            labelled[index] ? (
              <g key={bucket.key}>
                <text
                  x={centers[index]}
                  y={baseline + 18}
                  textAnchor="middle"
                  className={cn(
                    "text-xs",
                    index === active ? "fill-foreground font-semibold" : "fill-muted-foreground",
                  )}
                >
                  {mainLabel(bucket)}
                </text>
                {showYear[index] && (
                  <text
                    x={centers[index]}
                    y={baseline + 35}
                    textAnchor="middle"
                    className="fill-muted-foreground text-xs tabular-nums"
                  >
                    {yearOf(bucket)}
                  </text>
                )}
              </g>
            ) : null,
          )}

          {/* Balken: oben 4 px gerundet, unten bündig. Der laufende Zeitraum ist schraffiert mit kräftigem Rand; eine gemessene
              0 ist ein flacher Strich auf der Grundlinie (sonst sähe „0“ aus wie „keine Daten“). */}
          {type === "bar" &&
            series.map((_, seriesIndex) => {
              const barMax = single ? BAR_MAX.single : BAR_MAX.multi;
              const group = Math.min(
                barMax * series.length + BAR_GAP * (series.length - 1),
                band * 0.7,
              );
              const barWidth = Math.max(2, (group - BAR_GAP * (series.length - 1)) / series.length);
              return values[seriesIndex]!.map((value, index) => {
                const x = centers[index]! - group / 2 + seriesIndex * (barWidth + BAR_GAP);
                const key = `${seriesIndex}-${buckets[index]!.key}`;
                if (value <= 0) {
                  return (
                    <rect
                      key={key}
                      x={x}
                      y={baseline - 2}
                      width={barWidth}
                      height={2}
                      rx={1}
                      fill={colorOf(seriesIndex)}
                      opacity={0.3}
                    />
                  );
                }
                const partial = buckets[index]!.partial;
                return (
                  <path
                    key={key}
                    d={barPath(x, barWidth, y(value), baseline)}
                    fill={partial ? `url(#${hatchId(seriesIndex)})` : colorOf(seriesIndex)}
                    stroke={partial ? colorOf(seriesIndex) : undefined}
                    strokeWidth={partial ? 1.25 : undefined}
                  />
                );
              });
            })}

          {/* Linie und Fläche: 2 px, runde Enden; die Fläche ist nur ein zarter Schleier (12 %) der Reihenfarbe. */}
          {type !== "bar" &&
            series.map((_, seriesIndex) => {
              const points = values[seriesIndex]!.map(
                (value, index) => [centers[index]!, y(value)] as const,
              );
              // Der Weg zum laufenden Zeitraum ist gestrichelt – sein Wert kann sich noch ändern.
              const partialEnd = count >= 2 && buckets[count - 1]!.partial;
              const solid = partialEnd ? points.slice(0, -1) : points;
              return (
                <g key={seriesIndex}>
                  {type === "area" && (
                    <path
                      d={areaPath(points, baseline)}
                      fill={colorOf(seriesIndex)}
                      fillOpacity={0.12}
                    />
                  )}
                  <path
                    d={linePath(solid)}
                    fill="none"
                    stroke={colorOf(seriesIndex)}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {partialEnd && (
                    <path
                      d={linePath(points.slice(-2))}
                      fill="none"
                      stroke={colorOf(seriesIndex)}
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      strokeLinecap="round"
                    />
                  )}
                </g>
              );
            })}

          {/* Fadenkreuz am gewählten Zeitraum (Linie/Fläche). */}
          {type !== "bar" && active !== null && (
            <line
              x1={centers[active]}
              x2={centers[active]}
              y1={MARGIN.top}
              y2={baseline}
              stroke="var(--chart-axis)"
              strokeWidth={1}
            />
          )}

          {/* Punkte (Ø 8 px) mit 2 px Ring in der Kartenfarbe; der laufende Zeitraum ist hohl, der gewählte größer. */}
          {type !== "bar" &&
            series.map((_, seriesIndex) =>
              values[seriesIndex]!.map((value, index) => {
                const partial = buckets[index]!.partial;
                return (
                  <circle
                    key={`${seriesIndex}-${buckets[index]!.key}`}
                    cx={centers[index]}
                    cy={y(value)}
                    r={index === active ? 5.5 : 4}
                    fill={partial ? "var(--card)" : colorOf(seriesIndex)}
                    stroke={partial ? colorOf(seriesIndex) : "var(--card)"}
                    strokeWidth={2}
                  />
                );
              }),
            )}

          {/* Direkte Beschriftung (nur bei einer Reihe): siehe `directLabels`. */}
          {[...directLabels].map((index) => (
            <text
              key={`wert-${buckets[index]!.key}`}
              x={centers[index]}
              y={y(values[0]![index]!) - (type === "bar" ? 6 : 12)}
              textAnchor="middle"
              className="fill-foreground text-xs font-semibold tabular-nums"
            >
              {formatNumber(values[0]![index]!, unit.decimals)}
            </text>
          ))}
        </svg>
      )}

      {active !== null && activeBucket && (
        <ChartTooltip
          x={centers[active]!}
          y={8}
          containerWidth={width}
          title={activeBucket.fullLabel}
          note={activeBucket.partial ? "laufend, noch nicht abgeschlossen" : undefined}
          rows={series.map((s, seriesIndex) => ({
            color: colorOf(seriesIndex),
            label: single ? "" : s.label,
            value: single
              ? formatWithUnit(values[seriesIndex]![active]!, unit)
              : formatNumber(values[seriesIndex]![active]!, unit.decimals),
          }))}
        />
      )}

      <p className="sr-only" aria-live="polite">
        {active !== null ? describe(active) : ""}
      </p>
    </div>
  );
}
