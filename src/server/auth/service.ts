import "server-only";
import { getPasswordIssues } from "@/lib/password-policy";
import { recordSystemAudit } from "@/server/audit/audit";
import { prisma } from "@/server/db/client";
import { env } from "@/server/env";
import { badRequest, unauthenticated, validationFailed } from "@/server/errors";
import { sendMailDeferred } from "@/server/mail";
import { passwordChangedEmail, passwordResetEmail } from "@/server/mail/templates";
import {
  assertNotRateLimited,
  checkRateLimit,
  enforceRateLimit,
  rateLimitIp,
  rateLimitSubject,
  resetRateLimit,
} from "@/server/security/rate-limit";
import { hmacSha256 } from "@/server/security/secret-box";
import { generateToken, hashToken } from "@/server/security/tokens";
import { burnPasswordCheck, hashPassword, verifyPassword } from "./password";

/**
 * Authentifizierungs-Dienst (ohne Next.js-Abhängigkeiten – Cookies setzen die Server Actions).
 *
 * Schutzmaßnahmen:
 *  - Fehlversuche werden pro Konto UND pro IP begrenzt (nur Fehlversuche zählen).
 *  - Gleiche Fehlermeldung und Antwortzeit für "unbekannte E-Mail" und "falsches Passwort".
 *  - Passwort-Reset verrät nie, ob ein Konto existiert.
 *  - Tokens sind zufällig, einmalig verwendbar, laufen ab und liegen nur als Hash in der Datenbank.
 *  - Mit Zwei-Faktor-Anmeldung entsteht die Sitzung erst nach dem Code aus der App (`two-factor.ts`). Ein Passwort-Reset
 *    schaltet die Zwei-Faktor-Anmeldung NICHT ab – wer nur die E-Mail-Adresse kontrolliert, kommt so nicht ins Konto.
 */

