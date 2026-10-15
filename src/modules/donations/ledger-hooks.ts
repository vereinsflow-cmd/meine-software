import { formatEuroFromCents } from "@/lib/dates";
import { recordAudit } from "@/server/audit/audit";
import type { TenantTx } from "@/server/db/tenant";
import { auditActor, type TenantContext } from "@/server/tenancy/context-core";

/**
 * Verbindung von Kassenbuch und Spenden (ohne das Kassenbuch selbst zu importieren – `ledger.ts` ruft hierher).
 */

/**
 * „Korrigieren“ (Storno + neue Buchung): Hatte die alte Buchung genau eine Spende und hat die neue genau eine Spenden-Zeile
 * (Einnahme), gehört die Spende zur neuen Zeile – mit Spender, Text-Zweck, Zahlart, Wunsch und Notiz. Betrag, Tag,
 * Abteilung und Veranstaltung setzt die Datenbank aus der neuen Zeile. Sonst bleibt die neue Zeile „Spender fehlt“ (auch bei
 * einem gesperrten Spender – für ihn entstehen keine neuen Spenden).
 *
 * Läuft nach beiden Buchungen und ohne die Sperre `finance:donations`: Wer erst diese Sperre und danach den Nummernkreis
 * nimmt, kann sich mit einem gleichzeitigen Storno verklemmen (das nimmt die Sperren in umgekehrter Reihenfolge, K2). Die
 * neue Zeile kennt außer dieser Transaktion noch niemand.
 */
export async function carryOverDonation(
  tx: TenantTx,
  ctx: TenantContext,
  entries: { originalEntryId: string; originalLabel: string; newEntryId: string; newLabel: string },
): Promise<void> {
  const donations = await tx.donation.findMany({
    where: { line: { is: { entryId: entries.originalEntryId } } },
    select: {
      donorId: true,
      anonymousLabel: true,
      paymentMethod: true,
      purposeText: true,
      receiptWish: true,
      note: true,
      donor: { select: { restrictedAt: true } },
    },
  });
  if (donations.length !== 1) return;
  const original = donations[0]!;
  if (original.donor?.restrictedAt) return;
  const lines = await tx.ledgerLine.findMany({
    where: {
      entryId: entries.newEntryId,
      amountCents: { gt: 0 },
      category: { is: { systemKey: "DONATIONS" } },
    },
    select: { id: true, amountCents: true, bookingDate: true },
  });
  if (lines.length !== 1) return;
  const line = lines[0]!;
  const created = await tx.donation.create({
    data: {
      clubId: ctx.clubId,
      kind: "MONEY",
      donorId: original.donorId,
      anonymousLabel: original.anonymousLabel,
      ledgerLineId: line.id,
      receivedOn: line.bookingDate,
      amountCents: line.amountCents,
      paymentMethod: original.paymentMethod ?? "TRANSFER",
      purposeText: original.purposeText,
      receiptWish: original.receiptWish,
      note: original.note,
      createdById: ctx.userId,
    },
    select: { id: true },
  });
  await recordAudit(tx, auditActor(ctx), {
    action: "finance.donation_recorded",
    entityType: "Donation",
    entityId: created.id,
    summary: `Spende übernommen aus Buchung ${entries.originalLabel}: ${formatEuroFromCents(line.amountCents)} (Buchung ${entries.newLabel})`,
  });
}
