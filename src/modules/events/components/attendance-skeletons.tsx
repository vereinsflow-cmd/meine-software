import {
  PageHeaderSkeleton,
  PageLoading,
  PageSectionSkeleton,
  TableSkeleton,
  ToolbarSkeleton,
  lineWidth,
} from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/**
 * Ladegerüste der Anwesenheit (für die `loading.tsx` unter app/(app)/veranstaltungen): Aufbau wie auf den fertigen Seiten,
 * damit beim Erscheinen nichts springt. Die Flächen pulsieren nur ohne „Bewegung reduzieren“ (`Skeleton`).
 */

/** Erfassungsliste: Zurück-Link und Kopf, „Personen“ mit „Alle anwesend“, Auswahl für Gruppe und Person, je Person drei Knöpfe. */
export function AttendanceSheetSkeleton() {
  return (
    <PageLoading label="Anwesenheit wird geladen …">
      <PageHeaderSkeleton actions={0} backLink />
      <PageSectionSkeleton titleWidth="w-28" description action>
        <div className="grid gap-2 sm:flex sm:gap-4">
          <Skeleton className="h-9 w-full rounded-lg sm:w-80" />
          <Skeleton className="h-9 w-full rounded-lg sm:w-80" />
        </div>
        <div className={cn(CARD_SURFACE, "divide-y")}>
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_26rem] md:items-center md:gap-4"
            >
              <Skeleton className={cn("h-4", lineWidth(index + 2))} />
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 3 }, (_, option) => (
                  <Skeleton key={option} className="h-11 rounded-lg md:h-10" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </PageSectionSkeleton>
    </PageLoading>
  );
}

/** Auswertung: Kopf mit „Export“, Filterleiste, Kennzahlen und die Tabelle (am Handy gestapelt). */
export function AttendanceStatsSkeleton() {
  return (
    <PageLoading label="Auswertung wird geladen …">
      <PageHeaderSkeleton actions={1} backLink />
      <ToolbarSkeleton />
      <Skeleton className="h-4 w-80 max-w-full" />
      <TableSkeleton rows={8} columns={5} stack />
    </PageLoading>
  );
}
