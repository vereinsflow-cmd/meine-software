import { FieldSkeleton, PageHeaderSkeleton, PageLoading } from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Ladezustand von „Neue Nachricht“ (eigenes Gerüst, sonst erschiene das der Chats): Zurück-Link, Kopf und das Formular –
 * Empfänger, Reichweite, Betreff, Text, Optionen und Knöpfe.
 */
export default function Loading() {
  return (
    <PageLoading label="Formular wird geladen …">
      <PageHeaderSkeleton actions={0} backLink />
      <div className="grid max-w-3xl gap-5">
        <FieldSkeleton labelWidth="w-20" />
        <Skeleton className="h-4 w-48" />
        <FieldSkeleton labelWidth="w-16" />
        <div className="grid gap-1.5">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-60 w-full rounded-lg" />
          <Skeleton className="h-3.5 w-3/4" />
        </div>
        <div className="grid gap-2">
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-36 rounded-lg" />
          <Skeleton className="h-9 w-44 rounded-lg" />
        </div>
      </div>
    </PageLoading>
  );
}
