import { describe, expect, it } from "vitest";
import { toDateInputValue, todayCalendarDate } from "@/lib/dates";
import { prisma } from "@/server/db/client";
import { toActionError } from "@/server/action";
import { countCash } from "@/modules/finance/cash-count";
import {
  closePeriod,
  closePreview,
  listPeriodCloses,
  verifyPeriodCloses,
} from "@/modules/finance/closing";
import {
  accountBalances,
  createEntry,
  listAccounts,
  listCategories,
  listEntries,
  reverseEntry,
  setupLedger,
} from "@/modules/finance/ledger";
import { attachReceiptNote, removeAttachment } from "@/modules/finance/receipts";
import {
  archiveAccount,
  archiveCategory,
  createAccount,
  createCategory,
  updateCategory,
} from "@/modules/finance/settings";
import { addUserToClub, contextFor, createClub } from "../helpers/factories";

/** Erster Tag des Monats vor `back` Monaten und dessen Schlüssel („2026-08“). */
function monthAgo(back: number) {
  const today = todayCalendarDate();
  const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - back, 1));
  return {
    first: toDateInputValue(first).slice(0, 10),
    day: (n: number) =>
      toDateInputValue(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), n))),
    key: `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}`,
    last: new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)),
  };
}

async function setup() {
  const club = await createClub("Abschlussverein");
  const board = await addUserToClub(club, "BOARD");
  const member = await addUserToClub(club, "MEMBER");
  const ctx = {
    board: await contextFor(board.user.id, club.id),
    member: await contextFor(member.user.id, club.id),
  };
  const twoBack = monthAgo(2);
  await setupLedger(ctx.board, {
    ledgerStartDate: twoBack.first,
    bankName: "Girokonto",
    bankOpening: "1.000,00",
    withCash: true,
    cashName: "Barkasse",
    cashOpening: "100,00",
  });
  const accounts = await listAccounts(ctx.board);
  const categories = await listCategories(ctx.board);
  const bank = accounts.find((a) => a.kind === "BANK")!;
  const cash = accounts.find((a) => a.kind === "CASH")!;
  const cat = (name: string) => categories.find((c) => c.name === name)!.id;
  const expense = (bookingDate: string, amount = "10,00", accountId = bank.id) =>
    createEntry(ctx.board, {
      kind: "EXPENSE",
      accountId,
      bookingDate,
      description: `Ausgabe ${bookingDate}`,
      lines: [{ categoryId: cat("Sportmaterial"), amount }],
    });
  return { club, ctx, bank, cash, cat, expense, twoBack, oneBack: monthAgo(1) };
}

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return toActionError(error).message;
  }
  throw new Error("Es wurde ein Fehler erwartet.");
}

