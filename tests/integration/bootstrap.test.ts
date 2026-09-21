import { describe, expect, it, vi } from "vitest";

// Der Passwort-Reset versendet eine Bestätigungs-E-Mail – hier nur abfangen.
vi.mock("@/server/mail", () => ({
  sendMailDeferred: async () => undefined,
  sendMail: async () => undefined,
}));

import { authenticate, isPasswordResetTokenValid, resetPassword } from "@/server/auth/service";
import { prisma } from "@/server/db/client";
import { hashToken } from "@/server/security/tokens";
import { createPlatformAdmin, SETUP_LINK_HOURS } from "@/server/platform/bootstrap";
import { createUser, unique } from "../helpers/factories";

const PASSWORD = "Ein-Sehr-Langes-Passwort-2026";
let counter = 0;
/** Jeder Aufruf eigene IP, damit sich die Rate-Limits der Tests nicht gegenseitig auslösen. */
const meta = () => {
  counter += 1;
  return { ip: `198.51.100.${counter}`, ipPrefix: "198.51.100.0" };
};
const tokenOf = (url: string) => new URL(url).searchParams.get("token")!;
const input = (email = `${unique("admin")}@example.test`) => ({
  email,
  firstName: "Petra",
  lastName: "Plattform",
});

describe("Erster Plattform-Administrator (Einrichtung auf dem Server)", () => {
  it("legt das Konto an; über den Link wird das Passwort festgelegt, danach ist die Anmeldung möglich", async () => {
    const data = input();
    const result = await createPlatformAdmin(data);

    expect(result.created).toBe(true);
    expect(result.setPasswordUrl).toMatch(/\/passwort-zuruecksetzen\?token=[A-Za-z0-9_-]{40,}$/);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: result.userId } });
    expect(user).toMatchObject({
      email: data.email,
      firstName: "Petra",
      lastName: "Plattform",
      isPlatformAdmin: true,
      emailVerifiedAt: null,
    });

    // Vor dem Festlegen ist keine Anmeldung möglich (das Konto hat ein zufälliges, unbekanntes Passwort) …
    await expect(
      authenticate({ email: data.email, password: PASSWORD }, meta()),
    ).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
    // … danach schon; der Link bestätigt zugleich die Adresse.
    const token = tokenOf(result.setPasswordUrl);
    expect(await isPasswordResetTokenValid(token)).toBe(true);
    await resetPassword({ token, password: PASSWORD }, meta());
    expect(await isPasswordResetTokenValid(token)).toBe(false); // einmalig
    const signedIn = await authenticate({ email: data.email, password: PASSWORD }, meta());
    expect(signedIn).toMatchObject({
      userId: result.userId,
      isPlatformAdmin: true,
      activeClubId: null,
    });
  });

  it("speichert nur den Hash des Links, gültig für 24 Stunden", async () => {
    const now = new Date("2026-09-21T10:00:00.000Z");
    const result = await createPlatformAdmin(input(), now);
    const token = tokenOf(result.setPasswordUrl);

    const rows = await prisma.verificationToken.findMany({ where: { userId: result.userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: "PASSWORD_RESET",
      tokenHash: hashToken(token),
      usedAt: null,
    });
    expect(rows[0]!.tokenHash).not.toContain(token);
    expect(rows[0]!.expiresAt.getTime() - now.getTime()).toBe(SETUP_LINK_HOURS * 3_600_000);
    expect(result.expiresAt).toEqual(rows[0]!.expiresAt);
    expect(SETUP_LINK_HOURS).toBe(24);
  });

  it("ist wiederholbar: für einen bestehenden Plattform-Administrator entsteht ein neuer Link, der alte wird ungültig", async () => {
    const data = input();
    const first = await createPlatformAdmin(data);
    const second = await createPlatformAdmin(data);

    expect(second).toMatchObject({ userId: first.userId, created: false });
    expect(await isPasswordResetTokenValid(tokenOf(first.setPasswordUrl))).toBe(false);
    expect(await isPasswordResetTokenValid(tokenOf(second.setPasswordUrl))).toBe(true);
    expect(await prisma.user.count({ where: { email: data.email } })).toBe(1);
  });

  it("schreibt Adresse in Kleinbuchstaben; erkennt vorhandene Konten unabhängig von der Schreibweise", async () => {
    const email = `${unique("Gross")}@Example.Test`;
    const first = await createPlatformAdmin({ ...input(), email });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: first.userId } })).email).toBe(
      email.toLowerCase(),
    );
    const again = await createPlatformAdmin({ ...input(), email: email.toUpperCase() });
    expect(again).toMatchObject({ userId: first.userId, created: false });
  });

  it("stuft ein bestehendes Konto ohne Plattform-Rechte NICHT stillschweigend hoch", async () => {
    const member = await createUser({ email: `${unique("mitglied")}@example.test` });
    await expect(createPlatformAdmin(input(member.email))).rejects.toThrow(/ohne Plattform-Rechte/);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: member.id } })).isPlatformAdmin,
    ).toBe(false);
    expect(await prisma.verificationToken.count({ where: { userId: member.id } })).toBe(0);
  });

  it("verweigert deaktivierte und gelöschte Konten", async () => {
    const disabled = await createUser({ isPlatformAdmin: true });
    await prisma.user.update({ where: { id: disabled.id }, data: { disabledAt: new Date() } });
    await expect(createPlatformAdmin(input(disabled.email))).rejects.toThrow(
      /deaktiviertes oder gelöschtes Konto/,
    );

    const deleted = await createUser({ isPlatformAdmin: true });
    await prisma.user.update({ where: { id: deleted.id }, data: { deletedAt: new Date() } });
    await expect(createPlatformAdmin(input(deleted.email))).rejects.toThrow(
      /deaktiviertes oder gelöschtes Konto/,
    );
  });

  it("prüft die Eingaben", async () => {
    await expect(createPlatformAdmin({ ...input(), email: "keine-adresse" })).rejects.toThrow(
      /gültige E-Mail/,
    );
    await expect(createPlatformAdmin({ ...input(), firstName: "  " })).rejects.toThrow(/Vorname/);
    await expect(createPlatformAdmin({ ...input(), lastName: "" })).rejects.toThrow(/Nachname/);
    expect(await prisma.user.count({ where: { email: "keine-adresse" } })).toBe(0);
  });

  it("protokolliert den Vorgang – ohne Adresse und ohne Link", async () => {
    const data = input();
    const result = await createPlatformAdmin(data);
    const entries = await prisma.auditLog.findMany({
      where: { action: "platform.admin_created", entityId: result.userId },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ actorType: "SYSTEM", clubId: null, entityType: "User" });
    const json = JSON.stringify(entries);
    expect(json).not.toContain(data.email);
    expect(json).not.toContain(tokenOf(result.setPasswordUrl));
  });
});
