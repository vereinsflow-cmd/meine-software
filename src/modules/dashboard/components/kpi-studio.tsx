"use client";

import Link from "next/link";
import { QuoteChart } from "@/components/charts/quote-chart";
import { SOFT_CARD_SURFACE } from "@/components/ui/surface";
import { formatNumber } from "@/lib/charts/geometry";
import { cn } from "@/lib/utils";
import type { Compare } from "../compare";
import type { BlockSize } from "../layout-prefs";
import type { Quote, QuotePeriod } from "../quote";
import {
  changeText,
  KpiValue,
  PeriodSwitch,
  QuoteLink,
  QuoteStats,
  usePeriod,
  withUnit,
} from "./kpi-cards";

/**
 * Kennzahlen der Übersicht im Stil der Vorlage „Vertix“ (Instagram-Reel, 18.10.2026 – Ben: „mache dashboard genau so“, in unserem
 * Blau): links die weiße Mitglieder-Karte (wie „Total Balance“), in der Mitte vier Kacheln in einer Karte (die erste kräftig blau,
 * wie „Total Earnings“), rechts die Helferstunden als Balken in einer grauen Fläche (wie „Total Income“). Aufteilung: Seite
 * (`studioTop` in app/(app)/dashboard/page.tsx).
 *
 * `size` ist die eigene Größe der Kennzahlen aus „Anpassen“: „Groß“ zeigt größere Zahlen und höhere Balken; „Klein“ gibt es hier
 * nicht – dafür nimmt die Seite das einfache Raster.
 */

/** Fokusrahmen an der Karte, sobald ihr (über die Karte gedehnter) Link den Tastaturfokus hat. */
const CARD_FOCUS =
  "has-[[data-slot=kpi-link]:focus-visible]:ring-2 has-[[data-slot=kpi-link]:focus-visible]:ring-ring has-[[data-slot=kpi-link]:focus-visible]:ring-offset-2 has-[[data-slot=kpi-link]:focus-visible]:ring-offset-background";

/** Link, der seine Klickfläche über die ganze Karte dehnt (`after`). */
const STRETCHED_LINK =
  "block rounded-xl after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] focus-visible:outline-hidden";

/** Farbe der Veränderung auf einem Schild (gestiegen grün, gesunken rot, unverändert grau) – hell und dunkel ≥ 4,5 : 1. */
const DIRECTION = {
  up: "text-emerald-700 dark:text-emerald-300",
  down: "text-red-700 dark:text-red-300",
  flat: "text-muted-foreground",
} as const;

/** Kleines Schild wie „▲ 5 %“ der Vorlage: auf grauer Fläche weiß, auf weißer grau, auf der blauen Kachel durchscheinend weiß. */
export function Chip({
  tone = "flat",
  on = "muted",
  children,
}: {
  tone?: keyof typeof DIRECTION;
  on?: "muted" | "card" | "hot";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-5 items-center gap-1 rounded-md px-1.5 text-xs font-bold whitespace-nowrap tabular-nums",
        on === "hot"
          ? "bg-white/20 text-white"
          : cn(on === "card" ? "bg-muted" : "bg-card", DIRECTION[tone]),
      )}
    >
      {children}
    </span>
  );
}

/** Veränderung im Zeitraum als Schild („▲ +2“, „▼ −1 Platz“); Pfeil und Vorzeichen tragen die Richtung auch ohne Farbe. */
export function QuoteChip({
  quote,
  period,
  on = "muted",
  withPercent = false,
}: {
  quote: Quote;
  period: QuotePeriod;
  on?: "muted" | "card" | "hot";
  /** Mit Prozent („+2 (+9,1 %)“), wo der Kurs es vorsieht. */
  withPercent?: boolean;
}) {
  const { change, amount, percent } = changeText(quote, period);
  return (
    <Chip tone={change.direction} on={on}>
      {change.direction !== "flat" && (
        <span aria-hidden="true">{change.direction === "up" ? "▲" : "▼"}</span>
      )}
      {amount}
      {withPercent && percent && <span className="font-semibold"> {percent}</span>}
    </Chip>
  );
}

/**
 * Mitglieder-Karte (wie „Total Balance“ der Vorlage): Beschriftung mit den Zeitraum-Knöpfen rechts, die Zahl groß, die
 * Veränderung im Zeitraum, zwei runde Knöpfe (dunkel und hell) und unten in einer grauen Fläche die Aufteilung in kleinen weißen
 * Kärtchen (Aktiv · Passiv · Weitere – zusammen genau die große Zahl). Die ganze Karte führt zu den Mitgliedern; Knöpfe und
 * Zeitraum-Knöpfe liegen darüber.
 */
