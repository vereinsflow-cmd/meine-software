import { DetailPageSkeleton } from "@/components/shared/page-skeletons";

/** Ladezustand eines Mitglieds: Zurück-Link, Name mit „Bearbeiten“ und „Archivieren“, links Stammdaten, rechts Seitenkarten. */
export default function MemberLoading() {
  return <DetailPageSkeleton actions={2} label="Mitglied wird geladen …" />;
}
