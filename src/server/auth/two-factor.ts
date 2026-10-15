import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import { recordSystemAudit } from "@/server/audit/audit";
import { prisma } from "@/server/db/client";
import {
  AppError,
  badRequest,
  conflict,
  notFound,
  unauthenticated,
  validationFailed,
} from "@/server/errors";
import { logUnexpectedError } from "@/server/log";
import { sendMailDeferred } from "@/server/mail";
import {
  twoFactorDisabledEmail,
  twoFactorEnabledEmail,
  twoFactorLockedEmail,
  twoFactorRecoveryRenewedEmail,
  twoFactorRecoveryUsedEmail,
  twoFactorResetEmail,
} from "@/server/mail/templates";
import {
  checkRateLimit,
  enforceRateLimit,
  rateLimitIp,
  releaseRateLimit,
  resetRateLimit,
  type RateLimitResult,
} from "@/server/security/rate-limit";
import { openSecret, sealSecret } from "@/server/security/secret-box";
import { verifyPassword } from "./password";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  hashRecoveryCodes,
  normalizeRecoveryCode,
} from "./recovery-codes";
import {
  finishLogin,
  normalizeEmail,
  passwordFingerprint,
  type AuthenticatedUser,
  type ClientMeta,
  type LoginMethod,
} from "./service";
import { base32Decode, generateTotpSecret, matchTotpStep, otpauthUrl } from "./totp";

/**
 * Zwei-Faktor-Anmeldung (TOTP) – freiwillig, je Konto.
 *
 * Ablauf:
 *  - Einrichten (Profil): Das Geheimnis wird verschlüsselt gespeichert (`totpSecretEnc`, AES-256-GCM, an die Benutzer-ID
 *    gebunden), `totpEnabledAt` bleibt leer. Erst das Passwort UND der erste richtige Code schalten ein (eine kurz
 *    übernommene Sitzung allein reicht nicht, um die Person mit fremdem Handy auszusperren); dabei entstehen 10
 *    Wiederherstellungscodes (nur als HMAC gespeichert, einmal angezeigt) und alle anderen Sitzungen enden.
 *    Eine angefangene Einrichtung ändert an der Anmeldung nichts.
 *  - Anmelden: Nach dem richtigen Passwort folgt der Code aus der App oder ein Wiederherstellungscode. Der Zwischenschritt
 *    gilt nur, solange das Passwort dasselbe ist (Fingerabdruck im Cookie, siehe `login-challenge.ts`).
 *  - Ausschalten und neue Wiederherstellungscodes nur mit Passwort UND Code.
 *  - Zurücksetzen durch den Verein (`users:manage`, siehe modules/users/service.ts) oder den Betreiber (Skript).
 *
 * Schutz:
 *  - Derselbe Code gilt nie zweimal: Der zuletzt angenommene Zeitschritt steht in `totpLastStep`; angenommen wird nur ein
 *    späterer – geprüft und gespeichert in EINER bedingten Anweisung (gleichzeitige Anfragen: genau eine gewinnt).
 *  - Wiederherstellungscodes werden in einer Anweisung entfernt (`array_remove`), auch gleichzeitig gelingt ein Code nur einmal.
 *  - Fehlversuche sind begrenzt: 5 je Konto in 15 Minuten, 20 je Konto und Tag, 30 je IP in 15 Minuten. Jeder Versuch wird
 *    VOR der Prüfung atomar gezählt – auch viele gleichzeitige Anfragen bekommen so zusammen nur so viele Prüfungen, wie
 *    die Grenze erlaubt. Ein Erfolg leert nur den 15-Minuten-Zähler des Kontos; beim Tageszähler und beim IP-Zähler nimmt
 *    er bloß seinen eigenen Versuch zurück – praktisch zählen also nur Fehlversuche. Der Tageszähler läuft von selbst ab:
 *    Leerte ihn jede Anmeldung der Person, könnte jemand mit ihrem Passwort zwischen zwei Anmeldungen immer wieder raten
 *    (je 4 Versuche) und käme so über den Tag auf viel mehr als 20. Beim Erreichen einer Grenze: Protokolleintrag und
 *    E-Mail an die Person (das Passwort ist dann wohl bekannt). Dasselbe Prinzip gilt beim Einschalten, Ausschalten und bei
 *    neuen Codes (10 Fehlversuche in 15 Minuten, 20 am Tag).
 */

