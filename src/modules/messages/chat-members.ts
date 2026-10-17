import type { Prisma } from "@/generated/prisma/client";
import { eventRow, isCapacityError } from "@/modules/events/service";
import { notifyUsers } from "@/modules/notifications/service";
import { recordAudit } from "@/server/audit/audit";
import { conflict, forbidden, isAppError, notFound } from "@/server/errors";
import { can, scopeOf } from "@/server/permissions/policy";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";
import { chatTitle, joinNames, parseChatKey, type ChatTarget } from "./chat-format";
import { MAX_MEMBERS_PER_ADD } from "./schemas";
import { ACTIVE_STATUSES, authorNames, resolveRecipients } from "./service";

/**
 * Mitglieder einer Chat-Gruppe später hinzufügen (17.10.2026, Wunsch „bei den Gruppen im Chat noch Mitglieder später
 * hinzufügen“). Eine Chat-Gruppe ist keine eigene Liste, sondern die Abteilung bzw. die zugesagten Teilnehmer einer
 * Veranstaltung. Hinzufügen heißt deshalb dasselbe wie auf der Abteilungs- bzw. Veranstaltungsseite – mit denselben
 * Rechten:
 * - Abteilung: in die Abteilung aufnehmen – nur vereinsweit Berechtigte (`departments:manage` Verein; die Leitung sieht
 *   laut Berechtigungskonzept nur die Mitglieder ihrer eigenen Abteilung und könnte niemanden finden);
 * - Teilnehmer einer Veranstaltung: als zugesagt anmelden – wer die Teilnehmerliste verwalten darf
 *   (`events:manage_participants`, Leitung also für die Veranstaltungen ihrer Abteilungen); das Teilnehmerlimit gilt.
 * „Alle Mitglieder“ umfasst ohnehin jeden, Helfer kommen über ihre Schichten (Helferplanung) in die Gruppe.
 *
 * Im Verlauf erscheint ein Hinweis „Anna hat Hans hinzugefügt“ (Nachricht der Art MEMBERS_ADDED). Er geht an alle in der
 * Gruppe – für die Neuen ungelesen und mit Benachrichtigung, damit sie den Chat in ihrer Liste finden. Ältere Nachrichten
 * sehen die Neuen nicht (wie bei WhatsApp: Empfänger werden beim Senden festgehalten).
 */
type Addable =
  | { audience: "DEPARTMENT"; departmentId: string; name: string }
  | { audience: "EVENT_PARTICIPANTS"; eventId: string; name: string };

/** Darf ich dieser Gruppe Mitglieder hinzufügen? Wirft „nicht gefunden“, „keine Berechtigung“ oder einen Konflikt. */
async function loadAddable(ctx: TenantContext, target: ChatTarget): Promise<Addable> {
  if (target.audience === "DEPARTMENT" && target.departmentId) {
    const department = await ctx.db.department.findFirst({
      where: { id: target.departmentId, isActive: true },
      select: { id: true, name: true },
    });
    if (!department) throw notFound("Die Abteilung");
    if (scopeOf(ctx, "departments:manage") !== "CLUB")
      throw forbidden("Mitglieder einer Abteilung fügen nur Vorstand und Verwaltung hinzu.");
    return { audience: "DEPARTMENT", departmentId: department.id, name: department.name };
  }
  if (target.audience === "EVENT_PARTICIPANTS" && target.eventId) {
    const event = await eventRow(ctx, target.eventId, "events:manage_participants");
    if (event.status === "CANCELLED" || event.status === "ARCHIVED")
      throw conflict("Für diese Veranstaltung sind keine Änderungen mehr möglich.");
    return { audience: "EVENT_PARTICIPANTS", eventId: event.id, name: event.title };
  }
  throw forbidden(
    target.audience === "ALL_MEMBERS"
      ? "Zu „Alle Mitglieder“ gehört ohnehin jedes Mitglied."
      : "Helfer kommen über ihre Schichten in die Gruppe – trage sie in der Helferplanung ein.",
  );
}

/** Wer sich hinzufügen lässt: aktive Mitglieder (aktiv, Ehren- oder passives Mitglied), die noch nicht dazugehören. */
function candidateWhere(group: Addable): Prisma.MemberWhereInput {
  return {
    archivedAt: null,
    deletedAt: null,
    status: { in: [...ACTIVE_STATUSES] },
    ...(group.audience === "DEPARTMENT"
      ? { departments: { none: { departmentId: group.departmentId } } }
      : // Wer schon geantwortet hat (auch abgesagt oder auf der Warteliste), bleibt bei seiner Antwort – ändern lässt sie
        // sich auf der Seite der Veranstaltung.
        { participations: { none: { eventId: group.eventId } } }),
  };
}

