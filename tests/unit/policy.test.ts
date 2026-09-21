import { describe, expect, it } from "vitest";
import type { PermissionScope } from "@/generated/prisma/enums";
import type { PermissionKey } from "@/server/permissions/catalog";
import {
  assertCan,
  can,
  scopeFilter,
  type PermissionHolder,
  type ScopeBuilders,
} from "@/server/permissions/policy";

function holder(
  grants: Partial<Record<PermissionKey, PermissionScope>>,
  overrides: Partial<PermissionHolder> = {},
): PermissionHolder {
  return {
    userId: "user-1",
    memberId: "member-1",
    ledDepartmentIds: [],
    permissions: new Map(Object.entries(grants)) as PermissionHolder["permissions"],
    ...overrides,
  };
}

describe("can()", () => {
  it("verweigert alles, was die Rolle nicht enthält", () => {
    expect(can(holder({}), "members:read")).toBe(false);
    expect(can(holder({}), "members:read", { ownerMemberId: "member-1" })).toBe(false);
  });

  it("CLUB: gilt für jeden Datensatz", () => {
    const h = holder({ "members:update": "CLUB" });
    expect(can(h, "members:update")).toBe(true);
    expect(can(h, "members:update", { departmentIds: ["irgendeine"] })).toBe(true);
    expect(can(h, "members:update", {})).toBe(true);
  });

  it("DEPARTMENT: nur für Datensätze der geleiteten Abteilungen", () => {
    const h = holder({ "events:update": "DEPARTMENT" }, { ledDepartmentIds: ["fussball"] });
    expect(can(h, "events:update")).toBe(true); // grundsätzlich vorhanden (z. B. für Menüs)
    expect(can(h, "events:update", { departmentIds: ["fussball", "handball"] })).toBe(true);
    expect(can(h, "events:update", { departmentIds: ["handball"] })).toBe(false);
  });

  it("DEPARTMENT: Datensätze ohne Abteilung sind nicht erlaubt (sicherer Standard)", () => {
    const h = holder({ "events:update": "DEPARTMENT" }, { ledDepartmentIds: ["fussball"] });
    expect(can(h, "events:update", { departmentIds: [] })).toBe(false);
    expect(can(h, "events:update", { departmentIds: null })).toBe(false);
    expect(can(h, "events:update", {})).toBe(false);
  });

  it("DEPARTMENT ohne geleitete Abteilung erlaubt nichts", () => {
    const h = holder({ "events:update": "DEPARTMENT" }, { ledDepartmentIds: [] });
    expect(can(h, "events:update", { departmentIds: ["fussball"] })).toBe(false);
  });

  it("OWN: nur eigene Datensätze (über Mitglied oder Benutzer)", () => {
    const h = holder({ "tasks:update": "OWN" });
    expect(can(h, "tasks:update", { ownerMemberId: "member-1" })).toBe(true);
    expect(can(h, "tasks:update", { ownerUserId: "user-1" })).toBe(true);
    expect(can(h, "tasks:update", { ownerMemberId: "member-2" })).toBe(false);
    expect(can(h, "tasks:update", { ownerMemberId: null, ownerUserId: null })).toBe(false);
  });

  it("OWN ohne Mitgliedsdatensatz erlaubt keine Treffer über null", () => {
    const h = holder({ "tasks:update": "OWN" }, { memberId: null });
    expect(can(h, "tasks:update", { ownerMemberId: null })).toBe(false);
  });
});

describe("assertCan()", () => {
  it("wirft FORBIDDEN (403)", () => {
    expect(() => assertCan(holder({}), "club:update")).toThrowError(
      expect.objectContaining({ code: "FORBIDDEN", status: 403 }),
    );
  });

  it("wirft nicht, wenn erlaubt", () => {
    expect(() => assertCan(holder({ "club:update": "CLUB" }), "club:update")).not.toThrow();
  });
});

describe("scopeFilter()", () => {
  // In der Praxis liefern beide Builder denselben Prisma-`where`-Typ; hier vereinfacht als Objekt.
  const builders: ScopeBuilders<Record<string, unknown>> = {
    department: (ids) => ({ departmentId: { in: [...ids] } }),
    own: (h) => ({ memberId: h.memberId }),
  };

  it("liefert für CLUB keinen zusätzlichen Filter", () => {
    expect(
      scopeFilter(holder({ "members:read": "CLUB" }), "members:read", builders),
    ).toBeUndefined();
  });

  it("liefert für DEPARTMENT den Abteilungsfilter (auch leer → nichts passt)", () => {
    const h = holder({ "members:read": "DEPARTMENT" }, { ledDepartmentIds: ["a", "b"] });
    expect(scopeFilter(h, "members:read", builders)).toEqual({ departmentId: { in: ["a", "b"] } });

    const none = holder({ "members:read": "DEPARTMENT" }, { ledDepartmentIds: [] });
    expect(scopeFilter(none, "members:read", builders)).toEqual({ departmentId: { in: [] } });
  });

  it("liefert für OWN den Eigen-Filter", () => {
    expect(scopeFilter(holder({ "members:read": "OWN" }), "members:read", builders)).toEqual({
      memberId: "member-1",
    });
  });

  it("wirft FORBIDDEN ohne Berechtigung", () => {
    expect(() => scopeFilter(holder({}), "members:read", builders)).toThrowError(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });
});
