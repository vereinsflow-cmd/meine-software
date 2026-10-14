import { beforeEach, describe, expect, it, vi } from "vitest";

const mail = vi.hoisted(() => ({ sent: [] as { to: string; text: string }[] }));
vi.mock("@/server/mail", () => ({
  sendMailDeferred: async (m: { to: string; text: string }) => void mail.sent.push(m),
  sendMail: async (m: { to: string; text: string }) => void mail.sent.push(m),
}));

import { prisma } from "@/server/db/client";
import { acceptInvitationAsNewUser, getInvitationPreview } from "@/server/auth/invitations";
import { createSessionRecord, validateSessionToken } from "@/server/auth/session-core";
import {
  createClubWithAdmin,
  getPlatformStats,
  listPlatformClubs,
  setClubActive,
} from "@/server/platform/clubs";
import { loadTenantContext } from "@/server/tenancy/context-core";
import { createClubSchema } from "@/modules/platform/schemas";
import {
  addUserToClub,
  createClub,
  createEvent,
  createMember,
  createUser,
  unique,
} from "../helpers/factories";

beforeEach(() => {
  mail.sent.length = 0;
});

const asSession = (u: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isPlatformAdmin: boolean;
}) => ({
  id: u.id,
  email: u.email,
  firstName: u.firstName,
  lastName: u.lastName,
  isPlatformAdmin: u.isPlatformAdmin,
});

