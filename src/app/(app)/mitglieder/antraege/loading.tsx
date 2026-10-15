import {
  CardHeadSkeleton,
  PageHeaderSkeleton,
  PageLoading,
  PageSectionSkeleton,
} from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/**
 * Ladezustand der Beitrittsanträge (so breit wie die Seite, `max-w-4xl`): Kopf, die Karte „QR-Code zum Beitritt“ mit Code,
 * Link und Knöpfen, darunter die Abschnitte „Offene Anträge“ (eine Antragskarte) und „Zuletzt entschieden“ (Liste).
 */
export default function ApplicationsLoading() {
  return (
    <PageLoading label="Beitrittsanträge werden geladen …" className="max-w-4xl">
      <PageHeaderSkeleton actions={0} backLink />

      <div className={cn(CARD_SURFACE, "grid gap-5 p-5")}>
        <div className="grid gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
          <Skeleton className="size-44 rounded-lg" />
          <div className="grid min-w-0 gap-4">
            <div className="grid gap-1.5">
              <Skeleton className="h-4 w-44" />
              <div className="flex flex-col gap-2 sm:flex-row">
                <Skeleton className="h-9 flex-1 rounded-lg" />
                <Skeleton className="h-9 w-28 rounded-lg" />
              </div>
              <Skeleton className="h-4 w-56" />
            </div>
            <div className="grid gap-2">
              <Skeleton className="h-4 w-64 max-w-full" />
              <Skeleton className="h-2 rounded-full" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-9 w-40 rounded-lg" />
              <Skeleton className="h-9 w-36 rounded-lg" />
              <Skeleton className="h-9 w-44 rounded-lg" />
            </div>
          </div>
        </div>
      </div>

      <PageSectionSkeleton titleWidth="w-44">
        <div className={cn(CARD_SURFACE, "grid gap-5 p-5")}>
          <CardHeadSkeleton titleWidth="w-40" />
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="grid gap-1.5">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className={cn("h-4", index % 2 === 0 ? "w-48" : "w-28")} />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        </div>
      </PageSectionSkeleton>

      <PageSectionSkeleton titleWidth="w-44" description>
        <div className={cn(CARD_SURFACE, "divide-y")}>
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="grid min-w-0 flex-1 gap-2">
                <Skeleton className={cn("h-4", index === 1 ? "w-48" : "w-40")} />
                <Skeleton className="h-3.5 w-64 max-w-full" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          ))}
        </div>
      </PageSectionSkeleton>
    </PageLoading>
  );
}
