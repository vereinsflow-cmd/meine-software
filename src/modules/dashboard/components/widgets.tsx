import Link from "next/link";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  BellOffIcon,
  CakeIcon,
  CircleAlertIcon,
  CircleCheckBigIcon,
  FaceSlightlySmilingIcon,
  GiftIcon,
  PartyPopperIcon,
  TelescopeIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ACCENT,
  type Accent,
  KPI_ACCENT,
  type KpiAccent,
  TILE_ACCENT,
} from "@/components/shared/accent";
import { AREA_ICON } from "@/components/shared/area-icons";
import { FillRing, FillSegments } from "@/components/charts/fill-meter";
import { Sparkline, sparkX } from "@/components/charts/sparkline";
import { CompactEmpty as Empty } from "@/components/shared/compact-empty";
import { ExpandableList } from "@/components/shared/expandable-list";
import {
  TaskPriorityBadge,
  TaskStatusBadge,
  ToneBadge,
  type Tone,
} from "@/components/shared/status-badge";
import { auditActionLabel } from "@/lib/audit-labels";
import {
  MONTH_NAMES,
  berlinParts,
  formatCalendarDate,
  formatDateShort,
  formatDateTime,
  formatEuroFromCents,
  formatTimeRange,
  inDaysLabel,
  recentMonthLabels,
} from "@/lib/dates";
import { EVENT_TYPE_LABEL } from "@/lib/labels";
import { URGENCY_LABEL } from "@/lib/shift-health";
import { cn } from "@/lib/utils";
import { MarkPaidButton } from "@/modules/finance/components/mark-paid-button";
import { dueText } from "@/modules/finance/invoice-format";
import { QuickSignUpButton } from "@/modules/shifts/components/quick-actions";
import { FillBar, UrgencyBadge } from "@/modules/shifts/components/shift-status";
import {
  type Compare,
  hoursCompare,
  memberCompare,
  nextEventCompare,
  staffingCompare,
} from "../compare";
import { DEFAULT_BLOCK_SIZE, initialRows, type BlockSize } from "../layout-prefs";
import type { DashboardData } from "../service";
import { sortByImportance, taskRank } from "../task-order";

/**
 * Zeilen in Listenkarten (Termine, Einsätze, Geburtstage, offene Schichten): Beim Überfahren hellt die ganze Zeile sich
 * leicht auf, nicht nur der Link-Text – das macht die Zeile als Ganzes als Bedienelement erkennbar. Der negative Rand zieht
 * die Zeile bis an den Kartenrand; die Karte selbst schneidet das (`overflow-hidden`) wieder passend zur Rundung ab.
 */
const LIST_ROW =
  "-mx-(--card-spacing) px-(--card-spacing) transition-colors motion-reduce:transition-none hover:bg-muted/50";

/**
 * Rolle einer Kennzahlenkarte im Kachelraster (`KpiCarousel` mit `layout="bento"`, Breiten in `kpi-layout.ts`): `hero` = die große
 * Mitglieder-Kachel (größere Zahl, große Grafik mit Monaten), `tall` = die hohe Kachel „Freie Helferplätze“ (Ring). Schmaler als
 * das Raster sehen alle Karten gleich aus (`regular`); die Rollen gelten nur innerhalb des Rasters (Containerabfrage `kpis`).
 */
type StatSize = "regular" | "hero" | "tall";

/**
 * Maße der Kennzahlenkarten je eigener Größe („Anpassen“, `BlockSize`): „Mittel“ ist der Standard und seit 02.10.2026 etwas
 * kompakter als zuerst (auf Wunsch: „ein bisschen zu groß“) – kleinere Zahlen, flachere Grafiken, die Aufschlüsselung unter
 * dem Ring entfällt. „Groß“ ist das ursprüngliche Kachelraster, „Klein“ eine schmale Reihe ohne Grafiken.
 */
const KPI_DENSITY: Record<
  BlockSize,
  {
    content: string;
    value: string;
    heroValue: string;
    chart: boolean;
    area: string;
    bars: string;
    heroChart: string;
    heroGap: string;
  }
