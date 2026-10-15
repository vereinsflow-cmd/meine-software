import Link from "next/link";
import { SEGMENT_BAR, segmentItem } from "@/components/ui/segment-styles";
import { cn } from "@/lib/utils";

/**
 * Jahr wählen (`?jahr=`) als kleine Leiste aus Links – ohne JavaScript, mit Zurück-Taste bedienbar. Erscheint erst, wenn es
 * mehr als ein Jahr gibt (das Kassenbuch begann vor diesem Jahr); gezeigt werden die letzten fünf.
 */
export function YearSwitch({
  years,
  current,
  href,
  className,
}: {
  /** Aufsteigend. */
  years: number[];
  current: number;
  href: (year: number) => string;
  className?: string;
}) {
  if (years.length < 2) return null;
  return (
    <nav aria-label="Jahr wählen" className={cn(SEGMENT_BAR, "flex-nowrap", className)}>
      {years.slice(-5).map((year) => (
        <Link
          key={year}
          href={href(year)}
          aria-current={year === current ? "page" : undefined}
          className={cn(segmentItem(year === current), "tabular-nums")}
        >
          {year}
        </Link>
      ))}
    </nav>
  );
}

/** Jahre ab Beginn des Kassenbuchs bis heute; `?jahr=` außerhalb davon fällt auf das aktuelle Jahr zurück. */
export function donationYears(
  ledgerStart: Date | null,
  today: Date,
  requested: string | undefined,
): { years: number[]; year: number } {
  const current = today.getUTCFullYear();
  const first = Math.min(current, ledgerStart?.getUTCFullYear() ?? current);
  const years = Array.from({ length: current - first + 1 }, (_, index) => first + index);
  const asked = requested && /^\d{4}$/.test(requested) ? Number(requested) : current;
  return { years, year: years.includes(asked) ? asked : current };
}
