import { describe, expect, it } from "vitest";
import {
  addBerlinDays,
  formatEuroFromCents,
  toDateInputValue,
  todayCalendarDate,
} from "@/lib/dates";
import { prisma } from "@/server/db/client";
import { toActionError } from "@/server/action";
import type { TenantContext } from "@/server/tenancy/context-core";
import { deleteDepartment } from "@/modules/departments/service";
import {
  assignDonation,
  createDonor,
  deleteDonor,
  getAssignDonationDefaults,
  getDonationsPage,
  getTaxSettings,
  listDonations,
  listDonors,
  recordDonation,
  restrictDonor,
  unassignDonation,
  updateDonation,
  updateDonor,
  updateTaxSettings,
  voidDonation,
} from "@/modules/donations/service";
import { closePeriod } from "@/modules/finance/closing";
import {
  correctEntry,
  createEntry,
  getEntry,
  listAccounts,
  listCategories,
  reverseEntry,
  setupLedger,
} from "@/modules/finance/ledger";
import {
  addUserToClub,
  contextFor,
  createClub,
  createDepartment,
  createMember,
} from "../helpers/factories";

/** Kalendertag als Eingabetext, relativ zu heute (Berlin). */
const day = (offset = 0) => toDateInputValue(addBerlinDays(new Date(), offset));
const thisYear = () => todayCalendarDate().getUTCFullYear();

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const mapped = toActionError(error);
    return mapped.fieldErrors
      ? `${mapped.message} ${JSON.stringify(mapped.fieldErrors)}`
      : mapped.message;
  }
  throw new Error("Es wurde ein Fehler erwartet.");
}

/** Datenbankfehler samt Details (Name der Prüfregel steht je nach Treiber in der Meldung oder in `meta`). */
async function dbError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const e = error as { message?: string; meta?: unknown };
    return `${e.message ?? ""} ${JSON.stringify(e.meta ?? {})}`;
  }
  throw new Error("Es wurde ein Fehler erwartet.");
}

/** `@db.Date` (UTC-Mitternacht) `offset` Tage ab heute (Berlin). */
const calendar = (offset: number) => new Date(todayCalendarDate().getTime() + offset * 86_400_000);

