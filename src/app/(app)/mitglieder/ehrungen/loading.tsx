import {
  FieldSkeleton,
  PageHeaderSkeleton,
  PageLoading,
  PageSectionSkeleton,
  TableSkeleton,
} from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Ladezustand der Ehrungen: Zurück-Link, Kopf mit „Liste drucken“ und „Export“, die Auswahl des Jahres und zwei Stufen
 * („50 Jahre“, „25 Jahre“) als Tabellen – am Handy gestapelt wie die echte Liste (`<Table stack>`).
 */
export default function AnniversariesLoading() {
  return (
    <PageLoading label="Ehrungen werden geladen …">
      <PageHeaderSkeleton actions={2} backLink />
      <div className="flex items-end gap-2">
        <FieldSkeleton labelWidth="w-10" className="w-32" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>
      {[2, 4].map((rows) => (
        <PageSectionSkeleton key={rows} titleWidth="w-28" description>
          <TableSkeleton rows={rows} columns={5} stack />
        </PageSectionSkeleton>
      ))}
    </PageLoading>
  );
}
