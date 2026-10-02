"use client";

import { Fragment, useEffect, useRef, useState, type PointerEvent } from "react";
import { linePath, sparklinePoints } from "@/lib/charts/geometry";
import { cn } from "@/lib/utils";

const WIDTH = 100;
const HEIGHT = 40;
/** Band, in dem die Linie liegt: oben Luft für den Endpunkt und das Infofeld, unten für die Fläche. */
const LINE_TOP = HEIGHT * 0.22;
const LINE_BAND = HEIGHT * 0.6;

/** Abstand des ersten und letzten Punkts vom Rand (in % der Breite) – die Beschriftungen darunter nutzen ihn auch. */
const QUOTE_INSET = 6;

/** Waagerechte Lage des Punkts `index` von `count` in % der Breite. */
function quoteX(index: number, count: number): number {
  return count > 1 ? QUOTE_INSET + (index / (count - 1)) * (100 - QUOTE_INSET * 2) : 50;
}

export interface QuoteChartPoint {
  label: string;
  fullLabel: string;
  value: number;
}

/**
 * Kursverlauf auf den farbigen Kennzahlenkarten („wie eine Aktie“, seit 02.10.2026): weiße Linie mit nach unten
 * ausblendender Fläche über die ganze Kartenbreite, gestrichelte Linie auf Höhe des Startwerts und ein großer Endpunkt
 * („jetzt“); die Linie endet dort. Beim Zeigen mit Maus oder Finger erscheint ein Fadenkreuz mit Infofeld („02.09.2026 ·
 * 23 Mitglieder · ▲ +1 seit 02.08.2026“), Escape schließt es. Am Handy gehört waagerechtes Wischen dem Kennzahlen-Karussell
 * (`max-sm:touch-auto`), ab `sm` dem Fadenkreuz – nie dem Reiterwechsel (`data-no-swipe`).
 *
 * `detailClassName` steuert die Zusätze der großen Kachel (Schild „Start · 19“, Werte am Rand, Monate unter der Linie,
 * Zu- und Abgänge als Balken) – etwa „hidden @bento/kpis:block“, damit sie nur im Kachelraster erscheinen.
 *
 * Rein schmückend (`aria-hidden`): Zahl, Veränderung, Hoch/Tief und Vergleichssatz der Karte nennen dasselbe als Text, die
 * Auswertungen haben dazu eine Tabelle. Die Grafik wird in die Breite gezogen (`preserveAspectRatio="none"`); Linien und
 * Punkte bleiben trotzdem gleich dünn und rund (`non-scaling-stroke`, Punkte als Linie der Länge 0 mit runden Enden).
 */
