import {
  FormCardSkeleton,
  PageHeaderSkeleton,
  PageLoading,
} from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Ladezustand einer Abteilung: Zurück-Link, das Band mit dem Bild der Abteilung, Kopf mit „Bearbeiten“, „Veranstaltungen“
 * und „Weitere Aktionen“, darunter ab `lg` nebeneinander die Karten „Mitglieder“ (Liste) und „Gruppen und Teams“
 * (umrandete Gruppen mit Namen).
 */
export default function DepartmentLoading() {
  return (
    <PageLoading label="Abteilung wird geladen …">
      {/* Zurück-Link wie `BackLink` in der Seitenspalte (0,75 rem bis zum Band), dann das Band – gleich hoch wie auf der Seite. */}
      <Skeleton className="-mb-3 h-5 w-36" />
      <Skeleton className="h-28 rounded-3xl sm:h-36" />
      <PageHeaderSkeleton actions={3} />
      <div className="grid gap-6 lg:grid-cols-2">
        <FormCardSkeleton titleWidth="w-40" description>
          <div className="divide-y">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex items-center justify-between gap-2 py-2.5">
                <Skeleton className={cn("h-4", index % 3 === 1 ? "w-44" : "w-32")} />
                <Skeleton className="h-8 w-32 rounded-lg" />
              </div>
            ))}
          </div>
        </FormCardSkeleton>
        <FormCardSkeleton titleWidth="w-44" description>
          <div className="grid gap-5">
            {Array.from({ length: 2 }, (_, group) => (
              <div key={group} className="grid gap-3 rounded-lg border p-3">
                <Skeleton className="h-5 w-32" />
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: group === 0 ? 4 : 3 }, (_, chip) => (
                    <Skeleton key={chip} className="h-6 w-24 rounded-full" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </FormCardSkeleton>
      </div>
    </PageLoading>
  );
}
