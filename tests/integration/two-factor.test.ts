import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// E-Mails werden abgefangen statt versendet; so lassen sich Hinweise und Links aus dem Text lesen.
const mail = vi.hoisted(() => ({ sent: [] as { to: string; subject: string; text: string }[] }));
vi.mock("@/server/mail", () => ({
  sendMailDeferred: async (message: { to: string; subject: string; text: string }) =>
    void mail.sent.push(message),
  sendMail: async (message: { to: string; subject: string; text: string }) =>
    void mail.sent.push(message),
}));

// Server Actions laufen hier ohne Next.js. Ein kleiner Cookie-Speicher ersetzt den Browser: Sitzungs-Cookie und das
// Cookie des Zwischenschritts (Passwort richtig, Code fehlt noch) liegen getrennt darin.
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    has: (name: string) => jar.has(name),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (options: string | { name: string }) =>
      void jar.delete(typeof options === "string" ? options : options.name),
  }),
  headers: async () => new Headers({ "user-agent": "vitest" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// `redirect()` wirft in Next.js einen besonderen Fehler, den `runAction` durchreicht – hier mit dem Ziel als Eigenschaft.
vi.mock("next/navigation", () => {
  class RedirectSignal extends Error {
    readonly location: string;
    constructor(location: string) {
      super(`NEXT_REDIRECT ${location}`);
      this.location = location;
    }
  }
  return {
    redirect: (location: string): never => {
      throw new RedirectSignal(location);
    },
    unstable_rethrow: (error: unknown) => {
      if (error instanceof RedirectSignal) throw error;
    },
  };
});

import type { Club } from "@/generated/prisma/client";
import { SECOND_FACTOR_COOKIE_NAME, SESSION_COOKIE_NAME } from "@/lib/session-cookie";
import { loginAction, verifySecondFactorAction } from "@/modules/auth/actions";
import {
  confirmTwoFactorSetupAction,
  disableTwoFactorAction,
  startTwoFactorSetupAction,
} from "@/modules/profile/actions";
import { resetUserTwoFactor } from "@/modules/users/service";
import { hashPassword } from "@/server/auth/password";
import {
  authenticate,
  passwordFingerprint,
  requestPasswordReset,
  resetPassword,
} from "@/server/auth/service";
import { createSessionRecord } from "@/server/auth/session-core";
import {
  confirmTwoFactorSetup,
  disableTwoFactor,
  getTwoFactorOverview,
  renewRecoveryCodes,
  resetTwoFactor,
  resetTwoFactorByOperator,
  startTwoFactorSetup,
  verifySecondFactor,
} from "@/server/auth/two-factor";
import { prisma } from "@/server/db/client";
import type { PermissionKey } from "@/server/permissions/catalog";
import { openSecret } from "@/server/security/secret-box";
import { hashToken } from "@/server/security/tokens";
import { addUserToClub, contextFor, createClub, createUser } from "../helpers/factories";

/**
 * Zwei-Faktor-Anmeldung (TOTP) über die echten Dienste und Server Actions: Einrichten, Anmelden in zwei Schritten,
 * Schutz vor erneut verwendeten Codes, Wiederherstellungscodes, Sperre nach Fehlversuchen, Ausschalten und das
 * Zurücksetzen durch den Verein bzw. den Betreiber.
 *
 * Die Codes rechnet eine eigene kleine „Authenticator-App“ in dieser Datei (RFC 6238) – unabhängig vom Code der Anwendung.
 * Die Zeit ist fest vorgegeben: Die Dienste bekommen den Zeitpunkt übergeben, für die Server Actions ist nur `Date`
 * eingefroren (Zähler der Fehlversuche laufen in der Datenbank mit deren Uhr und bleiben davon unberührt).
 */

// ---------------------------------------------------------------------------------------------------------------------
// Unabhängige Authenticator-App (RFC 4226/6238: HMAC-SHA1, 6 Ziffern, 30 Sekunden)
// ---------------------------------------------------------------------------------------------------------------------

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function decodeBase32(text: string): Buffer {
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of text.replace(/[\s=]/g, "").toUpperCase()) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error(`Kein Base32-Zeichen: ${char}`);
    value = ((value << 5) | index) & 0xffff;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totpForStep(secret: string, step: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(step));
  const digest = createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

const PERIOD_MS = 30_000;
/** Fester Ausgangspunkt: 15.10.2026, 10:00:10 Uhr in Berlin (Sommerzeit) – 10 Sekunden nach Beginn eines Zeitschritts. */
const T0 = new Date("2026-10-15T10:00:10+02:00");
/** Zeitpunkt `steps` Zeitschritte (je 30 Sekunden) nach {@link T0}. */
const at = (steps: number) => new Date(T0.getTime() + steps * PERIOD_MS);
const stepOf = (time: Date) => Math.floor(time.getTime() / PERIOD_MS);
/** Der Code, den die App zum Zeitpunkt `time` anzeigt – bzw. `offset` Zeitschritte daneben (Uhr geht vor/nach). */
const codeAt = (secret: string, time: Date, offset = 0) =>
  totpForStep(secret, stepOf(time) + offset);
/** Ein Code, der rund um `time` (±2 Zeitschritte) sicher nicht passt. */
function wrongCodeAt(secret: string, time: Date): string {
  const near = new Set([-2, -1, 0, 1, 2].map((offset) => codeAt(secret, time, offset)));
  let candidate = 271828;
  while (near.has(String(candidate))) candidate += 1;
  return String(candidate);
}

// ---------------------------------------------------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------------------------------------------------

const PASSWORD = "Korrektes-Pferd-Batterie-42";
const RECOVERY_CODE = /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/;

// Jeder Test verwendet eine eigene IP, damit sich die IP-Grenzen der Tests nicht gegenseitig auslösen.
let ipCounter = 0;
let meta = { ip: "192.0.2.1", ipPrefix: "192.0.2.0" };

beforeEach(() => {
  mail.sent.length = 0;
  jar.clear();
  ipCounter += 1;
  meta = { ip: `192.0.2.${ipCounter}`, ipPrefix: "192.0.2.0" };
});

// Der Hash von PASSWORD – einmal berechnet (Argon2 ist absichtlich langsam) und für alle Konten der Tests verwendet.
let passwordHashOnce: Promise<string> | null = null;
const knownPasswordHash = () => (passwordHashOnce ??= hashPassword(PASSWORD));

async function userWithPassword(overrides: Parameters<typeof createUser>[0] = {}) {
  return createUser({ ...overrides, passwordHash: await knownPasswordHash() });
}

/**
 * Richtet die Zwei-Faktor-Anmeldung über den echten Ablauf ein: Schlüssel wie auf der Profilseite, Passwort und Code zum
 * Zeitpunkt T0. Das Konto bekommt dafür das bekannte Passwort.
 */
async function enrol(user: { id: string }) {
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await knownPasswordHash() },
  });
  await startTwoFactorSetup(user.id);
  const secret = (await getTwoFactorOverview(user.id)).pending!.secret;
  const recoveryCodes = await confirmTwoFactorSetup(
    { userId: user.id, password: PASSWORD, code: codeAt(secret, T0) },
    meta,
    T0,
  );
  mail.sent.length = 0;
  return { secret, recoveryCodes };
}

async function enrolledUser(overrides: Parameters<typeof createUser>[0] = {}) {
  const user = await userWithPassword(overrides);
  return { user, ...(await enrol(user)) };
}

const userRow = (id: string) => prisma.user.findUniqueOrThrow({ where: { id } });
const sessionsOf = (userId: string) => prisma.session.count({ where: { userId } });
const auditCount = (userId: string, action: string) =>
  prisma.auditLog.count({ where: { actorUserId: userId, action } });

/** Ergebnis eines Versuchs als Kurzform: `"ok"` oder der Fehlercode (für gleichzeitige Anfragen). */
const outcome = (promise: Promise<unknown>) =>
  promise.then(
    () => "ok",
    (error: { code?: string }) => error.code ?? "?",
  );

/** Fingerabdruck des aktuellen Passworts – so, wie ihn der erste Schritt der Anmeldung ins Cookie schreibt. */
const currentFingerprint = async (userId: string) =>
  passwordFingerprint((await userRow(userId)).passwordHash);

