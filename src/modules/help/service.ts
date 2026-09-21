import type { Prisma } from "@/generated/prisma/client";
import { readSupportContacts, type SupportContact } from "@/lib/club-settings";
import { paged, type PageRequest, type Paged } from "@/lib/search-params";
import {
  SUPPORT_CATEGORY_LABEL,
  SUPPORT_STATUS_LABEL,
  type SupportCategoryKey,
  type SupportStatusKey,
} from "@/lib/support";
import { notifyUsers } from "@/modules/notifications/service";
import { recordAudit } from "@/server/audit/audit";
import { env } from "@/server/env";
import { notFound } from "@/server/errors";
import { assertCan, can } from "@/server/permissions/policy";
import { enforceRateLimit } from "@/server/security/rate-limit";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import type { ContactsInput, TicketInput, TicketUpdateInput } from "./schemas";

/**
 * Hilfe und Support.
 *
 * Jedes Mitglied kann der Vereinsverwaltung ein Problem, eine Frage oder einen Vorschlag melden. Die Meldung liegt in der
 * Datenbank (nichts geht verloren, auch wenn E-Mail gerade nicht funktioniert); wer den Verein verwalten darf
 * (`club:update`), wird benachrichtigt, sieht alle Meldungen des Vereins, kann Status setzen und antworten. Die meldende Person
 * sieht nur ihre EIGENEN Meldungen samt Antwort. Texte sind reiner Text und werden nie als HTML gerendert.
 * Ansprechpartner pflegt die Verwaltung direkt auf der Hilfeseite (gespeichert in `Club.settings.support.contacts`).
 */
export interface TicketDto {
  id: string;
  category: SupportCategoryKey;
  subject: string;
  description: string;
  pagePath: string | null;
  device: string | null;
  status: SupportStatusKey;
  response: string | null;
  respondedAt: Date | null;
  createdAt: Date;
}

/** Ansicht der Verwaltung: zusätzlich, wer gemeldet hat (Name und E-Mail für Rückfragen). */
export interface ManagedTicketDto extends TicketDto {
  reporter: { name: string; email: string } | null;
}

export interface HelpOverview {
  clubName: string;
  contacts: SupportContact[];
  /** Allgemeiner Kontakt des Vereins (aus den Vereinsdaten), falls keine Ansprechpartner hinterlegt sind. */
  clubContact: { email: string | null; phone: string | null };
  /** Technischer Support des Plattformbetreibers (Umgebungsvariable SUPPORT_EMAIL), falls eingerichtet. */
  platformSupportEmail: string | null;
  canManage: boolean;
  openTickets: number | null;
}

const ticketSelect = {
  id: true,
  category: true,
  subject: true,
  description: true,
  pagePath: true,
  userAgent: true,
  status: true,
  response: true,
  respondedAt: true,
  createdAt: true,
} as const;

type TicketRow = Prisma.SupportTicketGetPayload<{ select: typeof ticketSelect }>;

const toDto = (row: TicketRow): TicketDto => ({
  id: row.id,
  category: row.category,
  subject: row.subject,
  description: row.description,
  pagePath: row.pagePath,
  device: row.userAgent,
  status: row.status,
  response: row.response,
  respondedAt: row.respondedAt,
  createdAt: row.createdAt,
});

export async function getHelpOverview(ctx: TenantContext): Promise<HelpOverview> {
  assertCan(ctx, "club:read");
  const club = await ctx.db.club.findFirstOrThrow({});
  const canManage = can(ctx, "club:update");
  return {
    clubName: club.name,
    contacts: readSupportContacts(club.settings),
    clubContact: { email: club.contactEmail, phone: club.phone },
    platformSupportEmail: env.SUPPORT_EMAIL ?? null,
    canManage,
    openTickets: canManage
      ? await ctx.db.supportTicket.count({ where: { status: { not: "DONE" } } })
      : null,
  };
}

/** Meldung erstellen. Die Verwaltung wird benachrichtigt (in der Anwendung und per E-Mail). */
export async function createTicket(
  ctx: TenantContext,
  input: TicketInput,
  device: string | null,
): Promise<{ id: string }> {
  assertCan(ctx, "club:read"); // jedes aktive Mitglied des Vereins
  await enforceRateLimit(`support-ticket:${ctx.userId}`, 10, 3600);

  const ticket = await ctx.db.$transaction(async (tx) => {
    const created = await tx.supportTicket.create({
      data: {
        clubId: ctx.clubId,
        createdById: ctx.userId,
        category: input.category,
        subject: input.subject,
        description: input.description,
        pagePath: input.pagePath ?? null,
        userAgent: device?.slice(0, 100) ?? null,
      },
      select: { id: true },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "support.ticket_created",
      entityType: "SupportTicket",
      entityId: created.id,
      summary: `Meldung „${input.subject}“ erstellt`,
    });
    return created;
  });

  // Alle, die den Verein verwalten dürfen (außer der meldenden Person selbst).
  const managers = await ctx.db.clubMembership.findMany({
    where: {
      status: "ACTIVE",
      userId: { not: ctx.userId },
      role: { permissions: { some: { permissionKey: "club:update" } } },
    },
    select: { userId: true },
  });
  await notifyUsers(ctx.db, ctx.clubId, {
    userIds: managers.map((manager) => manager.userId),
    type: "SYSTEM",
    title: `Neue Meldung: ${input.subject}`,
    body: `${SUPPORT_CATEGORY_LABEL[input.category]} von ${ctx.user.firstName} ${ctx.user.lastName}`,
    linkUrl: "/hilfe/meldungen",
    email: true,
  });
  return { id: ticket.id };
}

