import { areaPath, linePath, sparkBars, sparklinePoints } from "@/lib/charts/geometry";
import { cn } from "@/lib/utils";

const WIDTH = 100;
const HEIGHT = 32;

/**
 * Kleine, rein schmückende Mini-Grafik unter einer Kennzahl (z. B. Mitgliederzahl der letzten 6 Monate) – zeigt,
 * ob es aufwärts, abwärts oder gleich bleibt, ohne selbst Zahlen zu nennen. Die Kennzahl (Text) bleibt der
 * eigentliche, barrierefreie Inhalt; die Grafik kommt zusätzlich dazu und ist deshalb `aria-hidden`.
 *
 * Zwei zurückhaltende Varianten statt eines bunten Mini-Diagramms – beide in derselben gedämpften Farbe, gleicher
 * Höhe, ohne Achsen/Beschriftung/Legende:
 *  - `line` (Standard): dünne Linie plus zarte Fläche, nur der letzte Punkt (= „jetzt“) in der Markenfarbe.
 *  - `bar`: schmale Balken ab der Grundlinie, nur der hervorgehobene (`highlight`, Standard: der letzte = „jetzt“) in der
 *    Markenfarbe.
 * Blendet beim Erscheinen sanft ein (`motion-safe`, respektiert „Bewegung reduzieren“) und hellt sich beim
 * Überfahren der Karte zusammen mit ihr leicht auf (`group-hover/card`).
 */
export function Sparkline({
  values,
  variant = "line",
  highlight = "last",
  className,
}: {
  /** Werte in zeitlicher Reihenfolge, älteste zuerst. Unter zwei Werten gibt es nichts zu zeigen. */
  values: readonly number[];
  variant?: "line" | "bar";
  /** Welcher Balken „jetzt“ ist und in der Markenfarbe steht – bei einem Blick nach vorn (kommende Wochen) der erste. */
  highlight?: "first" | "last";
  className?: string;
}) {
  if (values.length < 2) return null;
  const shared = cn(
    "h-8 w-full overflow-visible text-muted-foreground/55 transition-colors duration-200 group-hover/card:text-muted-foreground/80 motion-safe:animate-in motion-safe:duration-700 motion-safe:fade-in",
    className,
  );

  if (variant === "bar") {
    const bars = sparkBars(values, WIDTH, HEIGHT);
    return (
      <svg
        data-slot="sparkline"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className={shared}
        aria-hidden="true"
      >
        {bars.map((bar, index) => (
          <rect
            key={index}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={Math.max(bar.height, 1)}
            rx={1}
            className={
              index === (highlight === "first" ? 0 : bars.length - 1)
                ? "fill-primary"
                : "fill-current"
            }
          />
        ))}
      </svg>
    );
  }

  const points = sparklinePoints(values, WIDTH, HEIGHT);
  const last = points[points.length - 1]!;
  // Ohne Veränderung zeigt ein Schleier unter der Linie nichts außer einer grauen Fläche – dann nur die Linie.
  const flat = values.every((value) => value === values[0]);
  return (
    <svg
      data-slot="sparkline"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className={shared}
      aria-hidden="true"
    >
      {!flat && (
        <path d={areaPath(points, HEIGHT)} fill="currentColor" fillOpacity="0.1" stroke="none" />
      )}
      {/* `non-scaling-stroke`: Die Grafik wird in die Breite gezogen (`preserveAspectRatio="none"`) – so bleibt die Linie
          überall gleich dünn und der Punkt rund (als Linie der Länge 0 mit runden Enden statt eines verzerrten Kreises). */}
      <path
        d={linePath(points)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={last[0]}
        y1={last[1]}
        x2={last[0] + 0.001}
        y2={last[1]}
        stroke="var(--card)"
        strokeWidth="9"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={last[0]}
        y1={last[1]}
        x2={last[0] + 0.001}
        y2={last[1]}
        stroke="var(--primary)"
        strokeWidth="6"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