async function setup(name = "Spendenverein", ledgerStart = `${thisYear()}-01-01`) {
  const club = await createClub(name);
  const board = await addUserToClub(club, "BOARD");
  const member = await addUserToClub(club, "MEMBER");
  const ctx = {
    board: await contextFor(board.user.id, club.id),
    member: await contextFor(member.user.id, club.id),
  };
  await setupLedger(ctx.board, {
    ledgerStartDate: ledgerStart,
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
  const cat = (n: string) => categories.find((c) => c.name === n)!.id;
  const jugend = await createDepartment(club.id, "Jugendabteilung");
  const marta = await createMember(club.id, { firstName: "Marta", lastName: "Wolff" });
  await prisma.member.update({
    where: { id: marta.id },
    data: { street: "Lindenweg 7", postalCode: "12345", city: "Musterstadt" },
  });
  const money = (over: Record<string, unknown> = {}) => ({
    kind: "MONEY",
    donorMode: "MEMBER",
    memberId: marta.id,
    amount: "350,00",
    receivedOn: day(),
    accountId: bank.id,
    target: "frei",
    ...over,
  });
  /** Einnahme „Spenden“ über „Neue Buchung“ (ohne Spender). */
  const donationEntry = async (amount = "50,00", extra: Record<string, unknown> = {}) => {
    const created = await createEntry(ctx.board, {
      kind: "INCOME",
      accountId: bank.id,
      bookingDate: day(),
      description: "Spende",
      lines: [{ categoryId: cat("Spenden"), amount }],
      ...extra,
    });
    const line = await prisma.ledgerLine.findFirstOrThrow({ where: { entryId: created.id } });
    return { ...created, lineId: line.id };
  };
  return {
    club,
    ctx,
    people: { board, member },
    bank,
    cash,
    cat,
    jugend,
    marta,
    money,
    donationEntry,
  };
}

const auditActions = async (clubId: string) =>
  (await prisma.auditLog.findMany({ where: { clubId }, orderBy: { createdAt: "asc" } }))
    .map((a) => a.action)
    .filter((a) => a.startsWith("finance.") && a !== "finance.setup_completed");

describe("Geldspende erfassen", () => {
  it("Buchung, Zeile und Spende in einer Transaktion – Betrag, Tag und Zweck stehen im Kassenbuch", async () => {
    const { club, ctx, jugend, marta, money } = await setup();
    const result = await recordDonation(
      ctx.board,
      money({ target: `a:${jugend.id}`, purposeText: "Trikots" }),
    );
    expect(result.label).toMatch(/^\d{4}-0003$/); // 1 und 2 sind die Anfangsbestände
    const entry = await getEntry(ctx.board, result.entryId!);
    expect(entry).toMatchObject({
      amountCents: 35_000,
      description: "Spende für Trikots",
      counterpartyName: "Marta Wolff",
      counterpartyMember: { id: marta.id },
      donationLines: [{ amountCents: 35_000, donationId: result.donationId }],
      canAssignDonation: false,
    });
    expect(entry.lines[0]).toMatchObject({
      categoryName: "Spenden",
      department: { id: jugend.id },
      note: "Trikots",
    });
    const donation = await prisma.donation.findUniqueOrThrow({ where: { id: result.donationId } });
    expect(donation).toMatchObject({
      kind: "MONEY",
      amountCents: 35_000,
      paymentMethod: "TRANSFER", // Vorgabe aus dem Bankkonto
      departmentId: jugend.id,
      purposeText: "Trikots",
    });
    expect(toDateInputValue(donation.receivedOn)).toBe(day());
    expect(await auditActions(club.id)).toEqual([
      "finance.entry_created",
      "finance.donation_recorded",
    ]);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { clubId: club.id, action: "finance.donation_recorded" },
    });
    expect(audit.summary).toBe(
      `Spende erfasst: ${formatEuroFromCents(35_000)} (Buchung ${result.label})`,
    );
    expect(audit.summary).not.toMatch(/Wolff/);
  });

  it("Betrag, Tag, Abteilung und Veranstaltung setzt die Datenbank aus der Zeile – auch wenn jemand andere schickt", async () => {
    const { club, ctx, jugend, donationEntry } = await setup();
    const entry = await donationEntry("50,00");
    const created = await prisma.donation.create({
      data: {
        clubId: club.id,
        kind: "MONEY",
        anonymousLabel: "Spendendose Theke",
        ledgerLineId: entry.lineId,
        receivedOn: new Date(Date.UTC(2020, 0, 1)),
        amountCents: 1,
        paymentMethod: "CASH",
        departmentId: jugend.id,
        createdById: ctx.board.userId,
      },
    });
    expect(created).toMatchObject({ amountCents: 5_000, departmentId: null });
    expect(toDateInputValue(created.receivedOn)).toBe(day());
  });

  it("Spendendose (ohne Namen, Barkasse): „nicht möglich“; bar übergeben 50 € → nötig, Überweisung 50 € → nicht nötig (K1)", async () => {
    const { ctx, bank, cash, money } = await setup();
    await recordDonation(
      ctx.board,
      money({
        donorMode: "ANONYMOUS",
        memberId: undefined,
        anonymousLabel: "Spendendose Theke",
        amount: "47,60",
        accountId: cash.id,
      }),
    );
    const transfer = await recordDonation(ctx.board, money({ amount: "50,00" }));
    // Bar übergeben, vom Kassenwart auf dem Girokonto gebucht.
    const cashOnBank = await recordDonation(
      ctx.board,
      money({ amount: "50,00", accountId: bank.id, paymentMethod: "CASH" }),
    );
    const list = await listDonations(ctx.board, { year: thisYear() });
    const state = (id: string) => list.rows.find((r) => r.donationId === id)!.state;
    expect(list.rows.find((r) => r.name === "Spendendose Theke")).toMatchObject({
      state: "ANONYMOUS",
      typeLabel: "ohne Namen",
      paymentMethod: "CASH",
    });
    expect(state(transfer.donationId)).toBe("SIMPLIFIED");
    expect(state(cashOnBank.donationId)).toBe("NEEDED");
  });

  it("neuer Spender: Firma mit Anschrift; Dublette (gleicher Name und PLZ) wird abgelehnt; Protokoll ohne Namen", async () => {
    const { club, ctx, money } = await setup();
    const newDonor = {
      donorMode: "NEW",
      memberId: undefined,
      donorKind: "COMPANY",
      donorName: "Autohaus  Brinkmann GmbH",
      street: "Industriestraße 4",
      postalCode: "12345",
      city: "Musterstadt",
    };
    await recordDonation(ctx.board, money({ ...newDonor, amount: "750,00" }));
    const donor = await prisma.donor.findFirstOrThrow({ where: { clubId: club.id } });
    expect(donor).toMatchObject({
      kind: "COMPANY",
      name: "Autohaus Brinkmann GmbH",
      memberId: null,
    });
    expect(
      await failure(
        recordDonation(ctx.board, money({ ...newDonor, donorName: "autohaus brinkmann gmbh" })),
      ),
    ).toMatch(/Diesen Spender gibt es schon/);
    // Vorhandenen Spender wählen geht.
    await recordDonation(
      ctx.board,
      money({ donorMode: "DONOR", memberId: undefined, donorId: donor.id }),
    );
    const created = await prisma.auditLog.findFirstOrThrow({
      where: { clubId: club.id, action: "finance.donor_created" },
    });
    expect(created.summary).toBe("Spender angelegt (Firma)");
  });

  it("Geldspende im abgeschlossenen Monat wird nicht gebucht; ohne Kassenbuch gibt es keine Spenden", async () => {
    const today = todayCalendarDate();
    const prev = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    const { ctx, money, donationEntry } = await setup("Abschlussverein", toDateInputValue(prev));
    const old = await donationEntry("30,00", { bookingDate: toDateInputValue(prev) });
    await closePeriod(ctx.board, { month: toDateInputValue(prev).slice(0, 7) });
    expect(
      await failure(recordDonation(ctx.board, money({ receivedOn: toDateInputValue(prev) }))),
    ).toMatch(/abgeschlossen/);
    // Zuordnen geht auch im abgeschlossenen Monat (es wird nichts gebucht).
    await assignDonation(ctx.board, {
      ledgerLineId: old.lineId,
      donorMode: "ANONYMOUS",
      anonymousLabel: "Spendendose Vereinsheim",
    });

    const other = await createClub("Ohne Kassenbuch");
    const board = await addUserToClub(other, "BOARD");
    const otherCtx = await contextFor(board.user.id, other.id);
    const someone = await createMember(other.id);
    expect(
      await failure(
        recordDonation(otherCtx, {
          kind: "IN_KIND",
          donorMode: "MEMBER",
          memberId: someone.id,
          amount: "10,00",
          receivedOn: day(),
          target: "frei",
          itemDescription: "Ein Satz Bälle, neu, Kaufpreis 10 €",
          inKindOrigin: "PRIVATE",
        }),
      ),
    ).toMatch(/richte zuerst das Kassenbuch ein/);
  });
});

