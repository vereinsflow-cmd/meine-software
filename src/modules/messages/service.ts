import type { Prisma } from "@/generated/prisma/client";
import type { MessageStatus } from "@/generated/prisma/enums";
import { addBerlinDays, startOfBerlinDay } from "@/lib/dates";
import { paged, type PageRequest, type Paged } from "@/lib/search-params";
import { notifyUsers } from "@/modules/notifications/service";
import { recordAudit } from "@/server/audit/audit";
import type { TenantDb, TenantTx } from "@/server/db/tenant";
import { conflict, forbidden, notFound, validationFailed } from "@/server/errors";
import { assertCan, can, scopeOf } from "@/server/permissions/policy";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import type { Audience, MessageInput } from "./schemas";

/** Zielgruppe einer Nachricht; Abteilung/Veranstaltung nur, wo die Art sie verlangt. */
export interface AudienceInput {
  audience: Audience;
  departmentId?: string | undefined;
  eventId?: string | undefined;
}

/**
 * Nachrichten und Ankündigungen an Gruppen von Mitgliedern.
 *
 * Empfänger werden beim VERSAND serverseitig aus der Zielgruppe ermittelt (nie aus Client-Angaben) und als
 * Momentaufnahme gespeichert. Erreichbar sind Mitglieder mit aktivem Benutzerkonto in diesem Verein. Wer senden darf,
 * bestimmt `messages:send`: der Verein (alle Zielgruppen) oder Abteilungsleiter (nur die eigene Abteilung bzw. deren
 * Veranstaltungen). Jede Person liest nur Nachrichten, die an sie adressiert sind. Der Text wird nie als HTML gerendert.
 * Gesendete Nachrichten sind unveränderlich; nur Entwürfe lassen sich bearbeiten. Löschen ist "weich" (Rückruf).
 */
type Db = TenantDb | TenantTx;

export interface MessageDto {
  id: string;
  subject: string;
  body: string;
  audience: Audience;
  department: { id: string; name: string } | null;
  event: { id: string; title: string } | null;
  isAnnouncement: boolean;
  sendEmail: boolean;
  status: MessageStatus;
  sentAt: Date | null;
  createdAt: Date;
  author: string | null;
  recipientCount: number;
  /** Nur für Absender/Verwalter: wie viele Empfänger die Nachricht geöffnet haben. */
  readCount: number | null;
  /** Nur für Empfänger: schon gelesen? */
  readByMe: boolean | null;
  can: { edit: boolean; delete: boolean };
}

const include = {
  department: { select: { id: true, name: true } },
  event: { select: { id: true, title: true } },
} satisfies Prisma.MessageInclude;
type MessageRow = Prisma.MessageGetPayload<{ include: typeof include }>;

async function authorNames(
  ctx: TenantContext,
  rows: { authorUserId: string | null }[],
): Promise<Map<string, string>> {
  const ids = [
    ...new Set(rows.map((r) => r.authorUserId).filter((id): id is string => id !== null)),
  ];
  if (ids.length === 0) return new Map();
  const people = await ctx.db.clubMembership.findMany({
    where: { userId: { in: ids } },
    select: { userId: true, user: { select: { firstName: true, lastName: true } } },
  });
  return new Map(people.map((p) => [p.userId, `${p.user.firstName} ${p.user.lastName}`]));
}

// ---------------------------------------------------------------------------------------------
// Berechtigungen und Zielgruppen
// ---------------------------------------------------------------------------------------------

function sendScope(ctx: TenantContext): "CLUB" | "DEPARTMENT" {
  const scope = scopeOf(ctx, "messages:send");
  if (scope !== "CLUB" && scope !== "DEPARTMENT") throw forbidden();
  return scope;
}

