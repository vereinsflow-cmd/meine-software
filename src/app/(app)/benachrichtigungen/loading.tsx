import { lineWidth, PageHeaderSkeleton, PageLoading } from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/**
 * Ladezustand der Benachrichtigungen: Kopf, Umschaltleiste „Alle | Nur ungelesene“ und die Hinweise als einzelne Karten
 * (Symbol, Titel, Text, Zeit und rechts bzw. am Handy darunter der Knopf) – wie `NotificationList`.
 */
export default function Loading() {
  return (
    <PageLoading label="Benachrichtigungen werden geladen …">
      <PageHeaderSkeleton actions={1} />
      <Skeleton className="h-10 w-60 self-start rounded-lg" />
      <div className="grid gap-3">
        {Array.from({ length: 5 }, (_, index) => (
          <div
            key={index}
            className={cn(CARD_SURFACE, "flex items-start gap-4 p-4 pl-5 sm:p-5 sm:pl-6")}
          >
            <Skeleton className="size-11 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 sm:flex sm:items-start sm:justify-between sm:gap-4">
              <div className="grid min-w-0 flex-1 gap-2">
                <Skeleton className={cn("h-5", lineWidth(index + 4))} />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="mt-1 h-4 w-36" />
              </div>
              <Skeleton className="mt-3 h-8 w-44 rounded-lg sm:mt-0 sm:shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </PageLoading>
  );
}
