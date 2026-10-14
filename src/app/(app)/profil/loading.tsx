import {
  FieldSkeleton,
  FormCardSkeleton,
  PageHeaderSkeleton,
  PageLoading,
} from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Zeilen einer umrandeten Liste (Vereine, angemeldete Geräte). */
function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="divide-y rounded-lg border">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 p-3">
          <Skeleton className="size-5 shrink-0 rounded-md" />
          <div className="grid flex-1 gap-1.5">
            <Skeleton className={cn("h-4", index % 2 === 0 ? "w-2/5" : "w-1/3")} />
            <Skeleton className="h-3.5 w-3/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Ladezustand von „Mein Profil“: Kopf, darunter (höchstens 56 rem breit) die Abschnitte Persönliche Angaben, Meine
 * Vereine, Benachrichtigungen, Passwort ändern, Zwei-Faktor-Authentifizierung und Angemeldete Geräte.
 */
export default function ProfileLoading() {
  return (
    <PageLoading label="Profil wird geladen …">
      <PageHeaderSkeleton actions={0} />
      <div className="grid max-w-4xl gap-6">
        <FormCardSkeleton icon titleWidth="w-44" description>
          <div className="grid max-w-xl gap-4 sm:grid-cols-2">
            <FieldSkeleton />
            <FieldSkeleton />
            <Skeleton className="h-9 w-28 rounded-lg" />
          </div>
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="grid gap-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-4 w-48 max-w-full" />
              </div>
            ))}
          </div>
        </FormCardSkeleton>
        <FormCardSkeleton icon titleWidth="w-44">
          <RowsSkeleton rows={1} />
        </FormCardSkeleton>
        <FormCardSkeleton icon titleWidth="w-44">
          <div className="flex items-start gap-3">
            <Skeleton className="h-4.5 w-8 shrink-0 rounded-full" />
            <div className="grid flex-1 gap-1.5">
              <Skeleton className="h-4 w-44" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          </div>
        </FormCardSkeleton>
        <FormCardSkeleton icon titleWidth="w-44" description>
          <div className="grid max-w-md gap-4">
            <FieldSkeleton />
            <FieldSkeleton />
            <FieldSkeleton />
            <Skeleton className="h-9 w-36 rounded-lg" />
          </div>
        </FormCardSkeleton>
        <FormCardSkeleton icon titleWidth="w-44">
          <Skeleton className="h-4 w-4/5" />
        </FormCardSkeleton>
        <FormCardSkeleton icon titleWidth="w-44" description>
          <RowsSkeleton rows={2} />
        </FormCardSkeleton>
      </div>
    </PageLoading>
  );
}
