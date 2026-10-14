import { TablePageSkeleton } from "@/components/shared/page-skeletons";

/** Ladezustand der Dokumente: Kopf, Suche mit Filtern und die Tabelle (Name, Kategorie, Zugriff, Größe, Datum). */
export default function Loading() {
  return <TablePageSkeleton columns={6} label="Dokumente werden geladen …" />;
}
