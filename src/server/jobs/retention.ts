import "server-only";
import { readRetention } from "@/lib/club-settings";
import { berlinParts, startOfBerlinDate, todayCalendarDate } from "@/lib/dates";
import {
  APPLICATION_DECIDED_RETENTION_DAYS,
  APPLICATION_PENDING_RETENTION_DAYS,
} from "@/lib/membership-application";
import { SUPPORT_RETENTION_MONTHS } from "@/lib/support";
import { ATTENDANCE_RETENTION_MONTHS } from "@/modules/events/attendance-schemas";
import { DOCUMENT_TRASH_DAYS } from "@/lib/uploads";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/client";
import { anonymizeMemberData } from "@/server/privacy/anonymize";
import { deleteFile } from "@/server/storage/files";

/**
 * Aufbewahrungsfristen (DSGVO: Speicherbegrenzung). Die Fristen legt jeder Verein in den Einstellungen fest
 * (`readRetention`, mit Standardwerten):
 *  - Papierkorb: Mitglieder, die länger als `trashDays` im Papierkorb liegen, werden anonymisiert.
 *  - Ausgetretene Mitglieder: nach `leftMembersMonths` (0 = nie automatisch) anonymisiert.
 *  - Änderungsprotokoll: Einträge älter als `auditMonths` werden gelöscht (nur die Aufbewahrungsroutine darf das).
 *  - Feste Fristen ohne Einstellung: gelöschte Dokumente, erledigte Support-Meldungen, Beitrittsanträge, Anwesenheit
 *    (24 Monate nach dem Termin).
 *
 * Jede Anonymisierung läuft in einer eigenen Transaktion und hinterlässt einen Protokolleintrag (ohne Namen). Scheitert ein
 * Mitglied oder ein Verein, wird das ohne Namen protokolliert und gezählt (`failed`); die übrigen Mitglieder, Vereine und die
 * festen Fristen laufen weiter, der nächste Lauf versucht es erneut.
 */
const DAY = 86_400_000;
const BATCH = 200;

export interface RetentionResult {
  trashAnonymized: number;
  leftAnonymized: number;
  auditDeleted: number;
  /** Endgültig entfernte gelöschte Dokumente (Datensatz und Datei). */
  documentsPurged: number;
  /** Gelöschte erledigte Support-Meldungen. */
  ticketsPurged: number;
  /** Gelöschte Beitrittsanträge (entschiedene nach 30, offene nach 180 Tagen). */
  applicationsPurged: number;
  /** Gelöschte Anwesenheiten (Termin liegt mehr als 24 Monate zurück). */
  attendancePurged: number;
  /** Mitglieder bzw. Vereine, bei denen die Bearbeitung fehlschlug (Details im Server-Protokoll, ohne Namen). */
  failed: number;
}

/**
 * Löscht Beitrittsanträge (Mitglied werden per QR-Code): entschiedene {@link APPLICATION_DECIDED_RETENTION_DAYS} Tage nach
 * der Entscheidung, nie entschiedene {@link APPLICATION_PENDING_RETENTION_DAYS} Tage nach dem Eingang. Ein Antrag enthält
 * Personendaten von jemandem, der (noch) kein Mitglied ist; angenommene Personen stehen danach im Mitgliedsdatensatz, für
 * die Nachvollziehbarkeit bleibt das Änderungsprotokoll (ohne Namen der Abgelehnten).
 */
export async function purgeOldApplications(now: Date = new Date()): Promise<number> {
  const result = await prisma.membershipApplication.deleteMany({
    where: {
      OR: [
        {
          status: { not: "PENDING" },
          decidedAt: { lt: new Date(now.getTime() - APPLICATION_DECIDED_RETENTION_DAYS * DAY) },
        },
        {
          status: "PENDING",
          createdAt: { lt: new Date(now.getTime() - APPLICATION_PENDING_RETENTION_DAYS * DAY) },
        },
      ],
    },
  });
  return result.count;
}

