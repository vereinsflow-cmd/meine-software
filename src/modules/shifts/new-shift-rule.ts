import type { EventStatus } from "@/generated/prisma/enums";
import { can, scopeOf, type PermissionHolder } from "@/server/permissions/policy";

/**
 * Wer darf wo neue Schichten anlegen? Reine Funktionen ohne Datenbankzugriff – EINE Regel für `createShift`, den Knopf
 * „Neue Schicht“ im Helferplan einer Veranstaltung und die Auswahl „Für welche Veranstaltung?“ auf der Übersicht.
 */

/** Für abgesagte und archivierte Veranstaltungen gibt es keine neuen Schichten (Entwürfe und abgeschlossene gehen). */
export const NO_NEW_SHIFTS: readonly EventStatus[] = ["CANCELLED", "ARCHIVED"];

/**
 * Darf der Benutzer für diese Veranstaltung eine Schicht anlegen? „Schichten verwalten“ in seinem Geltungsbereich (z. B.
 * Abteilungsleitung nur für Veranstaltungen ihrer Abteilung) und die Veranstaltung ist weder abgesagt noch archiviert.
 * Sehen muss er sie außerdem (`loadVisibleEvent` bzw. `eventVisibilityWhere`) – das prüft der Aufrufer beim Laden.
 */
export function canCreateShiftFor(
  holder: PermissionHolder,
  event: { status: EventStatus; departmentId: string | null },
): boolean {
  return (
    can(holder, "shifts:manage", {
      departmentIds: event.departmentId ? [event.departmentId] : [],
    }) && !NO_NEW_SHIFTS.includes(event.status)
  );
}

/**
 * Kann der Benutzer überhaupt irgendwo Schichten anlegen – unabhängig davon, ob gerade eine passende Veranstaltung
 * ansteht? Vereinsweit ja; mit Abteilungs-Reichweite nur, wenn er mindestens eine Abteilung leitet; „nur eigene“ passt
 * auf keine Veranstaltung (sie gehören niemandem). Davon hängt der Knopf „Neue Schicht“ auf der Übersicht ab.
 */
export function mayCreateShifts(holder: PermissionHolder): boolean {
  const scope = scopeOf(holder, "shifts:manage");
  return scope === "CLUB" || (scope === "DEPARTMENT" && holder.ledDepartmentIds.length > 0);
}
