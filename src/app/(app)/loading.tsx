import { Skeleton } from "@/components/ui/skeleton";

/** Ladezustand: Platzhalter statt leerer Seite, solange Daten geladen werden. */
export default function AppLoading() {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Wird geladen …</span>
      <Skeleton className="mb-2 h-8 w-64" />
      <Skeleton className="mb-8 h-4 w-96 max-w-full" />
      <div className="grid gap-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-3/4" />
      </div>
    </div>
  );
}
