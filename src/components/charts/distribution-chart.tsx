"use client";

import { useState } from "react";
import { donutAngles, donutSegmentPath, formatNumber, formatPercent } from "@/lib/charts/geometry";
import type { ChartUnit, DistributionChartType, DistributionSlice } from "@/lib/charts/types";
import { cn } from "@/lib/utils";

const SIZE = 208;
const CENTER = SIZE / 2;
const OUTER = 98;
const INNER = 70; // Das Loch muss auch ein langes Wort wie „Veranstaltungen“ aufnehmen

/** Die Farbe gehört zur Kategorie (feste Position 1–6), nicht zu ihrem Rang: Filtern lässt die übrigen Farben stehen. */
const colorOfSlot = (slot: number) => `var(--chart-${Math.min(Math.max(slot, 1), 6)})`;

/**
 * Verteilung auf Kategorien: als Ring (Anteile am Ganzen, höchstens sechs Teile) oder als Balken (Größen vergleichen).
 * Die Werte stehen immer sichtbar in der Legende bzw. am Balkenende – nichts hängt an der Farbe oder am Tooltip.
 * Beim Ring hebt Zeiger oder Tastaturfokus auf einem Legendeneintrag das Stück hervor und zeigt es in der Mitte.
 */
export function DistributionChart({
  type,
  title,
  slices,
  unit,
}: {
  type: DistributionChartType;
  title: string;
  slices: DistributionSlice[];
  unit: ChartUnit;
}) {
  const [active, setActive] = useState<number | null>(null);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const share = (value: number) => (total > 0 ? value / total : 0);

  const listing = slices
    .map(
      (slice) =>
        `${slice.label} ${formatNumber(slice.value)} (${formatPercent(share(slice.value))})`,
    )
    .join(", ");

  if (type === "bar") {
    const max = Math.max(1, ...slices.map((slice) => slice.value));
    return (
      <ul aria-label={`Balkendiagramm: ${title}. ${listing}.`} className="grid gap-2.5">
        {slices.map((slice) => {
          const ratio = slice.value / max;
          return (
            <li
              key={slice.id}
              className="grid grid-cols-[minmax(6rem,9rem)_minmax(0,1fr)] items-center gap-3"
            >
              <span className="truncate text-sm" title={slice.label}>
                {slice.label}
              </span>
              {/* Eine Reihe = eine Farbe (Position 1); die Länge zeigt die Größe. Der Wert steht am Balkenende. */}
              <div className="relative h-7">
                <div
                  className="absolute inset-y-1.5 left-0 rounded-r-[4px]"
                  style={{
                    width: `calc((100% - 6.5rem) * ${ratio})`,
                    minWidth: 3,
                    backgroundColor: "var(--chart-1)",
                  }}
                />
                <span
                  className="absolute top-0 flex h-7 items-center gap-2 text-sm whitespace-nowrap"
                  style={{ left: `calc((100% - 6.5rem) * ${ratio} + 0.5rem)` }}
                >
                  <span className="font-semibold tabular-nums">
                    {formatNumber(slice.value, unit.decimals)}
                  </span>
                  <span className="text-muted-foreground tabular-nums">
                    {formatPercent(share(slice.value))}
                  </span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  const angles = donutAngles(slices.map((slice) => slice.value));
  const activeSlice = active !== null ? slices[active] : undefined;

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-10">
      <div
        role="group"
        aria-roledescription="Diagramm"
        aria-label={`Ringdiagramm: ${title}. ${listing}. Gesamt: ${formatNumber(total)}.`}
        className="relative shrink-0"
        style={{ width: SIZE, height: SIZE }}
      >
        <svg width={SIZE} height={SIZE} aria-hidden="true">
          {slices.map((slice, index) => {
            const angle = angles[index]!;
            const lifted = index === active;
            return (
              <path
                key={slice.id}
                d={donutSegmentPath(
                  CENTER,
                  CENTER,
                  lifted ? OUTER + 4 : OUTER,
                  INNER,
                  angle.from,
                  angle.to,
                )}
                fill={colorOfSlot(slice.slot)}
                opacity={active !== null && !lifted ? 0.4 : 1}
                onPointerEnter={() => setActive(index)}
                onPointerLeave={() => setActive(null)}
                className="transition-opacity motion-reduce:transition-none"
              />
            );
          })}
        </svg>
        {/* Große Zahl mit proportionalen Ziffern; ohne Auswahl die Summe, sonst das gewählte Stück. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-3xl leading-none font-bold">
            {formatNumber(activeSlice ? activeSlice.value : total, unit.decimals)}
          </span>
          <span className="mt-1.5 max-w-[8.5rem] truncate text-sm text-muted-foreground">
            {activeSlice ? activeSlice.label : total === 1 ? unit.singular : unit.plural}
          </span>
        </div>
      </div>

      <ul className="grid w-full gap-1 sm:flex-1" aria-label={`Legende: ${title}`}>
        {slices.map((slice, index) => (
          <li
            key={slice.id}
            tabIndex={0}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
            onPointerEnter={() => setActive(index)}
            onPointerLeave={() => setActive(null)}
            className={cn(
              "flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
              index === active && "bg-muted",
            )}
          >
            <span
              className="size-3 shrink-0 rounded-[3px]"
              style={{ backgroundColor: colorOfSlot(slice.slot) }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate">{slice.label}</span>
            <span className="font-semibold tabular-nums">
              {formatNumber(slice.value, unit.decimals)}
            </span>
            <span className="w-12 text-right text-sm text-muted-foreground tabular-nums">
              {formatPercent(share(slice.value))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