describe("Monatsabschluss", () => {
  it("der Reihe nach, mit Kontoständen und verketteter Prüfsumme; danach ist der Monat gesperrt", async () => {
    const { club, ctx, bank, expense, twoBack, oneBack } = await setup();
    const early = await expense(twoBack.day(5), "25,00");
    await attachReceiptNote(ctx.board, { entryId: early.id, note: "Quittung im Ordner" });
    await expense(oneBack.day(3), "5,00");

    const preview = await closePreview(ctx.board);
    expect(preview).toMatchObject({ month: twoBack.key, ended: true, entryCount: 3 });
    // Nicht der Reihe nach: abgelehnt.
    expect(await failure(closePeriod(ctx.board, { month: oneBack.key }))).toMatch(
      /schon abgeschlossen oder noch nicht dran/,
    );
    expect(await failure(closePeriod(ctx.member, { month: twoBack.key }))).toMatch(/Berechtigung/);

    await closePeriod(ctx.board, { month: twoBack.key, note: "Kassenprüfung ok" });
    const settings = await prisma.financeSettings.findUniqueOrThrow({ where: { clubId: club.id } });
    expect(settings.closedThrough!.getTime()).toBe(twoBack.last.getTime());
    let closes = await listPeriodCloses(ctx.board);
    expect(closes).toHaveLength(1);
    expect(closes[0]).toMatchObject({
      entryCount: 3,
      note: "Kassenprüfung ok",
      totalCents: 107_500,
    });
    expect(closes[0]!.contentHash).toMatch(/^[0-9a-f]{64}$/);

    // Gesperrt: neue Buchung und Entfernen eines Belegs im abgeschlossenen Monat.
    expect(await failure(expense(twoBack.day(20)))).toMatch(/abgeschlossen/);
    const [note] = (await listEntries(ctx.board, { q: "Ausgabe" })).entries.find(
      (e) => e.id === early.id,
    )!.attachments;
    expect(await failure(removeAttachment(ctx.board, { id: note!.id }))).toMatch(/abgeschlossen/);

    // Storno einer Buchung aus dem abgeschlossenen Monat: am ersten offenen Tag.
    await reverseEntry(ctx.board, { id: early.id, reason: "doppelt" });
    const storno = (await listEntries(ctx.board, { q: "Storno" })).entries[0]!;
    expect(toDateInputValue(storno.bookingDate)).toBe(oneBack.first);

    // Nächster Monat: Prüfsumme verkettet.
    await closePeriod(ctx.board, { month: oneBack.key });
    closes = await listPeriodCloses(ctx.board);
    const rows = await prisma.financePeriodClose.findMany({
      where: { clubId: club.id },
      orderBy: { closedThrough: "asc" },
    });
    expect(rows[1]!.previousHash).toBe(rows[0]!.contentHash);
    expect(rows[1]!.balances).toMatchObject({ [bank.id]: 100_000 - 2_500 - 500 + 2_500 });
    expect(await verifyPeriodCloses(ctx.board)).toEqual({ ok: true, checked: 2 });

    // Der laufende Monat ist noch nicht vorbei.
    const current = monthAgo(0);
    expect(await failure(closePeriod(ctx.board, { month: current.key }))).toMatch(
      /noch nicht vorbei/,
    );
  });

  it("die Datenbank verbietet Wiederöffnen und Ändern", async () => {
    const { club, ctx, twoBack } = await setup();
    await closePeriod(ctx.board, { month: twoBack.key });
    await expect(
      prisma.financeSettings.update({ where: { clubId: club.id }, data: { closedThrough: null } }),
    ).rejects.toThrow(/PERIOD_REOPEN_FORBIDDEN/);
    const row = await prisma.financePeriodClose.findFirstOrThrow({ where: { clubId: club.id } });
    await expect(
      prisma.financePeriodClose.update({ where: { id: row.id }, data: { note: "anders" } }),
    ).rejects.toThrow(/FINANCE_IMMUTABLE/);
    await expect(prisma.financePeriodClose.delete({ where: { id: row.id } })).rejects.toThrow(
      /FINANCE_IMMUTABLE/,
    );
  });

  it("gleichzeitig abschließen und rückwirkend buchen: die Buchung zählt mit oder wird abgelehnt", async () => {
    const { club, ctx, expense, twoBack } = await setup();
    const [closed, booked] = await Promise.allSettled([
      closePeriod(ctx.board, { month: twoBack.key }),
      expense(twoBack.day(15), "7,00"),
    ]);
    expect(closed.status).toBe("fulfilled");
    const row = await prisma.financePeriodClose.findFirstOrThrow({ where: { clubId: club.id } });
    const inMonth = await prisma.ledgerEntry.count({
      where: { clubId: club.id, bookingDate: { lte: twoBack.last } },
    });
    expect(row.entryCount).toBe(inMonth);
    expect(inMonth).toBe(booked.status === "fulfilled" ? 3 : 2);
  });
});

describe("Kassensturz", () => {
  it("stimmt: kein Eintrag; Differenz: Buchung „Kassendifferenz“ mit Grund, danach stimmt die Kasse", async () => {
    const { club, ctx, cash, bank } = await setup();
    expect(await countCash(ctx.board, { accountId: cash.id, counted: "100,00" })).toEqual({
      differenceCents: 0,
      entryLabel: null,
    });
    expect(await failure(countCash(ctx.board, { accountId: cash.id, counted: "97,50" }))).toMatch(
      /weicht um −2,50\s€ ab/,
    );
    expect(
      await failure(
        countCash(ctx.board, {
          accountId: cash.id,
          counted: "97,50",
          denominations: { "5000": 1, "2000": 2 },
          note: "Wechselgeld",
        }),
      ),
    ).toMatch(/Zählhilfe ergibt 90,00\s€/);
    const result = await countCash(ctx.board, {
      accountId: cash.id,
      counted: "97,50",
      denominations: { "5000": 1, "2000": 2, "500": 1, "200": 1, "50": 1 },
      note: "Wechselgeld beim Fest falsch herausgegeben",
    });
    expect(result.differenceCents).toBe(-250);
    expect(result.entryLabel).toMatch(/^\d{4}-\d{4}$/);
    expect((await accountBalances(ctx.board)).get(cash.id)).toBe(9_750);
    const entry = (await listEntries(ctx.board, { q: "Kassendifferenz" })).entries[0]!;
    expect(entry.needsReceipt).toBe(false);
    expect(entry.lines[0]!.categoryName).toBe("Kassendifferenz");
    expect(await prisma.cashCount.count({ where: { clubId: club.id } })).toBe(2);
    // Ein Bankkonto zählt man nicht (die Meldung steht am Feld „Kasse“).
    expect(await failure(countCash(ctx.board, { accountId: bank.id, counted: "1,00" }))).toMatch(
      /Eingaben/,
    );
    const counted = await prisma.cashCount.findFirstOrThrow({ where: { clubId: club.id } });
    await expect(
      prisma.cashCount.update({ where: { id: counted.id }, data: { note: "x" } }),
    ).rejects.toThrow(/FINANCE_IMMUTABLE/);
  });
});