const DAY_SECONDS = 24 * 60 * 60;
/** Anmeldung: Codes je Konto (15 Minuten und Tag) und je IP. */
const SECOND_FACTOR_ACCOUNT = { prefix: "2fa:acct", limit: 5, windowSeconds: 15 * 60 } as const;
const SECOND_FACTOR_ACCOUNT_DAY = {
  prefix: "2fa:acct-day",
  limit: 20,
  windowSeconds: DAY_SECONDS,
} as const;
const SECOND_FACTOR_IP = { prefix: "2fa:ip", limit: 30, windowSeconds: 15 * 60 } as const;
/** Einrichten, Ausschalten und neue Codes (Passwort oder Code falsch) – je Konto. */
const MANAGE_LIMIT = { prefix: "2fa-manage", limit: 10, windowSeconds: 15 * 60 } as const;
const MANAGE_DAY_LIMIT = {
  prefix: "2fa-manage-day",
  limit: 20,
  windowSeconds: DAY_SECONDS,
} as const;

const WRONG_CODE =
  "Der Code stimmt nicht. Gib den aktuellen Code aus deiner App ein (oder einen noch nicht benutzten Wiederherstellungscode).";
const WRONG_SETUP_CODE =
  "Der Code stimmt nicht. Gib den Code ein, den die App gerade anzeigt. Stimmt er trotzdem nicht, prüfe die Uhrzeit deines Handys (automatisch einstellen).";

const secretAad = (userId: string) => `totp:${userId}`;
const hasKnownIp = (meta: ClientMeta) => meta.ip !== "unknown";

/** Wartezeit in Worten („15 Minuten“, „3 Stunden“). */
function waitText(seconds: number): string {
  if (seconds >= 2 * 60 * 60) return `${Math.ceil(seconds / 3600)} Stunden`;
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return minutes === 1 ? "1 Minute" : `${minutes} Minuten`;
}

function lockedError(retryAfterSeconds: number): AppError {
  return new AppError(
    "RATE_LIMITED",
    `Zu viele falsche Codes. Aus Sicherheitsgründen geht das erst in ${waitText(retryAfterSeconds)} wieder.`,
    { retryAfterSeconds },
  );
}

type LimitEntry = { key: string; limit: number; windowSeconds: number };

/**
 * Zählt einen Versuch VOR der Prüfung – in einer atomaren Anweisung (`checkRateLimit`). Ist die Grenze schon erreicht, wird
 * gar nicht erst geprüft. Nur so bleibt die Grenze auch bei vielen gleichzeitigen Anfragen dicht: Wer erst nachsieht und
 * nach der Prüfung zählt, lässt alle gleichzeitig eintreffenden Versuche noch durch.
 */
async function countAttempt(entry: LimitEntry): Promise<RateLimitResult> {
  const result = await checkRateLimit(entry.key, entry.limit, entry.windowSeconds);
  if (!result.allowed) throw lockedError(result.retryAfterSeconds);
  return result;
}

/** Die beiden Zähler eines Kontos: das kurze Zeitfenster (ein Erfolg leert es) und der Tag (läuft von selbst ab). */
interface AccountLimits {
  window: LimitEntry;
  day: LimitEntry;
}

const keyed = (
  entry: { prefix: string; limit: number; windowSeconds: number },
  subject: string,
) => ({
  key: `${entry.prefix}:${subject}`,
  limit: entry.limit,
  windowSeconds: entry.windowSeconds,
});
const loginLimits = (userId: string): AccountLimits => ({
  window: keyed(SECOND_FACTOR_ACCOUNT, userId),
  day: keyed(SECOND_FACTOR_ACCOUNT_DAY, userId),
});
const manageLimits = (userId: string): AccountLimits => ({
  window: keyed(MANAGE_LIMIT, userId),
  day: keyed(MANAGE_DAY_LIMIT, userId),
});
const ipKey = (meta: ClientMeta) => keyed(SECOND_FACTOR_IP, rateLimitIp(meta.ip));

/**
 * Zählt einen Versuch bei beiden Zählern eines Kontos (erst das kurze Fenster: Ist es gesperrt, bleibt der Tag unberührt).
 * Liefert die Stände – an `remaining === 0` erkennt der Aufrufer, dass genau dieser Versuch eine Grenze erreicht hat.
 */