export interface ClientMeta {
  /** Vollständige IP oder "unknown" (wenn dem Proxy-Header nicht vertraut wird). */
  ip: string;
  ipPrefix: string | null;
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const LOGIN_WINDOW_SECONDS = 15 * 60;
const LOGIN_ACCOUNT_FAILURES = 8;
const LOGIN_IP_FAILURES = 30;
export const PASSWORD_RESET_TTL_MINUTES = 60;

const invalidCredentials = () => unauthenticated("E-Mail-Adresse oder Passwort ist falsch.");
const invalidResetLink = () =>
  badRequest("Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.");

const hasKnownIp = (meta: ClientMeta) => meta.ip !== "unknown";

export interface AuthenticatedUser {
  userId: string;
  isPlatformAdmin: boolean;
  /** Verein, in dem die Sitzung startet (erster aktiver Verein) – oder `null`. */
  activeClubId: string | null;
}

/** Passwort war richtig, es fehlt noch der Code aus der Authenticator-App (siehe `two-factor.ts`). */
export interface SecondFactorRequired {
  secondFactor: "required";
  userId: string;
  /** Fingerabdruck des aktuellen Passworts – der zweite Schritt gilt nur, solange es dasselbe ist. */
  passwordFingerprint: string;
  // Noch nicht angemeldet: kein Startverein, keine Rechte (`never`, damit beide Varianten dieselben Felder kennen).
  isPlatformAdmin?: never;
  activeClubId?: never;
}

/** Ergebnis der Passwortprüfung: fertig angemeldet (ohne Zwei-Faktor) oder zweiter Schritt nötig. */
export type AuthenticateResult = AuthenticatedUser | SecondFactorRequired;

export const needsSecondFactor = (result: AuthenticateResult): result is SecondFactorRequired =>
  "secondFactor" in result;

/**
 * Fingerabdruck des Passwort-Hashs für den Zwischenschritt der Anmeldung (Cookie): HMAC mit dem eigenen Schlüssel, gekürzt.
 * Jedes neue Passwort hat einen neuen Hash (eigenes Salz) und damit einen neuen Fingerabdruck – so endet eine offene
 * Code-Eingabe mit dem Passwortwechsel oder -reset, ohne dafür etwas in der Datenbank zu speichern.
 */
export const passwordFingerprint = (passwordHash: string): string =>
  hmacSha256(`login-challenge:${passwordHash}`).slice(0, 32);

export type LoginMethod = "password" | "totp" | "recovery_code";

const LOGIN_SUMMARY: Record<LoginMethod, string> = {
  password: "Anmeldung",
  totp: "Anmeldung mit Zwei-Faktor",
  recovery_code: "Anmeldung mit Zwei-Faktor (Wiederherstellungscode)",
};

/**
 * Prüft E-Mail und Passwort. Legt KEINE Sitzung an (das übernimmt die Server Action).
 * Ist die Zwei-Faktor-Anmeldung eingeschaltet, endet hier nur der erste Schritt: keine letzte Anmeldung, kein Protokoll –
 * beides folgt erst nach dem richtigen Code (`verifySecondFactor`). Eine angefangene, nicht bestätigte Einrichtung zählt nicht.
 */
export async function authenticate(
  input: { email: string; password: string },
  meta: ClientMeta,
): Promise<AuthenticateResult> {
  const email = normalizeEmail(input.email);
  const accountKey = `login:acct:${rateLimitSubject(email)}`;
  const ipKey = `login:ip:${rateLimitIp(meta.ip)}`;

  await assertNotRateLimited(accountKey, LOGIN_ACCOUNT_FAILURES);
  if (hasKnownIp(meta)) await assertNotRateLimited(ipKey, LOGIN_IP_FAILURES);

  const user = await prisma.user.findUnique({ where: { email } });
  const usable = user !== null && user.disabledAt === null && user.deletedAt === null;

  const passwordOk = usable ? await verifyPassword(user.passwordHash, input.password) : false;
  if (!usable) await burnPasswordCheck(input.password);

  if (!usable || !passwordOk) {
    await checkRateLimit(accountKey, LOGIN_ACCOUNT_FAILURES, LOGIN_WINDOW_SECONDS);
    if (hasKnownIp(meta)) await checkRateLimit(ipKey, LOGIN_IP_FAILURES, LOGIN_WINDOW_SECONDS);
    throw invalidCredentials();
  }

  // Erst NACH korrekten Zugangsdaten auf die Bestätigung hinweisen – sonst ließe sich prüfen, ob ein Konto existiert.
  if (!user.emailVerifiedAt) {
    throw unauthenticated(
      "Bitte bestätige zuerst deine E-Mail-Adresse. Den Link findest du in der Einladungs-E-Mail.",
    );
  }

  await resetRateLimit(accountKey);

  if (user.totpEnabledAt !== null && user.totpSecretEnc !== null) {
    return {
      secondFactor: "required",
      userId: user.id,
      passwordFingerprint: passwordFingerprint(user.passwordHash),
    };
  }
  return finishLogin(user, meta, "password");
}

/**
 * Letzter Schritt jeder erfolgreichen Anmeldung: Startverein bestimmen, „letzte Anmeldung“ setzen, protokollieren.
 * Die Sitzung legt danach die Server Action an.
 */
export async function finishLogin(
  user: { id: string; isPlatformAdmin: boolean },
  meta: ClientMeta,
  method: LoginMethod,
): Promise<AuthenticatedUser> {
  const membership = await prisma.clubMembership.findFirst({
    where: { userId: user.id, status: "ACTIVE", club: { status: "ACTIVE" } },
    orderBy: { joinedAt: "asc" },
    select: { clubId: true },
  });

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await recordSystemAudit({
    clubId: membership?.clubId ?? null,
    actorUserId: user.id,
    action: "auth.login",
    entityType: "User",
    entityId: user.id,
    summary: LOGIN_SUMMARY[method],
    ipPrefix: meta.ipPrefix,
  });

  return {
    userId: user.id,
    isPlatformAdmin: user.isPlatformAdmin,
    activeClubId: membership?.clubId ?? null,
  };
}

/**
 * Fordert einen Passwort-Reset an. Gibt IMMER dasselbe (nichts) zurück – egal ob es die Adresse gibt –
 * damit sich Konten nicht durch Ausprobieren ermitteln lassen.
 */
export async function requestPasswordReset(emailInput: string, meta: ClientMeta): Promise<void> {
  const email = normalizeEmail(emailInput);
  await enforceRateLimit(`reset:acct:${rateLimitSubject(email)}`, 3, 60 * 60);
  if (hasKnownIp(meta)) await enforceRateLimit(`reset:ip:${rateLimitIp(meta.ip)}`, 10, 60 * 60);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.disabledAt || user.deletedAt) return;

  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000);
  await prisma.$transaction([
    // Frühere, noch offene Links werden ungültig – es gibt immer nur einen gültigen.
    prisma.verificationToken.deleteMany({
      where: { userId: user.id, type: "PASSWORD_RESET", usedAt: null },
    }),
    prisma.verificationToken.create({
      data: { userId: user.id, type: "PASSWORD_RESET", tokenHash: hashToken(token), expiresAt },
    }),
  ]);

  const url = `${env.APP_URL}/passwort-zuruecksetzen?token=${token}`;
  await sendMailDeferred(
    passwordResetEmail({ to: user.email, url, validMinutes: PASSWORD_RESET_TTL_MINUTES }),
  );
}