describe("Als Spende kennzeichnen", () => {
  it("ordnet eine Spenden-Buchung zu; Vorbelegung aus dem Namen; zweite Zuordnung wird abgelehnt", async () => {
    const { club, ctx, marta, donationEntry } = await setup();
    const entry = await donationEntry("120,00", { counterparty: "Marta Wolff" });
    const before = await getEntry(ctx.board, entry.id);
    expect(before).toMatchObject({
      canAssignDonation: true,
      donationLines: [{ lineId: entry.lineId, donationId: null }],
    });
    expect((await getDonationsPage(ctx.board, thisYear())).due.map((d) => d.key)).toContain(
      "unassigned",
    );
    const defaults = await getAssignDonationDefaults(ctx.board, entry.lineId);
    expect(defaults).toMatchObject({
      suggestion: { donorMode: "MEMBER", memberId: marta.id },
      paymentMethod: "TRANSFER",
      line: { amountCents: 12_000, accountName: "Girokonto" },
    });
    const other = await donationEntry("10,00", { counterparty: "Erika Muster" });
    expect((await getAssignDonationDefaults(ctx.board, other.lineId)).suggestion).toEqual({
      donorMode: "NEW",
      donorName: "Erika Muster",
    });

    await assignDonation(ctx.board, {
      ledgerLineId: entry.lineId,
      donorMode: "MEMBER",
      memberId: marta.id,
      purposeText: "Vereinsheim",
    });
    expect(await getEntry(ctx.board, entry.id)).toMatchObject({ canAssignDonation: false });
    expect(
      await failure(
        assignDonation(ctx.board, {
          ledgerLineId: entry.lineId,
          donorMode: "ANONYMOUS",
          anonymousLabel: "Spendendose",
        }),
      ),
    ).toBe("Diese Buchung ist schon als Spende gekennzeichnet.");
    // Ohne Dienst (zweites Fenster, gleichzeitig): der Unique-Index meldet sich verständlich.
    const direct = await failure(
      prisma.donation.create({
        data: {
          clubId: club.id,
          kind: "MONEY",
          anonymousLabel: "Spendendose",
          ledgerLineId: entry.lineId,
          receivedOn: new Date(),
          amountCents: 1,
          paymentMethod: "CASH",
          createdById: ctx.board.userId,
        },
      }),
    );
    expect(direct).toBe("Diese Buchung ist schon als Spende gekennzeichnet.");
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { clubId: club.id, action: "finance.donation_recorded" },
    });
    expect(audit.summary).toMatch(
      new RegExp(`^Spende zugeordnet: ${formatEuroFromCents(12_000)} \\(Buchung \\d{4}-\\d{4}\\)$`),
    );
  });

  it("falsche Kategorie, Storno-Buchung und stornierte Buchung → DONATION_INVALID", async () => {
    const { club, ctx, bank, cat, donationEntry } = await setup();
    const grant = await createEntry(ctx.board, {
      kind: "INCOME",
      accountId: bank.id,
      bookingDate: day(),
      description: "Zuschuss",
      lines: [{ categoryId: cat("Zuschüsse"), amount: "500,00" }],
    });
    const grantLine = await prisma.ledgerLine.findFirstOrThrow({ where: { entryId: grant.id } });
    const assign = (ledgerLineId: string) =>
      assignDonation(ctx.board, { ledgerLineId, donorMode: "ANONYMOUS", anonymousLabel: "Dose" });
    expect(await failure(assign(grantLine.id))).toMatch(/Kategorie „Spenden“/);

    const reversed = await donationEntry("40,00");
    await reverseEntry(ctx.board, { id: reversed.id, reason: "falsch gebucht" });
    expect(await failure(assign(reversed.lineId))).toMatch(/storniert/);
    const reversal = await prisma.ledgerEntry.findFirstOrThrow({
      where: { reversalOfId: reversed.id },
      include: { lines: true },
    });
    expect(await failure(assign(reversal.lines[0]!.id))).toMatch(/Spende/);

    // Auch an den Diensten vorbei hält die Datenbank stand.
    const raw = (ledgerLineId: string) =>
      prisma.donation.create({
        data: {
          clubId: club.id,
          kind: "MONEY",
          anonymousLabel: "Dose",
          ledgerLineId,
          receivedOn: new Date(),
          amountCents: 1,
          paymentMethod: "CASH",
          createdById: ctx.board.userId,
        },
      });
    await expect(raw(grantLine.id)).rejects.toThrow(/DONATION_INVALID/);
    await expect(raw(reversed.lineId)).rejects.toThrow(/DONATION_INVALID/);
    await expect(raw(reversal.lines[0]!.id)).rejects.toThrow(/DONATION_INVALID/);
  });
});

