import { describe, expect, it } from "vitest";
import { PERMISSION_KEYS, PERMISSIONS, isPermissionKey } from "@/server/permissions/catalog";
import { SYSTEM_ROLES, getSystemRole } from "@/server/permissions/defaults";

describe("Berechtigungskatalog und Standardrollen", () => {
  it("enthält eindeutige Schlüssel mit deutscher Beschriftung", () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
    for (const key of PERMISSION_KEYS) {
      expect(key).toMatch(/^[a-z_]+:[a-z_]+$/);
      expect(PERMISSIONS[key].label.length).toBeGreaterThan(3);
    }
  });

  it("alle Rollen verwenden nur bekannte Berechtigungen", () => {
    for (const role of SYSTEM_ROLES) {
      for (const key of Object.keys(role.permissions)) {
        expect(isPermissionKey(key), `${role.key} → ${key}`).toBe(true);
      }
    }
  });

  it("Vereinsadministrator hat jede Berechtigung im ganzen Verein", () => {
    const admin = getSystemRole("CLUB_ADMIN");
    expect(Object.keys(admin?.permissions ?? {}).sort()).toEqual([...PERMISSION_KEYS].sort());
    expect(Object.values(admin?.permissions ?? {}).every((scope) => scope === "CLUB")).toBe(true);
  });

  it("die Rollen sind hierarchisch abgestuft (weniger Rechte je niedriger die Rolle)", () => {
    const count = (key: string) => Object.keys(getSystemRole(key)?.permissions ?? {}).length;
    expect(count("CLUB_ADMIN")).toBeGreaterThan(count("BOARD"));
    expect(count("BOARD")).toBeGreaterThan(count("DEPARTMENT_LEAD"));
    expect(count("DEPARTMENT_LEAD")).toBeGreaterThan(count("HELPER"));
    expect(count("HELPER")).toBeGreaterThanOrEqual(count("MEMBER"));
  });

  it("Mitglieder und Helfer können nichts verwalten", () => {
    const forbiddenForBasicRoles = [
      "club:update",
      "users:manage",
      "users:invite",
      "members:create",
      "members:update",
      "members:delete",
      "members:export",
      "events:create",
      "events:update",
      "shifts:manage",
      "shifts:assign",
      "messages:send",
      "documents:upload",
      "audit:read",
    ] as const;
    for (const roleKey of ["HELPER", "MEMBER"]) {
      const grants = getSystemRole(roleKey)?.permissions ?? {};
      for (const key of forbiddenForBasicRoles) {
        expect(grants[key], `${roleKey} darf ${key} nicht besitzen`).toBeUndefined();
      }
    }
  });

  it("Mitglieder sehen Personendaten nur über OWN (also nur die eigenen)", () => {
    for (const roleKey of ["HELPER", "MEMBER"]) {
      const grants = getSystemRole(roleKey)?.permissions ?? {};
      expect(grants["members:read"]).toBe("OWN");
      expect(grants["members:read_contact"]).toBe("OWN");
      expect(grants["members:read_private"]).toBe("OWN");
    }
  });

  it("Abteilungsleiter sind auf ihre Abteilungen beschränkt und dürfen keine Benutzer verwalten", () => {
    const grants = getSystemRole("DEPARTMENT_LEAD")?.permissions ?? {};
    expect(grants["members:update"]).toBe("DEPARTMENT");
    expect(grants["shifts:manage"]).toBe("DEPARTMENT");
    expect(grants["events:update"]).toBe("DEPARTMENT");
    expect(grants["users:manage"]).toBeUndefined();
    expect(grants["members:delete"]).toBeUndefined();
    expect(grants["members:export"]).toBeUndefined();
    // Sensible Daten (Alter, Einwilligungen) nur für die eigene Abteilung – nie vereinsweit.
    expect(grants["members:read_private"]).toBe("DEPARTMENT");
  });

  it("nur der Vereinsadministrator darf Benutzer, Einstellungen, Audit-Log und Löschungen verwalten", () => {
    for (const role of SYSTEM_ROLES.filter((r) => r.key !== "CLUB_ADMIN")) {
      for (const key of [
        "users:manage",
        "users:invite",
        "club:update",
        "audit:read",
        "members:delete",
        "privacy:manage",
      ] as const) {
        expect(role.permissions[key], `${role.key} → ${key}`).toBeUndefined();
      }
    }
  });
});
