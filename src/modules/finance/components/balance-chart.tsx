"use client";

import { useId, useRef, useState } from "react";
import { formatCalendarDate, formatEuroFromCents } from "@/lib/dates";
import { linePath } from "@/lib/charts/geometry";
import { cn } from "@/lib/utils";
import {
  curveDay,
  curveExtremes,
  curveTicks,
  describeCurve,
  monthEndRows,
  weekdayLabel,
  type BalanceCurve,
} from "../balance-curve";
import { FINANCE_GLASS } from "../hero-look";

const W = 1000;
const H = 200;
/**
 * Band der Linie: oben ein Fünftel Luft für das Schild „Hoch“ (es steht über seinem Punkt und darf nicht in die Zeile mit „Als
 * Tabelle“ ragen), unten ein Fünftel für das Schild „Tief“ unter seinem Punkt.
 */
const TOP = 40;
const BAND = 120;

/** Höhe von Grafik samt Achse – die Tabelle nimmt genau denselben Platz ein, damit beim Umschalten nichts springt. */
const PLOT_HEIGHT = "h-40 sm:h-44";
const BOX_HEIGHT = "h-46 sm:h-50";

/**
 * Kontoverlauf im Kopf der Übersicht: Gesamtstand am Ende jedes Tages als leuchtende Linie (weiß mit blauem Schein) über
 * einer nach unten ausblendenden Fläche, Monatsanfänge als feine Linien, Hoch und Tief beschriftet, „Heute“ als Punkt am Ende.
 * Am Zeiger zeigt ein Infofeld Tag und Stand. Die Grafik ist für Screenreader ein Bild mit einem Satz als Namen
 * (`describeCurve`); „Als Tabelle“ (`aria-pressed`) zeigt stattdessen den Stand am Ende jedes Monats – gleich hoch wie die
 * Grafik. Linien bleiben beim Strecken dünn (`non-scaling-stroke`), Punkte sind HTML und bleiben rund.
 */
