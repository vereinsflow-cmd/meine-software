import {
  FormCardSkeleton,
  PageHeaderSkeleton,
  PageLoading,
} from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Einige Zeilen Fließtext. */
function LinesSkeleton({ lines }: { lines: number }) {
  return (
    <div className="grid gap-2">
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={cn("h-4", index === lines - 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

/**
 * Ladezustand der Datenschutzseite: Kopf, darunter (höchstens 56 rem breit) die Abschnitte Verantwortlicher, gespeicherte
 * Daten, Einwilligungen, Datenexport und Löschung.
 */
export default function PrivacyLoading() {
  return (
    <PageLoading label="Datenschutz wird geladen …">
      <PageHeaderSkeleton actions={0} />
      <div className="grid max-w-4xl gap-6">
        <FormCardSkeleton icon titleWidth="w-52" description>
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="grid gap-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-4 w-48 max-w-full" />
              </div>
            ))}
          </div>
          <Skeleton className="h-4 w-4/5" />
        </FormCardSkeleton>
        <FormCardSkeleton icon titleWidth="w-52" description>
          <LinesSkeleton lines={5} />
          <LinesSkeleton lines={3} />
        </FormCardSkeleton>
        <FormCardSkeleton icon titleWidth="w-52">
          <div className="divide-y rounded-lg border">
            {Array.from({ length: 2 }, (_, index) => (
              <div key={index} className="flex items-start justify-between gap-3 p-3">
                <div className="grid flex-1 gap-1.5">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3.5 w-1/3" />
                </div>
                <Skeleton className="h-4.5 w-8 shrink-0 rounded-full" />
              </div>
            ))}
          </div>
        </FormCardSkeleton>
        <FormCardSkeleton icon titleWidth="w-52" description>
          <LinesSkeleton lines={2} />
          <Skeleton className="h-9 w-56 rounded-lg" />
        </FormCardSkeleton>
        <FormCardSkeleton icon titleWidth="w-52">
          <LinesSkeleton lines={3} />
          <Skeleton className="h-9 w-36 rounded-lg" />
        </FormCardSkeleton>
      </div>
    </PageLoading>
  );
}
