import { PageHeaderSkeleton, PageLoading } from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/** Ladezustand des Belegs bis 300 €: Kopf mit „Beleg drucken“, darunter das Blatt mit Absender, Überschrift und Absätzen. */
export default function SimplifiedProofLoading() {
  return (
    <PageLoading label="Beleg wird geladen …" className="mx-auto max-w-3xl">
      <PageHeaderSkeleton actions={1} backLink />
      <div className={cn(CARD_SURFACE, "grid gap-4 px-6 py-10 sm:px-12")}>
        <div className="mb-4 grid gap-2">
          <Skeleton className="h-5 w-56 max-w-full" />
          <Skeleton className="h-4 w-44 max-w-full" />
          <Skeleton className="h-4 w-40 max-w-full" />
        </div>
        <Skeleton className="mb-2 h-6 w-80 max-w-full" />
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="grid gap-1.5">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className={cn("h-4", index % 2 === 0 ? "w-3/5" : "w-4/5")} />
          </div>
        ))}
      </div>
    </PageLoading>
  );
}
