import { EventListSkeleton } from "@/modules/events/components/event-skeletons";

/** Ladezustand der Veranstaltungsliste: Kopf, Suche und Filter, darunter Karten wie die Einträge der Liste. */
export default function VeranstaltungenLoading() {
  return <EventListSkeleton />;
}
