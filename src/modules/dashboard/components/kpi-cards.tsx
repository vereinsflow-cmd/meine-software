"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRightIcon, CircleAlertIcon, TriangleAlertIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { QuoteChart } from "@/components/charts/quote-chart";
import { CountUp } from "@/components/shared/count-up";
import { KPI_ACCENT, type KpiAccent } from "@/components/shared/accent";
import type { Tone } from "@/components/shared/status-badge";
import { formatNumber } from "@/lib/charts/geometry";
import { cn } from "@/lib/utils";
import type { Compare } from "../compare";
import { DEFAULT_BLOCK_SIZE, type BlockSize } from "../layout-prefs";
import {
  formatPercentSigned,
  formatSigned,
  quoteChange,
  quoteStats,
  type Quote,
  type QuotePeriod,
} from "../quote";

/**
 * Rolle einer Kennzahlenkarte im Kachelraster (`KpiCarousel` mit `layout="bento"`, Breiten in `kpi-layout.ts`): `hero` = die große
 * Mitglieder-Kachel über zwei Reihen (größere Zahl, Kurs mit Monaten und Zu- und Abgängen, darunter die Aufteilung nach Status).
 * Schmaler als das Raster sehen alle Karten gleich aus (`regular`); die Rolle gilt nur innerhalb des Rasters (Containerabfrage
 * `kpis`). Seit 17.10.2026 (Entwurf 4) gibt es keine hohe Ring-Kachel mehr – sie stand ohne geplante Schichten fast leer da.
 */
export type StatSize = "regular" | "hero";

/**
 * Maße der Kennzahlenkarten je eigener Größe („Anpassen“, `BlockSize`): „Mittel“ (Standard) kompakt, „Groß“ mit Hoch/Tief/Ø
 * unter dem Kurs, „Klein“ eine schmale Reihe ohne Kurve (nur Zahl und Veränderung).
 */
const KPI_DENSITY: Record<
  BlockSize,
  {
    content: string;
    value: string;
    heroValue: string;
    chart: string;
    heroChart: string;
    stats: boolean;
  }
> = {
  s: {
    content: "pt-4 pb-4",
    value: "mt-2.5 text-3xl",
    heroValue: "",
    chart: "",
    heroChart: "",
    stats: false,
  },
  m: {
    content: "pt-4 pb-3.5",
    value: "mt-3 text-4xl",
    heroValue: "@bento/kpis:mt-4 @bento/kpis:text-6xl",
    chart: "h-14",
    heroChart: "@bento/kpis:h-20",
    stats: false,
  },
  l: {
    content: "pt-5 pb-4",
    value: "mt-4 text-5xl",
    heroValue: "@bento/kpis:mt-6 @bento/kpis:text-7xl",
    chart: "h-16",
    heroChart: "@bento/kpis:h-24",
    stats: true,
  },
};

/**
 * Vergleichssatz auf der farbigen Karte: Neutrales als weißer Text; was Aufmerksamkeit braucht, als helles Schild mit dunkler
 * Schrift in der Bedeutungsfarbe (Bernstein „teilweise besetzt“, Rot „unbesetzt“, Grün „mehr als zuvor“) – farbige Schrift
 * direkt auf dem Verlauf hätte zu wenig Kontrast. Die Bedeutung steht immer auch im Text.
 */
const COMPARE_ON_COLOR: Record<Tone, string | null> = {
  neutral: null,
  ended: null,
  info: "bg-white text-blue-800",
  success: "bg-white text-emerald-800",
  warning: "bg-amber-300 text-amber-950",
  danger: "bg-white text-red-700",
};

