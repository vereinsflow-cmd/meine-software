import "server-only";
import { env } from "@/server/env";
import { prisma } from "@/server/db/client";
import { purgeExpiredRateLimits } from "@/server/security/rate-limit";

/**
 * Räumt technische Altdaten auf (Datensparsamkeit, Speicherbegrenzung):
 *  - abgelaufene oder lange inaktive Sitzungen (inaktive sind ohnehin ungültig),
 *  - abgelaufene Zähler des Rate-Limits,
 *  - benutzte oder abgelaufene Bestätigungs-/Reset-Token (nach 7 Tagen),
 *  - gelesene Benachrichtigungen nach 90 Tagen, ungelesene nach 180 Tagen (ausstehende E-Mails bleiben erhalten),
 *  - widerrufene Kalender-Abo-Links nach 30 Tagen.
 */
const DAY = 86_400_000;

export interface CleanupResult {
  sessions: number;
  rateLimits: number;
  verificationTokens: number;
  notifications: number;
  feedTokens: number;
}

export async function purgeStaleData(now: Date = new Date()): Promise<CleanupResult> {
  const idleCutoff = new Date(now.getTime() - 2 * env.SESSION_IDLE_MINUTES * 60_000);
  const week = new Date(now.getTime() - 7 * DAY);

  const sessions = await prisma.session.deleteMany({
    where: { OR: [{ expiresAt: { lt: now } }, { lastSeenAt: { lt: idleCutoff } }] },
  });
  const rateLimits = await purgeExpiredRateLimits();
  const verificationTokens = await prisma.verificationToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: week } }, { usedAt: { lt: week } }] },
  });
  const notifications = await prisma.notification.deleteMany({
    where: {
      emailStatus: { not: "PENDING" },
      OR: [
        { readAt: { lt: new Date(now.getTime() - 90 * DAY) } },
        { readAt: null, createdAt: { lt: new Date(now.getTime() - 180 * DAY) } },
      ],
    },
  });
  const feedTokens = await prisma.calendarFeedToken.deleteMany({
    where: { revokedAt: { lt: new Date(now.getTime() - 30 * DAY) } },
  });

  return {
    sessions: sessions.count,
    rateLimits,
    verificationTokens: verificationTokens.count,
    notifications: notifications.count,
    feedTokens: feedTokens.count,
  };
}
