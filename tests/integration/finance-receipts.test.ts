import { describe, expect, it } from "vitest";
import { addBerlinDays, toDateInputValue, todayCalendarDate } from "@/lib/dates";
import { prisma } from "@/server/db/client";
import { toActionError } from "@/server/action";
import {
  allowedAccessLevels,
  deleteDocument,
  listDocuments,
  uploadDocument,
} from "@/modules/documents/service";
import {
  listInvoices,
  setInvoiceStatus,
  unbookedPaidInvoiceCount,
} from "@/modules/finance/service";
import {
  correctEntry,
  createEntry,
  listAccounts,
  listCategories,
  listEntries,
  reverseEntry,
  setupLedger,
} from "@/modules/finance/ledger";
import { attachReceiptFile, attachReceiptNote, removeAttachment } from "@/modules/finance/receipts";
import { purgeDeletedDocuments } from "@/server/jobs/retention";
import { addUserToClub, contextFor, createClub } from "../helpers/factories";

const day = (offset = 0) => toDateInputValue(addBerlinDays(new Date(), offset));
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

async function setup() {
  const club = await createClub("Belegverein");
  const board = await addUserToClub(club, "BOARD");
  const member = await addUserToClub(club, "MEMBER");
  const ctx = {
    board: await contextFor(board.user.id, club.id),
    member: await contextFor(member.user.id, club.id),
  };
  await setupLedger(ctx.board, {
    ledgerStartDate: `${todayCalendarDate().getUTCFullYear()}-01-01`,
    bankName: "Girokonto",
    bankOpening: "1.000,00",
    withCash: false,
  });
  const [bank] = await listAccounts(ctx.board);
  const categories = await listCategories(ctx.board);
  const cat = (name: string) => categories.find((c) => c.name === name)!.id;
  const expense = (description: string, amount = "50,00", extra: Record<string, unknown> = {}) =>
    createEntry(ctx.board, {
      kind: "EXPENSE",
      accountId: bank!.id,
      bookingDate: day(),
      description,
      lines: [{ categoryId: cat("Sportmaterial"), amount }],
      ...extra,
    });
  return { club, ctx, bank: bank!, cat, expense };
}

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return toActionError(error).message;
  }
  throw new Error("Es wurde ein Fehler erwartet.");
}

