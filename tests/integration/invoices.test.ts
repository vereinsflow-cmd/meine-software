import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { addBerlinDays, formatDate, toDateInputValue } from "@/lib/dates";
import { getDashboard } from "@/modules/dashboard/service";
import { documentFormSchema } from "@/modules/documents/schemas";
import {
  deleteDocument,
  listDocuments,
  updateDocument,
  uploadDocument,
  type UploadInput,
} from "@/modules/documents/service";
import { getOpenPayments, setInvoiceStatus } from "@/modules/finance/service";
import { prisma } from "@/server/db/client";
import { storageRoot } from "@/server/storage/files";
import { addUserToClub, contextFor, createClub } from "../helpers/factories";

/** Rechnungen und offene Zahlungen: Benennung, Rechte, Summen, „bezahlt“, Mandantentrennung und Prüfregeln. */
const first = { page: 1, pageSize: 50, skip: 0 };
const PDF = (content = "Rechnung") => new TextEncoder().encode(`%PDF-1.7\n${content}\n%%EOF`);
const dayIn = (days: number) => toDateInputValue(addBerlinDays(new Date(), days));
const todayName = `Rechnung vom ${formatDate(new Date())}`;

async function setup() {
  const club = await createClub("Kassenverein");
  const admin = await addUserToClub(club, "CLUB_ADMIN", { firstName: "Anna", lastName: "Admin" });
  const board = await addUserToClub(club, "BOARD", { firstName: "Karl", lastName: "Kasse" });
  const lead = await addUserToClub(club, "DEPARTMENT_LEAD", { firstName: "Lea", lastName: "L" });
  const member = await addUserToClub(club, "MEMBER", { firstName: "Max", lastName: "M" });
  return {
    club,
    ctx: {
      admin: await contextFor(admin.user.id, club.id),
      board: await contextFor(board.user.id, club.id),
      lead: await contextFor(lead.user.id, club.id),
      member: await contextFor(member.user.id, club.id),
    },
  };
}
type Ctx = Awaited<ReturnType<typeof setup>>["ctx"]["admin"];

const uploadInvoice = (
  ctx: Ctx,
  fileName: string,
  invoice: NonNullable<UploadInput["invoice"]>,
  access: UploadInput["access"] = "BOARD",
) => uploadDocument(ctx, { fileName, bytes: PDF(fileName), access, invoice });
const open = (amountCents: number, dueDate?: string) => ({
  status: "OPEN" as const,
  amountCents,
  dueDate,
});
const filesOf = (clubId: string) =>
  existsSync(path.join(storageRoot(), clubId)) ? readdirSync(path.join(storageRoot(), clubId)) : [];

