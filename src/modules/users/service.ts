import type { PermissionScope } from "@/generated/prisma/enums";
import { recordAudit } from "@/server/audit/audit";
import { issueInvitation } from "@/server/auth/invitations";
import { forbidden, notFound } from "@/server/errors";
import { PERMISSIONS, isPermissionKey, type PermissionKey } from "@/server/permissions/catalog";
import { assertCan, can } from "@/server/permissions/policy";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import { assertNotLastAdmin } from "@/modules/members/service";
import type { InviteInput } from "./schemas";

/**
 * Benutzer und Rollen eines Vereins.
 *
 * Sicherheitsregeln:
 *  - Rechteausweitung ausgeschlossen: Man kann nur Rollen vergeben, deren Rechte man selbst vollständig besitzt.
 *  - Man kann sich nicht selbst sperren, entfernen oder die eigene Rolle ändern (Aussperr-Schutz).
 *  - Der letzte Vereinsadministrator bleibt immer erhalten.
 */
const SCOPE_RANK: Record<PermissionScope, number> = { OWN: 1, DEPARTMENT: 2, CLUB: 3 };

export interface RoleSummary {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: { key: PermissionKey; label: string; module: string; scope: PermissionScope }[];
  /** Darf der aktuelle Benutzer diese Rolle vergeben? */
  assignable: boolean;
  userCount: number;
}

function grantsCoverRole(
  ctx: TenantContext,
  role: { permissions: { permissionKey: string; scope: PermissionScope }[] },
): boolean {
  return role.permissions.every((grant) => {
    const own = isPermissionKey(grant.permissionKey)
      ? ctx.permissions.get(grant.permissionKey)
      : undefined;
    return own !== undefined && SCOPE_RANK[own] >= SCOPE_RANK[grant.scope];
  });
}

export async function listRoles(ctx: TenantContext): Promise<RoleSummary[]> {
  assertCan(ctx, "users:read");
  const [roles, counts] = await Promise.all([
    ctx.db.role.findMany({ include: { permissions: true }, orderBy: { createdAt: "asc" } }),
    ctx.db.clubMembership.groupBy({
      by: ["roleId"],
      where: { status: "ACTIVE" },
      _count: { _all: true },
    }),
  ]);
  return roles.map((role) => ({
    id: role.id,
    key: role.key,
    name: role.name,
    description: role.description,
    isSystem: role.isSystem,
    permissions: role.permissions
      .filter((p) => isPermissionKey(p.permissionKey))
      .map((p) => {
        const key = p.permissionKey as PermissionKey;
        return {
          key,
          label: PERMISSIONS[key].label,
          module: PERMISSIONS[key].module,
          scope: p.scope,
        };
      }),
    assignable: can(ctx, "users:manage") && grantsCoverRole(ctx, role),
    userCount: counts.find((c) => c.roleId === role.id)?._count._all ?? 0,
  }));
}

export interface ClubUser {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  roleId: string;
  roleName: string;
  status: "ACTIVE" | "SUSPENDED";
  joinedAt: Date;
  lastLoginAt: Date | null;
  memberId: string | null;
  isSelf: boolean;
}

export async function listClubUsers(ctx: TenantContext): Promise<ClubUser[]> {
  assertCan(ctx, "users:read");
  const showLogin = can(ctx, "users:manage");
  const rows = await ctx.db.clubMembership.findMany({
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true, lastLoginAt: true },
      },
      role: { select: { name: true } },
      member: { select: { id: true } },
    },
    orderBy: [{ user: { lastName: "asc" } }, { user: { firstName: "asc" } }],
  });
  return rows.map((row) => ({
    membershipId: row.id,
    userId: row.userId,
    name: `${row.user.firstName} ${row.user.lastName}`,
    email: row.user.email,
    roleId: row.roleId,
    roleName: row.role.name,
    status: row.status,
    joinedAt: row.joinedAt,
    lastLoginAt: showLogin ? row.user.lastLoginAt : null,
    memberId: row.member?.id ?? null,
    isSelf: row.userId === ctx.userId,
  }));
}

export interface PendingInvitation {
  id: string;
  email: string;
  roleName: string;
  memberName: string | null;
  expiresAt: Date;
  createdAt: Date;
  expired: boolean;
}