function CompareLine({ compare, className }: { compare: Compare; className?: string }) {
  const pill = COMPARE_ON_COLOR[compare.tone];
  if (!pill) {
    return <p className={cn("text-sm font-medium text-white/95", className)}>{compare.text}</p>;
  }
  const Icon =
    compare.tone === "warning"
      ? TriangleAlertIcon
      : compare.tone === "danger"
        ? CircleAlertIcon
        : null;
  // `rounded-2xl` statt rund: Bricht der Satz in einer schmalen Karte um, wird daraus ein Kästchen statt eines dicken Ovals.
  return (
    <p
      className={cn(
        "inline-flex w-fit items-start gap-1.5 rounded-2xl px-2.5 py-0.5 text-sm font-semibold text-balance shadow-sm",
        pill,
        className,
      )}
    >
      {Icon && <Icon className="mt-[0.2em] size-3.5 shrink-0" aria-hidden="true" />}
      {compare.text}
    </p>
  );
}

/** Die große Zahl einer Kennzahlenkarte – wie der Kurs einer Aktie. */
/** Große Zahl einer Kennzahlenkarte (auch für andere Bereiche, z. B. die Finanzen). */
export function KpiValue({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p
      data-slot="kpi-value"
      className={cn(
        "leading-none font-extrabold tracking-[-0.035em] tabular-nums [text-shadow:0_2px_12px_rgb(0_0_0/0.12)]",
        className,
      )}
    >
      {children}
    </p>
  );
}

/** Farbe der Veränderung auf dem weißen Schild: gestiegen grün, gesunken rot, unverändert grau (alle ≥ 4,5 : 1 auf Weiß). */
const DIRECTION_TEXT = {
  up: "text-emerald-800",
  down: "text-red-700",
  flat: "text-slate-600",
} as const;

const withUnit = (quote: Quote, value: number) =>
  `${formatNumber(value, quote.unit.decimals)} ${Math.abs(value) === 1 ? quote.unit.singular : quote.unit.plural}`;

/**
 * Veränderung seit Beginn des gewählten Zeitraums wie bei einem Kurs: „▲ +5 (+26,3 %) in 12 Monaten“, „▼ −2 Plätze in
 * 6 Wochen“, „±0 (0,0 %)“. Pfeil und Vorzeichen tragen die Richtung auch ohne Farbe.
 */
/** Die Veränderung als Text (für das Schild und die Ansage nach einem Wechsel des Zeitraums). */
function changeText(quote: Quote, period: QuotePeriod) {
  const change = quoteChange(period.points, quote.kind, quote.unit.decimals);
  const signed = formatSigned(change.diff, quote.unit.decimals);
  const amount = quote.showPercent
    ? signed
    : `${signed} ${Math.abs(change.diff) === 1 ? quote.unit.singular : quote.unit.plural}`;
  const percent =
    quote.showPercent && change.percent !== null
      ? `(${formatPercentSigned(change.percent)})`
      : null;
  return { change, amount, percent };
}

function ChangeChip({
  quote,
  period,
  hideSince = false,
}: {
  quote: Quote;
  period: QuotePeriod;
  /** Ohne „in 6 Wochen“ – wenn die gedrückten Zeitraum-Knöpfe direkt daneben stehen. */
  hideSince?: boolean;
}) {
  const { change, amount, percent } = changeText(quote, period);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {/* Darf umbrechen statt am Kartenrand abgeschnitten zu werden (schmale Karten, größere Schrift) */}
      <span
        className={cn(
          "inline-flex min-h-6 flex-wrap items-center gap-x-1 rounded-2xl bg-white px-2.5 py-0.5 text-xs font-bold tabular-nums shadow-sm",
          DIRECTION_TEXT[change.direction],
        )}
      >
        <span className="whitespace-nowrap">
          {change.direction !== "flat" && (
            <span aria-hidden="true">{change.direction === "up" ? "▲ " : "▼ "}</span>
          )}
          {amount}
        </span>
        {percent && <span className="font-semibold whitespace-nowrap"> {percent}</span>}
      </span>
      {/* Leerzeichen für den vorgelesenen Namen des Links (im Flex-Container sonst „…%)in 12 Monaten“). In schmalen Karten
          (unter 17 rem; der Container `kpi` ist 2,5 rem schmaler, siehe `KpiShell`) nur für Screenreader – dort nennen die
          gedrückten Zeitraum-Knöpfe den Zeitraum sichtbar. */}{" "}
      {!hideSince && (
        <span className="text-xs font-medium text-white @max-[14.5rem]/kpi:sr-only">
          {period.since}
        </span>
      )}
    </p>
  );
}