describe("Datenbank sichert Spenden ab (rohes SQL)", () => {
  it("Geld: Betrag, Tag und Abteilung fest (K3), Text-Zweck änderbar; Sachspende nicht löschbar; Spendendose nie als Sachspende", async () => {
    const { club, ctx, jugend, marta, money } = await setup();
    const { donationId } = await recordDonation(ctx.board, money());
    const update = (data: Record<string, unknown>) =>
      prisma.donation.update({ where: { id: donationId }, data });
    await expect(update({ amountCents: 100 })).rejects.toThrow(/DONATION_LOCKED/);
    await expect(update({ receivedOn: new Date(Date.UTC(2020, 0, 1)) })).rejects.toThrow(
      /DONATION_LOCKED/,
    );
    await expect(update({ departmentId: jugend.id })).rejects.toThrow(/DONATION_LOCKED/);
    await expect(update({ kind: "IN_KIND" })).rejects.toThrow(/DONATION_LOCKED/);
    await update({ purposeText: "Vereinsheim" });

    const inKind = await recordDonation(ctx.board, {
      kind: "IN_KIND",
      donorMode: "MEMBER",
      memberId: marta.id,
      amount: "180,00",
      receivedOn: day(),
      target: "frei",
      itemDescription: "12 Kisten Mineralwasser, neu, für das Jugendturnier",
      inKindOrigin: "BUSINESS",
    });
    expect(inKind.entryId).toBeNull();
    await expect(prisma.donation.delete({ where: { id: inKind.donationId } })).rejects.toThrow(
      /DONATION_LOCKED/,
    );
    // Spendendose als Sachspende: Prüfregel Donation_donor_chk.
    expect(
      await dbError(
        prisma.donation.create({
          data: {
            clubId: club.id,
            kind: "IN_KIND",
            anonymousLabel: "Spendendose Theke",
            receivedOn: todayCalendarDate(),
            amountCents: 1_000,
            itemDescription: "Ein Karton Bälle, neu",
            inKindOrigin: "PRIVATE",
            createdById: ctx.board.userId,
          },
        }),
      ),
    ).toMatch(/Donation_donor_chk/);
  });

  it("Aufwandsspende: Anspruch nach Beginn der Tätigkeit bzw. Verzicht vor ihrem Ende → Prüfregel (K13)", async () => {
    const { club, ctx, marta } = await setup();
    const donor = await prisma.donor.create({
      data: { clubId: club.id, memberId: marta.id, createdById: ctx.board.userId },
    });
    const raw = (dates: { granted: number; from: number; to: number; due: number }) =>
      prisma.donation.create({
        data: {
          clubId: club.id,
          kind: "EXPENSE_WAIVER",
          donorId: donor.id,
          receivedOn: todayCalendarDate(),
          amountCents: 24_000,
          activityText: "Fahrten zu Auswärtsspielen",
          waiverBasis: "STATUTE",
          claimGrantedOn: calendar(dates.granted),
          activityFrom: calendar(dates.from),
          activityTo: calendar(dates.to),
          claimDueOn: calendar(dates.due),
          claimConfirmedAt: new Date(),
          createdById: ctx.board.userId,
        },
      });
    expect(await dbError(raw({ granted: -10, from: -20, to: -5, due: -1 }))).toMatch(
      /Donation_waiver_chk/,
    );
    expect(await dbError(raw({ granted: -30, from: -20, to: 2, due: 3 }))).toMatch(
      /Donation_waiver_chk/,
    );
    await raw({ granted: -30, from: -20, to: -5, due: -1 });
  });
});