async function countAccountAttempt(limits: AccountLimits): Promise<RateLimitResult[]> {
  const window = await countAttempt(limits.window);
  try {
    return [window, await countAttempt(limits.day)];
  } catch (error) {
    // Sperrt der Tag, zählt der Versuch auch im kurzen Fenster nicht – sonst meldete es bald seine eigene (kürzere) Sperre.
    await releaseRateLimit(limits.window.key);
    throw error;
  }
}

/**
 * Nach einem Erfolg: Das kurze Fenster beginnt von vorn. Beim Tageszähler wird nur dieser eine (erfolgreiche) Versuch
 * zurückgenommen – die Fehlversuche des Tages bleiben stehen und laufen von selbst ab (siehe Kopfkommentar).
 */
async function forgiveSuccess(limits: AccountLimits): Promise<void> {
  await resetRateLimit(limits.window.key);
  await releaseRateLimit(limits.day.key);
}

type TwoFactorUser = {
  id: string;
  email: string;
  totpSecretEnc: string | null;
  totpEnabledAt: Date | null;
};

function decryptSecret(user: { id: string; totpSecretEnc: string | null }): Buffer | null {
  if (!user.totpSecretEnc) return null;
  const secret = openSecret(user.totpSecretEnc, secretAad(user.id));
  if (secret === null) {
    // Passiert nur, wenn APP_SECRET geändert wurde oder der Wert beschädigt ist – nie still übergehen.
    logUnexpectedError(
      "two-factor",
      new Error("Zwei-Faktor-Geheimnis lässt sich nicht entschlüsseln (APP_SECRET geändert?)"),
    );
    return null;
  }
  return base32Decode(secret);
}

/**
 * Prüft einen Code aus der App bzw. einen Wiederherstellungscode und VERBRAUCHT ihn (Zeitschritt gespeichert bzw. Code
 * entfernt). Liefert die Art – oder `null`, wenn er nicht passt.
 */
async function consumeSecondFactor(
  user: TwoFactorUser,
  input: string,
  now: Date,
): Promise<Exclude<LoginMethod, "password"> | null> {
  const compact = input.replace(/[\s-]/g, "");
  if (/^\d{6}$/.test(compact)) {
    const secret = decryptSecret(user);
    if (!secret) return null;
    const step = matchTotpStep(secret, compact, now.getTime());
    if (step === null) return null;
    const { count } = await prisma.user.updateMany({
      where: {
        id: user.id,
        totpEnabledAt: { not: null },
        OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }],
      },
      data: { totpLastStep: step },
    });
    return count === 1 ? "totp" : null;
  }

  const canonical = normalizeRecoveryCode(compact);
  if (!canonical) return null;
  const hash = hashRecoveryCode(user.id, canonical);
  // Eine Anweisung: Prüfen und Entfernen zugleich. Bei gleichzeitigem Einlösen wartet die zweite Anfrage auf die Zeilensperre,
  // findet den Code danach nicht mehr und ändert nichts. (Prisma kann einzelne Listeneinträge nicht entfernen.)
  const removed = await prisma.$executeRaw`
    UPDATE "User"
       SET "recoveryCodeHashes" = array_remove("recoveryCodeHashes", ${hash}), "updatedAt" = now()
     WHERE "id" = ${user.id}
       AND "totpEnabledAt" IS NOT NULL
       AND ${hash} = ANY("recoveryCodeHashes")`;
  return removed === 1 ? "recovery_code" : null;
}

async function remainingRecoveryCodes(userId: string): Promise<number> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { recoveryCodeHashes: true },
  });
  return row?.recoveryCodeHashes.length ?? 0;
}

// ---------------------------------------------------------------------------------------------------------------------
// Anmeldung: zweiter Schritt
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Die Anmeldung muss von vorn beginnen (Konto gesperrt, Passwort inzwischen geändert, Zwei-Faktor inzwischen aus,
 * Zwischenschritt abgelaufen).
 */
export const loginChallengeExpired = () =>
  unauthenticated("Die Anmeldung ist abgelaufen. Bitte melde dich erneut an.");

