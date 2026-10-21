/**
 * Helfer- und Schichtplanung – Geschäftslogik.
 *
 * Garantien:
 *  - Keine Überbuchung und keine Doppelbelegung: Die Datenbank erzwingt beides (Trigger, auch bei Gleichzeitigkeit).
 *    Diese Schicht prüft vorab und liefert verständliche Begründungen.
 *  - Mitglieder tragen sich selbst ein und aus; Veranstalter weisen zu (nur ihre Abteilung, falls beschränkt).
 *  - Änderungen, die Eingeteilte betreffen (Zeit, Ort, Absage), lösen Benachrichtigungen aus.
 *
 * Diese Datei ist der Einstieg für alle Aufrufer; die Logik steht nach Aufgaben getrennt daneben:
 *  - `service-event-plan.ts`   Lesen: Schichten einer Veranstaltung
 *  - `service-manage.ts`       Anlegen, Ändern, Löschen (und die Auswahl der Veranstaltung für eine neue Schicht)
 *  - `new-shift-rule.ts`       wer wo Schichten anlegen darf (reine Regel, auch für Knöpfe)
 *  - `service-assignments.ts`  Eintragen, Austragen, Zuweisen
 *  - `service-hours.ts`        Helferstunden
 *  - `service-overviews.ts`    Übersichten: Besetzung, offene Schichten, eigene Einsätze
 *  - `service-print-export.ts` Ausdruck (Helferplan über mehrere Veranstaltungen) und CSV-Export
 *  - `service-shared.ts`       gemeinsame Bausteine (Rechte-Bezug, Laden einer Schicht, eigene Einsätze)
 */
export {
  listShiftsForEvent,
  type EventShiftPlan,
  type ShiftAssignmentDto,
  type ShiftDto,
} from "./service-event-plan";
export {
  createShift,
  deleteShift,
  getShiftForEdit,
  listEventsForNewShift,
  NEW_SHIFT_EVENTS_MAX,
  updateShift,
  type NewShiftEvent,
} from "./service-manage";
export { canCreateShiftFor, mayCreateShifts } from "./new-shift-rule";
export {
  assignMember,
  listAssignableMembers,
  signOut,
  signUp,
  unassignMember,
  type AssignableMember,
} from "./service-assignments";
export {
  confirmPlannedHours,
  getHoursOverview,
  listWorkedMinutes,
  recordHours,
  type HoursRow,
} from "./service-hours";
export {
  getStaffingOverview,
  listMyAssignments,
  listOpenShifts,
  listResponsibleOptions,
  listStaffingHistory,
  listUpcomingShiftPlans,
  type MyAssignment,
  type OpenShiftItem,
  type PlanningEvent,
  type PlanningShift,
  type StaffingEvent,
} from "./service-overviews";
export {
  exportShiftPlanCsv,
  listShiftPlanForPrint,
  type PrintPlanEvent,
  type PrintPlanFilter,
  type PrintShiftDto,
} from "./service-print-export";