describe("Sach- und Aufwandsspenden", () => {
  it("Sachspende: Zukunft und vor Beginn des Kassenbuchs abgelehnt, Pflichtfelder, stornieren mit Grund", async () => {
    const { ctx, marta } = await setup();
    const inKind = (over: Record<string, unknown> = {}) => ({
      kind: "IN_KIND",
      donorMode: "MEMBER",
      memberId: marta.id,
      amount: "180,00",
      receivedOn: day(),
      target: "frei",
      itemDescription: "12 Kisten Mineralwasser, neu, für das Jugendturnier",
      inKindOrigin: "BUSINESS",
      ...over,
    });
    expect(await failure(recordDonation(ctx.board, inKind({ receivedOn: day(1) })))).toMatch(
      /Zukunft/,
    );
    expect(
      await failure(recordDonation(ctx.board, inKind({ receivedOn: `${thisYear() - 1}-12-31` }))),
    ).toMatch(/Das Kassenbuch beginnt am/);
    expect(
      await failure(
        recordDonation(ctx.board, inKind({ itemDescription: "Wasser", inKindOrigin: "" })),
      ),
    ).toMatch(/itemDescription.*inKindOrigin/);
    const entriesBefore = await prisma.ledgerEntry.count({ where: { clubId: ctx.board.clubId } });
    const { donationId } = await recordDonation(ctx.board, inKind());
    expect(await prisma.ledgerEntry.count({ where: { clubId: ctx.board.clubId } })).toBe(
      entriesBefore,
    );
    expect((await getDonationsPage(ctx.board, thisYear())).kpi).toMatchObject({
      totalCents: 18_000,
      byKind: { IN_KIND: 18_000 },
    });

    expect(await failure(voidDonation(ctx.board, { id: donationId, reason: "" }))).toMatch(/Grund/);
    await voidDonation(ctx.board, { id: donationId, reason: "Doppelt erfasst" });
    expect(await failure(voidDonation(ctx.board, { id: donationId, reason: "noch mal" }))).toMatch(
      /storniert/,
    );
    await expect(
      prisma.donation.update({ where: { id: donationId }, data: { note: "später" } }),
    ).rejects.toThrow(/DONATION_LOCKED/);
    const page = await getDonationsPage(ctx.board, thisYear());
    expect(page.kpi).toMatchObject({ totalCents: 0, count: 0 });
    const voided = await listDonations(ctx.board, { year: thisYear(), status: "storniert" });
    expect(voided.rows).toHaveLength(1);
    expect(voided.rows[0]).toMatchObject({ state: "VOID", voidReason: "Doppelt erfasst" });
  });

  it("Aufwandsspende: Bestätigung des Anspruchs an der Spende; verspäteter Verzicht wird abgelehnt", async () => {
    const { ctx, marta } = await setup();
    const waiver = (over: Record<string, unknown> = {}) => ({
      kind: "EXPENSE_WAIVER",
      donorMode: "MEMBER",
      memberId: marta.id,
      amount: "240,00",
      receivedOn: day(),
      target: "frei",
      activityText: "Fahrten zu Auswärtsspielen der D-Jugend, 800 km × 0,30 €",
      waiverBasis: "STATUTE",
      claimGrantedOn: day(-60),
      activityFrom: day(-30),
      activityTo: day(-2),
      claimDueOn: day(-1),
      claimConfirmed: true,
      ...over,
    });
    expect(
      await failure(
        recordDonation(
          ctx.board,
          waiver({
            claimGrantedOn: day(-160),
            activityFrom: day(-130),
            activityTo: day(-100),
            claimDueOn: day(-100),
          }),
        ),
      ),
    ).toMatch(/zu spät/);
    expect(await failure(recordDonation(ctx.board, waiver({ claimConfirmed: false })))).toMatch(
      /claimConfirmed/,
    );
    const { donationId } = await recordDonation(ctx.board, waiver());
    const donation = await prisma.donation.findUniqueOrThrow({ where: { id: donationId } });
    expect(donation.claimConfirmedAt).not.toBeNull();
    expect(donation.claimConfirmedById).toBe(ctx.board.userId);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: donationId, action: "finance.donation_recorded" },
    });
    expect(audit.summary).toBe(
      `Aufwandsspende erfasst: ${formatEuroFromCents(24_000)} – Anspruch bestätigt`,
    );
  });
});

