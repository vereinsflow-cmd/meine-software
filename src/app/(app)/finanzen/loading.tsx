import { CardSkeleton } from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import { FinanceLoading } from "@/modules/finance/components/finance-skeletons";

/**
 * Ladezustand der Finanz-Übersicht („Cockpit“): vier Kennzahlen, darunter Einnahmen und Ausgaben je Monat neben „Das steht
 * an“, dann Abteilungen und Konten. Kopf und Leiste der Bereiche stehen schon echt da (`FinanceLoading`).
 */
export default function FinanzenLoading() {
  return (
    <FinanceLoading label="Finanzen werden geladen …" actions={["w-64"]}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-60 rounded-4xl" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <div className={cn(CARD_SURFACE, "grid content-start gap-4 p-5")}>
          <div className="grid gap-1.5">
            <Skeleton className="h-6 w-64 max-w-full" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
          <div className="flex flex-wrap gap-x-10 gap-y-2">
            <Skeleton className="h-12 w-32" />
            <Skeleton className="h-12 w-32" />
          </div>
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
        <CardSkeleton lines={6} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <CardSkeleton lines={4} />
        <CardSkeleton lines={3} />
      </div>
    </FinanceLoading>
  );
}
