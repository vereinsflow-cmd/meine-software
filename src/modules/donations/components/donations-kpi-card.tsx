"use client";

import { HandHeartIcon } from "lucide-react";
import { QuoteChart, type QuoteChartPoint } from "@/components/charts/quote-chart";
import { KPI_ACCENT } from "@/components/shared/accent";
import { Card } from "@/components/ui/card";
import { formatEuroFromCents } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { KpiValue } from "@/modules/dashboard/components/kpi-cards";

/** Lange Beträge werden kleiner, damit sie in der linken Spalte ganz zu sehen sind (100cqi = Breite der Spalte). */
const fitSize = (chars: number) =>
  `clamp(1.05rem, calc(100cqi / ${(0.64 * chars).toFixed(2)}), 2.4rem)`;

/**
 * Große violette Karte „Spenden 2026“ (Entwurf 3 „Spenden-Cockpit“): Summe, zwei Sätze, rechts der Kasten „Nach Art“ (am Handy
 * darunter) und unten der aufsummierte Verlauf des Jahres. Gleiches Aussehen wie `KpiShell` (Verlauf, Schein, Ring), aber
 * zweispaltig und ohne Link – die Karte steht auf der Seite, zu der sie sonst führen würde. Der Kurs ist schmückend; Summe und
 * Arten stehen als Text daneben.
 */
export function DonationsKpiCard({
  label,
  totalCents,
  lines,
  byKind,
  points,
  className,
}: {
  label: string;
  totalCents: number;
  /** Ein bis zwei Sätze unter der Summe (der zweite fett). */
  lines: string[];
  /** „Nach Art“ – leer, solange es keine Spenden gibt. */
  byKind: { label: string; cents: number }[];
  points: QuoteChartPoint[];
  className?: string;
}) {
  const value = formatEuroFromCents(totalCents);
  return (
    <Card
      data-kpi={label}
      className={cn(
        "relative isolate h-full gap-0 rounded-[1.75rem] bg-linear-160 py-0 text-white shadow-[0_22px_40px_-24px_var(--kpi-glow),0_10px_20px_-14px_var(--kpi-glow)] inset-shadow-[0_1px_0_rgb(255_255_255/0.28)] ring-white/15 dark:ring-white/10",
        KPI_ACCENT.violet.card,
        className,
      )}
    >
      {/* Schein genau in der Ecke wie bei den übrigen Kennzahlen (tests/unit/dashboard-contrast.test.ts). */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 -right-28 -z-10 size-56 rounded-full bg-[radial-gradient(circle_closest-side,rgb(255_255_255/0.1),transparent_60%)]"
      />
      <div className="flex flex-1 flex-col px-5 pt-5">
        <div className="grid gap-x-4 gap-y-4 md:grid-cols-[minmax(0,1fr)_13rem]">
          <div className="@container/spenden min-w-0">
            <div className="flex items-start gap-2.5">
              <span
                className="flex size-8 shrink-0 items-center justify-center rounded-[0.7rem] bg-white/18 inset-ring inset-ring-white/20 [&_svg]:size-4"
                aria-hidden="true"
              >
                <HandHeartIcon />
              </span>
              <h2 className="min-w-0 flex-1 pt-1 text-[0.9375rem] leading-snug font-semibold">
                {label}
              </h2>
            </div>
            <div className="mt-3" style={{ fontSize: fitSize(value.length) }}>
              <KpiValue className="whitespace-nowrap">{value}</KpiValue>
            </div>
            <div className="mt-2.5 grid gap-0.5 text-sm text-white/95">
              {lines.map((line, index) => (
                <p key={index} className={index === 1 ? "font-semibold" : "font-medium"}>
                  {line}
                </p>
              ))}
            </div>
          </div>
          {byKind.length > 0 && (
            // Dunkler statt heller Kasten: Weiß auf Violett behält so mindestens 4,5 : 1.
            <div className="self-start rounded-2xl bg-black/15 p-3.5 ring-1 ring-white/10">
              <h3 className="text-[0.6875rem] font-semibold tracking-wide text-white uppercase">
                Nach Art
              </h3>
              <dl className="mt-2 grid gap-1.5 text-sm md:text-[0.8125rem]">
                {byKind.map((kind) => (
                  <div key={kind.label} className="flex items-baseline justify-between gap-3">
                    <dt className="min-w-0 text-white/90">{kind.label}</dt>
                    <dd className="font-bold whitespace-nowrap tabular-nums">
                      {formatEuroFromCents(kind.cents)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>
        {points.length > 1 ? (
          <div className="-mx-5 mt-auto pt-3">
            <QuoteChart
              points={points}
              format={(cents) => formatEuroFromCents(Math.round(cents))}
              describe={(cents) => formatEuroFromCents(Math.round(cents))}
              className="h-14"
            />
          </div>
        ) : (
          <div className="pb-5" />
        )}
      </div>
    </Card>
  );
}
