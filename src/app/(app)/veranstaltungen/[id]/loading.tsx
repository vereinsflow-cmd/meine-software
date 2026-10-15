import { DetailPageSkeleton } from "@/components/shared/page-skeletons";

/**
 * Ladezustand einer Veranstaltung: Zurück-Link, Kopf mit „Bearbeiten“ und „Weitere Aktionen“, links Details und weitere
 * Karten, rechts Teilnahme, Teilnehmerzahl und Helfer.
 */
export default function VeranstaltungLoading() {
  return <DetailPageSkeleton actions={2} label="Veranstaltung wird geladen …" />;
}
