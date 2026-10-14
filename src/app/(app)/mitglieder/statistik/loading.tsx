import { PageHeaderSkeleton, PageLoading } from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/** Feste Balkenlängen, damit Server und Browser gleich zeichnen. */
const BARS = ["w-full", "w-3/5", "w-2/5", "w-1/5"];

/** Ladezustand der Mitgliederstatistik: Kopf und vier Karten mit Balkenlisten (Name, Balken, Zahl), ab `md` zu zweit. */
export default function MemberStatsLoading() {
  return (
    <PageLoading label="Statistik wird geladen …">
      <PageHeaderSkeleton actions={0} backLink />
      <div className="grid gap-6 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, card) => (
          <div key={card} className={cn(CARD_SURFACE, "grid content-start gap-5 p-5")}>
            <Skeleton className="h-6 w-36" />
            <div className="grid gap-2.5">
              {BARS.map((bar, row) => (
                <div
                  key={row}
                  className="grid grid-cols-[minmax(0,10rem)_1fr_2.5rem] items-center gap-3"
                >
                  <Skeleton className={cn("h-4", row % 2 === 0 ? "w-24" : "w-16")} />
                  <div className="h-2.5">
                    <Skeleton className={cn("h-full rounded-full", bar)} />
                  </div>
                  <Skeleton className="ml-auto h-4 w-6" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageLoading>
  );
}