describe("Konten und Kategorien", () => {
  it("Konto anlegen mit Anfangsbestand, Name eindeutig, archivieren nur leer", async () => {
    const { ctx, bank } = await setup();
    const { id } = await createAccount(ctx.board, {
      name: "Jugendkasse",
      kind: "CASH",
      opening: "40,00",
    });
    expect((await accountBalances(ctx.board)).get(id)).toBe(4_000);
    expect(await failure(createAccount(ctx.board, { name: "jugendkasse", kind: "BANK" }))).toMatch(
      /Eingaben|gibt es schon/,
    );
    expect(await failure(archiveAccount(ctx.board, { id, archived: true }))).toMatch(
      /noch 40,00\s€/,
    );
    const empty = await createAccount(ctx.board, { name: "Tagesgeld", kind: "BANK" });
    await archiveAccount(ctx.board, { id: empty.id, archived: true });
    expect((await listAccounts(ctx.board)).map((a) => a.name)).not.toContain("Tagesgeld");
    expect(bank.name).toBe("Girokonto");
  });

  it("archivieren und gleichzeitig buchen: nie ein archiviertes Konto mit Geld darauf", async () => {
    const { ctx, cat } = await setup();
    for (let round = 0; round < 3; round++) {
      const { id } = await createAccount(ctx.board, { name: `Tagesgeld ${round}`, kind: "BANK" });
      await Promise.allSettled([
        archiveAccount(ctx.board, { id, archived: true }),
        createEntry(ctx.board, {
          kind: "INCOME",
          accountId: id,
          bookingDate: toDateInputValue(todayCalendarDate()),
          description: "Spende",
          lines: [{ categoryId: cat("Spenden"), amount: "5,00" }],
        }),
      ]);
      const account = await prisma.financeAccount.findUniqueOrThrow({ where: { id } });
      const balance = (await accountBalances(ctx.board)).get(id) ?? 0;
      expect(account.archivedAt === null || balance === 0).toBe(true);
    }
  });

  it("Kategorie anlegen, Bereich ändern (frühere Buchungen behalten ihren), Programm-Kategorien bleiben aktiv", async () => {
    const { ctx, bank, cat } = await setup();
    const { id } = await createCategory(ctx.board, {
      name: "Trainerlizenzen",
      direction: "EXPENSE",
      sphere: "NON_PROFIT",
    });
    const entry = await createEntry(ctx.board, {
      kind: "EXPENSE",
      accountId: bank.id,
      bookingDate: toDateInputValue(todayCalendarDate()),
      description: "Lizenz C",
      lines: [{ categoryId: id, amount: "80,00" }],
    });
    await updateCategory(ctx.board, { id, name: "Trainerlizenzen", sphere: "PURPOSE_OPERATION" });
    const listed = (await listEntries(ctx.board, { q: "Lizenz C" })).entries.find(
      (e) => e.id === entry.id,
    )!;
    expect(listed.lines[0]!.sphere).toBe("NON_PROFIT");
    await archiveCategory(ctx.board, { id, archived: true });
    expect((await listCategories(ctx.board)).find((c) => c.id === id)).toMatchObject({
      selectable: false,
    });
    expect(
      await failure(archiveCategory(ctx.board, { id: cat("Spenden"), archived: true })),
    ).toMatch(/braucht das Programm/);
  });
});

