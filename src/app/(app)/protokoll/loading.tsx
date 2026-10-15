import {
  FieldSkeleton,
  PageHeaderSkeleton,
  PageLoading,
  TableSkeleton,
} from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Ladezustand des Änderungsprotokolls: Kopf, Filter wie auf der Seite (Suche, Bereich, Person, Von, Bis – am Handy nur
 * Suche und „Filter“; die Felder behalten ihre Überschriften, Datumsfelder brauchen sie) und die Tabelle (am Handy
 * gestapelt).
 */
export default function AuditLogLoading() {
  return (
    <PageLoading label="Änderungsprotokoll wird geladen …">
      <PageHeaderSkeleton actions={0} />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <FieldSkeleton labelWidth="w-24" />
        <Skeleton className="h-9 w-24 rounded-lg sm:hidden" />
        <FieldSkeleton labelWidth="w-24" className="max-sm:hidden" />
        <FieldSkeleton labelWidth="w-24" className="max-sm:hidden" />
        <FieldSkeleton labelWidth="w-24" className="max-sm:hidden" />
        <FieldSkeleton labelWidth="w-24" className="max-sm:hidden" />
        <Skeleton className="h-9 w-20 rounded-lg max-sm:hidden" />
      </div>
      <TableSkeleton rows={10} columns={4} stack />
    </PageLoading>
  );
}
