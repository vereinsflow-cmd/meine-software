import { describe, expect, it } from "vitest";
import { addBerlinDays, toDateInputValue, todayCalendarDate } from "@/lib/dates";
import { prisma } from "@/server/db/client";
import { toActionError } from "@/server/action";
import {
  accountBalances,
  correctEntry,
  correctOpening,
  createEntry,
  createTransfer,
  getLedgerSetup,
  listAccounts,
  listCategories,
  listEntries,
  reverseEntry,
  setupLedger,
  yearSummary,
} from "@/modules/finance/ledger";
import { addUserToClub, contextFor, createClub, createDepartment } from "../helpers/factories";

/** Kalendertag als Eingabetext, relativ zu heute (Berlin). */
const day = (offset = 0) => toDateInputValue(addBerlinDays(new Date(), offset));
const thisYearStart = () => `${todayCalendarDate().getUTCFullYear()}-01-01`;

async function setup() {
  const club = await createClub("Kassenverein");
  const admin = await addUserToClub(club, "CLUB_ADMIN");
  const board = await addUserToClub(club, "BOARD");
  const member = await addUserToClub(club, "MEMBER");
  const ctx = {
    admin: await contextFor(admin.user.id, club.id),
    board: await contextFor(board.user.id, club.id),
    member: await contextFor(member.user.id, club.id),
  };
  await setupLedger(ctx.board, {
    ledgerStartDate: thisYearStart(),
    bankName: "Girokonto",
    bankInstitute: "Sparkasse Musterstadt",
    bankOpening: "1.000,00",
    withCash: true,
    cashName: "Barkasse",
    cashOpening: "50,00",
  });
  const accounts = await listAccounts(ctx.board);
  const categories = await listCategories(ctx.board);
  const bank = accounts.find((a) => a.kind === "BANK")!;
  const cash = accounts.find((a) => a.kind === "CASH")!;
  const cat = (name: string) => categories.find((c) => c.name === name)!.id;
  return { club, ctx, bank, cash, cat, people: { admin, board, member } };
}

/** Fehlertext, wie ihn die Oberfläche zeigen würde. */
async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return toActionError(error).message;
  }
  throw new Error("Es wurde ein Fehler erwartet.");
}

describe("Kassenbuch einrichten", () => {
  it("legt Konten, Kategorien und Anfangsbestände an – ein zweites Einrichten wird abgelehnt", async () => {
    const { ctx, bank, cash } = await setup();
    expect(bank).toMatchObject({
      name: "Girokonto",
      bankName: "Sparkasse Musterstadt",
      balanceCents: 100_000,
    });
    expect(cash).toMatchObject({ name: "Barkasse", balanceCents: 5_000 });
    expect(
      await failure(
        setupLedger(ctx.board, {
          ledgerStartDate: thisYearStart(),
          bankName: "Anderes Konto",
          bankOpening: "5,00",
          withCash: false,
        }),
      ),
    ).toBe("Das Kassenbuch ist schon eingerichtet.");
    expect((await listAccounts(ctx.board)).map((a) => a.name)).toEqual(["Girokonto", "Barkasse"]);
    const categories = await listCategories(ctx.board);
    expect(categories.find((c) => c.systemKey === "OPENING")).toMatchObject({ selectable: false });
    expect(categories.find((c) => c.name === "Hallen- und Platzmiete")).toMatchObject({
      direction: "EXPENSE",
      sphere: "NON_PROFIT",
      selectable: true,
    });
    expect(await getLedgerSetup(ctx.board)).toMatchObject({ closedThrough: null });
  });

  it("nur mit Finanzrechten; Mitglieder sehen nichts", async () => {
    const { ctx } = await setup();
    expect(await failure(listAccounts(ctx.member))).toMatch(/Berechtigung/);
    expect(await failure(listEntries(ctx.member))).toMatch(/Berechtigung/);
  });
});

