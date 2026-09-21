import "server-only";
import { describeDevice } from "@/lib/user-agent";
import { recordSystemAudit } from "@/server/audit/audit";
import { deleteSessionsForUser } from "@/server/auth/session-core";
import { prisma } from "@/server/db/client";
import { env } from "@/server/env";
import { badRequest, notFound } from "@/server/errors";

/**
 * Profil des angemeldeten Benutzers: Name, E-Mail-Benachrichtigungen und angemeldete Geräte (Sitzungen).
 * Alle Funktionen wirken ausschließlich auf das EIGENE Konto – die Benutzer-ID stammt aus der geprüften Sitzung,
 * nie aus Formularfeldern; bei Sitzungen steht sie zusätzlich im WHERE (kein Zugriff auf fremde Sitzungen per ID).
 */
export async function updateOwnName(
  userId: string,
  input: { firstName: string; lastName: string },
  meta: { ipPrefix: string | null },
): Promise<void> {
  const { count } = await prisma.user.updateMany({
    where: { id: userId, deletedAt: null },
    data: { firstName: input.firstName.trim(), lastName: input.lastName.trim() },
  });
  if (count === 0) throw notFound("Das Konto");
  await recordSystemAudit({
    actorUserId: userId,
    action: "auth.profile_updated",
    entityType: "User",
    entityId: userId,
    summary: "Name im Profil geändert",
    ipPrefix: meta.ipPrefix,
  });
}

export interface OwnAccount {
  firstName: string;
  lastName: string;
  email: string;
  createdAt: Date;
  lastLoginAt: Date | null;
  emailNotifications: boolean;
  totpEnabledAt: Date | null;
}

/** Die eigenen Kontodaten für die Profilseite (ohne Passwort-Hash und Geheimnisse). */
export async function getOwnAccount(userId: string): Promise<OwnAccount> {
  const account = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      firstName: true,
      lastName: true,
      email: true,
      createdAt: true,
      lastLoginAt: true,
      emailNotifications: true,
      totpEnabledAt: true,
    },
  });
  if (!account) throw notFound("Das Konto");
  return account;
}

export async function setEmailNotifications(userId: string, enabled: boolean): Promise<void> {
  const { count } = await prisma.user.updateMany({
    where: { id: userId, deletedAt: null },
    data: { emailNotifications: enabled },
  });
  if (count === 0) throw notFound("Das Konto");
}

export interface SessionInfo {
  id: string;
  current: boolean;
  device: string;
  ipPrefix: string | null;
  createdAt: Date;
  lastSeenAt: Date;
}

/** Aktive Sitzungen (nicht abgelaufen und nicht im Leerlauf-Timeout), die aktuelle zuerst. */
export async function listOwnSessions(
  userId: string,
  currentSessionId: string | null,
  now: Date = new Date(),
): Promise<SessionInfo[]> {
  const rows = await prisma.session.findMany({
    where: {
      userId,
      expiresAt: { gt: now },
      lastSeenAt: { gt: new Date(now.getTime() - env.SESSION_IDLE_MINUTES * 60_000) },
    },
    orderBy: { lastSeenAt: "desc" },
    take: 50,
  });
  return rows
    .map((row) => ({
      id: row.id,
      current: row.id === currentSessionId,
      device: describeDevice(row.userAgent),
      ipPrefix: row.ipPrefix,
      createdAt: row.createdAt,
      lastSeenAt: row.lastSeenAt,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

export async function revokeOwnSession(
  userId: string,
  sessionId: string,
  currentSessionId: string | null,
): Promise<void> {
  if (sessionId === currentSessionId)
    throw badRequest("Diese Sitzung beendest du über „Abmelden“ im Benutzermenü.");
  const { count } = await prisma.session.deleteMany({ where: { id: sessionId, userId } });
  if (count === 0) throw notFound("Die Sitzung");
}

/** Beendet alle Sitzungen außer der aktuellen ("überall abmelden"). Gibt die Zahl der beendeten Sitzungen zurück. */
export async function revokeOtherSessions(
  userId: string,
  currentSessionId: string,
): Promise<number> {
  return deleteSessionsForUser(userId, currentSessionId);
}
