import { AttendanceStatsSkeleton } from "@/modules/events/components/attendance-skeletons";

/** Ladezustand der Auswertung: Kopf, Filterleiste, Kennzahlen und die Tabelle (am Handy gestapelt). */
export default function AnwesenheitAuswertungLoading() {
  return <AttendanceStatsSkeleton />;
}