/**
 * Löscht erledigte Support-Meldungen (Hilfe & Support), die seit mehr als {@link SUPPORT_RETENTION_MONTHS} Monaten nicht mehr
 * bearbeitet wurden. Offene und laufende Meldungen bleiben – sie sind noch nicht erledigt. Die Texte können Personenbezug haben
 * (Speicherbegrenzung); für die Nachvollziehbarkeit genügt das Änderungsprotokoll.
 */
export async function purgeOldTickets(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - SUPPORT_RETENTION_MONTHS);
  const result = await prisma.supportTicket.deleteMany({
    where: { status: "DONE", updatedAt: { lt: cutoff } },
  });
  return result.count;
}

/**
 * Entfernt Dokumente, die seit mehr als 30 Tagen gelöscht sind – zuerst die Datei, dann den Datensatz. Fehlt die Datei
 * schon (z. B. nach einer Wiederherstellung ohne Dateiablage), wird der Datensatz trotzdem entfernt. Scheitert das Löschen
 * der Datei aus anderem Grund, bleibt der Datensatz für den nächsten Lauf erhalten (keine Karteileichen im Speicher).
 */
export async function purgeDeletedDocuments(now: Date = new Date()): Promise<number> {
  const due = await prisma.document.findMany({
    where: {
      deletedAt: { lt: new Date(now.getTime() - DOCUMENT_TRASH_DAYS * DAY) },
      // Belege im Kassenbuch bleiben, solange eine Buchung auf sie verweist (Frist läuft bzw. Kassenbuch noch nicht bereinigt) –
      // sonst wäre die Datei weg, der Datensatz aber nicht löschbar.
      AND: [
        { OR: [{ retainUntil: null }, { retainUntil: { lt: todayCalendarDate(now) } }] },
        { OR: [{ invoice: { is: null } }, { invoice: { is: { ledgerLines: { none: {} } } } }] },
      ],
      ledgerAttachments: { none: {} },
    },
    select: { id: true, clubId: true, storageKey: true },
    take: 500,
  });
  let purged = 0;
  for (const document of due) {
    try {
      await deleteFile(document.clubId, document.storageKey);
      await prisma.document.delete({ where: { id: document.id } });
      purged += 1;
    } catch (error) {
      console.error(
        `[retention] Dokument konnte nicht entfernt werden: ${error instanceof Error ? error.name : "Fehler"}`,
      );
    }
  }
  return purged;
}

const subtractMonths = (date: Date, months: number): Date => {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() - months);
  return result;
};

/**
 * Löscht Anwesenheiten von Terminen, die mehr als {@link ATTENDANCE_RETENTION_MONTHS} Monate zurückliegen (gemessen am
 * Beginn des Termins). Danach braucht es sie weder für Auswertungen noch für übliche Nachweise; der Termin selbst bleibt.
 */
export async function purgeOldAttendance(now: Date = new Date()): Promise<number> {
  const result = await prisma.eventAttendance.deleteMany({
    where: { event: { startsAt: { lt: subtractMonths(now, ATTENDANCE_RETENTION_MONTHS) } } },
  });
  return result.count;
}

async function anonymizeOne(
  clubId: string,
  memberId: string,
  reason: string,
  now: Date,
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const done = await anonymizeMemberData(tx, clubId, memberId, now);
    if (done) {
      await tx.auditLog.create({
        data: {
          clubId,
          actorType: "SYSTEM",
          action: "member.anonymized",
          entityType: "Member",
          entityId: memberId,
          summary: `Mitglied anonymisiert (${reason})`,
        },
      });
    }
    return done;
  });
}

/** Protokolliert einen Fehler der Aufbewahrungsroutine – nur Fehlertyp und -code, nie die Meldung (kann Daten enthalten). */
function logRetentionError(what: string, error: unknown): void {
  const code = (error as { code?: unknown } | null)?.code;
  console.error(
    `[retention] ${what}: ${error instanceof Error ? error.name : "Fehler"}${code ? ` (${String(code)})` : ""}`,
  );
}

