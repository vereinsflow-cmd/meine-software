import {
  CardSkeleton,
  PageSectionSkeleton,
  TableSkeleton,
} from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { FinanceLoading } from "@/modules/finance/components/finance-skeletons";

/**
 * Ladezustand des Monatsabschlusses: Checkliste neben den Zahlen des Monats, darunter die bisherigen Abschlüsse (Tabelle)
 * und die letzten Kassenstürze (Zeilen ohne Karte).
 */
export default function AbschlussLoading() {
  return (
    <FinanceLoading label="Monatsabschluss wird geladen …">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <CardSkeleton lines={6} />
        <CardSkeleton lines={4} />
      </div>
      <PageSectionSkeleton>
        <TableSkeleton rows={3} columns={4} />
      </PageSectionSkeleton>
      <PageSectionSkeleton>
        <div className="grid max-w-3xl gap-4 py-1">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      </PageSectionSkeleton>
    </FinanceLoading>
  );
}