const verify = async (userId: string, code: string, now: Date) =>
  verifySecondFactor(
    { userId, code, passwordFingerprint: await currentFingerprint(userId) },
    meta,
    now,
  );

/** Stand eines Zählers (`null`, wenn es ihn nicht gibt). */
const bucketCount = async (key: string) =>
  (await prisma.rateLimitBucket.findUnique({ where: { key } }))?.count ?? null;

/**
 * Lässt das Zeitfenster eines Zählers ablaufen, als wäre es später geworden. Die Zähler laufen mit der Uhr der Datenbank –
 * die an die Dienste übergebene Zeit (für die Codes) verschiebt sie nicht.
 */
const expireBucket = (key: string) =>
  prisma.rateLimitBucket.updateMany({ where: { key }, data: { resetAt: new Date("2000-01-01") } });

/** Zweiter Schritt mit eigener Herkunft (IP) statt der des Tests. */
const verifyFrom = async (
  from: { ip: string; ipPrefix: string },
  userId: string,
  code: string,
  now: Date,
) =>
  verifySecondFactor(
    { userId, code, passwordFingerprint: await currentFingerprint(userId) },
    from,
    now,
  );

// ---------------------------------------------------------------------------------------------------------------------

describe("Zwei-Faktor einrichten", () => {
  it("erst der richtige Code schaltet ein – ein falscher Code ändert nichts", async () => {
    const club = await createClub("Einrichtungsverein");
    const user = await userWithPassword();
    await addUserToClub(club, "MEMBER", { user });

    await startTwoFactorSetup(user.id);
    expect(await userRow(user.id)).toMatchObject({
      totpEnabledAt: null,
      totpLastStep: null,
      recoveryCodeHashes: [],
    });
    const overview = await getTwoFactorOverview(user.id);
    expect(overview.enabledAt).toBeNull();
    const secret = overview.pending!.secret;
    expect(secret).toMatch(/^[A-Z2-7]{32}$/); // 160 Bit
    expect(overview.pending!.otpauthUrl).toContain(`secret=${secret}`);
    expect(overview.pending!.otpauthUrl).toContain("issuer=VereinsFlow");

    // Eine angefangene Einrichtung ändert an der Anmeldung nichts.
    expect(await authenticate({ email: user.email, password: PASSWORD }, meta)).toEqual({
      userId: user.id,
      isPlatformAdmin: false,
      activeClubId: club.id,
    });

    // Ohne das richtige Passwort schaltet auch der richtige Code nicht ein (eine offene Sitzung allein reicht nicht).
    await expect(
      confirmTwoFactorSetup(
        { userId: user.id, password: "falsch-falsch-falsch", code: codeAt(secret, T0) },
        meta,
        T0,
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { password: ["Das Passwort ist nicht korrekt."] },
    });
    await expect(
      confirmTwoFactorSetup(
        { userId: user.id, password: PASSWORD, code: wrongCodeAt(secret, T0) },
        meta,
        T0,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { code: [expect.any(String)] } });
    expect(await userRow(user.id)).toMatchObject({ totpEnabledAt: null, recoveryCodeHashes: [] });
    expect(await auditCount(user.id, "auth.2fa_enabled")).toBe(0);

    const codes = await confirmTwoFactorSetup(
      { userId: user.id, password: PASSWORD, code: codeAt(secret, T0) },
      meta,
      T0,
    );
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(RECOVERY_CODE);

    const row = await userRow(user.id);
    expect(row.totpEnabledAt).toEqual(T0);
    expect(row.totpLastStep).toBe(stepOf(T0));
    expect(row.recoveryCodeHashes).toHaveLength(10);
    expect(await getTwoFactorOverview(user.id)).toEqual({
      enabledAt: T0,
      pending: null,
      recoveryCodesLeft: 10,
    });
    expect(await auditCount(user.id, "auth.2fa_enabled")).toBe(1);
    expect(mail.sent).toEqual([
      expect.objectContaining({ to: user.email, subject: "Zwei-Faktor-Anmeldung eingeschaltet" }),
    ]);

    // Ab jetzt endet die Passwortprüfung mit dem zweiten Schritt.
    expect(await authenticate({ email: user.email, password: PASSWORD }, meta)).toEqual({
      secondFactor: "required",
      userId: user.id,
      passwordFingerprint: await currentFingerprint(user.id),
    });
  });

  it("ohne begonnene Einrichtung gibt es nichts zu bestätigen; eingeschaltet lässt sie sich nicht neu beginnen", async () => {
    const fresh = await createUser();
    await expect(
      confirmTwoFactorSetup({ userId: fresh.id, password: PASSWORD, code: "123456" }, meta, T0),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    const { user, secret } = await enrolledUser();
    await expect(startTwoFactorSetup(user.id)).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("bereits eingeschaltet"),
    });
    await expect(
      confirmTwoFactorSetup(
        { userId: user.id, password: PASSWORD, code: codeAt(secret, at(1)) },
        meta,
        at(1),
      ),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // Der Schlüssel bleibt derselbe.
    await expect(verify(user.id, codeAt(secret, at(2)), at(2))).resolves.toMatchObject({
      method: "totp",
    });
  });
});

describe("Gespeicherte Geheimnisse", () => {
  it("speichert den Schlüssel nur verschlüsselt und an das Konto gebunden", async () => {
    const user = await createUser();
    const other = await createUser();
    await startTwoFactorSetup(user.id);
    const secret = (await getTwoFactorOverview(user.id)).pending!.secret;

    const sealed = (await userRow(user.id)).totpSecretEnc!;
    expect(sealed).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
    expect(sealed).not.toContain(secret);
    expect(Buffer.from(sealed.slice(3), "base64url").includes(Buffer.from(secret))).toBe(false);
    expect(openSecret(sealed, `totp:${user.id}`)).toBe(secret);
    expect(openSecret(sealed, `totp:${other.id}`)).toBeNull();

    // Neu beginnen ersetzt den Schlüssel.
    await startTwoFactorSetup(user.id);
    const renewed = (await getTwoFactorOverview(user.id)).pending!.secret;
    expect(renewed).not.toBe(secret);
    expect((await userRow(user.id)).totpSecretEnc).not.toBe(sealed);
  });

  it("ein in ein anderes Konto kopierter Schlüssel lässt sich dort nicht verwenden", async () => {
    const alice = await enrolledUser();
    const bob = await enrolledUser();
    const aliceSealed = (await userRow(alice.user.id)).totpSecretEnc;
    await prisma.user.update({ where: { id: bob.user.id }, data: { totpSecretEnc: aliceSealed } });

    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(verify(bob.user.id, codeAt(alice.secret, at(1)), at(1))).rejects.toMatchObject({
        code: "VALIDATION",
      });
      expect(errors).toHaveBeenCalledWith(expect.stringContaining("entschlüsseln"));
    } finally {
      errors.mockRestore();
    }
    expect((await userRow(bob.user.id)).totpLastStep).toBe(stepOf(T0));
  });

  it("speichert Wiederherstellungscodes nur als HMAC", async () => {
    const { user, recoveryCodes } = await enrolledUser();
    const hashes = (await userRow(user.id)).recoveryCodeHashes;
    expect(hashes).toHaveLength(10);
    for (const hash of hashes) expect(hash).toMatch(/^[0-9a-f]{64}$/);
    const stored = hashes.join(" ");
    for (const code of recoveryCodes) {
      expect(stored).not.toContain(code);
      expect(stored).not.toContain(code.replace("-", ""));
    }
  });
});

