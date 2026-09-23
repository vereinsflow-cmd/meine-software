import "server-only";
import type { PermissionScope } from "@/generated/prisma/enums";
import type { SessionUser } from "@/server/auth/session-core";
import { prisma } from "@/server/db/client";
import { createTenantDb, type TenantDb } from "@/server/db/tenant";
import { isPermissionKey, type PermissionKey } from "@/server/permissions/catalog";
import type { PermissionHolder } from "@/server/permissions/policy";
import type { AuditActor } from "@/server/audit/audit";

/**
 * Der Mandantenkontext beschreibt "wer handelt in welchem Verein mit welchen Rechten".
 * Er wird ausschließlich hier aufgebaut – aus der serverseitig geprüften Sitzung, niemals aus
 * Eingaben des Clients (URL, Formularfelder, Header). Jede Fachfunktion bekommt ihn als ersten Parameter.
 */
export interface TenantContext extends PermissionHolder {
  user: SessionUser;
  clubId: string;
  /** `logoSha256`: Prüfsumme des Vereinslogos (für die Bildadresse, siehe `clubLogoUrl`) – `null` ohne Logo. */
  club: { id: string; name: string; slug: string; timezone: string; logoSha256: string | null };
  membershipId: string;
  roleKey: string;
  roleName: string;
  /** Mandantengebundener Datenbank-Client – fügt `clubId` automatisch in jede Abfrage ein. */
  db: TenantDb;
  /** Angaben zur Anfrage für das Audit-Log (gekürzte IP). */
  requestMeta: { ipPrefix: string | null; requestId?: string | null };
}

export interface LoadedContext {
  context: TenantContext;
  /** Verein, der tatsächlich verwendet wurde (kann vom gewünschten abweichen, falls dieser nicht mehr gültig ist). */
  clubId: string;
}

const membershipInclude = {
  club: { select: { id: true, name: true, slug: true, timezone: true, logoSha256: true } },
  role: {
    select: {
      key: true,
      name: true,
      permissions: { select: { permissionKey: true, scope: true } },
    },
  },
  member: {
    select: {
      id: true,
      departments: { where: { isLeader: true }, select: { departmentId: true } },
    },
  },
} as const;

/**
 * Lädt den Kontext eines Benutzers für einen Verein. Ist `preferredClubId` gesetzt, aber die
 * Mitgliedschaft nicht (mehr) aktiv oder der Verein deaktiviert, wird auf einen anderen aktiven
 * Verein ausgewichen. Gibt `null` zurück, wenn der Benutzer in keinem aktiven Verein Mitglied ist.
 */
export async function loadTenantContext(
  user: SessionUser,
  preferredClubId: string | null,
  requestMeta: TenantContext["requestMeta"] = { ipPrefix: null },
): Promise<LoadedContext | null> {
  const activeFilter = { userId: user.id, status: "ACTIVE", club: { status: "ACTIVE" } } as const;

  let membership = preferredClubId
    ? await prisma.clubMembership.findFirst({
        where: { ...activeFilter, clubId: preferredClubId },
        include: membershipInclude,
      })
    : null;

  membership ??= await prisma.clubMembership.findFirst({
    where: activeFilter,
    orderBy: { joinedAt: "asc" },
    include: membershipInclude,
  });

  if (!membership) return null;

  const permissions = new Map<PermissionKey, PermissionScope>();
  for (const grant of membership.role.permissions) {
    // Unbekannte Schlüssel (z. B. aus einer älteren Version) werden ignoriert, nie erweitert.
    if (isPermissionKey(grant.permissionKey)) {
      permissions.set(grant.permissionKey, grant.scope);
    }
  }

  const context: TenantContext = {
    user,
    userId: user.id,
    clubId: membership.clubId,
    club: membership.club,
    membershipId: membership.id,
    roleKey: membership.role.key,
    roleName: membership.role.name,
    memberId: membership.member?.id ?? null,
    ledDepartmentIds: membership.member?.departments.map((d) => d.departmentId) ?? [],
    permissions,
    db: createTenantDb(membership.clubId),
    requestMeta,
  };
  return { context, clubId: membership.clubId };
}

/**
 * Kontext OHNE Browser-Sitzung – für Kalender-Abo-Links und Hintergrundjobs. Die Rechte kommen wie sonst aus der
 * Rolle der Mitgliedschaft. Gibt `null` zurück, wenn Benutzer oder Mitgliedschaft nicht (mehr) aktiv oder der Verein
 * deaktiviert ist – nie ein Kontext eines anderen Vereins (kein Ausweichen wie bei `loadTenantContext`).
 */
export async function loadTenantContextForUser(
  userId: string,
  clubId: string,
  requestMeta: TenantContext["requestMeta"] = { ipPrefix: null },
): Promise<TenantContext | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null, disabledAt: null },
    select: { id: true, email: true, firstName: true, lastName: true, isPlatformAdmin: true },
  });
  if (!user) return null;
  const loaded = await loadTenantContext(user, clubId, requestMeta);
  return loaded && loaded.clubId === clubId ? loaded.context : null;
}

/** Kurzform für das Audit-Log. */
export function auditActor(ctx: TenantContext): AuditActor {
  return {
    clubId: ctx.clubId,
    userId: ctx.userId,
    ipPrefix: ctx.requestMeta.ipPrefix,
    requestId: ctx.requestMeta.requestId ?? null,
  };
}
