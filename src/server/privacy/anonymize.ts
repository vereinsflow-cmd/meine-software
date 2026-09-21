import "server-only";
import { Prisma } from "@/generated/prisma/client";

/**
 * Anonymisierung von Personendaten (Art. 17 DSGVO, Speicherbegrenzung).
 *
 * Wird von der Aufbewahrungsroutine (Papierkorb-Frist, ausgetretene Mitglieder) und von der Bearbeitung von
 * Löschanträgen verwendet. Der Datensatz bleibt als leere Hülle bestehen, damit Auswertungen (Helferstunden,
 * Teilnehmerzahlen vergangener Veranstaltungen) und Verweise heil bleiben – aber er lässt keinen Rückschluss auf die
 * Person mehr zu: keine Namen, Kontaktdaten, Geburtsdaten, Notizen, Einwilligungen, Gruppenzugehörigkeiten und keine
 * Klartext-Namen im Änderungsprotokoll.
 */
export const ANONYMOUS_FIRST_NAME = "Gelöschtes";
export const ANONYMOUS_LAST_NAME = "Mitglied";
export const ANONYMOUS_AUDIT_SUMMARY = "Mitglied (anonymisiert)";

export type Tx = Prisma.TransactionClient;

/**
 * Anonymisiert ein Mitglied INNERHALB der übergebenen Transaktion. Gibt `false` zurück, wenn es das Mitglied nicht
 * gibt (auch nicht in diesem Verein) oder es bereits anonymisiert ist – der Aufruf ist also wiederholbar.
 * `clubId` gehört zur Sicherheit immer dazu: Es wird nie ein Mitglied eines anderen Vereins verändert.
 */
export async function anonymizeMemberData(
  tx: Tx,
  clubId: string,
  memberId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const member = await tx.member.findFirst({
    where: { id: memberId, clubId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      anonymizedAt: true,
      archivedAt: true,
      deletedAt: true,
      leftAt: true,
    },
  });
  if (!member || member.anonymizedAt) return false;

  const fullName = `${member.firstName} ${member.lastName}`.trim();

  await tx.member.update({
    where: { id: member.id },
    data: {
      firstName: ANONYMOUS_FIRST_NAME,
      lastName: ANONYMOUS_LAST_NAME,
      memberNumber: null,
      email: null,
      phone: null,
      street: null,
      postalCode: null,
      city: null,
      country: null,
      birthDate: null,
      clubFunction: null,
      internalNotes: null,
      photoDocumentId: null,
      // Verknüpfung zum Benutzerkonto lösen; das Konto selbst wird getrennt behandelt (Konto-Löschung).
      userId: null,
      status: "LEFT",
      leftAt:
        member.leftAt ??
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())),
      archivedAt: member.archivedAt ?? now,
      deletedAt: member.deletedAt ?? now,
      anonymizedAt: now,
    },
  });

  await tx.memberDepartment.deleteMany({ where: { clubId, memberId } });
  await tx.groupMember.deleteMany({ where: { clubId, memberId } });
  await tx.consent.deleteMany({ where: { clubId, memberId } });
  await tx.invitation.deleteMany({ where: { clubId, memberId } }); // enthalten die E-Mail-Adresse
  await tx.eventParticipant.updateMany({ where: { clubId, memberId }, data: { note: null } });
  await tx.shiftAssignment.updateMany({ where: { clubId, memberId }, data: { note: null } });
  await tx.messageRecipient.updateMany({ where: { clubId, memberId }, data: { userId: null } });
  // Dokumente, die zu dieser Person gehören (z. B. Aufnahmeantrag): in den Papierkorb; der Aufbewahrungsjob entfernt die Dateien.
  await tx.document.updateMany({
    where: { clubId, memberId, deletedAt: null },
    data: { deletedAt: now },
  });

  // Einträge zu diesem Mitglied selbst: Text und Änderungsdetails leeren.
  await enablePurgeMode(tx);
  await tx.auditLog.updateMany({
    where: { clubId, entityType: "Member", entityId: memberId },
    data: { summary: ANONYMOUS_AUDIT_SUMMARY, changes: Prisma.JsonNull },
  });
  await scrubNamesInAudit(tx, [clubId], [fullName]);
  return true;
}

/** Schaltet die Datenschutzroutine der Datenbank für DIESE Transaktion frei (Trigger "audit_log_guard"). */
export async function enablePurgeMode(tx: Tx): Promise<void> {
  await tx.$executeRaw`SELECT set_config('vereinsflow.audit_purge', 'on', true)`;
}

/**
 * Ersetzt Klarnamen in den Textfeldern des Änderungsprotokolls (z. B. "Hans Helfer wurde für Aufbau eingeteilt"). Aktion,
 * Objekt, Akteur, Zeitpunkt und IP bleiben unverändert – der Datenbank-Trigger erlaubt in dieser Routine ausschließlich
 * Änderungen an `summary` und `changes`. Zu kurze Namen werden ignoriert (Gefahr, unbeteiligte Textstellen zu treffen).
 */
export async function scrubNamesInAudit(
  tx: Tx,
  clubIds: readonly string[],
  names: readonly string[],
): Promise<void> {
  if (clubIds.length === 0) return;
  await enablePurgeMode(tx);
  for (const name of new Set(
    names.map((value) => value.trim()).filter((value) => value.length >= 3),
  )) {
    await tx.$executeRaw`
      UPDATE "AuditLog"
         SET "summary" = replace("summary", ${name}, 'Gelöschtes Mitglied')
       WHERE "clubId" IN (${Prisma.join(clubIds)})
         AND "summary" IS NOT NULL
         AND position(${name} in "summary") > 0`;
  }
}
