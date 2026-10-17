import { Skeleton } from "@/components/ui/skeleton";

/**
 * Ladezustand des Dashboards: Beim Öffnen der Seite erscheint sofort das Gerüst (Begrüßung, Reiterleiste, Kennzahlen, Karten)
 * statt einer leeren Fläche – die Seite wirkt schneller und springt beim Erscheinen der Inhalte nicht. Maße und Abstände folgen
 * dem fertigen Dashboard (seit 17.10.2026 Stil der Vorlage „Analytics“: links Mitglieder-Kachel und Aufgaben-Ring, darunter die
 * Karten, rechts die Spalte der Kennzahlen – dieselben Breiten wie `StudioFrame`).
 */
export default function DashboardLoading() {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        Dashboard wird geladen …
      </p>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid gap-2">
          <Skeleton className="h-11 w-80 max-w-full" />
          <Skeleton className="h-5 w-64 max-w-full" />
        </div>
        <Skeleton className="h-11 w-96 max-w-full rounded-full" />
      </div>
      <Skeleton className="mb-6 h-12 w-[30rem] max-w-full rounded-full" />
      <div className="@container/studio">
        <div className="grid gap-6 @bento-wide/studio:grid-cols-[minmax(0,1fr)_minmax(19rem,22rem)]">
          <div className="grid content-start gap-6">
            <div className="@container/pair">
              <div className="grid gap-6 @[34rem]/pair:grid-cols-2">
                <Skeleton className="h-80 rounded-3xl" />
                <Skeleton className="h-80 rounded-3xl max-sm:hidden" />
              </div>
            </div>
            <Skeleton className="h-64 rounded-3xl" />
          </div>
          <div className="grid content-start gap-5 max-sm:hidden sm:grid-cols-2 @bento-wide/studio:grid-cols-1">
            <Skeleton className="h-28 rounded-3xl" />
            <Skeleton className="h-96 rounded-3xl" />
            <Skeleton className="h-28 rounded-3xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
