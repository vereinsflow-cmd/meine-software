import { TableSkeleton, ToolbarSkeleton } from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { FinanceLoading, TilesSkeleton } from "@/modules/finance/components/finance-skeletons";

/** Ladezustand des Kassenbuchs: Kontostände, Filterleiste, Zahl der Buchungen und die Tabelle. */
export default function KassenbuchLoading() {
  return (
    <FinanceLoading label="Kassenbuch wird geladen …" actions={["w-36", "w-32", "w-9"]}>
      <TilesSkeleton count={2} />
      <ToolbarSkeleton />
      <div className="grid gap-2">
        <Skeleton className="h-4 w-28" />
        <TableSkeleton rows={8} columns={5} />
      </div>
    </FinanceLoading>
  );
}
