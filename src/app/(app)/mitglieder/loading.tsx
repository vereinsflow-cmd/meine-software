import { MemberListPageSkeleton } from "@/modules/members/components/member-list-skeleton";

/**
 * Ladezustand der Mitgliederliste: Kopf mit den Knöpfen, links die Liste (Suche, „Filter“, Sortierung, Zeilen), rechts das
 * Detail – wie die fertige Seite. Die Unterseiten (Mitglied, Formulare, Import, Statistik, Anträge, Ehrungen) haben eigene
 * Gerüste; sonst erschiene beim Öffnen auch dort diese Liste.
 */
export default function MembersLoading() {
  return <MemberListPageSkeleton label="Mitglieder werden geladen …" />;
}
