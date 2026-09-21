import "server-only";
import { prisma } from "@/server/db/client";
import { hashToken } from "@/server/security/tokens";
import { loadTenantContextForUser, type TenantContext } from "./context-core";

/** Länge eines Tokens aus 32 zufälligen Bytes in base64url (ohne Auffüllung). */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TOUCH_INTERVAL_MS = 10 * 60_000;

/**
 * Löst den geheimen Abo-Link eines Kalenders in den Kontext der Person auf, der er gehört.
 *
 * Kalender-Apps können keine Anmeldung durchführen; der Link ist deshalb selbst das Geheimnis (256 Bit, in der
 * Datenbank nur als Hash). Der Kontext bekommt die Rechte der Rolle – nicht mehr: Wird die Rolle entzogen, die
 * Mitgliedschaft beendet oder der Benutzer gesperrt, liefert der Link sofort nichts mehr. Widerrufene Links sind
 * ungültig. Gibt bei jedem Problem einheitlich `null` zurück (kein Hinweis, ob ein Token existiert).
 */
export async function resolveFeedToken(token: string): Promise<TenantContext | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const row = await prisma.calendarFeedToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.revokedAt) return null;

  const ctx = await loadTenantContextForUser(row.userId, row.clubId);
  if (!ctx) return null;

  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.calendarFeedToken
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }
  return ctx;
}
