import { PageHeaderSkeleton, PageLoading, lineWidth } from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { SOFT_CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/**
 * Ladegerüst der Mitgliederliste mit Detailbereich – Maße wie die fertige Seite (`(app)/mitglieder/page.tsx`): Kopf mit den
 * Knöpfen (am Handy „Neues Mitglied“ und „Weitere Aktionen“), links die Liste mit Suche, „Filter“, Sortierung und Zeilen
 * (Kreis, zwei Zeilen, Status), rechts ab `lg` das Detail mit Farbband, großem Kreis, Name und den grauen Bereichen.
 */
export function MemberListPageSkeleton({ label }: { label?: string }) {
  return (
    <PageLoading label={label}>
      <PageHeaderSkeleton actions={6} className="max-sm:hidden" />
      <PageHeaderSkeleton actions={2} className="sm:hidden" />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:h-[calc(100dvh-var(--app-header-height)-10rem)] lg:min-h-[34rem] lg:grid-cols-[minmax(18rem,21rem)_minmax(0,1fr)]">
        <div className={cn(SOFT_CARD_SURFACE, "flex flex-col overflow-hidden")}>
          <div className="flex gap-2 p-3">
            <Skeleton className="h-9 min-w-0 flex-1 rounded-lg" />
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
          <Skeleton className="mx-3 mb-1.5 h-6 w-60 max-w-[calc(100%-1.5rem)]" />
          <div className="px-2 pb-2">
            <Skeleton className="mx-3 mt-2.5 mb-1 h-4 w-3" />
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 px-3 py-2.5">
                <Skeleton className="size-10 shrink-0 rounded-full" />
                <div className="grid min-w-0 flex-1 gap-1.5">
                  <Skeleton className={cn("h-4", index % 2 === 0 ? "w-3/4" : "w-3/5")} />
                  <Skeleton className={cn("h-3", lineWidth(index))} />
                </div>
                <Skeleton className="h-3 w-12 shrink-0" />
              </div>
            ))}
          </div>
        </div>
        <MemberDetailSkeleton className="max-lg:hidden" />
      </div>
    </PageLoading>
  );
}

/**
 * Nur der Detailbereich (Farbband, großer Kreis, Name, graue Bereiche) – im Ladegerüst der Seite und als Platzhalter, solange
 * das gewählte Mitglied nachgeladen wird (die Liste steht dann schon). `label` macht ihn zur Statusmeldung für Screenreader.
 */
export function MemberDetailSkeleton({ label, className }: { label?: string; className?: string }) {
  return (
    <div
      role={label ? "status" : undefined}
      aria-busy={label ? true : undefined}
      className={cn(SOFT_CARD_SURFACE, "overflow-hidden", className)}
    >
      {label && <span className="sr-only">{label}</span>}
      <Skeleton className="h-20 rounded-none" />
      <div className="px-7 pb-6">
        <div className="flex items-start gap-4">
          <Skeleton className="-mt-10 size-20 shrink-0 rounded-full ring-4 ring-card" />
          <div className="grid flex-1 gap-2.5 pt-3">
            <Skeleton className="h-7 w-64 max-w-full" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-6 w-48 rounded-full" />
          </div>
        </div>
        <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Skeleton className="h-52 rounded-2xl" />
          <Skeleton className="h-52 rounded-2xl" />
        </div>
        <Skeleton className="mt-4 h-16 rounded-2xl" />
      </div>
    </div>
  );
}