/** Gehört der Zwischenschritt noch zum aktuellen Passwort? (Vergleich in konstanter Zeit.) */
function samePassword(passwordHash: string, fingerprint: string): boolean {
  const expected = Buffer.from(passwordFingerprint(passwordHash), "utf8");
  const given = Buffer.from(fingerprint, "utf8");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * Wertet einen Fehlversuch aus, der schon VOR der Prüfung gezählt wurde (`counted`: die Ergebnisse der Konto-Zähler).
 * Hat genau dieser Versuch eine Grenze erreicht → einmal protokollieren, die Person warnen und „gesperrt“ melden.
 */
async function reportSecondFactorFailure(
  user: TwoFactorUser,
  meta: ClientMeta,
  counted: RateLimitResult[],
): Promise<void> {
  const justLocked = counted.find((result) => result.remaining === 0);
  if (justLocked) {
    await recordSystemAudit({
      actorUserId: user.id,
      action: "auth.2fa_locked",
      entityType: "User",
      entityId: user.id,
      summary: "Zwei-Faktor-Anmeldung nach zu vielen falschen Codes vorübergehend gesperrt",
      ipPrefix: meta.ipPrefix,
    });
    await sendMailDeferred(twoFactorLockedEmail({ to: user.email }));
    throw lockedError(justLocked.retryAfterSeconds);
  }
}

/**
 * Zweiter Schritt der Anmeldung. Bei Erfolg wie `authenticate` ohne Zwei-Faktor: letzte Anmeldung, Protokoll – die
 * Sitzung legt die Server Action an.
 */
export async function verifySecondFactor(
  input: { userId: string; passwordFingerprint: string; code: string },
  meta: ClientMeta,
  now: Date = new Date(),
): Promise<{ user: AuthenticatedUser; method: Exclude<LoginMethod, "password"> }> {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (
    !user ||
    user.disabledAt ||
    user.deletedAt ||
    !user.emailVerifiedAt ||
    !user.totpEnabledAt ||
    !user.totpSecretEnc ||
    // Passwort seit dem ersten Schritt geändert oder zurückgesetzt: Mit dem alten Passwort geht es nicht weiter.
    !samePassword(user.passwordHash, input.passwordFingerprint)
  ) {
    throw loginChallengeExpired();
  }

  // Erst zählen, dann prüfen (siehe `countAttempt`). Zuerst je IP: Ist sie gesperrt, bleiben die Zähler des Kontos unberührt.
  const ip = hasKnownIp(meta) ? ipKey(meta) : null;
  if (ip) await countAttempt(ip);
  const limits = loginLimits(user.id);
  const counted = await countAccountAttempt(limits);

  const method = await consumeSecondFactor(user, input.code, now);
  if (!method) {
    await reportSecondFactorFailure(user, meta, counted);
    throw validationFailed({ code: [WRONG_CODE] }, WRONG_CODE);
  }

  // Ein Erfolg zählt nicht: 15-Minuten-Zähler des Kontos leeren; beim Tages- und beim IP-Zähler nur diesen einen Versuch
  // zurücknehmen (dort bleiben die Fehlversuche stehen – beim IP-Zähler auch die anderer Konten).
  await forgiveSuccess(limits);
  if (ip) await releaseRateLimit(ip.key);

  if (method === "recovery_code") {
    const remaining = await remainingRecoveryCodes(user.id);
    await recordSystemAudit({
      actorUserId: user.id,
      action: "auth.2fa_recovery_used",
      entityType: "User",
      entityId: user.id,
      summary: `Mit Wiederherstellungscode angemeldet (noch ${remaining} übrig)`,
      ipPrefix: meta.ipPrefix,
    });
    await sendMailDeferred(twoFactorRecoveryUsedEmail({ to: user.email, remaining }));
  }

  return { user: await finishLogin(user, meta, method), method };
}

// ---------------------------------------------------------------------------------------------------------------------
// Profil: einrichten, ausschalten, neue Wiederherstellungscodes
// ---------------------------------------------------------------------------------------------------------------------

export interface TwoFactorOverview {
  enabledAt: Date | null;
  /** Angefangene Einrichtung: Schlüssel für die App (nur für die eigene Profilseite). */
  pending: { secret: string; otpauthUrl: string } | null;
  recoveryCodesLeft: number;
}

/** Stand für die eigene Profilseite. */
export async function getTwoFactorOverview(userId: string): Promise<TwoFactorOverview> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      email: true,
      totpSecretEnc: true,
      totpEnabledAt: true,
      recoveryCodeHashes: true,
    },
  });
  if (!user) throw notFound("Das Konto");
  let pending: TwoFactorOverview["pending"] = null;
  if (!user.totpEnabledAt && user.totpSecretEnc) {
    const secret = openSecret(user.totpSecretEnc, secretAad(user.id));
    if (secret) pending = { secret, otpauthUrl: otpauthUrl(user.email, secret) };
  }
  return {
    enabledAt: user.totpEnabledAt,
    pending,
    recoveryCodesLeft: user.totpEnabledAt ? user.recoveryCodeHashes.length : 0,
  };
}

