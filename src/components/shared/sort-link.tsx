import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react";
import { buildQuery, type RawSearchParams } from "@/lib/search-params";
import { TableHead } from "@/components/ui/table";

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
  const nextDir = active && currentDir === "asc" ? "desc" : "asc";
  const Icon = active ? (currentDir === "asc" ? ArrowUpIcon : ArrowDownIcon) : ChevronsUpDownIcon;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (currentDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <Link
        href={`${basePath}${buildQuery(searchParams, { sort: field, dir: nextDir, page: undefined })}`}
        className="-ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground"
      >
        {label}
        <Icon className="size-3.5 opacity-70" aria-hidden="true" />
        <span className="sr-only">
          {active
            ? `, sortiert ${currentDir === "asc" ? "aufsteigend" : "absteigend"}`
            : ", sortieren"}
        </span>
      </Link>
    </TableHead>
  );
}
