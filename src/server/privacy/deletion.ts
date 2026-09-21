import "server-only";
import { formatDateTime } from "@/lib/dates";
import { DELETION_GRACE_DAYS } from "@/lib/privacy";
import { notifyUsers } from "@/modules/notifications/service";
import { recordSystemAudit } from "@/server/audit/audit";
import { verifyPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/client";
import { createTenantDb } from "@/server/db/tenant";
import { env } from "@/server/env";
import { conflict, notFound, validationFailed } from "@/server/errors";
import { sendMailDeferred } from "@/server/mail";
import {
  deletionCompletedEmail,
  deletionRejectedEmail,
  deletionRequestedEmail,
} from "@/server/mail/templates";
import { assertCan } from "@/server/permissions/policy";
import { enforceRateLimit } from "@/server/security/rate-limit";
import type { TenantContext } from "@/server/tenancy/context-core";
import { anonymizeMemberData, scrubNamesInAudit } from "./anonymize";

/**
 * Löschung des Kontos und der Mitgliedsdaten (Recht auf Löschung, Art. 17 DSGVO).
 *
 * Ablauf: Antrag (mit Passwort-Bestätigung) → Bedenkzeit von 14 Tagen (jederzeit widerrufbar) → automatische Ausführung
 * durch den Hintergrundjob. Bei der Ausführung
 *   - werden die Mitgliedsdaten in ALLEN Vereinen der Person anonymisiert (`anonymizeMemberData`),
 *   - Namen im Änderungsprotokoll geschwärzt,
 *   - offene Einladungen an ihre Adresse gelöscht und
 *   - das Konto samt Sitzungen, Token, Mitgliedschaften, Benachrichtigungen und Kalender-Abos endgültig entfernt.
 * Der Antrag selbst bleibt als Nachweis bestehen (ohne Bezug zu Namen). Vor dem Antrag und bei der Ausführung wird
 * geprüft, dass niemand ausgesperrt wird: Der letzte Vereinsadministrator eines Vereins und der letzte Plattform-
 * Administrator können ihr Konto erst löschen, wenn es Ersatz gibt.
 */
export { DELETION_GRACE_DAYS };
const DAY = 86_400_000;

export interface PendingDeletion {
  id: string;
  requestedAt: Date;
  scheduledFor: Date;
}

export async function getPendingDeletion(userId: string): Promise<PendingDeletion | null> {
  const row = await prisma.deletionRequest.findFirst({
    where: { userId, status: "PENDING" },
    orderBy: { requestedAt: "desc" },
  });
  return row ? { id: row.id, requestedAt: row.requestedAt, scheduledFor: row.scheduledFor } : null;
}

/** Was hindert die Löschung? Leere Liste = nichts. */
export async function findDeletionBlockers(userId: string): Promise<string[]> {
  const blockers: string[] = [];
  const adminOf = await prisma.clubMembership.findMany({
    where: { userId, status: "ACTIVE", role: { key: "CLUB_ADMIN" }, club: { status: "ACTIVE" } },
    select: { clubId: true, club: { select: { name: true } } },
  });
  for (const membership of adminOf) {
    const others = await prisma.clubMembership.count({
      where: {
        clubId: membership.clubId,
        userId: { not: userId },
        status: "ACTIVE",
        role: { key: "CLUB_ADMIN" },
        user: { disabledAt: null, deletedAt: null },
      },
    });
    if (others === 0)
      blockers.push(
        `Du bist der letzte Vereinsadministrator von „${membership.club.name}“. Bestimme zuerst einen weiteren Administrator.`,
      );
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPlatformAdmin: true },
  });
  if (user?.isPlatformAdmin) {
    const others = await prisma.user.count({
      where: { isPlatformAdmin: true, id: { not: userId }, disabledAt: null, deletedAt: null },
    });
    if (others === 0)
      blockers.push("Du bist der letzte Plattform-Administrator. Lege zuerst einen weiteren an.");
  }
  return blockers;
}