describe("Anmeldung in zwei Schritten", () => {
  it("nach dem Passwort bleibt die Anmeldung offen: keine letzte Anmeldung, kein Protokoll – bis zum Code", async () => {
    const club = await createClub("Zwei-Schritt-Verein");
    const { user, secret } = await enrolledUser();
    await addUserToClub(club, "MEMBER", { user });

    expect(await authenticate({ email: user.email, password: PASSWORD }, meta)).toEqual({
      secondFactor: "required",
      userId: user.id,
      passwordFingerprint: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
    expect((await userRow(user.id)).lastLoginAt).toBeNull();
    expect(await auditCount(user.id, "auth.login")).toBe(0);
    expect(await sessionsOf(user.id)).toBe(0);

    const result = await verify(user.id, codeAt(secret, at(1)), at(1));
    expect(result).toEqual({
      method: "totp",
      user: { userId: user.id, isPlatformAdmin: false, activeClubId: club.id },
    });
    expect((await userRow(user.id)).lastLoginAt).not.toBeNull();
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { actorUserId: user.id, action: "auth.login" },
    });
    expect(audit).toMatchObject({
      clubId: club.id,
      summary: "Anmeldung mit Zwei-Faktor",
      ipPrefix: "192.0.2.0",
    });
  });

  it("ein falsches Passwort führt nie zum zweiten Schritt", async () => {
    const { user } = await enrolledUser();
    await expect(
      authenticate({ email: user.email, password: "falsch-falsch-falsch" }, meta),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("Konto inzwischen gesperrt oder Zwei-Faktor abgeschaltet: die Anmeldung beginnt von vorn", async () => {
    const locked = await enrolledUser();
    await prisma.user.update({ where: { id: locked.user.id }, data: { disabledAt: new Date() } });
    await expect(verify(locked.user.id, codeAt(locked.secret, at(1)), at(1))).rejects.toMatchObject(
      { code: "UNAUTHENTICATED" },
    );
    expect((await userRow(locked.user.id)).totpLastStep).toBe(stepOf(T0)); // Code nicht verbraucht

    const plain = await userWithPassword();
    await expect(verify(plain.id, "123456", at(1))).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });

    // Zwischenschritt mit einem anderen Passwort (inzwischen geändert): von vorn, der Code bleibt unverbraucht.
    const changed = await enrolledUser();
    await expect(
      verifySecondFactor(
        {
          userId: changed.user.id,
          code: codeAt(changed.secret, at(1)),
          passwordFingerprint: passwordFingerprint("$argon2id$ein-frueheres-passwort"),
        },
        meta,
        at(1),
      ),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect((await userRow(changed.user.id)).totpLastStep).toBe(stepOf(T0));
  });

  it("ein Passwort-Reset schaltet die Zwei-Faktor-Anmeldung nicht ab", async () => {
    const { user } = await enrolledUser();
    await requestPasswordReset(user.email, meta);
    const token = /token=([A-Za-z0-9_-]+)/.exec(mail.sent[0]!.text)?.[1] ?? "";
    const newPassword = "Neues-Pferd-Batterie-77";
    await resetPassword({ token, password: newPassword }, meta);

    expect(await userRow(user.id)).toMatchObject({
      totpEnabledAt: T0,
      recoveryCodeHashes: expect.arrayContaining([expect.any(String)]),
    });
    expect(await authenticate({ email: user.email, password: newPassword }, meta)).toEqual({
      secondFactor: "required",
      userId: user.id,
      passwordFingerprint: await currentFingerprint(user.id),
    });
  });
});

describe("Anmeldung über die Server Actions", () => {
  const NOW = at(40);

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("nach dem Passwort gibt es nur das Zwischenschritt-Cookie – angemeldet ist erst nach dem Code", async () => {
    const club = await createClub("Aktionsverein");
    const { user, secret } = await enrolledUser();
    await addUserToClub(club, "MEMBER", { user });

    await expect(
      loginAction({ email: user.email, password: PASSWORD, next: "/veranstaltungen" }),
    ).rejects.toMatchObject({ location: "/anmelden/bestaetigen" });
    const challenge = jar.get(SECOND_FACTOR_COOKIE_NAME);
    expect(challenge).toMatch(/^v1\./);
    expect(challenge).not.toContain(user.id);
    expect(jar.has(SESSION_COOKIE_NAME)).toBe(false);
    expect(await sessionsOf(user.id)).toBe(0);
    expect((await userRow(user.id)).lastLoginAt).toBeNull();
    expect(await auditCount(user.id, "auth.login")).toBe(0);

    // Falscher Code: weiterhin keine Sitzung, der Zwischenschritt bleibt bestehen.
    expect(await verifySecondFactorAction({ code: wrongCodeAt(secret, NOW) })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    expect(jar.has(SESSION_COOKIE_NAME)).toBe(false);
    expect(jar.get(SECOND_FACTOR_COOKIE_NAME)).toBe(challenge);
    expect(await sessionsOf(user.id)).toBe(0);

    await expect(verifySecondFactorAction({ code: codeAt(secret, NOW) })).rejects.toMatchObject({
      location: "/veranstaltungen",
    });
    expect(jar.has(SECOND_FACTOR_COOKIE_NAME)).toBe(false);
    const token = jar.get(SESSION_COOKIE_NAME)!;
    expect(await prisma.session.findUnique({ where: { id: hashToken(token) } })).toMatchObject({
      userId: user.id,
      activeClubId: club.id,
    });
    expect((await userRow(user.id)).lastLoginAt).toEqual(NOW);
    expect(
      await prisma.auditLog.findFirstOrThrow({
        where: { actorUserId: user.id, action: "auth.login" },
      }),
    ).toMatchObject({ clubId: club.id, summary: "Anmeldung mit Zwei-Faktor" });
  });

  it("der Zwischenschritt gilt 5 Minuten – danach beginnt die Anmeldung von vorn", async () => {
    const { user, secret } = await enrolledUser();
    await expect(loginAction({ email: user.email, password: PASSWORD })).rejects.toMatchObject({
      location: "/anmelden/bestaetigen",
    });

    const later = new Date(NOW.getTime() + 5 * 60_000 + 1_000);
    vi.setSystemTime(later);
    await expect(verifySecondFactorAction({ code: codeAt(secret, later) })).rejects.toMatchObject({
      location: "/anmelden?abgelaufen=1",
    });
    expect(jar.has(SECOND_FACTOR_COOKIE_NAME)).toBe(false);
    expect(jar.has(SESSION_COOKIE_NAME)).toBe(false);
    expect(await sessionsOf(user.id)).toBe(0);
    expect((await userRow(user.id)).totpLastStep).toBe(stepOf(T0)); // Code nicht verbraucht
  });

  it("ohne Zwischenschritt oder bei inzwischen gesperrtem Konto: zurück zur Anmeldung, keine Sitzung", async () => {
    await expect(verifySecondFactorAction({ code: "123456" })).rejects.toMatchObject({
      location: "/anmelden?abgelaufen=1",
    });

    const { user, secret } = await enrolledUser();
    await expect(loginAction({ email: user.email, password: PASSWORD })).rejects.toMatchObject({
      location: "/anmelden/bestaetigen",
    });
    await prisma.user.update({ where: { id: user.id }, data: { disabledAt: NOW } });
    await expect(verifySecondFactorAction({ code: codeAt(secret, NOW) })).rejects.toMatchObject({
      location: "/anmelden?abgelaufen=1",
    });
    expect(jar.has(SECOND_FACTOR_COOKIE_NAME)).toBe(false);
    expect(await sessionsOf(user.id)).toBe(0);
  });

  it("ein neues Passwort beendet jede offene Code-Eingabe – auch ein aufbewahrtes Cookie", async () => {
    const club = await createClub("Passwortwechselverein");
    const { user, secret } = await enrolledUser();
    await addUserToClub(club, "MEMBER", { user });
    await expect(loginAction({ email: user.email, password: PASSWORD })).rejects.toMatchObject({
      location: "/anmelden/bestaetigen",
    });
    const stale = jar.get(SECOND_FACTOR_COOKIE_NAME)!;

    // Die Person setzt ihr Passwort zurück (z. B. nach der Warn-E-Mail „Mehrere falsche Codes“).
    await requestPasswordReset(user.email, meta);
    const token = /token=([A-Za-z0-9_-]+)/.exec(mail.sent.at(-1)!.text)?.[1] ?? "";
    const newPassword = "Neues-Pferd-Batterie-77";
    await resetPassword({ token, password: newPassword }, meta);

    // Wer das alte Passwort kannte, kommt mit dem schon ausgestellten Zwischenschritt nicht weiter – nicht einmal mit dem
    // richtigen Code. Der Code bleibt unverbraucht, und es zählt kein Fehlversuch für das Konto.
    for (let attempt = 1; attempt <= 2; attempt++) {
      jar.set(SECOND_FACTOR_COOKIE_NAME, stale);
      await expect(verifySecondFactorAction({ code: codeAt(secret, NOW) })).rejects.toMatchObject({
        location: "/anmelden?abgelaufen=1",
      });
      expect(jar.has(SECOND_FACTOR_COOKIE_NAME)).toBe(false);
    }
    expect(jar.has(SESSION_COOKIE_NAME)).toBe(false);
    expect(await sessionsOf(user.id)).toBe(0);
    expect((await userRow(user.id)).totpLastStep).toBe(stepOf(T0));
    expect(await bucketCount(`2fa:acct:${user.id}`)).toBeNull();

    // Mit dem neuen Passwort und dem Code geht es wie gewohnt.
    await expect(loginAction({ email: user.email, password: newPassword })).rejects.toMatchObject({
      location: "/anmelden/bestaetigen",
    });
    await expect(verifySecondFactorAction({ code: codeAt(secret, NOW) })).rejects.toMatchObject({
      location: "/dashboard",
    });
    expect(await sessionsOf(user.id)).toBe(1);
  });

  it("Einschalten im Profil meldet alle anderen Geräte ab, dieses bleibt angemeldet", async () => {
    const user = await userWithPassword();
    const sessionInput = {
      userId: user.id,
      activeClubId: null,
      userAgent: "vitest",
      ipPrefix: null,
    };
    const current = await createSessionRecord(sessionInput);
    await createSessionRecord(sessionInput);
    await createSessionRecord(sessionInput);
    jar.set(SESSION_COOKIE_NAME, current.token);

    expect(await startTwoFactorSetupAction()).toEqual({ ok: true, data: undefined });
    const secret = (await getTwoFactorOverview(user.id)).pending!.secret;

    // Ohne Passwort, mit falschem Passwort oder falschem Code: nichts geschieht.
    expect(await confirmTwoFactorSetupAction({ code: codeAt(secret, NOW) })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fieldErrors: { password: [expect.any(String)] } },
    });
    expect(
      await confirmTwoFactorSetupAction({
        password: "falsch-falsch-falsch",
        code: codeAt(secret, NOW),
      }),
    ).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fieldErrors: { password: ["Das Passwort ist nicht korrekt."] } },
    });
    expect(
      await confirmTwoFactorSetupAction({ password: PASSWORD, code: wrongCodeAt(secret, NOW) }),
    ).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fieldErrors: { code: [expect.any(String)] } },
    });
    expect(await sessionsOf(user.id)).toBe(3);
    expect((await userRow(user.id)).totpEnabledAt).toBeNull();

    const result = await confirmTwoFactorSetupAction({
      password: PASSWORD,
      code: codeAt(secret, NOW),
    });
    if (!result.ok) throw new Error(`Einschalten fehlgeschlagen: ${result.error.message}`);
    expect(result.data.recoveryCodes).toHaveLength(10);
    expect(
      await prisma.session.findMany({ where: { userId: user.id }, select: { id: true } }),
    ).toEqual([{ id: hashToken(current.token) }]);

    // Ausschalten im Profil: ohne Passwort und Code geht nichts, mit beidem schon.
    expect(await disableTwoFactorAction({ password: PASSWORD, code: "" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    });
    vi.setSystemTime(at(41));
    expect(
      await disableTwoFactorAction({ password: PASSWORD, code: codeAt(secret, at(41)) }),
    ).toEqual({ ok: true, data: undefined });
    expect((await userRow(user.id)).totpEnabledAt).toBeNull();
  });
});