/** Prüft, dass die gewählte Zielgruppe für diesen Absender erlaubt ist, und liefert Abteilung/Veranstaltung. */
async function checkAudience(ctx: TenantContext, db: Db, input: AudienceInput) {
  const scope = sendScope(ctx);
  let department: { id: string; name: string } | null = null;
  let event: { id: string; title: string; departmentId: string | null } | null = null;

  if (input.audience === "DEPARTMENT") {
    department = await db.department.findFirst({
      where: { id: input.departmentId!, isActive: true },
      select: { id: true, name: true },
    });
    if (!department)
      throw validationFailed({ departmentId: ["Diese Abteilung ist nicht verfügbar."] });
    if (scope === "DEPARTMENT" && !ctx.ledDepartmentIds.includes(department.id))
      throw validationFailed({
        departmentId: ["Du kannst nur an deine eigene Abteilung schreiben."],
      });
  } else if (input.audience === "EVENT_PARTICIPANTS" || input.audience === "EVENT_HELPERS") {
    event = await db.event.findFirst({
      where: { id: input.eventId!, deletedAt: null },
      select: { id: true, title: true, departmentId: true },
    });
    if (!event) throw validationFailed({ eventId: ["Diese Veranstaltung ist nicht verfügbar."] });
    if (
      scope === "DEPARTMENT" &&
      !(event.departmentId && ctx.ledDepartmentIds.includes(event.departmentId))
    )
      throw validationFailed({
        eventId: [
          "Du kannst nur an Teilnehmer und Helfer von Veranstaltungen deiner Abteilung schreiben.",
        ],
      });
  } else if (scope === "DEPARTMENT") {
    throw validationFailed({
      audience: [
        "Du kannst nur an deine Abteilung oder an Veranstaltungen deiner Abteilung schreiben.",
      ],
    });
  }
  return { department, event };
}

export interface RecipientResolution {
  reachable: { memberId: string; userId: string }[];
  /** Mitglieder der Zielgruppe ohne aktives Benutzerkonto (kein Konto oder gesperrt) – sie können nicht erreicht werden. */
  unreachable: number;
}

const ACTIVE_STATUSES = ["ACTIVE", "HONORARY", "PASSIVE"] as const;

async function resolveRecipients(
  db: Db,
  audience: Audience,
  target: { departmentId?: string; eventId?: string },
): Promise<RecipientResolution> {
  const where: Prisma.MemberWhereInput = {
    archivedAt: null,
    deletedAt: null,
    status: { in: [...ACTIVE_STATUSES] },
  };
  if (audience === "DEPARTMENT")
    where.departments = { some: { departmentId: target.departmentId } };
  if (audience === "EVENT_PARTICIPANTS")
    where.participations = { some: { eventId: target.eventId, status: "ACCEPTED" } };
  if (audience === "EVENT_HELPERS")
    where.shiftAssignments = {
      some: {
        status: "CONFIRMED",
        shift: { eventId: target.eventId, deletedAt: null, status: { not: "CANCELLED" } },
      },
    };

  const members = await db.member.findMany({
    where,
    select: { id: true, userId: true, membership: { select: { status: true } } },
    take: 5000,
  });
  const reachable = members
    .filter((m) => m.userId !== null && m.membership?.status === "ACTIVE")
    .map((m) => ({ memberId: m.id, userId: m.userId! }));
  return { reachable, unreachable: members.length - reachable.length };
}

/** Wie viele Personen würde die Nachricht erreichen? (Für die Anzeige im Formular.) */
export async function previewRecipients(
  ctx: TenantContext,
  input: AudienceInput,
): Promise<{ reachable: number; unreachable: number }> {
  await checkAudience(ctx, ctx.db, input);
  const resolved = await resolveRecipients(ctx.db, input.audience, {
    departmentId: input.departmentId,
    eventId: input.eventId,
  });
  return { reachable: resolved.reachable.length, unreachable: resolved.unreachable };
}

/** Auswahllisten für das Formular – im Rahmen dessen, was der Absender erreichen darf. */
export async function getComposeOptions(ctx: TenantContext): Promise<{
  scope: "CLUB" | "DEPARTMENT";
  departments: { id: string; name: string }[];
  events: { id: string; title: string }[];
} | null> {
  const scope = scopeOf(ctx, "messages:send");
  if (scope !== "CLUB" && scope !== "DEPARTMENT") return null;
  const ids = scope === "DEPARTMENT" ? [...ctx.ledDepartmentIds] : null;
  const [departments, events] = await Promise.all([
    ctx.db.department.findMany({
      where: { isActive: true, ...(ids ? { id: { in: ids } } : {}) },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      take: 200,
    }),
    ctx.db.event.findMany({
      where: {
        deletedAt: null,
        status: { in: ["PUBLISHED", "COMPLETED"] },
        endsAt: { gte: addBerlinDays(startOfBerlinDay(new Date()), -30) },
        ...(ids ? { departmentId: { in: ids } } : {}),
      },
      orderBy: { startsAt: "asc" },
      select: { id: true, title: true },
      take: 200,
    }),
  ]);
  return { scope, departments, events };
}

