import type { AuditLog, Prisma } from "@/generated/prisma/client";
import { AUDIT_MODULES, type AuditModuleKey } from "@/lib/audit-labels";
import { paged, type PageRequest, type Paged } from "@/lib/search-params";
import { assertCan } from "@/server/permissions/policy";
import type { TenantContext } from "@/server/tenancy/context-core";
import { likeText } from "@/lib/like-pattern";

/**
 * Änderungsprotokoll – nur lesen. Der Zugriff ist auf Verwalter mit `audit:read` beschränkt und wie alles andere auf den
 * eigenen Verein (Einträge anderer Vereine und Plattform-Ereignisse ohne Verein sind nie sichtbar).
 * Geschrieben wird ausschließlich durch die Fachfunktionen; die Datenbank verhindert nachträgliche Änderungen.
 */
export interface AuditQuery {
  module?: AuditModuleKey;
  /** Bereiche, die NICHT erscheinen sollen (z. B. „auth“, damit Anmeldungen ein Aktivitätsprotokoll nicht füllen). */
  excludeModules?: AuditModuleKey[];
  actorUserId?: string;
  /** Freitext in der Zusammenfassung. */
  q?: string;
  /** Kalendertage (Berlin), einschließlich. */
  from?: Date;
  to?: Date;
  request: PageRequest;
}

export interface AuditEntryDto {
  id: string;
  createdAt: Date;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string | null;
  changes: unknown;
  ipPrefix: string | null;
  actor: { kind: "USER"; name: string } | { kind: "SYSTEM" } | { kind: "UNKNOWN" };
}

export function auditWhere(query: Omit<AuditQuery, "request">): Prisma.AuditLogWhereInput {
  const area = query.module ? AUDIT_MODULES.find((m) => m.key === query.module) : undefined;
  const created: Prisma.DateTimeFilter = {};
  if (query.from) created.gte = query.from;
  if (query.to) created.lt = query.to;
  const excludedPrefixes = AUDIT_MODULES.filter((m) =>
    query.excludeModules?.includes(m.key),
  ).flatMap((m) => m.prefixes);
  return {
    AND: [
      area ? { OR: area.prefixes.map((prefix) => ({ action: { startsWith: prefix } })) } : {},
      excludedPrefixes.length > 0
        ? { NOT: { OR: excludedPrefixes.map((prefix) => ({ action: { startsWith: prefix } })) } }
        : {},
      query.actorUserId ? { actorUserId: query.actorUserId } : {},
      query.q?.trim()
        ? { summary: { contains: likeText(query.q.trim()), mode: "insensitive" as const } }
        : {},
      created.gte || created.lt ? { createdAt: created } : {},
    ],
  };
}

const NEWEST_FIRST: Prisma.AuditLogOrderByWithRelationInput[] = [
  { createdAt: "desc" },
  { id: "desc" },
];

/** Einträge samt aufgelöstem Akteur (Name der Person, System oder nicht mehr auflösbar). */
async function toEntries(ctx: TenantContext, rows: AuditLog[]): Promise<AuditEntryDto[]> {
  const actorIds = [
    ...new Set(rows.map((row) => row.actorUserId).filter((id): id is string => id !== null)),
  ];
  const people = actorIds.length
    ? await ctx.db.clubMembership.findMany({
        where: { userId: { in: actorIds } },
        select: { userId: true, user: { select: { firstName: true, lastName: true } } },
      })
    : [];
  const names = new Map(
    people.map((person) => [person.userId, `${person.user.firstName} ${person.user.lastName}`]),
  );

  return rows.map<AuditEntryDto>((row) => ({
    id: row.id,
    createdAt: row.createdAt,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    summary: row.summary,
    changes: row.changes,
    ipPrefix: row.ipPrefix,
    // Gelöschte oder ausgetretene Personen sind nicht mehr auflösbar – ihre Aktionen bleiben trotzdem nachvollziehbar.
    actor: row.actorUserId
      ? names.has(row.actorUserId)
        ? { kind: "USER", name: names.get(row.actorUserId)! }
        : { kind: "UNKNOWN" }
      : { kind: "SYSTEM" },
  }));
}

export async function listAuditEntries(
  ctx: TenantContext,
  query: AuditQuery,
): Promise<Paged<AuditEntryDto>> {
  assertCan(ctx, "audit:read");
  const where = auditWhere(query);
  const [rows, total] = await Promise.all([
    ctx.db.auditLog.findMany({
      where,
      orderBy: NEWEST_FIRST,
      skip: query.request.skip,
      take: query.request.pageSize,
    }),
    ctx.db.auditLog.count({ where }),
  ]);
  return paged(await toEntries(ctx, rows), total, query.request);
}

/**
 * Die letzten Ereignisse im Verein (für das Dashboard) – ohne Anmeldungen und Abmeldungen, die kein Vereinsgeschehen sind.
 * Wie das ganze Protokoll nur mit `audit:read`. Ohne Gesamtzahl: Die bräuchte bei jedem Dashboard-Aufruf einen Durchlauf über
 * das ganze (stetig wachsende) Protokoll des Vereins, angezeigt werden aber nur die neuesten Einträge.
 */
export async function listRecentActivity(ctx: TenantContext, limit = 6): Promise<AuditEntryDto[]> {
  assertCan(ctx, "audit:read");
  const rows = await ctx.db.auditLog.findMany({
    where: auditWhere({ excludeModules: ["auth"] }),
    orderBy: NEWEST_FIRST,
    take: limit,
  });
  return toEntries(ctx, rows);
}

/** Personen, die im Protokoll als Akteure vorkommen können (aktuelle Mitglieder des Vereins) – für den Filter. */
export async function listAuditActors(
  ctx: TenantContext,
): Promise<{ userId: string; name: string }[]> {
  assertCan(ctx, "audit:read");
  const people = await ctx.db.clubMembership.findMany({
    select: { userId: true, user: { select: { firstName: true, lastName: true } } },
    take: 1000,
  });
  return people
    .map((p) => ({ userId: p.userId, name: `${p.user.lastName}, ${p.user.firstName}` }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}