/** Die eigenen Meldungen der angemeldeten Person (neueste zuerst). */
export async function listMyTickets(ctx: TenantContext, limit = 20): Promise<TicketDto[]> {
  assertCan(ctx, "club:read");
  const rows = await ctx.db.supportTicket.findMany({
    where: { createdById: ctx.userId },
    select: ticketSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });
  return rows.map(toDto);
}

export interface TicketQuery {
  status?: SupportStatusKey | "OPEN_ALL";
  request: PageRequest;
}

/** Alle Meldungen des Vereins – nur für die Verwaltung. */
export async function listTickets(
  ctx: TenantContext,
  query: TicketQuery,
): Promise<Paged<ManagedTicketDto>> {
  assertCan(ctx, "club:update");
  const where: Prisma.SupportTicketWhereInput =
    query.status === "OPEN_ALL"
      ? { status: { not: "DONE" } }
      : query.status
        ? { status: query.status }
        : {};
  const [rows, total] = await Promise.all([
    ctx.db.supportTicket.findMany({
      where,
      select: { ...ticketSelect, createdById: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: query.request.skip,
      take: query.request.pageSize,
    }),
    ctx.db.supportTicket.count({ where }),
  ]);

  const ids = [
    ...new Set(rows.map((row) => row.createdById).filter((id): id is string => id !== null)),
  ];
  const people = ids.length
    ? await ctx.db.clubMembership.findMany({
        where: { userId: { in: ids } },
        select: {
          userId: true,
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      })
    : [];
  const byUser = new Map(
    people.map((person) => [
      person.userId,
      { name: `${person.user.firstName} ${person.user.lastName}`, email: person.user.email },
    ]),
  );
  return paged(
    rows.map((row) => ({
      ...toDto(row),
      reporter: row.createdById ? (byUser.get(row.createdById) ?? null) : null,
    })),
    total,
    query.request,
  );
}

/** Status setzen und/oder antworten. Die meldende Person erfährt davon (Benachrichtigung in der Anwendung, ohne E-Mail-Text der Antwort). */
export async function updateTicket(
  ctx: TenantContext,
  id: string,
  input: TicketUpdateInput,
): Promise<void> {
  assertCan(ctx, "club:update");
  const ticket = await ctx.db.supportTicket.findFirst({
    where: { id },
    select: { id: true, subject: true, status: true, response: true, createdById: true },
  });
  if (!ticket) throw notFound("Die Meldung");

  const response = input.response ?? null;
  const statusChanged = ticket.status !== input.status;
  const responseChanged = response !== (ticket.response ?? null);
  if (!statusChanged && !responseChanged) return;

  await ctx.db.$transaction(async (tx) => {
    await tx.supportTicket.update({
      where: { id },
      data: {
        status: input.status,
        response,
        ...(responseChanged
          ? response
            ? { respondedAt: new Date(), respondedById: ctx.userId }
            : { respondedAt: null, respondedById: null }
          : {}),
      },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "support.ticket_updated",
      entityType: "SupportTicket",
      entityId: id,
      summary: `Meldung „${ticket.subject}“ bearbeitet`,
      changes: {
        ...(statusChanged ? { status: { from: ticket.status, to: input.status } } : {}),
        ...(responseChanged ? { response: { changed: true } } : {}),
      },
    });
  });

  if (ticket.createdById && ticket.createdById !== ctx.userId) {
    await notifyUsers(ctx.db, ctx.clubId, {
      userIds: [ticket.createdById],
      type: "SYSTEM",
      title: `Deine Meldung „${ticket.subject}“: ${SUPPORT_STATUS_LABEL[input.status]}`,
      body: response ?? undefined,
      linkUrl: "/hilfe",
    });
  }
}

/** Die hinterlegten Ansprechpartner zum Bearbeiten (Verwaltung). */
export async function getContactsForEdit(ctx: TenantContext): Promise<SupportContact[]> {
  assertCan(ctx, "club:update");
  const club = await ctx.db.club.findFirstOrThrow({});
  return readSupportContacts(club.settings);
}

/** Ansprechpartner speichern. Andere Vereinseinstellungen (z. B. Aufbewahrungsfristen) bleiben unverändert. */
export async function saveContacts(ctx: TenantContext, input: ContactsInput): Promise<void> {
  assertCan(ctx, "club:update");
  const club = await ctx.db.club.findFirstOrThrow({});
  const settings = (club.settings as Record<string, unknown> | null) ?? {};
  const previous = (settings.support as Record<string, unknown> | undefined) ?? {};
  const contacts: Prisma.InputJsonObject[] = input.contacts.map((contact) => ({
    name: contact.name,
    role: contact.role ?? null,
    email: contact.email ?? null,
    phone: contact.phone ?? null,
  }));
  // Die Einstellungen sind ein JSON-Objekt; alles andere darin (z. B. Aufbewahrungsfristen) wird unverändert übernommen.
  const merged = { ...settings, support: { ...previous, contacts } } as Prisma.InputJsonObject;

  await ctx.db.$transaction(async (tx) => {
    await tx.club.update({ where: { id: ctx.clubId }, data: { settings: merged } });
    await recordAudit(tx, auditActor(ctx), {
      action: "support.contacts_updated",
      entityType: "Club",
      entityId: ctx.clubId,
      // Namen und Kontaktdaten stehen bewusst nicht im Protokoll.
      summary: `Ansprechpartner geändert (${contacts.length} Einträge)`,
    });
  });
}
