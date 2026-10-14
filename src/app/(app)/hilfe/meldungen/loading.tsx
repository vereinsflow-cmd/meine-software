import { PageHeaderSkeleton, PageLoading } from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/**
 * Ladezustand von „Eingegangene Meldungen“: Zurück-Link und Kopf, die Ansicht „Offen / Erledigt / Alle“ und die Meldungen
 * als Karten mit Text, Status und Antwortfeld.
 */
export default function TicketsLoading() {
  return (
    <PageLoading label="Meldungen werden geladen …">
      <PageHeaderSkeleton actions={0} backLink />
      <Skeleton className="h-10 w-56 rounded-lg" />
      <div className="grid gap-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className={cn(CARD_SURFACE, "grid gap-3 p-4")}>
            <div className="grid gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className={cn("h-5", index % 2 === 0 ? "w-56" : "w-44")} />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3.5 w-3/5" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <div className="grid gap-3 border-t pt-3 sm:grid-cols-[14rem_minmax(0,1fr)]">
              <div className="grid content-start gap-1.5">
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-9 rounded-lg" />
              </div>
              <div className="grid gap-1.5">
                <Skeleton className="h-4 w-52 max-w-full" />
                <Skeleton className="h-20 rounded-lg" />
              </div>
            </div>
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
        ))}
      </div>
    </PageLoading>
  );
}