describe("Systemadministration", () => {
  it("nur Superadministratoren – auch Vereinsadministratoren haben keinen Zugriff", async () => {
    const club = await createClub();
    const clubAdmin = await addUserToClub(club, "CLUB_ADMIN");
    const actor = asSession(clubAdmin.user);

    await expect(listPlatformClubs(actor)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getPlatformStats(actor)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      createClubWithAdmin(actor, { name: "X", slug: unique("x"), adminEmail: "a@b.test" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(setClubActive(actor, club.id, false)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await prisma.club.findUniqueOrThrow({ where: { id: club.id } })).status).toBe("ACTIVE");
  });

  it("prüft die Berechtigung frisch aus der Datenbank – entzogene Rechte gelten sofort", async () => {
    const admin = await createUser({ isPlatformAdmin: true });
    const staleSession = asSession(admin); // Sitzungsobjekt sagt noch "Superadmin"
    await expect(getPlatformStats(staleSession)).resolves.toBeDefined();

    await prisma.user.update({ where: { id: admin.id }, data: { isPlatformAdmin: false } });
    await expect(getPlatformStats(staleSession)).rejects.toMatchObject({ code: "FORBIDDEN" });

    await prisma.user.update({
      where: { id: admin.id },
      data: { isPlatformAdmin: true, disabledAt: new Date() },
    });
    await expect(getPlatformStats(staleSession)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("legt einen Verein mit Systemrollen an und lädt den ersten Administrator ein", async () => {
    const superadmin = asSession(await createUser({ isPlatformAdmin: true }));
    const slug = unique("neuer-verein");
    const adminEmail = `${unique("chef")}@example.test`;

    const { clubId } = await createClubWithAdmin(
      superadmin,
      createClubSchema.parse({ name: "Neuer Verein e.V.", slug, adminEmail }),
    );

    const roles = await prisma.role.findMany({ where: { clubId } });
    expect(roles.map((r) => r.key).sort()).toEqual([
      "BOARD",
      "CLUB_ADMIN",
      "DEPARTMENT_LEAD",
      "HELPER",
      "MEMBER",
    ]);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.to).toBe(adminEmail);

    const rows = await listPlatformClubs(superadmin);
    expect(rows.find((r) => r.id === clubId)).toMatchObject({
      name: "Neuer Verein e.V.",
      active: true,
      memberCount: 0,
      pendingAdminInvitation: true,
    });

    // Der eingeladene Administrator legt sein Konto an und erhält die Rolle CLUB_ADMIN.
    const token = /einladung\/([A-Za-z0-9_-]+)/.exec(mail.sent[0]!.text)![1]!;
    expect((await getInvitationPreview(token))?.roleName).toBe("Vereinsadministrator");
    const { userId } = await acceptInvitationAsNewUser(
      { token, firstName: "Erna", lastName: "Erste", password: "Zebra-Lampe-Wolke-Tisch-9" },
      { ip: "unknown", ipPrefix: null },
    );
    const loaded = await loadTenantContext(
      asSession(await prisma.user.findUniqueOrThrow({ where: { id: userId } })),
      clubId,
    );
    expect(loaded?.context.roleKey).toBe("CLUB_ADMIN");
    expect(loaded?.context.permissions.get("club:update")).toBe("CLUB");
  });

  it("verweigert doppelte Kürzel und ungültige Eingaben", async () => {
    const superadmin = asSession(await createUser({ isPlatformAdmin: true }));
    const existing = await createClub();
    await expect(
      createClubWithAdmin(superadmin, {
        name: "Doppelt",
        slug: existing.slug,
        adminEmail: "x@example.test",
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { slug: [expect.stringContaining("vergeben")] },
    });

    for (const bad of [
      { slug: "Große Buchstaben" },
      { slug: "-anfang" },
      { slug: "zwei--striche" },
      { slug: "ab" },
      { adminEmail: "keine-mail" },
      { name: "" },
    ]) {
      expect(
        createClubSchema.safeParse({
          name: "Gültig",
          slug: "gueltig-1",
          adminEmail: "a@b.de",
          ...bad,
        }).success,
        JSON.stringify(bad),
      ).toBe(false);
    }
    expect(
      createClubSchema.parse({ name: "Gültig", slug: "  TSV-Ulm ", adminEmail: "a@b.de" }).slug,
    ).toBe("tsv-ulm");
  });

  it("Deaktivieren sperrt alle Mitglieder sofort; Reaktivieren stellt den Zugang wieder her", async () => {
    const superadmin = asSession(await createUser({ isPlatformAdmin: true }));
    const club = await createClub();
    const { user } = await addUserToClub(club, "MEMBER");
    const { token } = await createSessionRecord({
      userId: user.id,
      activeClubId: club.id,
      userAgent: null,
      ipPrefix: null,
    });
    expect((await loadTenantContext(asSession(user), club.id))?.clubId).toBe(club.id);

    await setClubActive(superadmin, club.id, false);
    expect(await loadTenantContext(asSession(user), club.id)).toBeNull();
    const session = await validateSessionToken(token);
    expect(session?.activeClubId).toBeNull(); // laufende Sitzung verliert den Vereinsbezug
    await expect(setClubActive(superadmin, club.id, false)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(
      await prisma.auditLog.count({
        where: { clubId: club.id, action: "platform.club_deactivated" },
      }),
    ).toBe(1);

    await setClubActive(superadmin, club.id, true);
    expect((await loadTenantContext(asSession(user), club.id))?.clubId).toBe(club.id);
    // Daten sind unverändert erhalten.
    expect(await prisma.member.count({ where: { clubId: club.id } })).toBe(1);
  });

  it("zählt Mitglieder, Benutzer und Veranstaltungen je Verein – Archiviertes, Gelöschtes und Gesperrtes nicht", async () => {
    const superadmin = asSession(await createUser({ isPlatformAdmin: true }));
    const a = await createClub("Zählverein A");
    const b = await createClub("Zählverein B");
    const empty = await createClub("Zählverein leer");

    // Verein A: zwei Benutzer (je mit Mitgliedsdatensatz) und zwei Mitglieder ohne Konto → 4 Mitglieder, 2 Benutzer.
    await addUserToClub(a, "CLUB_ADMIN");
    await addUserToClub(a, "MEMBER");
    await createMember(a.id);
    await createMember(a.id);
    // Zählen nicht: archiviertes und gelöschtes Mitglied, gesperrte Mitgliedschaft, gelöschte Veranstaltung.
    const archived = await createMember(a.id);
    await prisma.member.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });
    const trashed = await createMember(a.id);
    await prisma.member.update({ where: { id: trashed.id }, data: { deletedAt: new Date() } });
    await prisma.clubMembership.create({
      data: {
        clubId: a.id,
        userId: (await createUser()).id,
        roleId: a.roleIds.MEMBER!,
        status: "SUSPENDED",
      },
    });
    for (let i = 0; i < 3; i++) await createEvent(a.id);
    const removed = await createEvent(a.id);
    await prisma.event.update({ where: { id: removed.id }, data: { deletedAt: new Date() } });

    // Verein B: ein Benutzer und ein Mitglied ohne Konto, keine Veranstaltung.
    await addUserToClub(b, "MEMBER");
    await createMember(b.id);

    const rows = await listPlatformClubs(superadmin);
    expect(rows.find((r) => r.id === a.id)).toMatchObject({
      memberCount: 4,
      userCount: 2,
      eventCount: 3,
    });
    expect(rows.find((r) => r.id === b.id)).toMatchObject({
      memberCount: 2,
      userCount: 1,
      eventCount: 0,
    });
    expect(rows.find((r) => r.id === empty.id)).toMatchObject({
      memberCount: 0,
      userCount: 0,
      eventCount: 0,
    });
  });

  it("liefert nur Kennzahlen – keine personenbezogenen Daten von Mitgliedern", async () => {
    const superadmin = asSession(await createUser({ isPlatformAdmin: true }));
    const club = await createClub("Datenschutzverein");
    await createMember(club.id, {
      firstName: "Geheimvorname",
      lastName: "Geheimnachname",
      email: "geheim@example.test",
    });

    const output = JSON.stringify({
      rows: await listPlatformClubs(superadmin),
      stats: await getPlatformStats(superadmin),
    });
    for (const secret of ["Geheimvorname", "Geheimnachname", "geheim@example.test"]) {
      expect(output).not.toContain(secret);
    }
    const stats = await getPlatformStats(superadmin);
    expect(stats.clubs.active).toBeGreaterThan(0);
    expect(stats.members).toBeGreaterThan(0);
  });
});