// ---------------------------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------------------------

async function toDto(
  ctx: TenantContext,
  row: MessageRow,
  names: Map<string, string>,
  extra: { readCount: number | null; readByMe: boolean | null },
): Promise<MessageDto> {
  const manage =
    can(ctx, "messages:send") &&
    (scopeOf(ctx, "messages:send") === "CLUB" || row.authorUserId === ctx.userId);
  return {
    id: row.id,
    subject: row.subject,
    body: row.body,
    audience: row.audience,
    department: row.department,
    event: row.event,
    isAnnouncement: row.isAnnouncement,
    sendEmail: row.sendEmail,
    status: row.status,
    sentAt: row.sentAt,
    createdAt: row.createdAt,
    author: row.authorUserId ? (names.get(row.authorUserId) ?? null) : null,
    recipientCount: row.recipientCount,
    readCount: extra.readCount,
    readByMe: extra.readByMe,
    can: { edit: manage && row.status === "DRAFT", delete: manage },
  };
}

/** Posteingang: an mich adressierte, gesendete Nachrichten – neueste zuerst. */
export async function listInbox(
  ctx: TenantContext,
  request: PageRequest,
  options: { unreadOnly?: boolean } = {},
): Promise<Paged<MessageDto>> {
  assertCan(ctx, "messages:read");
  const where: Prisma.MessageRecipientWhereInput = {
    userId: ctx.userId,
    message: { deletedAt: null, status: "SENT" },
    ...(options.unreadOnly ? { readAt: null } : {}),
  };
  const [rows, total] = await Promise.all([
    ctx.db.messageRecipient.findMany({
      where,
      include: { message: { include } },
      orderBy: [{ message: { sentAt: "desc" } }, { id: "desc" }],
      skip: request.skip,
      take: request.pageSize,
    }),
    ctx.db.messageRecipient.count({ where }),
  ]);
  const names = await authorNames(
    ctx,
    rows.map((r) => r.message),
  );
  const items = await Promise.all(
    rows.map((r) => toDto(ctx, r.message, names, { readCount: null, readByMe: r.readAt !== null })),
  );
  return paged(items, total, request);
}

export async function countUnreadMessages(ctx: TenantContext): Promise<number> {
  return ctx.db.messageRecipient.count({
    where: { userId: ctx.userId, readAt: null, message: { deletedAt: null, status: "SENT" } },
  });
}

