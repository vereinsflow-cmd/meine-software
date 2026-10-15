import { EventFormSkeleton } from "@/modules/events/components/event-skeletons";

/** Ladezustand von „… bearbeiten“: das Formular statt des Gerüsts der Detailseite darüber. */
export default function VeranstaltungBearbeitenLoading() {
  return <EventFormSkeleton label="Formular wird geladen …" />;
}