describe("Buchen und Storno", () => {
  it("Einnahme, Ausgabe mit Aufteilung, Kontostand, Storno und Korrektur", async () => {
    const { ctx, bank, cat, club } = await setup();
    const fussball = await createDepartment(club.id, "Fußball");
    const income = await createEntry(ctx.board, {
      kind: "INCOME",
      accountId: bank.id,
      bookingDate: day(),
      description: "Zuschuss Stadt",
      lines: [{ categoryId: cat("Zuschüsse"), amount: "500,00" }],
    });
    expect(income.label).toMatch(/^\d{4}-0003$/); // 1 und 2 sind die Anfangsbestände
    await createEntry(ctx.board, {
      kind: "EXPENSE",
      accountId: bank.id,
      bookingDate: day(),
      description: "Einkauf Sportplatz",
      counterparty: "Baumarkt",
      lines: [
        { categoryId: cat("Sportmaterial"), amount: "100,00", target: `a:${fussball.id}` },
        { categoryId: cat("Büro und Porto"), amount: "20,50" },
      ],
    });
    expect((await accountBalances(ctx.board)).get(bank.id)).toBe(100_000 + 50_000 - 12_050);

    const page = await listEntries(ctx.board, { departmentId: fussball.id });
    expect(page.entries).toHaveLength(1);
    const expense = page.entries[0]!;
    expect(expense).toMatchObject({
      amountCents: -12_050,
      counterpartyName: "Baumarkt",
      canReverse: true,
    });
    expect(
      expense.lines.map((l) => [l.categoryName, l.amountCents, l.department?.name ?? null]),
    ).toEqual([
      ["Sportmaterial", -10_000, "Fußball"],
      ["Büro und Porto", -2_050, null],
    ]);

    const storno = await reverseEntry(ctx.board, { id: expense.id, reason: "Doppelt erfasst" });
    expect(storno.label).toMatch(/-0005$/);
    expect((await accountBalances(ctx.board)).get(bank.id)).toBe(150_000);
    // Ein zweites Storno derselben Buchung, das Storno eines Stornos: beides abgelehnt.
    expect(await failure(reverseEntry(ctx.board, { id: expense.id, reason: "noch mal" }))).toBe(
      "Diese Buchung ist bereits storniert.",
    );
    const reversal = (await listEntries(ctx.board, { q: "Storno" })).entries[0]!;
    expect(reversal).toMatchObject({
      kind: "REVERSAL",
      reversalOf: { id: expense.id },
      canReverse: false,
    });
    expect(await failure(reverseEntry(ctx.board, { id: reversal.id, reason: "zurück" }))).toMatch(
      /Storno lässt sich nicht stornieren/,
    );

    // Korrigieren = Storno + neue Buchung in einem Schritt.
    const corrected = await correctEntry(ctx.board, {
      id: income.id,
      reason: "Betrag falsch",
      entry: {
        kind: "INCOME",
        accountId: bank.id,
        bookingDate: day(),
        description: "Zuschuss Stadt",
        lines: [{ categoryId: cat("Zuschüsse"), amount: "550,00" }],
      },
    });
    expect(corrected.label).toMatch(/-0007$/);
    expect((await accountBalances(ctx.board)).get(bank.id)).toBe(155_000);

    // Jahreszahlen: Stornos heben auf, Anfangsbestände zählen nicht als Einnahme.
    const summary = await yearSummary(ctx.board, todayCalendarDate().getUTCFullYear());
    expect(summary).toMatchObject({ incomeCents: 55_000, expenseCents: 0, surplusCents: 55_000 });

    const actions = (
      await prisma.auditLog.findMany({ where: { clubId: club.id }, orderBy: { createdAt: "asc" } })
    )
      .map((a) => a.action)
      .filter((a) => a.startsWith("finance."));
    expect(actions).toEqual([
      "finance.setup_completed",
      "finance.entry_created",
      "finance.entry_created",
      "finance.entry_reversed",
      "finance.entry_reversed",
      "finance.entry_corrected",
    ]);
  });

  it("Kategorie muss zur Richtung passen; Programm-Kategorien sind nicht wählbar", async () => {
    const { ctx, bank, cat } = await setup();
    const wrong = await failure(
      createEntry(ctx.board, {
        kind: "INCOME",
        accountId: bank.id,
        bookingDate: day(),
        description: "falsch",
        lines: [{ categoryId: cat("Hallen- und Platzmiete"), amount: "10" }],
      }),
    );
    expect(wrong).toMatch(/Eingaben/);
    const opening = await failure(
      createEntry(ctx.board, {
        kind: "INCOME",
        accountId: bank.id,
        bookingDate: day(),
        description: "falsch",
        lines: [{ categoryId: cat("Anfangsbestand"), amount: "10" }],
      }),
    );
    expect(opening).toMatch(/Eingaben/);
  });

  it("Buchungen sind in der Datenbank unveränderlich", async () => {
    const { club } = await setup();
    const entry = await prisma.ledgerEntry.findFirstOrThrow({ where: { clubId: club.id } });
    await expect(
      prisma.ledgerEntry.update({ where: { id: entry.id }, data: { description: "geändert" } }),
    ).rejects.toThrow(/FINANCE_IMMUTABLE/);
    await expect(prisma.ledgerLine.deleteMany({ where: { entryId: entry.id } })).rejects.toThrow(
      /FINANCE_IMMUTABLE/,
    );
    await expect(prisma.ledgerEntry.delete({ where: { id: entry.id } })).rejects.toThrow(
      /FINANCE_IMMUTABLE/,
    );
  });

  it("eine Buchung ohne passende Zeilen scheitert beim Festschreiben; später keine Zeilen nachschieben", async () => {
    const { club, bank, cat, people } = await setup();
    const error = await prisma
      .$transaction(async (tx) => {
        await tx.financeCounter.update({
          where: {
            clubId_kind_year: {
              clubId: club.id,
              kind: "LEDGER",
              year: todayCalendarDate().getUTCFullYear(),
            },
          },
          data: { lastValue: { increment: 1 } },
        });
        await tx.ledgerEntry.create({
          data: {
            clubId: club.id,
            year: todayCalendarDate().getUTCFullYear(),
            number: 99,
            accountId: bank.id,
            bookingDate: todayCalendarDate(),
            amountCents: 100,
            description: "ohne Zeilen",
            createdById: people.board.user.id,
          },
        });
      })
      .catch((e: unknown) => e);
    expect(toActionError(error).message).toMatch(/Zeilen der Buchung ergeben nicht den Betrag/);

    const entry = await prisma.ledgerEntry.findFirstOrThrow({
      where: { clubId: club.id, kind: "OPENING" },
    });
    await expect(
      prisma.ledgerLine.create({
        data: {
          clubId: club.id,
          entryId: entry.id,
          position: 2,
          amountCents: 1,
          categoryId: cat("Zinsen"),
          sphere: "NEUTRAL",
          categoryName: "",
          bookingDate: entry.bookingDate,
          accountId: entry.accountId,
        },
      }),
    ).rejects.toThrow(/keine Zeilen hinzufügen/);
  });
});

