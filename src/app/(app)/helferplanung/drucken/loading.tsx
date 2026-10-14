import { PrintPlanSkeleton } from "@/modules/shifts/components/shift-skeletons";

/**
 * Ladezustand von „Helferplan drucken“ (eigenes Gerüst, sonst erschiene das der Übersicht): mittige Spalte mit Zurück-Link,
 * Kopf, Kasten zum Eingrenzen und Vorschau.
 */
export default function HelferplanDruckenLoading() {
  return <PrintPlanSkeleton />;
}
