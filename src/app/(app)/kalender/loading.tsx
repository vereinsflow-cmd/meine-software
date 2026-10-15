import { CalendarPageSkeleton } from "@/components/shared/page-skeletons";

/**
 * Ladezustand des Kalenders: Kopf mit „Neuer Termin“, „Abonnieren“ und „Veranstaltungen“, Leiste zum Blättern, Filter und
 * das Monatsraster (am Handy die Terminliste). Beim Blättern bleibt der alte Monat stehen, bis der neue da ist – das
 * Gerüst erscheint nur beim Öffnen des Kalenders.
 */
export default function KalenderLoading() {
  return <CalendarPageSkeleton actions={3} label="Kalender wird geladen …" />;
}
