import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { BENTO_CELLS, BENTO_GRID } from "@/modules/dashboard/kpi-layout";

/**
 * Ladezustand des Dashboards: Beim Öffnen der Seite erscheint sofort das Gerüst (Begrüßung, Reiterleiste, Kennzahlen, Karten)
 * statt einer leeren Fläche – die Seite wirkt schneller und springt beim Erscheinen der Inhalte nicht. Maße und Abstände folgen
 * dem fertigen Dashboard (seit 17.10.2026 Entwurf 4: Begrüßung mit Untertitel, helle Reiterleiste, Kennzahlen im Kachelraster –
 * dieselbe Aufteilung wie dort, `kpi-layout.ts`, in der Fassung mit vier Karten; die leeren Platzhalter bekommen die übliche
 * Reihenhöhe).
 */
export default function DashboardLoading() {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        Dashboard wird geladen …
      </p>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid gap-2">
          <Skeleton className="h-10 w-72 max-w-full" />
          <Skeleton className="h-5 w-64 max-w-full" />
        </div>
        <Skeleton className="h-9 w-80 max-w-full" />
      </div>
      <Skeleton className="mb-6 h-11 w-[26rem] max-w-full rounded-lg" />
      <div className="@container/kpis">
        <div
          className={cn(
            "grid gap-5 sm:grid-cols-2",
            BENTO_GRID.m,
            "@bento/kpis:grid-rows-[repeat(2,minmax(12.5rem,1fr))]",
          )}
        >
          {BENTO_CELLS[4].map((cell, index) => (
            <Skeleton
              key={index}
              className={cn(
                "h-60 rounded-2xl @bento/kpis:h-auto",
                index > 0 && "max-sm:hidden",
                cell,
              )}
            />
          ))}
        </div>
      </div>
      <div className="mt-10 grid gap-7 md:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
