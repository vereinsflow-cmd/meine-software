import { TablePageSkeleton } from "@/components/shared/page-skeletons";

/**
 * Ladezustand der Mitgliederliste: Kopf mit den Knöpfen (Neues Mitglied, Anträge, Import, Export, Statistik), Filterleiste
 * und Tabelle – wie die fertige Seite. Die Unterseiten (Mitglied, Formulare, Import, Statistik, Anträge) haben eigene
 * Gerüste; sonst erschiene beim Öffnen auch dort diese Tabelle.
 */
export default function MembersLoading() {
  return <TablePageSkeleton columns={5} actions={5} label="Mitglieder werden geladen …" />;
}
