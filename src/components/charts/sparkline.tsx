import { areaPath, linePath, sparklinePoints } from "@/lib/charts/geometry";
import { cn } from "@/lib/utils";

const WIDTH = 100;
const HEIGHT = 28;

/**
 * Kleine, rein schmückende Trendlinie unter einer Kennzahl (z. B. Mitgliederzahl der letzten 12 Wochen) – zeigt,
 * ob es aufwärts, abwärts oder gleich bleibt, ohne selbst Zahlen zu nennen. Die Kennzahl (Text) bleibt der
 * eigentliche, barrierefreie Inhalt; die Linie kommt zusätzlich dazu und ist deshalb `aria-hidden`.
 *
 * Bewusst zurückhaltend statt eines bunten Mini-Diagramms: eine dünne Linie plus zarte Fläche in gedämpfter Farbe,
 * nur der letzte Punkt (= „jetzt“) in der Markenfarbe – passend zur disziplinierten Farbpalette des Dashboards.
 */
export function Sparkline({
  values,
  className,
}: {
  /** Werte in zeitlicher Reihenfolge, älteste zuerst. Unter zwei Werten gibt es nichts zu zeigen. */
  values: readonly number[];
  className?: string;
}) {
  if (values.length < 2) return null;
  const points = sparklinePoints(values, WIDTH, HEIGHT);
  const last = points[points.length - 1]!;
  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={cn("h-7 w-full overflow-visible text-muted-foreground/60", className)}
      aria-hidden="true"
    >
      <path d={areaPath(points, HEIGHT)} fill="currentColor" fillOpacity="0.1" stroke="none" />
      <path
        d={linePath(points)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last[0]} cy={last[1]} r="1.8" className="fill-primary" />
    </svg>
  );
}
