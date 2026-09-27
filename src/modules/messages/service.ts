import type { Prisma } from "@/generated/prisma/client";
import type { MessageStatus } from "@/generated/prisma/enums";
import { addBerlinDays, startOfBerlinDay } from "@/lib/dates";
import { paged, type PageRequest, type Paged } from "@/lib/search-params";
import { notifyUsers } from "@/modules/notifications/service";
import { recordAudit } from "@/server/audit/audit";
import type { TenantDb, TenantTx } from "@/server/db/tenant";
import { conflict, forbidden, isAppError, notFound, validationFailed } from "@/server/errors";
import { assertCan, can, scopeOf } from "@/server/permissions/policy";
import { assertNotRateLimited, enforceRateLimit } from "@/server/security/rate-limit";
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
 * Momentaufnahme gespeichert. Erreichbar sind Mitglieder mit aktivem Benutzerkonto in diesem Verein. Wer wohin senden
 * darf, bestimmt `messages:send` (seit 27.09.2026 hat es jede Rolle – wie in einer WhatsApp-Gruppe):
 * - Reichweite Verein (Vorstand, Verwaltung): alle Zielgruppen, auch als Ankündigung und per E-Mail;
 * - Abteilung (Abteilungsleitung): ebenso, aber nur die geleiteten Abteilungen und deren Veranstaltungen;
 * - außerdem darf JEDER in die Gruppen schreiben, zu denen er selbst gehört (alle Mitglieder, eigene Abteilungen,
 *   zugesagte Veranstaltungen, eigene Helfereinsätze) – als einfache Nachricht, ohne Ankündigung und E-Mail, mit
 *   Obergrenze je Stunde. Solche Nachrichten verwaltet nur ihr Verfasser (und der Verein, der alles zurückrufen kann).
 * Jede Person liest nur Nachrichten, die an sie adressiert sind. Der Text wird nie als HTML gerendert.
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

