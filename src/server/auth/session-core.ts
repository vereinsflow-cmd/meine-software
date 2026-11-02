import "server-only";
import { prisma } from "@/server/db/client";
import { env } from "@/server/env";
import { generateToken, hashToken } from "@/server/security/tokens";

/**
 * Sitzungsverwaltung (ohne Next.js-Abhängigkeiten, damit sie direkt testbar ist).
 *
 * - Das Sitzungstoken ist eine zufällige 256-Bit-Zeichenfolge, die nur im Cookie des Browsers
 *   liegt. In der Datenbank steht ausschließlich ihr SHA-256-Hash (`Session.id`).
 * - Zwei Ablaufregeln: absolute Höchstdauer (`SESSION_MAX_DAYS`) und Inaktivität
 *   (`SESSION_IDLE_MINUTES`) – beides wird bei JEDER Anfrage serverseitig geprüft.
 * - Bei jeder Anmeldung entsteht ein neues Token (kein Session-Fixation-Risiko).
 */

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isPlatformAdmin: boolean;
}

export interface ValidSession {
  id: string;
  user: SessionUser;
  activeClubId: string | null;
  expiresAt: Date;
  /** Ende der Sitzung ohne weitere Aktivität: Inaktivitätsfrist ab der letzten Anfrage, höchstens `expiresAt`. */
  endsAt: Date;
}

/** `lastSeenAt` wird höchstens einmal pro Minute aktualisiert (spart Schreibzugriffe). */
const TOUCH_INTERVAL_MS = 60_000;

export async function createSessionRecord(input: {
  userId: string;
  activeClubId: string | null;
  userAgent: string | null;
  ipPrefix: string | null;
  now?: Date;
}): Promise<{ token: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const token = generateToken(32);
  const expiresAt = new Date(now.getTime() + env.SESSION_MAX_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      id: hashToken(token),
      userId: input.userId,
      activeClubId: input.activeClubId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt,
      userAgent: input.userAgent,
      ipPrefix: input.ipPrefix,
    },
  });
  return { token, expiresAt };
}

/**
 * Prüft ein Cookie-Token. Gibt `null` zurück, wenn es unbekannt, abgelaufen oder inaktiv ist.
 * Jede Prüfung zählt als Aktivität und verlängert die Inaktivitätsfrist – außer mit `touch: false` (nur nachfragen, z. B. ob
 * der Hinweis vor der automatischen Abmeldung nötig ist; das darf die Sitzung nicht am Leben halten).
 */
export async function validateSessionToken(
  token: string,
  now = new Date(),
  { touch = true }: { touch?: boolean } = {},
): Promise<ValidSession | null> {
  const id = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isPlatformAdmin: true,
          disabledAt: true,
          deletedAt: true,
        },
      },
    },
  });
  if (!session) return null;

  const idleLimit = session.lastSeenAt.getTime() + env.SESSION_IDLE_MINUTES * 60_000;
  const expired = session.expiresAt.getTime() <= now.getTime() || idleLimit <= now.getTime();
  const userInactive = session.user.disabledAt !== null || session.user.deletedAt !== null;

  if (expired || userInactive) {
    await prisma.session.deleteMany({ where: { id } });
    return null;
  }

  let lastSeenAt = session.lastSeenAt;
  if (touch && now.getTime() - lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.session.updateMany({ where: { id }, data: { lastSeenAt: now } });
    lastSeenAt = now;
  }
  const endsAt = new Date(
    Math.min(lastSeenAt.getTime() + env.SESSION_IDLE_MINUTES * 60_000, session.expiresAt.getTime()),
  );

  const { disabledAt: _disabledAt, deletedAt: _deletedAt, ...user } = session.user;
  void _disabledAt;
  void _deletedAt;
  return { id, user, activeClubId: session.activeClubId, expiresAt: session.expiresAt, endsAt };
}

export async function deleteSessionByToken(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: hashToken(token) } });
}

/** Meldet einen Benutzer überall ab (z. B. nach Passwortänderung); optional bleibt eine Sitzung bestehen. */
export async function deleteSessionsForUser(
  userId: string,
  exceptSessionId?: string,
): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
  });
  return count;
}

export async function setSessionActiveClub(
  sessionId: string,
  clubId: string | null,
): Promise<void> {
  await prisma.session.updateMany({ where: { id: sessionId }, data: { activeClubId: clubId } });
}

/** Aufräumen abgelaufener Sitzungen (Job). */
export async function purgeExpiredSessions(now = new Date()): Promise<number> {
  const idleCutoff = new Date(now.getTime() - env.SESSION_IDLE_MINUTES * 60_000);
  const { count } = await prisma.session.deleteMany({
    where: { OR: [{ expiresAt: { lte: now } }, { lastSeenAt: { lte: idleCutoff } }] },
  });
  return count;
}
