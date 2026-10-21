import { CardGridSkeleton } from "@/components/shared/page-skeletons";

/** Ladezustand der Abteilungen: Kopf mit „Neue Abteilung“ und das Raster der Bildkarten (so hoch wie die fertigen). */
export default function DepartmentsLoading() {
  return <CardGridSkeleton cards={6} actions={1} cover label="Abteilungen werden geladen …" />;
}
