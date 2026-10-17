"use client";

import Link from "next/link";
import { QuoteChart } from "@/components/charts/quote-chart";
import { SOFT_CARD_SURFACE } from "@/components/ui/surface";
import { ACCENT, type Accent } from "@/components/shared/accent";
import { formatNumber } from "@/lib/charts/geometry";
import { cn } from "@/lib/utils";
import type { Compare } from "../compare";
import type { BlockSize } from "../layout-prefs";
import type { Quote, QuotePeriod } from "../quote";
import {
  ChangeChip,
  CompareLine,
  KpiShell,
  KpiValue,
  PeriodSwitch,
  QuoteLink,
  QuoteStats,
  usePeriod,
  withUnit,
} from "./kpi-cards";
import { PillSparkline } from "./studio-cards";

/**
 * Kennzahlen der Übersicht im Stil der Vorlage „Analytics“ (17.10.2026, in VereinsFlow-Farben): die große blaue Mitglieder-Kachel,
 * die Karte „Helferstunden“ mit Balken und die schmalen Karten der rechten Spalte („Termine in 30 Tagen“, „Freie Helferplätze“).
 * Alle haben Zeitraum-Knöpfe (Kurs „wie eine Aktie“) und laufen deshalb im Browser; der Aufgaben-Ring steht in `studio-cards.tsx`.
 * Aufteilung der Seite: `StudioFrame` (components/layout.tsx).
 *
 * `size` ist die eigene Größe der Kennzahlen aus „Anpassen“: „Groß“ zeigt größere Zahlen, höhere Verläufe und darunter Hoch, Tief
 * und Ø (bei Summen: bester Abschnitt und Ø); „Klein“ gibt es hier nicht – dafür nimmt die Seite das einfache Raster.
 */

/**
 * Große Mitglieder-Kachel: kräftiger blauer Verlauf, große Zahl mit Veränderung im Zeitraum, darunter der Kurs als weiße Linie über
 * die volle Breite und unten die Aufteilung (Aktiv · Passiv · Weitere) – wie die drei Spalten der Vorlage, aber mit echten Zahlen.
 */
