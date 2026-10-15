import type { Prisma } from "@/generated/prisma/client";
import { loadVisibleEvent } from "@/modules/events/service";
import { mapDatabaseError } from "@/server/action";
import type { TenantTx } from "@/server/db/tenant";
import { notFound } from "@/server/errors";
import { can, type ResourceRef } from "@/server/permissions/policy";
import type { TenantContext } from "@/server/tenancy/context-core";
import type { Eligibility } from "./eligibility";

/**
 * Gemeinsame Bausteine der Helfer- und Schichtplanung für die Teile `service-*.ts` (Einstieg: `service.ts`).
 */
export async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw mapDatabaseError(error) ?? error;
  }
}

export const resourceOf = (event: { departmentId: string | null }): ResourceRef => ({
  departmentIds: event.departmentId ? [event.departmentId] : [],
});
export const fullName = (m: { firstName: string; lastName: string }) =>
  `${m.firstName} ${m.lastName}`;
/** Link in den Helferplan; mit Schicht öffnet der Plan genau diese Schicht (aufgeklappt). */
export const shiftLink = (eventId: string, shiftId?: string) =>
  `/helferplanung/${eventId}${shiftId ? `?schicht=${shiftId}` : ""}`;
/** Ohne Mitglied (z. B. reines Verwaltungskonto) gibt es keine Selbst-Eintragung – mit dem richtigen Grund. */
export const noSignup = (ctx: TenantContext): Eligibility => ({
  allowed: false,
  reason:
    can(ctx, "shifts:signup") && ctx.memberId === null
      ? "Dein Benutzerkonto ist keinem Mitglied zugeordnet – bitte wende dich an den Vorstand."
      : "Für dich ist die Selbst-Eintragung nicht freigeschaltet.",
});

/**
 * Veranstaltungen, deren Schichten für die eigenen Einsätze zählen: veröffentlicht oder schon abgeschlossen. Entwürfe
 * (auch wiederhergestellte) und archivierte sehen normale Mitglieder nicht – ihr Link führte ins Leere, und sie sollen
 * auch keine Eintragung woanders sperren.
 */
export const ACTIVE_EVENT = {
  deletedAt: null,
  status: { in: ["PUBLISHED", "COMPLETED"] },
} satisfies Prisma.EventWhereInput;

export async function ownContext(ctx: TenantContext) {
  if (!ctx.memberId)
    return {
      birthDate: null as Date | null,
      ownShifts: [] as {
        shiftId: string;
        title: string;
        eventTitle: string;
        startsAt: Date;
        endsAt: Date;
      }[],
    };
  const [member, assignments] = await Promise.all([
    ctx.db.member.findFirst({ where: { id: ctx.memberId }, select: { birthDate: true } }),
    ctx.db.shiftAssignment.findMany({
      where: {
        memberId: ctx.memberId,
        status: "CONFIRMED",
        shift: {
          deletedAt: null,
          status: { not: "CANCELLED" },
          endsAt: { gte: new Date() },
          event: ACTIVE_EVENT,
        },
      },
      select: {
        shiftId: true,
        shift: {
          select: { title: true, startsAt: true, endsAt: true, event: { select: { title: true } } },
        },
      },
    }),
  ]);
  return {
    birthDate: member?.birthDate ?? null,
    ownShifts: assignments.map((a) => ({
      shiftId: a.shiftId,
      title: a.shift.title,
      eventTitle: a.shift.event.title,
      startsAt: a.shift.startsAt,
      endsAt: a.shift.endsAt,
    })),
  };
}

export const shiftDetailInclude = {
  responsible: { select: { id: true, firstName: true, lastName: true } },
  assignments: {
    where: { status: "CONFIRMED" as const },
    include: { member: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { assignedAt: "asc" as const },
  },
} satisfies Prisma.EventShiftInclude;

export async function loadShift(ctx: TenantContext, shiftId: string) {
  const shift = await ctx.db.eventShift.findFirst({
    where: { id: shiftId, deletedAt: null },
    include: shiftDetailInclude,
  });
  if (!shift) throw notFound("Die Schicht");
  const event = await loadVisibleEvent(ctx, shift.eventId);
  return { shift, event };
}

export async function userIdsOf(
  db: TenantTx | TenantContext["db"],
  memberIds: string[],
): Promise<string[]> {
  if (memberIds.length === 0) return [];
  const rows = await db.member.findMany({
    where: { id: { in: memberIds } },
    select: { userId: true },
  });
  return rows.map((r) => r.userId).filter((id): id is string => id !== null);
}
