import Link from "next/link";
import { ArrowUpRightIcon, CheckIcon } from "lucide-react";
import type { Accent } from "@/components/shared/accent";
import { AREA_ICON } from "@/components/shared/area-icons";
import { SOFT_CARD_SURFACE } from "@/components/ui/surface";
import { formatNumber } from "@/lib/charts/geometry";
import { cn } from "@/lib/utils";

/**
 * Teile der Übersicht im Stil der Vorlage „Analytics“ ohne eigenen Zustand: der Ring „Aufgaben im Verein“ (läuft im Server) und
 * die kleine Verlaufslinie bzw. der Füllbalken der schmalen Karten. Die Karten mit Zeitraum-Knöpfen stehen in `kpi-studio.tsx`.
 */

/** Fokusrahmen an der Karte, sobald ihr (über die Karte gedehnter) Link den Tastaturfokus hat. */
const CARD_FOCUS =
  "has-[[data-slot=kpi-link]:focus-visible]:ring-2 has-[[data-slot=kpi-link]:focus-visible]:ring-ring has-[[data-slot=kpi-link]:focus-visible]:ring-offset-2 has-[[data-slot=kpi-link]:focus-visible]:ring-offset-background";

/** Link, der seine Klickfläche über die ganze Karte dehnt (`after`). */
const STRETCHED_LINK =
  "block rounded-xl after:absolute after:inset-0 after:rounded-3xl after:content-[''] focus-visible:outline-hidden";

const R = 40;
const C = 2 * Math.PI * R;
/** Lücke zwischen zwei Bögen (in Einheiten des Umfangs) – mit runden Enden sieht man sie als feinen Spalt. */
const GAP = 10;

/**
 * Ring aus zwei Bögen: überfällig (rot) und im Zeitplan (Markenblau, mit Verlauf). Ohne offene Aufgaben ein leerer grauer Ring mit
 * Häkchen in der Mitte. Rein schmückend – die Zahlen stehen daneben als Text.
 */
function TaskRing({ overdue, onTime }: { overdue: number; onTime: number }) {
  const total = overdue + onTime;
  const both = overdue > 0 && onTime > 0;
  const usable = C - (both ? 2 * GAP : 0);
  const overdueLength = total > 0 ? (overdue / total) * usable : 0;
  const onTimeLength = total > 0 ? (onTime / total) * usable : 0;
  return (
    <div
      aria-hidden="true"
      className="relative aspect-square w-36 shrink-0 @max-[19rem]/donut:w-28"
    >
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <defs>
          <linearGradient id="task-ring-blue" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="var(--color-blue-500)" />
            <stop offset="1" stopColor="var(--color-blue-800)" />
          </linearGradient>
        </defs>
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          strokeWidth="9"
          className="stroke-slate-100 dark:stroke-white/10"
        />
        {onTimeLength > 0 && (
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="url(#task-ring-blue)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${onTimeLength} ${C}`}
          />
        )}
        {overdueLength > 0 && (
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            strokeWidth="9"
            strokeLinecap="round"
            className="stroke-red-600 dark:stroke-red-400"
            strokeDasharray={`${overdueLength} ${C}`}
            strokeDashoffset={-(onTimeLength + (both ? GAP : 0))}
          />
        )}
      </svg>
      <span className="absolute inset-0 grid place-items-center">
        <span
          className={cn(
            "grid size-14 rotate-[-8deg] place-items-center rounded-2xl text-white [&_svg]:size-6",
            total > 0
              ? "bg-linear-150 from-blue-600 to-blue-900 shadow-[0_12px_22px_-10px_var(--color-blue-600)]"
              : "bg-emerald-600",
          )}
        >
          {total > 0 ? <AREA_ICON.aufgaben /> : <CheckIcon />}
        </span>
      </span>
    </div>
  );
}

/**
 * „Aufgaben im Verein“ als Ring (an der Stelle von „Pending Messages“ der Vorlage): offene Aufgaben groß, daneben aufgeteilt in
 * überfällig und im Zeitplan. Zahlen aus `tasks.stats` – im Rahmen dessen, was die Person sehen darf. Die ganze Karte führt zu
 * den Aufgaben.
 */