/** Knöpfe für den Zeitraum des Kurses („6 M · 12 M · 5 J“) – liegen über dem Link der Karte und wechseln nur den Verlauf. */
function PeriodSwitch({
  label,
  quote,
  value,
  onChange,
}: {
  label: string;
  quote: Quote;
  value: string;
  onChange: (id: string) => void;
}) {
  if (quote.periods.length < 2) return null;
  // Dunkle Schiene statt einer hellen: weiße Schrift behält so auch auf dem helleren Teil des Verlaufs 4,5 : 1
  // (tests/unit/dashboard-contrast.test.ts). Fokus: der übliche Rahmen mit Abstand, hier in Weiß (sichtbar auch am gewählten,
  // weißen Knopf). In Windows-Kontrastfarben trägt der gewählte Knopf die Systemfarbe „Highlight“.
  return (
    <div
      role="group"
      aria-label={`Zeitraum für „${label}“`}
      className="relative z-10 inline-flex shrink-0 gap-0.5 rounded-full bg-black/15 p-0.5 inset-ring inset-ring-white/20"
    >
      {quote.periods.map((period) => (
        <button
          key={period.id}
          type="button"
          aria-pressed={period.id === value}
          // Der sichtbare Text steht vorn (Sprachsteuerung: „klicke 12 M“), danach der ausgeschriebene Zeitraum
          aria-label={`${period.label}: Verlauf ${period.since}`}
          onClick={() => onChange(period.id)}
          className={cn(
            "h-6 min-w-6 rounded-full px-2 text-xs font-bold whitespace-nowrap transition-colors focus-visible:outline-white motion-reduce:transition-none forced-colors:aria-pressed:bg-[Highlight] forced-colors:aria-pressed:text-[HighlightText] forced-colors:aria-pressed:forced-color-adjust-none",
            period.id === value ? "bg-white text-slate-900" : "text-white hover:bg-black/20",
          )}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}

const STEP_BEST = { Woche: "Beste Woche", Monat: "Bester Monat", Jahr: "Bestes Jahr" } as const;

/** Hoch, Tief und Durchschnitt des Zeitraums (bei Summen: bester Abschnitt und Durchschnitt je Abschnitt). */
function QuoteStats({ quote, period }: { quote: Quote; period: QuotePeriod }) {
  const stats = quoteStats(period.points, quote.kind);
  const fmt = (value: number, decimals = quote.unit.decimals) => formatNumber(value, decimals);
  const items =
    quote.kind === "level"
      ? [
          ["Hoch", fmt(stats.high)],
          ["Tief", fmt(stats.low)],
          ["Ø", fmt(stats.average, 1)],
          ...(period.volume
            ? [
                [
                  "Zu / Ab",
                  `${period.volume.up.reduce((a, b) => a + b, 0)} / ${period.volume.down.reduce((a, b) => a + b, 0)}`,
                ],
              ]
            : []),
        ]
      : [
          [STEP_BEST[period.step], fmt(stats.high)],
          [`Ø je ${period.step}`, fmt(stats.average, 1)],
        ];
  return (
    <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-white/15 pt-2.5">
      {items.map(([term, value]) => (
        <div key={term}>
          <dt className="text-2xs font-semibold tracking-wide text-white uppercase">{term}</dt>
          <dd className="text-sm font-bold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Hülle jeder Kennzahlenkarte (seit 02.10.2026, Mischung aus den Entwürfen 2 und 5): kräftiger Farbverlauf des Bereichs mit
 * weißer Schrift, ein heller Schein in der Ecke oben rechts und ein farbiger Schimmer unter der Karte (`KPI_ACCENT`). Oben Symbol
 * und Beschriftung, bei Links rechts ein kleiner Pfeil („führt weiter“) – nur, wenn die Karte breit genug ist (ab 15 rem).
 *
 * Breitenabfragen (`@container/kpi`) hängen nicht an der Karte, sondern an Kopf, Zahlenbereich und Kurszeile: Ein Container
 * kann im Raster keine gemeinsamen Zeilen mit den Nachbarkarten teilen (`kpi-row` in globals.css). Diese Teile sind so breit
 * wie die Karte ohne ihren Innenabstand (2,5 rem) – 15 rem Kartenbreite sind deshalb 12,5 rem im Container.
 *
 * Die ganze Karte führt weiter: Der Link umfasst Kopf, Zahl und Sätze und dehnt seine Klickfläche über die Karte (`after`).
 * Was darüber liegt und selbst bedienbar ist (Zeitraum-Knöpfe, Kurs mit Infofeld), steht außerhalb des Links (`extra`) –
 * Knöpfe in einem Link wären ungültig; der Kurs liegt in einem zweiten, für Tastatur und Screenreader verborgenen Link zum
 * selben Ziel (`QuoteLink`). Der Fokusrahmen sitzt an der Karte selbst (`has-…:focus-visible`), der Rand der Karte schnitte
 * ihn sonst ab. Beim Überfahren leuchtet die Karte stärker, sie hebt sich aber nicht an.
 */
export function KpiShell({
  label,
  accent,
  href,
  icon,
  density,
  children,
  extra,
}: {
  label: string;
  accent: KpiAccent;
  href?: string;
  icon: React.ReactNode;
  density: BlockSize;
  children: React.ReactNode;
  extra?: React.ReactNode;
}) {
  const colors = KPI_ACCENT[accent];
  const head = (
    <>
      <div className="@container/kpi flex items-start gap-2.5">
        <span
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/18 inset-ring inset-ring-white/20 [&_svg]:size-4"
          aria-hidden="true"
        >
          {icon}
        </span>
        {/* Stehen drei oder vier Karten in einer Reihe, teilen sie sich die Zeile des Kopfs (`kpi-row` in globals.css). */}
        <p data-slot="kpi-label" className="min-w-0 flex-1 pt-1 text-sm leading-snug font-semibold">
          {label}
        </p>
        {href && (
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/12 inset-ring inset-ring-white/15 transition-colors duration-200 group-hover/card:bg-white/25 motion-reduce:transition-none @max-[12.5rem]/kpi:hidden"
          >
            <ArrowUpRightIcon className="size-4" />
          </span>
        )}
      </div>
      {/* Zahl und Sätze in einer Hülle: In einer Reihe (`kpi-row`) ist sie die zweite gemeinsame Zeile. */}
      <div className="@container/kpi">{children}</div>
    </>
  );
  return (
    <Card
      data-kpi={label}
      className={cn(
        "relative isolate h-full gap-0 rounded-2xl bg-linear-160 py-0 text-white shadow-[0_22px_40px_-24px_var(--kpi-glow),0_10px_20px_-14px_var(--kpi-glow)] inset-shadow-[0_1px_0_rgb(255_255_255/0.28)] ring-white/15 dark:ring-white/10",
        "has-[[data-slot=kpi-link]:focus-visible]:ring-2 has-[[data-slot=kpi-link]:focus-visible]:ring-ring has-[[data-slot=kpi-link]:focus-visible]:ring-offset-2 has-[[data-slot=kpi-link]:focus-visible]:ring-offset-background",
        colors.card,
        href &&
          cn(
            // Beim Drücken gibt die Karte minimal nach (Rückmeldung, dass der Klick ankam) – nur über ihren Link, nicht über die
            // Zeitraum-Knöpfe darin.
            "transition-[background-color,box-shadow,scale] duration-200 ease-out has-[[data-slot=kpi-link]:active]:scale-[0.985] motion-reduce:transition-none",
            colors.hover,
          ),
      )}
    >
      {/* Der Schein sitzt genau in der Ecke und reicht nur bis zum Pfeil: Weiter innen hellte er den Grund hinter der Beschriftung
          auf (weiße Schrift unter 4,5 : 1); geprüft in tests/unit/dashboard-contrast.test.ts. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 -right-28 -z-10 size-56 rounded-full bg-[radial-gradient(circle_closest-side,rgb(255_255_255/0.1),transparent_60%)]"
      />
      {/* Spalte über die volle Kartenhöhe: Der Kurs rückt an den unteren Rand (`mt-auto`), damit er bei allen Karten einer Reihe
          auf einer Linie liegt – auch wenn ein Satz umbricht. */}
      <CardContent className={cn("flex flex-1 flex-col px-5", KPI_DENSITY[density].content)}>
        {href ? (
          <Link
            href={href}
            data-slot="kpi-link"
            data-kpi-main=""
            className="block rounded-xl after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:outline-hidden"
          >
            {head}
          </Link>
        ) : (
          <div data-kpi-main="">{head}</div>
        )}
        {extra}
      </CardContent>
    </Card>
  );
}

/** Kurs unten auf der Karte mit Zeitraum-Knöpfen und – bei „Groß“ – Hoch/Tief/Ø darunter. */
function QuoteArea({
  label,
  quote,
  period,
  onPeriod,
  density,
  hero,
  href,
}: {
  label: string;
  quote: Quote;
  period: QuotePeriod;
  onPeriod: (id: string) => void;
  density: BlockSize;
  hero: boolean;
  href?: string;
}) {
  const dims = KPI_DENSITY[density];
  const format = (value: number) => formatNumber(value, quote.unit.decimals);
  // Summen beginnen mit dem Startpunkt 0 – die Beschriftung nennt den ersten echten Abschnitt („Jan 26 – jetzt“).
  const first = quote.kind === "total" ? period.points[1] : period.points[0];
  return (
    <div className={cn("flex flex-col pt-4", !hero && "mt-auto", hero && "@bento/kpis:pt-5")}>
      {hero && (
        <div className="mb-2 hidden justify-end @bento/kpis:flex">
          <PeriodSwitch label={label} quote={quote} value={period.id} onChange={onPeriod} />
        </div>
      )}
      <QuoteLink href={href} className="-mx-5">
        <QuoteChart
          key={period.id}
          points={period.points}
          format={format}
          describe={(value) => withUnit(quote, value)}
          detailClassName={hero ? "@bento/kpis:block" : undefined}
          syntheticStart={quote.kind === "total"}
          // Zu- und Abgänge unter dem Kurs: bei „Groß“ und auf der großen Kachel im Raster
          volume={
            period.volume && (density === "l" || hero)
              ? { ...period.volume, label: "Zu- / Abgänge" }
              : undefined
          }
          className={cn(dims.chart, hero && dims.heroChart)}
        />
      </QuoteLink>
      <div
        className={cn(
          "@container/kpi mt-2 flex items-center justify-between gap-2",
          hero && "@bento/kpis:hidden",
        )}
      >
        <PeriodSwitch label={label} quote={quote} value={period.id} onChange={onPeriod} />
        {/* In schmalen Karten (unter 17 rem) entfällt die Beschriftung (sie würde zu „KW …“ abgeschnitten); die Knöpfe nennen
            den Zeitraum. */}
        <span
          aria-hidden="true"
          className="truncate text-xs font-medium whitespace-nowrap text-white @max-[14.5rem]/kpi:hidden"
        >
          {first?.label} – <span className="font-bold">jetzt</span>
        </span>
      </div>
      {/* Hoch/Tief/Ø bei „Groß“ (auf der großen Kachel steht stattdessen die Aufteilung nach Status) */}
      {dims.stats && <QuoteStats quote={quote} period={period} />}
    </div>
  );
}

/**
 * Der Kurs als zweiter Link zum selben Ziel wie die Karte: So führt auch ein Klick auf die Kurve weiter (samt Mittelklick und
 * „in neuem Tab öffnen“), ohne einen zweiten Tabulator-Halt – für Tastatur und Screenreader ist er verborgen, dort genügt der
 * Link der Karte. Ohne Ziel bleibt es ein einfacher Block.
 */
function QuoteLink({
  href,
  className,
  children,
}: {
  href?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return href ? (
    <Link
      href={href}
      tabIndex={-1}
      aria-hidden="true"
      className={cn("relative z-10 block cursor-pointer", className)}
    >
      {children}
    </Link>
  ) : (
    <div className={cn("relative z-10", className)}>{children}</div>
  );
}

/**
 * Ansage nach einem Wechsel des Zeitraums (für Screenreader): Die Veränderung steht im Link der Karte, also vor den Knöpfen –
 * ohne Ansage müsste man zurückspringen, um das Ergebnis zu hören. Beim Laden der Seite bleibt sie still.
 */
function usePeriod(quote: Quote | undefined, label: string) {
  const [periodId, setPeriodId] = useState(quote?.defaultPeriod);
  const [announcement, setAnnouncement] = useState("");
  const period = quote?.periods.find((entry) => entry.id === periodId) ?? quote?.periods[0];
  function choose(id: string) {
    setPeriodId(id);
    const next = quote?.periods.find((entry) => entry.id === id);
    if (quote && next) {
      const { amount, percent } = changeText(quote, next);
      setAnnouncement(`${label}: ${amount}${percent ? ` ${percent}` : ""} ${next.since}`);
    }
  }
  const live = (
    <span aria-live="polite" className="sr-only">
      {announcement}
    </span>
  );
  return { period, choose, live };
}

export function StatCard({
  label,
  accent,
  value,
  hint,
  compare,
  href,
  icon,
  quote,
  size = "regular",
  density = DEFAULT_BLOCK_SIZE,
  breakdown,
}: {
  label: string;
  /** Farbe des Bereichs (Mitglieder blau, Termine violett, Helferplätze grün, Stunden orange). */
  accent: KpiAccent;
  value: React.ReactNode;
  hint?: React.ReactNode;
  /** Kurzer Vergleich zum Vormonat/zur letzten Woche o. Ä. („+3 gegenüber dem Vormonat“); Schild nach `tone`. */
  compare?: Compare;
  href?: string;
  icon: React.ReactNode;
  /** Kursverlauf („wie eine Aktie“): Veränderung, Kurve und Zeiträume; ohne Angabe nur Zahl und Satz. */
  quote?: Quote;
  size?: StatSize;
  /** Eigene Größe der Kennzahlen („Anpassen“): Klein ohne Kurve, Mittel (Standard) kompakt, Groß mit Hoch/Tief/Ø. */
  density?: BlockSize;
  /** Nur auf der großen Kachel (`hero`): Aufteilung unter dem Kurs, füllt die Kachel bis zum Boden (`StatusBreakdown`). */
  breakdown?: React.ReactNode;
}) {
  const hero = size === "hero";
  const dims = KPI_DENSITY[density];
  const { period, choose, live } = usePeriod(quote, label);
  const chart = Boolean(quote && period && density !== "s" && period.points.length > 1);
  return (
    <KpiShell
      label={label}
      accent={accent}
      href={href}
      icon={icon}
      density={density}
      extra={
        chart ? (
          <>
            <QuoteArea
              label={label}
              quote={quote!}
              period={period!}
              onPeriod={choose}
              density={density}
              hero={hero}
              href={href}
            />
            {hero && breakdown && (
              <div className="mt-auto hidden pt-5 @bento/kpis:block">{breakdown}</div>
            )}
            {live}
          </>
        ) : !quote ? (
          // Ohne Kurs (z. B. „Ungelesen“): das Symbol groß und blass in der Ecke, damit die Karte nicht leer wirkt.
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-6 -bottom-8 -z-10 size-36 -rotate-12 text-white/10 [&_svg]:size-full"
          >
            {icon}
          </span>
        ) : null
      }
    >
      <KpiValue className={cn(dims.value, hero && dims.heroValue)}>{value}</KpiValue>
      {quote && period && (
        <div className="mt-2.5">
          <ChangeChip quote={quote} period={period} />
        </div>
      )}
      {hint && <p className="mt-2 text-sm font-medium text-white/95">{hint}</p>}
      {compare && <CompareLine compare={compare} className="mt-2" />}
    </KpiShell>
  );
}

/**
 * Freie Helferplätze: die Zahl mit dem Vergleichssatz, dazu der Kurs der Besetzung (besetzte Plätze der heute offenen
 * Schichten je Woche) mit Veränderung („▲ +6 Plätze in 6 Wochen“). Im Kachelraster steht sie seit 17.10.2026 (Entwurf 4) nur
 * noch eine Reihe hoch rechts oben – ohne geplante Schichten bleibt sie so kurz (Zahl und „Keine Schichten geplant“).
 */
export function FreeShiftsCard({
  freeSpots,
  compare,
  quote,
  required,
  density = DEFAULT_BLOCK_SIZE,
  icon,
}: {
  freeSpots: number;
  required: number;
  compare: Compare;
  quote: Quote;
  density?: BlockSize;
  icon: React.ReactNode;
}) {
  const label = "Freie Helferplätze";
  const href = "/helferplanung";
  const dims = KPI_DENSITY[density];
  const { period: chosen, choose, live } = usePeriod(quote, "Besetzung");
  const period = chosen!;
  const chart = required > 0 && density !== "s";

  return (
    <KpiShell
      label={label}
      accent="emerald"
      href={href}
      icon={icon}
      density={density}
      extra={
        <>
          {chart && (
            <QuoteArea
              label={label}
              quote={quote}
              period={period}
              onPeriod={choose}
              density={density}
              hero={false}
              href={href}
            />
          )}
          {live}
        </>
      }
    >
      <KpiValue className={dims.value}>
        <CountUp value={freeSpots} />
      </KpiValue>
      {required > 0 && (
        <div className="mt-2.5">
          <ChangeChip quote={quote} period={period} />
        </div>
      )}
      <CompareLine compare={compare} className="mt-2" />
    </KpiShell>
  );
}

/** Deckkraft je Status auf der farbigen Kachel – fest je Status (nicht nach Rang), damit die Farbe zum Eintrag gehört. */
const STATUS_SHADE: Record<string, string> = {
  ACTIVE: "bg-white",
  PASSIVE: "bg-white/70",
  HONORARY: "bg-white/50",
  BLOCKED: "bg-white/35",
  LEFT: "bg-white/25",
};

/**
 * Aufteilung der Mitglieder nach Status auf der großen Mitglieder-Kachel (Entwurf 4): ein geteilter Balken in Weißtönen und
 * darunter die Liste mit Anzahl und Anteil. Die Bedeutung steht immer im Text; der Balken ist nur Zierde (`aria-hidden`).
 */
export function StatusBreakdown({
  title,
  items,
}: {
  title: string;
  items: readonly { key: string; label: string; count: number }[];
}) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  if (total === 0) return null;
  const share = (count: number) => Math.round((count / total) * 100);
  return (
    <div className="border-t border-white/15 pt-4">
      <p className="text-sm font-semibold">{title}</p>
      <div aria-hidden="true" className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {items.map((item) => (
          <span
            key={item.key}
            className={cn(
              "h-full first:rounded-l-full last:rounded-r-full",
              STATUS_SHADE[item.key],
            )}
            style={{ flexGrow: item.count, flexBasis: 0 }}
          />
        ))}
      </div>
      <dl className="mt-3 grid gap-1.5 text-sm">
        {items.map((item) => (
          <div key={item.key} className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className={cn("size-2.5 shrink-0 rounded-[3px]", STATUS_SHADE[item.key])}
            />
            <dt className="min-w-0 flex-1 truncate font-medium">{item.label}</dt>
            <dd className="font-bold tabular-nums">{formatNumber(item.count, 0)}</dd>
            <dd className="w-11 text-right text-xs font-medium tabular-nums">
              {share(item.count)} %
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
