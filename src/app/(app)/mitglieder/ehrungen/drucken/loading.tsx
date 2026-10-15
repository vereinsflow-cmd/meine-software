import { PageHeaderSkeleton, PageLoading, lineWidth } from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/**
 * Ladezustand der Druckansicht: mittige Spalte mit Zurück-Link und Kopf („Drucken“), darunter das Blatt – Überschrift, ein
 * Satz und zwei Stufen mit Zeilen, so breit wie A4.
 */
export default function PrintAnniversariesLoading() {
  return (
    <PageLoading label="Druckansicht wird geladen …">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <PageHeaderSkeleton actions={1} backLink />
      </div>
      <div
        className={cn(CARD_SURFACE, "mx-auto grid w-full max-w-[210mm] gap-3 px-4 py-5 sm:p-12")}
      >
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/5" />
        {[3, 4].map((rows) => (
          <div key={rows} className="mt-6 grid gap-2.5">
            <Skeleton className="h-5 w-48" />
            {Array.from({ length: rows }, (_, index) => (
              <Skeleton key={index} className={cn("h-4", lineWidth(index + 3))} />
            ))}
          </div>
        ))}
      </div>
    </PageLoading>
  );
}