describe("Abschluss – Nachrechnen, Erinnerungen, Schutz in der Datenbank", () => {
  it("Nachrechnen erkennt Veränderungen an der Datenbank vorbei; ein später angelegtes Konto stört nicht", async () => {
    const { club, ctx, expense, twoBack, oneBack } = await setup();
    const entry = await expense(twoBack.day(4), "12,00");
    await closePeriod(ctx.board, { month: twoBack.key });
    await closePeriod(ctx.board, { month: oneBack.key });
    await createAccount(ctx.board, { name: "Neues Tagesgeld", kind: "BANK" });
    expect(await verifyPeriodCloses(ctx.board)).toEqual({ ok: true, checked: 2 });

    // Jemand ändert eine Buchung im abgeschlossenen Monat an den Regeln vorbei (Trigger ausgeschaltet).
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'ALTER TABLE "LedgerEntry" DISABLE TRIGGER "LedgerEntry_immutable"',
      );
      await tx.ledgerEntry.update({ where: { id: entry.id }, data: { description: "verändert" } });
      await tx.$executeRawUnsafe(
        'ALTER TABLE "LedgerEntry" ENABLE TRIGGER "LedgerEntry_immutable"',
      );
    });
    expect((await verifyPeriodCloses(ctx.board)).ok).toBe(false);
    expect(club.id).toBeTruthy();
  });

  it("höchste Nummer nur aus dem Zeitraum; ohne Buchungen keine Nummer", async () => {
    const { club, ctx, expense, twoBack, oneBack } = await setup();
    await expense(oneBack.day(2), "3,00");
    const late = await expense(twoBack.day(9), "4,00"); // nachträglich erfasst, höhere Nummer
    await closePeriod(ctx.board, { month: twoBack.key });
    await closePeriod(ctx.board, { month: oneBack.key });
    const rows = await prisma.financePeriodClose.findMany({
      where: { clubId: club.id },
      orderBy: { closedThrough: "asc" },
    });
    expect(rows[0]!.lastNumber).toBe(late.label);
    expect(rows[1]!.lastNumber).not.toBe(late.label);
    expect(rows[1]!.entryCount).toBe(1);
  });

  it("bezahlte, nicht gebuchte Rechnung bleibt nach dem Abschluss in der Erinnerung", async () => {
    const { club, ctx, twoBack } = await setup();
    const doc = await prisma.document.create({
      data: {
        clubId: club.id,
        name: "Rechnung Ball.pdf",
        storageKey: `test-${club.id}`,
        mimeType: "application/pdf",
        sizeBytes: 10,
        sha256: "x",
        access: "BOARD",
      },
    });
    await prisma.invoice.create({
      data: {
        clubId: club.id,
        documentId: doc.id,
        invoiceDate: new Date(`${twoBack.day(3)}T00:00:00Z`),
        amountCents: 4_000,
        status: "PAID",
        paidAt: new Date(`${twoBack.day(3)}T10:00:00Z`),
      },
    });
    expect((await closePreview(ctx.board))!.checks.map((c) => c.key)).toContain("invoices");
    await closePeriod(ctx.board, { month: twoBack.key });
    // Auch im Folgemonat und in der Übersicht noch da – nachbuchen geht im offenen Zeitraum.
    expect((await closePreview(ctx.board))!.checks.map((c) => c.key)).toContain("invoices");
    const { unbookedPaidInvoiceCount } = await import("@/modules/finance/service");
    const settings = await prisma.financeSettings.findUniqueOrThrow({ where: { clubId: club.id } });
    expect(await unbookedPaidInvoiceCount(ctx.board, settings.ledgerStartDate)).toBe(1);
  });

  it("Kassensturz-Tabelle: nur Barkassen, nur heute bzw. offen, Differenz immer gebucht und begründet", async () => {
    const { club, ctx, bank, cash, twoBack } = await setup();
    const today = todayCalendarDate();
    const base = { clubId: club.id, countedCents: 100, bookCents: 100, differenceCents: 0 };
    await expect(
      prisma.cashCount.create({ data: { ...base, accountId: bank.id, countedOn: today } }),
    ).rejects.toThrow(/nur für Barkassen/);
    await expect(
      prisma.cashCount.create({
        data: { ...base, accountId: cash.id, countedOn: new Date(today.getTime() + 86_400_000) },
      }),
    ).rejects.toThrow(/gilt für heute/);
    await expect(
      prisma.cashCount.create({
        data: {
          ...base,
          accountId: cash.id,
          countedOn: today,
          countedCents: 90,
          differenceCents: -10,
        },
      }),
    ).rejects.toThrow(/CashCount_difference_chk/);
    await closePeriod(ctx.board, { month: twoBack.key });
    await expect(
      prisma.cashCount.create({ data: { ...base, accountId: cash.id, countedOn: twoBack.last } }),
    ).rejects.toThrow(/gilt für heute/);
  });

  it("Kassensturz, Konten und Kategorien nur mit dem Recht „Finanzen bearbeiten“", async () => {
    const { ctx, cash, bank, cat } = await setup();
    const denied = [
      countCash(ctx.member, { accountId: cash.id, counted: "100,00" }),
      createAccount(ctx.member, { name: "Schwarze Kasse", kind: "CASH" }),
      archiveAccount(ctx.member, { id: bank.id, archived: true }),
      createCategory(ctx.member, { name: "X", direction: "EXPENSE", sphere: "NON_PROFIT" }),
      updateCategory(ctx.member, { id: cat("Sportmaterial"), name: "Y", sphere: "NON_PROFIT" }),
      archiveCategory(ctx.member, { id: cat("Sportmaterial"), archived: true }),
    ];
    for (const attempt of denied) expect(await failure(attempt)).toMatch(/Berechtigung/);
  });
});
