import { beforeEach, describe, expect, it, vi } from "vitest";

// E-Mails werden abgefangen statt versendet; so lassen sich Links (Tokens) aus dem Text lesen.
const mail = vi.hoisted(() => ({ sent: [] as { to: string; subject: string; text: string }[] }));
vi.mock("@/server/mail", () => ({
  sendMailDeferred: async (message: { to: string; subject: string; text: string }) => {
    mail.sent.push(message);
  },
  sendMail: async (message: { to: string; subject: string; text: string }) => {
    mail.sent.push(message);
  },
}));

import { prisma } from "@/server/db/client";
import { hashPassword } from "@/server/auth/password";
import { createSessionRecord } from "@/server/auth/session-core";
import {
  authenticate,
  changePassword,
  isPasswordResetTokenValid,
  requestPasswordReset,
  resetPassword,
} from "@/server/auth/service";
import {
  acceptInvitationAsExistingUser,
  acceptInvitationAsNewUser,
  getInvitationPreview,
  issueInvitation,
} from "@/server/auth/invitations";
import { hashToken } from "@/server/security/tokens";
import { addUserToClub, createClub, createMember, createUser, unique } from "../helpers/factories";

const PASSWORD = "Korrektes-Pferd-Batterie-42";

// Jeder Test verwendet eine eigene IP, damit sich die IP-Limits der Tests nicht gegenseitig auslösen.
let ipCounter = 0;
let meta = { ip: "203.0.113.1", ipPrefix: "203.0.113.0" };

beforeEach(() => {
  mail.sent.length = 0;
  ipCounter += 1;
  meta = { ip: `203.0.113.${ipCounter}`, ipPrefix: "203.0.113.0" };
});

async function userWithPassword(
  overrides: Parameters<typeof createUser>[0] = {},
  password = PASSWORD,
) {
  return createUser({ ...overrides, passwordHash: await hashPassword(password) });
}

const tokenFrom = (text: string, marker: "einladung/" | "token=") =>
  new RegExp(`${marker.replace("/", "\\/")}([A-Za-z0-9_-]+)`).exec(text)?.[1] ?? "";