export function MembersHeroCard({
  label,
  value,
  compare,
  href,
  icon,
  quote,
  split,
  size = "m",
}: {
  label: string;
  value: React.ReactNode;
  compare?: Compare;
  href: string;
  icon: React.ReactNode;
  quote: Quote;
  /** Spalten unten (höchstens drei), z. B. Aktiv, Passiv, Weitere. */
  split: readonly { label: string; count: number }[];
  size?: BlockSize;
}) {
  const { period: chosen, choose, live } = usePeriod(quote, label);
  const period = chosen!;
  const large = size === "l";
  return (
    <KpiShell
      label={label}
      accent="blue"
      href={href}
      icon={icon}
      density="m"
      className="rounded-3xl"
      extra={
        <>
          {period.points.length > 1 && (
            <>
              <div className="mt-4 flex justify-end">
                <PeriodSwitch label={label} quote={quote} value={period.id} onChange={choose} />
              </div>
              {/* Wie auf der großen Kachel zuvor: Startwert, Hoch/Tief am Rand, Monate darunter und Zu- und Abgänge als
                  kleine Balken (`detailClassName`). */}
              <QuoteLink href={href} className="-mx-5 mt-1">
                <QuoteChart
                  key={period.id}
                  points={period.points}
                  format={(number) => formatNumber(number, quote.unit.decimals)}
                  describe={(number) => withUnit(quote, number)}
                  detailClassName="block"
                  volume={period.volume && { ...period.volume, label: "Zu- / Abgänge" }}
                  className={large ? "h-24" : "h-16"}
                />
              </QuoteLink>
              {large && <QuoteStats quote={quote} period={period} />}
            </>
          )}
          {split.length > 0 && (
            // Die Zahlen werden in schmalen Kacheln kleiner (vierstellige Bestände passen sonst nicht zwischen die Linien).
            <dl className="@container/split mt-4 grid grid-cols-3 pb-1.5">
              {split.map((entry, index) => (
                <div
                  key={entry.label}
                  className={cn(
                    "min-w-0",
                    index > 0 && "border-l-[1.5px] border-dashed border-white/40 pl-3",
                  )}
                >
                  <dt className="truncate text-sm font-medium text-white/95">{entry.label}</dt>
                  <dd className="mt-1 text-lg font-bold tabular-nums @[15rem]/split:text-2xl">
                    {formatNumber(entry.count, 0)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {live}
        </>
      }
    >
      <KpiValue className={cn("mt-3", large ? "text-6xl" : "text-5xl")}>{value}</KpiValue>
      <div className="mt-2.5">
        <ChangeChip quote={quote} period={period} />
      </div>
      {compare && <CompareLine compare={compare} className="mt-2" />}
    </KpiShell>
  );
}

/** Ein Abschnitt des Balkendiagramms: Stunden in diesem Abschnitt und Summe bis dahin. */
interface Step {
  label: string;
  fullLabel: string;
  value: number;
  total: number;
}

/** Abschnitte aus dem Kurs: Bei Summen (`total`) ist jeder Punkt der Stand bis dahin, der erste nur der Startwert 0. */
function stepsOf(quote: Quote, period: QuotePeriod): Step[] {
  const points = period.points;
  if (quote.kind !== "total") {
    return points.map((point) => ({ ...point, total: point.value }));
  }
  return points.slice(1).map((point, index) => ({
    label: point.label,
    fullLabel: point.fullLabel,
    value: Math.max(0, point.value - points[index]!.value),
    total: point.value,
  }));
}

/**
 * Balken je Abschnitt (Woche, Monat, Jahr) und darüber die Summe als dunkle Linie – wie „Post Stats“ der Vorlage. Der stärkste
 * Abschnitt ist bernsteinfarben hervorgehoben (mit Punkt), die übrigen sind grau. Rein schmückend für Screenreader (der Link
 * der Karte nennt Summe und Veränderung); mit der Maus zeigt jeder Balken seinen Wert.
 */
function StepBars({
  quote,
  period,
  large = false,
}: {
  quote: Quote;
  period: QuotePeriod;
  large?: boolean;
}) {
  const steps = stepsOf(quote, period);
  if (steps.length === 0) return null;
  const max = Math.max(...steps.map((step) => step.value), 0);
  let best = -1;
  steps.forEach((step, index) => {
    if (max > 0 && step.value === max) best = index;
  });
  const maxTotal = Math.max(...steps.map((step) => step.total), 0);
  const line = steps
    .map((step, index) => {
      const x = ((index + 0.5) / steps.length) * 100;
      const y = maxTotal > 0 ? 96 - (step.total / maxTotal) * 88 : 96;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const middle = steps[Math.floor((steps.length - 1) / 2)];
  return (
    <div className="flex flex-1 flex-col">
      <div className={cn("relative flex-1", large ? "min-h-48" : "min-h-36")}>
        <div className="absolute inset-0 flex items-end gap-1">
          {steps.map((step, index) => (
            <div
              key={`${step.label}-${index}`}
              title={`${step.fullLabel}: ${withUnit(quote, step.value)}`}
              className="flex h-full flex-1 items-end justify-center"
            >
              <span
                data-slot="step-bar"
                className={cn(
                  "relative w-2.5 rounded-full",
                  index === best
                    ? "bg-linear-to-b from-amber-400 to-orange-600 before:absolute before:-top-1.5 before:left-1/2 before:size-4 before:-translate-x-1/2 before:rounded-full before:border-[3px] before:border-card before:bg-amber-400"
                    : "bg-slate-200 dark:bg-white/12",
                )}
                style={{ height: `${max > 0 ? Math.max(5, (step.value / max) * 92) : 5}%` }}
              />
            </div>
          ))}
        </div>
        {quote.kind === "total" && steps.length > 1 && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 size-full text-foreground/75"
          >
            <polyline
              points={line}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>{steps[0]!.label}</span>
        {steps.length > 2 && middle && <span>{middle.label}</span>}
        {steps.length > 1 && <span>{steps.at(-1)!.label}</span>}
      </div>
    </div>
  );
}

/**
 * Helferstunden als weiße Karte mit Balkendiagramm (Stil der Vorlage): oben Titel und Zeitraum-Knöpfe, dann die Summe groß mit
 * der Veränderung im Zeitraum und dem Vergleich zur Vorwoche, darunter die Balken je Abschnitt. Die ganze Karte führt zu den
 * Helferstunden; Knöpfe und Balken liegen außerhalb des Links (Knöpfe in einem Link wären ungültig).
 */
export function HoursChartCard({
  label,
  value,
  compare,
  href,
  icon,
  quote,
  size = "m",
}: {
  label: string;
  value: React.ReactNode;
  compare?: Compare;
  href: string;
  icon: React.ReactNode;
  quote: Quote;
  size?: BlockSize;
}) {
  const { period: chosen, choose, live } = usePeriod(quote, label);
  const period = chosen!;
  const large = size === "l";
  return (
    <div
      data-slot="card"
      data-kpi={label}
      className={cn(
        SOFT_CARD_SURFACE,
        "relative isolate flex h-full flex-col p-5 has-[[data-slot=kpi-link]:focus-visible]:ring-2 has-[[data-slot=kpi-link]:focus-visible]:ring-ring has-[[data-slot=kpi-link]:focus-visible]:ring-offset-2 has-[[data-slot=kpi-link]:focus-visible]:ring-offset-background",
      )}
    >
      <Link
        href={href}
        data-slot="kpi-link"
        className="block rounded-xl after:absolute after:inset-0 after:rounded-3xl after:content-[''] focus-visible:outline-hidden"
      >
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300 [&_svg]:size-4"
          >
            {icon}
          </span>
          <span className="font-semibold">{label}</span>
        </span>
        <KpiValue className={cn("mt-4 [text-shadow:none]", large ? "text-5xl" : "text-4xl")}>
          {value}
        </KpiValue>
        <span className="mt-2.5 block">
          <ChangeChip quote={quote} period={period} tone="card" />
        </span>
        {compare && (
          <span
            className={cn(
              "mt-2 block text-sm",
              compare.tone === "success"
                ? "font-medium text-emerald-700 dark:text-emerald-300"
                : "text-muted-foreground",
            )}
          >
            {compare.text}
          </span>
        )}
      </Link>
      {/* Zeitraum-Knöpfe über den Balken (außerhalb des Links), rechtsbündig */}
      <div className="relative z-10 mt-4 flex justify-end">
        <PeriodSwitch label={label} quote={quote} value={period.id} onChange={choose} tone="card" />
      </div>
      {/* Steht die Karte neben höheren Karten, wachsen die Balken mit (statt einer leeren Fläche darunter). */}
      <QuoteLink href={href} className="mt-3 flex flex-1 flex-col">
        <StepBars quote={quote} period={period} large={large} />
      </QuoteLink>
      {large && <QuoteStats quote={quote} period={period} tone="card" />}
      {live}
    </div>
  );
}

/** Fokusrahmen an der Karte, sobald ihr (über die Karte gedehnter) Link den Tastaturfokus hat. */
const CARD_FOCUS =
  "has-[[data-slot=kpi-link]:focus-visible]:ring-2 has-[[data-slot=kpi-link]:focus-visible]:ring-ring has-[[data-slot=kpi-link]:focus-visible]:ring-offset-2 has-[[data-slot=kpi-link]:focus-visible]:ring-offset-background";

/**
 * Schmale Kennzahl-Karte der rechten Spalte (wie „Comments“/„Links Shared“ der Vorlage): links eine getönte Fläche mit der Zahl
 * und dem Symbol des Bereichs, rechts Beschriftung, ein Satz und die Veränderung im Zeitraum; darunter (außerhalb des Links) die
 * kleine Verlaufslinie und die Zeitraum-Knöpfe. Die ganze Karte ist ein Link. Reihenfolge im Code: Beschriftung, Zahl, Satz – so
 * lautet der Name des Links „Termine in 30 Tagen 3 Nächster Termin …“, auch wenn die Zahl links steht (Raster).
 *
 * `extra`: zusätzlich im Link unter dem Satz (z. B. der Besetzungsbalken). `chart=false`: ohne Verlauf und Knöpfe (z. B. freie
 * Plätze, solange keine Schichten geplant sind – der Verlauf wäre eine flache Linie bei 0).
 */
export function QuotePill({
  label,
  value,
  sub,
  href,
  icon,
  accent,
  quote,
  chart = true,
  extra,
  size = "m",
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  href: string;
  icon: React.ReactNode;
  accent: Accent;
  quote: Quote;
  chart?: boolean;
  extra?: React.ReactNode;
  size?: BlockSize;
}) {
  const { period: chosen, choose, live } = usePeriod(quote, label);
  const period = chosen!;
  const showChart = chart && period.points.length > 1;
  return (
    <div
      data-slot="card"
      data-kpi={label}
      className={cn(SOFT_CARD_SURFACE, CARD_FOCUS, "relative isolate h-full p-3")}
    >
      <Link
        href={href}
        data-slot="kpi-link"
        className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 rounded-xl after:absolute after:inset-0 after:rounded-3xl after:content-[''] focus-visible:outline-hidden"
      >
        <span className="col-start-2 row-start-1 pt-2 font-semibold">{label}</span>
        <span
          className={cn(
            "col-start-1 row-span-3 row-start-1 flex min-h-20 min-w-20 flex-col items-center justify-center gap-1 rounded-2xl px-3",
            ACCENT[accent].tile,
          )}
        >
          <span
            className={cn(
              "leading-none font-extrabold tabular-nums",
              size === "l" ? "text-3xl" : "text-2xl",
            )}
          >
            {value}
          </span>
          <span aria-hidden="true" className="[&_svg]:size-4">
            {icon}
          </span>
        </span>
        <span className="col-start-2 row-start-2 block pr-2 text-sm text-muted-foreground">
          {sub}
        </span>
        <span className="col-start-2 row-start-3 block pt-2 pr-2 pb-1">
          {chart && <ChangeChip quote={quote} period={period} tone="card" />}
          {extra}
        </span>
      </Link>
      {showChart && (
        // Unter dem Text eingerückt (Breite der Zahlfläche plus Abstand); die Linie führt zum selben Ziel wie die Karte.
        <div className="relative z-10 mt-1 flex items-center gap-3 pl-24">
          <QuoteLink href={href} className="min-w-0 flex-1">
            <PillSparkline
              values={period.points.map((point) => point.value)}
              accent={accent}
              className={size === "l" ? "h-12" : undefined}
            />
          </QuoteLink>
          <PeriodSwitch
            label={label}
            quote={quote}
            value={period.id}
            onChange={choose}
            tone="card"
          />
        </div>
      )}
      {live}
    </div>
  );
}
