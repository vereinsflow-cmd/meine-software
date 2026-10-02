import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { BENTO_CELL, BENTO_GRID } from "@/modules/dashboard/kpi-layout";

/**
 * Ladezustand des Dashboards: Beim Öffnen der Seite erscheint sofort das Gerüst (Begrüßung, Reiterleiste, Kennzahlen, Karten)
 * statt einer leeren Fläche – die Seite wirkt schneller und springt beim Erscheinen der Inhalte nicht. Maße und Abstände folgen
 * dem fertigen Dashboard (seit 02.10.2026: runde Reiter, Kennzahlen im Kachelraster – dieselbe Aufteilung wie dort,
 * `kpi-layout.ts`; die leeren Platzhalter bekommen die übliche Reihenhöhe).
 */
export default function DashboardLoading() {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        Dashboard wird geladen …
      </p>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-11 w-80 max-w-full" />
        <Skeleton className="h-9 w-72 max-w-full rounded-full" />
      </div>
      <Skeleton className="mb-7 h-12 w-[34rem] max-w-full rounded-full" />
      <div className="@container/kpis">
        <div
          className={cn(
            "grid gap-5 sm:grid-cols-2",
            BENTO_GRID,
            "@bento/kpis:grid-rows-[repeat(2,minmax(15rem,1fr))]",
          )}
        >
          {BENTO_CELL.map((cell, index) => (
            <Skeleton
              key={index}
              className={cn(
                "h-60 rounded-[1.75rem] @bento/kpis:h-auto",
                index > 0 && "max-sm:hidden",
                cell,
              )}
            />
          ))}
        </div>
      </div>
      <div className="mt-10 grid gap-7 md:grid-cols-2">
        <Skeleton className="h-72 rounded-[1.75rem]" />
        <Skeleton className="h-72 rounded-[1.75rem]" />
      </div>
    </div>
  );
}