describe("Schutz vor erneut verwendeten Codes", () => {
  it("derselbe Code gilt nur einmal – auch der Code aus der Einrichtung", async () => {
    const { user, secret } = await enrolledUser();

    // Mit diesem Code wurde gerade eingeschaltet.
    await expect(verify(user.id, codeAt(secret, T0), T0)).rejects.toMatchObject({
      code: "VALIDATION",
    });

    await expect(verify(user.id, codeAt(secret, at(1)), at(1))).resolves.toMatchObject({
      method: "totp",
    });
    expect((await userRow(user.id)).totpLastStep).toBe(stepOf(at(1)));
    await expect(verify(user.id, codeAt(secret, at(1)), at(1))).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(await auditCount(user.id, "auth.login")).toBe(1);
  });

  it("nach einem neueren Zeitschritt wird ein älterer abgelehnt", async () => {
    const { user, secret } = await enrolledUser();

    // Die Handyuhr geht vor: Der Code des nächsten Zeitschritts wird angenommen …
    await expect(verify(user.id, codeAt(secret, at(5), +1), at(5))).resolves.toMatchObject({
      method: "totp",
    });
    expect((await userRow(user.id)).totpLastStep).toBe(stepOf(at(5)) + 1);

    // … danach gilt weder der ältere Code (obwohl noch im Spielraum) noch derselbe noch einmal.
    await expect(verify(user.id, codeAt(secret, at(6), -1), at(6))).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(verify(user.id, codeAt(secret, at(6)), at(6))).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect((await userRow(user.id)).totpLastStep).toBe(stepOf(at(6)));

    // Erst ein späterer Zeitschritt klappt wieder.
    await expect(verify(user.id, codeAt(secret, at(7)), at(7))).resolves.toMatchObject({
      method: "totp",
    });
  });

  it("gleichzeitig eingereicht gilt derselbe Code genau einmal", async () => {
    const { user, secret } = await enrolledUser();
    const code = codeAt(secret, at(3));

    const results = await Promise.all(
      Array.from({ length: 4 }, () => outcome(verify(user.id, code, at(3)))),
    );
    expect(results.filter((result) => result === "ok")).toHaveLength(1);
    expect(results.filter((result) => result === "VALIDATION")).toHaveLength(3);
    expect(await auditCount(user.id, "auth.login")).toBe(1);
  });
});

describe("Spielraum der Uhr", () => {
  it("nimmt Codes einen Zeitschritt vor und nach der Serverzeit an", async () => {
    const { user, secret } = await enrolledUser();
    await expect(verify(user.id, codeAt(secret, at(10), -1), at(10))).resolves.toMatchObject({
      method: "totp",
    });
    await expect(verify(user.id, codeAt(secret, at(10), +1), at(10))).resolves.toMatchObject({
      method: "totp",
    });
    expect((await userRow(user.id)).totpLastStep).toBe(stepOf(at(10)) + 1);
  });

  it("lehnt Codes zwei Zeitschritte daneben ab", async () => {
    const { user, secret } = await enrolledUser();
    await expect(verify(user.id, codeAt(secret, at(20), -2), at(20))).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(verify(user.id, codeAt(secret, at(20), +2), at(20))).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect((await userRow(user.id)).totpLastStep).toBe(stepOf(T0));

    // Der aktuelle Code klappt weiterhin.
    await expect(verify(user.id, codeAt(secret, at(20)), at(20))).resolves.toMatchObject({
      method: "totp",
    });
  });
});

describe("Wiederherstellungscodes", () => {
  it("ein Code meldet einmal an – danach nie wieder", async () => {
    const club = await createClub("Wiederherstellungsverein");
    const { user, recoveryCodes } = await enrolledUser();
    await addUserToClub(club, "MEMBER", { user });
    const [first, second] = recoveryCodes as [string, string];

    // Klein geschrieben und mit Leerzeichen statt Bindestrich – so tippen Menschen ihn ab.
    const result = await verify(user.id, first.toLowerCase().replace("-", " "), at(1));
    expect(result).toMatchObject({ method: "recovery_code", user: { activeClubId: club.id } });
    expect((await userRow(user.id)).recoveryCodeHashes).toHaveLength(9);
    expect(
      await prisma.auditLog.findFirstOrThrow({
        where: { actorUserId: user.id, action: "auth.2fa_recovery_used" },
      }),
    ).toMatchObject({ summary: "Mit Wiederherstellungscode angemeldet (noch 9 übrig)" });
    expect(
      await prisma.auditLog.findFirstOrThrow({
        where: { actorUserId: user.id, action: "auth.login" },
      }),
    ).toMatchObject({ summary: "Anmeldung mit Zwei-Faktor (Wiederherstellungscode)" });
    expect(mail.sent).toEqual([
      expect.objectContaining({
        to: user.email,
        subject: "Anmeldung mit Wiederherstellungscode",
        text: expect.stringContaining("noch 9 Wiederherstellungscodes"),
      }),
    ]);

    await expect(verify(user.id, first, at(2))).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await userRow(user.id)).recoveryCodeHashes).toHaveLength(9);

    await expect(verify(user.id, second, at(2))).resolves.toMatchObject({
      method: "recovery_code",
    });
    expect((await userRow(user.id)).recoveryCodeHashes).toHaveLength(8);
  });

  it("gleichzeitiges Einlösen desselben Codes gelingt genau einmal", async () => {
    const { user, recoveryCodes } = await enrolledUser();
    const code = recoveryCodes[0]!;

    const results = await Promise.all(
      Array.from({ length: 4 }, () => outcome(verify(user.id, code, at(1)))),
    );
    expect(results.filter((result) => result === "ok")).toHaveLength(1);
    expect(results.filter((result) => result === "VALIDATION")).toHaveLength(3);
    expect((await userRow(user.id)).recoveryCodeHashes).toHaveLength(9);
    expect(await auditCount(user.id, "auth.2fa_recovery_used")).toBe(1);
    expect(await auditCount(user.id, "auth.login")).toBe(1);
  });

  it("ein Code gilt nur für das eigene Konto", async () => {
    const alice = await enrolledUser();
    const bob = await enrolledUser();
    await expect(verify(bob.user.id, alice.recoveryCodes[0]!, at(1))).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect((await userRow(alice.user.id)).recoveryCodeHashes).toHaveLength(10);
    expect((await userRow(bob.user.id)).recoveryCodeHashes).toHaveLength(10);
  });
});

