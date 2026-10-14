import { CardGridSkeleton } from "@/components/shared/page-skeletons";

/** Ladezustand der Abteilungen: Kopf mit „Neue Abteilung“ und das Raster der Abteilungskarten. */
export default function DepartmentsLoading() {
  return <CardGridSkeleton cards={6} actions={1} label="Abteilungen werden geladen …" />;
}