export function QuoteChart({
  points,
  format,
  describe,
  detailClassName,
  volume,
  className,
  rootClassName,
  syntheticStart = false,
}: {
  points: readonly QuoteChartPoint[];
  /** Zahl für Schilder und Achse („19“, „4,5“). */
  format: (value: number) => string;
  /** Zahl mit Einheit für das Infofeld („23 Mitglieder“). */
  describe: (value: number) => string;
  detailClassName?: string;
  /** Zu- und Abgänge je Punkt als kleine Balken unter der Linie – nur mit `detailClassName`. */
  volume?: { up: readonly number[]; down: readonly number[]; label: string };
  /** Klassen für die Kurvenfläche (meist ihre Höhe). */
  className?: string;
  /** Klassen für das Ganze samt Beschriftung – z. B. `flex-1`, damit die Kurve den Platz der großen Kachel füllt. */
  rootClassName?: string;
  /** Der erste Punkt ist nur der Startwert 0 einer Summe (kein eigener Abschnitt) – ohne Achsenbeschriftung. */
  syntheticStart?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [hovered, setActive] = useState<number | null>(null);
  // Infofeld mit Escape schließen (WCAG 1.4.13)
  useEffect(() => {
    if (hovered === null) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActive(null);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [hovered]);
  if (points.length < 2) return null;
  const active = hovered !== null && hovered < points.length ? hovered : null;

  const values = points.map((point) => point.value);
  const allZero = values.every((value) => value === 0);
  // Lauter Nullen liegen unten (nicht in der Mitte, wo sie wie ein Wert aussähen)
  const ys = allZero
    ? values.map(() => LINE_TOP + LINE_BAND)
    : sparklinePoints(values, 100, LINE_BAND, 0).map(([, y]) => LINE_TOP + y);
  const xy = ys.map((y, index) => [quoteX(index, points.length), y] as const);
  const first = xy[0]!;
  const last = xy.at(-1)!;
  // Die Linie beginnt am linken Rand und endet „jetzt“ – rechts davon läge die Zukunft.
  const line = linePath([[0, first[1]], ...xy]);
  const area = `${line} L${last[0]} ${HEIGHT} L0 ${HEIGHT} Z`;
  const startY = startYOf(xy);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const yOf = (value: number) => ys[values.indexOf(value)]!;

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    const percent = ((event.clientX - rect.left) / rect.width) * 100;
    let nearest = 0;
    for (let index = 1; index < xy.length; index += 1) {
      if (Math.abs(xy[index]![0] - percent) < Math.abs(xy[nearest]![0] - percent)) nearest = index;
    }
    setActive(nearest);
  }

  const dot = (point: readonly [number, number], width: number, stroke: string) => (
    <line
      x1={point[0]}
      y1={point[1]}
      x2={point[0] + 0.001}
      y2={point[1]}
      strokeWidth={width}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
      className={stroke}
    />
  );

  // Achsenbeschriftung der großen Kachel: vom letzten Punkt („jetzt“) in gleichen Schritten zurück, höchstens fünf – so
  // stehen nie zwei Beschriftungen dicht beieinander.
  const firstLabelled = syntheticStart ? 1 : 0;
  const labelStep = Math.max(1, Math.ceil((points.length - 1 - firstLabelled) / 4));
  const labelled = points
    .map((point, index) => ({ point, index }))
    .filter(({ index }) => index >= firstLabelled && (points.length - 1 - index) % labelStep === 0);
  // Das Schild „Start · 19“ steht links über der gestrichelten Linie – steigt der Kurs dort gleich an, darunter, damit die
  // Linie nicht durch das Schild läuft.
  const risesEarly = xy.some(([x, y]) => x <= 22 && y < startY);
  const shared = "absolute inset-0 size-full overflow-visible";
  const point = active === null ? null : points[active]!;
  const previous = active !== null && active > 0 ? points[active - 1]! : null;
  const step = point && previous ? point.value - previous.value : null;

  return (
    <div aria-hidden="true" className={cn("flex flex-col", rootClassName)}>
      <div
        ref={box}
        data-slot="quote-chart"
        data-no-swipe=""
        onPointerMove={onPointerMove}
        onPointerLeave={() => setActive(null)}
        onPointerCancel={() => setActive(null)}
        className={cn(
          "relative h-14 motion-safe:animate-in motion-safe:duration-700 motion-safe:fade-in max-sm:touch-auto sm:touch-pan-y sm:touch-pinch-zoom",
          className,
        )}
      >
        {/* Fläche in eigener Ebene, damit sie nach unten ausblenden kann (Maske) – ohne SVG-Verlauf mit eindeutiger Kennung. */}
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className={cn(shared, "[mask-image:linear-gradient(to_bottom,#000_30%,transparent)]")}
        >
          <path d={area} fill="currentColor" fillOpacity="0.26" />
        </svg>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className={shared}>
          {/* Startwert als gestrichelte Linie – wie der Kurs zu Beginn des Zeitraums */}
          <line
            x1={0}
            x2={WIDTH}
            y1={startY}
            y2={startY}
            stroke="currentColor"
            strokeOpacity="0.55"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={line}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {active !== null && (
            <line
              x1={xy[active]![0]}
              x2={xy[active]![0]}
              y1={0}
              y2={HEIGHT}
              stroke="currentColor"
              strokeOpacity="0.6"
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {dot(last, 13, "stroke-[var(--kpi-ink,var(--card))]")}
          {dot(last, 9, "stroke-current")}
          {active !== null && active !== xy.length - 1 && (
            <>
              {dot(xy[active]!, 12, "stroke-current")}
              {dot(xy[active]!, 7, "stroke-[var(--kpi-ink,var(--card))]")}
            </>
          )}
        </svg>

        {/* Zusätze der großen Kachel: das Schild mit dem Startwert links über der gestrichelten Linie (rechts säße es auf dem
            Endpunkt, wenn sich nichts geändert hat), dazu Höchst- und Tiefstwert am rechten Rand – außer dort, wo sie das
            Schild oder den Endpunkt verdecken würden. */}
        <div className={cn("pointer-events-none absolute inset-0 hidden", detailClassName)}>
          <span
            className={cn(
              "absolute left-5 rounded-full bg-black/25 px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap tabular-nums ring-1 ring-white/25",
              risesEarly ? "translate-y-1" : "-translate-y-[calc(100%+0.25rem)]",
            )}
            style={{ top: `${(startY / HEIGHT) * 100}%` }}
          >
            Start · {format(points[0]!.value)}
          </span>
          {[max, min]
            .filter((value, index) => index === 0 || value !== max)
            .filter((value) => Math.abs(yOf(value) - last[1]) > HEIGHT * 0.12)
            .map((value) => (
              <span
                key={value}
                className="absolute right-[1.5%] -translate-y-1/2 text-[0.6875rem] font-semibold tabular-nums"
                style={{ top: `${(yOf(value) / HEIGHT) * 100}%` }}
              >
                {format(value)}
              </span>
            ))}
        </div>

        {/* Infofeld am gezeigten Punkt – links von der Mitte nach rechts aufklappend, rechts davon nach links */}
        {point && (
          <div
            className={cn(
              "pointer-events-none absolute z-10 rounded-xl bg-white px-2.5 py-1.5 text-xs whitespace-nowrap text-slate-900 shadow-lg",
              xy[active!]![0] > 50 ? "-translate-x-[calc(100%+0.5rem)]" : "translate-x-2",
            )}
            // Nahe am gezeigten Punkt (darüber), aber nie über den oberen Rand hinaus
            style={{
              left: `${xy[active!]![0]}%`,
              top: `max(0px, calc(${(xy[active!]![1] / HEIGHT) * 100}% - 4.5rem))`,
            }}
          >
            <p className="font-medium text-slate-600">{point.fullLabel}</p>
            <p className="font-bold">{describe(point.value)}</p>
            {step !== null && (
              <p
                className={cn(
                  "font-semibold",
                  step > 0 ? "text-emerald-800" : step < 0 ? "text-red-700" : "text-slate-600",
                )}
              >
                {step > 0 ? "▲ +" : step < 0 ? "▼ −" : "±"}
                {format(Math.abs(step))} seit {previous!.fullLabel}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Große Kachel: Beschriftung unter der Linie und Zu-/Abgänge */}
      <div className={cn("hidden", detailClassName)}>
        <div className="relative mt-1.5 h-[1lh] text-xs font-medium">
          {labelled.map(({ point: labelledPoint, index }) => (
            <span
              key={index}
              className={cn(
                "absolute top-0 whitespace-nowrap",
                // am Rand bündig statt mittig – sonst schnitte die Kartenkante die erste und letzte Beschriftung ab
                index === 0
                  ? "-translate-x-[20%]"
                  : index === points.length - 1
                    ? "-translate-x-[80%]"
                    : "-translate-x-1/2",
                index === points.length - 1 ? "font-bold text-white" : "font-medium text-white",
              )}
              style={{ left: `${quoteX(index, points.length)}%` }}
            >
              {labelledPoint.label}
            </span>
          ))}
        </div>
        {/* Ohne Zu- und Abgänge im Zeitraum gibt es keine Balken – dann entfällt die Zeile ganz */}
        {volume && [...volume.up, ...volume.down].some((count) => count > 0) && (
          <div className="mt-2">
            <p className="px-5 text-[0.6875rem] font-semibold tracking-wide text-white uppercase">
              {volume.label}
            </p>
            <div className="relative mt-1 h-7">
              <span className="absolute inset-x-0 top-1/2 h-px bg-white/25" />
              {points.map((_, index) => {
                const peak = Math.max(1, ...volume.up, ...volume.down);
                const up = volume.up[index] ?? 0;
                const down = volume.down[index] ?? 0;
                return (
                  <Fragment key={index}>
                    {up > 0 && (
                      <span
                        className="absolute bottom-1/2 w-2 -translate-x-1/2 rounded-t-[2px] bg-white"
                        style={{
                          left: `${quoteX(index, points.length)}%`,
                          height: `${(up / peak) * 50}%`,
                        }}
                      />
                    )}
                    {down > 0 && (
                      <span
                        className="absolute top-1/2 w-2 -translate-x-1/2 rounded-b-[2px] bg-white/45"
                        style={{
                          left: `${quoteX(index, points.length)}%`,
                          height: `${(down / peak) * 50}%`,
                        }}
                      />
                    )}
                  </Fragment>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Höhe des Startwerts (erster Punkt) im Koordinatensystem der Grafik. */
function startYOf(xy: readonly (readonly [number, number])[]): number {
  return xy[0]![1];
}
