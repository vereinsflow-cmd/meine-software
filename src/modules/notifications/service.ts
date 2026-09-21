import type { NotificationType } from "@/generated/prisma/enums";
import { paged, type PageRequest, type Paged } from "@/lib/search-params";
import type { TenantDb, TenantTx } from "@/server/db/tenant";
import { notFound } from "@/server/errors";
import type { TenantContext } from "@/server/tenancy/context-core";

/**
 * Benachrichtigungen (In-App, optional zusätzlich per E-Mail).
 * Jeder Benutzer sieht und ändert ausschließlich seine EIGENEN Benachrichtigungen – das ergibt sich aus
 * dem Filter `userId = ctx.userId` und ist keine Frage einer Rolle.
 */
export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  linkUrl: string | null;
  readAt: Date | null;
  createdAt: Date;
}

const select = {
  id: true,
  type: true,
  title: true,
  body: true,
  linkUrl: true,
  readAt: true,
  createdAt: true,
} as const;

export function countUnread(ctx: TenantContext): Promise<number> {
  return ctx.db.notification.count({ where: { userId: ctx.userId, readAt: null } });
}

export async function listNotifications(
  ctx: TenantContext,
  options: { unreadOnly?: boolean; request: PageRequest },
): Promise<Paged<NotificationDto>> {
  const where = { userId: ctx.userId, ...(options.unreadOnly ? { readAt: null } : {}) };
  const [items, total] = await Promise.all([
    ctx.db.notification.findMany({
      where,
      select,
      orderBy: { createdAt: "desc" },
      skip: options.request.skip,
      take: options.request.pageSize,
    }),
    ctx.db.notification.count({ where }),
  ]);
  return paged(items, total, options.request);
}

/** Markiert eine eigene Benachrichtigung als gelesen und liefert deren Ziel-Link. */
export async function markNotificationRead(
  ctx: TenantContext,
  id: string,
): Promise<{ linkUrl: string | null }> {
  const notification = await ctx.db.notification.findFirst({
    where: { id, userId: ctx.userId },
    select: { id: true, linkUrl: true, readAt: true },
  });
  if (!notification) throw notFound("Die Benachrichtigung");
  if (!notification.readAt) {
    await ctx.db.notification.updateMany({
      where: { id, userId: ctx.userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
  return { linkUrl: notification.linkUrl };
}

export async function markNotificationUnread(ctx: TenantContext, id: string): Promise<void> {
  const result = await ctx.db.notification.updateMany({
    where: { id, userId: ctx.userId },
    data: { readAt: null },
  });
  if (result.count === 0) throw notFound("Die Benachrichtigung");
}

export async function markAllNotificationsRead(ctx: TenantContext): Promise<number> {
  const result = await ctx.db.notification.updateMany({
    where: { userId: ctx.userId, readAt: null },
    data: { readAt: new Date() },
  });
  return result.count;
}

export interface NotifyInput {
  userIds: readonly string[];
  type: NotificationType;
  title: string;
  body?: string | null;
  /** Interner Pfad, z. B. "/veranstaltungen/…" (die Datenbank lehnt externe Adressen ab). */
  linkUrl?: string | null;
  /** Verhindert Doppelbenachrichtigungen (z. B. Erinnerungen): je Benutzer ein eindeutiger Schlüssel. */
  dedupeKey?: (userId: string) => string;
  /** Zusätzlich per E-Mail senden (nur an Benutzer, die E-Mail-Benachrichtigungen nicht abgeschaltet haben). */
  email?: boolean;
}

/**
 * Erzeugt Benachrichtigungen für Benutzer DES VEREINS (andere werden ignoriert). Wird von den
 * Fachfunktionen innerhalb derselben Transaktion wie die auslösende Änderung aufgerufen.
 */
export async function notifyUsers(
  db: TenantDb | TenantTx,
  clubId: string,
  input: NotifyInput,
): Promise<number> {
  const userIds = [...new Set(input.userIds)];
  if (userIds.length === 0) return 0;

  const recipients = await db.clubMembership.findMany({
    where: { userId: { in: userIds }, status: "ACTIVE" },
    select: {
      userId: true,
      user: { select: { emailNotifications: true, disabledAt: true, deletedAt: true } },
    },
  });

  const rows = recipients
    .filter((r) => !r.user.disabledAt && !r.user.deletedAt)
    .map((r) => ({
      clubId,
      userId: r.userId,
      type: input.type,
      title: input.title.slice(0, 200),
      body: input.body?.slice(0, 2000) ?? null,
      linkUrl: input.linkUrl ?? null,
      dedupeKey: input.dedupeKey?.(r.userId) ?? null,
      emailStatus:
        input.email && r.user.emailNotifications ? ("PENDING" as const) : ("NONE" as const),
    }));
  if (rows.length === 0) return 0;

  const result = await db.notification.createMany({ data: rows, skipDuplicates: true });
  return result.count;
}
