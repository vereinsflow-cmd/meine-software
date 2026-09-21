import { recordAudit } from "@/server/audit/audit";
import { assertCan } from "@/server/permissions/policy";
import { generateToken, hashToken } from "@/server/security/tokens";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";

/**
 * Persönlicher Kalender-Abo-Link (iCal-Feed).
 *
 * Es gibt je Person und Verein höchstens einen gültigen Link. "Neu erzeugen" macht den alten ungültig – das ist der
 * Weg, einen weitergegebenen Link zurückzuziehen. Der Klartext-Token wird genau einmal angezeigt (Datenbank: nur Hash).
 */
export interface FeedStatus {
  active: boolean;
  createdAt: Date | null;
  lastUsedAt: Date | null;
}

export async function getFeedStatus(ctx: TenantContext): Promise<FeedStatus> {
  assertCan(ctx, "events:read");
  const current = await ctx.db.calendarFeedToken.findFirst({
    where: { userId: ctx.userId, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, lastUsedAt: true },
  });
  return {
    active: current !== null,
    createdAt: current?.createdAt ?? null,
    lastUsedAt: current?.lastUsedAt ?? null,
  };
}

/** Erzeugt einen neuen Link und widerruft alle bisherigen. Gibt den Token einmalig im Klartext zurück. */
export async function createFeedLink(ctx: TenantContext): Promise<{ token: string }> {
  assertCan(ctx, "events:read");
  const token = generateToken(32);
  await ctx.db.$transaction(async (tx) => {
    await tx.calendarFeedToken.updateMany({
      where: { userId: ctx.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.calendarFeedToken.create({
      data: { clubId: ctx.clubId, userId: ctx.userId, tokenHash: hashToken(token) },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "calendar.feed_created",
      entityType: "CalendarFeedToken",
      entityId: ctx.userId,
      summary: "Kalender-Abo-Link erzeugt",
    });
  });
  return { token };
}

export async function revokeFeedLinks(ctx: TenantContext): Promise<void> {
  assertCan(ctx, "events:read");
  await ctx.db.$transaction(async (tx) => {
    const { count } = await tx.calendarFeedToken.updateMany({
      where: { userId: ctx.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count > 0) {
      await recordAudit(tx, auditActor(ctx), {
        action: "calendar.feed_revoked",
        entityType: "CalendarFeedToken",
        entityId: ctx.userId,
        summary: "Kalender-Abo-Link widerrufen",
      });
    }
  });
}
