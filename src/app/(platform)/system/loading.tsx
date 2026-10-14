import { PageHeaderSkeleton, PageLoading, TableSkeleton } from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/** Ladezustand der Systemadministration: Kopf mit „Verein anlegen“, sechs Kennzahlen und die Tabelle der Vereine. */
export default function SystemLoading() {
  return (
    <PageLoading label="Systemadministration wird geladen …">
      <PageHeaderSkeleton actions={1} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className={cn(CARD_SURFACE, "grid gap-3 p-4")}>
            <Skeleton className="h-3.5 w-3/4" />
            <Skeleton className="h-7 w-12" />
          </div>
        ))}
      </div>
      <TableSkeleton rows={6} columns={6} stack />
    </PageLoading>
  );
}
