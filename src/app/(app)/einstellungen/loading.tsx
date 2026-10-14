import {
  FieldSkeleton,
  FormCardSkeleton,
  PageHeaderSkeleton,
  PageLoading,
} from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Ladezustand der Vereinseinstellungen: Kopf mit „Einrichtungs-Assistent“, darunter (höchstens 56 rem breit) die Karte
 * „Vereinslogo“ und das Formular mit „Vereinsdaten“ und „Datenschutz“.
 */
export default function SettingsLoading() {
  return (
    <PageLoading label="Vereinseinstellungen werden geladen …">
      <PageHeaderSkeleton actions={1} />
      <div className="grid max-w-4xl gap-6">
        <FormCardSkeleton description>
          <div className="flex items-center gap-4">
            <Skeleton className="size-16 shrink-0 rounded-xl" />
            <div className="grid flex-1 gap-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-56 max-w-full" />
            </div>
          </div>
          <FieldSkeleton className="max-w-md" />
          <Skeleton className="h-9 w-36 rounded-lg" />
        </FormCardSkeleton>
        <FormCardSkeleton description fields={7} wide={[0, 3, 6]} />
        <FormCardSkeleton description>
          <div className="grid gap-4 sm:grid-cols-3">
            <FieldSkeleton tall className="sm:col-span-3" />
            <FieldSkeleton />
            <FieldSkeleton />
            <FieldSkeleton />
          </div>
        </FormCardSkeleton>
        <Skeleton className="h-9 w-48 justify-self-end rounded-lg" />
      </div>
    </PageLoading>
  );
}
