import { describe, expect, it } from "vitest";
import { prisma } from "@/server/db/client";
import {
  createSessionRecord,
  deleteSessionByToken,
  deleteSessionsForUser,
  purgeExpiredSessions,
  validateSessionToken,
} from "@/server/auth/session-core";
import { hashToken } from "@/server/security/tokens";
import { createUser } from "../helpers/factories";

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

const newSession = async (userId: string, now = new Date()) =>
  createSessionRecord({
    userId,
    activeClubId: null,
    userAgent: "vitest",
    ipPrefix: "127.0.0.0",
    now,
  });

describe("Sitzungen", () => {
  it("speichert nur den Hash des Tokens, nie das Token selbst", async () => {
    const user = await createUser();
    const { token } = await newSession(user.id);

    expect(await prisma.session.findUnique({ where: { id: token } })).toBeNull();
    expect(await prisma.session.findUnique({ where: { id: hashToken(token) } })).not.toBeNull();
  });

  it("gibt für ein gültiges Token den Benutzer zurück", async () => {
    const user = await createUser({ firstName: "Erika", lastName: "Muster" });
    const { token } = await newSession(user.id);

    const session = await validateSessionToken(token);
    expect(session?.user).toMatchObject({
      id: user.id,
      firstName: "Erika",
      isPlatformAdmin: false,
    });
    expect(session?.user).not.toHaveProperty("passwordHash");
  });

  it("lehnt unbekannte und manipulierte Tokens ab", async () => {
    const user = await createUser();
    const { token } = await newSession(user.id);

    expect(await validateSessionToken("gibt-es-nicht")).toBeNull();
    expect(await validateSessionToken(`${token}x`)).toBeNull();
    expect(await validateSessionToken("")).toBeNull();
  });

  it("meldet nach Inaktivität automatisch ab und löscht die Sitzung", async () => {
    const user = await createUser();
    const t0 = new Date();
    const { token } = await newSession(user.id, t0);

    expect(await validateSessionToken(token, new Date(t0.getTime() + 59 * MINUTE))).not.toBeNull();
    // Aktivität bei Minute 59 verlängert die Sitzung …
    expect(await validateSessionToken(token, new Date(t0.getTime() + 118 * MINUTE))).not.toBeNull();
    // … aber 61 Minuten ohne Aktivität beenden sie.
    expect(
      await validateSessionToken(token, new Date(t0.getTime() + 118 * MINUTE + 61 * MINUTE)),
    ).toBeNull();
    expect(await prisma.session.findUnique({ where: { id: hashToken(token) } })).toBeNull();
  });

  it("beendet die Sitzung nach der absoluten Höchstdauer, auch bei ständiger Aktivität", async () => {
    const user = await createUser();
    const t0 = new Date();
    const { token, expiresAt } = await newSession(user.id, t0);
    expect(expiresAt.getTime() - t0.getTime()).toBe(14 * DAY);

    // Sitzung wurde zuletzt vor 2 Minuten benutzt – nur die absolute Frist ist abgelaufen.
    const almostOver = new Date(t0.getTime() + 14 * DAY + MINUTE);
    await prisma.session.update({
      where: { id: hashToken(token) },
      data: { lastSeenAt: new Date(almostOver.getTime() - 2 * MINUTE) },
    });
    expect(await validateSessionToken(token, almostOver)).toBeNull();
  });

  it("verweigert Sitzungen gesperrter oder gelöschter Benutzer", async () => {
    const user = await createUser();
    const { token } = await newSession(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { disabledAt: new Date() } });

    expect(await validateSessionToken(token)).toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("Abmelden entfernt die Sitzung; 'überall abmelden' entfernt alle (außer der ausgenommenen)", async () => {
    const user = await createUser();
    const a = await newSession(user.id);
    const b = await newSession(user.id);
    const c = await newSession(user.id);

    await deleteSessionByToken(a.token);
    expect(await validateSessionToken(a.token)).toBeNull();

    await deleteSessionsForUser(user.id, hashToken(b.token));
    expect(await validateSessionToken(b.token)).not.toBeNull();
    expect(await validateSessionToken(c.token)).toBeNull();
  });

  it("räumt abgelaufene Sitzungen auf", async () => {
    const user = await createUser();
    const old = await newSession(user.id, new Date(Date.now() - 15 * DAY));
    const fresh = await newSession(user.id);

    await purgeExpiredSessions();
    expect(await prisma.session.findUnique({ where: { id: hashToken(old.token) } })).toBeNull();
    expect(
      await prisma.session.findUnique({ where: { id: hashToken(fresh.token) } }),
    ).not.toBeNull();
  });
});
