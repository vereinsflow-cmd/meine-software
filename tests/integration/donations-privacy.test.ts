import { describe, expect, it } from "vitest";
import { addBerlinDays, toDateInputValue, todayCalendarDate } from "@/lib/dates";
import { prisma } from "@/server/db/client";
import { toActionError } from "@/server/action";
import { anonymizeMemberData } from "@/server/privacy/anonymize";
import { buildUserDataExport } from "@/server/privacy/export";
import {
  attachDonationFile,
  attachDonationNote,
  listDonationEvidence,
  removeDonationAttachment,
} from "@/modules/donations/evidence";
import {
  getDonationsPage,
  listDonations,
  missingReceiptsForMember,
  recordDonation,
  unassignDonation,
} from "@/modules/donations/service";
import { attachReceiptFile } from "@/modules/finance/receipts";
import { listAccounts, setupLedger } from "@/modules/finance/ledger";
import { addUserToClub, contextFor, createClub, createMember } from "../helpers/factories";

const day = (offset = 0) => toDateInputValue(addBerlinDays(new Date(), offset));
const thisYear = () => todayCalendarDate().getUTCFullYear();
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const mapped = toActionError(error);
    return `${mapped.message} ${JSON.stringify(mapped.fieldErrors ?? {})}`;
  }
  throw new Error("Es wurde ein Fehler erwartet.");
}

async function setup() {
  const club = await createClub("Nachweisverein");
  const board = await addUserToClub(club, "BOARD");
  const ctx = await contextFor(board.user.id, club.id);
  await setupLedger(ctx, {
    ledgerStartDate: `${thisYear()}-01-01`,
    bankName: "Girokonto",
    bankOpening: "1.000,00",
    withCash: false,
  });
  const [bank] = await listAccounts(ctx);
  const marta = await createMember(club.id, { firstName: "Marta", lastName: "Wolff" });
  await prisma.member.update({
    where: { id: marta.id },
    data: { street: "Lindenweg 7", postalCode: "12345", city: "Musterstadt", country: "AT" },
  });
  const inKind = (memberId = marta.id) =>
    recordDonation(ctx, {
      kind: "IN_KIND",
      donorMode: "MEMBER",
      memberId,
      amount: "180,00",
      receivedOn: day(),
      target: "frei",
      itemDescription: "12 Kisten Mineralwasser und Apfelschorle, neu",
      inKindOrigin: "PRIVATE",
      valuationDocs: true,
    });
  return { club, ctx, board, bank: bank!, marta, inKind };
}

describe("Nachweise und ihre Aufbewahrung", () => {
  it("Datei an einer Sachspende: „Nur Finanzen“, aufbewahrt bis 31.12.(Jahr + 10), Papierkorb verweigert", async () => {
    const { club, ctx, inKind } = await setup();
    const { donationId } = await inKind();
    const { id: documentId } = await attachDonationFile(ctx, {
      donationId,
      fileName: "rechnung-wasser.pdf",
      bytes: PDF,
    });
    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document).toMatchObject({ access: "FINANCE", category: "Spendennachweise" });
    expect(toDateInputValue(document.retainUntil!)).toBe(`${thisYear() + 10}-12-31`);
    await expect(
      prisma.document.update({ where: { id: documentId }, data: { deletedAt: new Date() } }),
    ).rejects.toThrow(/DOCUMENT_RETAINED/);

    await attachDonationNote(ctx, { donationId, note: "Lieferschein liegt beim Kassenwart" });
    const evidence = await listDonationEvidence(ctx, donationId);
    expect(evidence.map((e) => e.name ?? e.note)).toEqual([
      "rechnung-wasser.pdf",
      "Lieferschein liegt beim Kassenwart",
    ]);
    // Nachweise ändert man nicht – nur entfernen und neu anhängen.
    await expect(
      prisma.donationAttachment.update({
        where: { id: evidence[1]!.id },
        data: { note: "anders" },
      }),
    ).rejects.toThrow(/FINANCE_IMMUTABLE/);

    // Entfernen: die eigens hochgeladene Datei wandert in den Papierkorb (Frist entfällt).
    await removeDonationAttachment(ctx, { id: evidence[0]!.id });
    const removed = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(removed.retainUntil).toBeNull();
    expect(removed.deletedAt).not.toBeNull();
    const actions = (await prisma.auditLog.findMany({ where: { clubId: club.id } })).map(
      (a) => a.action,
    );
    expect(actions).toContain("finance.donation_evidence_attached");
    expect(actions).toContain("finance.donation_evidence_removed");
  });

  it("dasselbe Dokument an Buchung UND Spende behält die längere Frist (10 statt 8 Jahre)", async () => {
    const { club, ctx, bank, inKind } = await setup();
    const { donationId } = await inKind();
    const money = await recordDonation(ctx, {
      kind: "MONEY",
      donorMode: "ANONYMOUS",
      anonymousLabel: "Spendendose Theke",
      amount: "20,00",
      receivedOn: day(),
      accountId: bank.id,
      target: "frei",
    });
    const { id: documentId } = await attachReceiptFile(ctx, {
      entryId: money.entryId!,
      fileName: "quittung.pdf",
      bytes: PDF,
    });
    const retain = async () =>
      toDateInputValue(
        (await prisma.document.findUniqueOrThrow({ where: { id: documentId } })).retainUntil!,
      );
    expect(await retain()).toBe(`${thisYear() + 8}-12-31`);
    await prisma.donationAttachment.create({
      data: { clubId: club.id, donationId, documentId, attachedById: ctx.userId },
    });
    expect(await retain()).toBe(`${thisYear() + 10}-12-31`);
    // Ein weiterer Anhang an einer Buchung senkt die Frist nicht.
    const second = await recordDonation(ctx, {
      kind: "MONEY",
      donorMode: "ANONYMOUS",
      anonymousLabel: "Spendendose Vereinsheim",
      amount: "15,00",
      receivedOn: day(),
      accountId: bank.id,
      target: "frei",
    });
    await prisma.ledgerAttachment.create({
      data: { clubId: club.id, entryId: second.entryId!, documentId, attachedById: ctx.userId },
    });
    expect(await retain()).toBe(`${thisYear() + 10}-12-31`);
    // Ohne den Anhang an der Spende gilt wieder die Frist der Buchungen; die Datei bleibt (hängt noch an Buchungen).
    const attachment = await prisma.donationAttachment.findFirstOrThrow({ where: { documentId } });
    await removeDonationAttachment(ctx, { id: attachment.id });
    expect(await retain()).toBe(`${thisYear() + 8}-12-31`);
    expect(
      (await prisma.document.findUniqueOrThrow({ where: { id: documentId } })).deletedAt,
    ).toBeNull();
  });

  it("„Kennzeichnung zurücknehmen“ nimmt die Nachweise der Geldspende mit", async () => {
    const { ctx, bank, marta } = await setup();
    const money = await recordDonation(ctx, {
      kind: "MONEY",
      donorMode: "MEMBER",
      memberId: marta.id,
      amount: "60,00",
      receivedOn: day(),
      accountId: bank.id,
      target: "frei",
    });
    const { id: documentId } = await attachDonationFile(ctx, {
      donationId: money.donationId,
      fileName: "spendenzusage.pdf",
      bytes: PDF,
    });
    await unassignDonation(ctx, { id: money.donationId });
    expect(await prisma.donationAttachment.count({ where: { documentId } })).toBe(0);
    expect(
      (await prisma.document.findUniqueOrThrow({ where: { id: documentId } })).deletedAt,
    ).not.toBeNull();
  });
});

