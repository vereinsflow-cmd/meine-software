import { EventFormSkeleton } from "@/modules/events/components/event-skeletons";

/** Ladezustand von „Neue Veranstaltung“: das Formular statt des Gerüsts der Liste darüber. */
export default function NeueVeranstaltungLoading() {
  return <EventFormSkeleton label="Formular wird geladen …" />;
}
