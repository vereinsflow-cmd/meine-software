import { PageHeaderSkeleton, PageLoading, TableSkeleton } from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Ladezustand von „Benutzer und Rollen“: Kopf mit „Person einladen“, die Reiterleiste (Benutzer, Einladungen, Rollen und
 * Rechte) und die Tabelle der Benutzer – am Handy gestapelt wie die echte Tabelle. Die Reiter dürfen schrumpfen (am Handy
 * passen die drei Platzhalter sonst nicht in die Breite und die Seite liefe seitlich über).
 */
export default function UsersLoading() {
  return (
    <PageLoading label="Benutzer werden geladen …">
      <PageHeaderSkeleton actions={1} />
      <div className="flex gap-1 overflow-hidden border-b">
        {["w-20", "w-24", "w-36"].map((width) => (
          <div
            key={width}
            className="-mb-px min-w-0 border-b-[3px] border-transparent px-3.5 py-2.5"
          >
            <Skeleton className={cn("my-0.5 h-5 max-w-full", width)} />
          </div>
        ))}
      </div>
      <TableSkeleton rows={6} columns={4} stack />
    </PageLoading>
  );
}
