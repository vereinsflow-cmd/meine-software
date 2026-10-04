"use client";

import { useState } from "react";
import { TimeChart } from "@/components/charts/time-chart";
import { TimeTable } from "@/components/charts/chart-table";
import { Button } from "@/components/ui/button";
import type { BucketLabel } from "@/lib/charts/types";
import { MONTH_NAMES } from "@/lib/dates";

const UNIT = { singular: "€", plural: "€", decimals: 2 };
const SERIES = [
  { id: "einnahmen", label: "Einnahmen" },
  { id: "ausgaben", label: "Ausgaben" },
];

/**
 * Einnahmen und Ausgaben je Monat als Balken (zwei Farben) – mit Tabelle zum Umschalten, damit alle Werte auch ohne Grafik
 * lesbar sind. Beträge in Cent, angezeigt in Euro.
 */
export function MonthChart({
  year,
  months,
  legend = true,
}: {
  year: number;
  months: { incomeCents: number; expenseCents: number }[];
  /** Ohne eigene Legende, wenn die Summen darüber schon die Farben erklären. */
  legend?: boolean;
}) {
  const [table, setTable] = useState(false);
  const buckets: BucketLabel[] = months.map((_, index) => ({
    key: `${year}-${String(index + 1).padStart(2, "0")}`,
    label: MONTH_NAMES[index]!.slice(0, 3),
    fullLabel: `${MONTH_NAMES[index]} ${year}`,
    partial: index === months.length - 1,
  }));
  const values = [months.map((m) => m.incomeCents / 100), months.map((m) => m.expenseCents / 100)];
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {legend ? (
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Legende">
            {SERIES.map((series, index) => (
              <li key={series.id} className="flex items-center gap-2">
                <span
                  className="size-3 rounded-[3px]"
                  style={{ backgroundColor: `var(--chart-${index + 1})` }}
                  aria-hidden="true"
                />
                {series.label}
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}
        <Button variant="ghost" size="sm" onClick={() => setTable((value) => !value)}>
          {table ? "Als Diagramm" : "Als Tabelle"}
        </Button>
      </div>
      {table ? (
        <TimeTable
          caption={`Einnahmen und Ausgaben ${year} je Monat`}
          buckets={buckets}
          series={SERIES}
          values={values}
          unit={UNIT}
        />
      ) : (
        <TimeChart
          type="bar"
          title={`Einnahmen und Ausgaben ${year}`}
          rangeLabel={`Januar bis ${MONTH_NAMES[months.length - 1]} ${year}`}
          buckets={buckets}
          series={SERIES}
          values={values}
          unit={UNIT}
          heights={[220, 280]}
        />
      )}
    </div>
  );
}