export async function requestAccountDeletion(
  input: { userId: string; password: string; reason?: string | null },
  meta: { ipPrefix: string | null },
  now: Date = new Date(),
): Promise<PendingDeletion> {
  await enforceRateLimit(`deletion:user:${input.userId}`, 5, 3600);

  const user = await prisma.user.findFirst({
    where: { id: input.userId, deletedAt: null, disabledAt: null },
    select: { id: true, email: true, firstName: true, lastName: true, passwordHash: true },
  });
  if (!user) throw notFound("Das Konto");
  if (!(await verifyPassword(user.passwordHash, input.password)))
    throw validationFailed({ password: ["Das Passwort ist nicht korrekt."] });

  const blockers = await findDeletionBlockers(user.id);
  if (blockers.length > 0) throw conflict(blockers.join(" "));
  if (await getPendingDeletion(user.id))
    throw conflict(
      "Es liegt bereits ein Löschantrag vor. Du kannst ihn unter „Datenschutz“ zurückziehen.",
    );

  const scheduledFor = new Date(now.getTime() + DELETION_GRACE_DAYS * DAY);
  const request = await prisma.deletionRequest.create({
    data: {
      userId: user.id,
      clubId: null,
      reason: input.reason?.trim().slice(0, 500) || null,
      requestedAt: now,
      scheduledFor,
    },
  });

  const memberships = await prisma.clubMembership.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    select: { clubId: true },
  });
  for (const { clubId } of memberships) {
    await recordSystemAudit({
      clubId,
      actorUserId: user.id,
      action: "privacy.deletion_requested",
      entityType: "DeletionRequest",
      entityId: request.id,
      summary: "Löschung des Kontos beantragt",
      ipPrefix: meta.ipPrefix,
    });
    // Verantwortliche für Datenschutzanfragen erfahren davon – ohne dass sie etwas tun müssen (automatische Ausführung).
    const admins = await prisma.clubMembership.findMany({
      where: {
        clubId,
        status: "ACTIVE",
        userId: { not: user.id },
        role: { permissions: { some: { permissionKey: "privacy:manage" } } },
      },
      select: { userId: true },
    });
    await notifyUsers(createTenantDb(clubId), clubId, {
      userIds: admins.map((admin) => admin.userId),
      type: "SYSTEM",
      title: `Löschantrag: ${user.firstName} ${user.lastName}`,
      body: `Das Konto und die Mitgliedsdaten werden am ${formatDateTime(scheduledFor)} Uhr automatisch gelöscht bzw. anonymisiert.`,
      linkUrl: "/datenschutz",
    });
  }
  await sendMailDeferred(
    deletionRequestedEmail({
      to: user.email,
      scheduledFor,
      profileUrl: `${env.APP_URL}/datenschutz`,
    }),
  );
  return { id: request.id, requestedAt: now, scheduledFor };
}

export async function cancelAccountDeletion(
  userId: string,
  meta: { ipPrefix: string | null },
  now: Date = new Date(),
): Promise<void> {
  const { count } = await prisma.deletionRequest.updateMany({
    where: { userId, status: "PENDING" },
    data: {
      status: "CANCELLED",
      processedAt: now,
      processedByUserId: userId,
      note: "Vom Antragsteller zurückgezogen",
    },
  });
  if (count === 0) throw notFound("Der Löschantrag");
  const memberships = await prisma.clubMembership.findMany({
    where: { userId },
    select: { clubId: true },
  });
  for (const { clubId } of memberships) {
    await recordSystemAudit({
      clubId,
      actorUserId: userId,
      action: "privacy.deletion_cancelled",
      entityType: "User",
      entityId: userId,
      summary: "Löschantrag zurückgezogen",
      ipPrefix: meta.ipPrefix,
    });
  }
}

export type DeletionOutcome = "COMPLETED" | "REJECTED" | "SKIPPED";

/**
 * Führt einen fälligen Löschantrag aus (Aufruf durch den Hintergrundjob). Wiederholbar: Ist der Antrag nicht mehr
 * offen, passiert nichts. Alles geschieht in EINER Transaktion – entweder komplett oder gar nicht.
 */
