import { recordAudit } from "@/server/audit/audit";
import { assertCan, can } from "@/server/permissions/policy";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import { doneSteps, type SetupFacts, type SetupTaskId } from "./steps";

export interface SetupOverview {
  completedAt: Date | null;
  facts: SetupFacts;
  done: Record<SetupTaskId, boolean>;
  departments: { id: string; name: string; color: string | null }[];
}

export async function getSetupOverview(ctx: TenantContext): Promise<SetupOverview> {
  assertCan(ctx, "club:update");
  const [club, departments, members, users, openInvitations] = await Promise.all([
    ctx.db.club.findFirstOrThrow({
      select: {
        setupCompletedAt: true,
        contactEmail: true,
        street: true,
        city: true,
        logoStorageKey: true,
      },
    }),
    ctx.db.department.findMany({
      where: { isActive: true },
      select: { id: true, name: true, color: true },
      orderBy: { name: "asc" },
    }),
    ctx.db.member.count({ where: { deletedAt: null, archivedAt: null } }),
    ctx.db.clubMembership.count({ where: { status: "ACTIVE" } }),
    ctx.db.invitation.count({
      where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    }),
  ]);
  const facts: SetupFacts = {
    contact: Boolean(club.contactEmail && club.street && club.city),
    logo: club.logoStorageKey !== null,
    departments: departments.length,
    members,
    users,
    openInvitations,
  };
  return { completedAt: club.setupCompletedAt, facts, done: doneSteps(facts), departments };
}

/** Hinweis „Verein einrichten“ im Rahmen der App: nur für Personen, die den Verein verwalten, bis zum Abschluss. */
export async function isSetupPending(ctx: TenantContext): Promise<boolean> {
  if (!can(ctx, "club:update")) return false;
  const club = await ctx.db.club.findFirst({ select: { setupCompletedAt: true } });
  return club !== null && club.setupCompletedAt === null;
}

export async function completeSetup(ctx: TenantContext): Promise<void> {
  assertCan(ctx, "club:update");
  await ctx.db.$transaction(async (tx) => {
    const club = await tx.club.findFirstOrThrow({ select: { setupCompletedAt: true } });
    if (club.setupCompletedAt) return; // schon abgeschlossen – nichts doppelt protokollieren
    await tx.club.update({ where: { id: ctx.clubId }, data: { setupCompletedAt: new Date() } });
    await recordAudit(tx, auditActor(ctx), {
      action: "club.setup_completed",
      entityType: "Club",
      entityId: ctx.clubId,
      summary: "Einrichtung des Vereins abgeschlossen",
    });
  });
}