describe("Barkasse", () => {
  it("nie im Minus – auch nicht rückwirkend; am selben Tag zählt der Stand am Abend", async () => {
    const { ctx, cash, cat } = await setup();
    const expense = (amount: string, offset: number) =>
      createEntry(ctx.board, {
        kind: "EXPENSE",
        accountId: cash.id,
        bookingDate: day(offset),
        description: "Bar ausgegeben",
        lines: [{ categoryId: cat("Einkauf für Feste"), amount }],
      });
    const income = (amount: string, offset: number) =>
      createEntry(ctx.board, {
        kind: "INCOME",
        accountId: cash.id,
        bookingDate: day(offset),
        description: "Bar eingenommen",
        lines: [{ categoryId: cat("Verkauf Speisen und Getränke"), amount }],
      });
    // Heute 80 € ausgeben, obwohl nur 50 € da sind – geht, wenn am selben Tag 40 € hereinkommen.
    const tooMuch = await failure(expense("80,00", 0));
    expect(tooMuch).toMatch(/Barkasse wäre am \d{2}\.\d{2}\.\d{4} im Minus \(−30,00 €\)/);
    await income("40,00", 0);
    await expense("80,00", 0);
    expect((await accountBalances(ctx.board)).get(cash.id)).toBe(1_000);
    // Rückwirkend: gestern 20 € ausgegeben – gestern Abend wäre die Kasse bei 30 €, heute Abend aber bei −10 €.
    if (todayCalendarDate().getUTCMonth() > 0 || todayCalendarDate().getUTCDate() > 1) {
      expect(await failure(expense("20,00", -1))).toMatch(/im Minus \(−10,00 €\)/);
    }
    // Keine Buchung in der Zukunft – weder Barkasse noch Girokonto.
    expect(await failure(income("5,00", 1))).toMatch(/Buchungen gehen nur bis heute/);
  });

  it("gleichzeitige Barausgaben: nur so viele, wie die Kasse hergibt", async () => {
    const { ctx, cash, cat } = await setup();
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        createEntry(ctx.board, {
          kind: "EXPENSE",
          accountId: cash.id,
          bookingDate: day(),
          description: "Bar",
          lines: [{ categoryId: cat("Einkauf für Feste"), amount: "10,00" }],
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(5);
    expect((await accountBalances(ctx.board)).get(cash.id)).toBe(0);
  });
});

describe("Nummern, Umbuchung, Mandanten", () => {
  it("gleichzeitige Buchungen bekommen lückenlose Nummern", async () => {
    const { ctx, bank, cat } = await setup();
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        createEntry(ctx.board, {
          kind: "INCOME",
          accountId: bank.id,
          bookingDate: day(),
          description: `Spende ${i}`,
          lines: [{ categoryId: cat("Spenden"), amount: "1,00" }],
        }),
      ),
    );
    const numbers = (await listEntries(ctx.board, { pageSize: 100 })).entries
      .map((e) => e.number)
      .sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
  });

  it("Umbuchung Kasse → Bank: zwei Hälften; Storno hebt beide auf", async () => {
    const { ctx, bank, cash } = await setup();
    const transfer = await createTransfer(ctx.board, {
      fromAccountId: cash.id,
      toAccountId: bank.id,
      bookingDate: day(),
      amount: "30,00",
    });
    expect(transfer.label).toMatch(/-0003 und \d{4}-0004$/);
    let balances = await accountBalances(ctx.board);
    expect([balances.get(cash.id), balances.get(bank.id)]).toEqual([2_000, 103_000]);
    const leg = (await listEntries(ctx.board, { accountId: cash.id })).entries.find(
      (e) => e.kind === "TRANSFER",
    )!;
    await reverseEntry(ctx.board, { id: leg.id, reason: "falsches Konto" });
    balances = await accountBalances(ctx.board);
    expect([balances.get(cash.id), balances.get(bank.id)]).toEqual([5_000, 100_000]);
    // Umbuchungen sind keine Einnahmen oder Ausgaben.
    expect(await yearSummary(ctx.board, todayCalendarDate().getUTCFullYear())).toMatchObject({
      incomeCents: 0,
      expenseCents: 0,
    });
  });

  it("ein anderer Verein sieht nichts und kann nicht auf fremde Konten buchen", async () => {
    const a = await setup();
    const b = await setup();
    expect((await listEntries(b.ctx.board)).entries.map((e) => e.account.id)).not.toContain(
      a.bank.id,
    );
    const message = await failure(
      createEntry(b.ctx.board, {
        kind: "INCOME",
        accountId: a.bank.id,
        bookingDate: day(),
        description: "fremd",
        lines: [{ categoryId: b.cat("Spenden"), amount: "1" }],
      }),
    );
    expect(message).toMatch(/Eingaben|Konto/);
  });
});

