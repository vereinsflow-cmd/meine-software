import { describe, expect, it } from "vitest";
import { addBerlinDays, toDateInputValue, todayCalendarDate } from "@/lib/dates";
import { prisma } from "@/server/db/client";
import { toActionError } from "@/server/action";
import { assignDonation, recordDonation } from "@/modules/donations/service";
import {
  createEntry,
  listAccounts,
  listCategories,
  reverseEntry,
  setupLedger,
} from "@/modules/finance/ledger";
import { addUserToClub, contextFor, createClub, createMember } from "../helpers/factories";

/**
 * Gleichzeitige Abläufe rund um Spenden: keine Verklemmung zwischen „Spende erfassen“ und einem Storno (K2), kein
 * doppelter Spender bei zwei gleichzeitigen ersten Spenden eines Mitglieds (K18), keine doppelte Zuordnung einer Buchung.
 */
const day = (offset = 0) => toDateInputValue(addBerlinDays(new Date(), offset));

async function setup() {
  const club = await createClub("Wettlaufverein");
  const board = await addUserToClub(club, "BOARD");
  const ctx = await contextFor(board.user.id, club.id);
  await setupLedger(ctx, {
    ledgerStartDate: `${todayCalendarDate().getUTCFullYear()}-01-01`,
    bankName: "Girokonto",
    bankOpening: "1.000,00",
    withCash: true,
    cashName: "Barkasse",
    cashOpening: "500,00",
  });
  const accounts = await listAccounts(ctx);
  const categories = await listCategories(ctx);
  const bank = accounts.find((a) => a.kind === "BANK")!;
  const cash = accounts.find((a) => a.kind === "CASH")!;
  const spenden = categories.find((c) => c.systemKey === "DONATIONS")!.id;
  const member = await createMember(club.id, { firstName: "Karin", lastName: "Vogel" });
  return { club, ctx, bank, cash, spenden, member };
}

const reasons = (results: PromiseSettledResult<unknown>[]) =>
  results.flatMap((r) => (r.status === "rejected" ? [toActionError(r.reason).message] : []));

describe("Spenden unter Last", () => {
  it("„Spende erfassen“ gegen das Storno einer anderen Spenden-Buchung: 20 Runden ohne Verklemmung (K2)", async () => {
    const { club, ctx, bank, cash, spenden, member } = await setup();
    const rounds = 20;
    const toReverse: string[] = [];
    for (let i = 0; i < rounds; i++) {
      const created = await createEntry(ctx, {
        kind: "INCOME",
        accountId: i % 2 === 0 ? bank.id : cash.id,
        bookingDate: day(),
        description: `Spende ${i}`,
        lines: [{ categoryId: spenden, amount: "10,00" }],
      });
      toReverse.push(created.id);
    }
    const failures: string[] = [];
    for (let i = 0; i < rounds; i++) {
      const results = await Promise.allSettled([
        recordDonation(ctx, {
          kind: "MONEY",
          donorMode: "MEMBER",
          memberId: member.id,
          amount: "25,00",
          receivedOn: day(),
          accountId: i % 2 === 0 ? cash.id : bank.id,
          target: "frei",
        }),
        reverseEntry(ctx, { id: toReverse[i]!, reason: "Rückbuchung" }),
      ]);
      failures.push(...reasons(results));
    }
    expect(failures).toEqual([]);
    expect(await prisma.donation.count({ where: { clubId: club.id } })).toBe(rounds);
    expect(await prisma.donor.count({ where: { clubId: club.id } })).toBe(1);
  });

  it("zwei gleichzeitige erste Spenden desselben Mitglieds: beide gespeichert, ein Spender (K18)", async () => {
    const { club, ctx, bank, member } = await setup();
    const results = await Promise.allSettled(
      [1, 2, 3].map(() =>
        recordDonation(ctx, {
          kind: "MONEY",
          donorMode: "MEMBER",
          memberId: member.id,
          amount: "50,00",
          receivedOn: day(),
          accountId: bank.id,
          target: "frei",
        }),
      ),
    );
    expect(reasons(results)).toEqual([]);
    expect(await prisma.donor.count({ where: { clubId: club.id, memberId: member.id } })).toBe(1);
    expect(await prisma.donation.count({ where: { clubId: club.id } })).toBe(3);
  });

  it("dieselbe Buchung in zwei Fenstern gleichzeitig kennzeichnen: genau eine Spende, verständliche Meldung", async () => {
    const { club, ctx, bank, spenden, member } = await setup();
    const entry = await createEntry(ctx, {
      kind: "INCOME",
      accountId: bank.id,
      bookingDate: day(),
      description: "Spende",
      lines: [{ categoryId: spenden, amount: "80,00" }],
    });
    const line = await prisma.ledgerLine.findFirstOrThrow({ where: { entryId: entry.id } });
    const results = await Promise.allSettled([
      assignDonation(ctx, { ledgerLineId: line.id, donorMode: "MEMBER", memberId: member.id }),
      assignDonation(ctx, {
        ledgerLineId: line.id,
        donorMode: "ANONYMOUS",
        anonymousLabel: "Spendendose Theke",
      }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(reasons(results)).toEqual(["Diese Buchung ist schon als Spende gekennzeichnet."]);
    expect(await prisma.donation.count({ where: { clubId: club.id } })).toBe(1);
  });
});