export async function applyRetention(now: Date = new Date()): Promise<RetentionResult> {
  const result: RetentionResult = {
    trashAnonymized: 0,
    leftAnonymized: 0,
    auditDeleted: 0,
    documentsPurged: 0,
    ticketsPurged: 0,
    applicationsPurged: 0,
    attendancePurged: 0,
    failed: 0,
  };
  const clubs = await prisma.club.findMany({ select: { id: true, settings: true } });

  // Ein Fehler in einem Verein hält weder die übrigen Vereine noch die festen Fristen danach auf.
  for (const club of clubs) {
    try {
      await applyClubRetention(club, now, result);
    } catch (error) {
      result.failed += 1;
      logRetentionError(`Aufbewahrung fehlgeschlagen (Verein ${club.id})`, error);
    }
  }
  result.documentsPurged = await purgeDeletedDocuments(now);
  result.ticketsPurged = await purgeOldTickets(now);
  result.applicationsPurged = await purgeOldApplications(now);
  result.attendancePurged = await purgeOldAttendance(now);
  return result;
}

/** Die Fristen EINES Vereins: Papierkorb, ausgetretene Mitglieder, Änderungsprotokoll. */
async function applyClubRetention(
  club: { id: string; settings: Prisma.JsonValue },
  now: Date,
  result: RetentionResult,
): Promise<void> {
  const retention = readRetention(club.settings);
  // Ein fehlerhafter Datensatz (z. B. eine verletzte Prüfregel) darf die übrigen nicht aufhalten.
  const anonymize = async (memberId: string, reason: string) => {
    try {
      return await anonymizeOne(club.id, memberId, reason, now);
    } catch (error) {
      result.failed += 1;
      logRetentionError(`Anonymisierung fehlgeschlagen (Verein ${club.id})`, error);
      return false;
    }
  };

  const trashed = await prisma.member.findMany({
    where: {
      clubId: club.id,
      anonymizedAt: null,
      deletedAt: { lt: new Date(now.getTime() - retention.trashDays * DAY) },
    },
    select: { id: true },
    take: BATCH,
  });
  for (const { id } of trashed)
    if (await anonymize(id, "Papierkorb-Frist abgelaufen")) result.trashAnonymized += 1;

  if (retention.leftMembersMonths > 0) {
    const cutoff = subtractMonths(now, retention.leftMembersMonths);
    const left = await prisma.member.findMany({
      where: {
        clubId: club.id,
        status: "LEFT",
        anonymizedAt: null,
        // Austrittsdatum, ersatzweise die letzte Änderung des Datensatzes.
        OR: [{ leftAt: { lt: cutoff } }, { leftAt: null, updatedAt: { lt: cutoff } }],
      },
      select: { id: true },
      take: BATCH,
    });
    for (const { id } of left)
      if (await anonymize(id, "Aufbewahrungsfrist für ausgetretene Mitglieder abgelaufen"))
        result.leftAnonymized += 1;
  }

  const auditCutoff = subtractMonths(now, retention.auditMonths);
  // Einträge der Finanzen gehören zu den Büchern (§ 147 AO: 10 Jahre ab Ende des Kalenderjahres) – sie bleiben so lange.
  const financeCutoff = startOfBerlinDate(berlinParts(now).year - 10, 1, 1);
  result.auditDeleted += await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('vereinsflow.audit_purge', 'on', true)`;
    return (
      await tx.auditLog.deleteMany({
        where: {
          clubId: club.id,
          createdAt: { lt: auditCutoff },
          OR: [
            { action: { not: { startsWith: "finance." } } },
            { createdAt: { lt: financeCutoff } },
          ],
        },
      })
    ).count;
  });
}