function alreadyInGroup(group: Addable, count: number): string {
  if (group.audience === "DEPARTMENT")
    return count === 1
      ? "Diese Person gehört schon zur Abteilung."
      : "Die Ausgewählten gehören schon zur Abteilung.";
  return count === 1
    ? "Diese Person hat schon geantwortet (zugesagt, abgesagt oder auf der Warteliste)."
    : "Die Ausgewählten haben schon geantwortet (zugesagt, abgesagt oder auf der Warteliste).";
}

const candidateSelect = {
  id: true,
  firstName: true,
  lastName: true,
  userId: true,
  membership: { select: { status: true } },
} satisfies Prisma.MemberSelect;

export interface AddMembersOptions {
  audience: Addable["audience"];
  /** Name der Abteilung bzw. Veranstaltung (für den Hinweis im Fenster). */
  name: string;
  /** `hasAccount`: kann die App nutzen und liest im Chat mit – sonst gehört die Person nur zur Gruppe. */
  candidates: { id: string; name: string; hasAccount: boolean }[];
}

/**
 * Für den Knopf „Mitglieder hinzufügen“ im Chat: wen ich hinzufügen kann (noch nicht dabei, alphabetisch). `null`, wenn
 * ich es hier nicht darf – dann gibt es keinen Knopf.
 */
export async function getAddMembersOptions(
  ctx: TenantContext,
  target: ChatTarget,
): Promise<AddMembersOptions | null> {
  // Ohne das Recht überhaupt keine Datenbankabfrage – das betrifft die meisten, die einen Chat öffnen.
  if (target.audience === "DEPARTMENT" && scopeOf(ctx, "departments:manage") !== "CLUB")
    return null;
  if (target.audience === "EVENT_PARTICIPANTS" && !can(ctx, "events:manage_participants"))
    return null;
  if (target.audience !== "DEPARTMENT" && target.audience !== "EVENT_PARTICIPANTS") return null;
  let group: Addable;
  try {
    group = await loadAddable(ctx, target);
  } catch (error) {
    if (isAppError(error) && ["NOT_FOUND", "FORBIDDEN", "CONFLICT"].includes(error.code))
      return null;
    throw error;
  }
  const rows = await ctx.db.member.findMany({
    where: candidateWhere(group),
    select: candidateSelect,
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 2000,
  });
  return {
    audience: group.audience,
    name: group.name,
    candidates: rows.map((m) => ({
      id: m.id,
      name: `${m.lastName}, ${m.firstName}`,
      hasAccount: m.userId !== null && m.membership?.status === "ACTIVE",
    })),
  };
}

/**
 * Fügt der Gruppe eines Chats Mitglieder hinzu (in die Abteilung bzw. als zugesagte Teilnehmer) und schreibt den Hinweis
 * in den Verlauf. Wer schon dazugehört, wird übersprungen; gehören alle schon dazu, ist das ein Konflikt. IDs anderer
 * Vereine sind über die Vereins-Datenbankverbindung gar nicht sichtbar – „nicht gefunden“.
 */
