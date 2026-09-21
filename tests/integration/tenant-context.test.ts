import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import { can } from "@/server/permissions/policy";
import { loadTenantContext } from "@/server/tenancy/context-core";
import {
  addUserToClub,
  contextFor,
  createClub,
  createDepartment,
  createUser,
} from "../helpers/factories";

const toSessionUser = (user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isPlatformAdmin: boolean;
}) => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  isPlatformAdmin: user.isPlatformAdmin,
});

describe("Mandantenkontext", () => {
  it("lädt Rolle, Berechtigungen und geleitete Abteilungen des Benutzers", async () => {
    const club = await createClub();
    const department = await createDepartment(club.id, "Handball");
    const lead = await addUserToClub(club, "DEPARTMENT_LEAD", {
      ledDepartmentIds: [department.id],
    });

    const ctx = await contextFor(lead.user.id, club.id);
    expect(ctx.clubId).toBe(club.id);
    expect(ctx.roleKey).toBe("DEPARTMENT_LEAD");
    expect(ctx.ledDepartmentIds).toEqual([department.id]);
    expect(ctx.memberId).toBe(lead.member.id);
    expect(ctx.permissions.get("members:update")).toBe("DEPARTMENT");
    expect(ctx.permissions.get("club:update")).toBeUndefined();
  });

  it("Administrator hat alle Berechtigungen im ganzen Verein", async () => {
    const club = await createClub();
    const admin = await addUserToClub(club, "CLUB_ADMIN");
    const ctx = await contextFor(admin.user.id, club.id);

    expect(can(ctx, "club:update")).toBe(true);
    expect(can(ctx, "members:delete")).toBe(true);
    expect(ctx.permissions.get("members:delete")).toBe("CLUB");
  });

  it("einfaches Mitglied darf keine fremden Daten verwalten", async () => {
    const club = await createClub();
    const member = await addUserToClub(club, "MEMBER");
    const ctx = await contextFor(member.user.id, club.id);

    expect(can(ctx, "members:update")).toBe(false);
    expect(can(ctx, "events:create")).toBe(false);
    expect(can(ctx, "members:read", { ownerMemberId: member.member.id })).toBe(true);
    expect(can(ctx, "members:read", { ownerMemberId: "jemand-anderes" })).toBe(false);
  });

  it("liefert keinen Kontext für Benutzer ohne Mitgliedschaft", async () => {
    const user = await createUser();
    expect(await loadTenantContext(toSessionUser(user), null)).toBeNull();
  });

  it("verweigert den Zugriff bei gesperrter Mitgliedschaft", async () => {
    const club = await createClub();
    const { user, membershipId } = await addUserToClub(club, "MEMBER");
    await prisma.clubMembership.update({
      where: { id: membershipId },
      data: { status: "SUSPENDED" },
    });

    expect(await loadTenantContext(toSessionUser(user), club.id)).toBeNull();
  });

  it("verweigert den Zugriff bei deaktiviertem Verein", async () => {
    const club = await createClub();
    const { user } = await addUserToClub(club, "CLUB_ADMIN");
    await prisma.club.update({
      where: { id: club.id },
      data: { status: "DEACTIVATED", deactivatedAt: new Date() },
    });

    expect(await loadTenantContext(toSessionUser(user), club.id)).toBeNull();
  });

  it("die gewünschte Vereins-ID wird geprüft: Fremde Vereine sind nicht wählbar", async () => {
    const clubA = await createClub("A");
    const clubB = await createClub("B");
    const { user } = await addUserToClub(clubA, "MEMBER");

    // Der Benutzer gehört nur zu A – ein manipulierter Wunsch nach B fällt auf A zurück.
    const loaded = await loadTenantContext(toSessionUser(user), clubB.id);
    expect(loaded?.clubId).toBe(clubA.id);
  });

  it("wechselt auf einen anderen Verein, wenn der bevorzugte nicht mehr verfügbar ist", async () => {
    const clubA = await createClub("A");
    const clubB = await createClub("B");
    const user = await createUser();
    await addUserToClub(clubA, "MEMBER", { user });
    const inB = await addUserToClub(clubB, "MEMBER", { user });
    await prisma.clubMembership.update({
      where: { id: inB.membershipId },
      data: { status: "SUSPENDED" },
    });

    const loaded = await loadTenantContext(toSessionUser(user), clubB.id);
    expect(loaded?.clubId).toBe(clubA.id);
  });

  it("der Datenbank-Client im Kontext ist an den Verein gebunden", async () => {
    const clubA = await createClub("A");
    const clubB = await createClub("B");
    const admin = await addUserToClub(clubA, "CLUB_ADMIN");
    await addUserToClub(clubB, "CLUB_ADMIN");
    const ctx = await contextFor(admin.user.id, clubA.id);

    const members = await ctx.db.member.findMany();
    expect(members.every((m) => m.clubId === clubA.id)).toBe(true);
    expect(members).toHaveLength(1);
  });
});
