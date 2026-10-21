import { PageHeaderSkeleton, PageLoading, lineWidth } from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { SOFT_CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/** Breiten der Filterknöpfe im Gerüst („Alle 12“, „Protokolle 4“ …) – fest, damit Server und Browser gleich zeichnen. */
const CHIP_WIDTHS = ["w-16", "w-28", "w-24", "w-32"];

/**
 * Ladegerüst der Dokumentenliste („Ruhige Liste“) – Maße wie die fertige Seite (`(app)/dokumente/page.tsx`): Kopf mit
 * „Dokument hochladen“, darunter eine Karte mit Suche, Filterknöpfen und gleich hohen Zeilen (Kachel, Name, graue Zeile,
 * rechts das Menü „…“). Ohne den Fuß mit dem Speicherplatz – den sehen nur, die hochladen dürfen (die meisten nicht).
 */
export function DocumentListPageSkeleton({ label }: { label?: string }) {
  return (
    <PageLoading label={label}>
      <PageHeaderSkeleton actions={1} />
      <div className={cn(SOFT_CARD_SURFACE, "overflow-hidden")}>
        <div className="grid gap-3 border-b border-foreground/5 p-3 sm:p-4">
          <Skeleton className="h-9 w-full rounded-lg sm:max-w-sm" />
          <div className="flex flex-wrap gap-1.5">
            {CHIP_WIDTHS.map((width) => (
              <Skeleton key={width} className={cn("h-8 rounded-full", width)} />
            ))}
          </div>
        </div>
        <div className="grid gap-0.5 p-2">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="flex min-h-16 items-center gap-3 px-2 py-2 md:gap-4 md:px-3"
            >
              <Skeleton className="size-9 shrink-0 rounded-lg md:size-10" />
              <div className="grid min-w-0 flex-1 gap-1.5">
                <Skeleton className={cn("h-4", index % 2 === 0 ? "w-3/5" : "w-2/5")} />
                <Skeleton className={cn("h-3", lineWidth(index + 2))} />
              </div>
              <Skeleton className="size-8 shrink-0 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </PageLoading>
  );
}
