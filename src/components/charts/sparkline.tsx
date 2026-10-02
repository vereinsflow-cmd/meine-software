import { linePath, sparkBars, sparklinePoints } from "@/lib/charts/geometry";
import { cn } from "@/lib/utils";

const WIDTH = 100;
const HEIGHT = 40;

/** Abstand der ersten und letzten Linienpunkte vom Kartenrand (in % der Breite) – Beschriftungen darunter nutzen ihn auch. */
export const SPARK_INSET = 7;

/** Waagerechte Lage des Punkts `index` von `count` in % der Breite (gleich verteilt zwischen den Rändern `SPARK_INSET`). */
export function sparkX(index: number, count: number): number {
  return count > 1 ? SPARK_INSET + (index / (count - 1)) * (100 - SPARK_INSET * 2) : 50;
}

/** Band, in dem die Linie liegt: oben Luft für den Endpunkt, unten für die Fläche. */
const LINE_TOP = HEIGHT * 0.3;
const LINE_BAND = HEIGHT * 0.52;

/**
 * Kleine, rein schmückende Grafik auf den farbigen Kennzahlenkarten (seit 02.10.2026 weiß auf Farbverlauf, wie im Entwurf 5) –
 * zeigt, ob es aufwärts, abwärts oder gleich bleibt, ohne selbst Zahlen zu nennen. Die Kennzahl (Text) bleibt der eigentliche,
 * barrierefreie Inhalt; die Grafik ist deshalb `aria-hidden`.
 *
 *  - `area`: Linie mit Punkten und einer nach unten ausblendenden Fläche, die bis an beide Kartenränder reicht; der letzte Punkt
 *    (= „jetzt“) ist groß und weiß.
 *  - `bar`: Balken ab der Grundlinie, der hervorgehobene (`highlight`, Standard: der letzte = „jetzt“) weiß, die übrigen
 *    durchscheinend; Wochen ohne Wert als flacher Strich.
 *
 * Die Farbe kommt von außen (`currentColor`, auf den Karten Weiß). Die Grafik wird in die Breite gezogen
 * (`preserveAspectRatio="none"`); Linien und Punkte bleiben trotzdem gleich dünn und rund (`non-scaling-stroke`, Punkte als Linie
 * der Länge 0 mit runden Enden). Blendet beim Erscheinen sanft ein (`motion-safe`, respektiert „Bewegung reduzieren“).
 */
export function Sparkline({
  values,
  variant = "area",
  highlight = "last",
  gridClassName,
  className,
}: {
  /** Werte in zeitlicher Reihenfolge, älteste zuerst. Unter zwei Werten gibt es nichts zu zeigen. */
  values: readonly number[];
  variant?: "area" | "bar";
  /** Welcher Balken „jetzt“ ist – bei einem Blick nach vorn (kommende Wochen) der erste. */
  highlight?: "first" | "last";
  /** Mit Angabe: drei feine, gestrichelte Hilfslinien hinter der Fläche (große Kachel); die Klasse steuert, wann sie erscheinen. */
  gridClassName?: string;
  className?: string;
}) {
  if (values.length < 2) return null;
  const shared =
    "absolute inset-0 size-full overflow-visible motion-safe:animate-in motion-safe:duration-700 motion-safe:fade-in";

  if (variant === "bar") {
    // Als HTML-Kästchen statt als gestrecktes SVG: So bleiben die Ecken rund (ein gestrecktes `rx` wäre verzerrt). Höhen ab der
    // Grundlinie (`sparkBars` mit Höhe 1 = Anteil am größten Wert); Wochen ohne Wert als flacher Strich.
    const bars = sparkBars(values, 1, 1);
    const now = highlight === "first" ? 0 : bars.length - 1;
    return (
      <div
        data-slot="sparkline"
        aria-hidden="true"
        className={cn(
          "flex h-12 items-end justify-between gap-[clamp(2px,2%,6px)] motion-safe:animate-in motion-safe:duration-700 motion-safe:fade-in",
          className,
        )}
      >
        {bars.map((bar, index) => (
          <span
            key={index}
            className={cn(
              "max-w-8 min-w-0 flex-1 rounded-t-[0.3rem] rounded-b-[2px] bg-current",
              index === now ? "opacity-100" : bar.height > 0 ? "opacity-55" : "opacity-30",
            )}
            style={{ height: bar.height > 0 ? `max(${bar.height * 100}%, 0.375rem)` : "2px" }}
          />
        ))}
      </div>
    );
  }

  // Im eigenen Wertebereich (`sparklinePoints`), damit auch kleine Schwankungen sichtbar werden; bleibt alles gleich, liegt
  // die Linie in der Mitte. Waagerecht zwischen den Rändern `SPARK_INSET` (wie die Beschriftung darunter, `sparkX`).
  const points = sparklinePoints(values, 100 - SPARK_INSET * 2, LINE_BAND, 0).map(
    ([x, y]) => [SPARK_INSET + x, LINE_TOP + y] as const,
  );
  const first = points[0]!;
  const last = points[points.length - 1]!;
  // Linie und Fläche laufen waagerecht bis an beide Ränder weiter – die Grafik liegt randlos unten auf der Karte.
  const line = linePath([[0, first[1]], ...points, [WIDTH, last[1]]]);
  const area = `${line} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z`;
  const dot = (point: readonly [number, number], width: number, className: string) => (
    <line
      x1={point[0]}
      y1={point[1]}
      x2={point[0] + 0.001}
      y2={point[1]}
      strokeWidth={width}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
      className={className}
    />
  );
  return (
    <div data-slot="sparkline" aria-hidden="true" className={cn("relative h-16", className)}>
      {/* Fläche in eigener Ebene, damit sie nach unten ausblenden kann (Maske) – ohne SVG-Verlauf mit eindeutiger Kennung. */}
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className={cn(shared, "[mask-image:linear-gradient(to_bottom,#000_35%,transparent)]")}
      >
        <path d={area} fill="currentColor" fillOpacity="0.28" />
      </svg>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" className={shared}>
        {gridClassName &&
          [0.25, 0.5, 0.75].map((share) => (
            <line
              key={share}
              x1={0}
              x2={WIDTH}
              y1={HEIGHT * share}
              y2={HEIGHT * share}
              stroke="currentColor"
              strokeOpacity="0.14"
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
              className={gridClassName}
            />
          ))}
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.slice(0, -1).map((point, index) => (
          <g key={index}>{dot(point, 6, "stroke-current opacity-80")}</g>
        ))}
        {dot(last, 13, "stroke-[var(--kpi-ink,var(--card))]")}
        {dot(last, 9, "stroke-current")}
      </svg>
    </div>
  );
}
