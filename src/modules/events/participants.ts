import type { ParticipantStatus } from "@/generated/prisma/enums";
import { notifyUsers } from "@/modules/notifications/service";
import { recordAudit } from "@/server/audit/audit";
import type { TenantTx } from "@/server/db/tenant";
import { badRequest, conflict, notFound } from "@/server/errors";
import { assertCan, can } from "@/server/permissions/policy";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import {
  eventRow,
  isCapacityError,
  loadVisibleEvent,
  promoteFromWaitlist,
  registrationState,
} from "./service";

/**
 * Teilnehmer: Zu- und Absagen, Teilnehmerlimit und Warteliste.
 *
 * Das Limit wird von der Datenbank erzwungen (Trigger). Bei gleichzeitigen Anmeldungen um den letzten Platz
 * entscheidet die Datenbank – der Service fängt die Ablehnung ab und setzt den Teilnehmer auf die Warteliste
 * (falls aktiviert) oder meldet verständlich "ausgebucht".
 */
async function upsertParticipant(
  tx: TenantTx,
  ctx: TenantContext,
  input: { eventId: string; memberId: string; status: ParticipantStatus; note?: string | null },
): Promise<void> {
  const now = new Date();
  await tx.eventParticipant.upsert({
    where: { eventId_memberId: { eventId: input.eventId, memberId: input.memberId } },
    create: {
      clubId: ctx.clubId,
      eventId: input.eventId,
      memberId: input.memberId,
      status: input.status,
      note: input.note ?? null,
      respondedAt: now,
    },
    update: { status: input.status, note: input.note ?? null, respondedAt: now },
  });
}

/** Zu- oder Absage des angemeldeten Benutzers für sich selbst. Liefert den tatsächlichen Status (evtl. Warteliste). */
export async function respondToEvent(
  ctx: TenantContext,
  input: { eventId: string; response: "ACCEPTED" | "DECLINED"; note?: string },
): Promise<{ status: ParticipantStatus }> {
  assertCan(ctx, "events:participate");
  const memberId = ctx.memberId;
  if (!memberId)
    throw badRequest(
      "Dein Benutzerkonto ist keinem Mitglied zugeordnet. Bitte wende dich an den Vorstand.",
    );
  const event = await loadVisibleEvent(ctx, input.eventId);

  const existing = await ctx.db.eventParticipant.findFirst({
    where: { eventId: event.id, memberId },
  });

  if (input.response === "DECLINED") {
    if (event.status !== "PUBLISHED" || event.endsAt.getTime() < Date.now())
      throw conflict("Für diese Veranstaltung sind keine Änderungen mehr möglich.");
    await ctx.db.$transaction(async (tx) => {
      await upsertParticipant(tx, ctx, {
        eventId: event.id,
        memberId,
        status: "DECLINED",
        note: input.note,
      });
      if (existing?.status === "ACCEPTED") await promoteFromWaitlist(ctx, tx, event.id);
    });
    return { status: "DECLINED" };
  }

  const state = registrationState(event);
  if (!state.open) throw conflict(state.reason ?? "Die Anmeldung ist nicht möglich.");
  if (existing?.status === "ACCEPTED") return { status: "ACCEPTED" };

  try {
    await ctx.db.$transaction((tx) =>
      upsertParticipant(tx, ctx, {
        eventId: event.id,
        memberId,
        status: "ACCEPTED",
        note: input.note,
      }),
    );
    return { status: "ACCEPTED" };
  } catch (error) {
    if (!isCapacityError(error)) throw error;
    if (!event.waitlistEnabled) throw conflict("Die Veranstaltung ist ausgebucht.");
    if (existing?.status !== "WAITLISTED") {
      await ctx.db.$transaction((tx) =>
        upsertParticipant(tx, ctx, {
          eventId: event.id,
          memberId,
          status: "WAITLISTED",
          note: input.note,
        }),
      );
    }
    return { status: "WAITLISTED" };
  }
}

export interface ParticipantRow {
  memberId: string;
  name: string;
  status: ParticipantStatus;
  note: string | null;
  respondedAt: Date;
}

