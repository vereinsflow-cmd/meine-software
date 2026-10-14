import { PageHeaderSkeleton, PageLoading } from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/**
 * Ladezustand des Aushangs: Kopf mit „Aushang drucken“, darunter das Blatt – Logo, Vereinsname, Überschrift, großer QR-Code,
 * Link und die drei Schritte, mittig wie auf dem Papier.
 */
export default function JoinPosterLoading() {
  return (
    <PageLoading label="Aushang wird geladen …" className="mx-auto max-w-3xl">
      <PageHeaderSkeleton actions={1} backLink />
      <div className={cn(CARD_SURFACE, "flex flex-col items-center px-6 py-10 sm:px-12")}>
        <Skeleton className="mb-3 size-20 rounded-lg" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-6 h-10 w-72 max-w-full sm:h-12" />
        <Skeleton className="mt-3 h-6 w-96 max-w-full" />
        <Skeleton className="mt-8 size-64 rounded-lg sm:size-72" />
        <Skeleton className="mt-4 h-4 w-80 max-w-full" />
        <div className="mt-8 grid w-full max-w-lg gap-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <Skeleton className={cn("h-5", index === 1 ? "w-full" : "w-4/5")} />
            </div>
          ))}
        </div>
      </div>
    </PageLoading>
  );
}
