import {
  FormCardSkeleton,
  lineWidth,
  PageHeaderSkeleton,
  PageLoading,
  ToolbarSkeleton,
} from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { CARD_SURFACE } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

/**
 * Ladegerüste der Veranstaltungen (für die `loading.tsx` unter app/(app)/veranstaltungen): Liste und Formular haben einen
 * eigenen Aufbau, den die allgemeinen Gerüste aus shared/page-skeletons.tsx nicht treffen. Bausteine und Maße wie dort –
 * Live-Region, Kopf, Filterleiste, Kartenfläche, Formularkarten –, damit beim Erscheinen der Inhalte nichts springt. Die
 * Detailseite nimmt `DetailPageSkeleton`.
 */

/** Liste: Kopf mit zwei Knöpfen, Suche und Filter, darunter Karten mit Datumsfeld, Titel, Zeit und Eckdaten. */
export function EventListSkeleton() {
  return (
    <PageLoading label="Veranstaltungen werden geladen …">
      <PageHeaderSkeleton actions={2} />
      <ToolbarSkeleton />
      <div className="grid gap-3">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className={cn(CARD_SURFACE, "flex gap-4 p-4")}>
            <Skeleton className="size-14 shrink-0 rounded-lg" />
            <div className="grid min-w-0 flex-1 content-start gap-2 pt-0.5">
              <Skeleton className={cn("h-5", lineWidth(index + 2))} />
              <Skeleton className="h-4 w-44 max-w-full" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          </div>
        ))}
      </div>
    </PageLoading>
  );
}

/** Felder je Karte des Formulars (Grunddaten, Zeit, Ort und Kontakt, Anmeldung) – die erste Zeile geht über die ganze Breite. */
const FORM_CARDS = [5, 4, 6, 4];

/** Formular „Neue Veranstaltung“ bzw. „… bearbeiten“: Zurück-Link, Kopf mit Satz, darunter die Karten mit Feldern. */
export function EventFormSkeleton({ label }: { label: string }) {
  return (
    <PageLoading label={label}>
      <PageHeaderSkeleton actions={0} backLink />
      <div className="grid max-w-4xl gap-6">
        {FORM_CARDS.map((fields, card) => (
          <FormCardSkeleton key={card} fields={fields} wide={[0]} />
        ))}
      </div>
    </PageLoading>
  );
}