describe("Anmeldung", () => {
  it("meldet mit korrekten Zugangsdaten an und wählt den ersten aktiven Verein", async () => {
    const club = await createClub();
    const user = await userWithPassword();
    await addUserToClub(club, "MEMBER", { user });

    const result = await authenticate({ email: user.email, password: PASSWORD }, meta);
    expect(result).toEqual({ userId: user.id, isPlatformAdmin: false, activeClubId: club.id });

    const audit = await prisma.auditLog.findFirst({
      where: { actorUserId: user.id, action: "auth.login" },
    });
    expect(audit?.ipPrefix).toBe("203.0.113.0");
  });

  it("ignoriert Groß-/Kleinschreibung und Leerzeichen bei der E-Mail-Adresse", async () => {
    const user = await userWithPassword();
    const result = await authenticate(
      { email: `  ${user.email.toUpperCase()} `, password: PASSWORD },
      meta,
    );
    expect(result.userId).toBe(user.id);
  });

  it("lässt Benutzer ohne Verein zu (z. B. Superadministrator)", async () => {
    const admin = await userWithPassword({ isPlatformAdmin: true });
    const result = await authenticate({ email: admin.email, password: PASSWORD }, meta);
    expect(result.activeClubId).toBeNull();
  });

  it("gibt bei falschem Passwort und unbekannter Adresse dieselbe Meldung (keine Konto-Enumeration)", async () => {
    const user = await userWithPassword();
    const wrongPassword = await authenticate(
      { email: user.email, password: "falsch-falsch-falsch" },
      meta,
    ).catch((e) => e);
    const unknownUser = await authenticate(
      { email: "gibt-es-nicht@example.test", password: PASSWORD },
      meta,
    ).catch((e) => e);

    expect(wrongPassword).toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
    expect(unknownUser).toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
    expect(wrongPassword.message).toBe(unknownUser.message);
  });

  it("verweigert gesperrte und gelöschte Konten mit derselben Meldung", async () => {
    const disabled = await userWithPassword();
    await prisma.user.update({ where: { id: disabled.id }, data: { disabledAt: new Date() } });
    const deleted = await userWithPassword();
    await prisma.user.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });

    for (const user of [disabled, deleted]) {
      await expect(
        authenticate({ email: user.email, password: PASSWORD }, meta),
      ).rejects.toMatchObject({
        message: "E-Mail-Adresse oder Passwort ist falsch.",
      });
    }
  });

  it("weist erst nach korrektem Passwort auf die fehlende E-Mail-Bestätigung hin", async () => {
    const user = await userWithPassword();
    await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: null } });

    await expect(
      authenticate({ email: user.email, password: "falsch-falsch-falsch" }, meta),
    ).rejects.toMatchObject({
      message: "E-Mail-Adresse oder Passwort ist falsch.",
    });
    await expect(
      authenticate({ email: user.email, password: PASSWORD }, meta),
    ).rejects.toMatchObject({
      message: expect.stringContaining("bestätige"),
    });
  });

  it("sperrt nach zu vielen Fehlversuchen – auch für das korrekte Passwort – und meldet die Wartezeit", async () => {
    const user = await userWithPassword();
    const attackerIp = { ip: `198.51.100.${Math.floor(Math.random() * 200)}`, ipPrefix: null };

    for (let i = 0; i < 8; i++) {
      await expect(
        authenticate({ email: user.email, password: `falsch-${i}-falsch-falsch` }, attackerIp),
      ).rejects.toMatchObject({
        code: "UNAUTHENTICATED",
      });
    }
    await expect(
      authenticate({ email: user.email, password: PASSWORD }, attackerIp),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      retryAfterSeconds: expect.any(Number),
    });
  });

  it("zählt nur Fehlversuche: Erfolgreiche Anmeldungen verbrauchen kein Kontingent und setzen den Zähler zurück", async () => {
    const user = await userWithPassword();
    const ip = { ip: "198.51.100.250", ipPrefix: null };
    for (let i = 0; i < 6; i++) {
      await authenticate({ email: user.email, password: PASSWORD }, ip);
    }
    for (let i = 0; i < 5; i++) {
      await authenticate({ email: user.email, password: "falsch-falsch-falsch" }, ip).catch(
        () => undefined,
      );
    }
    await authenticate({ email: user.email, password: PASSWORD }, ip); // Erfolg → Zähler zurückgesetzt
    for (let i = 0; i < 7; i++) {
      await authenticate({ email: user.email, password: "falsch-falsch-falsch" }, ip).catch(
        () => undefined,
      );
    }
    await expect(
      authenticate({ email: user.email, password: PASSWORD }, ip),
    ).resolves.toBeDefined();
  });

  it("die Sperre eines Kontos betrifft andere Konten nicht", async () => {
    const victim = await userWithPassword();
    const other = await userWithPassword();
    for (let i = 0; i < 8; i++) {
      await authenticate({ email: victim.email, password: "falsch-falsch-falsch" }, meta).catch(
        () => undefined,
      );
    }
    await expect(
      authenticate({ email: other.email, password: PASSWORD }, { ip: "unknown", ipPrefix: null }),
    ).resolves.toBeDefined();
  });
});

