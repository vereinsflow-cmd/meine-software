import { PageHeaderSkeleton, PageLoading } from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/** Zwei Gruppen nach Frist („Überfällig“, „Nächste 7 Tage“ …) mit unterschiedlich langen Titeln. */
const GROUPS = [
  ["w-1/2", "w-2/5"],
  ["w-1/3", "w-3/5", "w-2/5"],
];

/**
 * Ladezustand der Aufgaben: Kopf, Reiter und Suche in einer Zeile, darunter die Aufgaben als Karten (Kästchen, Titel,
 * Frist und zuständige Person), nach Frist gruppiert – wie `TaskRow`.
 */
export default function Loading() {
  return (
    <PageLoading label="Aufgaben werden geladen …">
      <PageHeaderSkeleton actions={1} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-10 w-full max-w-xl rounded-lg" />
        <div className="flex w-full items-center gap-2 lg:w-auto">
          <Skeleton className="h-9 min-w-40 flex-1 rounded-lg lg:w-56 lg:flex-none" />
          <Skeleton className="h-9 w-36 rounded-lg" />
          <Skeleton className="h-9 w-20 rounded-lg" />
        </div>
      </div>
      <div className="grid gap-6">
        {GROUPS.map((titles, group) => (
          <div key={group} className="grid gap-2">
            <Skeleton className="h-4 w-32" />
            {titles.map((width, index) => (
              <div key={index} className={cn(CARD_SURFACE, "flex items-start gap-3 p-4")}>
                <Skeleton className="mt-1 size-5 shrink-0 rounded-sm" />
                <div className="grid min-w-0 flex-1 gap-2">
                  <Skeleton className={cn("h-5", width)} />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </PageLoading>
  );
}
