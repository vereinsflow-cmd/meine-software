import { describe, expect, it } from "vitest";
import { addBerlinDays, toDateInputValue, todayCalendarDate } from "@/lib/dates";
import { toActionError } from "@/server/action";
import {
  createEntry,
  dailyBookingSums,
  listAccounts,
  listCategories,
  setupLedger,
} from "@/modules/finance/ledger";
import { getFinanceOverview, RECENT_ENTRIES } from "@/modules/finance/overview";
import { addUserToClub, contextFor, createClub } from "../helpers/factories";

/**
 * Daten der Finanz-Übersicht („Wie eine Banking-App“): Kontoverlauf je Tag aus einer Abfrage, „Zuletzt gebucht“, und ohne
 * Kassenbuch ein Leerzustand ohne erfundene Zahlen.
 */

/** Kalendertag als Eingabetext, relativ zu heute (Berlin). */
const day = (offset = 0) => toDateInputValue(addBerlinDays(new Date(), offset));
const DAY = 86_400_000;

async function club() {
  const created = await createClub("Übersichtsverein");
  const board = await addUserToClub(created, "BOARD");
  const member = await addUserToClub(created, "MEMBER");
  return {
    board: await contextFor(board.user.id, created.id),
    member: await contextFor(member.user.id, created.id),
  };
}

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return toActionError(error).message;
  }
  throw new Error("Es wurde ein Fehler erwartet.");
}

describe("Finanz-Übersicht", () => {
  it("ohne Kassenbuch: kein Verlauf, keine Buchungen, keine Konten – dafür „Kassenbuch einrichten“ unter „Das steht an“", async () => {
    const { board } = await club();
    const overview = await getFinanceOverview(board);
    expect(overview).toMatchObject({
      setup: null,
      balanceCurve: null,
      recent: null,
      accounts: [],
      year: null,
    });
    expect(overview.due.map((item) => item.key)).toContain("setup");
  });

  it("Kontoverlauf: Stand am Ende jedes Tages seit Beginn des Kassenbuchs, der letzte Wert ist der Kontostand", async () => {
    const { board } = await club();
    await setupLedger(board, {
      ledgerStartDate: day(-10),
      bankName: "Girokonto",
      bankOpening: "1.000,00",
      withCash: true,
      cashName: "Barkasse",
      cashOpening: "50,00",
    });
    const accounts = await listAccounts(board);
    const categories = await listCategories(board);
    const bank = accounts.find((a) => a.kind === "BANK")!;
    const cat = (name: string) => categories.find((c) => c.name === name)!.id;
    await createEntry(board, {
      kind: "INCOME",
      accountId: bank.id,
      bookingDate: day(-3),
      description: "Zuschuss Stadt",
      lines: [{ categoryId: cat("Zuschüsse"), amount: "500,00" }],
    });
    await createEntry(board, {
      kind: "EXPENSE",
      accountId: bank.id,
      bookingDate: day(-1),
      description: "Hallenmiete",
      lines: [{ categoryId: cat("Hallen- und Platzmiete"), amount: "120,50" }],
    });

    const overview = await getFinanceOverview(board);
    const curve = overview.balanceCurve!;
    // Das Kassenbuch begann vor zehn Tagen – vorher gibt es keinen Stand, der Verlauf beginnt mit ihm.
    expect(toDateInputValue(curve.from)).toBe(day(-10));
    expect(curve.values).toHaveLength(11);
    expect(curve.values[0]).toBe(105_000); // Anfangsbestände am ersten Tag
    expect(curve.values[6]).toBe(105_000); // vor dem Zuschuss
    expect(curve.values[7]).toBe(155_000);
    expect(curve.values[9]).toBe(155_000 - 12_050);
    expect(curve.values.at(-1)).toBe(overview.totalBalanceCents);

    // „Zuletzt gebucht“: neueste zuerst, höchstens RECENT_ENTRIES – hier alle vier (zwei Anfangsbestände)
    expect(overview.recent!.total).toBe(4);
    expect(overview.recent!.entries.length).toBeLessThanOrEqual(RECENT_ENTRIES);
    expect(overview.recent!.entries.map((entry) => entry.description).slice(0, 2)).toEqual([
      "Hallenmiete",
      "Zuschuss Stadt",
    ]);

    // Grundlage: eine Summe je Buchungstag (alle Konten), nichts nach dem Stichtag
    const sums = await dailyBookingSums(board, todayCalendarDate());
    expect(sums.map((sum) => [toDateInputValue(sum.date), sum.cents])).toEqual([
      [day(-10), 105_000],
      [day(-3), 50_000],
      [day(-1), -12_050],
    ]);
    const yesterday = new Date(todayCalendarDate().getTime() - 2 * DAY);
    expect((await dailyBookingSums(board, yesterday)).map((sum) => sum.cents)).toEqual([
      105_000, 50_000,
    ]);
  });

  it("eine Buchung mit Datum morgen weist die Datenbank ab – der Verlauf endet deshalb immer beim Kontostand", async () => {
    const { board } = await club();
    await setupLedger(board, {
      ledgerStartDate: day(-5),
      bankName: "Girokonto",
      bankOpening: "1.000,00",
      withCash: false,
    });
    const [bank] = await listAccounts(board);
    const categories = await listCategories(board);
    const tomorrow = createEntry(board, {
      kind: "EXPENSE",
      accountId: bank!.id,
      bookingDate: day(1),
      description: "Hallenmiete November",
      lines: [
        {
          categoryId: categories.find((c) => c.name === "Hallen- und Platzmiete")!.id,
          amount: "200,00",
        },
      ],
    });
    expect(await failure(tomorrow)).toMatch(/nur bis heute/);

    const overview = await getFinanceOverview(board);
    expect(overview.totalBalanceCents).toBe(100_000);
    expect(overview.balanceCurve!.values.at(-1)).toBe(overview.totalBalanceCents);
  });

  it("nur mit Finanzrechten", async () => {
    const { member } = await club();
    expect(await failure(getFinanceOverview(member))).toMatch(/Berechtigung/);
    expect(await failure(dailyBookingSums(member, todayCalendarDate()))).toMatch(/Berechtigung/);
  });
});
