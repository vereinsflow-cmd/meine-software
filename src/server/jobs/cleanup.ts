import "server-only";
import { env } from "@/server/env";
import { prisma } from "@/server/db/client";
import { purgeExpiredRateLimits } from "@/server/security/rate-limit";

/**
 * Räumt technische Altdaten auf (Datensparsamkeit, Speicherbegrenzung):
 *  - abgelaufene oder lange inaktive Sitzungen (inaktive sind ohnehin ungültig),
 *  - abgelaufene Zähler des Rate-Limits,
 *  - benutzte oder abgelaufene Bestätigungs-/Reset-Token (nach 7 Tagen),
 *  - gelesene Benachrichtigungen nach 90 Tagen, ungelesene nach 180 Tagen (ausstehende E-Mails und Push-Meldungen bleiben erhalten),
 *  - widerrufene Kalender-Abo-Links nach 30 Tagen,
 *  - Push-Geräte, bei denen die Zustellung fehlschlägt und die seit 30 Tagen keine Meldung mehr erhalten haben (nach der
 *    Anmeldung zählt deren Zeitpunkt): Das Gerät ist vermutlich nicht mehr erreichbar (Browser-Daten gelöscht, App entfernt).
 */
const DAY = 86_400_000;

export interface CleanupResult {
  sessions: number;
  rateLimits: number;
  verificationTokens: number;
  notifications: number;
  feedTokens: number;
  pushSubscriptions: number;
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
      pushStatus: { not: "PENDING" },
      OR: [
        { readAt: { lt: new Date(now.getTime() - 90 * DAY) } },
        { readAt: null, createdAt: { lt: new Date(now.getTime() - 180 * DAY) } },
      ],
    },
  });
  const feedTokens = await prisma.calendarFeedToken.deleteMany({
    where: { revokedAt: { lt: new Date(now.getTime() - 30 * DAY) } },
  });
  const pushCutoff = new Date(now.getTime() - 30 * DAY);
  const pushSubscriptions = await prisma.pushSubscription.deleteMany({
    where: {
      failureCount: { gt: 0 },
      OR: [
        { lastSuccessAt: { lt: pushCutoff } },
        { lastSuccessAt: null, createdAt: { lt: pushCutoff } },
      ],
    },
  });

  return {
    sessions: sessions.count,
    rateLimits,
    verificationTokens: verificationTokens.count,
    notifications: notifications.count,
    feedTokens: feedTokens.count,
    pushSubscriptions: pushSubscriptions.count,
  };
}