export async function listInvitations(ctx: TenantContext): Promise<PendingInvitation[]> {
  if (!can(ctx, "users:invite") && !can(ctx, "users:manage")) throw forbidden();
  const rows = await ctx.db.invitation.findMany({
    where: { acceptedAt: null, revokedAt: null },
    include: {
      role: { select: { name: true } },
      member: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const now = Date.now();
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    roleName: row.role.name,
    memberName: row.member ? `${row.member.firstName} ${row.member.lastName}` : null,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
    expired: row.expiresAt.getTime() <= now,
  }));
}

/** Mitglieder ohne Benutzerkonto (Auswahl beim Einladen). Nur mit Leserecht auf Kontaktdaten. */
export async function listInvitableMembers(
  ctx: TenantContext,
): Promise<{ id: string; name: string; email: string | null }[]> {
  if (!can(ctx, "users:invite") || !can(ctx, "members:read_contact")) return [];
  const rows = await ctx.db.member.findMany({
    where: { userId: null, archivedAt: null, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, email: true },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 500,
  });
  return rows.map((row) => ({
    id: row.id,
    name: `${row.lastName}, ${row.firstName}`,
    email: row.email,
  }));
}

async function assignableRole(ctx: TenantContext, roleId: string) {
  const role = await ctx.db.role.findFirst({
    where: { id: roleId },
    include: { permissions: true },
  });
  if (!role) throw notFound("Die Rolle");
  if (!grantsCoverRole(ctx, role)) {
    throw forbidden("Du kannst nur Rollen vergeben, deren Rechte du selbst vollständig besitzt.");
  }
  return role;
}

export async function inviteUser(ctx: TenantContext, input: InviteInput): Promise<void> {
  assertCan(ctx, "users:invite");
  const role = await assignableRole(ctx, input.roleId);
  const inviter = ctx.user;
  await issueInvitation({
    clubId: ctx.clubId,
    email: input.email,
    roleId: role.id,
    memberId: input.memberId ?? null,
    invitedByUserId: ctx.userId,
    inviterName: `${inviter.firstName} ${inviter.lastName}`,
  });
  await ctx.db.$transaction(async (tx) => {
    await recordAudit(tx, auditActor(ctx), {
      action: "invitation.created",
      entityType: "Invitation",
      summary: `Einladung als ${role.name} versendet`,
      changes: { rolle: { to: role.name } },
    });
  });
}

async function findOpenInvitation(ctx: TenantContext, id: string) {
  if (!can(ctx, "users:invite") && !can(ctx, "users:manage")) throw forbidden();
  const invitation = await ctx.db.invitation.findFirst({
    where: { id, acceptedAt: null, revokedAt: null },
  });
  if (!invitation) throw notFound("Die Einladung");
  return invitation;
}

export async function revokeInvitation(ctx: TenantContext, id: string): Promise<void> {
  const invitation = await findOpenInvitation(ctx, id);
  await ctx.db.$transaction(async (tx) => {
    await tx.invitation.update({ where: { id }, data: { revokedAt: new Date() } });
    await recordAudit(tx, auditActor(ctx), {
      action: "invitation.revoked",
      entityType: "Invitation",
      entityId: id,
      summary: "Einladung zurückgezogen",
    });
  });
  void invitation;
}

/** Sendet die Einladung erneut. Das ursprüngliche Token ist nicht rekonstruierbar (nur der Hash ist gespeichert) – es entsteht eine neue Einladung. */
export async function resendInvitation(ctx: TenantContext, id: string): Promise<void> {
  assertCan(ctx, "users:invite");
  const invitation = await findOpenInvitation(ctx, id);
  await assignableRole(ctx, invitation.roleId);
  await issueInvitation({
    clubId: ctx.clubId,
    email: invitation.email,
    roleId: invitation.roleId,
    memberId: invitation.memberId,
    invitedByUserId: ctx.userId,
    inviterName: `${ctx.user.firstName} ${ctx.user.lastName}`,
  });
}