export function MembersHeroCard({
  label,
  value,
  compare,
  href,
  quote,
  split,
  actions,
  size = "m",
}: {
  label: string;
  value: React.ReactNode;
  compare?: Compare;
  href: string;
  quote: Quote;
  /** Kärtchen unten (höchstens drei), z. B. Aktiv, Passiv, Weitere. */
  split: readonly { label: string; count: number; dot: string }[];
  /** Die beiden runden Knöpfe (Links), der erste dunkel. */
  actions: readonly { href: string; label: string; icon?: React.ReactNode }[];
  size?: BlockSize;
}) {
  const { period: chosen, choose, live } = usePeriod(quote, label);
  const period = chosen!;
  const total = split.reduce((sum, entry) => sum + entry.count, 0);
  return (
    <div
      data-slot="card"
      data-kpi={label}
      className={cn(SOFT_CARD_SURFACE, CARD_FOCUS, "relative isolate flex h-full flex-col p-5")}
    >
      <div className="absolute top-4 right-4 z-10">
        <PeriodSwitch label={label} quote={quote} value={period.id} onChange={choose} tone="card" />
      </div>
      <Link href={href} data-slot="kpi-link" className={STRETCHED_LINK}>
        <span className="block pt-1 pr-28 text-sm font-medium">{label}</span>
        <KpiValue
          className={cn(
            "mt-4 font-bold [text-shadow:none]",
            size === "l" ? "text-5xl" : "text-4xl",
          )}
        >
          {value}
        </KpiValue>
        <span className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <QuoteChip quote={quote} period={period} on="card" withPercent />{" "}
          <span className="text-muted-foreground">{period.since}</span>
        </span>
        {compare && (
          <span className="mt-1.5 block text-xs text-muted-foreground"> {compare.text}</span>
        )}
      </Link>
      {/* „Groß“ (Anpassen): zusätzlich der Kurs auf einer blauen Fläche und darunter Hoch, Tief und Ø des Zeitraums. */}
      {size === "l" && period.points.length > 1 && (
        <>
          <QuoteLink
            href={href}
            className="mt-4 overflow-hidden rounded-2xl bg-linear-135 from-blue-600 to-blue-800 pt-3 pb-1 text-white"
          >
            <QuoteChart
              key={period.id}
              points={period.points}
              format={(number) => formatNumber(number, quote.unit.decimals)}
              describe={(number) => withUnit(quote, number)}
              className="h-20"
            />
          </QuoteLink>
          <QuoteStats quote={quote} period={period} tone="card" />
        </>
      )}
      {actions.length > 0 && (
        <div className="@container/actions relative z-10 mt-5 grid grid-cols-2 gap-2.5">
          {actions.map((action, index) => (
            <Link
              key={action.href}
              href={action.href}
              className={cn(
                "flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-full px-2.5 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card motion-reduce:transition-none [&_svg]:size-4 [&_svg]:shrink-0 @max-[20rem]/actions:[&_svg]:hidden",
                index === 0
                  ? "bg-foreground text-background hover:bg-foreground/85"
                  : "bg-muted text-foreground hover:bg-accent",
              )}
            >
              {action.icon}
              <span className="truncate">{action.label}</span>
            </Link>
          ))}
        </div>
      )}
      {split.length > 0 && (
        <div className="mt-4 rounded-2xl bg-muted p-2.5">
          <p className="px-1 pb-2 text-xs font-medium">
            Status <span className="text-muted-foreground">· {split.length} Gruppen</span>
          </p>
          <dl className="grid grid-cols-3 gap-2">
            {split.map((entry) => (
              <div key={entry.label} className="min-w-0 rounded-xl bg-card p-2.5">
                <dt className="flex items-center gap-1.5 truncate text-xs">
                  <span
                    aria-hidden="true"
                    className={cn("size-2 shrink-0 rounded-full", entry.dot)}
                  />
                  {entry.label}
                </dt>
                <dd
                  data-slot="split-count"
                  className="mt-1.5 text-lg leading-none font-bold tabular-nums"
                >
                  {formatNumber(entry.count, 0)}
                </dd>
                <dd
                  data-slot="split-share"
                  className="mt-1 text-xs text-muted-foreground tabular-nums"
                >
                  {total > 0 ? `${Math.round((entry.count / total) * 100)} %` : "–"}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      {live}
    </div>
  );
}

/**
 * Eine Kachel im Viererblock (wie „Total Spending“ der Vorlage): Beschriftung, rechts ein Symbol im Kreis, darunter die Zahl groß
 * und unten ein Schild mit einem kurzen Satz. Die erste Kachel ist kräftig blau (`hot`, weiße Schrift) mit einem Kreis in der
 * Kartenfarbe unten rechts – wie die orange Kachel der Vorlage. Die ganze Kachel ist ein Link.
 */
export function StudioTile({
  label,
  value,
  href,
  icon,
  chip,
  caption,
  hot = false,
  size = "m",
}: {
  label: string;
  value: React.ReactNode;
  href: string;
  icon: React.ReactNode;
  chip?: React.ReactNode;
  caption?: React.ReactNode;
  hot?: boolean;
  size?: BlockSize;
}) {
  return (
    <div
      data-slot="card"
      data-kpi={label}
      className={cn(
        CARD_FOCUS,
        "relative isolate flex min-h-36 flex-col overflow-hidden rounded-[1.25rem] p-4",
        hot
          ? "bg-linear-135 from-blue-600 to-blue-800 text-white shadow-[0_14px_28px_-16px_var(--color-blue-700)]"
          : "bg-muted",
      )}
    >
      {hot && (
        <span
          aria-hidden="true"
          className="absolute -right-7 -bottom-9 -z-10 size-18 rounded-full bg-card"
        />
      )}
      <Link href={href} data-slot="kpi-link" className={cn(STRETCHED_LINK, "flex flex-1 flex-col")}>
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0 text-sm font-medium">{label}</span>
          <span
            aria-hidden="true"
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-full [&_svg]:size-3.5",
              hot ? "bg-white/20 text-white" : "bg-card text-muted-foreground",
            )}
          >
            {icon}
          </span>
        </span>
        <KpiValue
          className={cn(
            "mt-auto pt-4 font-bold whitespace-nowrap [text-shadow:none]",
            size === "l" ? "text-4xl" : "text-[1.75rem]",
          )}
        >
          {value}
        </KpiValue>
        {(chip || caption) && (
          // Auf der blauen Kachel Abstand zum hellen Kreis unten rechts (weiße Schrift wäre darauf unsichtbar)
          <span
            className={cn(
              "mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs",
              hot && "pr-9",
            )}
          >
            {chip}{" "}
            {caption && (
              <span className={cn("min-w-0", hot ? "text-white/90" : "text-muted-foreground")}>
                {caption}
              </span>
            )}
          </span>
        )}
      </Link>
    </div>
  );
}

/** Eine Kachel, deren Schild die Veränderung im Standard-Zeitraum des Kurses zeigt (Termine, freie Plätze). */
export function QuoteTile({
  quote,
  label,
  hot,
  ...rest
}: Omit<React.ComponentProps<typeof StudioTile>, "chip"> & { quote?: Quote }) {
  const { period } = usePeriod(quote, label);
  return (
    <StudioTile
      label={label}
      hot={hot}
      chip={
        quote && period && period.points.length > 1 ? (
          <QuoteChip quote={quote} period={period} on={hot ? "hot" : "muted"} />
        ) : undefined
      }
      {...rest}
    />
  );
}

/** Ein Abschnitt des Balkendiagramms: Stunden in diesem Abschnitt. */
interface Step {
  label: string;
  fullLabel: string;
  value: number;
}

/** Abschnitte aus dem Kurs: Bei Summen (`total`) ist jeder Punkt der Stand bis dahin, der erste nur der Startwert 0. */
function stepsOf(quote: Quote, period: QuotePeriod): Step[] {
  const points = period.points;
  if (quote.kind !== "total") return points.map((point) => ({ ...point }));
  return points.slice(1).map((point, index) => ({
    label: point.label,
    fullLabel: point.fullLabel,
    value: Math.max(0, point.value - points[index]!.value),
  }));
}

/** Runde Teilung der Achse (1, 2, 5, 10 …) mit vier Abschnitten bis über den größten Wert. */
function axisTicks(max: number): number[] {
  if (max <= 0) return [0, 1, 2, 3, 4];
  const raw = max / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * power).find((value) => value >= raw)!;
  return [0, 1, 2, 3, 4].map((index) => index * step);
}

/** Kurzname eines Abschnitts für die Legende („Bester Monat“). */
const BEST = { Woche: "Beste Woche", Monat: "Bester Monat", Jahr: "Bestes Jahr" } as const;
const PER = {
  Woche: "Stunden je Woche",
  Monat: "Stunden je Monat",
  Jahr: "Stunden je Jahr",
} as const;

/**
 * Balken je Abschnitt (Woche, Monat, Jahr) über einer Achse mit Hilfslinien – wie „Profit and Loss“ der Vorlage. Der stärkste
 * Abschnitt ist blau schraffiert, die übrigen dunkel (im Dunkeln hell). Rein schmückend für Screenreader (der Link der Karte
 * nennt Summe und Veränderung); mit der Maus zeigt jeder Balken seinen Wert.
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
  const ticks = axisTicks(max);
  const top = ticks.at(-1)!;
  let best = -1;
  steps.forEach((step, index) => {
    if (max > 0 && step.value === max) best = index;
  });
  // Höchstens sechs Beschriftungen (vom letzten Balken aus gezählt), sonst drängen sie sich.
  const every = Math.ceil(steps.length / 6);
  return (
    <div className="flex flex-1 flex-col">
      <div className={cn("relative flex flex-1 pl-7", large ? "min-h-52" : "min-h-40")}>
        {/* Achse mit Hilfslinien (oben der höchste Wert) */}
        <div aria-hidden="true" className="absolute inset-0 flex flex-col-reverse justify-between">
          {ticks.map((tick) => (
            <div key={tick} className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-right text-[0.6875rem] leading-none text-muted-foreground tabular-nums">
                {formatNumber(tick, tick % 1 === 0 ? 0 : 1)}
              </span>
              <span className="h-px flex-1 bg-foreground/8" />
            </div>
          ))}
        </div>
        <div className="relative flex flex-1 items-end gap-1.5 pb-[0.34rem]">
          {steps.map((step, index) => (
            <div
              key={`${step.label}-${index}`}
              title={`${step.fullLabel}: ${withUnit(quote, step.value)}`}
              className="flex h-full min-w-0 flex-1 items-end justify-center"
            >
              <span
                data-slot="step-bar"
                className={cn(
                  "block w-full max-w-7 rounded-md",
                  index === best ? "hatch [--hatch:var(--color-blue-600)]" : "bg-foreground/85",
                )}
                style={{ height: `${top > 0 ? Math.max(3, (step.value / top) * 100) : 3}%` }}
              />
            </div>
          ))}
        </div>
      </div>
      <div aria-hidden="true" className="mt-2 flex gap-1.5 pl-7 text-xs text-muted-foreground">
        {steps.map((step, index) => (
          <span
            key={`${step.label}-${index}`}
            className="flex min-w-0 flex-1 justify-center overflow-visible whitespace-nowrap"
          >
            {index % every === (steps.length - 1) % every ? step.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Helferstunden als weiße Karte (wie „Total Income“ der Vorlage): Titel und Summe mit Veränderung, darunter eine graue Fläche mit
 * „Stunden je Monat“, Legende, Zeitraum-Knöpfen und den Balken. Die ganze Karte führt zu den Helferstunden; Knöpfe und Balken
 * liegen außerhalb des Links (Knöpfe in einem Link wären ungültig).
 */
export function HoursChartCard({
  label,
  value,
  compare,
  href,
  quote,
  size = "m",
}: {
  label: string;
  value: React.ReactNode;
  compare?: Compare;
  href: string;
  quote: Quote;
  size?: BlockSize;
}) {
  const { period: chosen, choose, live } = usePeriod(quote, label);
  const period = chosen!;
  const step = period.step;
  return (
    <div
      data-slot="card"
      data-kpi={label}
      className={cn(SOFT_CARD_SURFACE, CARD_FOCUS, "relative isolate flex h-full flex-col p-5")}
    >
      <Link href={href} data-slot="kpi-link" className={STRETCHED_LINK}>
        <span className="block text-lg font-semibold tracking-tight">{label}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">{value}</span>
          <QuoteChip quote={quote} period={period} on="card" />{" "}
          <span className="text-xs">{period.since}</span>
        </span>
        {compare && (
          <span className="mt-1 block text-xs text-muted-foreground"> {compare.text}</span>
        )}
      </Link>
      <div className="mt-4 flex flex-1 flex-col rounded-2xl bg-muted p-4">
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium">{PER[step]}</span>
          <span className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full hatch [--hatch:var(--color-blue-600)]"
              />
              {BEST[step]}
            </span>
            <PeriodSwitch
              label={label}
              quote={quote}
              value={period.id}
              onChange={choose}
              tone="card"
            />
          </span>
        </div>
        {/* Steht die Karte neben höheren Karten, wachsen die Balken mit (statt einer leeren Fläche darunter). */}
        <QuoteLink href={href} className="mt-4 flex flex-1 flex-col">
          <StepBars quote={quote} period={period} large={size === "l"} />
        </QuoteLink>
      </div>
      {live}
    </div>
  );
}
