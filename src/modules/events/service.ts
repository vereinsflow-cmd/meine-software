import { randomUUID } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type {
  EventStatus,
  EventType,
  EventVisibility,
  ParticipantStatus,
} from "@/generated/prisma/enums";
import { addBerlinDays, berlinParts, toDateInputValue, toTimeInputValue } from "@/lib/dates";
import { expandSeries } from "@/lib/recurrence";
import { paged, type PageRequest, type Paged } from "@/lib/search-params";
import { notifyUsers } from "@/modules/notifications/service";
import { diffChanges, recordAudit } from "@/server/audit/audit";
import type { TenantDb, TenantTx } from "@/server/db/tenant";
import { badRequest, forbidden, notFound, validationFailed } from "@/server/errors";
import { assertCan, can, scopeOf, type ResourceRef } from "@/server/permissions/policy";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import { normalizeEventTimes, type EventInput } from "./schemas";

/**
 * Veranstaltungen – Geschäftslogik.
 *
 * Sichtbarkeit: Veröffentlichte, abgeschlossene und abgesagte Veranstaltungen sehen alle Mitglieder. Entwürfe sehen
 * nur, wer die Veranstaltung bearbeiten darf; Archivierte nur, wer archivieren darf. Gelöschte sieht niemand.
 * Jede Änderung wird protokolliert; Änderungen an veröffentlichten Terminen benachrichtigen Teilnehmer und Helfer.
 */
const dbOf = (ctx: TenantContext) => ctx.db;
type Db = TenantDb | TenantTx;

const eventInclude = {
  department: { select: { id: true, name: true, color: true } },
  contactMember: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.EventInclude;
type EventRow = Prisma.EventGetPayload<{ include: typeof eventInclude }>;

const resourceOf = (event: { departmentId: string | null }): ResourceRef => ({
  departmentIds: event.departmentId ? [event.departmentId] : [],
});

/** Filter für alle Veranstaltungen, die der Benutzer sehen darf (auch vom Kalender wiederverwendet). */
export function eventVisibilityWhere(ctx: TenantContext): Prisma.EventWhereInput {
  const alternatives: Prisma.EventWhereInput[] = [
    { status: { in: ["PUBLISHED", "COMPLETED", "CANCELLED"] } },
  ];
  const scoped = (
    status: EventStatus,
    scope: ReturnType<typeof scopeOf>,
  ): Prisma.EventWhereInput | null =>
    scope === "CLUB"
      ? { status }
      : scope === "DEPARTMENT"
        ? { status, departmentId: { in: [...ctx.ledDepartmentIds] } }
        : null;
  const drafts = scoped("DRAFT", scopeOf(ctx, "events:update"));
  const archived = scoped("ARCHIVED", scopeOf(ctx, "events:archive"));
  if (drafts) alternatives.push(drafts);
  if (archived) alternatives.push(archived);
  return { deletedAt: null, OR: alternatives };
}

function canSee(
  ctx: TenantContext,
  event: { status: EventStatus; departmentId: string | null; deletedAt: Date | null },
): boolean {
  if (event.deletedAt) return false;
  if (event.status === "PUBLISHED" || event.status === "COMPLETED" || event.status === "CANCELLED")
    return true;
  if (event.status === "DRAFT") return can(ctx, "events:update", resourceOf(event));
  return can(ctx, "events:archive", resourceOf(event));
}

// ---------------------------------------------------------------------------------------------
// Lesen
// ---------------------------------------------------------------------------------------------

export interface ShiftSummary {
  shifts: number;
  required: number;
  filled: number;
}

export interface EventListItem {
  id: string;
  title: string;
  type: EventType;
  status: EventStatus;
  visibility: EventVisibility;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  locationName: string | null;
  department: { id: string; name: string; color: string | null } | null;
  maxParticipants: number | null;
  registrationRequired: boolean;
  acceptedCount: number;
  waitlistCount: number;
  myStatus: ParticipantStatus | null;
  shiftSummary: ShiftSummary;
  seriesId: string | null;
}

export interface EventListQuery {
  q?: string;
  status?: EventStatus;
  type?: EventType;
  departmentId?: string;
  period: "upcoming" | "past" | "all";
  request: PageRequest;
}

async function decorate(ctx: TenantContext, rows: EventRow[]): Promise<EventListItem[]> {
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];
  const [counts, shifts, mine] = await Promise.all([
    ctx.db.eventParticipant.groupBy({
      by: ["eventId", "status"],
      where: { eventId: { in: ids } },
      _count: { _all: true },
    }),
    ctx.db.eventShift.findMany({
      where: { eventId: { in: ids }, deletedAt: null, status: { not: "CANCELLED" } },
      select: {
        eventId: true,
        requiredCount: true,
        _count: { select: { assignments: { where: { status: "CONFIRMED" } } } },
      },
    }),
    ctx.memberId
      ? ctx.db.eventParticipant.findMany({
          where: { eventId: { in: ids }, memberId: ctx.memberId },
          select: { eventId: true, status: true },
        })
      : Promise.resolve([]),
  ]);

  return rows.map((row) => {
    const own = shifts.filter((s) => s.eventId === row.id);
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      status: row.status,
      visibility: row.visibility,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      allDay: row.allDay,
      locationName: row.locationName,
      department: row.department,
      maxParticipants: row.maxParticipants,
      registrationRequired: row.registrationRequired,
      acceptedCount:
        counts.find((c) => c.eventId === row.id && c.status === "ACCEPTED")?._count._all ?? 0,
      waitlistCount:
        counts.find((c) => c.eventId === row.id && c.status === "WAITLISTED")?._count._all ?? 0,
      myStatus: mine.find((m) => m.eventId === row.id)?.status ?? null,
      shiftSummary: {
        shifts: own.length,
        required: own.reduce((sum, s) => sum + s.requiredCount, 0),
        filled: own.reduce((sum, s) => sum + Math.min(s._count.assignments, s.requiredCount), 0),
      },
      seriesId: row.seriesId,
    };
  });
}