/** Prüft, ob ein Reset-Token noch gültig ist (für die Anzeige der Seite). */
export async function isPasswordResetTokenValid(token: string): Promise<boolean> {
  if (!token) return false;
  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  return (
    !!record && record.type === "PASSWORD_RESET" && !record.usedAt && record.expiresAt > new Date()
  );
}

/** Setzt das Passwort mit einem Token aus der E-Mail zurück und meldet überall ab. */
export async function resetPassword(
  input: { token: string; password: string },
  meta: ClientMeta,
): Promise<void> {
  if (hasKnownIp(meta))
    await enforceRateLimit(`reset-submit:ip:${rateLimitIp(meta.ip)}`, 20, 60 * 60);

  const record = await prisma.verificationToken.findUnique({
    where: { tokenHash: hashToken(input.token) },
    include: { user: true },
  });
  const now = new Date();
  if (
    !record ||
    record.type !== "PASSWORD_RESET" ||
    record.usedAt ||
    record.expiresAt <= now ||
    record.user.deletedAt ||
    record.user.disabledAt
  ) {
    throw invalidResetLink();
  }

  const issues = getPasswordIssues(input.password, record.user);
  if (issues.length > 0) throw validationFailed({ password: issues });

  const passwordHash = await hashPassword(input.password);
  await prisma.$transaction(async (tx) => {
    // Das Token wird atomar "eingelöst": Bei gleichzeitigen Anfragen gewinnt genau eine.
    const claimed = await tx.verificationToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) throw invalidResetLink();

    await tx.user.update({
      where: { id: record.userId },
      // Wer den Link aus der E-Mail nutzen konnte, hat damit auch die Adresse bestätigt.
      data: { passwordHash, emailVerifiedAt: record.user.emailVerifiedAt ?? now },
    });
    await tx.verificationToken.updateMany({
      where: { userId: record.userId, type: "PASSWORD_RESET", usedAt: null },
      data: { usedAt: now },
    });
    await tx.session.deleteMany({ where: { userId: record.userId } });
  });

  await recordSystemAudit({
    actorUserId: record.userId,
    action: "auth.password_reset",
    entityType: "User",
    entityId: record.userId,
    summary: "Passwort über E-Mail-Link zurückgesetzt",
    ipPrefix: meta.ipPrefix,
  });
  await sendMailDeferred(passwordChangedEmail({ to: record.user.email }));
}

/** Ändert das Passwort des angemeldeten Benutzers (Profil). Andere Sitzungen werden beendet. */
export async function changePassword(
  input: { userId: string; currentPassword: string; newPassword: string; keepSessionId?: string },
  meta: ClientMeta,
): Promise<void> {
  await enforceRateLimit(`pwchange:user:${input.userId}`, 10, 60 * 60);

  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user || user.deletedAt || user.disabledAt) throw unauthenticated();

  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw validationFailed({ currentPassword: ["Das aktuelle Passwort ist nicht korrekt."] });
  }
  const issues = getPasswordIssues(input.newPassword, user);
  if (issues.length > 0) throw validationFailed({ newPassword: issues });
  if (input.currentPassword === input.newPassword) {
    throw validationFailed({
      newPassword: ["Das neue Passwort muss sich vom bisherigen unterscheiden."],
    });
  }

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.session.deleteMany({
      where: {
        userId: user.id,
        ...(input.keepSessionId ? { id: { not: input.keepSessionId } } : {}),
      },
    }),
  ]);

  await recordSystemAudit({
    actorUserId: user.id,
    action: "auth.password_changed",
    entityType: "User",
    entityId: user.id,
    summary: "Passwort geändert",
    ipPrefix: meta.ipPrefix,
  });
  await sendMailDeferred(passwordChangedEmail({ to: user.email }));
}
