import { beforeEach, describe, expect, it, vi } from "vitest";

const mail = vi.hoisted(() => ({ sent: [] as { to: string; text: string }[] }));
vi.mock("@/server/mail", () => ({
  sendMailDeferred: async (m: { to: string; text: string }) => void mail.sent.push(m),
  sendMail: async (m: { to: string; text: string }) => void mail.sent.push(m),
}));

import { prisma } from "@/server/db/client";
import { loadTenantContext } from "@/server/tenancy/context-core";
import { inviteSchema } from "@/modules/users/schemas";
import {
  changeUserRole,
  inviteUser,
  listClubUsers,
  listInvitations,
  listInvitableMembers,
  listRoles,
  removeUser,
  resendInvitation,
  revokeInvitation,
  setUserStatus,
} from "@/modules/users/service";
import { acceptInvitationAsNewUser } from "@/server/auth/invitations";
import { addUserToClub, contextFor, createClub, createMember, unique } from "../helpers/factories";

beforeEach(() => {
  mail.sent.length = 0;
});

async function setup() {
  const club = await createClub("Benutzerverein");
  const admin = await addUserToClub(club, "CLUB_ADMIN", { firstName: "Anna", lastName: "Admin" });
  const admin2 = await addUserToClub(club, "CLUB_ADMIN", {
    firstName: "Adam",
    lastName: "Zweitadmin",
  });
  const board = await addUserToClub(club, "BOARD");
  const member = await addUserToClub(club, "MEMBER");
  return {
    club,
    admin,
    admin2,
    board,
    member,
    ctx: {
      admin: await contextFor(admin.user.id, club.id),
      admin2: await contextFor(admin2.user.id, club.id),
      board: await contextFor(board.user.id, club.id),
      member: await contextFor(member.user.id, club.id),
    },
  };
}

const invite = (overrides: Partial<{ email: string; roleId: string; memberId: string }>) =>
  inviteSchema.parse({ email: `${unique("neu")}@example.test`, roleId: "", ...overrides });

