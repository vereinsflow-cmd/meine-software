import { cn } from "@/lib/utils";

/** Bis zu so vielen Plätzen zeigt die Anzeige jeden Platz als eigenes Stück; darüber würden die Stücke zu schmal. */
const MAX_SEGMENTS = 40;

const R = 41;
const C = 2 * Math.PI * R;

/**
 * Besetzung als Ring auf der hohen Kachel „Freie Helferplätze“ im Kachelraster (seit 02.10.2026): ein Stück je Helferplatz,
 * besetzte weiß bzw. in der Farbe der Besetzung (`fillClassName`), freie durchscheinend – so sieht man auf einen Blick, wie viel
 * noch fehlt; in der Mitte die Zahl. Bei mehr als 40 Plätzen ein durchgehender Ring. Rein schmückend (`aria-hidden`): Zahl und
 * Vergleichssatz der Karte nennen dasselbe als Text. Die Farbe kommt von außen (`currentColor`).
 */
export function FillRing({
  filled,
  total,
  className,
  fillClassName,
  children,
}: {
  filled: number;
  total: number;
  className?: string;
  /** Farbe des besetzten Teils (z. B. Bernstein bei „teilweise besetzt“); ohne Angabe wie der Rest (`currentColor`). */
  fillClassName?: string;
  /** Inhalt in der Mitte des Rings (z. B. die Zahl der freien Plätze). */
  children?: React.ReactNode;
}) {
  const ratio = total > 0 ? Math.min(1, filled / total) : 0;
  const segmented = total > 0 && total <= MAX_SEGMENTS;
  const step = segmented ? C / total : C;
  const gap = segmented ? Math.min(2.6, step * 0.3) : 0;
  // Gestrichelter Kreis: je Platz ein Strich mit kleiner Lücke; der besetzte Teil wiederholt das Muster nur so oft wie besetzt.
  const track = segmented ? `${step - gap} ${gap}` : undefined;
  const fill = segmented
    ? `${Array.from({ length: Math.min(filled, total) }, () => `${step - gap} ${gap}`).join(" ")} 0 ${C}`
    : `${C * ratio} ${C}`;
  return (
    <div className={cn("relative grid aspect-square place-items-center", className)}>
      <svg
        data-slot="fill-meter"
        aria-hidden="true"
        viewBox="0 0 100 100"
        className="absolute inset-0 size-full -rotate-90 overflow-visible motion-safe:animate-in motion-safe:duration-700 motion-safe:fade-in"
      >
        <circle cx="50" cy="50" r={R - 8} fill="currentColor" fillOpacity="0.07" />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.22"
          strokeWidth="9"
          strokeDasharray={track}
          strokeDashoffset={-gap / 2}
        />
        {ratio > 0 && (
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth="9"
            strokeDasharray={fill}
            strokeDashoffset={-gap / 2}
            className={fillClassName}
          />
        )}
      </svg>
      <div className="relative text-center">{children}</div>
    </div>
  );
}
