import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { buildQuery, type RawSearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";

function pageNumbers(current: number, count: number): (number | "…")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  const pages = new Set([1, 2, count - 1, count, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= count).sort((a, b) => a - b);
  const result: (number | "…")[] = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1]! > 1) result.push("…");
    result.push(page);
  });
  return result;
}

const LINK_CLASS =
  "hover:bg-accent inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm";

/** „Vorherige“ bzw. „Nächste Seite“ – am Anfang bzw. Ende nur angedeutet (kein Link). */
function StepLink({ href, next }: { href: string | null; next: boolean }) {
  const Icon = next ? ChevronRightIcon : ChevronLeftIcon;
  return href ? (
    <Link
      href={href}
      className={LINK_CLASS}
      aria-label={next ? "Nächste Seite" : "Vorherige Seite"}
      rel={next ? "next" : "prev"}
    >
      <Icon className="size-4" />
    </Link>
  ) : (
    <span className={cn(LINK_CLASS, "text-muted-foreground opacity-50")} aria-hidden="true">
      <Icon className="size-4" />
    </span>
  );
}

/**
 * Seitenwechsel über URL-Parameter (`?page=2`). Funktioniert ohne JavaScript, ist tastaturbedienbar
 * und behält alle übrigen Filter bei.
 * `compact`: nur „‹ 51–100 von 230 ›“ – für schmale Listen (Mitgliederliste mit Detailbereich), wo die Seitenzahlen nicht
 * nebeneinander passen; bei nur einer Seite fehlt die Leiste ganz (die Zahl steht schon im Seitenkopf).
 */
export function Pagination({
  basePath,
  searchParams,
  page,
  pageCount,
  total,
  pageSize,
  compact = false,
  className,
}: {
  basePath: string;
  searchParams: RawSearchParams;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  compact?: boolean;
  className?: string;
}) {
  if (total === 0 || (compact && pageCount <= 1)) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const href = (target: number) =>
    `${basePath}${buildQuery(searchParams, { page: target === 1 ? undefined : target })}`;
  const previous = page > 1 ? href(page - 1) : null;
  const next = page < pageCount ? href(page + 1) : null;
  const range = (
    <p className="text-sm text-muted-foreground" aria-live="polite">
      {from}–{to} von {total}
    </p>
  );

  if (compact)
    return (
      <nav
        aria-label="Seitennavigation"
        className={cn("flex items-center justify-between gap-2", className)}
      >
        <StepLink href={previous} next={false} />
        {range}
        <StepLink href={next} next />
      </nav>
    );

  return (
    <nav
      aria-label="Seitennavigation"
      className={cn("mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row", className)}
    >
      {range}
      {pageCount > 1 && (
        <ul className="flex items-center gap-1">
          <li>
            <StepLink href={previous} next={false} />
          </li>
          {pageNumbers(page, pageCount).map((entry, index) =>
            entry === "…" ? (
              <li key={`gap-${index}`} className="px-1 text-muted-foreground" aria-hidden="true">
                …
              </li>
            ) : (
              <li key={entry}>
                <Link
                  href={href(entry)}
                  aria-current={entry === page ? "page" : undefined}
                  aria-label={`Seite ${entry}`}
                  className={cn(
                    LINK_CLASS,
                    entry === page &&
                      "border-primary bg-primary text-primary-foreground hover:bg-primary",
                  )}
                >
                  {entry}
                </Link>
              </li>
            ),
          )}
          <li>
            <StepLink href={next} next />
          </li>
        </ul>
      )}
    </nav>
  );
}
