import { describe, expect, it } from "vitest";
import type { EventStatus, PermissionScope } from "@/generated/prisma/enums";
import { canCreateShiftFor, mayCreateShifts } from "@/modules/shifts/new-shift-rule";
import type { PermissionKey } from "@/server/permissions/catalog";
import type { PermissionHolder } from "@/server/permissions/policy";

function holder(
  grants: Partial<Record<PermissionKey, PermissionScope>>,
  ledDepartmentIds: string[] = [],
): PermissionHolder {
  return {
    userId: "user-1",
    memberId: "member-1",
    ledDepartmentIds,
    permissions: new Map(Object.entries(grants)) as PermissionHolder["permissions"],
  };
}

const event = (status: EventStatus, departmentId: string | null = null) => ({
  status,
  departmentId,
});

describe("Neue Schicht: wer darf wo anlegen", () => {
  it("vereinsweit: für jede Veranstaltung, die nicht abgesagt oder archiviert ist – Entwürfe und abgeschlossene gehen", () => {
    const board = holder({ "shifts:manage": "CLUB" });
    expect(mayCreateShifts(board)).toBe(true);
    for (const status of ["DRAFT", "PUBLISHED", "COMPLETED"] as const) {
      expect(canCreateShiftFor(board, event(status)), status).toBe(true);
      expect(canCreateShiftFor(board, event(status, "handball")), status).toBe(true);
    }
    for (const status of ["CANCELLED", "ARCHIVED"] as const) {
      expect(canCreateShiftFor(board, event(status)), status).toBe(false);
    }
  });

  it("Abteilungsleitung: nur Veranstaltungen der geleiteten Abteilung – ohne Abteilung gar keine", () => {
    const lead = holder({ "shifts:manage": "DEPARTMENT" }, ["fussball"]);
    expect(mayCreateShifts(lead)).toBe(true);
    expect(canCreateShiftFor(lead, event("PUBLISHED", "fussball"))).toBe(true);
    expect(canCreateShiftFor(lead, event("DRAFT", "fussball"))).toBe(true);
    expect(canCreateShiftFor(lead, event("CANCELLED", "fussball"))).toBe(false);
    expect(canCreateShiftFor(lead, event("PUBLISHED", "handball"))).toBe(false);
    expect(canCreateShiftFor(lead, event("PUBLISHED"))).toBe(false); // vereinsweite Veranstaltung

    const withoutDepartment = holder({ "shifts:manage": "DEPARTMENT" });
    expect(mayCreateShifts(withoutDepartment)).toBe(false);
    expect(canCreateShiftFor(withoutDepartment, event("PUBLISHED", "fussball"))).toBe(false);
  });

  it("ohne „Schichten verwalten“ (Helfer, Mitglied) oder nur „eigene“: nirgends", () => {
    const helper = holder({ "shifts:read": "CLUB", "shifts:signup": "CLUB" });
    expect(mayCreateShifts(helper)).toBe(false);
    expect(canCreateShiftFor(helper, event("PUBLISHED"))).toBe(false);

    const own = holder({ "shifts:manage": "OWN" }, ["fussball"]);
    expect(mayCreateShifts(own)).toBe(false);
    expect(canCreateShiftFor(own, event("PUBLISHED", "fussball"))).toBe(false);
  });
});