export async function listEvents(
  ctx: TenantContext,
  query: EventListQuery,
): Promise<Paged<EventListItem>> {
  assertCan(ctx, "events:read");
  const now = new Date();
  const tokens = (query.q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
  const where: Prisma.EventWhereInput = {
    AND: [
      eventVisibilityWhere(ctx),
      query.status ? { status: query.status } : {},
      query.type ? { type: query.type } : {},
      query.departmentId ? { departmentId: query.departmentId } : {},
      query.period === "upcoming"
        ? { endsAt: { gte: now } }
        : query.period === "past"
          ? { endsAt: { lt: now } }
          : {},
      ...tokens.map((token) => ({
        OR: [
          { title: { contains: token, mode: "insensitive" as const } },
          { locationName: { contains: token, mode: "insensitive" as const } },
        ],
      })),
    ],
  };
  const [rows, total] = await Promise.all([
    ctx.db.event.findMany({
      where,
      include: eventInclude,
      orderBy: { startsAt: query.period === "past" ? "desc" : "asc" },
      skip: query.request.skip,
      take: query.request.pageSize,
    }),
    ctx.db.event.count({ where }),
  ]);
  return paged(await decorate(ctx, rows), total, query.request);
}

export interface EventDetail extends EventListItem {
  description: string | null;
  address: string | null;
  contact: {
    memberId: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  targetAudience: string | null;
  registrationDeadline: Date | null;
  waitlistEnabled: boolean;
  internalNotes: string | null;
  cancelReason: string | null;
  publishedAt: Date | null;
  can: {
    update: boolean;
    publish: boolean;
    archive: boolean;
    participate: boolean;
    manageParticipants: boolean;
    manageShifts: boolean;
    duplicate: boolean;
  };
  /** Kann sich der Benutzer JETZT anmelden? (Status, Frist, Ende) – mit Begründung, falls nicht. */
  registration: { open: boolean; reason: string | null };
}

export function registrationState(
  event: { status: EventStatus; endsAt: Date; registrationDeadline: Date | null },
  now = new Date(),
): { open: boolean; reason: string | null } {
  if (event.status !== "PUBLISHED")
    return {
      open: false,
      reason:
        event.status === "CANCELLED"
          ? "Die Veranstaltung wurde abgesagt."
          : "Die Veranstaltung ist nicht (mehr) für Anmeldungen geöffnet.",
    };
  if (event.endsAt.getTime() < now.getTime())
    return { open: false, reason: "Die Veranstaltung ist bereits vorbei." };
  if (event.registrationDeadline && event.registrationDeadline.getTime() < now.getTime())
    return { open: false, reason: "Die Anmeldefrist ist abgelaufen." };
  return { open: true, reason: null };
}

export async function getEvent(ctx: TenantContext, id: string): Promise<EventDetail> {
  assertCan(ctx, "events:read");
  const row = await ctx.db.event.findFirst({
    where: { id, deletedAt: null },
    include: eventInclude,
  });
  if (!row || !canSee(ctx, row)) throw notFound("Die Veranstaltung");

  const [item] = await decorate(ctx, [row]);
  const resource = resourceOf(row);
  const canUpdate = can(ctx, "events:update", resource);

  return {
    ...item!,
    description: row.description,
    address: row.address,
    contact: {
      memberId: row.contactMemberId,
      name: row.contactMember
        ? `${row.contactMember.firstName} ${row.contactMember.lastName}`
        : row.contactName,
      email: row.contactEmail,
      phone: row.contactPhone,
    },
    targetAudience: row.targetAudience,
    registrationDeadline: row.registrationDeadline,
    waitlistEnabled: row.waitlistEnabled,
    internalNotes: canUpdate ? row.internalNotes : null,
    cancelReason: row.cancelReason,
    publishedAt: row.publishedAt,
    can: {
      update:
        canUpdate &&
        (row.status === "DRAFT" || row.status === "PUBLISHED" || row.status === "COMPLETED"),
      publish: can(ctx, "events:publish", resource),
      archive: can(ctx, "events:archive", resource),
      participate: can(ctx, "events:participate") && ctx.memberId !== null,
      manageParticipants: can(ctx, "events:manage_participants", resource),
      manageShifts: can(ctx, "shifts:manage", resource),
      duplicate: can(ctx, "events:create", resource),
    },
    registration: registrationState(row),
  };
}

export interface EventFormValues {
  title: string;
  description: string;
  type: EventType;
  visibility: EventVisibility;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  allDay: boolean;
  locationName: string;
  address: string;
  contactMemberId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  targetAudience: string;
  departmentId: string;
  maxParticipants: number | undefined;
  registrationRequired: boolean;
  registrationDeadlineDate: string;
  registrationDeadlineTime: string;
  waitlistEnabled: boolean;
  internalNotes: string;
  repeat: "none";
  repeatCount: number | undefined;
}

export async function getEventForEdit(ctx: TenantContext, id: string): Promise<EventFormValues> {
  const event = await loadForAction(ctx, id, "events:update");
  if (event.status === "CANCELLED" || event.status === "ARCHIVED")
    throw badRequest("Abgesagte oder archivierte Veranstaltungen lassen sich nicht bearbeiten.");
  return {
    title: event.title,
    description: event.description ?? "",
    type: event.type,
    visibility: event.visibility,
    startDate: toDateInputValue(event.startsAt),
    startTime: toTimeInputValue(event.startsAt),
    endDate: toDateInputValue(event.endsAt),
    endTime: toTimeInputValue(event.endsAt),
    allDay: event.allDay,
    locationName: event.locationName ?? "",
    address: event.address ?? "",
    contactMemberId: event.contactMemberId ?? "",
    contactName: event.contactName ?? "",
    contactEmail: event.contactEmail ?? "",
    contactPhone: event.contactPhone ?? "",
    targetAudience: event.targetAudience ?? "",
    departmentId: event.departmentId ?? "",
    maxParticipants: event.maxParticipants ?? undefined,
    registrationRequired: event.registrationRequired,
    registrationDeadlineDate: event.registrationDeadline
      ? toDateInputValue(event.registrationDeadline)
      : "",
    registrationDeadlineTime: event.registrationDeadline
      ? toTimeInputValue(event.registrationDeadline)
      : "",
    waitlistEnabled: event.waitlistEnabled,
    internalNotes: event.internalNotes ?? "",
    repeat: "none",
    repeatCount: undefined,
  };
}

/** Abteilungen und Mitglieder für die Auswahlfelder des Formulars (nur Namen, keine Kontaktdaten). */
export async function getEventFormOptions(ctx: TenantContext) {
  const [departments, members] = await Promise.all([
    ctx.db.department.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    can(ctx, "events:create") || can(ctx, "events:update")
      ? ctx.db.member.findMany({
          where: { archivedAt: null, deletedAt: null },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
          select: { id: true, firstName: true, lastName: true },
          take: 1000,
        })
      : Promise.resolve([]),
  ]);
  const scope = scopeOf(ctx, "events:create");
  return {
    departments: departments.map((d) => ({
      ...d,
      selectable: scope === "CLUB" || ctx.ledDepartmentIds.includes(d.id),
    })),
    members: members.map((m) => ({ id: m.id, name: `${m.lastName}, ${m.firstName}` })),
    departmentRequired: scope === "DEPARTMENT",
  };
}

// ---------------------------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------------------------

async function loadForAction(
  ctx: TenantContext,
  id: string,
  permission:
    | "events:update"
    | "events:publish"
    | "events:archive"
    | "events:create"
    | "events:manage_participants",
): Promise<EventRow> {
  const event = await dbOf(ctx).event.findFirst({
    where: { id, deletedAt: null },
    include: eventInclude,
  });
  if (!event || !canSee(ctx, event)) throw notFound("Die Veranstaltung");
  if (!can(ctx, permission, resourceOf(event))) throw forbidden();
  return event;
}

export const eventRow = loadForAction;

/** Lädt eine Veranstaltung, die der Benutzer sehen darf – sonst "nicht gefunden" (verrät nichts über versteckte Entwürfe). */
export async function loadVisibleEvent(ctx: TenantContext, id: string): Promise<EventRow> {
  const event = await dbOf(ctx).event.findFirst({
    where: { id, deletedAt: null },
    include: eventInclude,
  });
  if (!event || !canSee(ctx, event)) throw notFound("Die Veranstaltung");
  return event;
}

async function assertRefs(
  db: Db,
  input: { departmentId?: string; contactMemberId?: string },
): Promise<void> {
  if (
    input.departmentId &&
    !(await db.department.findFirst({ where: { id: input.departmentId }, select: { id: true } }))
  ) {
    throw validationFailed({ departmentId: ["Diese Abteilung existiert nicht."] });
  }
  if (
    input.contactMemberId &&
    !(await db.member.findFirst({
      where: { id: input.contactMemberId, deletedAt: null },
      select: { id: true },
    }))
  ) {
    throw validationFailed({ contactMemberId: ["Dieses Mitglied existiert nicht."] });
  }
}

/** Konten aller, die eine Änderung/Absage betrifft: Teilnehmer (zugesagt/Warteliste) und eingeteilte Helfer. */
async function affectedUserIds(db: Db, eventId: string): Promise<string[]> {
  const [participants, helpers] = await Promise.all([
    db.eventParticipant.findMany({
      where: { eventId, status: { in: ["ACCEPTED", "WAITLISTED"] } },
      select: { member: { select: { userId: true } } },
    }),
    db.shiftAssignment.findMany({
      where: {
        status: "CONFIRMED",
        shift: { eventId, deletedAt: null, status: { not: "CANCELLED" } },
      },
      select: { member: { select: { userId: true } } },
    }),
  ]);
  return [...participants, ...helpers]
    .map((r) => r.member.userId)
    .filter((id): id is string => id !== null);
}

async function audienceUserIds(db: Db, event: { departmentId: string | null }): Promise<string[]> {
  if (event.departmentId) {
    const rows = await db.memberDepartment.findMany({
      where: { departmentId: event.departmentId, member: { archivedAt: null, deletedAt: null } },
      select: { member: { select: { userId: true } } },
    });
    return rows.map((r) => r.member.userId).filter((id): id is string => id !== null);
  }
  const rows = await db.clubMembership.findMany({
    where: { status: "ACTIVE" },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

const eventLink = (id: string) => `/veranstaltungen/${id}`;

function eventData(input: EventInput, times: NonNullable<ReturnType<typeof normalizeEventTimes>>) {
  return {
    title: input.title,
    description: input.description ?? null,
    type: input.type,
    visibility: input.visibility,
    startsAt: times.startsAt,
    endsAt: times.endsAt,
    allDay: input.allDay,
    locationName: input.locationName ?? null,
    address: input.address ?? null,
    contactMemberId: input.contactMemberId ?? null,
    contactName: input.contactName ?? null,
    contactEmail: input.contactEmail ?? null,
    contactPhone: input.contactPhone ?? null,
    targetAudience: input.targetAudience ?? null,
    departmentId: input.departmentId ?? null,
    maxParticipants: input.maxParticipants ?? null,
    registrationRequired: input.registrationRequired,
    registrationDeadline: times.registrationDeadline,
    waitlistEnabled: input.waitlistEnabled,
    internalNotes: input.internalNotes ?? null,
  };
}

// ---------------------------------------------------------------------------------------------
// Anlegen und Ändern
// ---------------------------------------------------------------------------------------------

export async function createEvent(
  ctx: TenantContext,
  input: EventInput,
): Promise<{ id: string; count: number }> {
  assertCan(ctx, "events:create");
  if (
    scopeOf(ctx, "events:create") === "DEPARTMENT" &&
    (!input.departmentId || !ctx.ledDepartmentIds.includes(input.departmentId))
  ) {
    throw validationFailed({ departmentId: ["Bitte wähle eine Abteilung, die du leitest."] });
  }
  const times = normalizeEventTimes(input);
  if (!times) throw validationFailed({ startDate: ["Bitte prüfe Datum und Uhrzeit."] });
  await assertRefs(ctx.db, input);

  const occurrences =
    input.repeat === "none"
      ? [{ startsAt: times.startsAt, endsAt: times.endsAt }]
      : expandSeries({
          startsAt: times.startsAt,
          endsAt: times.endsAt,
          frequency: input.repeat,
          count: input.repeatCount,
        });
  const seriesId = occurrences.length > 1 ? randomUUID() : null;
  const deadlineOffset = times.registrationDeadline
    ? times.startsAt.getTime() - times.registrationDeadline.getTime()
    : null;

  return ctx.db.$transaction(async (tx) => {
    const ids: string[] = [];
    for (const occurrence of occurrences) {
      const created = await tx.event.create({
        data: {
          clubId: ctx.clubId,
          seriesId,
          ...eventData(input, times),
          startsAt: occurrence.startsAt,
          endsAt: occurrence.endsAt,
          registrationDeadline:
            deadlineOffset === null
              ? null
              : new Date(occurrence.startsAt.getTime() - deadlineOffset),
          status: "DRAFT",
          createdById: ctx.userId,
        },
      });
      ids.push(created.id);
    }
    await recordAudit(tx, auditActor(ctx), {
      action: "event.created",
      entityType: "Event",
      entityId: ids[0],
      summary:
        occurrences.length > 1
          ? `Terminserie „${input.title}“ mit ${occurrences.length} Terminen angelegt`
          : `Veranstaltung „${input.title}“ angelegt`,
    });
    return { id: ids[0]!, count: ids.length };
  });
}

export async function updateEvent(
  ctx: TenantContext,
  id: string,
  input: EventInput,
): Promise<void> {
  const before = await loadForAction(ctx, id, "events:update");
  if (before.status === "CANCELLED" || before.status === "ARCHIVED")
    throw badRequest("Abgesagte oder archivierte Veranstaltungen lassen sich nicht bearbeiten.");

  // Abteilungsleiter dürfen die Veranstaltung nicht in eine fremde Abteilung verschieben.
  if (
    scopeOf(ctx, "events:update") === "DEPARTMENT" &&
    (!input.departmentId || !ctx.ledDepartmentIds.includes(input.departmentId))
  ) {
    throw validationFailed({ departmentId: ["Bitte wähle eine Abteilung, die du leitest."] });
  }
  const times = normalizeEventTimes(input);
  if (!times) throw validationFailed({ startDate: ["Bitte prüfe Datum und Uhrzeit."] });
  await assertRefs(ctx.db, input);

  const after = eventData(input, times);
  const changes = diffChanges({ ...before }, after, { masked: ["internalNotes"] });
  const relevant = Boolean(
    changes &&
    ["startsAt", "endsAt", "locationName", "address", "title"].some((key) => key in changes),
  );

  await ctx.db.$transaction(async (tx) => {
    await tx.event.update({ where: { id }, data: after });
    // Wurde das Limit erhöht, rücken Wartelisten-Teilnehmer nach.
    if (
      (after.maxParticipants ?? Infinity) > (before.maxParticipants ?? Infinity) ||
      (before.maxParticipants !== null && after.maxParticipants === null)
    ) {
      await promoteFromWaitlist(ctx, tx, id);
    }
    if (changes) {
      await recordAudit(tx, auditActor(ctx), {
        action: "event.updated",
        entityType: "Event",
        entityId: id,
        summary: `Veranstaltung „${input.title}“ geändert`,
        changes,
      });
    }
    if (relevant && before.status === "PUBLISHED") {
      await notifyUsers(tx, ctx.clubId, {
        userIds: (await affectedUserIds(tx, id)).filter((userId) => userId !== ctx.userId),
        type: "EVENT_CHANGED",
        title: `Änderung: ${input.title}`,
        body: "Zeit, Ort oder Titel der Veranstaltung wurden geändert. Bitte prüfe die Details.",
        linkUrl: eventLink(id),
        email: true,
      });
    }
  });
}

// ---------------------------------------------------------------------------------------------
// Status: veröffentlichen, absagen, abschließen, archivieren, löschen
// ---------------------------------------------------------------------------------------------

export async function publishEvent(ctx: TenantContext, id: string): Promise<void> {
  const event = await loadForAction(ctx, id, "events:publish");
  if (event.status !== "DRAFT") throw badRequest("Nur Entwürfe lassen sich veröffentlichen.");
  await ctx.db.$transaction(async (tx) => {
    await tx.event.update({
      where: { id },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "event.published",
      entityType: "Event",
      entityId: id,
      summary: `Veranstaltung „${event.title}“ veröffentlicht`,
    });
    await notifyUsers(tx, ctx.clubId, {
      userIds: (await audienceUserIds(tx, event)).filter((userId) => userId !== ctx.userId),
      type: "EVENT_PUBLISHED",
      title: `Neue Veranstaltung: ${event.title}`,
      linkUrl: eventLink(id),
      dedupeKey: () => `event-published:${id}`,
    });
  });
}

export async function cancelEvent(ctx: TenantContext, id: string, reason: string): Promise<void> {
  const event = await loadForAction(ctx, id, "events:publish");
  if (event.status !== "PUBLISHED" && event.status !== "DRAFT")
    throw badRequest("Diese Veranstaltung lässt sich nicht mehr absagen.");
  await ctx.db.$transaction(async (tx) => {
    const notify = event.status === "PUBLISHED" ? await affectedUserIds(tx, id) : [];
    await tx.event.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason },
    });
    // Schichten einer abgesagten Veranstaltung sind gegenstandslos (und blockieren keine anderen Einteilungen mehr).
    await tx.eventShift.updateMany({
      where: { eventId: id, status: { not: "CANCELLED" } },
      data: { status: "CANCELLED" },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "event.cancelled",
      entityType: "Event",
      entityId: id,
      summary: `Veranstaltung „${event.title}“ abgesagt`,
      changes: { grund: { to: reason } },
    });
    await notifyUsers(tx, ctx.clubId, {
      userIds: notify.filter((userId) => userId !== ctx.userId),
      type: "EVENT_CANCELLED",
      title: `Abgesagt: ${event.title}`,
      body: reason,
      linkUrl: eventLink(id),
      email: true,
    });
  });
}

export async function completeEvent(ctx: TenantContext, id: string): Promise<void> {
  const event = await loadForAction(ctx, id, "events:publish");
  if (event.status !== "PUBLISHED")
    throw badRequest("Nur veröffentlichte Veranstaltungen lassen sich abschließen.");
  await ctx.db.$transaction(async (tx) => {
    await tx.event.update({ where: { id }, data: { status: "COMPLETED" } });
    await recordAudit(tx, auditActor(ctx), {
      action: "event.completed",
      entityType: "Event",
      entityId: id,
      summary: `Veranstaltung „${event.title}“ abgeschlossen`,
    });
  });
}

export async function archiveEvent(ctx: TenantContext, id: string): Promise<void> {
  const event = await loadForAction(ctx, id, "events:archive");
  if (event.status === "ARCHIVED") return;
  await ctx.db.$transaction(async (tx) => {
    await tx.event.update({ where: { id }, data: { status: "ARCHIVED" } });
    await recordAudit(tx, auditActor(ctx), {
      action: "event.archived",
      entityType: "Event",
      entityId: id,
      summary: `Veranstaltung „${event.title}“ archiviert`,
    });
  });
}

export async function restoreEvent(ctx: TenantContext, id: string): Promise<void> {
  const event = await loadForAction(ctx, id, "events:archive");
  if (event.status !== "ARCHIVED") return;
  const next: EventStatus = event.endsAt.getTime() < Date.now() ? "COMPLETED" : "DRAFT";
  await ctx.db.$transaction(async (tx) => {
    await tx.event.update({ where: { id }, data: { status: next } });
    await recordAudit(tx, auditActor(ctx), {
      action: "event.restored",
      entityType: "Event",
      entityId: id,
      summary: `Veranstaltung „${event.title}“ wiederhergestellt`,
    });
  });
}

/** Löscht (weich) nur Entwürfe und archivierte Veranstaltungen. */
export async function deleteEvent(ctx: TenantContext, id: string): Promise<void> {
  const event = await loadForAction(ctx, id, "events:archive");
  if (event.status !== "DRAFT" && event.status !== "ARCHIVED")
    throw badRequest(
      "Bitte archiviere die Veranstaltung zuerst. Nur Entwürfe und archivierte Veranstaltungen lassen sich löschen.",
    );
  await ctx.db.$transaction(async (tx) => {
    await tx.event.update({ where: { id }, data: { deletedAt: new Date() } });
    await recordAudit(tx, auditActor(ctx), {
      action: "event.deleted",
      entityType: "Event",
      entityId: id,
      summary: `Veranstaltung „${event.title}“ gelöscht`,
    });
  });
}

/** Kopiert eine Veranstaltung samt Schichten (ohne Teilnehmer und Einteilungen) auf ein neues Datum. Ortszeiten bleiben erhalten. */
export async function duplicateEvent(
  ctx: TenantContext,
  id: string,
  startDate: string,
): Promise<{ id: string }> {
  const source = await loadForAction(ctx, id, "events:create");
  const target = new Date(`${startDate}T12:00:00.000Z`);
  if (Number.isNaN(target.getTime()))
    throw validationFailed({ startDate: ["Bitte gib ein gültiges Datum ein."] });
  const from = berlinParts(source.startsAt);
  const dayDiff = Math.round(
    (Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate()) -
      Date.UTC(from.year, from.month - 1, from.day)) /
      86_400_000,
  );

  const shifts = await ctx.db.eventShift.findMany({ where: { eventId: id, deletedAt: null } });
  const shift = (d: Date) => addBerlinDays(d, dayDiff);

  return ctx.db.$transaction(async (tx) => {
    const copy = await tx.event.create({
      data: {
        clubId: ctx.clubId,
        title: `${source.title} (Kopie)`.slice(0, 150),
        description: source.description,
        type: source.type,
        status: "DRAFT",
        visibility: source.visibility,
        startsAt: shift(source.startsAt),
        endsAt: shift(source.endsAt),
        allDay: source.allDay,
        locationName: source.locationName,
        address: source.address,
        contactMemberId: source.contactMemberId,
        contactName: source.contactName,
        contactEmail: source.contactEmail,
        contactPhone: source.contactPhone,
        targetAudience: source.targetAudience,
        departmentId: source.departmentId,
        maxParticipants: source.maxParticipants,
        registrationRequired: source.registrationRequired,
        registrationDeadline: source.registrationDeadline
          ? shift(source.registrationDeadline)
          : null,
        waitlistEnabled: source.waitlistEnabled,
        internalNotes: source.internalNotes,
        createdById: ctx.userId,
      },
    });
    if (shifts.length > 0) {
      await tx.eventShift.createMany({
        data: shifts.map((s) => ({
          clubId: ctx.clubId,
          eventId: copy.id,
          title: s.title,
          taskName: s.taskName,
          description: s.description,
          startsAt: shift(s.startsAt),
          endsAt: shift(s.endsAt),
          meetingPoint: s.meetingPoint,
          requiredCount: s.requiredCount,
          minAge: s.minAge,
          requirements: s.requirements,
          internalNotes: s.internalNotes,
          responsibleMemberId: s.responsibleMemberId,
          status: s.status === "CANCELLED" ? "OPEN" : s.status,
        })),
      });
    }
    await recordAudit(tx, auditActor(ctx), {
      action: "event.duplicated",
      entityType: "Event",
      entityId: copy.id,
      summary: `Veranstaltung „${source.title}“ dupliziert (${shifts.length} Schichten)`,
    });
    return { id: copy.id };
  });
}

// ---------------------------------------------------------------------------------------------
// Wartelisten-Nachrücken (von Teilnehmer-Funktionen mitgenutzt)
// ---------------------------------------------------------------------------------------------

export const isCapacityError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("EVENT_FULL");

/**
 * Lässt Teilnehmer der Warteliste (in der Reihenfolge ihrer Anmeldung) nachrücken, solange Plätze frei sind.
 * Die Datenbank ist die letzte Instanz für das Limit: Meldet sie "voll", wird das Nachrücken beendet.
 */
export async function promoteFromWaitlist(
  ctx: TenantContext,
  tx: TenantTx,
  eventId: string,
): Promise<number> {
  const event = await tx.event.findFirst({
    where: { id: eventId },
    select: { title: true, maxParticipants: true },
  });
  if (!event) return 0;
  let promoted = 0;
  for (;;) {
    if (event.maxParticipants !== null) {
      const accepted = await tx.eventParticipant.count({ where: { eventId, status: "ACCEPTED" } });
      if (accepted >= event.maxParticipants) break;
    }
    const next = await tx.eventParticipant.findFirst({
      where: { eventId, status: "WAITLISTED" },
      orderBy: { respondedAt: "asc" },
      select: { id: true, member: { select: { userId: true } } },
    });
    if (!next) break;
    await tx.eventParticipant.update({
      where: { id: next.id },
      data: { status: "ACCEPTED", respondedAt: new Date() },
    });
    promoted += 1;
    if (next.member.userId) {
      await notifyUsers(tx, ctx.clubId, {
        userIds: [next.member.userId],
        type: "EVENT_CHANGED",
        title: `Du bist nachgerückt: ${event.title}`,
        body: "Ein Platz ist frei geworden – deine Anmeldung ist jetzt bestätigt.",
        linkUrl: eventLink(eventId),
        email: true,
      });
    }
  }
  return promoted;
}
