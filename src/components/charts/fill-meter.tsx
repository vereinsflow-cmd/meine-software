import { cn } from "@/lib/utils";

/** Bis zu so vielen Plätzen zeigt die Anzeige jeden Platz als eigenes Stück; darüber würden die Stücke zu schmal. */
const MAX_SEGMENTS = 40;

/**
 * Besetzung als Anzeige auf den farbigen Kennzahlenkarten (seit 02.10.2026): ein Stück je Helferplatz, besetzte weiß, freie
 * durchscheinend – so sieht man auf einen Blick, wie viel noch fehlt. Bei mehr als 40 Plätzen ein durchgehender Balken bzw.
 * Ring. Rein schmückend (`aria-hidden`): Zahl und Vergleichssatz der Karte nennen dasselbe als Text. Die Farbe kommt von außen
 * (`currentColor`).
 *
 *  - `FillSegments`: schmale Leiste (normale Karten, Handy).
 *  - `FillRing`: Ring mit Inhalt in der Mitte (die hohe Kachel „Freie Helferplätze“ im Kachelraster ab 48 rem Inhaltsbreite).
 */
export function FillSegments({
  filled,
  total,
  className,
}: {
  filled: number;
  total: number;
  className?: string;
}) {
  const ratio = total > 0 ? Math.min(1, filled / total) : 0;
  return (
    <div
      data-slot="fill-meter"
      aria-hidden="true"
      className={cn(
        // Viele Plätze: schmalere Lücken, damit die Stücke nicht zu Strichen schrumpfen
        "flex h-7 items-stretch",
        total > 24 ? "gap-px" : total > 12 ? "gap-[2px]" : "gap-[3px]",
        className,
      )}
    >
      {total > 0 && total <= MAX_SEGMENTS ? (
        Array.from({ length: total }, (_, index) => (
          <span
            key={index}
            className={cn(
              "min-w-0 flex-1 rounded-[3px] bg-current",
              index < filled ? "opacity-100" : "opacity-25",
            )}
          />
        ))
      ) : (
        <span className="relative my-auto h-2.5 w-full overflow-hidden rounded-full bg-current/25">
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-current"
            style={{ width: `${ratio * 100}%` }}
          />
        </span>
      )}
    </div>
  );
}

const R = 41;
const C = 2 * Math.PI * R;

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