describe("Rechnung hochladen", () => {
  it("heißt nach dem heutigen Tag (Berlin), behält die echte Endung und zählt am selben Tag weiter", async () => {
    const { ctx } = await setup();
    const first_ = await uploadInvoice(ctx.board, "scan_0042.PDF", open(14_990, dayIn(14)));
    const second = await uploadInvoice(ctx.board, "Getränke.pdf", open(5_000));
    const docs = await prisma.document.findMany({
      where: { id: { in: [first_.id, second.id] } },
      include: { invoice: true },
      orderBy: { createdAt: "asc" },
    });
    expect(docs.map((doc) => doc.name)).toEqual([`${todayName}.pdf`, `${todayName} (2).pdf`]);
    expect(docs[0]!.invoice).toMatchObject({
      status: "OPEN",
      amountCents: 14_990,
      paidAt: null,
      createdById: ctx.board.userId,
    });
    expect(toDateInputValue(docs[0]!.invoice!.dueDate!)).toBe(dayIn(14));
    expect(docs[0]!.invoice!.invoiceDate.toISOString().slice(0, 10)).toBe(dayIn(0));

    const audit = await prisma.auditLog.findFirst({
      where: { action: "finance.invoice_created", entityId: docs[0]!.invoice!.id },
    });
    expect(audit?.summary).toMatch(/offen: 149,90\s€/);
  });

  it("gewöhnliche Dokumente behalten ihren Namen; schon bezahlte Rechnungen brauchen keinen Betrag", async () => {
    const { ctx } = await setup();
    const normal = await uploadDocument(ctx.board, {
      fileName: "Protokoll.pdf",
      bytes: PDF(),
      access: "BOARD",
    });
    const paid = await uploadInvoice(ctx.board, "alt.pdf", {
      status: "PAID",
      amountCents: null,
    });
    expect((await prisma.document.findUnique({ where: { id: normal.id } }))?.name).toBe(
      "Protokoll.pdf",
    );
    expect(await prisma.invoice.findFirst({ where: { documentId: paid.id } })).toMatchObject({
      status: "PAID",
      amountCents: null,
      paidAt: null,
    });
    expect(await prisma.invoice.count({ where: { documentId: normal.id } })).toBe(0);
  });

  it("nur wer die Finanzen verwaltet – ohne das Recht wird nichts gespeichert, auch keine Datei", async () => {
    const { club, ctx } = await setup();
    const before = filesOf(club.id).length;
    await expect(uploadInvoice(ctx.lead, "x.pdf", open(100), "ALL_MEMBERS")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      uploadInvoice(ctx.member, "x.pdf", open(100), "ALL_MEMBERS"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(filesOf(club.id)).toHaveLength(before);
    expect(await prisma.invoice.count({ where: { clubId: club.id } })).toBe(0);
  });

  it("offen ohne Betrag wird abgelehnt", async () => {
    const { ctx } = await setup();
    await expect(
      uploadInvoice(ctx.board, "x.pdf", { status: "OPEN", amountCents: null }),
    ).rejects.toMatchObject({ code: "VALIDATION", fieldErrors: { amount: expect.any(Array) } });
  });
});

describe("Offene Zahlungen", () => {
  it("Summe, Anzahl und Überfälliges; Bezahltes, Gelöschtes und Archiviertes zählen nicht", async () => {
    const { ctx } = await setup();
    const soon = await uploadInvoice(ctx.board, "a.pdf", open(10_000, dayIn(5)));
    const overdue = await uploadInvoice(ctx.board, "b.pdf", open(2_550, dayIn(-2)));
    await uploadInvoice(ctx.board, "c.pdf", open(1_000)); // ohne Fälligkeit
    await uploadInvoice(ctx.board, "d.pdf", { status: "PAID", amountCents: null });
    const removed = await uploadInvoice(ctx.board, "e.pdf", open(99_999));
    const archived = await uploadInvoice(ctx.board, "f.pdf", open(77_777));
    await deleteDocument(ctx.board, removed.id);
    await prisma.document.update({ where: { id: archived.id }, data: { archivedAt: new Date() } });

    const payments = await getOpenPayments(ctx.board);
    expect(payments).toMatchObject({
      totalCents: 13_550,
      count: 3,
      overdueCount: 1,
      canManage: true,
    });
    // Reihenfolge: überfällig und bald fällig zuerst, ohne Fälligkeit zuletzt.
    expect(payments.items.map((item) => item.documentId)).toEqual([
      overdue.id,
      soon.id,
      expect.any(String),
    ]);
    expect(payments.items[0]).toMatchObject({ overdue: true, dueInDays: -2, canOpen: true });
    expect(payments.items[2]).toMatchObject({ dueDate: null, dueInDays: null, overdue: false });
  });

  it("zählt auch Belege, die man nicht öffnen darf – öffnen lässt sich nur, was man sehen darf", async () => {
    const { ctx } = await setup();
    await uploadInvoice(ctx.admin, "geheim.pdf", open(50_000), "ADMIN");
    const payments = await getOpenPayments(ctx.board);
    expect(payments.totalCents).toBe(50_000);
    expect(payments.items[0]?.canOpen).toBe(false); // „Nur Verwaltung“ – der Vorstand sieht nur Betrag und Namen
    expect((await getOpenPayments(ctx.admin)).items[0]?.canOpen).toBe(true);
  });

  it("als bezahlt markieren und wieder öffnen – mit Vermerk und Protokoll", async () => {
    const { ctx } = await setup();
    const { id } = await uploadInvoice(ctx.board, "a.pdf", open(12_345));
    const invoice = (await prisma.invoice.findFirst({ where: { documentId: id } }))!;

    await setInvoiceStatus(ctx.board, invoice.id, "PAID");
    expect(await prisma.invoice.findUnique({ where: { id: invoice.id } })).toMatchObject({
      status: "PAID",
      paidById: ctx.board.userId,
      paidAt: expect.any(Date),
    });
    expect((await getOpenPayments(ctx.board)).totalCents).toBe(0);
    await setInvoiceStatus(ctx.board, invoice.id, "PAID"); // doppelt geklickt: nichts passiert

    await setInvoiceStatus(ctx.board, invoice.id, "OPEN");
    expect(await prisma.invoice.findUnique({ where: { id: invoice.id } })).toMatchObject({
      status: "OPEN",
      paidAt: null,
      paidById: null,
    });
    expect((await getOpenPayments(ctx.board)).totalCents).toBe(12_345);
    const actions = (
      await prisma.auditLog.findMany({
        where: { entityId: invoice.id },
        orderBy: { createdAt: "asc" },
      })
    ).map((entry) => entry.action);
    expect(actions).toEqual([
      "finance.invoice_created",
      "finance.invoice_paid",
      "finance.invoice_reopened",
    ]);

    // Ohne Betrag lässt sich eine (schon bezahlt abgelegte) Rechnung nicht wieder öffnen.
    const { id: paidDoc } = await uploadInvoice(ctx.board, "b.pdf", {
      status: "PAID",
      amountCents: null,
    });
    const paid = (await prisma.invoice.findFirst({ where: { documentId: paidDoc } }))!;
    await expect(setInvoiceStatus(ctx.board, paid.id, "OPEN")).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("nur für Berechtigte: Dashboard, Liste und Markieren", async () => {
    const { ctx } = await setup();
    const { id } = await uploadInvoice(ctx.board, "offen.pdf", open(4_200), "ALL_MEMBERS");
    const invoice = (await prisma.invoice.findFirst({ where: { documentId: id } }))!;
    await uploadDocument(ctx.board, {
      fileName: "Protokoll.pdf",
      bytes: PDF("Protokoll"),
      access: "ALL_MEMBERS",
    }); // kein Beleg, für alle sichtbar

    for (const who of [ctx.lead, ctx.member]) {
      await expect(getOpenPayments(who)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(setInvoiceStatus(who, invoice.id, "PAID")).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect((await getDashboard(who)).payments).toBeNull();
      // Das Dokument („Alle Mitglieder“) sehen sie – Betrag und Zahlungsstand nicht.
      const doc = (await listDocuments(who, { request: first })).items.find((d) => d.id === id);
      expect(doc?.invoice).toBeNull();
      // Der Filter „nur Rechnungen“ wirkt für sie nicht (keine Rückschlüsse, welche Dokumente Rechnungen sind).
      expect((await listDocuments(who, { invoices: "open", request: first })).total).toBe(2);
    }

    expect((await getDashboard(ctx.board)).payments).toMatchObject({ totalCents: 4_200, count: 1 });
    const mine = (await listDocuments(ctx.board, { invoices: "open", request: first })).items;
    expect(mine.map((doc) => doc.id)).toEqual([id]);
    expect(mine[0]?.invoice).toMatchObject({ status: "OPEN", amountCents: 4_200 });
    await uploadDocument(ctx.board, { fileName: "Satzung.pdf", bytes: PDF(), access: "BOARD" });
    expect((await listDocuments(ctx.board, { invoices: "all", request: first })).total).toBe(1);
  });

  it("Mandantentrennung: fremde Vereine sehen und ändern keine Rechnungen", async () => {
    const a = await setup();
    const b = await setup();
    const { id } = await uploadInvoice(a.ctx.board, "a.pdf", open(1_234));
    const invoice = (await prisma.invoice.findFirst({ where: { documentId: id } }))!;
    expect(await getOpenPayments(b.ctx.admin)).toMatchObject({ totalCents: 0, count: 0 });
    await expect(setInvoiceStatus(b.ctx.admin, invoice.id, "PAID")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const dashboard = await getDashboard(b.ctx.admin);
    expect(dashboard.payments).toMatchObject({ totalCents: 0, count: 0, items: [] });
    expect(JSON.stringify(dashboard)).not.toContain(id);
    expect(JSON.stringify(dashboard)).not.toContain(invoice.id);
  });
});

describe("Rechnung bearbeiten", () => {
  it("Betrag, Fälligkeit und Zahlungsstand – nur mit dem Finanzrecht, nur an Rechnungen", async () => {
    const { ctx } = await setup();
    const { id } = await uploadInvoice(ctx.board, "a.pdf", open(1_000));
    const edit = (over: object) =>
      documentFormSchema.parse({ name: `${todayName}.pdf`, access: "BOARD", ...over });

    await updateDocument(
      ctx.board,
      id,
      edit({ invoice: { status: "OPEN", amount: "1.500,00", dueDate: dayIn(30) } }),
    );
    let invoice = (await prisma.invoice.findFirst({ where: { documentId: id } }))!;
    expect(invoice).toMatchObject({ amountCents: 150_000, status: "OPEN" });
    expect(toDateInputValue(invoice.dueDate!)).toBe(dayIn(30));
    const audit = await prisma.auditLog.findFirst({
      where: { action: "finance.invoice_updated", entityId: invoice.id },
    });
    expect(audit?.changes).toMatchObject({
      betrag: {
        from: expect.stringMatching(/^10,00\s€$/),
        to: expect.stringMatching(/^1\.500,00\s€$/),
      },
      faellig: { from: null, to: dayIn(30) },
    });

    await updateDocument(ctx.board, id, edit({ invoice: { status: "PAID", amount: "1500" } }));
    invoice = (await prisma.invoice.findFirst({ where: { documentId: id } }))!;
    expect(invoice).toMatchObject({ status: "PAID", paidById: ctx.board.userId, dueDate: null });

    // Ein gewöhnliches Dokument lässt sich so nicht zur Rechnung machen.
    const { id: plain } = await uploadDocument(ctx.board, {
      fileName: "Satzung.pdf",
      bytes: PDF(),
      access: "BOARD",
    });
    await expect(
      updateDocument(ctx.board, plain, {
        ...edit({ invoice: { status: "OPEN", amount: "5" } }),
        name: "Satzung.pdf",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("Die Datenbank lehnt ungültige Rechnungen ab", () => {
  it("Betrag ≤ 0, offen ohne Betrag, „bezahlt am“ bei offener Rechnung", async () => {
    const { club, ctx } = await setup();
    const { id } = await uploadDocument(ctx.board, {
      fileName: "Beleg.pdf",
      bytes: PDF(),
      access: "BOARD",
    });
    const base = { clubId: club.id, documentId: id, invoiceDate: new Date(Date.UTC(2026, 8, 27)) };
    await expect(prisma.invoice.create({ data: { ...base, amountCents: 0 } })).rejects.toThrow();
    await expect(prisma.invoice.create({ data: { ...base, amountCents: null } })).rejects.toThrow();
    await expect(
      prisma.invoice.create({ data: { ...base, amountCents: 100, paidAt: new Date() } }),
    ).rejects.toThrow();
    await expect(
      prisma.invoice.create({ data: { ...base, amountCents: 1_000_000_001 } }),
    ).rejects.toThrow();
  });

  it("die neuen Rechte stehen im Katalog", async () => {
    const keys = (await prisma.permission.findMany({ where: { module: "Finanzen" } })).map(
      (entry) => entry.key,
    );
    expect(keys.sort()).toEqual(["finance:export", "finance:manage", "finance:read"]);
  });
});