async function loadMembership(ctx: TenantContext, membershipId: string) {
  assertCan(ctx, "users:manage");
  const membership = await ctx.db.clubMembership.findFirst({
    where: { id: membershipId },
    include: {
      user: { select: { firstName: true, lastName: true } },
      role: { select: { key: true, name: true } },
    },
  });
  if (!membership) throw notFound("Der Benutzer");
  return membership;
}

export async function changeUserRole(
  ctx: TenantContext,
  input: { membershipId: string; roleId: string },
): Promise<void> {
  const membership = await loadMembership(ctx, input.membershipId);
  if (membership.userId === ctx.userId)
    throw forbidden("Du kannst deine eigene Rolle nicht ändern.");
  if (membership.roleId === input.roleId) return;
  // Auch die BISHERIGE Rolle darf nicht höher sein als die eigene (sonst ließe sich ein Administrator herabstufen).
  const current = await ctx.db.role.findFirstOrThrow({
    where: { id: membership.roleId },
    include: { permissions: true },
  });
  if (!grantsCoverRole(ctx, current))
    throw forbidden("Diese Person hat mehr Rechte als du. Ihre Rolle kannst du nicht ändern.");
  const role = await assignableRole(ctx, input.roleId);

  await ctx.db.$transaction(async (tx) => {
    if (membership.role.key === "CLUB_ADMIN" && role.key !== "CLUB_ADMIN")
      await assertNotLastAdmin(tx, membership.userId);
    await tx.clubMembership.update({ where: { id: membership.id }, data: { roleId: role.id } });
    await recordAudit(tx, auditActor(ctx), {
      action: "user.role_changed",
      entityType: "ClubMembership",
      entityId: membership.id,
      summary: `Rolle von ${membership.user.firstName} ${membership.user.lastName} geändert: ${membership.role.name} → ${role.name}`,
      changes: { rolle: { from: membership.role.name, to: role.name } },
    });
  });
}

export async function setUserStatus(
  ctx: TenantContext,
  input: { membershipId: string; status: "ACTIVE" | "SUSPENDED" },
): Promise<void> {
  const membership = await loadMembership(ctx, input.membershipId);
  if (membership.userId === ctx.userId) throw forbidden("Du kannst dich nicht selbst sperren.");
  if (membership.status === input.status) return;
  const current = await ctx.db.role.findFirstOrThrow({
    where: { id: membership.roleId },
    include: { permissions: true },
  });
  if (!grantsCoverRole(ctx, current)) throw forbidden("Diese Person hat mehr Rechte als du.");

  await ctx.db.$transaction(async (tx) => {
    if (input.status === "SUSPENDED") await assertNotLastAdmin(tx, membership.userId);
    await tx.clubMembership.update({
      where: { id: membership.id },
      data: { status: input.status },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: input.status === "SUSPENDED" ? "user.suspended" : "user.reactivated",
      entityType: "ClubMembership",
      entityId: membership.id,
      summary: `Zugang von ${membership.user.firstName} ${membership.user.lastName} ${input.status === "SUSPENDED" ? "gesperrt" : "freigegeben"}`,
    });
  });
}

/** Entzieht einem Benutzer den Zugang zum Verein. Der Mitgliedsdatensatz bleibt erhalten, verliert aber die Verknüpfung zum Konto. */
export async function removeUser(ctx: TenantContext, membershipId: string): Promise<void> {
  const membership = await loadMembership(ctx, membershipId);
  if (membership.userId === ctx.userId)
    throw forbidden("Du kannst dich nicht selbst aus dem Verein entfernen.");
  const current = await ctx.db.role.findFirstOrThrow({
    where: { id: membership.roleId },
    include: { permissions: true },
  });
  if (!grantsCoverRole(ctx, current)) throw forbidden("Diese Person hat mehr Rechte als du.");

  await ctx.db.$transaction(async (tx) => {
    await assertNotLastAdmin(tx, membership.userId);
    await tx.member.updateMany({ where: { userId: membership.userId }, data: { userId: null } });
    await tx.clubMembership.delete({ where: { id: membership.id } });
    await recordAudit(tx, auditActor(ctx), {
      action: "user.removed",
      entityType: "ClubMembership",
      entityId: membership.id,
      summary: `${membership.user.firstName} ${membership.user.lastName} wurde aus dem Verein entfernt (Konto-Zugang entzogen)`,
    });
  });
}
