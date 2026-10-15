import { CardSkeleton } from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";
import { FinanceLoading } from "@/modules/finance/components/finance-skeletons";

/**
 * Ladezustand des Spenden-Cockpits: violette Kennzahl mit „Spender“ und „Bestätigungen“ daneben, darunter zwei Spalten wie die
 * fertige Seite (am Handy „Das steht an“ zuerst). Kopf und Leiste der Bereiche stehen schon echt da (`FinanceLoading`).
 */
export default function DonationsLoading() {
  return (
    <FinanceLoading label="Spenden werden geladen …" actions={["w-36"]}>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Skeleton className="col-span-2 h-60 rounded-4xl" />
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className={cn(CARD_SURFACE, "grid content-start gap-3 p-4 sm:p-5")}>
            <Skeleton className="h-5 w-28 max-w-full" />
            <Skeleton className="h-9 w-12" />
            <Skeleton className="h-4 w-32 max-w-full" />
            <Skeleton className="h-4 w-24 max-w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] xl:grid-rows-[auto_1fr] xl:items-start">
        <CardSkeleton lines={5} className="xl:col-start-2 xl:row-start-1" />
        <div className="grid content-start gap-6 xl:col-start-1 xl:row-span-2 xl:row-start-1">
          <div className={cn(CARD_SURFACE, "grid content-start gap-4 p-5")}>
            <div className="grid gap-1.5">
              <Skeleton className="h-6 w-48 max-w-full" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </div>
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
          <CardSkeleton lines={5} />
        </div>
        <CardSkeleton lines={4} className="xl:col-start-2 xl:row-start-2" />
      </div>
    </FinanceLoading>
  );
}