describe("Storno und Korrektur der Buchung", () => {
  it("Storno: Spende „storniert“, Summen sinken; „Korrigieren“ übernimmt die Spende auf die neue Zeile", async () => {
    const { club, ctx, bank, cat, marta, money } = await setup();
    const first = await recordDonation(
      ctx.board,
      money({
        purposeText: "Vereinsheim",
        target: "andere",
        paymentMethod: "CASH",
        receiptWish: "WANTED",
      }),
    );
    const second = await recordDonation(ctx.board, money({ amount: "100,00" }));
    expect((await getDonationsPage(ctx.board, thisYear())).kpi.totalCents).toBe(45_000);

    await reverseEntry(ctx.board, { id: second.entryId!, reason: "Rückbuchung der Bank" });
    const page = await getDonationsPage(ctx.board, thisYear());
    expect(page.kpi).toMatchObject({ totalCents: 35_000, count: 1 });
    const storniert = await listDonations(ctx.board, { year: thisYear(), status: "storniert" });
    expect(storniert.rows.map((r) => r.donationId)).toEqual([second.donationId]);

    const corrected = await correctEntry(ctx.board, {
      id: first.entryId!,
      reason: "Betrag falsch",
      entry: {
        kind: "INCOME",
        accountId: bank.id,
        bookingDate: day(),
        description: "Spende für Vereinsheim",
        counterpartyMemberId: marta.id,
        lines: [{ categoryId: cat("Spenden"), amount: "400,00" }],
      },
    });
    const list = await listDonations(ctx.board, { year: thisYear() });
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0]).toMatchObject({
      amountCents: 40_000,
      entry: { id: corrected.id },
      donor: { memberId: marta.id },
      purpose: { label: "Vereinsheim" },
      paymentMethod: "CASH",
      receiptWish: "WANTED",
      state: "NEEDED",
    });
    expect(
      await prisma.auditLog.count({
        where: {
          clubId: club.id,
          action: "finance.donation_recorded",
          summary: { contains: "übernommen" },
        },
      }),
    ).toBe(1);
  });
});

describe("Ändern und Kennzeichnung zurücknehmen", () => {
  it("Text-Zweck und Zahlart ändern (Protokoll alt/neu), Spender wechseln (nur „geändert“)", async () => {
    const { club, ctx, money } = await setup();
    const { donationId } = await recordDonation(
      ctx.board,
      money({ purposeText: "Trikots", target: "andere" }),
    );
    const other = await createMember(club.id, { firstName: "Ben", lastName: "Koch" });
    await updateDonation(ctx.board, {
      id: donationId,
      kind: "MONEY",
      donorMode: "MEMBER",
      memberId: other.id,
      target: "andere",
      purposeText: "Vereinsheim",
      paymentMethod: "CASH",
      // Bei Geld kommen Betrag und Tag aus der Buchung – ein anderer Betrag wird nicht übernommen.
      amount: "1,00",
    });
    const donation = await prisma.donation.findUniqueOrThrow({
      where: { id: donationId },
      include: { donor: true },
    });
    expect(donation).toMatchObject({
      purposeText: "Vereinsheim",
      paymentMethod: "CASH",
      amountCents: 35_000,
      donor: { memberId: other.id },
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { clubId: club.id, action: "finance.donation_updated" },
    });
    expect(audit.changes).toMatchObject({
      zweck: { from: "Trikots", to: "Vereinsheim" },
      zahlart: { from: "Überweisung", to: "bar übergeben" },
      spender: { changed: true },
    });
    expect(JSON.stringify(audit)).not.toMatch(/Koch|Wolff/);
  });

  it("Kennzeichnung zurücknehmen: Spende weg, Buchung bleibt („Spender fehlt“); Sachspende nur stornieren", async () => {
    const { ctx, marta, money } = await setup();
    const { donationId, entryId } = await recordDonation(ctx.board, money());
    await unassignDonation(ctx.board, { id: donationId });
    expect(await prisma.donation.count({ where: { id: donationId } })).toBe(0);
    expect(await getEntry(ctx.board, entryId!)).toMatchObject({ canAssignDonation: true });
    const page = await getDonationsPage(ctx.board, thisYear());
    expect(page.kpi).toMatchObject({ totalCents: 35_000, count: 1, donorCount: 0 });
    expect(page.latest[0]).toMatchObject({ state: "NO_DONOR" });

    const inKind = await recordDonation(ctx.board, {
      kind: "IN_KIND",
      donorMode: "MEMBER",
      memberId: marta.id,
      amount: "50,00",
      receivedOn: day(),
      target: "frei",
      itemDescription: "Ein Satz Leibchen, gebraucht, guter Zustand",
      inKindOrigin: "PRIVATE",
    });
    expect(await failure(unassignDonation(ctx.board, { id: inKind.donationId }))).toMatch(
      /storniere sie/,
    );
  });
});

