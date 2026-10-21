import { DocumentListPageSkeleton } from "@/modules/documents/components/document-list-skeleton";

/** Ladezustand der Dokumente: Kopf, darunter die Karte mit Suche, Filterknöpfen, Zeilen und Speicherplatz – wie die fertige Seite. */
export default function Loading() {
  return <DocumentListPageSkeleton label="Dokumente werden geladen …" />;
}
