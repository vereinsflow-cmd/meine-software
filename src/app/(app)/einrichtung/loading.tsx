import {
  FormCardSkeleton,
  PageHeaderSkeleton,
  PageLoading,
} from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** So viele Schritte hat der Assistent (`SETUP_STEPS`). */
const STEPS = 6;

/**
 * Ladezustand des Einrichtungs-Assistenten: Kopf, links die Schrittfolge (am Handy eine Reihe Kreise), rechts Schrittzahl,
 * Titel und Einleitung, eine Karte mit dem Inhalt des Schritts und unten „Zurück“ / „Weiter“.
 */
export default function SetupLoading() {
  return (
    <PageLoading label="Einrichtung wird geladen …">
      <PageHeaderSkeleton actions={0} />
      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
        <div className="flex gap-2 pb-1 lg:grid lg:gap-1 lg:pb-0">
          {Array.from({ length: STEPS }, (_, index) => (
            <div key={index} className="flex items-center gap-3 p-1.5 lg:px-3 lg:py-2">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="hidden min-w-0 flex-1 gap-1.5 lg:grid">
                <Skeleton className={cn("h-4", index % 2 === 0 ? "w-28" : "w-24")} />
                <Skeleton className="h-3 w-36" />
              </div>
            </div>
          ))}
        </div>
        <div className="grid max-w-4xl min-w-0 gap-6">
          <div className="grid gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-full max-w-prose" />
            <Skeleton className="h-4 w-3/5" />
          </div>
          <FormCardSkeleton description fields={6} wide={[0, 3]} />
          <div className="flex items-center justify-between gap-2 border-t pt-4">
            <Skeleton className="h-9 w-24 rounded-lg" />
            <Skeleton className="h-9 w-40 rounded-lg" />
          </div>
        </div>
      </div>
    </PageLoading>
  );
}