export function BalanceChart({ curve }: { curve: BalanceCurve }) {
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const plot = useRef<HTMLDivElement>(null);
  const id = useId();
  const { values } = curve;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const last = values.length - 1;
  const x = (index: number) => (index / last) * W;
  // Ohne Bewegung (Stand immer gleich) liegt die Linie in der Mitte des Bands.
  const y = (value: number) =>
    max === min ? TOP + BAND / 2 : TOP + BAND - ((value - min) / span) * BAND;
  const xy = values.map((value, index) => [x(index), y(value)] as const);
  const line = linePath(xy);
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const extremes = curveExtremes(curve);
  const ticks = curveTicks(curve);
  const percent = (point: readonly [number, number]) => ({
    left: `${(point[0] / W) * 100}%`,
    top: `${(point[1] / H) * 100}%`,
  });

  const track = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = plot.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    setHover(Math.round(ratio * last));
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-white/80">
          Verlauf seit {formatCalendarDate(curve.from)}
        </p>
        <button
          type="button"
          aria-pressed={table}
          onClick={() => setTable((value) => !value)}
          className="rounded-full px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/15 transition-colors outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/80 motion-reduce:transition-none"
          style={{ backgroundColor: FINANCE_GLASS }}
        >
          {table ? "Als Diagramm" : "Als Tabelle"}
        </button>
      </div>

      {table ? (
        <div
          role="region"
          aria-label="Kontostand am Monatsende"
          tabIndex={0}
          className={cn(
            BOX_HEIGHT,
            "overflow-y-auto rounded-2xl ring-1 ring-white/12 outline-none focus-visible:ring-2 focus-visible:ring-white/80",
          )}
          style={{ backgroundColor: FINANCE_GLASS }}
        >
          <table className="w-full text-sm">
            <caption className="sr-only">
              Kontostand aller Konten am Ende jedes Monats seit {formatCalendarDate(curve.from)}
            </caption>
            <thead>
              <tr className="text-left text-xs text-white/85">
                <th scope="col" className="px-4 py-2 font-medium">
                  Monat
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  Stand am Monatsende
                </th>
              </tr>
            </thead>
            <tbody>
              {monthEndRows(curve).map((row) => (
                <tr key={row.key} className="border-t border-white/10">
                  <td className="px-4 py-2">
                    {row.label}
                    {row.current && <span className="text-white/80"> (heute)</span>}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">
                    {formatEuroFromCents(row.cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div role="img" aria-label={describeCurve(curve)} className={BOX_HEIGHT}>
          <div
            ref={plot}
            aria-hidden="true"
            className={cn("relative touch-pan-y", PLOT_HEIGHT)}
            onPointerMove={track}
            onPointerDown={track}
            onPointerLeave={() => setHover(null)}
          >
            <svg
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="none"
              className="absolute inset-0 size-full overflow-visible"
            >
              <defs>
                <linearGradient id={`${id}-flaeche`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgb(96 165 250)" stopOpacity="0.55" />
                  <stop offset="55%" stopColor="rgb(59 130 246)" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="rgb(59 130 246)" stopOpacity="0" />
                </linearGradient>
                <filter id={`${id}-schein`} x="-5%" y="-30%" width="110%" height="160%">
                  <feGaussianBlur stdDeviation="6" />
                </filter>
              </defs>
              {ticks
                .filter((tick) => tick.index > 0)
                .map((tick) => (
                  <line
                    key={tick.index}
                    x1={x(tick.index)}
                    x2={x(tick.index)}
                    y1={0}
                    y2={H}
                    stroke="rgb(255 255 255 / 0.12)"
                    strokeDasharray="3 5"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              <path d={area} fill={`url(#${id}-flaeche)`} />
              <path
                d={line}
                fill="none"
                stroke="rgb(96 165 250)"
                strokeWidth={10}
                strokeOpacity={0.55}
                filter={`url(#${id}-schein)`}
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={line}
                fill="none"
                stroke="white"
                strokeWidth={2.25}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              {hover !== null && (
                <line
                  x1={x(hover)}
                  x2={x(hover)}
                  y1={0}
                  y2={H}
                  stroke="rgb(255 255 255 / 0.45)"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </svg>
            <span
              className="absolute size-3.5 -translate-1/2 rounded-full bg-white shadow-[0_0_0_6px_rgb(96_165_250/0.35),0_0_24px_4px_rgb(96_165_250/0.8)]"
              style={percent(xy[last]!)}
            />
            {/* Während das Infofeld steht, ruhen die Schilder von Hoch und Tief (nur ihre Punkte bleiben). */}
            {extremes && extremes.high.index !== last && (
              <Mark
                point={xy[extremes.high.index]!}
                label={hover === null ? `Hoch ${formatEuroFromCents(extremes.high.cents)}` : null}
                above
              />
            )}
            {extremes && extremes.low.index !== last && (
              <Mark
                point={xy[extremes.low.index]!}
                label={hover === null ? `Tief ${formatEuroFromCents(extremes.low.cents)}` : null}
              />
            )}
            {hover !== null && (
              <Hover
                point={xy[hover]!}
                label={`${weekdayLabel(curveDay(curve, hover), curveDay(curve, last).getUTCFullYear())} · ${formatEuroFromCents(values[hover]!)}`}
              />
            )}
          </div>
          <div aria-hidden="true" className="relative mt-2 h-4 text-xs font-medium text-white/80">
            {ticks.map((tick) => (
              <span
                key={tick.index}
                className={cn(
                  "absolute whitespace-nowrap",
                  tick.index === 0 ? "translate-x-0" : "-translate-x-1/2",
                  tick.minor && "max-sm:hidden",
                )}
                style={{ left: `${tick.position * 100}%` }}
              >
                {tick.label}
              </span>
            ))}
            <span className="absolute right-0">Heute</span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Lage eines Schilds an der Kante: links bündig, rechts bündig oder mittig über dem Punkt. */
function edgeClass(left: number): string {
  return left < 12 ? "translate-x-0" : left > 80 ? "-translate-x-full" : "-translate-x-1/2";
}

/** Hoch bzw. Tief: kleiner Punkt auf der Linie und ein Schild darüber bzw. darunter. */
function Mark({
  point,
  label,
  above = false,
}: {
  point: readonly [number, number];
  label: string | null;
  above?: boolean;
}) {
  const left = (point[0] / W) * 100;
  const style = { left: `${left}%`, top: `${(point[1] / H) * 100}%` };
  return (
    <>
      <span
        className="absolute size-2 -translate-1/2 rounded-full bg-white/90 ring-2 ring-white/25"
        style={style}
      />
      {label && (
        <span
          className={cn(
            "absolute rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-white/90 tabular-nums ring-1 ring-white/15",
            edgeClass(left),
            above ? "-translate-y-[calc(100%+0.5rem)]" : "translate-y-2",
          )}
          style={{ ...style, backgroundColor: FINANCE_GLASS }}
        >
          {label}
        </span>
      )}
    </>
  );
}

/** Infofeld am Zeiger: Punkt auf der Linie, oben im Diagramm Tag und Stand. */
function Hover({ point, label }: { point: readonly [number, number]; label: string }) {
  const left = (point[0] / W) * 100;
  const style = { left: `${left}%`, top: `${(point[1] / H) * 100}%` };
  return (
    <>
      <span
        className="absolute size-3 -translate-1/2 rounded-full bg-white ring-4 ring-blue-400/40"
        style={style}
      />
      <span
        className={cn(
          "absolute top-0 z-10 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-slate-900 tabular-nums shadow-lg",
          edgeClass(left),
        )}
        style={{ left: style.left }}
      >
        {label}
      </span>
    </>
  );
}
