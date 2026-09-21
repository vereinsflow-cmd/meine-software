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

/**
 * Seitenwechsel über URL-Parameter (`?page=2`). Funktioniert ohne JavaScript, ist tastaturbedienbar
 * und behält alle übrigen Filter bei.
 */
export function Pagination({
  basePath,
  searchParams,
  page,
  pageCount,
  total,
  pageSize,
}: {
  basePath: string;
  searchParams: RawSearchParams;
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
}) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const href = (target: number) =>
    `${basePath}${buildQuery(searchParams, { page: target === 1 ? undefined : target })}`;
  const linkClass =
    "hover:bg-accent inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm";

  return (
    <nav
      aria-label="Seitennavigation"
      className="mt-4 flex flex-col items-center justify-between gap-3 sm:flex-row"
    >
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {from}–{to} von {total}
      </p>
      {pageCount > 1 && (
        <ul className="flex items-center gap-1">
          <li>
            {page > 1 ? (
              <Link
                href={href(page - 1)}
                className={linkClass}
                aria-label="Vorherige Seite"
                rel="prev"
              >
                <ChevronLeftIcon className="size-4" />
              </Link>
            ) : (
              <span
                className={cn(linkClass, "text-muted-foreground opacity-50")}
                aria-hidden="true"
              >
                <ChevronLeftIcon className="size-4" />
              </span>
            )}
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
                    linkClass,
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
            {page < pageCount ? (
              <Link
                href={href(page + 1)}
                className={linkClass}
                aria-label="Nächste Seite"
                rel="next"
              >
                <ChevronRightIcon className="size-4" />
              </Link>
            ) : (
              <span
                className={cn(linkClass, "text-muted-foreground opacity-50")}
                aria-hidden="true"
              >
                <ChevronRightIcon className="size-4" />
              </span>
            )}
          </li>
        </ul>
      )}
    </nav>
  );
}