describe("Spender pflegen", () => {
  it("anlegen, ändern (Protokoll ohne Anschrift, K16), sperren, löschen nur ohne Spenden", async () => {
    const { club, ctx, money } = await setup();
    const { id } = await createDonor(ctx.board, {
      kind: "COMPANY",
      name: "Getränke Jansen e.K.",
      street: "Bahnhofstraße 12",
      postalCode: "12345",
      city: "Musterstadt",
    });
    await updateDonor(ctx.board, {
      id,
      kind: "COMPANY",
      name: "Getränke Jansen e.K.",
      street: "Bahnhofstraße 14",
      postalCode: "12345",
      city: "Musterstadt",
    });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { clubId: club.id, action: "finance.donor_updated" },
    });
    expect(audit.changes).toEqual({ strasse: { changed: true } });
    expect(JSON.stringify(audit)).not.toMatch(/Bahnhof|Jansen/);

    await recordDonation(
      ctx.board,
      money({ donorMode: "DONOR", memberId: undefined, donorId: id }),
    );
    const donors = await listDonors(ctx.board, { year: thisYear() });
    expect(donors.donors.find((d) => d.id === id)).toMatchObject({
      name: "Getränke Jansen e.K.",
      count: 1,
      totalCents: 35_000,
      receiptState: "MISSING",
      actions: { edit: true, restrict: true, delete: false },
    });
    expect(await failure(deleteDonor(ctx.board, { id }))).toMatch(/Sperre ihn stattdessen/);
    await restrictDonor(ctx.board, { id, reason: "Widerspruch des Spenders" });
    expect(
      await failure(
        recordDonation(ctx.board, money({ donorMode: "DONOR", memberId: undefined, donorId: id })),
      ),
    ).toMatch(/gesperrt/);
    const restricted = await listDonations(ctx.board, { year: thisYear() });
    expect(restricted.rows[0]).toMatchObject({ state: "RESTRICTED", actions: { edit: false } });

    const unused = await createDonor(ctx.board, { kind: "PERSON", name: "Erika Muster" });
    await deleteDonor(ctx.board, { id: unused.id });
    expect(await prisma.donor.count({ where: { id: unused.id } })).toBe(0);
  });
});

describe("Rechte und Mandanten", () => {
  it("lesen mit finance:read, erfassen nur mit finance:manage; ohne Recht bzw. mit Reichweite Abteilung verboten", async () => {
    const { ctx, money } = await setup();
    const readOnly: TenantContext = {
      ...ctx.board,
      permissions: new Map([...ctx.board.permissions].filter(([key]) => key !== "finance:manage")),
    };
    const departmentOnly: TenantContext = {
      ...ctx.board,
      permissions: new Map(
        [...ctx.board.permissions].map(([key, scope]) => [
          key,
          key.startsWith("finance:") ? "DEPARTMENT" : scope,
        ]),
      ),
    };
    const page = await getDonationsPage(readOnly, thisYear());
    expect(page.canManage).toBe(false);
    expect(await failure(recordDonation(readOnly, money()))).toMatch(/Berechtigung/);
    expect(await failure(updateTaxSettings(readOnly, { taxOffice: "Musterstadt" }))).toMatch(
      /Berechtigung/,
    );
    expect(await failure(getDonationsPage(ctx.member, thisYear()))).toMatch(/Berechtigung/);
    expect(await failure(listDonors(ctx.member, { year: thisYear() }))).toMatch(/Berechtigung/);
    expect(await failure(getDonationsPage(departmentOnly, thisYear()))).toMatch(/Berechtigung/);
    expect(await failure(recordDonation(departmentOnly, money()))).toMatch(/Berechtigung/);
  });

  it("Spender und Spenden eines anderen Vereins sind unsichtbar und lassen sich nicht verknüpfen", async () => {
    const a = await setup("Verein A");
    const b = await setup("Verein B");
    const recorded = await recordDonation(a.ctx.board, a.money());
    const entryA = await a.donationEntry("20,00");
    expect((await listDonations(b.ctx.board, { year: thisYear() })).rows).toEqual([]);
    expect((await listDonors(b.ctx.board, { year: thisYear(), all: true })).donors).toEqual([]);
    // Mitglied von A als Spender in B
    expect(await failure(recordDonation(b.ctx.board, b.money({ memberId: a.marta.id })))).toMatch(
      /Mitglied/,
    );
    // Zeile von A in B kennzeichnen
    expect(
      await failure(
        assignDonation(b.ctx.board, {
          ledgerLineId: entryA.lineId,
          donorMode: "ANONYMOUS",
          anonymousLabel: "Dose",
        }),
      ),
    ).toMatch(/nicht gefunden/);
    expect(
      await failure(
        updateDonation(b.ctx.board, {
          id: recorded.donationId,
          kind: "MONEY",
          donorMode: "ANONYMOUS",
          anonymousLabel: "Dose",
          target: "frei",
        }),
      ),
    ).toMatch(/nicht gefunden/);
    // Auch an den Diensten vorbei: zusammengesetzter Fremdschlüssel bzw. Trigger.
    await expect(
      prisma.donation.create({
        data: {
          clubId: b.club.id,
          kind: "MONEY",
          anonymousLabel: "Dose",
          ledgerLineId: entryA.lineId,
          receivedOn: new Date(),
          amountCents: 1,
          paymentMethod: "CASH",
          createdById: b.ctx.board.userId,
        },
      }),
    ).rejects.toThrow();
    const donorA = await prisma.donor.findFirstOrThrow({ where: { clubId: a.club.id } });
    await expect(
      prisma.donation.create({
        data: {
          clubId: b.club.id,
          kind: "IN_KIND",
          donorId: donorA.id,
          receivedOn: todayCalendarDate(),
          amountCents: 1_000,
          itemDescription: "Ein Karton Bälle, neu",
          inKindOrigin: "PRIVATE",
          createdById: b.ctx.board.userId,
        },
      }),
    ).rejects.toThrow();
  });
});