/** Namen der Verfasser (Vor- und Nachname) für die Anzeige. */
export async function authorNames(
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

type SendScope = "CLUB" | "DEPARTMENT" | "OWN";

function sendScope(ctx: TenantContext): SendScope {
  const scope = scopeOf(ctx, "messages:send");
  if (!scope) throw forbidden();
  return scope;
}

/** Wer ALLE gesendeten Nachrichten verwaltet (sehen, Lesestatistik, zurückrufen): nur der Verein. Sonst nur die eigenen. */
const managesAllMessages = (ctx: TenantContext) => scopeOf(ctx, "messages:send") === "CLUB";

/** Höchstens so viele Nachrichten je Stunde schreibt, wer nur als Mitglied einer Gruppe schreibt (gegen Massen-Nachrichten). */
export const MEMBER_MESSAGES_PER_HOUR = 30;
/** … und höchstens so oft speichert er Entwürfe (auch das Senden speichert zuerst) – keine unbegrenzten Datensätze. */
export const MEMBER_DRAFT_SAVES_PER_HOUR = 100;
const sendLimitKey = (ctx: TenantContext) => `message-send:${ctx.userId}`;

const ACTIVE_STATUSES = ["ACTIVE", "HONORARY", "PASSIVE"] as const;

/** Empfänger einer Zielgruppe: aktive Mitglieder (Status aktiv, Ehren- oder passives Mitglied), je nach Art eingegrenzt. */
function audienceWhere(
  audience: Audience,
  target: { departmentId?: string | undefined; eventId?: string | undefined },
): Prisma.MemberWhereInput {
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
  return where;
}

/** Gehöre ich selbst (mit aktivem Konto) zu dieser Zielgruppe – bekäme ich also Nachrichten an sie? */
async function belongsTo(ctx: TenantContext, db: Db, input: AudienceInput): Promise<boolean> {
  const count = await db.member.count({
    where: {
      AND: [
        audienceWhere(input.audience, input),
        { userId: ctx.userId, membership: { is: { status: "ACTIVE" } } },
      ],
    },
  });
  return count > 0;
}

/**
 * Prüft, dass die gewählte Zielgruppe für diesen Absender erlaubt ist, und liefert Abteilung/Veranstaltung.
 * `managed`: Der Absender schreibt als Verein bzw. Leitung (darf ankündigen und E-Mails senden); sonst nur als Mitglied
 * der Gruppe.
 */
async function checkAudience(ctx: TenantContext, db: Db, input: AudienceInput) {
  const scope = sendScope(ctx);
  let department: { id: string; name: string } | null = null;
  let event: { id: string; title: string; departmentId: string | null } | null = null;

  // Ohne Abteilung bzw. Veranstaltung keine Prüfung (sonst träfe `findFirst` irgendeine).
  if (input.audience === "DEPARTMENT" && !input.departmentId)
    throw validationFailed({ departmentId: ["Bitte wähle eine Abteilung."] });
  if (
    (input.audience === "EVENT_PARTICIPANTS" || input.audience === "EVENT_HELPERS") &&
    !input.eventId
  )
    throw validationFailed({ eventId: ["Bitte wähle eine Veranstaltung."] });

  if (input.audience === "DEPARTMENT") {
    department = await db.department.findFirst({
      where: { id: input.departmentId, isActive: true },
      select: { id: true, name: true },
    });
    if (!department)
      throw validationFailed({ departmentId: ["Diese Abteilung ist nicht verfügbar."] });
  } else if (input.audience === "EVENT_PARTICIPANTS" || input.audience === "EVENT_HELPERS") {
    event = await db.event.findFirst({
      where: { id: input.eventId, deletedAt: null },
      select: { id: true, title: true, departmentId: true },
    });
    if (!event) throw validationFailed({ eventId: ["Diese Veranstaltung ist nicht verfügbar."] });
  }

  const led = (departmentId: string | null | undefined) =>
    !!departmentId && ctx.ledDepartmentIds.includes(departmentId);
  const managed =
    scope === "CLUB" ||
    (scope === "DEPARTMENT" &&
      (department ? led(department.id) : event ? led(event.departmentId) : false));
  if (managed) return { department, event, managed };

  // Nicht als Leitung: nur in eine Gruppe, zu der man selbst gehört.
  if (await belongsTo(ctx, db, input)) return { department, event, managed };
  if (department)
    throw validationFailed({
      departmentId: [
        scope === "DEPARTMENT"
          ? "Du kannst nur an deine eigene Abteilung schreiben – oder an eine, zu der du gehörst."
          : "Du kannst nur an Abteilungen schreiben, zu denen du gehörst.",
      ],
    });
  if (event)
    throw validationFailed({
      eventId: [
        input.audience === "EVENT_HELPERS"
          ? "Du kannst nur an die Helfer von Veranstaltungen schreiben, bei denen du selbst eingetragen bist."
          : "Du kannst nur an die Teilnehmer von Veranstaltungen schreiben, bei denen du zugesagt hast.",
      ],
    });
  throw validationFailed({
    audience: ["Du kannst nur an Gruppen schreiben, zu denen du gehörst."],
  });
}

/** Ankündigung und E-Mail gibt es nur, wer als Verein bzw. Leitung schreibt. */
function checkExtras(managed: boolean, input: { isAnnouncement: boolean; sendEmail: boolean }) {
  if (managed || (!input.isAnnouncement && !input.sendEmail)) return;
  throw validationFailed({
    ...(input.isAnnouncement
      ? { isAnnouncement: ["Ankündigungen schreiben nur Vorstand und Abteilungsleitung."] }
      : {}),
    ...(input.sendEmail
      ? { sendEmail: ["Per E-Mail senden nur Vorstand und Abteilungsleitung."] }
      : {}),
  });
}

/**
 * Darf ich in diese Gruppe schreiben – und auch ankündigen bzw. per E-Mail senden? Für den Chat (Eingabezeile zeigen oder
 * nicht). Wirft nicht; der Versand prüft dieselben Regeln erneut.
 */
export async function postingRights(
  ctx: TenantContext,
  input: AudienceInput,
): Promise<{ canPost: boolean; canAnnounce: boolean }> {
  if (!can(ctx, "messages:send")) return { canPost: false, canAnnounce: false };
  try {
    const { managed } = await checkAudience(ctx, ctx.db, input);
    return { canPost: true, canAnnounce: managed };
  } catch (error) {
    if (isAppError(error) && (error.code === "VALIDATION" || error.code === "FORBIDDEN"))
      return { canPost: false, canAnnounce: false };
    throw error;
  }
}

export interface RecipientResolution {
  reachable: { memberId: string; userId: string }[];
  /** Mitglieder der Zielgruppe ohne aktives Benutzerkonto (kein Konto oder gesperrt) – sie können nicht erreicht werden. */
  unreachable: number;
}

async function resolveRecipients(
  db: Db,
  audience: Audience,
  target: { departmentId?: string; eventId?: string },
): Promise<RecipientResolution> {
  const members = await db.member.findMany({
    where: audienceWhere(audience, target),
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
  // Wie beim Versand: Der Absender selbst ist kein Empfänger (sonst stünde hier immer einer zu viel).
  const others = resolved.reachable.filter((r) => r.userId !== ctx.userId);
  return { reachable: others.length, unreachable: resolved.unreachable };
}

export interface ComposeOptions {
  scope: SendScope;
  /** Darf ich an alle Mitglieder schreiben (als Verein oder weil ich selbst Mitglied bin)? */
  allMembers: boolean;
  /** `managed`: als Leitung bzw. Verein – dann gibt es auch Ankündigung und E-Mail. */
  departments: { id: string; name: string; managed: boolean }[];
  /** `asParticipant`/`asHelper`: an die Teilnehmer bzw. Helfer dieser Veranstaltung darf ich schreiben. */
  events: {
    id: string;
    title: string;
    startsAt: Date;
    managed: boolean;
    asParticipant: boolean;
    asHelper: boolean;
  }[];
}

/**
 * Auswahllisten für das Formular – im Rahmen dessen, was der Absender erreichen darf: der Verein alles, die Leitung ihre
 * Abteilungen und deren Veranstaltungen, dazu jeder die eigenen Gruppen. `include`: eine Gruppe, aus deren Chat man kommt
 * („Mit Betreff schreiben“) – sie steht auch dann in der Liste, wenn sie sonst herausfiele (z. B. eine länger
 * zurückliegende Veranstaltung), solange man dort schreiben darf. `null`, wenn es nichts gibt, wohin ich schreiben kann.
 */
export async function getComposeOptions(
  ctx: TenantContext,
  { include }: { include?: AudienceInput } = {},
): Promise<ComposeOptions | null> {
  const scope = scopeOf(ctx, "messages:send");
  if (!scope) return null;
  const club = scope === "CLUB";
  const led = scope === "DEPARTMENT" ? [...ctx.ledDepartmentIds] : [];
  // Meine eigenen Gruppen (als Mitglied mit aktivem Konto): Abteilungen, zugesagte Veranstaltungen, Helfereinsätze.
  const me: Prisma.MemberWhereInput = {
    ...audienceWhere("ALL_MEMBERS", {}),
    userId: ctx.userId,
    membership: { is: { status: "ACTIVE" } },
  };
  const accepted: Prisma.EventParticipantWhereInput = { status: "ACCEPTED", member: { is: me } };
  const helping: Prisma.EventShiftWhereInput = {
    deletedAt: null,
    status: { not: "CANCELLED" },
    assignments: { some: { status: "CONFIRMED", member: { is: me } } },
  };
  const [isMember, departments, events] = await Promise.all([
    club ? Promise.resolve(true) : ctx.db.member.count({ where: me }).then((n) => n > 0),
    ctx.db.department.findMany({
      where: {
        isActive: true,
        ...(club
          ? {}
          : { OR: [{ id: { in: led } }, { members: { some: { member: { is: me } } } }] }),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      take: 200,
    }),
    ctx.db.event.findMany({
      where: {
        deletedAt: null,
        status: { in: ["PUBLISHED", "COMPLETED"] },
        endsAt: { gte: addBerlinDays(startOfBerlinDay(new Date()), -30) },
        ...(club
          ? {}
          : {
              OR: [
                { departmentId: { in: led } },
                { participants: { some: accepted } },
                { shifts: { some: helping } },
              ],
            }),
      },
      orderBy: { startsAt: "asc" },
      select: {
        id: true,
        title: true,
        startsAt: true,
        departmentId: true,
        participants: { where: accepted, select: { id: true }, take: 1 },
        shifts: { where: helping, select: { id: true }, take: 1 },
      },
      take: 200,
    }),
  ]);
  const isLed = (id: string | null) => club || (!!id && led.includes(id));
  const options: ComposeOptions = {
    scope,
    allMembers: isMember,
    departments: departments.map((d) => ({ ...d, managed: isLed(d.id) })),
    events: events.map((e) => {
      const managed = isLed(e.departmentId);
      return {
        id: e.id,
        title: e.title,
        startsAt: e.startsAt,
        managed,
        asParticipant: managed || e.participants.length > 0,
        asHelper: managed || e.shifts.length > 0,
      };
    }),
  };
  if (include) await includeTarget(ctx, options, include);
  if (!options.allMembers && options.departments.length === 0 && options.events.length === 0)
    return null;
  return options;
}

/** Nimmt die Gruppe eines Chats in die Auswahl auf, falls sie fehlt und ich dort schreiben darf. */
async function includeTarget(ctx: TenantContext, options: ComposeOptions, target: AudienceInput) {
  if (target.audience === "ALL_MEMBERS") return;
  const rights = await postingRights(ctx, target);
  if (!rights.canPost) return;
  if (target.audience === "DEPARTMENT") {
    if (options.departments.some((d) => d.id === target.departmentId)) return;
    const department = await ctx.db.department.findFirst({
      where: { id: target.departmentId, isActive: true },
      select: { id: true, name: true },
    });
    if (department) options.departments.push({ ...department, managed: rights.canAnnounce });
    return;
  }
  const asParticipant = target.audience === "EVENT_PARTICIPANTS";
  const known = options.events.find((e) => e.id === target.eventId);
  if (known) {
    if (asParticipant) known.asParticipant = true;
    else known.asHelper = true;
    return;
  }
  const event = await ctx.db.event.findFirst({
    where: { id: target.eventId, deletedAt: null },
    select: { id: true, title: true, startsAt: true },
  });
  if (event)
    options.events.push({
      ...event,
      managed: rights.canAnnounce,
      asParticipant: rights.canAnnounce || asParticipant,
      asHelper: rights.canAnnounce || !asParticipant,
    });
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
    can(ctx, "messages:send") && (managesAllMessages(ctx) || row.authorUserId === ctx.userId);
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

/** Für Absender: gesendete Nachrichten bzw. Entwürfe. Verein = alle; alle anderen = die selbst verfassten. */
export async function listSent(
  ctx: TenantContext,
  view: "sent" | "drafts",
  request: PageRequest,
): Promise<Paged<MessageDto>> {
  sendScope(ctx);
  const where: Prisma.MessageWhereInput = {
    deletedAt: null,
    status: view === "drafts" ? "DRAFT" : "SENT",
    // Entwürfe sind persönlich; gesendete Nachrichten sieht der Verein vollständig, alle anderen nur ihre eigenen.
    ...(view === "drafts" || !managesAllMessages(ctx) ? { authorUserId: ctx.userId } : {}),
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
  // Verein: alle gesendeten Nachrichten plus eigene Entwürfe. Alle anderen: nur die selbst verfassten.
  const visible: Prisma.MessageWhereInput = managesAllMessages(ctx)
    ? { OR: [{ status: "SENT" }, { authorUserId: ctx.userId }] }
    : { authorUserId: ctx.userId };
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
  const { department, event, managed } = await checkAudience(ctx, ctx.db, input);
  checkExtras(managed, input);
  if (!managed) {
    // Schon an der Obergrenze? Dann gar nicht erst speichern (sonst bliebe bei jedem Versuch ein Entwurf liegen).
    await assertNotRateLimited(sendLimitKey(ctx), MEMBER_MESSAGES_PER_HOUR);
    await enforceRateLimit(`message-draft:${ctx.userId}`, MEMBER_DRAFT_SAVES_PER_HOUR, 3600);
  }
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
  // Zielgruppe und Reichweite erneut prüfen – Rechte, Gruppe oder Veranstaltung können sich seit dem Entwurf geändert haben.
  const { managed } = await checkAudience(ctx, ctx.db, {
    audience,
    departmentId: draft.departmentId ?? undefined,
    eventId: draft.eventId ?? undefined,
  });
  checkExtras(managed, draft);
  // Wer nur als Mitglied der Gruppe schreibt, hat eine Obergrenze je Stunde (Vorstand und Leitung nicht).
  if (!managed) await enforceRateLimit(sendLimitKey(ctx), MEMBER_MESSAGES_PER_HOUR, 3600);

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
          resolved.reachable.length > 0
            ? "Außer dir hat in dieser Gruppe niemand ein aktives Benutzerkonto – die Nachricht würde niemanden erreichen."
            : "Diese Zielgruppe enthält niemanden, der erreicht werden kann (kein aktives Benutzerkonto).",
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
      ...(managesAllMessages(ctx) ? {} : { authorUserId: ctx.userId }),
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

/**
 * Verwirft einen gerade erst angelegten, nie gesendeten Entwurf (Senden direkt aus Chat oder Formular ist gescheitert – der
 * Text steht dort noch). Endgültig, ohne Protokoll: Er hatte nie Empfänger.
 */
export async function discardDraft(ctx: TenantContext, id: string): Promise<void> {
  await ctx.db.message.deleteMany({ where: { id, status: "DRAFT", authorUserId: ctx.userId } });
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