/** Vollständige Teilnehmerliste – nur für Berechtigte (Veranstalter). Andere sehen nur Zähler und den eigenen Status. */
export async function listParticipants(
  ctx: TenantContext,
  eventId: string,
): Promise<ParticipantRow[] | null> {
  const event = await loadVisibleEvent(ctx, eventId);
  if (
    !can(ctx, "events:manage_participants", {
      departmentIds: event.departmentId ? [event.departmentId] : [],
    })
  )
    return null;

  const rows = await ctx.db.eventParticipant.findMany({
    where: { eventId },
    include: { member: { select: { firstName: true, lastName: true } } },
    orderBy: { respondedAt: "asc" },
  });
  const order: Record<ParticipantStatus, number> = { ACCEPTED: 0, WAITLISTED: 1, DECLINED: 2 };
  return rows
    .map((row) => ({
      memberId: row.memberId,
      name: `${row.member.lastName}, ${row.member.firstName}`,
      status: row.status,
      note: row.note,
      respondedAt: row.respondedAt,
    }))
    .sort(
      (a, b) =>
        order[a.status] - order[b.status] || a.respondedAt.getTime() - b.respondedAt.getTime(),
    );
}

/** Mitglieder, die noch keine Antwort gegeben haben (Auswahl zum manuellen Hinzufügen). Nur Namen. */
export async function listParticipantCandidates(
  ctx: TenantContext,
  eventId: string,
): Promise<{ id: string; name: string }[]> {
  const event = await eventRow(ctx, eventId, "events:manage_participants");
  const rows = await ctx.db.member.findMany({
    where: {
      archivedAt: null,
      deletedAt: null,
      status: { in: ["ACTIVE", "HONORARY", "PASSIVE"] },
      participations: { none: { eventId: event.id } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true },
    take: 1000,
  });
  return rows.map((m) => ({ id: m.id, name: `${m.lastName}, ${m.firstName}` }));
}

/** Veranstalter setzen oder ändern den Status eines Teilnehmers manuell. */
export async function setParticipantStatus(
  ctx: TenantContext,
  input: { eventId: string; memberId: string; status: ParticipantStatus },
): Promise<void> {
  const event = await eventRow(ctx, input.eventId, "events:manage_participants");
  if (event.status === "CANCELLED" || event.status === "ARCHIVED")
    throw conflict("Für diese Veranstaltung sind keine Änderungen mehr möglich.");
  const member = await ctx.db.member.findFirst({
    where: { id: input.memberId, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, userId: true },
  });
  if (!member) throw notFound("Das Mitglied");
  const existing = await ctx.db.eventParticipant.findFirst({
    where: { eventId: event.id, memberId: member.id },
  });
  if (existing?.status === input.status) return;

  try {
    await ctx.db.$transaction(async (tx) => {
      await upsertParticipant(tx, ctx, {
        eventId: event.id,
        memberId: member.id,
        status: input.status,
        note: existing?.note,
      });
      if (existing?.status === "ACCEPTED" && input.status !== "ACCEPTED")
        await promoteFromWaitlist(ctx, tx, event.id);
      await recordAudit(tx, auditActor(ctx), {
        action: "event.participant_set",
        entityType: "Event",
        entityId: event.id,
        summary: `${member.firstName} ${member.lastName}: ${existing?.status ?? "neu"} → ${input.status}`,
      });
      if (member.userId && member.userId !== ctx.userId) {
        await notifyUsers(tx, ctx.clubId, {
          userIds: [member.userId],
          type: "EVENT_CHANGED",
          title: `${event.title}: Dein Teilnahmestatus wurde geändert`,
          body:
            input.status === "ACCEPTED"
              ? "Du wurdest angemeldet."
              : input.status === "WAITLISTED"
                ? "Du stehst auf der Warteliste."
                : "Du wurdest abgemeldet.",
          linkUrl: `/veranstaltungen/${event.id}`,
        });
      }
    });
  } catch (error) {
    if (isCapacityError(error))
      throw conflict(
        "Das Teilnehmerlimit ist erreicht. Erhöhe das Limit oder setze die Person auf die Warteliste.",
      );
    throw error;
  }
}

export async function removeParticipant(
  ctx: TenantContext,
  input: { eventId: string; memberId: string },
): Promise<void> {
  const event = await eventRow(ctx, input.eventId, "events:manage_participants");
  const existing = await ctx.db.eventParticipant.findFirst({
    where: { eventId: event.id, memberId: input.memberId },
    include: { member: { select: { firstName: true, lastName: true } } },
  });
  if (!existing) return;
  await ctx.db.$transaction(async (tx) => {
    await tx.eventParticipant.delete({ where: { id: existing.id } });
    if (existing.status === "ACCEPTED") await promoteFromWaitlist(ctx, tx, event.id);
    await recordAudit(tx, auditActor(ctx), {
      action: "event.participant_removed",
      entityType: "Event",
      entityId: event.id,
      summary: `${existing.member.firstName} ${existing.member.lastName} aus der Teilnehmerliste entfernt`,
    });
  });
}