export async function executeDeletionRequest(
  requestId: string,
  now: Date = new Date(),
): Promise<DeletionOutcome> {
  const request = await prisma.deletionRequest.findUnique({ where: { id: requestId } });
  if (!request || request.status !== "PENDING") return "SKIPPED";

  const user = await prisma.user.findUnique({
    where: { id: request.userId },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  if (!user) {
    await prisma.deletionRequest.update({
      where: { id: request.id },
      data: { status: "COMPLETED", processedAt: now, note: "Das Konto war bereits gelöscht." },
    });
    return "COMPLETED";
  }

  const blockers = await findDeletionBlockers(user.id);
  if (blockers.length > 0) {
    await prisma.deletionRequest.update({
      where: { id: request.id },
      data: {
        status: "REJECTED",
        processedAt: now,
        note: `Nicht ausgeführt: ${blockers.join(" ")}`,
      },
    });
    await sendMailDeferred(deletionRejectedEmail({ to: user.email, reason: blockers.join(" ") }));
    return "REJECTED";
  }

  const memberships = await prisma.clubMembership.findMany({
    where: { userId: user.id },
    select: { clubId: true, member: { select: { id: true } } },
  });
  const clubIds = memberships.map((membership) => membership.clubId);

  await prisma.$transaction(
    async (tx) => {
      let anonymized = 0;
      for (const membership of memberships) {
        if (
          membership.member &&
          (await anonymizeMemberData(tx, membership.clubId, membership.member.id, now))
        )
          anonymized += 1;
      }
      await scrubNamesInAudit(tx, clubIds, [`${user.firstName} ${user.lastName}`]);
      await tx.invitation.deleteMany({ where: { email: user.email } });
      // Support-Meldungen dieser Person (freie Texte, können Personenbezug haben) werden mit dem Konto gelöscht; als Bearbeiter
      // eingetragene Verweise auf das Konto werden gelöst.
      await tx.supportTicket.deleteMany({ where: { createdById: user.id } });
      await tx.supportTicket.updateMany({
        where: { respondedById: user.id },
        data: { respondedById: null },
      });
      await tx.user.delete({ where: { id: user.id } }); // Sitzungen, Token, Mitgliedschaften (mit Benachrichtigungen und Kalender-Abos) entfallen mit
      await tx.deletionRequest.update({
        where: { id: request.id },
        data: {
          status: "COMPLETED",
          processedAt: now,
          note: `Konto gelöscht; ${anonymized} Mitgliedsdatensatz/-sätze anonymisiert.`,
        },
      });
      for (const clubId of clubIds) {
        await tx.auditLog.create({
          data: {
            clubId,
            actorType: "SYSTEM",
            action: "privacy.deletion_completed",
            entityType: "User",
            entityId: user.id,
            summary: "Konto und Mitgliedsdaten auf Antrag gelöscht",
          },
        });
      }
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  await sendMailDeferred(deletionCompletedEmail({ to: user.email }));
  return "COMPLETED";
}

export interface DeletionRunResult {
  completed: number;
  rejected: number;
}

export async function processDueDeletionRequests(
  now: Date = new Date(),
): Promise<DeletionRunResult> {
  const due = await prisma.deletionRequest.findMany({
    where: { status: "PENDING", scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
    select: { id: true },
    take: 50,
  });
  const result: DeletionRunResult = { completed: 0, rejected: 0 };
  for (const { id } of due) {
    const outcome = await executeDeletionRequest(id, now);
    if (outcome === "COMPLETED") result.completed += 1;
    if (outcome === "REJECTED") result.rejected += 1;
  }
  return result;
}

export interface ClubDeletionRequest {
  id: string;
  name: string;
  requestedAt: Date;
  scheduledFor: Date;
}

/** Für Verantwortliche des Datenschutzes: offene Löschanträge von Personen DIESES Vereins (nur zur Information). */
export async function listPendingDeletionRequests(
  ctx: TenantContext,
): Promise<ClubDeletionRequest[]> {
  assertCan(ctx, "privacy:manage");
  const people = await ctx.db.clubMembership.findMany({
    select: { userId: true, user: { select: { firstName: true, lastName: true } } },
  });
  const names = new Map(
    people.map((person) => [person.userId, `${person.user.firstName} ${person.user.lastName}`]),
  );
  const requests = await prisma.deletionRequest.findMany({
    where: { status: "PENDING", userId: { in: [...names.keys()] } },
    orderBy: { scheduledFor: "asc" },
  });
  return requests.map((request) => ({
    id: request.id,
    name: names.get(request.userId) ?? "Unbekannt",
    requestedAt: request.requestedAt,
    scheduledFor: request.scheduledFor,
  }));
}
