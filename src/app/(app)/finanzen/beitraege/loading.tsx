import { TableSkeleton } from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { FinanceLoading, TilesSkeleton } from "@/modules/finance/components/finance-skeletons";

/** Ladezustand von „Wer zahlt was“: Zeitraum und Suche, vier Kacheln mit Summen, darunter die Tabelle. */
export default function BeitraegeLoading() {
  return (
    <FinanceLoading label="Beiträge werden geladen …" fees>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-8 w-56 rounded-lg" />
        <Skeleton className="h-9 w-full rounded-lg sm:w-80" />
      </div>
      <TilesSkeleton />
      <TableSkeleton rows={8} columns={3} />
    </FinanceLoading>
  );
}
