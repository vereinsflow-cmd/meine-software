import { Skeleton } from "@/components/ui/skeleton";

/**
 * Ladezustand des Dashboards: Beim Öffnen der Seite erscheint sofort das Gerüst (Begrüßung, Reiterleiste, Kennzahlen, Karten)
 * statt einer leeren Fläche – die Seite wirkt schneller und springt beim Erscheinen der Inhalte nicht. Maße und Abstände folgen
 * dem fertigen Dashboard.
 */
export default function DashboardLoading() {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        Dashboard wird geladen …
      </p>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-9 w-56 max-w-full" />
      </div>
      <div className="mb-6 flex gap-2 border-b pb-3">
        {[28, 40, 28, 44].map((width, index) => (
          <Skeleton key={index} className="h-6" style={{ width: `${width}%`, maxWidth: "11rem" }} />
        ))}
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-36 rounded-xl" />
        ))}
      </div>
      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    </div>
  );
}
