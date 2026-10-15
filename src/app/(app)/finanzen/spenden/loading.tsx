import { Skeleton } from "@/components/ui/skeleton";

/**
 * Ladezustand der Seite „Spenden“: sofort das Gerüst des Cockpits (Kopf, Leiste, violette Karte mit zwei kleinen Karten,
 * darunter zwei Spalten) statt einer leeren Fläche – die Seite springt beim Erscheinen der Inhalte nicht. Maße wie die fertige
 * Seite; am Handy „Das steht an“ zuerst.
 */
export default function DonationsLoading() {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        Spenden werden geladen …
      </p>
      <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="grid gap-2">
          <Skeleton className="h-9 w-44" />
          <Skeleton className="h-5 w-72 max-w-full" />
        </div>
        <Skeleton className="h-9 w-36" />
      </div>
      <Skeleton className="mb-6 h-11 w-[38rem] max-w-full rounded-lg" />
      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Skeleton className="col-span-2 h-60 rounded-[1.75rem]" />
        <Skeleton className="h-60 rounded-xl" />
        <Skeleton className="h-60 rounded-xl" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] xl:grid-rows-[auto_1fr] xl:items-start">
        <Skeleton className="h-64 rounded-xl xl:col-start-2 xl:row-start-1" />
        <div className="grid gap-6 xl:col-start-1 xl:row-span-2 xl:row-start-1">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
        <Skeleton className="h-72 rounded-xl xl:col-start-2 xl:row-start-2" />
      </div>
    </div>
  );
}
