import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { HERO_BANNER_HEIGHT, HERO_NIGHT } from "@/modules/dashboard/hero";

/**
 * Ladezustand des Dashboards: Beim Öffnen der Seite erscheint sofort das Gerüst (Begrüßung, Reiterleiste, Kennzahlen, Karten)
 * statt einer leeren Fläche – die Seite wirkt schneller und springt beim Erscheinen der Inhalte nicht. Maße und Abstände folgen
 * dem fertigen Dashboard (seit 17.10.2026 Stil der Vorlage „Analytics“: links Mitglieder-Kachel und Aufgaben-Ring, darunter die
 * Karten, rechts die Spalte der Kennzahlen – dieselben Breiten wie `StudioFrame`).
 *
 * Kopf (seit 21.10.2026 die „Vereins-Bühne“, `DashboardHero`): eine Fläche in derselben Nachtfarbe und Höhe wie das Banner –
 * dieselbe Klasse `HERO_BANNER_HEIGHT`, gemessen wird wie dort die Breite des Kopfes (`@container/buehne`): am Handy 17,125 rem,
 * ab 40 rem 17 rem. Das Banner ist fest so hoch, egal wie lang Name oder Rolle sind und ob es Fotos gibt. Bis 62 rem stehen die
 * Knöpfe darunter, also auch ihre Platzhalter.
 */
export default function DashboardLoading() {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        Dashboard wird geladen …
      </p>
      <div className="@container/buehne mb-6">
        <div
          className={cn(
            HERO_BANNER_HEIGHT,
            "rounded-3xl motion-safe:animate-pulse @[40rem]/buehne:rounded-4xl",
          )}
          style={{ backgroundColor: HERO_NIGHT }}
        />
        <div className="mt-3 grid grid-cols-2 gap-2 @[40rem]/buehne:flex @[40rem]/buehne:justify-end @[40rem]/buehne:gap-2.5 @[62rem]/buehne:hidden">
          <Skeleton className="h-11 rounded-full @[40rem]/buehne:w-56" />
          <Skeleton className="h-11 rounded-full @[40rem]/buehne:w-48" />
        </div>
      </div>
      <Skeleton className="mb-6 h-12 w-[30rem] max-w-full rounded-full" />
      <div className="@container/studio">
        <div className="grid gap-6 @bento-wide/studio:grid-cols-[minmax(0,1fr)_minmax(19rem,22rem)]">
          <div className="grid content-start gap-6">
            <div className="@container/pair">
              <div className="grid gap-6 @[34rem]/pair:grid-cols-2">
                <Skeleton className="h-80 rounded-3xl" />
                <Skeleton className="h-80 rounded-3xl max-sm:hidden" />
              </div>
            </div>
            <Skeleton className="h-64 rounded-3xl" />
          </div>
          <div className="grid content-start gap-5 max-sm:hidden sm:grid-cols-2 @bento-wide/studio:grid-cols-1">
            <Skeleton className="h-28 rounded-3xl" />
            <Skeleton className="h-96 rounded-3xl" />
            <Skeleton className="h-28 rounded-3xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