async function loadOwnUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt || user.disabledAt) throw unauthenticated();
  return user;
}

const alreadyEnabled = () => badRequest("Die Zwei-Faktor-Anmeldung ist bereits eingeschaltet.");

/** Schritt 1: neues Geheimnis erzeugen und verschlüsselt speichern (ersetzt eine angefangene Einrichtung). */
export async function startTwoFactorSetup(userId: string): Promise<void> {
  await enforceRateLimit(`2fa-setup:${userId}`, 20, 60 * 60);
  const user = await loadOwnUser(userId);
  if (user.totpEnabledAt) throw alreadyEnabled();
  const { count } = await prisma.user.updateMany({
    where: { id: userId, totpEnabledAt: null },
    data: {
      totpSecretEnc: sealSecret(generateTotpSecret(), secretAad(userId)),
      totpLastStep: null,
      recoveryCodeHashes: [],
    },
  });
  if (count !== 1) throw alreadyEnabled();
}

/** Angefangene Einrichtung verwerfen. Eine eingeschaltete Zwei-Faktor-Anmeldung bleibt unberührt. */
export async function cancelTwoFactorSetup(userId: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, totpEnabledAt: null },
    data: { totpSecretEnc: null, totpLastStep: null, recoveryCodeHashes: [] },
  });
}

const WRONG_PASSWORD = "Das Passwort ist nicht korrekt.";

/**
 * Schritt 2: aktuelles Passwort und erster Code aus der App. Schaltet ein, erzeugt die Wiederherstellungscodes (Rückgabe –
 * nur jetzt sichtbar) und meldet alle anderen Geräte ab. Das Passwort verhindert, dass jemand mit einer kurz übernommenen
 * Sitzung (offener Vereins-PC, gestohlenes Cookie) sein eigenes Handy einträgt und die Person damit dauerhaft aussperrt.
 */
export async function confirmTwoFactorSetup(
  input: { userId: string; password: string; code: string; keepSessionId?: string },
  meta: ClientMeta,
  now: Date = new Date(),
): Promise<string[]> {
  const limits = manageLimits(input.userId);
  const user = await loadOwnUser(input.userId);
  if (user.totpEnabledAt) throw alreadyEnabled();
  const secret = decryptSecret(user);
  if (!user.totpSecretEnc || !secret) {
    throw badRequest("Die Einrichtung ist nicht mehr offen. Bitte beginne sie erneut.");
  }

  await countAccountAttempt(limits);
  if (!(await verifyPassword(user.passwordHash, input.password))) {
    throw validationFailed({ password: [WRONG_PASSWORD] });
  }
  const step = matchTotpStep(secret, input.code, now.getTime());
  if (step === null) {
    throw validationFailed({ code: [WRONG_SETUP_CODE] }, WRONG_SETUP_CODE);
  }

  const codes = generateRecoveryCodes();
  await prisma.$transaction(async (tx) => {
    // Nur, wenn noch genau diese Einrichtung offen ist (nicht inzwischen neu begonnen oder in einem zweiten Fenster bestätigt).
    const { count } = await tx.user.updateMany({
      where: { id: user.id, totpEnabledAt: null, totpSecretEnc: user.totpSecretEnc },
      data: {
        totpEnabledAt: now,
        totpLastStep: step,
        recoveryCodeHashes: hashRecoveryCodes(user.id, codes),
      },
    });
    if (count !== 1) {
      throw conflict("Die Einrichtung wurde inzwischen geändert. Bitte lade die Seite neu.");
    }
    await tx.session.deleteMany({
      where: {
        userId: user.id,
        ...(input.keepSessionId ? { id: { not: input.keepSessionId } } : {}),
      },
    });
  });
  await forgiveSuccess(limits);

  await recordSystemAudit({
    actorUserId: user.id,
    action: "auth.2fa_enabled",
    entityType: "User",
    entityId: user.id,
    summary: "Zwei-Faktor-Anmeldung eingeschaltet",
    ipPrefix: meta.ipPrefix,
  });
  await sendMailDeferred(twoFactorEnabledEmail({ to: user.email }));
  return codes;
}

