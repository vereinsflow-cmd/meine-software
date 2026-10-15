import { AttendanceSheetSkeleton } from "@/modules/events/components/attendance-skeletons";

/** Ladezustand der Erfassungsliste: Kopf, „Personen“ mit „Alle anwesend“ und je Person drei Auswahlknöpfe. */
export default function AnwesenheitLoading() {
  return <AttendanceSheetSkeleton />;
}