describe("Passwort zurücksetzen", () => {
  it("sendet für ein vorhandenes Konto einen Link, der nur als Hash gespeichert wird", async () => {
    const user = await userWithPassword();
    await requestPasswordReset(user.email, meta);

    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]?.to).toBe(user.email);
    const token = tokenFrom(mail.sent[0]!.text, "token=");
    expect(token.length).toBeGreaterThan(30);

    expect(await prisma.verificationToken.findUnique({ where: { tokenHash: token } })).toBeNull();
    const stored = await prisma.verificationToken.findUnique({
      where: { tokenHash: hashToken(token) },
    });
    expect(stored).toMatchObject({ userId: user.id, type: "PASSWORD_RESET", usedAt: null });
    expect(await isPasswordResetTokenValid(token)).toBe(true);
  });

  it("verrät bei unbekannten Adressen nichts: kein Fehler, keine E-Mail, kein Token", async () => {
    await expect(requestPasswordReset("niemand@example.test", meta)).resolves.toBeUndefined();
    expect(mail.sent).toHaveLength(0);
    expect(
      await prisma.verificationToken.count({ where: { user: { email: "niemand@example.test" } } }),
    ).toBe(0);
  });

  it("hält immer nur einen gültigen Link offen", async () => {
    const user = await userWithPassword();
    await requestPasswordReset(user.email, meta);
    const first = tokenFrom(mail.sent[0]!.text, "token=");
    await requestPasswordReset(user.email, meta);
    const second = tokenFrom(mail.sent[1]!.text, "token=");

    expect(await isPasswordResetTokenValid(first)).toBe(false);
    expect(await isPasswordResetTokenValid(second)).toBe(true);
  });

  it("begrenzt die Anfragen je Adresse", async () => {
    const user = await userWithPassword();
    for (let i = 0; i < 3; i++) await requestPasswordReset(user.email, meta);
    await expect(requestPasswordReset(user.email, meta)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("setzt das Passwort zurück, meldet überall ab und benachrichtigt per E-Mail", async () => {
    const user = await userWithPassword();
    await createSessionRecord({
      userId: user.id,
      activeClubId: null,
      userAgent: null,
      ipPrefix: null,
    });
    await requestPasswordReset(user.email, meta);
    const token = tokenFrom(mail.sent[0]!.text, "token=");

    await resetPassword({ token, password: "Neues-Sicheres-Passwort-77" }, meta);

    await expect(
      authenticate({ email: user.email, password: PASSWORD }, meta),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(
      authenticate({ email: user.email, password: "Neues-Sicheres-Passwort-77" }, meta),
    ).resolves.toBeDefined();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    expect(mail.sent.at(-1)?.subject).toContain("Passwort wurde geändert");
  });

  it("der Link ist nur einmal verwendbar", async () => {
    const user = await userWithPassword();
    await requestPasswordReset(user.email, meta);
    const token = tokenFrom(mail.sent[0]!.text, "token=");

    await resetPassword({ token, password: "Neues-Sicheres-Passwort-77" }, meta);
    await expect(
      resetPassword({ token, password: "Nochmal-Ein-Anderes-Passwort-88" }, meta),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("gleichzeitige Einlösung desselben Links gelingt genau einmal", async () => {
    const user = await userWithPassword();
    await requestPasswordReset(user.email, meta);
    const token = tokenFrom(mail.sent[0]!.text, "token=");

    const results = await Promise.allSettled(
      ["Erstes-Passwort-Zebra-11", "Zweites-Passwort-Lampe-22", "Drittes-Passwort-Wolke-33"].map(
        (password) => resetPassword({ token, password }, meta),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("lehnt abgelaufene, unbekannte und fremde Tokens ab", async () => {
    const user = await userWithPassword();
    await requestPasswordReset(user.email, meta);
    const token = tokenFrom(mail.sent[0]!.text, "token=");
    await prisma.verificationToken.updateMany({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(
      resetPassword({ token, password: "Neues-Sicheres-Passwort-77" }, meta),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      resetPassword({ token: "unbekannt", password: "Neues-Sicheres-Passwort-77" }, meta),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // Ein Token anderer Art (E-Mail-Bestätigung) darf kein Passwort zurücksetzen.
    const otherToken = "anderes-token-für-test";
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        type: "EMAIL_VERIFICATION",
        tokenHash: hashToken(otherToken),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await expect(
      resetPassword({ token: otherToken, password: "Neues-Sicheres-Passwort-77" }, meta),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("lehnt schwache Passwörter mit Feldfehler ab und verbraucht das Token dabei nicht", async () => {
    const user = await userWithPassword();
    await requestPasswordReset(user.email, meta);
    const token = tokenFrom(mail.sent[0]!.text, "token=");

    await expect(resetPassword({ token, password: "kurz" }, meta)).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { password: [expect.stringContaining("mindestens")] },
    });
    expect(await isPasswordResetTokenValid(token)).toBe(true);
  });

  it("changePassword prüft das aktuelle Passwort und beendet andere Sitzungen", async () => {
    const user = await userWithPassword();
    const keep = await createSessionRecord({
      userId: user.id,
      activeClubId: null,
      userAgent: null,
      ipPrefix: null,
    });
    await createSessionRecord({
      userId: user.id,
      activeClubId: null,
      userAgent: null,
      ipPrefix: null,
    });

    await expect(
      changePassword(
        {
          userId: user.id,
          currentPassword: "falsch-falsch-falsch",
          newPassword: "Neues-Sicheres-Passwort-77",
        },
        meta,
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { currentPassword: expect.any(Array) },
    });

    await changePassword(
      {
        userId: user.id,
        currentPassword: PASSWORD,
        newPassword: "Neues-Sicheres-Passwort-77",
        keepSessionId: hashToken(keep.token),
      },
      meta,
    );
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(1);
    await expect(
      authenticate({ email: user.email, password: "Neues-Sicheres-Passwort-77" }, meta),
    ).resolves.toBeDefined();
  });
});

describe("Einladungen", () => {
  async function setup() {
    const club = await createClub("Einladungsverein");
    const admin = await addUserToClub(club, "CLUB_ADMIN", { firstName: "Anna", lastName: "Admin" });
    return { club, admin };
  }

  const invite = (
    clubId: string,
    roleId: string,
    invitedByUserId: string,
    email = `${unique("neu")}@example.test`,
    memberId?: string,
  ) =>
    issueInvitation({
      clubId,
      email,
      roleId,
      memberId,
      invitedByUserId,
      inviterName: "Anna Admin",
    });

  it("legt die Einladung an und versendet einen Link (Token nur als Hash gespeichert)", async () => {
    const { club, admin } = await setup();
    const result = await invite(club.id, club.roleIds.MEMBER!, admin.user.id, "Neu@Example.Test");

    expect(result.email).toBe("neu@example.test");
    expect(result.expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
    expect(result).not.toHaveProperty("token");

    const token = tokenFrom(mail.sent[0]!.text, "einladung/");
    expect(await prisma.invitation.findUnique({ where: { tokenHash: token } })).toBeNull();
    expect(
      await prisma.invitation.findUnique({ where: { tokenHash: hashToken(token) } }),
    ).not.toBeNull();
    expect(mail.sent[0]?.text).toContain("Einladungsverein");
  });

  it("ersetzt eine noch offene Einladung an dieselbe Adresse", async () => {
    const { club, admin } = await setup();
    const email = `${unique("neu")}@example.test`;
    await invite(club.id, club.roleIds.MEMBER!, admin.user.id, email);
    const first = tokenFrom(mail.sent[0]!.text, "einladung/");
    await invite(club.id, club.roleIds.HELPER!, admin.user.id, email);
    const second = tokenFrom(mail.sent[1]!.text, "einladung/");

    expect(await getInvitationPreview(first)).toBeNull();
    expect((await getInvitationPreview(second))?.roleName).toBe("Helfer");
  });

  it("lehnt Einladungen für vorhandene Mitglieder und fremde Rollen ab", async () => {
    const { club, admin } = await setup();
    const other = await createClub("Anderer Verein");

    await expect(
      invite(club.id, club.roleIds.MEMBER!, admin.user.id, admin.user.email),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // Rolle eines anderen Vereins: für diesen Verein nicht auffindbar.
    await expect(
      invite(club.id, other.roleIds.ADMIN ?? other.roleIds.CLUB_ADMIN!, admin.user.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("zeigt Eckdaten nur für gültige Einladungen", async () => {
    const { club, admin } = await setup();
    await invite(club.id, club.roleIds.BOARD!, admin.user.id, "vorstand@example.test");
    const token = tokenFrom(mail.sent[0]!.text, "einladung/");

    expect(await getInvitationPreview(token)).toMatchObject({
      clubName: "Einladungsverein",
      roleName: "Vorstandsmitglied",
      email: "vorstand@example.test",
      hasAccount: false,
    });
    expect(await getInvitationPreview("unbekannt")).toBeNull();
    expect(await getInvitationPreview("")).toBeNull();

    await prisma.invitation.updateMany({
      where: { tokenHash: hashToken(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await getInvitationPreview(token)).toBeNull();
  });

  it("ignoriert widerrufene Einladungen und Einladungen deaktivierter Vereine", async () => {
    const { club, admin } = await setup();
    await invite(club.id, club.roleIds.MEMBER!, admin.user.id);
    const token = tokenFrom(mail.sent[0]!.text, "einladung/");

    await prisma.club.update({ where: { id: club.id }, data: { status: "DEACTIVATED" } });
    expect(await getInvitationPreview(token)).toBeNull();
    await prisma.club.update({ where: { id: club.id }, data: { status: "ACTIVE" } });
    expect(await getInvitationPreview(token)).not.toBeNull();

    await prisma.invitation.updateMany({
      where: { clubId: club.id },
      data: { revokedAt: new Date() },
    });
    expect(await getInvitationPreview(token)).toBeNull();
  });

  it("neue Person: legt Konto, Mitgliedschaft, Mitgliedsdatensatz und Einwilligung an", async () => {
    const { club, admin } = await setup();
    const email = `${unique("neu")}@example.test`;
    await invite(club.id, club.roleIds.HELPER!, admin.user.id, email);
    const token = tokenFrom(mail.sent[0]!.text, "einladung/");

    const { userId, clubId } = await acceptInvitationAsNewUser(
      { token, firstName: "Berta", lastName: "Beispiel", password: "Zebra-Lampe-Wolke-Tisch-9" },
      meta,
    );
    expect(clubId).toBe(club.id);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { memberships: { include: { role: true } } },
    });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.termsAcceptedAt).not.toBeNull();
    expect(user.memberships[0]?.role.key).toBe("HELPER");
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);

    const member = await prisma.member.findFirstOrThrow({
      where: { clubId: club.id, userId },
      include: { consents: true },
    });
    expect(member).toMatchObject({
      firstName: "Berta",
      lastName: "Beispiel",
      email,
      status: "ACTIVE",
    });
    expect(member.consents).toEqual([
      expect.objectContaining({ type: "PRIVACY_POLICY", granted: true }),
    ]);

    await expect(
      authenticate({ email, password: "Zebra-Lampe-Wolke-Tisch-9" }, meta),
    ).resolves.toMatchObject({ activeClubId: club.id });
    // Einladung ist verbraucht.
    expect(await getInvitationPreview(token)).toBeNull();
    await expect(
      acceptInvitationAsNewUser(
        { token, firstName: "X", lastName: "Y", password: "Zebra-Lampe-Wolke-Tisch-9" },
        meta,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("verknüpft einen bestehenden Mitgliedsdatensatz statt einen neuen anzulegen", async () => {
    const { club, admin } = await setup();
    const existing = await createMember(club.id, { firstName: "Carla", lastName: "Vorhanden" });
    const email = `${unique("carla")}@example.test`;
    await invite(club.id, club.roleIds.MEMBER!, admin.user.id, email, existing.id);
    const token = tokenFrom(mail.sent[0]!.text, "einladung/");

    const { userId } = await acceptInvitationAsNewUser(
      { token, firstName: "Carla", lastName: "Vorhanden", password: "Zebra-Lampe-Wolke-Tisch-9" },
      meta,
    );
    expect((await prisma.member.findUniqueOrThrow({ where: { id: existing.id } })).userId).toBe(
      userId,
    );
    expect(await prisma.member.count({ where: { clubId: club.id, userId } })).toBe(1);
  });

  it("verlangt ein sicheres Passwort und verbraucht die Einladung dabei nicht", async () => {
    const { club, admin } = await setup();
    await invite(club.id, club.roleIds.MEMBER!, admin.user.id);
    const token = tokenFrom(mail.sent[0]!.text, "einladung/");

    await expect(
      acceptInvitationAsNewUser(
        { token, firstName: "Dora", lastName: "Test", password: "passwort123" },
        meta,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { password: expect.any(Array) } });
    expect(await getInvitationPreview(token)).not.toBeNull();
  });

  it("gleichzeitiges Annehmen erzeugt genau ein Konto", async () => {
    const { club, admin } = await setup();
    const email = `${unique("race")}@example.test`;
    await invite(club.id, club.roleIds.MEMBER!, admin.user.id, email);
    const token = tokenFrom(mail.sent[0]!.text, "einladung/");

    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        acceptInvitationAsNewUser(
          { token, firstName: "Emil", lastName: "Eilig", password: "Zebra-Lampe-Wolke-Tisch-9" },
          meta,
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
  });

  it("bei bestehendem Konto: kein Konto per Link, sondern Anmeldung erforderlich (Konflikt)", async () => {
    const { club, admin } = await setup();
    const existing = await userWithPassword();
    await invite(club.id, club.roleIds.MEMBER!, admin.user.id, existing.email);
    const token = tokenFrom(mail.sent[0]!.text, "einladung/");

    expect((await getInvitationPreview(token))?.hasAccount).toBe(true);
    await expect(
      acceptInvitationAsNewUser(
        { token, firstName: "Hijack", lastName: "Versuch", password: "Zebra-Lampe-Wolke-Tisch-9" },
        meta,
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("bestehendes Konto tritt bei – aber nur mit der passenden E-Mail-Adresse", async () => {
    const { club, admin } = await setup();
    const existing = await userWithPassword();
    const stranger = await userWithPassword();
    await invite(club.id, club.roleIds.BOARD!, admin.user.id, existing.email);
    const token = tokenFrom(mail.sent[0]!.text, "einladung/");

    await expect(
      acceptInvitationAsExistingUser({ token, userId: stranger.id }, meta),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await getInvitationPreview(token)).not.toBeNull(); // nicht verbraucht

    await expect(
      acceptInvitationAsExistingUser({ token, userId: existing.id }, meta),
    ).resolves.toEqual({ clubId: club.id });
    const membership = await prisma.clubMembership.findFirstOrThrow({
      where: { clubId: club.id, userId: existing.id },
      include: { role: true },
    });
    expect(membership.role.key).toBe("BOARD");
    expect(await prisma.member.count({ where: { clubId: club.id, userId: existing.id } })).toBe(1);
  });
});
