import { beforeEach, describe, expect, it, vi } from "vitest";

// Route Handler laufen hier ohne Next.js: Cookies und Kopfzeilen der Anfrage kommen aus dem Testhelfer.
vi.mock("next/headers", async () => (await import("../helpers/next-request")).nextHeadersMock());

import { NextRequest } from "next/server";
import { GET as downloadReceipt } from "@/app/api/finanzen/belege/[id]/route";
import { GET as downloadEvidence } from "@/app/api/finanzen/spenden/nachweise/[id]/route";
import { addBerlinDays, toDateInputValue, todayCalendarDate } from "@/lib/dates";
import { attachDonationFile, attachDonationNote } from "@/modules/donations/evidence";
import { recordDonation } from "@/modules/donations/service";
import { createEntry, listAccounts, listCategories, setupLedger } from "@/modules/finance/ledger";
import { attachReceiptFile, attachReceiptNote } from "@/modules/finance/receipts";
import { prisma } from "@/server/db/client";
import { addUserToClub, contextFor, createClub, createMember } from "../helpers/factories";
import { loginAs, request } from "../helpers/next-request";

/**
 * Herunterladen von Belegen (Kassenbuch) und Spendennachweisen: Buchhaltungsdateien. Nur mit `finance:read`, nur im
 * eigenen Verein, nur solange das Dokument nicht im Papierkorb liegt – und immer als Anhang mit Schutz-Kopfzeilen.
 */
const day = (offset = 0) => toDateInputValue(addBerlinDays(new Date(), offset));
const PDF = new TextEncoder().encode("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

beforeEach(() => {
  request.token = null;
});

async function setup() {
  const club = await createClub("Downloadverein");
  const board = await addUserToClub(club, "BOARD");
  const member = await addUserToClub(club, "MEMBER");
  const ctx = await contextFor(board.user.id, club.id);
  await setupLedger(ctx, {
    ledgerStartDate: `${todayCalendarDate().getUTCFullYear()}-01-01`,
    bankName: "Girokonto",
    bankOpening: "1.000,00",
    withCash: false,
  });
  const [bank] = await listAccounts(ctx);
  const categories = await listCategories(ctx);
  const entry = await createEntry(ctx, {
    kind: "EXPENSE",
    accountId: bank!.id,
    bookingDate: day(),
    description: "Bälle",
    lines: [
      { categoryId: categories.find((c) => c.name === "Sportmaterial")!.id, amount: "50,00" },
    ],
  });
  const receipt = await attachReceiptFile(ctx, {
    entryId: entry.id,
    fileName: "kassenbon.pdf",
    bytes: PDF,
  });
  const marta = await createMember(club.id, { firstName: "Marta", lastName: "Wolff" });
  const { donationId } = await recordDonation(ctx, {
    kind: "IN_KIND",
    donorMode: "MEMBER",
    memberId: marta.id,
    amount: "180,00",
    receivedOn: day(),
    target: "frei",
    itemDescription: "12 Kisten Mineralwasser, neu",
    inKindOrigin: "PRIVATE",
    valuationDocs: true,
  });
  const evidence = await attachDonationFile(ctx, {
    donationId,
    fileName: "lieferschein.pdf",
    bytes: PDF,
  });
  await attachReceiptNote(ctx, { entryId: entry.id, note: "Parkautomat, kein Beleg" });
  await attachDonationNote(ctx, { donationId, note: "Lieferschein liegt beim Kassenwart" });

  // Anhang-Nummern (die Downloads nehmen die Nummer des Anhangs, nicht die des Dokuments); `null` = Eigenbeleg bzw. Notiz.
  const ledger = async (documentId: string | null) =>
    (await prisma.ledgerAttachment.findFirstOrThrow({ where: { clubId: club.id, documentId } })).id;
  const donation = async (documentId: string | null) =>
    (await prisma.donationAttachment.findFirstOrThrow({ where: { clubId: club.id, documentId } }))
      .id;
  return {
    club,
    board,
    member,
    receipt: { documentId: receipt.id, id: await ledger(receipt.id), noteId: await ledger(null) },
    evidence: {
      documentId: evidence.id,
      id: await donation(evidence.id),
      noteId: await donation(null),
    },
  };
}

const ROUTES = [
  { name: "Beleg", path: "/api/finanzen/belege", GET: downloadReceipt, kind: "receipt" },
  {
    name: "Spendennachweis",
    path: "/api/finanzen/spenden/nachweise",
    GET: downloadEvidence,
    kind: "evidence",
  },
] as const;

async function download(route: (typeof ROUTES)[number], id: string) {
  const response = await route.GET(new NextRequest(`http://localhost:3000${route.path}/${id}`), {
    params: Promise.resolve({ id }),
  });
  const body = response.headers.get("content-type")?.startsWith("application/json")
    ? ((await response.json()) as { ok: boolean; error?: { code: string } })
    : null;
  return { response, status: response.status, code: body?.error?.code };
}

/** Wie nach Ablauf der Aufbewahrungsfrist: Das Dokument liegt im Papierkorb, der Anhang besteht noch. */
async function trash(documentId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('ALTER TABLE "Document" DISABLE TRIGGER "Document_retention_guard"');
    await tx.document.update({ where: { id: documentId }, data: { deletedAt: new Date() } });
    await tx.$executeRawUnsafe('ALTER TABLE "Document" ENABLE TRIGGER "Document_retention_guard"');
  });
}

describe.each(ROUTES)("$name herunterladen", (route) => {
  it("mit Finanzrecht: die Datei als Anhang, mit nosniff, sandbox-CSP und ohne Zwischenspeichern", async () => {
    const data = await setup();
    const { id } = data[route.kind];
    await loginAs(data.board.user.id, data.club.id);
    const { response, status } = await download(route, id);
    expect(status).toBe(200);
    const fileName = route.kind === "receipt" ? "kassenbon.pdf" : "lieferschein.pdf";
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "content-type": "application/pdf",
      "content-length": String(PDF.length),
      "content-disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`,
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
      "cache-control": "private, no-store",
      "referrer-policy": "no-referrer",
    });
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PDF);
  });

  it("ohne Anmeldung 401, ohne Finanzrecht 403", async () => {
    const data = await setup();
    const { id } = data[route.kind];
    expect(await download(route, id)).toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    await loginAs(data.member.user.id, data.club.id);
    expect(await download(route, id)).toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("Anhang eines anderen Vereins, Eigenbeleg ohne Datei, unbekannte Nummer: 404", async () => {
    const data = await setup();
    const other = await setup();
    await loginAs(other.board.user.id, other.club.id);
    expect(await download(route, data[route.kind].id)).toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
    expect(await download(route, other[route.kind].noteId)).toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
    expect(await download(route, "kein-anhang")).toMatchObject({ status: 404, code: "NOT_FOUND" });
  });

  it("Dokument im Papierkorb: 404", async () => {
    const data = await setup();
    await trash(data[route.kind].documentId);
    await loginAs(data.board.user.id, data.club.id);
    expect(await download(route, data[route.kind].id)).toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });
});