/** Passwort und Code (oder Wiederherstellungscode) prüfen – für Ausschalten und neue Codes. Verbraucht den Code. */
async function verifyPasswordAndCode(
  input: { userId: string; password: string; code: string },
  now: Date,
) {
  const limits = manageLimits(input.userId);
  const user = await loadOwnUser(input.userId);
  if (!user.totpEnabledAt) throw badRequest("Die Zwei-Faktor-Anmeldung ist nicht eingeschaltet.");

  // Erst zählen, dann prüfen (siehe `countAttempt`); ein Erfolg leert das kurze Fenster wieder (siehe `forgiveSuccess`).
  await countAccountAttempt(limits);
  // Erst das Passwort: Ein falsches Passwort soll keinen Code verbrauchen.
  if (!(await verifyPassword(user.passwordHash, input.password))) {
    throw validationFailed({ password: [WRONG_PASSWORD] });
  }
  if (!(await consumeSecondFactor(user, input.code, now))) {
    throw validationFailed({ code: [WRONG_CODE] });
  }
  await forgiveSuccess(limits);
  return user;
}

export async function disableTwoFactor(
  input: { userId: string; password: string; code: string },
  meta: ClientMeta,
  now: Date = new Date(),
): Promise<void> {
  const user = await verifyPasswordAndCode(input, now);
  await prisma.user.updateMany({
    where: { id: user.id },
    data: { totpSecretEnc: null, totpEnabledAt: null, totpLastStep: null, recoveryCodeHashes: [] },
  });
  await recordSystemAudit({
    actorUserId: user.id,
    action: "auth.2fa_disabled",
    entityType: "User",
    entityId: user.id,
    summary: "Zwei-Faktor-Anmeldung ausgeschaltet",
    ipPrefix: meta.ipPrefix,
  });
  await sendMailDeferred(twoFactorDisabledEmail({ to: user.email }));
}

/** Ersetzt alle Wiederherstellungscodes durch 10 neue (Rückgabe – nur jetzt sichtbar). */
export async function renewRecoveryCodes(
  input: { userId: string; password: string; code: string },
  meta: ClientMeta,
  now: Date = new Date(),
): Promise<string[]> {
  const user = await verifyPasswordAndCode(input, now);
  const codes = generateRecoveryCodes();
  const { count } = await prisma.user.updateMany({
    where: { id: user.id, totpEnabledAt: { not: null } },
    data: { recoveryCodeHashes: hashRecoveryCodes(user.id, codes) },
  });
  if (count !== 1) throw badRequest("Die Zwei-Faktor-Anmeldung ist nicht eingeschaltet.");
  await recordSystemAudit({
    actorUserId: user.id,
    action: "auth.2fa_recovery_renewed",
    entityType: "User",
    entityId: user.id,
    summary: "Neue Wiederherstellungscodes erstellt",
    ipPrefix: meta.ipPrefix,
  });
  await sendMailDeferred(twoFactorRecoveryRenewedEmail({ to: user.email }));
  return codes;
}

// ---------------------------------------------------------------------------------------------------------------------
// Zurücksetzen durch Verein oder Betreiber („Handy und Codes verloren“)
// ---------------------------------------------------------------------------------------------------------------------

export interface TwoFactorResetInfo {
  /** Eingeschaltet oder angefangen – es gibt etwas zurückzusetzen. */
  configured: boolean;
  /**
   * Nur der Betreiber darf zurücksetzen: Das Konto gilt plattformweit – ist die Person noch in einem anderen Verein oder
   * Plattform-Administrator, entschiede ein Verein sonst über einen Zugang, der ihm nicht allein gehört.
   */
  operatorOnly: boolean;
}

export async function getTwoFactorResetInfo(
  userId: string,
  clubId: string,
): Promise<TwoFactorResetInfo> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpEnabledAt: true, totpSecretEnc: true, isPlatformAdmin: true },
  });
  if (!user) throw notFound("Der Benutzer");
  const elsewhere = await prisma.clubMembership.count({
    where: { userId, clubId: { not: clubId } },
  });
  return {
    configured: user.totpEnabledAt !== null || user.totpSecretEnc !== null,
    operatorOnly: user.isPlatformAdmin || elsewhere > 0,
  };
}

