import {
  FieldSkeleton,
  PageHeaderSkeleton,
  PageLoading,
  PageSectionSkeleton,
} from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/**
 * Ladezustand von „Hilfe & Support“: Kopf mit „Problem melden“, die Ansprechpartner als Karten und die Anleitung mit
 * Suchfeld und aufklappbaren Fragen.
 */
export default function HelpLoading() {
  return (
    <PageLoading label="Hilfe wird geladen …">
      <PageHeaderSkeleton actions={1} />
      <PageSectionSkeleton titleWidth="w-40" description>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className={cn(CARD_SURFACE, "grid gap-2 p-4", index > 0 && "max-sm:hidden")}
            >
              <Skeleton className="h-4 w-2/5" />
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="mt-1 h-3.5 w-3/5" />
              <Skeleton className="h-3.5 w-2/5" />
            </div>
          ))}
        </div>
      </PageSectionSkeleton>
      <PageSectionSkeleton titleWidth="w-72" description>
        <div className="grid gap-6">
          <FieldSkeleton labelWidth="w-40" className="sm:max-w-md" />
          <div className="grid gap-2">
            <div className="grid gap-1.5">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>
            <div className={cn(CARD_SURFACE, "divide-y")}>
              {["w-2/3", "w-1/2", "w-3/5", "w-2/5", "w-1/2"].map((width, index) => (
                <div key={index} className="flex items-center justify-between gap-3 px-4 py-3">
                  <Skeleton className={cn("h-4", width)} />
                  <Skeleton className="size-4 shrink-0 rounded-sm" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </PageSectionSkeleton>
    </PageLoading>
  );
}