describe("Datenschutz", () => {
  it("Anonymisieren: Name und Anschrift als Momentaufnahme im gesperrten Spender, Mitglied leer, Spende unverändert (K4)", async () => {
    const { club, ctx, marta, inKind } = await setup();
    const { donationId } = await inKind();
    expect(await missingReceiptsForMember(ctx, marta.id)).toBe(1);
    const before = await prisma.donation.findUniqueOrThrow({ where: { id: donationId } });

    expect(await prisma.$transaction((tx) => anonymizeMemberData(tx, club.id, marta.id))).toBe(
      true,
    );

    const member = await prisma.member.findUniqueOrThrow({ where: { id: marta.id } });
    expect(member).toMatchObject({ firstName: "Gelöschtes", street: null, city: null });
    const donor = await prisma.donor.findFirstOrThrow({ where: { memberId: marta.id } });
    expect(donor).toMatchObject({
      name: "Marta Wolff",
      street: "Lindenweg 7",
      postalCode: "12345",
      city: "Musterstadt",
      country: "AT",
      restrictedReason: "Mitglied anonymisiert",
    });
    expect(donor.restrictedAt).not.toBeNull();
    const after = await prisma.donation.findUniqueOrThrow({ where: { id: donationId } });
    expect(after).toEqual(before);

    const row = (await listDonations(ctx, { year: thisYear() })).rows[0]!;
    expect(row).toMatchObject({
      name: "Marta Wolff",
      typeLabel: "Früheres Mitglied (gesperrt)",
      state: "RESTRICTED",
      actions: { edit: false },
    });
    expect((await getDonationsPage(ctx, thisYear())).kpi.donorCount).toBe(1);
    // Keine neuen Spenden für das anonymisierte Mitglied.
    expect(await failure(inKind())).toMatch(/Mitglied/);
  });

  it("Datenexport enthält die Spenden des Mitglieds", async () => {
    const { club, ctx, bank } = await setup();
    const person = await addUserToClub(club, "MEMBER", { firstName: "Sophie", lastName: "Krüger" });
    await prisma.member.update({
      where: { id: person.member.id },
      data: { street: "Am Markt 2", postalCode: "12345", city: "Musterstadt" },
    });
    await recordDonation(ctx, {
      kind: "MONEY",
      donorMode: "MEMBER",
      memberId: person.member.id,
      amount: "120,00",
      receivedOn: day(),
      accountId: bank.id,
      target: "andere",
      purposeText: "Vereinsheim",
    });
    const data = (await buildUserDataExport(person.user.id))!;
    const verein = data.vereine[0] as { mitglied: { spenden: unknown[] } };
    expect(verein.mitglied.spenden).toEqual([
      {
        datum: day(),
        betragCent: 12_000,
        art: "Geldspende",
        zweck: "Vereinsheim",
        zuwendungsbestaetigung: "nicht nötig",
        sachspende: null,
      },
    ]);
  });
});