export function TasksDonutCard({
  label,
  open,
  overdue,
  mine,
}: {
  label: string;
  open: number;
  overdue: number;
  /** Davon der Person selbst zugewiesen (wird nur genannt, wenn es nicht alle sind). */
  mine?: number;
}) {
  const onTime = Math.max(0, open - overdue);
  return (
    <div
      data-slot="card"
      data-kpi={label}
      className={cn(SOFT_CARD_SURFACE, CARD_FOCUS, "@container/donut relative isolate h-full p-6")}
    >
      <Link href="/aufgaben" data-slot="kpi-link" className={STRETCHED_LINK}>
        <span className="flex items-start justify-between gap-3">
          <span className="font-semibold">{label}</span>
          <ArrowUpRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </span>
        <span className="mt-4 flex items-end justify-between gap-4">
          <span className="min-w-0">
            <span className="block text-5xl leading-none font-extrabold tracking-[-0.035em] tabular-nums">
              {formatNumber(open, 0)}{" "}
              <span className="ml-1 text-base font-medium tracking-normal text-muted-foreground">
                offen
              </span>
            </span>
            {mine !== undefined && mine !== open && (
              <span className="mt-2 block text-sm text-muted-foreground">
                davon {formatNumber(mine, 0)} für dich
              </span>
            )}
            {open === 0 ? (
              <span className="mt-6 block text-sm font-medium text-emerald-700 dark:text-emerald-300">
                Alles erledigt.
              </span>
            ) : (
              <span className="mt-6 grid gap-3">
                <LegendEntry dot="bg-red-600 dark:bg-red-400" label="Überfällig" value={overdue} />
                <LegendEntry
                  dot="bg-blue-600 dark:bg-blue-400"
                  label="Im Zeitplan"
                  value={onTime}
                />
              </span>
            )}
          </span>
          <TaskRing overdue={overdue} onTime={onTime} />
        </span>
      </Link>
    </div>
  );
}

function LegendEntry({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <span className="block">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <span aria-hidden="true" className={cn("size-2.5 rounded-full", dot)} />
        {label}
      </span>
      <span className="mt-0.5 block text-lg font-bold tabular-nums">{formatNumber(value, 0)}</span>
    </span>
  );
}

/** Farbe der Mini-Linie bzw. des Balkens je Bereich (Linie als `stroke`, Balken als Hintergrund). */
const PILL_INK: Partial<Record<Accent, { stroke: string; bar: string }>> = {
  violet: { stroke: "stroke-violet-600 dark:stroke-violet-300", bar: "bg-violet-600" },
  emerald: {
    stroke: "stroke-emerald-600 dark:stroke-emerald-300",
    bar: "bg-emerald-600 dark:bg-emerald-400",
  },
};

/** Kleine Verlaufslinie (Kurs) unter dem Text einer schmalen Karte – rein schmückend, die Zahl steht daneben. */
export function PillSparkline({
  values,
  accent,
  className,
}: {
  values: readonly number[];
  accent: Accent;
  className?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = max === min ? 50 : 90 - ((value - min) / span) * 80;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return (
    <svg
      aria-hidden="true"
      data-slot="sparkline"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn("h-7 w-full overflow-visible", className)}
    >
      <polyline
        points={points}
        fill="none"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className={PILL_INK[accent]?.stroke ?? "stroke-primary"}
      />
    </svg>
  );
}

/** Füllbalken unter dem Text einer schmalen Karte (z. B. besetzte von benötigten Plätzen) – rein schmückend. */
export function PillBar({
  value,
  total,
  accent,
}: {
  value: number;
  total: number;
  accent: Accent;
}) {
  if (total <= 0) return null;
  const share = Math.min(100, Math.max(0, (value / total) * 100));
  return (
    <span
      aria-hidden="true"
      data-slot="pill-bar"
      className="mt-2 block h-2 overflow-hidden rounded-full bg-muted"
    >
      <span
        className={cn("block h-full rounded-full", PILL_INK[accent]?.bar ?? "bg-primary")}
        style={{ width: `${share}%` }}
      />
    </span>
  );
}
