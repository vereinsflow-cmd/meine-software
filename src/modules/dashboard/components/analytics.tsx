import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { AnalyticsData, AnalyticsTopicId } from "@/lib/charts/types";
import { AnalyticsSection } from "./analytics-section";

/**
 * Zeigt die Auswertungen zu den genannten Themen. Die Daten werden einmal pro Seitenaufruf berechnet (`data` ist der
 * gemeinsame Promise aus `getAnalytics`) und auf die Dashboard-Reiter verteilt: Mitglieder, Veranstaltungen samt
 * Helferstunden, Aufgaben. Wird in `<Suspense>` eingebettet – Kennzahlen, Aufgaben und Termine stehen sofort, die (etwas
 * aufwendigeren) Diagramme folgen. Darf die Rolle keines der Themen sehen, erscheint nichts.
 */
export async function Analytics({
  data,
  topics,
  description,
}: {
  data: Promise<AnalyticsData>;
  topics: AnalyticsTopicId[];
  description: string;
}) {
  const all = await data;
  const chosen = all.topics.filter((topic) => topics.includes(topic.id));
  return chosen.length > 0 ? (
    <AnalyticsSection data={{ topics: chosen }} description={description} />
  ) : null;
}

/** Platzhalter, während die Auswertungen laden – hat schon die Größe des fertigen Bereichs, damit nichts springt. */
export function AnalyticsSkeleton() {
  return (
    <section aria-labelledby="w-auswertungen-laden" aria-busy="true">
      <Card>
        <CardHeader>
          <CardTitle id="w-auswertungen-laden" role="heading" aria-level={2}>
            Auswertungen
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="h-[19rem] w-full" />
          <p className="sr-only" role="status">
            Auswertungen werden geladen …
          </p>
        </CardContent>
      </Card>
    </section>
  );
}