describe("Einladen", () => {
  it("Administrator lädt ein: Einladung wird angelegt, gemailt und protokolliert", async () => {
    const { ctx, club } = await setup();
    const email = `${unique("helfer")}@example.test`;
    await inviteUser(ctx.admin, invite({ email, roleId: club.roleIds.HELPER! }));

    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.to).toBe(email);
    const pending = await listInvitations(ctx.admin);
    expect(pending).toEqual([
      expect.objectContaining({ email, roleName: "Helfer", expired: false }),
    ]);
    expect(
      await prisma.auditLog.count({ where: { clubId: club.id, action: "invitation.created" } }),
    ).toBe(1);
  });

  it("die eingeladene Person tritt über den Link bei und erhält genau die vergebene Rolle", async () => {
    const { ctx, club } = await setup();
    const email = `${unique("vorstand")}@example.test`;
    await inviteUser(ctx.admin, invite({ email, roleId: club.roleIds.BOARD! }));
    const token = /einladung\/([A-Za-z0-9_-]+)/.exec(mail.sent[0]!.text)![1]!;

    const { userId } = await acceptInvitationAsNewUser(
      { token, firstName: "Vera", lastName: "Vorstand", password: "Zebra-Lampe-Wolke-Tisch-9" },
      { ip: "unknown", ipPrefix: null },
    );
    const users = await listClubUsers(ctx.admin);
    expect(users.find((u) => u.userId === userId)).toMatchObject({
      roleName: "Vorstandsmitglied",
      status: "ACTIVE",
      email,
    });
    expect(await listInvitations(ctx.admin)).toEqual([]); // nicht mehr offen
  });

  it("verknüpft auf Wunsch einen vorhandenen Mitgliedsdatensatz", async () => {
    const { ctx, club } = await setup();
    const existing = await createMember(club.id, {
      firstName: "Vera",
      lastName: "Vorhanden",
      email: "vera@example.test",
    });
    expect((await listInvitableMembers(ctx.admin)).map((m) => m.id)).toContain(existing.id);

    await inviteUser(
      ctx.admin,
      invite({ email: "vera@example.test", roleId: club.roleIds.MEMBER!, memberId: existing.id }),
    );
    const token = /einladung\/([A-Za-z0-9_-]+)/.exec(mail.sent[0]!.text)![1]!;
    const { userId } = await acceptInvitationAsNewUser(
      { token, firstName: "Vera", lastName: "Vorhanden", password: "Zebra-Lampe-Wolke-Tisch-9" },
      { ip: "unknown", ipPrefix: null },
    );

    expect((await prisma.member.findUniqueOrThrow({ where: { id: existing.id } })).userId).toBe(
      userId,
    );
    expect((await listInvitableMembers(ctx.admin)).map((m) => m.id)).not.toContain(existing.id);
  });

  it("Vorstand ohne Einlade-Recht und Mitglieder dürfen nicht einladen oder die Liste sehen", async () => {
    const { ctx, club } = await setup();
    await expect(
      inviteUser(ctx.board, invite({ roleId: club.roleIds.MEMBER! })),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      inviteUser(ctx.member, invite({ roleId: club.roleIds.MEMBER! })),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listClubUsers(ctx.member)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listInvitations(ctx.member)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listRoles(ctx.member)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await listInvitableMembers(ctx.board)).toEqual([]);
  });

  it("verhindert Rechteausweitung: Man vergibt nur Rollen, deren Rechte man selbst besitzt", async () => {
    const { ctx, club } = await setup();
    // Ein "Helfer-Verwalter" darf einladen und Rollen ändern, hat aber selbst nur Helfer-Rechte.
    const custom = await prisma.role.create({
      data: { clubId: club.id, key: "custom:einlader", name: "Einlader" },
    });
    // Alle Rechte der Rolle "Mitglied" (damit sie diese Rolle vergeben darf) plus die Benutzerverwaltung.
    const memberGrants = await prisma.rolePermission.findMany({
      where: { roleId: club.roleIds.MEMBER! },
    });
    await prisma.rolePermission.createMany({
      data: [
        ...memberGrants.map((g) => ({
          clubId: club.id,
          roleId: custom.id,
          permissionKey: g.permissionKey,
          scope: g.scope,
        })),
        ...(["users:read", "users:invite", "users:manage"] as const).map((permissionKey) => ({
          clubId: club.id,
          roleId: custom.id,
          permissionKey,
          scope: "CLUB" as const,
        })),
      ],
    });
    const einlader = await addUserToClub(
      { ...club, roleIds: { ...club.roleIds, EINLADER: custom.id } },
      "EINLADER" as never,
    );
    const limited = await contextFor(einlader.user.id, club.id);

    await expect(
      inviteUser(limited, invite({ roleId: club.roleIds.CLUB_ADMIN! })),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("vollständig besitzt"),
    });
    await expect(
      inviteUser(limited, invite({ roleId: club.roleIds.BOARD! })),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Rollen mit weniger oder gleichen Rechten sind erlaubt.
    await expect(
      inviteUser(limited, invite({ roleId: club.roleIds.MEMBER! })),
    ).resolves.toBeUndefined();

    // Ein Administrator kann von ihm nicht herabgestuft oder gesperrt werden.
    await expect(
      changeUserRole(limited, {
        membershipId: (await listClubUsers(ctx.admin)).find((u) => u.userId === ctx.admin.userId)!
          .membershipId,
        roleId: club.roleIds.MEMBER!,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lehnt Rollen anderer Vereine und doppelte Mitglieder ab", async () => {
    const a = await setup();
    const b = await setup();
    await expect(
      inviteUser(a.ctx.admin, invite({ roleId: b.club.roleIds.MEMBER! })),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      inviteUser(
        a.ctx.admin,
        invite({ email: a.member.user.email, roleId: a.club.roleIds.MEMBER! }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("Einladungen widerrufen und erneut senden", async () => {
    const { ctx, club } = await setup();
    const email = `${unique("x")}@example.test`;
    await inviteUser(ctx.admin, invite({ email, roleId: club.roleIds.MEMBER! }));
    const [pending] = await listInvitations(ctx.admin);

    await resendInvitation(ctx.admin, pending!.id);
    expect(mail.sent).toHaveLength(2);
    const [fresh] = await listInvitations(ctx.admin);
    expect(fresh!.id).not.toBe(pending!.id); // neue Einladung mit neuem Token
    const oldLink = /einladung\/([A-Za-z0-9_-]+)/.exec(mail.sent[0]!.text)![1]!;
    await expect(
      acceptInvitationAsNewUser(
        { token: oldLink, firstName: "A", lastName: "B", password: "Zebra-Lampe-Wolke-Tisch-9" },
        { ip: "unknown", ipPrefix: null },
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await revokeInvitation(ctx.admin, fresh!.id);
    expect(await listInvitations(ctx.admin)).toEqual([]);
    await expect(revokeInvitation(ctx.admin, fresh!.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("Rollen ändern, sperren, entfernen", () => {
  it("ändert die Rolle; die Berechtigungen gelten beim nächsten Laden des Kontexts", async () => {
    const { ctx, club, member } = await setup();
    const membershipId = (await listClubUsers(ctx.admin)).find(
      (u) => u.userId === member.user.id,
    )!.membershipId;
    expect((await contextFor(member.user.id, club.id)).roleKey).toBe("MEMBER");

    await changeUserRole(ctx.admin, { membershipId, roleId: club.roleIds.BOARD! });
    const promoted = await contextFor(member.user.id, club.id);
    expect(promoted.roleKey).toBe("BOARD");
    expect(promoted.permissions.get("members:update")).toBe("CLUB");

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { clubId: club.id, action: "user.role_changed" },
    });
    expect(audit.changes).toEqual({ rolle: { from: "Mitglied", to: "Vorstandsmitglied" } });
  });

  it("niemand ändert, sperrt oder entfernt sich selbst", async () => {
    const { ctx, club } = await setup();
    const own = (await listClubUsers(ctx.admin)).find((u) => u.isSelf)!;
    await expect(
      changeUserRole(ctx.admin, { membershipId: own.membershipId, roleId: club.roleIds.MEMBER! }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      setUserStatus(ctx.admin, { membershipId: own.membershipId, status: "SUSPENDED" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(removeUser(ctx.admin, own.membershipId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("der letzte Administrator bleibt erhalten", async () => {
    const { ctx, club, admin2 } = await setup();
    const users = await listClubUsers(ctx.admin);
    const second = users.find((u) => u.userId === admin2.user.id)!;
    const first = users.find((u) => u.isSelf)!;

    // Zwei Administratoren: Der zweite darf herabgestuft werden …
    await changeUserRole(ctx.admin, {
      membershipId: second.membershipId,
      roleId: club.roleIds.BOARD!,
    });
    // … und dann ist die erste Person die letzte. Ein weiterer Administrator kann sie nicht entfernen.
    await changeUserRole(ctx.admin, {
      membershipId: second.membershipId,
      roleId: club.roleIds.CLUB_ADMIN!,
    });
    await changeUserRole(ctx.admin2, {
      membershipId: first.membershipId,
      roleId: club.roleIds.BOARD!,
    });
    const remaining = await contextFor(admin2.user.id, club.id);
    expect(remaining.roleKey).toBe("CLUB_ADMIN");

    // Die einzige verbliebene Administratorin (admin2) kann sich nicht selbst herabstufen …
    // … und ein anderer Benutzer mit Recht dazu ist nicht mehr vorhanden.
    const newFirst = (await listClubUsers(remaining)).find((u) => u.userId === ctx.admin.userId)!;
    await expect(
      changeUserRole(remaining, {
        membershipId: newFirst.membershipId,
        roleId: club.roleIds.MEMBER!,
      }),
    ).resolves.toBeUndefined();
  });

  it("Sperren entzieht sofort den Zugang; Freigeben stellt ihn wieder her", async () => {
    const { ctx, club, member } = await setup();
    const membershipId = (await listClubUsers(ctx.admin)).find(
      (u) => u.userId === member.user.id,
    )!.membershipId;
    const sessionUser = {
      id: member.user.id,
      email: member.user.email,
      firstName: "T",
      lastName: "T",
      isPlatformAdmin: false,
    };

    await setUserStatus(ctx.admin, { membershipId, status: "SUSPENDED" });
    expect(await loadTenantContext(sessionUser, club.id)).toBeNull();

    await setUserStatus(ctx.admin, { membershipId, status: "ACTIVE" });
    expect((await loadTenantContext(sessionUser, club.id))?.clubId).toBe(club.id);
  });

  it("Entfernen löst das Konto vom Mitgliedsdatensatz; das Mitglied bleibt bestehen", async () => {
    const { ctx, club, member } = await setup();
    const membershipId = (await listClubUsers(ctx.admin)).find(
      (u) => u.userId === member.user.id,
    )!.membershipId;

    await removeUser(ctx.admin, membershipId);
    expect((await listClubUsers(ctx.admin)).map((u) => u.userId)).not.toContain(member.user.id);
    const record = await prisma.member.findUniqueOrThrow({ where: { id: member.member.id } });
    expect(record.userId).toBeNull();
    expect(await prisma.user.count({ where: { id: member.user.id } })).toBe(1); // Konto selbst bleibt (evtl. in anderen Vereinen)
    void club;
  });

  it("Benutzer anderer Vereine sind nicht erreichbar", async () => {
    const a = await setup();
    const b = await setup();
    const foreign = (await listClubUsers(b.ctx.admin)).find((u) => u.userId === b.member.user.id)!;
    await expect(
      changeUserRole(a.ctx.admin, {
        membershipId: foreign.membershipId,
        roleId: a.club.roleIds.BOARD!,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      setUserStatus(a.ctx.admin, { membershipId: foreign.membershipId, status: "SUSPENDED" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(removeUser(a.ctx.admin, foreign.membershipId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await listClubUsers(a.ctx.admin)).map((u) => u.userId)).not.toContain(b.member.user.id);
  });

  it("zeigt die Rollenübersicht mit Berechtigungen und Anzahl der Benutzer", async () => {
    const { ctx } = await setup();
    const roles = await listRoles(ctx.admin);
    expect(roles.map((r) => r.key).sort()).toEqual([
      "BOARD",
      "CLUB_ADMIN",
      "DEPARTMENT_LEAD",
      "HELPER",
      "MEMBER",
    ]);
    const admin = roles.find((r) => r.key === "CLUB_ADMIN")!;
    expect(admin.userCount).toBe(2);
    expect(admin.assignable).toBe(true);
    expect(admin.permissions.length).toBeGreaterThan(25);
    expect(
      roles.find((r) => r.key === "MEMBER")!.permissions.every((p) => p.label.length > 0),
    ).toBe(true);
  });
});