> = {
  s: {
    content: "pt-4 pb-4",
    value: "mt-2.5 text-3xl",
    heroValue: "",
    chart: false,
    area: "",
    bars: "",
    heroChart: "",
    heroGap: "",
  },
  m: {
    content: "pt-4 pb-3.5",
    value: "mt-3 text-4xl",
    heroValue: "@bento/kpis:mt-4 @bento/kpis:text-6xl",
    chart: true,
    area: "h-14",
    bars: "h-10",
    heroChart: "@bento/kpis:min-h-24",
    heroGap: "@bento/kpis:pt-4",
  },
  l: {
    content: "pt-5 pb-4",
    value: "mt-4 text-5xl",
    heroValue: "@bento/kpis:mt-6 @bento/kpis:text-7xl",
    chart: true,
    area: "h-16",
    bars: "h-12",
    heroChart: "@bento/kpis:min-h-32",
    heroGap: "@bento/kpis:pt-6",
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

/** Die große Zahl einer Kennzahlenkarte. */
function KpiValue({ children, className }: { children: React.ReactNode; className?: string }) {
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

/** Beschriftung unter einer Grafik, links und rechts („vor 5 Monaten“ … „jetzt“), immer einzeilig. */
function KpiCaption({ caption }: { caption: readonly [string, string] }) {
  return (
    <div
      aria-hidden="true"
      className="mt-1.5 flex justify-between gap-2 text-xs font-medium whitespace-nowrap text-white"
    >
      <span className="min-w-0 truncate">{caption[0]}</span>
      <span className="min-w-0 truncate">{caption[1]}</span>
    </div>
  );
}

/**
 * Hülle jeder Kennzahlenkarte (seit 02.10.2026, Mischung aus den Entwürfen 2 und 5): kräftiger Farbverlauf des Bereichs mit
 * weißer Schrift, ein heller Schein in der Ecke oben rechts und ein farbiger Schimmer unter der Karte (`KPI_ACCENT`). Oben Symbol
 * und Beschriftung, bei Links rechts ein kleiner Pfeil („führt weiter“) – nur, wenn die Karte breit genug ist (ab 15 rem,
 * Containerabfrage `kpi`); sonst bräuchte die Beschriftung eine Zeile mehr. Die ganze Karte ist der Link; beim Überfahren hebt
 * sie sich leicht an und leuchtet stärker (ohne Bewegung bei „Bewegung reduzieren“).
 */
function KpiShell({
  label,
  accent,
  href,
  icon,
  density,
  children,
}: {
  label: string;
  accent: KpiAccent;
  href?: string;
  icon: React.ReactNode;
  density: BlockSize;
  children: React.ReactNode;
}) {
  const colors = KPI_ACCENT[accent];
  const body = (
    <Card
      className={cn(
        "@container/kpi relative isolate h-full gap-0 rounded-[1.75rem] bg-linear-160 py-0 text-white shadow-[0_22px_40px_-24px_var(--kpi-glow),0_10px_20px_-14px_var(--kpi-glow)] inset-shadow-[0_1px_0_rgb(255_255_255/0.28)] ring-white/15 dark:ring-white/10",
        colors.card,
        href &&
          cn(
            "transition-[translate,box-shadow] duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0",
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
      {/* Spalte über die volle Kartenhöhe: Die Grafik rückt an den unteren Rand (`mt-auto`), damit sie bei allen Karten einer
          Reihe auf einer Linie liegt – auch wenn ein Vergleich umbricht. */}
      <CardContent className={cn("flex flex-1 flex-col px-5", KPI_DENSITY[density].content)}>
        <div className="flex items-start gap-2.5">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-[0.7rem] bg-white/18 inset-ring inset-ring-white/20 [&_svg]:size-4",
              href &&
                "transition-transform duration-200 group-hover/card:scale-110 motion-reduce:transition-none",
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
          {/* Stehen drei oder vier Karten in einer Reihe, reserviert das Raster zwei Zeilen (`GRID_COLUMNS` in kpi-layout.ts). */}
          <p
            data-slot="kpi-label"
            className="min-w-0 flex-1 pt-1 text-[0.9375rem] leading-snug font-semibold"
          >
            {label}
          </p>
          {href && (
            <span
              aria-hidden="true"
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/12 inset-ring inset-ring-white/15 transition-colors duration-200 group-hover/card:bg-white/25 motion-reduce:transition-none @max-[15rem]/kpi:hidden"
            >
              <ArrowUpRightIcon className="size-4" />
            </span>
          )}
        </div>
        {children}
      </CardContent>
    </Card>
  );
  return href ? (
    // `h-full`: Der Link reicht bis zum Boden seiner Rasterzelle bzw. Karussellspalte, sonst endete die Karte mit ihrem Inhalt
    // und die Karten einer Reihe wären ungleich hoch.
    <Link
      href={href}
      className="block h-full rounded-[1.75rem] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

export function StatCard({
  label,
  accent,
  value,
  hint,
  compare,
  href,
  icon,
  trend,
  trendVariant = "area",
  trendHighlight = "last",
  trendCaption,
  trendLabels,
  trendTitle,
  delta,
  size = "regular",
  density = DEFAULT_BLOCK_SIZE,
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
  /** Letzte Werte für eine kleine Trendgrafik (älteste zuerst, mind. zwei Werte); ohne Angabe entfällt sie. */
  trend?: readonly number[];
  trendVariant?: "area" | "bar";
  /** Welcher Wert „jetzt“ ist (hervorgehoben): bei Rückblicken der letzte, beim Blick nach vorn der erste. */
  trendHighlight?: "first" | "last";
  /** Beschriftung unter der Grafik, links und rechts („vor 5 Monaten“ … „jetzt“). */
  trendCaption?: readonly [string, string];
  /** Stattdessen eine Beschriftung je Wert, genau unter seinem Punkt (Monate unter der Mitgliederlinie). */
  trendLabels?: readonly string[];
  /** Nur auf der großen Kachel (`size="hero"`): Überschrift der Grafik („Letzte 6 Monate“) … */
  trendTitle?: string;
  /** … und die Veränderung als kleines Schild neben der Zahl („+3“, „±0“). */
  delta?: string;
  size?: StatSize;
  /** Eigene Größe der Kennzahlen („Anpassen“): Klein ohne Grafik, Mittel (Standard) kompakt, Groß wie das volle Raster. */
  density?: BlockSize;
}) {
  const hero = size === "hero";
  const dims = KPI_DENSITY[density];
  const chart = dims.chart && trend && trend.length > 1;
  return (
    <KpiShell label={label} accent={accent} href={href} icon={icon} density={density}>
      <div className="flex items-end gap-3">
        <KpiValue className={cn(dims.value, hero && dims.heroValue)}>{value}</KpiValue>
        {/* Wiederholt den Vergleichssatz in Kurzform (wie im Entwurf 2) – für Screenreader ausgeblendet. */}
        {hero && delta && (
          <span
            aria-hidden="true"
            className="mb-1.5 hidden rounded-full bg-white/18 px-2.5 py-0.5 text-sm font-bold tabular-nums inset-ring inset-ring-white/20 @bento/kpis:inline-block"
          >
            {delta}
          </span>
        )}
      </div>
      {hint && <p className="mt-2 text-sm font-medium text-white/95">{hint}</p>}
      {compare && <CompareLine compare={compare} className="mt-2" />}
      {chart ? (
        // Rein schmückend (`aria-hidden` in der Grafik): Zahl, Hinweis und Vergleich nennen die Lage bereits als Text.
        <div
          className={cn(
            "mt-auto flex flex-col pt-4",
            hero && cn("@bento/kpis:flex-1", dims.heroGap),
          )}
        >
          {hero && trendTitle && (
            <p
              aria-hidden="true"
              className="mb-2 hidden text-xs font-semibold tracking-[0.12em] text-white uppercase @bento/kpis:block"
            >
              {trendTitle}
            </p>
          )}
          <Sparkline
            values={trend!}
            variant={trendVariant}
            highlight={trendHighlight}
            gridClassName={hero ? "hidden @bento/kpis:inline" : undefined}
            className={cn(
              // Die Fläche reicht bis an beide Kartenränder (randlos), Balken bleiben im Innenabstand.
              trendVariant === "area" ? cn("-mx-5", dims.area) : dims.bars,
              hero && cn("@bento/kpis:h-auto @bento/kpis:flex-1", dims.heroChart),
            )}
          />
          {trendLabels ? (
            <div aria-hidden="true" className="relative -mx-5 mt-1.5 h-[1lh] text-xs font-medium">
              {trendLabels.map((text, index) => (
                <span
                  key={index}
                  className={cn(
                    "absolute top-0 -translate-x-1/2 whitespace-nowrap",
                    index === trendLabels.length - 1 ? "font-bold text-white" : "text-white/90",
                  )}
                  style={{ left: `${sparkX(index, trendLabels.length)}%` }}
                >
                  {text}
                </span>
              ))}
            </div>
          ) : (
            trendCaption && <KpiCaption caption={trendCaption} />
          )}
        </div>
      ) : (
        // Ohne Grafik (z. B. „Ungelesen“): das Symbol groß und blass in der Ecke, damit die Karte nicht leer wirkt.
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-6 -bottom-8 -z-10 size-36 -rotate-12 text-white/10 [&_svg]:size-full"
        >
          {icon}
        </span>
      )}
    </KpiShell>
  );
}

/**
 * Maße der Inhaltskarten je eigener Größe („Anpassen“). „Mittel“ (Standard) ist seit 02.10.2026 etwas enger als zuerst
 * (Innenabstand 20 statt 24 px, auf Wunsch „ein bisschen zu groß“); „Groß“ hat die ursprüngliche Luft.
 */
const WIDGET_SIZE: Record<
  BlockSize,
  { card: string; chip: string; title: string; content: string }
> = {
  s: {
    card: "[--card-spacing:--spacing(4)]",
    chip: "size-8 rounded-[0.7rem] [&_svg]:size-4",
    title: "text-base",
    content: "gap-3",
  },
  m: {
    card: "[--card-spacing:--spacing(5)]",
    chip: "size-10 rounded-[0.85rem] [&_svg]:size-5",
    title: "",
    content: "gap-4",
  },
  l: {
    card: "[--card-spacing:--spacing(6)]",
    chip: "size-10 rounded-[0.85rem] [&_svg]:size-5",
    title: "",
    content: "gap-4",
  },
};

export function Widget({
  id,
  title,
  icon,
  accent,
  description,
  children,
  more,
  action,
  emphasis = false,
  size = DEFAULT_BLOCK_SIZE,
}: {
  id: string;
  title: string;
  icon: React.ReactNode;
  accent: Accent;
  description?: string;
  children: React.ReactNode;
  more?: { href: string; label: string };
  /** Kleine Aktion rechts im Kopf der Karte (z. B. „Ausblenden“). */
  action?: React.ReactNode;
  /** Hebt die Karte als „hier ist etwas zu tun“ hervor (kräftiger Rahmen, gefüllte Symbolfläche). */
  emphasis?: boolean;
  /** Eigene Größe („Anpassen“): Klein enger und mit kleinerem Kopf, Groß mit mehr Luft (und über die volle Breite, `CardGrid`). */
  size?: BlockSize;
}) {
  const dims = WIDGET_SIZE[size];
  return (
    <section aria-labelledby={id} className="h-full">
      {/* Kachel wie im Entwurf 2: große Rundung, weicher Schein in der Farbe des Bereichs, etwas mehr Innenabstand. */}
      <Card
        className={cn(
          "h-full rounded-[1.75rem] dark:inset-shadow-[0_1px_0_rgb(255_255_255/0.05)]",
          dims.card,
          TILE_ACCENT[accent].surface,
          emphasis && "ring-2 ring-primary/50 dark:ring-primary/60",
        )}
      >
        <CardHeader>
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex shrink-0 items-center justify-center",
                dims.chip,
                emphasis ? "bg-primary text-primary-foreground" : TILE_ACCENT[accent].chip,
              )}
              aria-hidden="true"
            >
              {icon}
            </span>
            <div className="min-w-0 flex-1">
              {/* Ebene 3: Die Gruppen des Dashboards („Für dich“, „Anstehend“ …) tragen die Ebene-2-Überschriften. */}
              <CardTitle id={id} role="heading" aria-level={3} className={dims.title}>
                {title}
              </CardTitle>
              {description && <CardDescription className="mt-0.5">{description}</CardDescription>}
            </div>
            {action && <div className="shrink-0 self-start">{action}</div>}
          </div>
        </CardHeader>
        <CardContent className={cn("flex flex-1 flex-col", dims.content)}>
          {children}
          {more && (
            <Link
              href={more.href}
              className="group mt-auto inline-flex w-fit items-center gap-1.5 rounded-md pt-1 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {more.label}{" "}
              <ArrowRightIcon
                className="size-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </Link>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

/** Datumsfläche (Monat über Tag) zum schnellen Überfliegen von Terminlisten; der Text daneben nennt das Datum ausgeschrieben. */
function DateTile({ value, accent }: { value: Date | string; accent: Accent }) {
  const { day, month } = berlinParts(value);
  return (
    <div
      className={cn(
        "flex size-12 shrink-0 flex-col items-center justify-center rounded-xl leading-none",
        ACCENT[accent].tile,
      )}
      aria-hidden="true"
    >
      <span className="text-xs font-semibold tracking-wider uppercase">
        {MONTH_NAMES[month - 1].slice(0, 3)}
      </span>
      <span className="mt-0.5 text-lg font-bold">{day}</span>
    </div>
  );
}

export function StaffingWarnings({
  warnings,
}: {
  warnings: NonNullable<DashboardData["shifts"]>["warnings"];
}) {
  if (warnings.length === 0) return null;
  return (
    // Wie in den Entwürfen 2 und 5: bernsteinfarbene Kachel mit kräftigem Warnsymbol, Streifen als Zierde rechts und einem runden
    // Pfeil zur Helferplanung. Die Rolle `alert` (Screenreader) und der Text bleiben wie bisher.
    <Alert
      variant="warning"
      className="relative mb-6 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 overflow-hidden rounded-[1.75rem] border border-amber-300/70 bg-linear-to-r from-amber-100 via-amber-50 to-amber-100/70 px-5 py-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] dark:border-amber-400/25 dark:from-amber-500/20 dark:via-amber-500/[0.06] dark:to-amber-500/10"
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-80 bg-[repeating-linear-gradient(-45deg,rgb(245_158_11/0.1)_0_10px,transparent_10px_22px)] [mask-image:linear-gradient(90deg,transparent,#000_70%)] sm:block"
      />
      <span
        aria-hidden="true"
        className="relative flex size-11 shrink-0 items-center justify-center rounded-full bg-amber-400 text-amber-950 shadow-[0_6px_16px_-6px_rgb(245_158_11/0.8)] [&_svg]:size-5"
      >
        <TriangleAlertIcon />
      </span>
      <div className="relative min-w-0">
        <AlertTitle className="text-base font-semibold">
          Helferschichten sind noch nicht besetzt
        </AlertTitle>
        <AlertDescription className="text-foreground/80">
          <div className="mt-1">
            <ExpandableList className="grid gap-1" initial={2} itemNoun="weitere Termine">
              {warnings.map((event) => (
                <li key={event.eventId}>
                  <Link
                    href={`/helferplanung/${event.eventId}`}
                    className="font-semibold underline underline-offset-4"
                  >
                    {event.title}
                  </Link>{" "}
                  ({formatDateShort(event.startsAt)}): {event.openShifts}{" "}
                  {event.openShifts === 1 ? "Schicht" : "Schichten"} nicht voll besetzt –{" "}
                  {URGENCY_LABEL[event.worstUrgency].toLowerCase()}
                </li>
              ))}
            </ExpandableList>
          </div>
        </AlertDescription>
      </div>
      <Link
        href="/helferplanung"
        aria-label="Zur Helferplanung"
        className="relative hidden size-11 shrink-0 items-center justify-center rounded-full bg-amber-400 text-amber-950 transition-colors hover:bg-amber-300 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none motion-reduce:transition-none sm:flex"
      >
        <ArrowRightIcon className="size-5" aria-hidden="true" />
      </Link>
    </Alert>
  );
}

export function UpcomingEvents({
  events,
  size = DEFAULT_BLOCK_SIZE,
}: {
  events: NonNullable<DashboardData["events"]>;
  size?: BlockSize;
}) {
  return (
    <Widget
      id="w-termine"
      size={size}
      title="Kommende Veranstaltungen"
      icon={<AREA_ICON.veranstaltungen />}
      accent="violet"
      more={{ href: "/kalender", label: "Zum Kalender" }}
    >
      {events.upcoming.length === 0 ? (
        <Empty icon={<TelescopeIcon />} accent="violet" title="Keine Termine in Sicht">
          Keine kommenden Veranstaltungen – neue erscheinen hier, sobald sie geplant sind.
        </Empty>
      ) : (
        <ExpandableList
          className="divide-y"
          initial={initialRows(size, 3)}
          itemNoun="weitere Termine"
        >
          {events.upcoming.map((event) => (
            <li
              key={event.id}
              className={cn("flex items-start gap-3 py-3 first:pt-0 last:pb-0", LIST_ROW)}
            >
              <DateTile value={event.startsAt} accent="violet" />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/veranstaltungen/${event.id}`}
                  className="grid gap-0.5 underline-offset-4 hover:underline"
                >
                  <span className="text-base font-semibold">{event.title}</span>
                  <span className="text-sm text-muted-foreground">
                    {formatDateShort(event.startsAt)},{" "}
                    {event.allDay ? "ganztägig" : formatTimeRange(event.startsAt, event.endsAt)} ·{" "}
                    {EVENT_TYPE_LABEL[event.type]}
                  </span>
                </Link>
                {event.shiftSummary.shifts > 0 &&
                  event.shiftSummary.filled < event.shiftSummary.required && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Helfer: {event.shiftSummary.filled} von {event.shiftSummary.required} besetzt
                    </p>
                  )}
              </div>
            </li>
          ))}
        </ExpandableList>
      )}
    </Widget>
  );
}

export function MyShifts({
  shifts,
  size = DEFAULT_BLOCK_SIZE,
}: {
  shifts: NonNullable<DashboardData["shifts"]>;
  size?: BlockSize;
}) {
  return (
    <Widget
      id="w-meine-schichten"
      size={size}
      title="Meine Einsätze"
      icon={<AREA_ICON.einsaetze />}
      accent="emerald"
      more={{ href: "/helferplanung", label: "Zur Helferplanung" }}
    >
      {shifts.mine.length === 0 ? (
        <Empty icon={<FaceSlightlySmilingIcon />} accent="emerald" title="Noch keine Einsätze">
          Du bist aktuell für keine Schicht eingetragen.
        </Empty>
      ) : (
        <ExpandableList
          className="divide-y"
          initial={initialRows(size, 3)}
          itemNoun="weitere Einsätze"
        >
          {shifts.mine.map((assignment) => (
            <li
              key={assignment.assignmentId}
              className={cn("flex items-start gap-3 py-3 first:pt-0 last:pb-0", LIST_ROW)}
            >
              <DateTile value={assignment.startsAt} accent="emerald" />
              <Link
                href={`/helferplanung/${assignment.event.id}`}
                className="grid min-w-0 flex-1 gap-0.5 underline-offset-4 hover:underline"
              >
                <span className="text-base font-semibold">{assignment.title}</span>
                <span className="text-sm text-muted-foreground">
                  {assignment.event.title} · {formatDateShort(assignment.startsAt)},{" "}
                  {formatTimeRange(assignment.startsAt, assignment.endsAt)}
                </span>
              </Link>
            </li>
          ))}
        </ExpandableList>
      )}
    </Widget>
  );
}

export function OpenShifts({
  shifts,
  size = DEFAULT_BLOCK_SIZE,
}: {
  shifts: NonNullable<DashboardData["shifts"]>;
  size?: BlockSize;
}) {
  return (
    <Widget
      id="w-offene-schichten"
      size={size}
      title="Hier werden Helfer gesucht"
      icon={<AREA_ICON.helferplanung />}
      accent="amber"
      more={{ href: "/helferplanung", label: "Alle offenen Schichten" }}
    >
      {shifts.open.length === 0 ? (
        <Empty icon={<PartyPopperIcon />} accent="emerald" title="Alle Schichten besetzt">
          Im Moment sind alle Schichten besetzt. Danke!
        </Empty>
      ) : (
        <ExpandableList
          className="divide-y"
          initial={initialRows(size, 3)}
          itemNoun="weitere Schichten"
        >
          {shifts.open.map((shift) => (
            <li
              key={shift.shiftId}
              className={cn(
                "grid gap-2 py-3 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-x-4",
                LIST_ROW,
              )}
            >
              <div className="min-w-0 sm:col-span-2">
                {/* Abzeichen („Beginnt bald“) in der Zeile des Schichtnamens – so steht „Eintragen“ unten immer an
                    derselben Stelle, mit oder ohne Abzeichen. */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link
                    href={`/helferplanung/${shift.event.id}`}
                    className="text-base font-semibold underline-offset-4 hover:underline"
                  >
                    {shift.title}
                  </Link>
                  <UrgencyBadge health={shift.health} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {shift.event.title} · {formatDateShort(shift.startsAt)},{" "}
                  {formatTimeRange(shift.startsAt, shift.endsAt)}
                </p>
              </div>
              <FillBar filled={shift.filled} required={shift.requiredCount} health={shift.health} />
              {/* Am Handy unter dem Besetzungsbalken so breit wie die Karte (gut treffbar), ab 640 px rechts daneben – die Zeile
                  wird kürzer, und die Karte steht nicht mehr viel höher als ihre Nachbarin. */}
              {shift.signup.allowed && (
                <QuickSignUpButton
                  shiftId={shift.shiftId}
                  eventId={shift.event.id}
                  size="default"
                  className="w-full rounded-full sm:w-auto"
                />
              )}
            </li>
          ))}
        </ExpandableList>
      )}
    </Widget>
  );
}

type OpenInvoiceRow = NonNullable<DashboardData["payments"]>["items"][number];

/**
 * Offene Zahlungen (nur für Rollen mit `finance:read`): oben die Summe, darunter die offenen Rechnungen – überfällige
 * rötlich, heute/morgen fällige bernsteinfarben, der Grund steht immer auch als Text da. „Bezahlt“ (nur mit
 * `finance:manage`) markiert eine Rechnung als bezahlt; die Meldung bietet „Rückgängig“ an.
 */
export function OpenPayments({
  payments,
  size = DEFAULT_BLOCK_SIZE,
}: {
  payments: NonNullable<DashboardData["payments"]>;
  size?: BlockSize;
}) {
  const soon = (invoice: OpenInvoiceRow) =>
    !invoice.overdue && invoice.dueInDays !== null && invoice.dueInDays <= 1;
  return (
    <Widget
      id="w-offene-zahlungen"
      size={size}
      title="Offene Zahlungen"
      icon={<AREA_ICON.finanzen />}
      accent="teal"
      emphasis={payments.overdueCount > 0}
      description="Rechnungen, die der Verein noch bezahlen muss"
      more={
        payments.count > 0
          ? { href: "/dokumente?rechnungen=offen", label: "Alle offenen Rechnungen" }
          : undefined
      }
    >
      {payments.count === 0 ? (
        <Empty icon={<CircleCheckBigIcon />} accent="teal" title="Alles bezahlt">
          Es gibt keine offenen Rechnungen.
        </Empty>
      ) : (
        // Ab 1024 px: links die Summe als große Zahl (wie bei den Kennzahlen), rechts die Rechnungen.
        <div className="grid gap-4 lg:grid-cols-[minmax(13rem,1fr)_minmax(0,2.2fr)] lg:items-start lg:gap-8">
          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 lg:flex-col lg:items-start lg:gap-y-1 lg:self-stretch lg:border-r lg:pr-8">
            <span className="text-3xl leading-tight font-bold tabular-nums lg:text-4xl">
              {formatEuroFromCents(payments.totalCents)}
            </span>
            <span className="text-sm text-muted-foreground">
              offen in {payments.count} {payments.count === 1 ? "Rechnung" : "Rechnungen"}
            </span>
            {payments.overdueCount > 0 && (
              <span className="text-sm font-semibold text-red-700 dark:text-red-300">
                {payments.overdueCount} überfällig
              </span>
            )}
          </p>
          <div className="grid min-w-0 gap-3">
            <ExpandableList
              className="grid gap-2.5"
              initial={initialRows(size, 3)}
              itemNoun={payments.items.length === 4 ? "weitere Rechnung" : "weitere Rechnungen"}
            >
              {payments.items.map((invoice) => {
                const due = dueText(invoice.dueInDays);
                return (
                  <li
                    key={invoice.id}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-xl border p-3",
                      invoice.overdue
                        ? "border-red-300 bg-red-50 dark:border-red-400/30 dark:bg-red-400/10"
                        : soon(invoice)
                          ? "border-amber-300 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-400/10"
                          : "bg-muted/40",
                    )}
                  >
                    <div className="min-w-0">
                      {invoice.canOpen ? (
                        <a
                          href={`/api/dokumente/${invoice.documentId}/download`}
                          className="font-semibold break-words underline-offset-4 hover:underline"
                        >
                          {invoice.name}
                        </a>
                      ) : (
                        <span className="font-semibold break-words">{invoice.name}</span>
                      )}
                      <p className="text-sm text-muted-foreground">
                        <span className="font-semibold text-foreground tabular-nums">
                          {invoice.amountCents !== null
                            ? formatEuroFromCents(invoice.amountCents)
                            : "Betrag fehlt"}
                        </span>
                        {invoice.dueDate && (
                          <span
                            className={cn(
                              invoice.overdue && "font-semibold text-red-700 dark:text-red-300",
                              soon(invoice) && "font-semibold text-amber-700 dark:text-amber-400",
                            )}
                          >
                            {" "}
                            · Fällig: {formatCalendarDate(invoice.dueDate)}
                            {due ? ` – ${due}` : ""}
                          </span>
                        )}
                      </p>
                    </div>
                    {payments.canManage && (
                      <MarkPaidButton
                        invoiceId={invoice.id}
                        name={invoice.name}
                        className="w-full rounded-full sm:w-auto"
                      />
                    )}
                  </li>
                );
              })}
            </ExpandableList>
            {payments.count > payments.items.length && (
              <p className="text-sm text-muted-foreground">
                Hier stehen die {payments.items.length} dringendsten von {payments.count} – die
                übrigen findest du unter „Alle offenen Rechnungen“.
              </p>
            )}
          </div>
        </div>
      )}
    </Widget>
  );
}

type MyTask = NonNullable<DashboardData["tasks"]>["mine"][number];

/** Zeilenfarbe: Überfällig = rötlich, hohe Priorität = bernsteinfarben. Der Grund steht immer auch als Text in der Zeile. */
function taskRowTone(task: MyTask): string {
  if (task.overdue) return "border-red-300 bg-red-50 dark:border-red-400/30 dark:bg-red-400/10";
  if (task.priority === "URGENT" || task.priority === "HIGH") {
    return "border-amber-300 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-400/10";
  }
  return "bg-muted/40";
}

export function MyTasks({
  tasks,
  organizer,
  size = DEFAULT_BLOCK_SIZE,
}: {
  tasks: NonNullable<DashboardData["tasks"]>;
  organizer: boolean;
  size?: BlockSize;
}) {
  const sorted = sortByImportance(tasks.mine);
  // Hervorhebung nur, wenn wirklich etwas drängt (überfällig/dringend/hoch) – sonst verliert sie ihre Bedeutung.
  const urgent = sorted.some((task) => taskRank(task) <= 2);
  return (
    <Widget
      id="w-aufgaben"
      size={size}
      title="Meine Aufgaben"
      icon={<AREA_ICON.aufgaben />}
      accent="blue"
      emphasis={urgent}
      description={
        organizer
          ? `Im Verein: ${tasks.stats.open} offen, ${tasks.stats.overdue} überfällig`
          : undefined
      }
      more={{ href: "/aufgaben", label: "Alle Aufgaben" }}
    >
      {sorted.length === 0 ? (
        <Empty icon={<CircleCheckBigIcon />} accent="blue" title="Alles erledigt">
          Dir sind keine offenen Aufgaben zugewiesen.
        </Empty>
      ) : (
        <ExpandableList
          className="grid gap-2.5"
          initial={initialRows(size, 3)}
          itemNoun="weitere Aufgaben"
        >
          {sorted.map((task) => (
            <li
              key={task.id}
              className={cn(
                "flex flex-wrap items-start justify-between gap-2 rounded-xl border p-3 transition-shadow hover:shadow-sm motion-reduce:transition-none",
                taskRowTone(task),
              )}
            >
              <div className="min-w-0">
                <Link
                  href="/aufgaben"
                  className="text-base font-semibold underline-offset-4 hover:underline"
                >
                  {task.title}
                </Link>
                {task.dueDate && (
                  <p
                    className={cn(
                      "text-sm",
                      task.overdue
                        ? "font-semibold text-red-700 dark:text-red-300"
                        : "text-muted-foreground",
                    )}
                  >
                    Fällig: {formatCalendarDate(task.dueDate)}
                    {task.overdue ? " – überfällig" : ""}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <TaskPriorityBadge priority={task.priority} />
                <TaskStatusBadge status={task.status} />
              </div>
            </li>
          ))}
        </ExpandableList>
      )}
    </Widget>
  );
}

export function LatestNotifications({
  notifications,
  size = DEFAULT_BLOCK_SIZE,
}: {
  notifications: DashboardData["notifications"];
  size?: BlockSize;
}) {
  return (
    <Widget
      id="w-benachrichtigungen"
      size={size}
      title="Benachrichtigungen"
      icon={<AREA_ICON.benachrichtigungen />}
      accent="amber"
      more={{ href: "/benachrichtigungen", label: "Alle Benachrichtigungen" }}
    >
      {notifications.latest.length === 0 ? (
        <Empty icon={<BellOffIcon />} accent="amber" title="Nichts Neues">
          Neue Benachrichtigungen erscheinen hier.
        </Empty>
      ) : (
        <ExpandableList className="grid gap-2" initial={initialRows(size, 3)} itemNoun="weitere">
          {notifications.latest.map((n) => (
            <li key={n.id}>
              <Link
                href={n.linkUrl ?? "/benachrichtigungen"}
                className={cn(
                  "grid gap-0.5 rounded-xl px-3 py-2.5 underline-offset-4 hover:underline",
                  n.readAt ? "hover:bg-muted" : "bg-primary/10 hover:bg-primary/15",
                )}
              >
                <span className={cn("text-base", !n.readAt && "font-semibold")}>
                  {!n.readAt && (
                    <span
                      className="mr-2 inline-block size-2.5 rounded-full bg-primary align-middle"
                      aria-hidden="true"
                    />
                  )}
                  {!n.readAt && <span className="sr-only">Ungelesen: </span>}
                  {n.title}
                </span>
                <span className="text-sm text-muted-foreground">
                  {formatDateTime(n.createdAt)} Uhr
                </span>
              </Link>
            </li>
          ))}
        </ExpandableList>
      )}
    </Widget>
  );
}

export function Birthdays({
  birthdays,
  size = DEFAULT_BLOCK_SIZE,
}: {
  birthdays: NonNullable<DashboardData["birthdays"]>;
  size?: BlockSize;
}) {
  return (
    <Widget
      id="w-geburtstage"
      size={size}
      title="Geburtstage"
      icon={<CakeIcon />}
      accent="rose"
      description="In den nächsten 14 Tagen"
    >
      {birthdays.length === 0 ? (
        <Empty icon={<GiftIcon />} accent="rose" title="Keine Geburtstage">
          Niemand feiert in diesem Zeitraum.
        </Empty>
      ) : (
        <ExpandableList className="divide-y" initial={initialRows(size, 3)} itemNoun="weitere">
          {birthdays.map((b) => (
            <li
              key={b.memberId}
              className={cn("flex items-center gap-3 py-2.5 first:pt-0 last:pb-0", LIST_ROW)}
            >
              <DateTile value={b.date} accent="rose" />
              <div className="grid min-w-0 gap-0.5">
                <Link
                  href={`/mitglieder/${b.memberId}`}
                  className="text-base font-semibold underline-offset-4 hover:underline"
                >
                  {b.name}
                </Link>
                <span className="text-sm text-muted-foreground">
                  wird {b.turns} ·{" "}
                  <span className="whitespace-nowrap">
                    {formatDateShort(b.date)} ({inDaysLabel(b.inDays)})
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ExpandableList>
      )}
    </Widget>
  );
}

const actorName = (actor: NonNullable<DashboardData["activity"]>[number]["actor"]) =>
  actor.kind === "USER" ? actor.name : actor.kind === "SYSTEM" ? "System" : "Unbekannt";

/** Die letzten Ereignisse im Verein – nur für Rollen mit Zugriff auf das Änderungsprotokoll (Anmeldungen zählen nicht). */
export function RecentActivity({
  entries,
  size = DEFAULT_BLOCK_SIZE,
}: {
  entries: NonNullable<DashboardData["activity"]>;
  size?: BlockSize;
}) {
  return (
    <Widget
      id="w-aktivitaeten"
      size={size}
      title="Letzte Aktivitäten"
      icon={<AREA_ICON.protokoll />}
      accent="slate"
      more={{ href: "/protokoll", label: "Zum Änderungsprotokoll" }}
    >
      {entries.length === 0 ? (
        <Empty icon={<AREA_ICON.protokoll />} accent="slate" title="Noch nichts passiert">
          Änderungen im Verein erscheinen hier.
        </Empty>
      ) : (
        <ExpandableList className="divide-y" initial={initialRows(size, 4)} itemNoun="weitere">
          {entries.map((entry) => {
            const label = auditActionLabel(entry.action);
            // Der Text dahinter nennt Näheres (z. B. den Namen); wiederholt er nur die Überschrift, entfällt er.
            const detail = entry.summary?.trim();
            return (
              <li key={entry.id} className="grid gap-0.5 py-3 first:pt-0 last:pb-0">
                <span className="text-base font-semibold">{label}</span>
                {detail && detail !== label && (
                  <span className="line-clamp-2 text-sm text-muted-foreground">{detail}</span>
                )}
                <span className="text-sm text-muted-foreground">
                  {actorName(entry.actor)} · {formatDateTime(entry.createdAt)} Uhr
                </span>
              </li>
            );
          })}
        </ExpandableList>
      )}
    </Widget>
  );
}

/** „vor 5 Monaten“, „vor 1 Woche“ – Beschriftung am Anfang einer rückblickenden Mini-Grafik. */
const agoText = (count: number, singular: string, plural: string) =>
  `vor ${count} ${count === 1 ? singular : plural}`;

/** Veränderung des letzten Werts gegenüber dem vorletzten als kurzes Schild: „+3“, „−2“ (echtes Minuszeichen), „±0“. */
function signedDelta(trend: readonly number[]): string | undefined {
  if (trend.length < 2) return undefined;
  const diff = trend.at(-1)! - trend.at(-2)!;
  return diff > 0 ? `+${diff}` : diff < 0 ? `−${-diff}` : "±0";
}

export function MembersStat({
  members,
  size,
  density,
}: {
  members: NonNullable<DashboardData["members"]>;
  size?: StatSize;
  density?: BlockSize;
}) {
  return (
    <StatCard
      label={members.scope === "CLUB" ? "Mitglieder" : "Mitglieder (deine Abteilung)"}
      accent="blue"
      value={members.total}
      compare={memberCompare(members.trend) ?? undefined}
      href="/mitglieder"
      icon={<AREA_ICON.mitglieder />}
      trend={members.trend}
      // Ein Wert je Monat bis einschließlich des laufenden – dieselben Monate wie `members.trend`.
      trendLabels={recentMonthLabels(members.trend.length)}
      trendTitle={`Letzte ${members.trend.length} Monate`}
      delta={signedDelta(members.trend)}
      size={size}
      density={density}
    />
  );
}

export function NextEventsStat({
  events,
  density,
}: {
  events: NonNullable<DashboardData["events"]>;
  density?: BlockSize;
}) {
  return (
    <StatCard
      density={density}
      label="Termine in 30 Tagen"
      accent="violet"
      value={events.countNext30Days}
      compare={
        nextEventCompare(events.nextInDays) ?? {
          text: "Keine kommenden Termine",
          tone: "neutral",
        }
      }
      href="/veranstaltungen"
      icon={<AREA_ICON.veranstaltungen />}
      // events.weeklyTrend blickt nach vorn (diese Woche zuerst) – die Grafik ebenso: links „jetzt“ hervorgehoben, nach rechts
      // die kommenden Wochen (beschriftet, damit die Richtung klar ist).
      trend={events.weeklyTrend}
      trendVariant="bar"
      trendHighlight="first"
      trendCaption={[
        "jetzt",
        `in ${events.weeklyTrend.length - 1} ${events.weeklyTrend.length - 1 === 1 ? "Woche" : "Wochen"}`,
      ]}
    />
  );
}

/** Farbe des besetzten Teils im Ring (und des Satzes darunter) nach Besetzung: voll weiß, teilweise bernsteinfarben. */
const RING_TONE: Record<Tone, { ring?: string; text: string; swatch: string }> = {
  neutral: { text: "text-white/95", swatch: "bg-white" },
  ended: { text: "text-white/95", swatch: "bg-white" },
  info: { text: "text-white", swatch: "bg-white" },
  success: { text: "text-white", swatch: "bg-white" },
  warning: { ring: "stroke-amber-300", text: "text-amber-200", swatch: "bg-amber-300" },
  danger: { ring: "stroke-red-300", text: "text-red-200", swatch: "bg-red-300" },
};

/**
 * Freie Helferplätze: auf normalen Karten die Zahl mit einer Leiste (ein Stück je Platz, besetzte weiß); als hohe Kachel im
 * Raster (`size="tall"`, wie im Entwurf 2) ein Ring mit der Zahl in der Mitte und darunter besetzt/frei/Auslastung. Beide
 * Fassungen stehen im Code, sichtbar ist je nach Breite genau eine (die andere ist `display: none` und damit auch für
 * Screenreader nicht da – nichts wird doppelt vorgelesen).
 */
export function FreeShiftsStat({
  shifts,
  size,
  density = DEFAULT_BLOCK_SIZE,
}: {
  shifts: NonNullable<DashboardData["shifts"]>;
  size?: StatSize;
  density?: BlockSize;
}) {
  const dims = KPI_DENSITY[density];
  const big = density === "l";
  const { filled, required } = shifts.staffing;
  const compare = staffingCompare(filled, required);
  const tall = size === "tall";
  // Gerundet, aber nie „100 %“, solange noch Plätze frei sind, und nie „0 %“, sobald einer besetzt ist.
  const percent =
    required <= 0 || filled <= 0
      ? 0
      : filled >= required
        ? 100
        : Math.min(99, Math.max(1, Math.round((filled / required) * 100)));
  // Drei- und vierstellige Zahlen passen sonst nicht in die Öffnung des Rings.
  const ringNumber = big
    ? shifts.freeSpots >= 1000
      ? "text-4xl"
      : shifts.freeSpots >= 100
        ? "text-5xl"
        : "text-6xl"
    : shifts.freeSpots >= 1000
      ? "text-3xl"
      : shifts.freeSpots >= 100
        ? "text-4xl"
        : "text-5xl";
  return (
    <KpiShell
      label="Freie Helferplätze"
      accent="emerald"
      href="/helferplanung"
      icon={<AREA_ICON.helferplanung />}
      density={density}
    >
      <div className={cn("flex flex-1 flex-col", tall && "@bento/kpis:hidden")}>
        <KpiValue className={dims.value}>{shifts.freeSpots}</KpiValue>
        <CompareLine compare={compare} className="mt-2" />
        {required > 0 && dims.chart && (
          <div className="mt-auto pt-4">
            <FillSegments filled={filled} total={required} className={big ? "h-7" : "h-6"} />
            <KpiCaption caption={["leer", "alle besetzt"]} />
          </div>
        )}
      </div>
      {tall && (
        <div className="hidden flex-1 flex-col items-center gap-4 @bento/kpis:flex">
          {/* Ring und Satz stehen mittig im freien Platz über der Aufschlüsselung – statt eines leeren Streifens darüber. */}
          <div className="flex w-full flex-1 flex-col items-center justify-center gap-4 pt-3">
            <FillRing
              filled={filled}
              total={required}
              fillClassName={RING_TONE[compare.tone].ring}
              className={cn("w-full", big ? "max-w-44" : "max-w-36")}
            >
              <p
                data-slot="kpi-value"
                className={cn(
                  "leading-none font-extrabold tracking-[-0.035em] tabular-nums [text-shadow:0_2px_12px_rgb(0_0_0/0.12)]",
                  ringNumber,
                )}
              >
                {shifts.freeSpots}
              </p>
              <p className="mt-1 text-sm font-medium text-white/95">
                {shifts.freeSpots === 1 ? "Platz frei" : "Plätze frei"}
              </p>
            </FillRing>
            {/* Wie im Entwurf 2: der Satz in der Farbe des Rings, ohne Schild – in der schmalen Kachel bräche ein Schild auf drei
                Zeilen um. Helles Bernstein/Rot auf dem dunklen Grün hat genug Kontrast (tests/unit/dashboard-contrast.test.ts). */}
            <p
              className={cn(
                "text-center text-sm font-semibold text-balance",
                RING_TONE[compare.tone].text,
              )}
            >
              {compare.tone === "warning" && (
                <TriangleAlertIcon
                  className="mr-1 inline size-3.5 -translate-y-px align-middle"
                  aria-hidden="true"
                />
              )}
              {compare.text}
            </p>
          </div>
          {required > 0 && big && (
            // Wiederholt nur, was Zahl und Vergleich schon sagen – deshalb für Screenreader ausgeblendet; nur bei „Groß“.
            <dl
              aria-hidden="true"
              className="grid w-full gap-2 rounded-2xl bg-black/15 p-3.5 text-sm ring-1 ring-white/10"
            >
              <div className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-2 text-white/90">
                  <span className={cn("size-2.5 rounded-[3px]", RING_TONE[compare.tone].swatch)} />{" "}
                  besetzt
                </dt>
                <dd className="font-semibold tabular-nums">{filled}</dd>
              </div>
              <div className="flex items-center justify-between gap-2">
                <dt className="flex items-center gap-2 text-white/90">
                  <span className="size-2.5 rounded-[3px] bg-white/30" /> frei
                </dt>
                <dd className="font-semibold tabular-nums">{shifts.freeSpots}</dd>
              </div>
              {/* Darf umbrechen, statt über den Rand zu ragen, falls die Kachel einmal sehr schmal wird. */}
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-white/15 pt-2">
                <dt className="text-white/90">Auslastung</dt>
                <dd className="rounded-full bg-white/18 px-2 py-0.5 text-xs font-bold whitespace-nowrap tabular-nums">
                  {percent} %
                </dd>
              </div>
            </dl>
          )}
        </div>
      )}
    </KpiShell>
  );
}

/** Kompakt für die Kennzahlenkarte: „4,5 Std.“ statt „4 Std. 30 Min.“; die Einheit etwas kleiner neben der Zahl. */
function compactHours(minutes: number) {
  return (
    <>
      {(minutes / 60).toLocaleString("de-DE", { maximumFractionDigits: 1 })}{" "}
      <span className="text-[0.55em] font-bold tracking-normal">Std.</span>
    </>
  );
}

export function HelperHours({
  hours,
  density,
}: {
  hours: NonNullable<DashboardData["shifts"]>["hours"];
  density?: BlockSize;
}) {
  return (
    <StatCard
      density={density}
      label={
        hours.scope === "ALL" ? `Helferstunden ${hours.year}` : `Meine Helferstunden ${hours.year}`
      }
      accent="amber"
      value={compactHours(hours.minutes)}
      compare={hoursCompare(hours.trend) ?? undefined}
      href="/helferplanung/stunden"
      icon={<AREA_ICON.helferstunden />}
      trend={hours.trend}
      trendVariant="bar"
      trendCaption={[agoText(hours.trend.length - 1, "Woche", "Wochen"), "jetzt"]}
    />
  );
}

export { ToneBadge };
