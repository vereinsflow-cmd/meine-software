"use client";

import { useState } from "react";
import { TimeTable } from "@/components/charts/chart-table";
import { TimeChart } from "@/components/charts/time-chart";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/charts/geometry";
import type { BucketLabel } from "@/lib/charts/types";
import { formatEuroFromCents, MONTH_NAMES } from "@/lib/dates";

const UNIT = { singular: "€", plural: "€", decimals: 2 };
const SERIES = [
  { id: "geld", label: "Geldspenden" },
  { id: "sach", label: "Sach- und Aufwandsspenden" },
];
/** Geld blau, Sach- und Aufwand grün – wie im Entwurf. */
const COLORS = ["var(--chart-1)", "var(--chart-3)"] as const;

/** Summe über dem Balken in ganzen Euro: „1.348 €“, am Handy ohne „€“. */
const totalLabel = (euros: number, narrow: boolean) =>
  `${formatNumber(Math.round(euros), 0)}${narrow ? "" : " €"}`;

/**
 * „Spenden je Monat“: Geld und Sach-/Aufwandsspenden übereinander gestapelt, die Summe über jedem Balken; mit „Als Tabelle“
 * stehen alle Werte (auf den Cent) als Text da. Beträge kommen in Cent, gezeigt in Euro.
 */
export function DonationMonthChart({
  year,
  months,
  current,
}: {
  year: number;
  months: { month: number; moneyCents: number; otherCents: number }[];
  /** Laufendes Jahr: Der letzte Monat ist noch nicht abgeschlossen. */
  current: boolean;
}) {
  const [table, setTable] = useState(false);
  const buckets: BucketLabel[] = months.map((m, index) => ({
    key: `${year}-${String(m.month + 1).padStart(2, "0")}`,
    label: MONTH_NAMES[m.month]!.slice(0, 3),
    fullLabel: `${MONTH_NAMES[m.month]} ${year}`,
    partial: current && index === months.length - 1,
  }));
  const values = [months.map((m) => m.moneyCents / 100), months.map((m) => m.otherCents / 100)];
  const last = months.at(-1)?.month ?? 0;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Legende">
          {SERIES.map((series, index) => (
            <li key={series.id} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-[3px]"
                style={{ backgroundColor: COLORS[index] }}
              />
              {series.label}
            </li>
          ))}
        </ul>
        <Button variant="ghost" size="sm" onClick={() => setTable((value) => !value)}>
          {table ? "Als Diagramm" : "Als Tabelle"}
        </Button>
      </div>
      {table ? (
        <TimeTable
          caption={`Spenden ${year} je Monat`}
          buckets={buckets}
          series={[...SERIES, { id: "zusammen", label: "Zusammen" }]}
          values={[...values, months.map((m) => (m.moneyCents + m.otherCents) / 100)]}
          unit={UNIT}
          periodLabel="Monat"
          format={(euros) => formatEuroFromCents(Math.round(euros * 100))}
        />
      ) : (
        <TimeChart
          type="bar"
          stacked
          axis={false}
          colors={COLORS}
          totalLabel={totalLabel}
          title={`Spenden ${year} je Monat`}
          rangeLabel={
            months.length === 1
              ? `${MONTH_NAMES[0]} ${year}`
              : `${MONTH_NAMES[0]} bis ${MONTH_NAMES[last]} ${year}`
          }
          buckets={buckets}
          series={SERIES}
          values={values}
          unit={UNIT}
          heights={[220, 260]}
        />
      )}
    </div>
  );
}
