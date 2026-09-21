import "server-only";
import { readRetention } from "@/lib/club-settings";
import { SUPPORT_RETENTION_MONTHS } from "@/lib/support";
import { DOCUMENT_TRASH_DAYS } from "@/lib/uploads";
import { prisma } from "@/server/db/client";
import { anonymizeMemberData } from "@/server/privacy/anonymize";
import { deleteFile } from "@/server/storage/files";

/**
 * Aufbewahrungsfristen (DSGVO: Speicherbegrenzung). Die Fristen legt jeder Verein in den Einstellungen fest
 * (`readRetention`, mit Standardwerten):
 *  - Papierkorb: Mitglieder, die länger als `trashDays` im Papierkorb liegen, werden anonymisiert.
 *  - Ausgetretene Mitglieder: nach `leftMembersMonths` (0 = nie automatisch) anonymisiert.
 *  - Änderungsprotokoll: Einträge älter als `auditMonths` werden gelöscht (nur die Aufbewahrungsroutine darf das).
 *
 * Jede Anonymisierung läuft in einer eigenen Transaktion und hinterlässt einen Protokolleintrag (ohne Namen).
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
    where: { deletedAt: { lt: new Date(now.getTime() - DOCUMENT_TRASH_DAYS * DAY) } },
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

export async function applyRetention(now: Date = new Date()): Promise<RetentionResult> {
  const result: RetentionResult = {
    trashAnonymized: 0,
    leftAnonymized: 0,
    auditDeleted: 0,
    documentsPurged: 0,
    ticketsPurged: 0,
  };
  const clubs = await prisma.club.findMany({ select: { id: true, settings: true } });

  for (const club of clubs) {
    const retention = readRetention(club.settings);

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
      if (await anonymizeOne(club.id, id, "Papierkorb-Frist abgelaufen", now))
        result.trashAnonymized += 1;

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
        if (
          await anonymizeOne(
            club.id,
            id,
            "Aufbewahrungsfrist für ausgetretene Mitglieder abgelaufen",
            now,
          )
        )
          result.leftAnonymized += 1;
    }

    const auditCutoff = subtractMonths(now, retention.auditMonths);
    result.auditDeleted += await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('vereinsflow.audit_purge', 'on', true)`;
      return (
        await tx.auditLog.deleteMany({ where: { clubId: club.id, createdAt: { lt: auditCutoff } } })
      ).count;
    });
  }
  result.documentsPurged = await purgeDeletedDocuments(now);
  result.ticketsPurged = await purgeOldTickets(now);
  return result;
}