describe("Belege", () => {
  it("Datei anhängen: Dokument „Nur Finanzen“, 8 Jahre aufbewahrt, nicht löschbar", async () => {
    const { ctx, expense } = await setup();
    const entry = await expense("Bälle");
    const { id: documentId } = await attachReceiptFile(ctx.board, {
      entryId: entry.id,
      fileName: "kassenbon.pdf",
      bytes: PDF,
    });
    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document).toMatchObject({ access: "FINANCE", category: "Belege" });
    const year = todayCalendarDate().getUTCFullYear();
    expect(toDateInputValue(document.retainUntil!)).toBe(`${year + 8}-12-31`);
    expect(allowedAccessLevels(ctx.member)).not.toContain("FINANCE");
    expect(
      (await listDocuments(ctx.member, { request: { page: 1, pageSize: 25, skip: 0 } })).items.map(
        (d) => d.id,
      ),
    ).not.toContain(documentId);

    expect(await failure(deleteDocument(ctx.board, documentId))).toMatch(/aufbewahrt/);
    await expect(
      prisma.document.update({ where: { id: documentId }, data: { deletedAt: new Date() } }),
    ).rejects.toThrow(/DOCUMENT_RETAINED/);
    await expect(prisma.document.delete({ where: { id: documentId } })).rejects.toThrow(
      /DOCUMENT_RETAINED/,
    );

    const listed = (await listEntries(ctx.board, { q: "Bälle" })).entries[0]!;
    expect(listed.attachments).toEqual([
      expect.objectContaining({ documentId, name: "kassenbon.pdf", note: null }),
    ]);
    expect(listed.needsReceipt).toBe(false);
  });

  it("Eigenbeleg; „Ohne Beleg“-Filter zählt nur geltende Einnahmen/Ausgaben", async () => {
    const { ctx, expense } = await setup();
    const a = await expense("Parkgebühr");
    const b = await expense("Trikots");
    await attachReceiptNote(ctx.board, {
      entryId: a.id,
      note: "Automat ohne Quittung, Turnier Kassel",
    });
    expect(
      await failure(attachReceiptNote(ctx.board, { entryId: a.id, note: "noch einer" })),
    ).toMatch(/schon einen Eigenbeleg/);
    const missing = await listEntries(ctx.board, { receipt: "missing" });
    expect(missing.entries.map((e) => e.id)).toEqual([b.id]);
    await reverseEntry(ctx.board, { id: b.id, reason: "falsch" });
    expect((await listEntries(ctx.board, { receipt: "missing" })).total).toBe(0);
  });

  it("Entfernen im offenen Zeitraum: Datei geht in den Papierkorb, die Frist entfällt", async () => {
    const { ctx, expense } = await setup();
    const entry = await expense("Hütchen");
    const { id: documentId } = await attachReceiptFile(ctx.board, {
      entryId: entry.id,
      fileName: "falsch.pdf",
      bytes: PDF,
    });
    const [attachment] = (await listEntries(ctx.board, { q: "Hütchen" })).entries[0]!.attachments;
    await removeAttachment(ctx.board, { id: attachment!.id });
    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.retainUntil).toBeNull();
    expect(document.deletedAt).not.toBeNull();
  });

  it("Anhänge lassen sich nicht ändern; ohne Finanzrecht kein Anhängen", async () => {
    const { ctx, expense } = await setup();
    const entry = await expense("Netz");
    await attachReceiptNote(ctx.board, { entryId: entry.id, note: "Quittung verloren" });
    const row = await prisma.ledgerAttachment.findFirstOrThrow({ where: { entryId: entry.id } });
    await expect(
      prisma.ledgerAttachment.update({ where: { id: row.id }, data: { note: "anders" } }),
    ).rejects.toThrow(/FINANCE_IMMUTABLE/);
    expect(
      await failure(attachReceiptNote(ctx.member, { entryId: entry.id, note: "von mir" })),
    ).toMatch(/Berechtigung/);
  });

  it("Aufbewahrungsjob räumt den Papierkorb; ein Dokument im Papierkorb lässt sich nicht anhängen", async () => {
    const { club, ctx, expense } = await setup();
    const entry = await expense("Ball");
    const trashed = await uploadDocument(ctx.board, {
      fileName: "alt.pdf",
      bytes: PDF,
      access: "ALL_MEMBERS",
    });
    const { id: receipt } = await attachReceiptFile(ctx.board, {
      entryId: entry.id,
      fileName: "beleg.pdf",
      bytes: PDF,
    });
    await prisma.document.update({
      where: { id: trashed.id },
      data: { deletedAt: new Date(Date.now() - 40 * 86_400_000) },
    });
    await expect(
      prisma.ledgerAttachment.create({
        data: { clubId: club.id, entryId: entry.id, documentId: trashed.id },
      }),
    ).rejects.toThrow(/Papierkorb/);
    expect(await purgeDeletedDocuments()).toBeGreaterThanOrEqual(1);
    expect(await prisma.document.count({ where: { id: trashed.id } })).toBe(0);
    expect(await prisma.document.count({ where: { id: receipt } })).toBe(1);
  });

  it("Korrigieren nimmt hochgeladene Belege und den Eigenbeleg mit", async () => {
    const { ctx, expense, bank, cat } = await setup();
    const entry = await expense("Schiedsrichter");
    const { id: documentId } = await attachReceiptFile(ctx.board, {
      entryId: entry.id,
      fileName: "quittung.pdf",
      bytes: PDF,
    });
    await attachReceiptNote(ctx.board, { entryId: entry.id, note: "Zweite Quittung verloren" });
    const before = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    const corrected = await correctEntry(ctx.board, {
      id: entry.id,
      reason: "Betrag falsch",
      entry: {
        kind: "EXPENSE",
        accountId: bank.id,
        bookingDate: day(),
        description: "Schiedsrichter",
        lines: [{ categoryId: cat("Sportmaterial"), amount: "55,00" }],
      },
    });
    const listed = (await listEntries(ctx.board, { q: "Schiedsrichter" })).entries.find(
      (e) => e.id === corrected.id,
    )!;
    expect(listed.attachments.map((a) => a.documentId ?? a.note)).toEqual([
      documentId,
      "Zweite Quittung verloren",
    ]);
    const after = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(after.retainUntil!.getTime()).toBeGreaterThanOrEqual(before.retainUntil!.getTime());
  });

  it("Hochladen nur mit Finanzrecht und nur zu Buchungen des eigenen Vereins", async () => {
    const { club, ctx, expense } = await setup();
    const other = await setup();
    const entry = await expense("Pfeife");
    const documents = () => prisma.document.count({ where: { clubId: club.id } });
    const count = await documents();
    expect(
      await failure(
        attachReceiptFile(ctx.member, { entryId: entry.id, fileName: "x.pdf", bytes: PDF }),
      ),
    ).toMatch(/Berechtigung/);
    expect(
      await failure(
        attachReceiptFile(other.ctx.board, { entryId: entry.id, fileName: "x.pdf", bytes: PDF }),
      ),
    ).toMatch(/nicht gefunden/);
    expect(await documents()).toBe(count);
  });
});