/** Protokolleintrag zum Zurücksetzen (Aktion `user.2fa_reset`); die Zusammenfassung kennt die Zahl der beendeten Sitzungen. */
export interface TwoFactorResetAudit {
  clubId: string | null;
  actorUserId: string | null;
  actorType: "USER" | "SYSTEM";
  entityType: string;
  entityId: string;
  summary: string;
  ipPrefix?: string | null;
  requestId?: string | null;
}

/** Ist bei dem Konto etwas eingerichtet (eingeschaltet oder angefangen)? Nur dann gibt es etwas zurückzusetzen. */
const twoFactorConfigured = {
  OR: [{ totpEnabledAt: { not: null } }, { totpSecretEnc: { not: null } }],
} satisfies Prisma.UserWhereInput;

/**
 * Schaltet die Zwei-Faktor-Anmeldung ab, beendet ALLE Sitzungen der Person und schreibt das Protokoll – alles in EINER
 * Transaktion: Entweder ist zurückgesetzt, abgemeldet UND protokolliert, oder nichts davon. `audit` liefert den Eintrag
 * (Verein: im Vereinsprotokoll, Betreiber: als System). Erst nach dem Festschreiben geht die E-Mail an die Person; `by`
 * nennt darin, wer es war.
 *
 * `null`: Es war (inzwischen) nichts mehr eingerichtet – nichts geändert, kein Protokoll, keine E-Mail. Die Bedingung steht
 * in der Änderung selbst: Setzen zwei Personen gleichzeitig zurück, gelingt es genau einmal.
 */
export async function resetTwoFactor(
  userId: string,
  options: { by: string; audit: (sessionsEnded: number) => TwoFactorResetAudit },
): Promise<{ sessionsEnded: number } | null> {
  const result = await prisma.$transaction(async (tx) => {
    const [user] = await tx.user.updateManyAndReturn({
      where: { id: userId, ...twoFactorConfigured },
      data: {
        totpSecretEnc: null,
        totpEnabledAt: null,
        totpLastStep: null,
        recoveryCodeHashes: [],
      },
      select: { email: true },
    });
    if (!user) return null;
    const { count: sessionsEnded } = await tx.session.deleteMany({ where: { userId } });
    const entry = options.audit(sessionsEnded);
    await tx.auditLog.create({
      data: {
        clubId: entry.clubId,
        actorUserId: entry.actorUserId,
        actorType: entry.actorType,
        action: "user.2fa_reset",
        entityType: entry.entityType,
        entityId: entry.entityId,
        summary: entry.summary,
        ipPrefix: entry.ipPrefix ?? null,
        requestId: entry.requestId ?? null,
      },
    });
    return { email: user.email, sessionsEnded };
  });
  if (!result) return null;
  // Eine alte Sperre nach falschen Codes darf das neue Einrichten nicht blockieren (z. B. nach einem verlorenen Handy).
  const limits = loginLimits(userId);
  await resetRateLimit(limits.window.key);
  await resetRateLimit(limits.day.key);
  await sendMailDeferred(twoFactorResetEmail({ to: result.email, by: options.by }));
  return { sessionsEnded: result.sessionsEnded };
}

/** Für das Betreiber-Skript (`npm run admin:reset-2fa`). */
export async function resetTwoFactorByOperator(
  emailInput: string,
): Promise<{ changed: boolean; sessionsEnded: number }> {
  const email = normalizeEmail(emailInput);
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, deletedAt: true },
  });
  if (!user || user.deletedAt) throw new Error("Für diese Adresse gibt es kein Konto.");
  const result = await resetTwoFactor(user.id, {
    by: "den Betreiber von VereinsFlow",
    audit: () => ({
      clubId: null,
      actorUserId: null,
      actorType: "SYSTEM",
      entityType: "User",
      entityId: user.id,
      summary: "Zwei-Faktor-Anmeldung durch den Betreiber zurückgesetzt",
    }),
  });
  return result
    ? { changed: true, sessionsEnded: result.sessionsEnded }
    : { changed: false, sessionsEnded: 0 };
}