/** Für Absender: gesendete Nachrichten bzw. Entwürfe. Verein = alle; Abteilungsleiter = die selbst verfassten. */
export async function listSent(
  ctx: TenantContext,
  view: "sent" | "drafts",
  request: PageRequest,
): Promise<Paged<MessageDto>> {
  sendScope(ctx);
  const where: Prisma.MessageWhereInput = {
    deletedAt: null,
    status: view === "drafts" ? "DRAFT" : "SENT",
    // Entwürfe sind persönlich; gesendete Nachrichten sieht der Verein vollständig.
    ...(view === "drafts" || scopeOf(ctx, "messages:send") === "DEPARTMENT"
      ? { authorUserId: ctx.userId }
      : {}),
  };
  const [rows, total] = await Promise.all([
    ctx.db.message.findMany({
      where,
      include,
      orderBy: [{ sentAt: { sort: "desc", nulls: "first" } }, { createdAt: "desc" }],
      skip: request.skip,
      take: request.pageSize,
    }),
    ctx.db.message.count({ where }),
  ]);
  const [names, reads] = await Promise.all([
    authorNames(ctx, rows),
    rows.length
      ? ctx.db.messageRecipient.groupBy({
          by: ["messageId"],
          where: { messageId: { in: rows.map((r) => r.id) }, readAt: { not: null } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);
  const readCounts = new Map(reads.map((r) => [r.messageId, r._count._all]));
  const items = await Promise.all(
    rows.map((r) =>
      toDto(ctx, r, names, {
        readCount: r.status === "SENT" ? (readCounts.get(r.id) ?? 0) : null,
        readByMe: null,
      }),
    ),
  );
  return paged(items, total, request);
}

/**
 * Eine Nachricht öffnen. Empfänger sehen ihre eigene (und markieren sie damit als gelesen); Absender/Verwalter sehen die
 * Nachrichten, die sie verwalten dürfen (mit Lesestatistik). Alles andere ist "nicht gefunden".
 */
export async function getMessage(ctx: TenantContext, id: string): Promise<MessageDto> {
  assertCan(ctx, "messages:read");
  const mine = await ctx.db.messageRecipient.findFirst({
    where: { messageId: id, userId: ctx.userId, message: { deletedAt: null, status: "SENT" } },
    include: { message: { include } },
  });
  if (mine) {
    const now = new Date();
    if (!mine.readAt) {
      await ctx.db.messageRecipient.updateMany({
        where: { id: mine.id, readAt: null },
        data: { readAt: now },
      });
      // Die zugehörige Benachrichtigung ist damit ebenfalls erledigt.
      await ctx.db.notification.updateMany({
        where: { userId: ctx.userId, linkUrl: `/nachrichten/${id}`, readAt: null },
        data: { readAt: now },
      });
    }
    return toDto(ctx, mine.message, await authorNames(ctx, [mine.message]), {
      readCount: null,
      readByMe: true,
    });
  }

  if (!can(ctx, "messages:send")) throw notFound("Die Nachricht");
  // Verein: alle gesendeten Nachrichten plus eigene Entwürfe. Abteilungsleiter: nur die selbst verfassten.
  const visible: Prisma.MessageWhereInput =
    scopeOf(ctx, "messages:send") === "DEPARTMENT"
      ? { authorUserId: ctx.userId }
      : { OR: [{ status: "SENT" }, { authorUserId: ctx.userId }] };
  const row = await ctx.db.message.findFirst({
    where: { AND: [{ id, deletedAt: null }, visible] },
    include,
  });
  if (!row) throw notFound("Die Nachricht");
  const readCount =
    row.status === "SENT"
      ? await ctx.db.messageRecipient.count({ where: { messageId: id, readAt: { not: null } } })
      : null;
  return toDto(ctx, row, await authorNames(ctx, [row]), { readCount, readByMe: null });
}

// ---------------------------------------------------------------------------------------------
// Schreiben
// ---------------------------------------------------------------------------------------------

async function loadOwnDraft(ctx: TenantContext, id: string) {
  sendScope(ctx);
  const draft = await ctx.db.message.findFirst({
    where: { id, deletedAt: null, authorUserId: ctx.userId },
  });
  if (!draft) throw notFound("Der Entwurf");
  if (draft.status !== "DRAFT")
    throw conflict("Diese Nachricht wurde bereits gesendet und lässt sich nicht mehr ändern.");
  return draft;
}

export async function saveDraft(
  ctx: TenantContext,
  input: MessageInput,
  id?: string,
): Promise<{ id: string }> {
  const { department, event } = await checkAudience(ctx, ctx.db, input);
  if (id) await loadOwnDraft(ctx, id);
  const data = {
    subject: input.subject,
    body: input.body,
    audience: input.audience,
    departmentId: department?.id ?? null,
    eventId: event?.id ?? null,
    isAnnouncement: input.isAnnouncement,
    sendEmail: input.sendEmail,
  };
  if (id) {
    await ctx.db.message.update({ where: { id }, data });
    return { id };
  }
  const created = await ctx.db.message.create({
    data: { ...data, clubId: ctx.clubId, authorUserId: ctx.userId, status: "DRAFT" },
  });
  return { id: created.id };
}

/** Sendet einen Entwurf: Empfänger festhalten, benachrichtigen, Status "gesendet". Wiederholtes Senden ist ein Fehler (kein Doppelversand). */
export async function sendDraft(
  ctx: TenantContext,
  id: string,
): Promise<{ recipients: number; unreachable: number }> {
  const draft = await loadOwnDraft(ctx, id);
  const audience = draft.audience;
  // Zielgruppe und Reichweite erneut prüfen – Rechte oder Veranstaltung können sich seit dem Entwurf geändert haben.
  await checkAudience(ctx, ctx.db, {
    audience,
    departmentId: draft.departmentId ?? undefined,
    eventId: draft.eventId ?? undefined,
  });

  return ctx.db.$transaction(async (tx) => {
    // Bedingtes Update: Nur EIN paralleler Versand gewinnt.
    const claimed = await tx.message.updateMany({
      where: { id, status: "DRAFT", deletedAt: null },
      data: { status: "SENT", sentAt: new Date() },
    });
    if (claimed.count === 0) throw conflict("Diese Nachricht wurde bereits gesendet.");

    const resolved = await resolveRecipients(tx, audience, {
      departmentId: draft.departmentId ?? undefined,
      eventId: draft.eventId ?? undefined,
    });
    // Der Absender ist nie Empfänger der eigenen Nachricht (sie steht in seiner Liste "Gesendet", mit Lesestatistik).
    const recipients = resolved.reachable.filter((r) => r.userId !== ctx.userId);
    if (recipients.length === 0)
      throw validationFailed({
        audience: [
          "Diese Zielgruppe enthält niemanden, der erreicht werden kann (kein aktives Benutzerkonto).",
        ],
      });

    await tx.messageRecipient.createMany({
      data: recipients.map((r) => ({
        clubId: ctx.clubId,
        messageId: id,
        memberId: r.memberId,
        userId: r.userId,
      })),
      skipDuplicates: true,
    });
    await tx.message.update({ where: { id }, data: { recipientCount: recipients.length } });

    await notifyUsers(tx, ctx.clubId, {
      userIds: recipients.map((r) => r.userId),
      type: "MESSAGE",
      title: `${draft.isAnnouncement ? "Ankündigung" : "Neue Nachricht"}: ${draft.subject}`.slice(
        0,
        200,
      ),
      body: draft.body.length > 200 ? `${draft.body.slice(0, 197)}…` : draft.body,
      linkUrl: `/nachrichten/${id}`,
      email: draft.sendEmail,
      dedupeKey: () => `message:${id}`,
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "message.sent",
      entityType: "Message",
      entityId: id,
      summary: `Nachricht „${draft.subject}“ an ${recipients.length} ${recipients.length === 1 ? "Person" : "Personen"} gesendet`,
    });
    return { recipients: recipients.length, unreachable: resolved.unreachable };
  });
}

export async function deleteMessage(ctx: TenantContext, id: string): Promise<void> {
  sendScope(ctx);
  const row = await ctx.db.message.findFirst({
    where: {
      id,
      deletedAt: null,
      ...(scopeOf(ctx, "messages:send") === "DEPARTMENT" ? { authorUserId: ctx.userId } : {}),
    },
  });
  if (!row) throw notFound("Die Nachricht");
  await ctx.db.$transaction(async (tx) => {
    await tx.message.update({ where: { id }, data: { deletedAt: new Date() } });
    await recordAudit(tx, auditActor(ctx), {
      action: "message.deleted",
      entityType: "Message",
      entityId: id,
      summary: `Nachricht „${row.subject}“ ${row.status === "DRAFT" ? "(Entwurf) " : ""}gelöscht`,
    });
  });
}

/** Werte für das Formular beim Bearbeiten eines Entwurfs. */
export async function getDraftForEdit(ctx: TenantContext, id: string): Promise<MessageInput> {
  const draft = await loadOwnDraft(ctx, id);
  return {
    subject: draft.subject,
    body: draft.body,
    audience: draft.audience,
    departmentId: draft.departmentId ?? undefined,
    eventId: draft.eventId ?? undefined,
    isAnnouncement: draft.isAnnouncement,
    sendEmail: draft.sendEmail,
  };
}