describe("Storno, Anfangsbestand, Filter", () => {
  it("Storno bekommt das Datum der Buchung, solange der Zeitraum offen ist", async () => {
    const { ctx, bank, cat } = await setup();
    // Am 1. Januar gibt es kein „gestern“ in diesem Kassenbuch.
    const offset =
      todayCalendarDate().getUTCMonth() > 0 || todayCalendarDate().getUTCDate() > 1 ? -1 : 0;
    const entry = await createEntry(ctx.board, {
      kind: "EXPENSE",
      accountId: bank.id,
      bookingDate: day(offset),
      description: "Getränke Sommerfest",
      lines: [{ categoryId: cat("Einkauf für Feste"), amount: "60,00" }],
    });
    await reverseEntry(ctx.board, { id: entry.id, reason: "falscher Monat" });
    const reversal = (await listEntries(ctx.board, { q: "Storno" })).entries[0]!;
    expect(toDateInputValue(reversal.bookingDate)).toBe(day(offset));
  });

  it("Girokonto: keine Buchung in der Zukunft", async () => {
    const { ctx, bank, cat } = await setup();
    const message = await failure(
      createEntry(ctx.board, {
        kind: "INCOME",
        accountId: bank.id,
        bookingDate: day(3),
        description: "Zuschuss kommt erst",
        lines: [{ categoryId: cat("Zuschüsse"), amount: "100,00" }],
      }),
    );
    expect(message).toMatch(/Buchungen gehen nur bis heute/);
  });

  it("Anfangsbestand korrigieren: Storno und neuer Bestand, Girokonto auch im Minus, Barkasse nicht", async () => {
    const { ctx, bank, cash, club } = await setup();
    expect(await correctOpening(ctx.board, { accountId: bank.id, amount: "-250,00" })).toEqual({
      amountCents: -25_000,
    });
    expect((await accountBalances(ctx.board)).get(bank.id)).toBe(-25_000);
    const openings = (await listEntries(ctx.board, { accountId: bank.id, pageSize: 50 })).entries;
    expect(openings.map((e) => [e.kind, e.amountCents, e.reversedBy !== null])).toEqual(
      expect.arrayContaining([
        ["OPENING", 100_000, true],
        ["REVERSAL", -100_000, false],
        ["OPENING", -25_000, false],
      ]),
    );
    // Gleicher Betrag: nichts passiert.
    await correctOpening(ctx.board, { accountId: bank.id, amount: "-250,00" });
    expect((await listEntries(ctx.board, { accountId: bank.id })).total).toBe(3);

    expect(
      await failure(correctOpening(ctx.board, { accountId: cash.id, amount: "-1,00" })),
    ).toMatch(/Barkasse|Eingaben/);
    // Den Anfangsbestand storniert man nicht von Hand.
    const current = openings.find((e) => e.kind === "OPENING" && !e.reversedBy)!;
    expect(current.canReverse).toBe(false);
    expect(await failure(reverseEntry(ctx.board, { id: current.id, reason: "weg damit" }))).toMatch(
      /Anfangsbestand korrigieren/,
    );
    // Anfangsbestände sind weder Einnahme noch Ausgabe.
    expect(await yearSummary(ctx.board, todayCalendarDate().getUTCFullYear())).toMatchObject({
      incomeCents: 0,
      expenseCents: 0,
    });
    const audit = await prisma.auditLog.findMany({
      where: { clubId: club.id, action: "finance.opening_corrected" },
    });
    expect(audit).toHaveLength(1);
  });

  it("gleichzeitige Korrekturen des Anfangsbestands: am Ende genau einer", async () => {
    const { ctx, bank } = await setup();
    await Promise.allSettled(
      ["10,00", "20,00", "30,00"].map((amount) =>
        correctOpening(ctx.board, { accountId: bank.id, amount }),
      ),
    );
    const active = (
      await listEntries(ctx.board, { accountId: bank.id, pageSize: 50 })
    ).entries.filter((e) => e.kind === "OPENING" && !e.reversedBy);
    expect(active).toHaveLength(1);
    expect((await accountBalances(ctx.board)).get(bank.id)).toBe(active[0]!.amountCents);
  });

  it("Summe im Filter zählt nur die passenden Zeilen einer aufgeteilten Buchung", async () => {
    const { ctx, bank, cat } = await setup();
    await createEntry(ctx.board, {
      kind: "EXPENSE",
      accountId: bank.id,
      bookingDate: day(),
      description: "Baumarkt",
      lines: [
        { categoryId: cat("Sportmaterial"), amount: "100,00" },
        { categoryId: cat("Büro und Porto"), amount: "20,50" },
      ],
    });
    const filtered = await listEntries(ctx.board, { categoryId: cat("Sportmaterial") });
    expect(filtered.total).toBe(1);
    expect(filtered.sumCents).toBe(-10_000);
    expect((await listEntries(ctx.board, { q: "Baumarkt" })).sumCents).toBe(-12_050);
  });

  it("Storno behält den steuerlichen Bereich der Buchung, auch wenn die Kategorie später geändert wird", async () => {
    const { ctx, bank, cat } = await setup();
    const entry = await createEntry(ctx.board, {
      kind: "INCOME",
      accountId: bank.id,
      bookingDate: day(),
      description: "Kuchenverkauf",
      lines: [{ categoryId: cat("Verkauf Speisen und Getränke"), amount: "80,00" }],
    });
    const before = (await listEntries(ctx.board, { q: "Kuchenverkauf" })).entries[0]!;
    const sphere = before.lines[0]!.sphere;
    await prisma.financeCategory.update({
      where: { id: cat("Verkauf Speisen und Getränke") },
      data: { sphere: sphere === "NON_PROFIT" ? "COMMERCIAL" : "NON_PROFIT" },
    });
    await reverseEntry(ctx.board, { id: entry.id, reason: "doppelt" });
    const reversal = (await listEntries(ctx.board, { q: "Storno" })).entries[0]!;
    expect(reversal.lines.map((l) => [l.sphere, l.amountCents])).toEqual([[sphere, -8_000]]);
  });
});