describe("Sperre nach Fehlversuchen", () => {
  it("nach 5 falschen Codes ist die Anmeldung gesperrt – auch für richtige Codes", async () => {
    const { user, secret, recoveryCodes } = await enrolledUser();
    const wrong = wrongCodeAt(secret, at(1));

    for (let attempt = 1; attempt <= 4; attempt++) {
      await expect(verify(user.id, wrong, at(1))).rejects.toMatchObject({ code: "VALIDATION" });
    }
    const fifth = await verify(user.id, wrong, at(1)).catch((error: unknown) => error);
    expect(fifth).toMatchObject({
      code: "RATE_LIMITED",
      message: expect.stringContaining("Zu viele falsche Codes"),
    });
    const retryAfter = (fifth as { retryAfterSeconds: number }).retryAfterSeconds;
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(15 * 60);
    expect(await auditCount(user.id, "auth.2fa_locked")).toBe(1);
    expect(mail.sent).toEqual([
      expect.objectContaining({
        to: user.email,
        subject: "Mehrere falsche Codes bei der Anmeldung",
      }),
    ]);

    // Gesperrt: auch der richtige Code und ein Wiederherstellungscode werden nicht geprüft – und nicht verbraucht.
    await expect(verify(user.id, codeAt(secret, at(2)), at(2))).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    await expect(verify(user.id, recoveryCodes[0]!, at(2))).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    const row = await userRow(user.id);
    expect(row.totpLastStep).toBe(stepOf(T0));
    expect(row.recoveryCodeHashes).toHaveLength(10);
    expect(row.lastLoginAt).toBeNull();

    // Weitere Fehlversuche lösen keine weiteren Warnungen aus.
    await expect(verify(user.id, wrong, at(2))).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(await auditCount(user.id, "auth.2fa_locked")).toBe(1);
    expect(mail.sent).toHaveLength(1);

    // Andere Konten sind nicht betroffen.
    const other = await enrolledUser();
    await expect(verify(other.user.id, codeAt(other.secret, at(2)), at(2))).resolves.toMatchObject({
      method: "totp",
    });
  });

  it("nur Fehlversuche zählen: ein Erfolg leert den 15-Minuten-Zähler, der Tageszähler läuft weiter", async () => {
    const { user, secret } = await enrolledUser();
    for (let attempt = 1; attempt <= 4; attempt++) {
      await expect(verify(user.id, wrongCodeAt(secret, at(1)), at(1))).rejects.toMatchObject({
        code: "VALIDATION",
      });
    }
    await expect(verify(user.id, codeAt(secret, at(1)), at(1))).resolves.toMatchObject({
      method: "totp",
    });
    expect(await bucketCount(`2fa:acct:${user.id}`)).toBeNull();
    expect(await bucketCount(`2fa:acct-day:${user.id}`)).toBe(4);
    for (let attempt = 1; attempt <= 4; attempt++) {
      await expect(verify(user.id, wrongCodeAt(secret, at(2)), at(2))).rejects.toMatchObject({
        code: "VALIDATION",
      });
    }
    await expect(verify(user.id, codeAt(secret, at(2)), at(2))).resolves.toMatchObject({
      method: "totp",
    });
    expect(await auditCount(user.id, "auth.2fa_locked")).toBe(0);
    // Das 15-Minuten-Fenster beginnt nach jedem Erfolg von vorn …
    expect(await bucketCount(`2fa:acct:${user.id}`)).toBeNull();
    // … der Tag und die IP behalten ihre 8 Fehlversuche; die beiden Erfolge zählen dort nicht mit.
    expect(await bucketCount(`2fa:acct-day:${user.id}`)).toBe(8);
    expect(await bucketCount(`2fa:ip:${meta.ip}`)).toBe(8);
  });

  it("höchstens 20 falsche Codes am Tag – auch verteilt über mehrere 15-Minuten-Fenster und von wechselnden IPs", async () => {
    const { user, secret, recoveryCodes } = await enrolledUser();
    // Jeder Versuch von einer anderen IP: Die IP-Grenze greift nie, nur die Grenzen des Kontos.
    let ipCount = 0;
    const nextIp = () => ({ ip: `198.51.100.${++ipCount}`, ipPrefix: "198.51.100.0" });
    const attempt = (code: string, time: Date) => verifyFrom(nextIp(), user.id, code, time);

    // 5 Runden zu je 4 Fehlversuchen, eine Runde alle 20 Minuten. Nach jeder Runde ist das 15-Minuten-Fenster vorbei.
    for (let round = 0; round < 5; round++) {
      const time = at(round * 40);
      for (let failure = 1; failure <= 4; failure++) {
        const result = await outcome(attempt(wrongCodeAt(secret, time), time));
        // Erst der 20. Fehlversuch des Tages sperrt.
        expect(result).toBe(round === 4 && failure === 4 ? "RATE_LIMITED" : "VALIDATION");
      }
      // Zwischendurch meldet sich die Person selbst an: Der Tageszähler bleibt trotzdem stehen.
      if (round === 1) {
        await expect(attempt(codeAt(secret, time), time)).resolves.toMatchObject({
          method: "totp",
        });
        expect(await bucketCount(`2fa:acct-day:${user.id}`)).toBe(8);
      }
      if (round < 4) await expireBucket(`2fa:acct:${user.id}`);
    }
    expect(await bucketCount(`2fa:acct-day:${user.id}`)).toBe(20);
    // Nicht das 15-Minuten-Fenster hat gesperrt (dort stehen erst 4), sondern der Tag.
    expect(await bucketCount(`2fa:acct:${user.id}`)).toBe(4);
    expect(await auditCount(user.id, "auth.2fa_locked")).toBe(1);
    expect(mail.sent).toEqual([
      expect.objectContaining({ subject: "Mehrere falsche Codes bei der Anmeldung" }),
    ]);

    // Gesperrt für Stunden: auch der richtige Code und ein Wiederherstellungscode – sie werden nicht verbraucht.
    const later = at(5 * 40);
    const blocked = await attempt(codeAt(secret, later), later).catch((error: unknown) => error);
    expect(blocked).toMatchObject({
      code: "RATE_LIMITED",
      message: expect.stringContaining("Stunden"),
    });
    expect((blocked as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(15 * 60);
    await expect(attempt(recoveryCodes[0]!, later)).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    const row = await userRow(user.id);
    expect(row.totpLastStep).toBe(stepOf(at(40)));
    expect(row.recoveryCodeHashes).toHaveLength(10);
    expect(await auditCount(user.id, "auth.2fa_locked")).toBe(1);
  });

  it("30 falsche Codes von einer IP – verteilt auf viele Konten – sperren die IP, auch für den richtigen Code eines anderen Kontos", async () => {
    const from = { ip: "203.0.113.77", ipPrefix: "203.0.113.0" };
    // 8 Konten, je höchstens 4 Fehlversuche: Keines erreicht seine eigene Grenze, zusammen sind es 30.
    const accounts = [];
    for (let index = 0; index < 8; index++) accounts.push(await enrolledUser());
    let failures = 0;
    for (const account of accounts) {
      for (let attempt = 1; attempt <= 4 && failures < 30; attempt++) {
        await expect(
          verifyFrom(from, account.user.id, wrongCodeAt(account.secret, at(1)), at(1)),
        ).rejects.toMatchObject({ code: "VALIDATION" });
        failures += 1;
      }
    }
    expect(failures).toBe(30);
    expect(await auditCount(accounts[0]!.user.id, "auth.2fa_locked")).toBe(0);

    // Der 31. Versuch von dieser IP: der richtige Code eines weiteren Kontos – trotzdem gesperrt, ohne Prüfung.
    const other = await enrolledUser();
    const blocked = await verifyFrom(from, other.user.id, codeAt(other.secret, at(1)), at(1)).catch(
      (error: unknown) => error,
    );
    expect(blocked).toMatchObject({ code: "RATE_LIMITED" });
    expect((blocked as { retryAfterSeconds: number }).retryAfterSeconds).toBeLessThanOrEqual(
      15 * 60,
    );
    // Der Code ist nicht verbraucht, die Zähler des Kontos sind unberührt, niemand wird gewarnt.
    expect((await userRow(other.user.id)).totpLastStep).toBe(stepOf(T0));
    expect(await bucketCount(`2fa:acct:${other.user.id}`)).toBeNull();
    expect(await bucketCount(`2fa:acct-day:${other.user.id}`)).toBeNull();
    expect(await auditCount(other.user.id, "auth.2fa_locked")).toBe(0);
    expect(mail.sent).toEqual([]);

    // Von einer anderen IP aus klappt derselbe Code.
    await expect(
      verifyFrom(
        { ip: "203.0.113.78", ipPrefix: "203.0.113.0" },
        other.user.id,
        codeAt(other.secret, at(1)),
        at(1),
      ),
    ).resolves.toMatchObject({ method: "totp" });
  });

  it("gleichzeitig eingereicht: höchstens 5 Codes werden geprüft – danach ist auch der richtige gesperrt", async () => {
    const { user, secret, recoveryCodes } = await enrolledUser();
    const wrong = wrongCodeAt(secret, at(1));

    // 20 falsche Codes auf einmal (z. B. 20 parallele Anfragen mit demselben Zwischenschritt-Cookie).
    const results = await Promise.all(
      Array.from({ length: 20 }, () => outcome(verify(user.id, wrong, at(1)))),
    );
    // Jeder Versuch wird vor der Prüfung gezählt: 4 werden geprüft und abgelehnt, der 5. sperrt, die übrigen 15 werden
    // gar nicht erst geprüft.
    expect(results.filter((result) => result === "VALIDATION")).toHaveLength(4);
    expect(results.filter((result) => result === "RATE_LIMITED")).toHaveLength(16);
    // Bis zum Tageszähler kamen nur die 5 durchgelassenen Versuche.
    expect(await bucketCount(`2fa:acct-day:${user.id}`)).toBe(5);
    // Gewarnt wird genau einmal.
    expect(await auditCount(user.id, "auth.2fa_locked")).toBe(1);
    expect(mail.sent).toHaveLength(1);

    await expect(verify(user.id, codeAt(secret, at(2)), at(2))).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    await expect(verify(user.id, recoveryCodes[0]!, at(2))).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    const row = await userRow(user.id);
    expect(row.totpLastStep).toBe(stepOf(T0));
    expect(row.recoveryCodeHashes).toHaveLength(10);
    expect(row.lastLoginAt).toBeNull();
  });

  it("gleichzeitige falsche Passwörter oder Codes beim Ausschalten: höchstens 10 Prüfungen", async () => {
    const { user, secret } = await enrolledUser();
    const results = await Promise.all(
      Array.from({ length: 15 }, () =>
        outcome(
          disableTwoFactor(
            { userId: user.id, password: PASSWORD, code: wrongCodeAt(secret, at(1)) },
            meta,
            at(1),
          ),
        ),
      ),
    );
    expect(results.filter((result) => result === "VALIDATION")).toHaveLength(10);
    expect(results.filter((result) => result === "RATE_LIMITED")).toHaveLength(5);
    await expect(
      disableTwoFactor(
        { userId: user.id, password: PASSWORD, code: codeAt(secret, at(1)) },
        meta,
        at(1),
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect((await userRow(user.id)).totpEnabledAt).toEqual(T0);
  });
});

describe("Ausschalten und neue Wiederherstellungscodes", () => {
  it("Ausschalten verlangt Passwort UND Code", async () => {
    const club = await createClub("Ausschaltverein");
    const { user, secret } = await enrolledUser();
    await addUserToClub(club, "MEMBER", { user });
    const code = codeAt(secret, at(1));

    // Falsches Passwort: Der Code wird dabei nicht verbraucht.
    await expect(
      disableTwoFactor({ userId: user.id, password: "falsch-falsch-falsch", code }, meta, at(1)),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { password: [expect.any(String)] },
    });
    expect((await userRow(user.id)).totpLastStep).toBe(stepOf(T0));

    await expect(
      disableTwoFactor(
        { userId: user.id, password: PASSWORD, code: wrongCodeAt(secret, at(1)) },
        meta,
        at(1),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { code: [expect.any(String)] } });
    expect((await userRow(user.id)).totpEnabledAt).toEqual(T0);
    expect(await auditCount(user.id, "auth.2fa_disabled")).toBe(0);

    await disableTwoFactor({ userId: user.id, password: PASSWORD, code }, meta, at(1));
    expect(await userRow(user.id)).toMatchObject({
      totpSecretEnc: null,
      totpEnabledAt: null,
      totpLastStep: null,
      recoveryCodeHashes: [],
    });
    expect(await auditCount(user.id, "auth.2fa_disabled")).toBe(1);
    expect(mail.sent).toEqual([
      expect.objectContaining({ to: user.email, subject: "Zwei-Faktor-Anmeldung ausgeschaltet" }),
    ]);
    expect(await authenticate({ email: user.email, password: PASSWORD }, meta)).toEqual({
      userId: user.id,
      isPlatformAdmin: false,
      activeClubId: club.id,
    });
  });

  it("ein bereits benutzter Code schaltet nicht aus", async () => {
    const { user, secret } = await enrolledUser();
    const code = codeAt(secret, at(1));
    await verify(user.id, code, at(1));

    await expect(
      disableTwoFactor({ userId: user.id, password: PASSWORD, code }, meta, at(1)),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { code: [expect.any(String)] } });
    expect((await userRow(user.id)).totpEnabledAt).toEqual(T0);
  });

  it("nach 10 Fehlversuchen beim Ausschalten ist vorerst Schluss – auch mit richtigem Code", async () => {
    const { user, secret } = await enrolledUser();
    for (let attempt = 1; attempt <= 10; attempt++) {
      await expect(
        disableTwoFactor(
          { userId: user.id, password: PASSWORD, code: wrongCodeAt(secret, at(1)) },
          meta,
          at(1),
        ),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    }
    await expect(
      disableTwoFactor(
        { userId: user.id, password: PASSWORD, code: codeAt(secret, at(1)) },
        meta,
        at(1),
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(await userRow(user.id)).toMatchObject({ totpEnabledAt: T0, totpLastStep: stepOf(T0) });
  });

  it("höchstens 20 Fehlversuche am Tag beim Ausschalten und bei neuen Codes – auch verteilt über mehrere 15-Minuten-Fenster", async () => {
    const { user, secret } = await enrolledUser();
    const day = `2fa-manage-day:${user.id}`;
    const failDisable = (time: Date) =>
      disableTwoFactor(
        { userId: user.id, password: PASSWORD, code: wrongCodeAt(secret, time) },
        meta,
        time,
      );
    const failRenew = (time: Date) =>
      renewRecoveryCodes(
        { userId: user.id, password: "falsch-falsch-falsch", code: codeAt(secret, time) },
        meta,
        time,
      );

    // Das Einschalten selbst zählt nicht.
    expect(await bucketCount(day)).toBe(0);

    for (let attempt = 1; attempt <= 9; attempt++) {
      await expect(failDisable(at(1))).rejects.toMatchObject({ code: "VALIDATION" });
    }
    // Ein Erfolg leert das 15-Minuten-Fenster, nicht den Tag (und zählt dort selbst nicht mit).
    await renewRecoveryCodes(
      { userId: user.id, password: PASSWORD, code: codeAt(secret, at(1)) },
      meta,
      at(1),
    );
    expect(await bucketCount(`2fa-manage:${user.id}`)).toBeNull();
    expect(await bucketCount(day)).toBe(9);

    // 40 Minuten später: weitere 9 (falsches Passwort), dann ist auch dieses 15-Minuten-Fenster vorbei.
    for (let attempt = 1; attempt <= 9; attempt++) {
      await expect(failRenew(at(80))).rejects.toMatchObject({ code: "VALIDATION" });
    }
    await expireBucket(`2fa-manage:${user.id}`);
    for (let attempt = 1; attempt <= 2; attempt++) {
      await expect(failDisable(at(160))).rejects.toMatchObject({ code: "VALIDATION" });
    }
    expect(await bucketCount(day)).toBe(20);

    // Der 21. Versuch des Tages – mit richtigem Passwort und Code – wird nicht mehr geprüft.
    const blocked = await disableTwoFactor(
      { userId: user.id, password: PASSWORD, code: codeAt(secret, at(161)) },
      meta,
      at(161),
    ).catch((error: unknown) => error);
    expect(blocked).toMatchObject({ code: "RATE_LIMITED" });
    expect((blocked as { retryAfterSeconds: number }).retryAfterSeconds).toBeGreaterThan(15 * 60);
    expect(await userRow(user.id)).toMatchObject({
      totpEnabledAt: T0,
      totpLastStep: stepOf(at(1)),
    });
    expect(await auditCount(user.id, "auth.2fa_disabled")).toBe(0);
  });

  it("neue Wiederherstellungscodes: die alten gelten nicht mehr, die neuen schon", async () => {
    const { user, secret, recoveryCodes } = await enrolledUser();
    const before = (await userRow(user.id)).recoveryCodeHashes;

    await expect(
      renewRecoveryCodes(
        { userId: user.id, password: "falsch-falsch-falsch", code: codeAt(secret, at(1)) },
        meta,
        at(1),
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { password: [expect.any(String)] },
    });
    await expect(
      renewRecoveryCodes(
        { userId: user.id, password: PASSWORD, code: wrongCodeAt(secret, at(1)) },
        meta,
        at(1),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { code: [expect.any(String)] } });
    expect((await userRow(user.id)).recoveryCodeHashes).toEqual(before);

    // Mit Passwort und einem Wiederherstellungscode (das Handy ist z. B. gerade nicht zur Hand).
    const renewed = await renewRecoveryCodes(
      { userId: user.id, password: PASSWORD, code: recoveryCodes[0]! },
      meta,
      at(1),
    );
    expect(renewed).toHaveLength(10);
    for (const code of renewed) expect(code).toMatch(RECOVERY_CODE);
    expect(renewed.filter((code) => recoveryCodes.includes(code))).toEqual([]);
    const after = (await userRow(user.id)).recoveryCodeHashes;
    expect(after).toHaveLength(10);
    expect(after.filter((hash) => before.includes(hash))).toEqual([]);
    expect(await auditCount(user.id, "auth.2fa_recovery_renewed")).toBe(1);
    expect(mail.sent).toEqual([
      expect.objectContaining({ to: user.email, subject: "Neue Wiederherstellungscodes erstellt" }),
    ]);

    await expect(verify(user.id, recoveryCodes[1]!, at(2))).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(verify(user.id, renewed[0]!, at(2))).resolves.toMatchObject({
      method: "recovery_code",
    });
  });
});

describe("Zurücksetzen durch den Verein", () => {
  type TestClub = Club & { roleIds: Record<string, string> };

  /** Eigene Rolle mit genau den angegebenen Rechten (Reichweite Verein). */
  async function userWithCustomRole(club: TestClub, name: string, keys: PermissionKey[]) {
    const role = await prisma.role.create({
      data: { clubId: club.id, key: `custom:${name}`, name },
    });
    await prisma.rolePermission.createMany({
      data: keys.map((permissionKey) => ({
        clubId: club.id,
        roleId: role.id,
        permissionKey,
        scope: "CLUB" as const,
      })),
    });
    return addUserToClub({ ...club, roleIds: { ...club.roleIds, [name]: role.id } }, name as never);
  }

  async function setup() {
    const clubA = await createClub("Rücksetzverein A");
    const clubB = await createClub("Rücksetzverein B");
    const admin = await addUserToClub(clubA, "CLUB_ADMIN", {
      firstName: "Anna",
      lastName: "Admin",
    });
    const adminB = await addUserToClub(clubB, "CLUB_ADMIN", { firstName: "Bernd", lastName: "B" });
    const targetUser = await enrolledUser({ firstName: "Tom", lastName: "Telefonlos" });
    const target = await addUserToClub(clubA, "MEMBER", { user: targetUser.user });
    const sessionInput = { activeClubId: clubA.id, userAgent: "vitest", ipPrefix: null };
    await createSessionRecord({ userId: target.user.id, ...sessionInput });
    await createSessionRecord({ userId: target.user.id, ...sessionInput });
    await createSessionRecord({ userId: admin.user.id, ...sessionInput });
    return {
      clubA,
      clubB,
      admin,
      adminB,
      target,
      ctxA: await contextFor(admin.user.id, clubA.id),
      ctxB: await contextFor(adminB.user.id, clubB.id),
    };
  }

  const resetAudits = (entityId: string) =>
    prisma.auditLog.count({ where: { action: "user.2fa_reset", entityId } });

  const stillEnabled = async (userId: string, sessions: number) => {
    expect((await userRow(userId)).totpEnabledAt).toEqual(T0);
    expect(await sessionsOf(userId)).toBe(sessions);
  };

  it("ein anderer Verein findet die Person nicht", async () => {
    const { ctxB, target } = await setup();
    await expect(resetUserTwoFactor(ctxB, target.membershipId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await stillEnabled(target.user.id, 2);
    expect(await resetAudits(target.membershipId)).toBe(0);
  });

  it("ist die Person auch in einem zweiten Verein oder Plattform-Administrator, darf es nur der Betreiber", async () => {
    const { clubA, clubB, ctxA, target } = await setup();
    await addUserToClub(clubB, "MEMBER", { user: target.user });
    await expect(resetUserTwoFactor(ctxA, target.membershipId)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("nur der Betreiber"),
    });
    await stillEnabled(target.user.id, 2);

    const platformAdmin = await enrolledUser({ isPlatformAdmin: true });
    const membership = await addUserToClub(clubA, "MEMBER", { user: platformAdmin.user });
    await expect(resetUserTwoFactor(ctxA, membership.membershipId)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("nur der Betreiber"),
    });
    await stillEnabled(platformAdmin.user.id, 0);
    expect(await resetAudits(target.membershipId)).toBe(0);
    expect(await resetAudits(membership.membershipId)).toBe(0);
  });

  it("ohne eingerichtete Zwei-Faktor-Anmeldung verrät die Meldung nicht, ob die Person auch woanders ist", async () => {
    const { clubA, clubB, ctxA } = await setup();
    // Auch in Verein B – aber ohne Zwei-Faktor: dieselbe Meldung wie bei jeder Person ohne Zwei-Faktor.
    const elsewhere = await addUserToClub(clubA, "MEMBER", {
      firstName: "Paula",
      lastName: "Plan",
    });
    await addUserToClub(clubB, "MEMBER", { user: elsewhere.user });
    const local = await addUserToClub(clubA, "MEMBER", { firstName: "Lars", lastName: "Lokal" });
    const platform = await createUser({ isPlatformAdmin: true, firstName: "Pia", lastName: "P" });
    const platformMember = await addUserToClub(clubA, "MEMBER", { user: platform });

    for (const membershipId of [
      elsewhere.membershipId,
      platformMember.membershipId,
      local.membershipId,
    ]) {
      const error = await resetUserTwoFactor(ctxA, membershipId).catch((e: unknown) => e);
      expect(error).toMatchObject({
        code: "BAD_REQUEST",
        message: expect.stringContaining("hat keine Zwei-Faktor-Anmeldung eingerichtet"),
      });
      expect((error as Error).message).not.toContain("Betreiber");
      expect(await resetAudits(membershipId)).toBe(0);
    }
  });

  it("nicht das eigene Konto, keine Person mit mehr Rechten, nur mit Benutzerverwaltung", async () => {
    const { clubA, ctxA, admin, target } = await setup();
    await enrol(admin.user); // meldet die übrigen Geräte des Administrators ab
    await expect(resetUserTwoFactor(ctxA, admin.membershipId)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("eigene"),
    });
    await stillEnabled(admin.user.id, 0);

    // Darf Benutzer verwalten, hat aber weniger Rechte als ein Vereinsadministrator.
    const helper = await userWithCustomRole(clubA, "Zugangshelfer", ["users:read", "users:manage"]);
    const helperCtx = await contextFor(helper.user.id, clubA.id);
    await expect(resetUserTwoFactor(helperCtx, admin.membershipId)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringContaining("mehr Rechte"),
    });
    await stillEnabled(admin.user.id, 0);

    // Vorstand ohne `users:manage`.
    const board = await addUserToClub(clubA, "BOARD");
    await expect(
      resetUserTwoFactor(await contextFor(board.user.id, clubA.id), target.membershipId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await stillEnabled(target.user.id, 2);
    expect(await resetAudits(admin.membershipId)).toBe(0);
    expect(await resetAudits(target.membershipId)).toBe(0);
  });

  it("setzt zurück, beendet alle Sitzungen der Person und protokolliert im Verein", async () => {
    const { clubA, clubB, ctxA, admin, target } = await setup();

    await resetUserTwoFactor(ctxA, target.membershipId);

    expect(await userRow(target.user.id)).toMatchObject({
      totpSecretEnc: null,
      totpEnabledAt: null,
      totpLastStep: null,
      recoveryCodeHashes: [],
    });
    expect(await sessionsOf(target.user.id)).toBe(0);
    expect(await sessionsOf(admin.user.id)).toBe(1);

    expect(await resetAudits(target.membershipId)).toBe(1);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "user.2fa_reset", entityId: target.membershipId },
    });
    expect(audit).toMatchObject({
      clubId: clubA.id,
      actorUserId: admin.user.id,
      actorType: "USER",
      entityType: "ClubMembership",
      entityId: target.membershipId,
      summary: "Zwei-Faktor-Anmeldung von Tom Telefonlos zurückgesetzt (2 Geräte abgemeldet)",
    });
    expect(
      await prisma.auditLog.count({ where: { clubId: clubB.id, action: "user.2fa_reset" } }),
    ).toBe(0);
    expect(mail.sent).toEqual([
      expect.objectContaining({
        to: target.user.email,
        subject: "Zwei-Faktor-Anmeldung zurückgesetzt",
        text: expect.stringContaining("Anna Admin (Rücksetzverein A)"),
      }),
    ]);

    // Danach genügt wieder das Passwort; ein zweites Zurücksetzen hat nichts mehr zu tun.
    expect(await authenticate({ email: target.user.email, password: PASSWORD }, meta)).toEqual({
      userId: target.user.id,
      isPlatformAdmin: false,
      activeClubId: clubA.id,
    });
    await expect(resetUserTwoFactor(ctxA, target.membershipId)).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("Zurücksetzen, Abmelden und Protokoll gelingen nur zusammen – scheitert das Protokoll, bleibt alles beim Alten", async () => {
    const { clubA, admin, target } = await setup();
    const before = await userRow(target.user.id);

    await expect(
      resetTwoFactor(target.user.id, {
        by: "Anna Admin (Rücksetzverein A)",
        audit: () => {
          throw new Error("Protokoll nicht schreibbar");
        },
      }),
    ).rejects.toThrow("Protokoll nicht schreibbar");

    // Nichts davon ist festgeschrieben: weiterhin eingeschaltet, mit Codes und angemeldeten Geräten; keine E-Mail.
    expect(await userRow(target.user.id)).toMatchObject({
      totpSecretEnc: before.totpSecretEnc,
      totpEnabledAt: T0,
      totpLastStep: before.totpLastStep,
      recoveryCodeHashes: before.recoveryCodeHashes,
    });
    expect(await sessionsOf(target.user.id)).toBe(2);
    expect(await resetAudits(target.membershipId)).toBe(0);
    expect(mail.sent).toEqual([]);

    // Gelingt es, steht alles zugleich fest: Felder leer, Geräte abgemeldet, Eintrag im Vereinsprotokoll.
    const ctxA = await contextFor(admin.user.id, clubA.id);
    await resetUserTwoFactor(ctxA, target.membershipId);
    expect(await userRow(target.user.id)).toMatchObject({
      totpSecretEnc: null,
      totpEnabledAt: null,
      totpLastStep: null,
      recoveryCodeHashes: [],
    });
    expect(await sessionsOf(target.user.id)).toBe(0);
    expect(
      await prisma.auditLog.findMany({
        where: { action: "user.2fa_reset", entityId: target.membershipId },
        select: { clubId: true, actorUserId: true, summary: true },
      }),
    ).toEqual([
      {
        clubId: clubA.id,
        actorUserId: admin.user.id,
        summary: "Zwei-Faktor-Anmeldung von Tom Telefonlos zurückgesetzt (2 Geräte abgemeldet)",
      },
    ]);
    expect(mail.sent).toHaveLength(1);
  });

  it("zweimal gleichzeitig zurückgesetzt: genau ein Mal – ein Protokolleintrag, eine E-Mail", async () => {
    const { clubA, ctxA, target } = await setup();
    const second = await addUserToClub(clubA, "CLUB_ADMIN", {
      firstName: "Zora",
      lastName: "Zweit",
    });
    const ctxSecond = await contextFor(second.user.id, clubA.id);

    const results = await Promise.all([
      outcome(resetUserTwoFactor(ctxA, target.membershipId)),
      outcome(resetUserTwoFactor(ctxSecond, target.membershipId)),
    ]);
    expect([...results].sort()).toEqual(["BAD_REQUEST", "ok"]);
    expect(await resetAudits(target.membershipId)).toBe(1);
    expect(mail.sent).toHaveLength(1);
    expect(await sessionsOf(target.user.id)).toBe(0);
  });

  it("der Betreiber setzt auch bei mehreren Vereinen zurück und protokolliert als System", async () => {
    const { clubB, target } = await setup();
    await addUserToClub(clubB, "MEMBER", { user: target.user });

    // Eine Sperre nach falschen Codes von früher endet mit dem Zurücksetzen.
    await prisma.rateLimitBucket.createMany({
      data: [`2fa:acct:${target.user.id}`, `2fa:acct-day:${target.user.id}`].map((key) => ({
        key,
        count: 99,
        resetAt: new Date(Date.now() + 86_400_000),
      })),
    });
    expect(await resetTwoFactorByOperator(`  ${target.user.email.toUpperCase()} `)).toEqual({
      changed: true,
      sessionsEnded: 2,
    });
    expect(await bucketCount(`2fa:acct:${target.user.id}`)).toBeNull();
    expect(await bucketCount(`2fa:acct-day:${target.user.id}`)).toBeNull();
    expect(await userRow(target.user.id)).toMatchObject({
      totpEnabledAt: null,
      totpSecretEnc: null,
    });
    expect(await sessionsOf(target.user.id)).toBe(0);
    expect(
      await prisma.auditLog.findFirstOrThrow({
        where: { action: "user.2fa_reset", entityId: target.user.id },
      }),
    ).toMatchObject({
      actorType: "SYSTEM",
      actorUserId: null,
      clubId: null,
      entityType: "User",
      entityId: target.user.id,
      summary: "Zwei-Faktor-Anmeldung durch den Betreiber zurückgesetzt",
    });
    expect(mail.sent).toEqual([
      expect.objectContaining({
        to: target.user.email,
        subject: "Zwei-Faktor-Anmeldung zurückgesetzt",
        text: expect.stringContaining("den Betreiber von VereinsFlow"),
      }),
    ]);

    expect(await resetTwoFactorByOperator(target.user.email)).toEqual({
      changed: false,
      sessionsEnded: 0,
    });
    // Nichts zu tun: kein zweiter Eintrag, keine zweite E-Mail.
    expect(
      await prisma.auditLog.count({
        where: { action: "user.2fa_reset", entityId: target.user.id },
      }),
    ).toBe(1);
    expect(mail.sent).toHaveLength(1);
  });
});