describe("Finanzamt-Angaben und Abteilungen", () => {
  it("ohne Kassenbuch Konflikt; speichern mit Protokoll; Prüfregeln der Datenbank (K23)", async () => {
    const other = await createClub("Ohne Kassenbuch");
    const board = await addUserToClub(other, "BOARD");
    const otherCtx = await contextFor(board.user.id, other.id);
    expect(await failure(updateTaxSettings(otherCtx, { taxOffice: "Musterstadt" }))).toMatch(
      /richte zuerst das Kassenbuch ein/,
    );
    expect((await getTaxSettings(otherCtx)).stored).toBe(false);

    const { club, ctx } = await setup();
    const exemptionDate = `${thisYear() - 2}-03-14`;
    const saved = await updateTaxSettings(ctx.board, {
      taxOffice: "Musterstadt",
      taxNumber: "12/345/67890",
      exemptionKind: "EXEMPTION_NOTICE",
      exemptionDate,
      exemptionLastYear: String(thisYear() - 4),
      taxPurposes: "des Sports",
      taxPurposesStatute: "den Sport", // nur bei § 60a – wird nicht gespeichert
      membershipFeesDeductible: true,
    });
    expect(saved.validity).toMatchObject({ state: "VALID" });
    expect(saved.values.taxPurposesStatute).toBeNull();
    expect(saved.warnings).toEqual([
      "Bei Sportvereinen sind Mitgliedsbeiträge nicht abziehbar – im Zweifel Steuerberater fragen.",
    ]);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { clubId: club.id, action: "finance.tax_settings_updated" },
    });
    expect(audit.changes).toMatchObject({
      finanzamt: { from: null, to: "Musterstadt" },
      bescheid: { from: null, to: "Freistellungsbescheid" },
    });
    expect(
      await failure(
        updateTaxSettings(ctx.board, {
          taxOffice: "Musterstadt",
          exemptionKind: "KST_ANNEX",
          exemptionDate: day(3),
        }),
      ),
    ).toMatch(/Zukunft/);
    const update = (data: Record<string, unknown>) =>
      prisma.financeSettings.update({ where: { clubId: club.id }, data });
    for (const data of [
      { exemptionLastYear: thisYear() },
      { exemptionKind: "FINDING_60A" },
      { taxNumber: "12/abc/3" },
      { exemptionDate: null },
    ])
      expect(await dbError(update(data)), JSON.stringify(data)).toMatch(/FinanceSettings_tax_chk/);
  });

  it("eine Abteilung, die Zweck von Spenden ist, lässt sich nicht löschen", async () => {
    const { ctx, marta, jugend } = await setup();
    await recordDonation(ctx.board, {
      kind: "IN_KIND",
      donorMode: "MEMBER",
      memberId: marta.id,
      amount: "80,00",
      receivedOn: day(),
      target: `a:${jugend.id}`,
      itemDescription: "Zehn Fußbälle, neu, Kaufpreis 80 €",
      inKindOrigin: "PRIVATE",
      valuationDocs: true,
    });
    expect(await failure(deleteDepartment(ctx.board, jugend.id))).toMatch(/Zweck von Spenden/);
  });
});
