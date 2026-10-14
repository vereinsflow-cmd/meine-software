import {
  FormCardSkeleton,
  PageHeaderSkeleton,
  PageLoading,
} from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Ladegerüst für „Neues Mitglied“ und „Mitglied bearbeiten“: Zurück-Link und Kopf, darunter die Karten des Formulars
 * (Stammdaten, Abteilungen, Kontakt) und rechts die Knöpfe – so breit wie das Formular (`max-w-4xl`). Für Screenreader
 * eine Live-Region mit `label`.
 */
export function MemberFormSkeleton({ label }: { label: string }) {
  return (
    <PageLoading label={label}>
      <PageHeaderSkeleton actions={0} backLink />
      <div className="grid max-w-4xl gap-6">
        <FormCardSkeleton fields={6} />
        <FormCardSkeleton titleWidth="w-32">
          <div className="grid gap-4">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex items-center gap-2.5">
                <Skeleton className="size-4 rounded-xs" />
                <Skeleton className={cn("h-4", index === 1 ? "w-36" : "w-28")} />
              </div>
            ))}
          </div>
        </FormCardSkeleton>
        <FormCardSkeleton fields={4} />
        <div className="flex justify-end gap-2">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-40 rounded-lg" />
        </div>
      </div>
    </PageLoading>
  );
}