export async function addChatMembers(
  ctx: TenantContext,
  input: { chat: string; memberIds: readonly string[] },
): Promise<{ added: number; messageId: string }> {
  const target = parseChatKey(input.chat);
  if (!target) throw notFound("Der Chat");
  const group = await loadAddable(ctx, target);
  const ids = [...new Set(input.memberIds)];
  if (ids.length === 0) throw conflict("Bitte wähle mindestens eine Person aus.");
  if (ids.length > MAX_MEMBERS_PER_ADD)
    throw conflict(`Bitte füge höchstens ${MAX_MEMBERS_PER_ADD} Personen auf einmal hinzu.`);

  const [known, fresh] = await Promise.all([
    ctx.db.member.count({
      where: {
        id: { in: ids },
        archivedAt: null,
        deletedAt: null,
        status: { in: [...ACTIVE_STATUSES] },
      },
    }),
    ctx.db.member.findMany({
      where: { AND: [candidateWhere(group), { id: { in: ids } }] },
      select: candidateSelect,
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
  ]);
  if (known !== ids.length) throw notFound(ids.length === 1 ? "Das Mitglied" : "Ein Mitglied");
  if (fresh.length === 0) throw conflict(alreadyInGroup(group, ids.length));

  const chatTarget: ChatTarget =
    group.audience === "DEPARTMENT"
      ? { audience: "DEPARTMENT", departmentId: group.departmentId, eventId: null }
      : { audience: "EVENT_PARTICIPANTS", departmentId: null, eventId: group.eventId };
  const title = chatTitle(group.audience, { department: group.name, event: group.name });
  const actor = (await authorNames(ctx, [{ authorUserId: ctx.userId }])).get(ctx.userId) ?? null;
  const now = new Date();

  try {
    return await ctx.db.$transaction(async (tx) => {
      // Gleichzeitig hinzugefügt oder geantwortet? Dann gilt das Bestehende (keine Doppelten, keine überschriebene Antwort).
      const inserted =
        group.audience === "DEPARTMENT"
          ? await tx.memberDepartment.createManyAndReturn({
              data: fresh.map((m) => ({
                clubId: ctx.clubId,
                memberId: m.id,
                departmentId: group.departmentId,
              })),
              skipDuplicates: true,
              select: { memberId: true },
            })
          : await tx.eventParticipant.createManyAndReturn({
              data: fresh.map((m) => ({
                clubId: ctx.clubId,
                eventId: group.eventId,
                memberId: m.id,
                status: "ACCEPTED" as const,
                respondedAt: now,
              })),
              skipDuplicates: true,
              select: { memberId: true },
            });
      const addedIds = new Set(inserted.map((row) => row.memberId));
      const added = fresh.filter((m) => addedIds.has(m.id));
      if (added.length === 0) throw conflict(alreadyInGroup(group, fresh.length));

      for (const m of added)
        await recordAudit(
          tx,
          auditActor(ctx),
          group.audience === "DEPARTMENT"
            ? {
                action: "department.member_added",
                entityType: "Department",
                entityId: group.departmentId,
                summary: `${m.firstName} ${m.lastName} zur Abteilung ${group.name} hinzugefügt (im Chat)`,
              }
            : {
                action: "event.participant_set",
                entityType: "Event",
                entityId: group.eventId,
                summary: `${m.firstName} ${m.lastName}: neu → ACCEPTED (im Chat hinzugefügt)`,
              },
        );

      // Hinweis im Verlauf – an alle, die jetzt dazugehören (wie eine Nachricht; der Hinzufügende ist der Verfasser).
      const names = joinNames(added.map((m) => `${m.firstName} ${m.lastName}`));
      const note = await tx.message.create({
        data: {
          clubId: ctx.clubId,
          authorUserId: ctx.userId,
          kind: "MEMBERS_ADDED",
          subject: "Mitglieder hinzugefügt",
          body: names,
          audience: group.audience,
          departmentId: chatTarget.departmentId,
          eventId: chatTarget.eventId,
          status: "SENT",
          sentAt: now,
        },
        select: { id: true },
      });
      const resolved = await resolveRecipients(tx, group.audience, {
        departmentId: chatTarget.departmentId ?? undefined,
        eventId: chatTarget.eventId ?? undefined,
      });
      const recipients = resolved.reachable.filter((r) => r.userId !== ctx.userId);
      // Für alle, die schon dabei waren, ist der Hinweis kein „Ungelesen“ – nur für die Neuen.
      await tx.messageRecipient.createMany({
        data: recipients.map((r) => ({
          clubId: ctx.clubId,
          messageId: note.id,
          memberId: r.memberId,
          userId: r.userId,
          readAt: addedIds.has(r.memberId) ? null : now,
        })),
        skipDuplicates: true,
      });
      await tx.message.update({
        where: { id: note.id },
        data: { recipientCount: recipients.length },
      });
      await notifyUsers(tx, ctx.clubId, {
        userIds: recipients.filter((r) => addedIds.has(r.memberId)).map((r) => r.userId),
        type: "MESSAGE",
        title: `${title}: ${actor ?? "Der Verein"} hat dich hinzugefügt`,
        body:
          group.audience === "DEPARTMENT"
            ? `Du gehörst jetzt zur Abteilung ${group.name} und liest im Chat mit.`
            : `Du bist jetzt für „${group.name}“ angemeldet und liest im Chat mit.`,
        linkUrl: `/nachrichten/${note.id}`,
      });
      return { added: added.length, messageId: note.id };
    });
  } catch (error) {
    if (isCapacityError(error))
      throw conflict(
        "Das Teilnehmerlimit der Veranstaltung ist erreicht. Erhöhe das Limit auf der Seite der Veranstaltung oder wähle weniger Personen.",
      );
    throw error;
  }
}
