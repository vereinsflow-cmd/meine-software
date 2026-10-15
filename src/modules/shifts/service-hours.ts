import type { Prisma } from "@/generated/prisma/client";
import { startOfBerlinDate } from "@/lib/dates";
import { recordAudit } from "@/server/audit/audit";
import { conflict, forbidden, notFound } from "@/server/errors";
import { assertCan, can, scopeOf } from "@/server/permissions/policy";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import { fullName, loadShift, resourceOf } from "./service-shared";

// ---------------------------------------------------------------------------------------------
// Helferstunden
// ---------------------------------------------------------------------------------------------

async function loadAssignmentForHours(ctx: TenantContext, assignmentId: string) {
  const assignment = await ctx.db.shiftAssignment.findFirst({
    where: { id: assignmentId, status: "CONFIRMED" },
    include: {
      shift: {
        include: {
          event: { select: { departmentId: true, title: true, status: true, deletedAt: true } },
        },
      },
      member: { select: { firstName: true, lastName: true } },
    },
  });
  if (!assignment || assignment.shift.deletedAt || assignment.shift.event.deletedAt)
    throw notFound("Die Eintragung");
  if (!can(ctx, "shifts:hours", resourceOf(assignment.shift.event))) throw forbidden();
  return assignment;
}

/** Dokumentiert die tatsächlich geleisteten Minuten eines Helfers (erst nach Beginn der Schicht). */
export async function recordHours(
  ctx: TenantContext,
  input: { assignmentId: string; minutes: number },
): Promise<void> {
  const assignment = await loadAssignmentForHours(ctx, input.assignmentId);
  if (assignment.shift.startsAt.getTime() > Date.now())
    throw conflict(
      "Die Schicht hat noch nicht begonnen. Stunden lassen sich erst danach dokumentieren.",
    );
  await ctx.db.$transaction(async (tx) => {
    await tx.shiftAssignment.update({
      where: { id: assignment.id },
      data: {
        workedMinutes: input.minutes,
        hoursApprovedAt: new Date(),
        hoursApprovedById: ctx.userId,
      },
    });
    await recordAudit(tx, auditActor(ctx), {
      action: "shift.hours_recorded",
      entityType: "EventShift",
      entityId: assignment.shiftId,
      summary: `${fullName(assignment.member)}: ${input.minutes} Minuten dokumentiert (Schicht „${assignment.shift.title}“)`,
    });
  });
}

/** Übernimmt für alle Eingetragenen ohne dokumentierte Stunden die geplante Dauer. */
export async function confirmPlannedHours(ctx: TenantContext, shiftId: string): Promise<number> {
  const { shift, event } = await loadShift(ctx, shiftId);
  if (!can(ctx, "shifts:hours", resourceOf(event))) throw forbidden();
  if (shift.startsAt.getTime() > Date.now())
    throw conflict(
      "Die Schicht hat noch nicht begonnen. Stunden lassen sich erst danach dokumentieren.",
    );
  const planned = Math.round((shift.endsAt.getTime() - shift.startsAt.getTime()) / 60_000);
  return ctx.db.$transaction(async (tx) => {
    const result = await tx.shiftAssignment.updateMany({
      where: { shiftId, status: "CONFIRMED", workedMinutes: null },
      data: { workedMinutes: planned, hoursApprovedAt: new Date(), hoursApprovedById: ctx.userId },
    });
    if (result.count > 0) {
      await recordAudit(tx, auditActor(ctx), {
        action: "shift.hours_recorded",
        entityType: "EventShift",
        entityId: shiftId,
        summary: `Geplante Dauer (${planned} Min.) für ${result.count} Helfer der Schicht „${shift.title}“ übernommen`,
      });
    }
    return result.count;
  });
}

export interface HoursRow {
  memberId: string;
  name: string;
  shifts: number;
  minutes: number;
}

/** Dokumentierte Helferstunden im Zeitraum – im Rahmen der Reichweite (alle, eigene Abteilung(en) oder nur die eigenen). */
function workedHoursWhere(
  ctx: TenantContext,
  scope: ReturnType<typeof scopeOf>,
  from: Date,
  to: Date,
): Prisma.ShiftAssignmentWhereInput {
  return {
    status: "CONFIRMED",
    workedMinutes: { not: null },
    shift: {
      deletedAt: null,
      startsAt: { gte: from, lt: to },
      ...(scope === "DEPARTMENT"
        ? { event: { departmentId: { in: [...ctx.ledDepartmentIds] } } }
        : {}),
    },
    ...(scope === null ? { memberId: ctx.memberId ?? "kein-mitglied" } : {}),
  };
}

/**
 * Für Auswertungen: dokumentierte Helferminuten samt Datum der Schicht (nur diese zwei Angaben, keine Namen) im Zeitraum.
 * Es gilt dieselbe Sichtbarkeit wie in der Stundenübersicht.
 */
export async function listWorkedMinutes(
  ctx: TenantContext,
  range: { from: Date; to: Date },
): Promise<{ scope: "ALL" | "OWN"; rows: { at: Date; minutes: number }[] }> {
  assertCan(ctx, "shifts:read");
  const scope = scopeOf(ctx, "shifts:hours");
  const rows = await ctx.db.shiftAssignment.findMany({
    where: workedHoursWhere(ctx, scope, range.from, range.to),
    select: { workedMinutes: true, shift: { select: { startsAt: true } } },
  });
  return {
    scope: scope === null ? "OWN" : "ALL",
    rows: rows.map((row) => ({ at: row.shift.startsAt, minutes: row.workedMinutes ?? 0 })),
  };
}

/** Helferstunden eines Jahres. Veranstalter sehen alle (im Rahmen ihrer Reichweite), Mitglieder nur die eigenen. */
export async function getHoursOverview(
  ctx: TenantContext,
  year: number,
): Promise<{ rows: HoursRow[]; totalMinutes: number; scope: "ALL" | "OWN" }> {
  assertCan(ctx, "shifts:read");
  const scope = scopeOf(ctx, "shifts:hours");
  // Das Jahr nach Berliner Zeit (wie die Auswertungen und der Kursverlauf auf dem Dashboard). Vorher wurde nach UTC-Jahr ODER
  // UTC-Jahr zwei Stunden später gefiltert – eine Schicht in der Silvesternacht (23–1 Uhr) zählte dann in beiden Jahren.
  const from = startOfBerlinDate(year, 1, 1);
  const to = startOfBerlinDate(year + 1, 1, 1);

  const rows = await ctx.db.shiftAssignment.findMany({
    where: workedHoursWhere(ctx, scope, from, to),
    select: {
      memberId: true,
      workedMinutes: true,
      shift: { select: { startsAt: true } },
      member: { select: { firstName: true, lastName: true } },
    },
  });

  const byMember = new Map<string, HoursRow>();
  for (const row of rows) {
    const entry = byMember.get(row.memberId) ?? {
      memberId: row.memberId,
      name: `${row.member.lastName}, ${row.member.firstName}`,
      shifts: 0,
      minutes: 0,
    };
    entry.shifts += 1;
    entry.minutes += row.workedMinutes ?? 0;
    byMember.set(row.memberId, entry);
  }
  const list = [...byMember.values()].sort(
    (a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name, "de"),
  );
  return {
    rows: list,
    totalMinutes: list.reduce((sum, r) => sum + r.minutes, 0),
    scope: scope === null ? "OWN" : "ALL",
  };
}
