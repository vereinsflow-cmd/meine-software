import type { Prisma } from "@/generated/prisma/client";
import { assertCan, can, scopeOf } from "@/server/permissions/policy";
import type { TenantContext } from "@/server/tenancy/context-core";
import {
  chatKeyOf,
  chatPreview,
  chatTitle,
  parseChatKey,
  showSubject,
  type ChatTarget,
} from "./chat-format";
import { authorNames, previewRecipients } from "./service";

/**
 * Nachrichten als Chats (wie WhatsApp): Jede Zielgruppe ist ein Chat, darin stehen die gesendeten Nachrichten in zeitlicher
 * Reihenfolge. Sichtbar ist genau, was auch bisher sichtbar war: an mich adressierte Nachrichten und – für Absender –
 * die selbst verfassten bzw. (Verein) alle gesendeten. Wer einen Chat öffnet, hat die gezeigten Nachrichten gelesen.
 */
const CHAT_SCAN = 500; // jüngste Nachrichten, aus denen die Chatliste entsteht – reicht für jeden Verein

const select = {
  id: true,
  audience: true,
  departmentId: true,
  eventId: true,
  subject: true,
  body: true,
  sentAt: true,
  authorUserId: true,
  isAnnouncement: true,
  sendEmail: true,
  recipientCount: true,
  department: { select: { name: true } },
  event: { select: { title: true, startsAt: true, departmentId: true } },
} satisfies Prisma.MessageSelect;
type Row = Prisma.MessageGetPayload<{ select: typeof select }>;

const targetOf = (row: Row): ChatTarget => ({
  audience: row.audience,
  departmentId: row.departmentId,
  eventId: row.eventId,
});

/** Verein: alle gesendeten Nachrichten verwalten; Abteilungsleiter: die selbst verfassten (wie „Gesendet“ bisher). */
function managesAll(ctx: TenantContext): boolean {
  return can(ctx, "messages:send") && scopeOf(ctx, "messages:send") === "CLUB";
}
function manages(ctx: TenantContext, row: { authorUserId: string | null }): boolean {
  return managesAll(ctx) || (can(ctx, "messages:send") && row.authorUserId === ctx.userId);
}

/** Darf ich in diesen Chat schreiben? Dieselben Regeln wie beim Versand (der Server prüft beim Senden erneut). */
function canPostTo(ctx: TenantContext, target: ChatTarget, eventDepartmentId: string | null) {
  const scope = scopeOf(ctx, "messages:send");
  if (scope === "CLUB") return true;
  if (scope !== "DEPARTMENT" || target.audience === "ALL_MEMBERS") return false;
  if (target.audience === "DEPARTMENT") return ctx.ledDepartmentIds.includes(target.departmentId!);
  return eventDepartmentId !== null && ctx.ledDepartmentIds.includes(eventDepartmentId);
}

export interface ChatSummary {
  key: string;
  target: ChatTarget;
  title: string;
  last: { preview: string; author: string | null; mine: boolean; sentAt: Date };
  unread: number;
}

/** Alle Chats, in denen ich Nachrichten sehe – der mit der jüngsten Nachricht zuerst. */
export async function listChats(ctx: TenantContext): Promise<ChatSummary[]> {
  assertCan(ctx, "messages:read");
  const [received, managed] = await Promise.all([
    ctx.db.messageRecipient.findMany({
      where: { userId: ctx.userId, message: { deletedAt: null, status: "SENT" } },
      select: { readAt: true, message: { select } },
      orderBy: [{ message: { sentAt: "desc" } }, { id: "desc" }],
      take: CHAT_SCAN,
    }),
    can(ctx, "messages:send")
      ? ctx.db.message.findMany({
          where: {
            deletedAt: null,
            status: "SENT",
            ...(managesAll(ctx) ? {} : { authorUserId: ctx.userId }),
          },
          select,
          orderBy: [{ sentAt: "desc" }, { id: "desc" }],
          take: CHAT_SCAN,
        })
      : Promise.resolve([]),
  ]);
  const unread = new Set(received.filter((r) => r.readAt === null).map((r) => r.message.id));
  const rows = new Map<string, Row>();
  for (const row of [...received.map((r) => r.message), ...managed]) rows.set(row.id, row);
  const names = await authorNames(ctx, [...rows.values()]);

  const chats = new Map<string, ChatSummary>();
  const lastAt = new Map<string, number>();
  for (const row of rows.values()) {
    const target = targetOf(row);
    const key = chatKeyOf(target);
    const at = row.sentAt?.getTime() ?? 0;
    const chat = chats.get(key) ?? {
      key,
      target,
      title: chatTitle(row.audience, { department: row.department?.name, event: row.event?.title }),
      last: { preview: "", author: null, mine: false, sentAt: new Date(0) },
      unread: 0,
    };
    if (unread.has(row.id)) chat.unread += 1;
    if (at > (lastAt.get(key) ?? -1)) {
      lastAt.set(key, at);
      chat.last = {
        preview: chatPreview(row.subject, row.body),
        author: row.authorUserId ? (names.get(row.authorUserId) ?? null) : null,
        mine: row.authorUserId === ctx.userId,
        sentAt: row.sentAt ?? new Date(0),
      };
    }
    chats.set(key, chat);
  }
  return [...chats.values()].sort((a, b) => b.last.sentAt.getTime() - a.last.sentAt.getTime());
}

export interface ChatBubble {
  id: string;
  subject: string;
  body: string;
  /** Betreff eigens zeigen (nicht, wenn er nur der Anfang des Textes ist). */
  showSubject: boolean;
  sentAt: Date;
  author: string | null;
  mine: boolean;
  isAnnouncement: boolean;
  sendEmail: boolean;
  recipientCount: number;
  /** Nur für Absender/Verwalter: wie viele Empfänger die Nachricht geöffnet haben. */
  readCount: number | null;
  canDelete: boolean;
}

