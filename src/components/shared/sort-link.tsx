import { useId } from "react";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { buildQuery, type RawSearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { TableHead } from "@/components/ui/table";

/** Ziel eines Sortier-Links: andere Spalte aufsteigend, dieselbe Spalte umgekehrt; zurück auf Seite 1, übrige Filter bleiben. */
function sortHref(
  basePath: string,
  searchParams: RawSearchParams,
  field: string,
  active: boolean,
  currentDir: "asc" | "desc",
): string {
  const dir = active && currentDir === "asc" ? "desc" : "asc";
  return `${basePath}${buildQuery(searchParams, { sort: field, dir, page: undefined })}`;
}

/** Vorgelesener Zusatz hinter dem Namen der Sortierung. */
const sortHint = (active: boolean, dir: "asc" | "desc") =>
  active ? `, sortiert ${dir === "asc" ? "aufsteigend" : "absteigend"}` : ", sortieren";

/** Sortierbarer Spaltenkopf: Klick wechselt zwischen aufsteigend und absteigend (über URL-Parameter). */
export function SortableHead({
  label,
  field,
  basePath,
  searchParams,
  currentSort,
  currentDir,
  className,
}: {
  label: string;
  field: string;
  basePath: string;
  searchParams: RawSearchParams;
  currentSort: string;
  currentDir: "asc" | "desc";
  className?: string;
}) {
  const active = currentSort === field;
  const Icon = active ? (currentDir === "asc" ? ArrowUpIcon : ArrowDownIcon) : ChevronsUpDownIcon;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (currentDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <Link
        href={sortHref(basePath, searchParams, field, active, currentDir)}
        className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground"
      >
        {label}
        <Icon className="size-3.5 opacity-70" aria-hidden="true" />
        <span className="sr-only">{sortHint(active, currentDir)}</span>
      </Link>
    </TableHead>
  );
}

/**
 * Sortierung einer Liste ohne Spaltenköpfe (Mitgliederliste mit Detailbereich): „Sortieren: Name ↑ Nr. Status Eintritt“ als
 * kleine Links – Verhalten wie `SortableHead`, ein Klick auf die aktive Sortierung kehrt die Richtung um. Ohne Skript bedienbar.
 */
export function SortLinks({
  fields,
  basePath,
  searchParams,
  currentSort,
  currentDir,
  className,
}: {
  fields: readonly { field: string; label: string }[];
  basePath: string;
  searchParams: RawSearchParams;
  currentSort: string;
  currentDir: "asc" | "desc";
  className?: string;
}) {
  const labelId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={cn("flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs", className)}
    >
      <span id={labelId} className="mr-0.5 text-muted-foreground">
        Sortieren:
      </span>
      {fields.map(({ field, label }) => {
        const active = currentSort === field;
        const Icon = currentDir === "asc" ? ArrowUpIcon : ArrowDownIcon;
        return (
          // Name als `aria-label`: „Name, sortiert aufsteigend“ (ein `sr-only`-Zusatz bekäme ein Leerzeichen vor das Komma).
          <Link
            key={field}
            href={sortHref(basePath, searchParams, field, active, currentDir)}
            aria-label={`${label}${sortHint(active, currentDir)}`}
            aria-current={active ? "true" : undefined}
            className={cn(
              "inline-flex items-center gap-0.5 rounded-md px-1.5 py-1 hover:bg-muted hover:text-foreground max-lg:py-1.5",
              active ? "bg-muted font-semibold text-foreground" : "text-muted-foreground",
            )}
          >
            {label}
            {active && <Icon className="size-3.5" aria-hidden="true" />}
          </Link>
        );
      })}
    </div>
  );
}
