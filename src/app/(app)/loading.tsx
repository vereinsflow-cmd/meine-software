import { ListPageSkeleton } from "@/components/shared/page-skeletons";

/**
 * Ladezustand für alle Seiten ohne eigenes Gerüst: Kopf und eine Karte mit Zeilen statt leerer Seite, solange Daten geladen
 * werden (Live-Region „Wird geladen …“). Bereiche mit eigenem Aufbau nehmen das passende Gerüst aus
 * `components/shared/page-skeletons.tsx` in ihrer eigenen `loading.tsx`.
 */
export default function AppLoading() {
  return <ListPageSkeleton />;
}