describe("Rechnungen im Kassenbuch", () => {
  async function invoice(ctx: Awaited<ReturnType<typeof setup>>["ctx"], amount: number) {
    return uploadDocument(ctx.board, {
      fileName: "rechnung.pdf",
      bytes: PDF,
      access: "BOARD",
      invoice: { status: "OPEN", amountCents: amount },
    });
  }

  it("Buchen setzt bezahlt, verknüpft die Zeile und hängt die Rechnung als Beleg an", async () => {
    const { ctx, expense } = await setup();
    const { id: documentId } = await invoice(ctx, 24_990);
    const inv = await prisma.invoice.findFirstOrThrow({ where: { documentId } });
    const entry = await expense("Hallenmiete", "249,90", { invoiceId: inv.id });
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).toMatchObject({
      status: "PAID",
    });
    const lines = await prisma.ledgerLine.findMany({ where: { entryId: entry.id } });
    expect(lines.every((l) => l.invoiceId === inv.id)).toBe(true);
    const listed = (await listEntries(ctx.board, { q: "Hallenmiete" })).entries[0]!;
    expect(listed.attachments.map((a) => a.documentId)).toEqual([documentId]);
    const invoices = await listInvoices(ctx.board, { stand: "bezahlt" });
    expect(invoices.items[0]).toMatchObject({ booking: { label: entry.label } });

    // Zweimal buchen geht nicht; zurück auf „offen“ erst nach dem Storno.
    expect(await failure(expense("noch mal", "249,90", { invoiceId: inv.id }))).toMatch(
      /schon im Kassenbuch/,
    );
    expect(await failure(setInvoiceStatus(ctx.board, inv.id, "OPEN"))).toMatch(/storniere zuerst/);
    // Die bezahlende Rechnung bleibt angehängt – im Dienst und in der Datenbank.
    const invoiceAttachment = listed.attachments[0]!;
    expect(invoiceAttachment.locked).toBe(true);
    expect(await failure(removeAttachment(ctx.board, { id: invoiceAttachment.id }))).toMatch(
      /bleibt angehängt/,
    );
    await expect(
      prisma.ledgerAttachment.delete({ where: { id: invoiceAttachment.id } }),
    ).rejects.toThrow(/bleibt angehängt/);
    await reverseEntry(ctx.board, { id: entry.id, reason: "falsch gebucht" });
    await setInvoiceStatus(ctx.board, inv.id, "OPEN");
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("OPEN");
  });

  it("Korrigieren übernimmt Rechnung und Belege in die neue Buchung", async () => {
    const { ctx, expense, bank, cat } = await setup();
    const { id: documentId } = await invoice(ctx, 10_000);
    const inv = await prisma.invoice.findFirstOrThrow({ where: { documentId } });
    const entry = await expense("Getränke", "100,00", { invoiceId: inv.id });
    const corrected = await correctEntry(ctx.board, {
      id: entry.id,
      reason: "Kategorie falsch",
      entry: {
        kind: "EXPENSE",
        accountId: bank.id,
        bookingDate: day(),
        description: "Getränke",
        invoiceId: inv.id,
        lines: [{ categoryId: cat("Einkauf für Feste"), amount: "100,00" }],
      },
    });
    const listed = (await listEntries(ctx.board, { q: "Getränke" })).entries.find(
      (e) => e.id === corrected.id,
    )!;
    expect(listed.attachments.map((a) => a.documentId)).toEqual([documentId]);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe("PAID");
  });

  it("Rechnung „schon bezahlt“ ohne Betrag: zählt als offen fürs Kassenbuch, Buchen trägt den Betrag ein", async () => {
    const { ctx, expense } = await setup();
    const { id: documentId } = await uploadDocument(ctx.board, {
      fileName: "rechnung.pdf",
      bytes: PDF,
      access: "BOARD",
      invoice: { status: "PAID", amountCents: null },
    });
    const inv = await prisma.invoice.findFirstOrThrow({ where: { documentId } });
    const since = todayCalendarDate();
    expect(await unbookedPaidInvoiceCount(ctx.board, since)).toBe(1);
    await expense("Trikotwäsche", "64,20", { invoiceId: inv.id });
    expect(await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).toMatchObject({
      status: "PAID",
      amountCents: 6_420,
    });
    expect(await unbookedPaidInvoiceCount(ctx.board, since)).toBe(0);
  });
});