export interface ChatDetail {
  key: string;
  target: ChatTarget;
  title: string;
  /** Datum der Veranstaltung (Helfer-/Teilnehmer-Chats). */
  eventStartsAt: Date | null;
  canPost: boolean;
  /** Wie viele Personen eine neue Nachricht erreicht (nur wenn ich hier schreiben darf). */
  reach: number | null;
  messages: ChatBubble[];
  hasOlder: boolean;
}

/** Ziel des Chats aus der Datenbank (Name, Veranstaltungsdatum); `undefined`, wenn es das Ziel nicht (mehr) gibt. */
async function targetInfo(ctx: TenantContext, target: ChatTarget) {
  if (target.audience === "ALL_MEMBERS") return { name: null, startsAt: null, departmentId: null };
  if (target.audience === "DEPARTMENT") {
    const department = await ctx.db.department.findFirst({
      where: { id: target.departmentId!, isActive: true },
      select: { name: true },
    });
    return department ? { name: department.name, startsAt: null, departmentId: null } : undefined;
  }
  const event = await ctx.db.event.findFirst({
    where: { id: target.eventId!, deletedAt: null },
    select: { title: true, startsAt: true, departmentId: true },
  });
  return event
    ? { name: event.title, startsAt: event.startsAt, departmentId: event.departmentId }
    : undefined;
}

/**
 * Ein Chat mit den jüngsten `limit` Nachrichten (älteste zuerst). `null`, wenn es den Chat für mich nicht gibt – ein
 * noch leerer Chat existiert nur für die, die dort schreiben dürfen. Die gezeigten Nachrichten gelten als gelesen.
 */
export async function getChat(
  ctx: TenantContext,
  key: string,
  { limit = 50 }: { limit?: number } = {},
): Promise<ChatDetail | null> {
  assertCan(ctx, "messages:read");
  const target = parseChatKey(key);
  if (!target) return null;

  const visible: Prisma.MessageWhereInput = managesAll(ctx)
    ? {}
    : {
        OR: [
          { recipients: { some: { userId: ctx.userId } } },
          ...(can(ctx, "messages:send") ? [{ authorUserId: ctx.userId }] : []),
        ],
      };
  const [rows, info] = await Promise.all([
    ctx.db.message.findMany({
      where: {
        AND: [
          {
            deletedAt: null,
            status: "SENT",
            audience: target.audience,
            departmentId: target.departmentId,
            eventId: target.eventId,
          },
          visible,
        ],
      },
      select,
      orderBy: [{ sentAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    }),
    targetInfo(ctx, target),
  ]);
  const canPost = info !== undefined && canPostTo(ctx, target, info.departmentId);
  if (rows.length === 0 && !canPost) return null;

  const page = rows.slice(0, limit).reverse();
  const managedIds = page.filter((row) => manages(ctx, row)).map((row) => row.id);
  const [names, reads, reach] = await Promise.all([
    authorNames(ctx, page),
    managedIds.length
      ? ctx.db.messageRecipient.groupBy({
          by: ["messageId"],
          where: { messageId: { in: managedIds }, readAt: { not: null } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    canPost
      ? previewRecipients(ctx, {
          audience: target.audience,
          departmentId: target.departmentId ?? undefined,
          eventId: target.eventId ?? undefined,
        }).then(
          (preview) => preview.reachable,
          () => null, // Ziel inzwischen nicht mehr erlaubt oder verfügbar: keine Zahl
        )
      : Promise.resolve(null),
  ]);
  const readCounts = new Map(reads.map((entry) => [entry.messageId, entry._count._all]));

  // Geöffnet = gelesen – samt der zugehörigen Benachrichtigungen.
  const ids = page.map((row) => row.id);
  if (ids.length > 0) {
    const now = new Date();
    const marked = await ctx.db.messageRecipient.updateMany({
      where: { messageId: { in: ids }, userId: ctx.userId, readAt: null },
      data: { readAt: now },
    });
    if (marked.count > 0)
      await ctx.db.notification.updateMany({
        where: {
          userId: ctx.userId,
          readAt: null,
          linkUrl: { in: ids.map((id) => `/nachrichten/${id}`) },
        },
        data: { readAt: now },
      });
  }

  const newest = rows[0];
  return {
    key: chatKeyOf(target),
    target,
    title: chatTitle(target.audience, {
      department: info?.name ?? newest?.department?.name,
      event: info?.name ?? newest?.event?.title,
    }),
    eventStartsAt: info?.startsAt ?? newest?.event?.startsAt ?? null,
    canPost,
    reach,
    hasOlder: rows.length > limit,
    messages: page.map((row) => ({
      id: row.id,
      subject: row.subject,
      body: row.body,
      showSubject: showSubject(row.subject, row.body),
      sentAt: row.sentAt ?? new Date(0),
      author: row.authorUserId ? (names.get(row.authorUserId) ?? null) : null,
      mine: row.authorUserId === ctx.userId,
      isAnnouncement: row.isAnnouncement,
      sendEmail: row.sendEmail,
      recipientCount: row.recipientCount,
      readCount: manages(ctx, row) ? (readCounts.get(row.id) ?? 0) : null,
      canDelete: manages(ctx, row),
    })),
  };
}

/** Anzahl meiner Entwürfe (Hinweis in der Chatliste). */
export async function countDrafts(ctx: TenantContext): Promise<number> {
  if (!can(ctx, "messages:send")) return 0;
  return ctx.db.message.count({
    where: { deletedAt: null, status: "DRAFT", authorUserId: ctx.userId },
  });
}
