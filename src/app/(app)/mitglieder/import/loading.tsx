import { PageHeaderSkeleton, PageLoading } from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/** Ladezustand des Imports: Kopf und die Karte „1. Datei auswählen“ mit Erklärung und Knöpfen. */
export default function ImportMembersLoading() {
  return (
    <PageLoading label="Import wird geladen …">
      <PageHeaderSkeleton actions={0} backLink />
      <div className={cn(CARD_SURFACE, "grid gap-2 p-4")}>
        <Skeleton className="mb-1 h-6 w-36" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Skeleton className="h-9 w-40 rounded-lg" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-8 w-44 rounded-lg" />
        </div>
      </div>
    </PageLoading>
  );
}
