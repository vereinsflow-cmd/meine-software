import { describe, expect, it } from "vitest";
import { toDateInputValue, todayCalendarDate } from "@/lib/dates";
import { prisma } from "@/server/db/client";
import { toActionError } from "@/server/action";
import { setupLedger } from "@/modules/finance/ledger";
import { createFamily } from "@/modules/fees/families";
import {
  addAssignment,
  addFeeRate,
  createFeeType,
  deleteFeeRate,
  endAssignment,
  updateFeeSettings,
} from "@/modules/fees/service";
import {
  analyzeFeeRun,
  executeFeeRun,
  feeRunDue,
  getFeeRun,
  listCharges,
  revertFeeRun,
  voidCharge,
} from "@/modules/fees/run";
import { periodFor, type FeePeriod } from "@/modules/fees/periods";
import { addUserToClub, contextFor, createClub } from "../helpers/factories";

/**
 * Beitragslauf (Etappe 7) gegen die echte Datenbank: genau die Vorschau wird erstellt, kein Tag zweimal (auch bei
 * gleichzeitigen Läufen), Nachlauf nur für das Fehlende, rückgängig und streichen geben die Tage frei, Beiträge und Zeilen
 * bleiben unverändert, Rechte und Mandanten.
 */

const today = () => todayCalendarDate();
const iso = (date: Date) => toDateInputValue(date);
const lastYear = () => today().getUTCFullYear() - 1;
/** 4. Quartal des Vorjahres – liegt immer ganz in der Vergangenheit. */
const Q4: FeePeriod = periodFor("QUARTERLY", new Date(Date.UTC(lastYear(), 9, 1)));

async function setup(name = "Laufverein") {
  const club = await createClub(name);
  const board = await addUserToClub(club, "BOARD");
  const member = await addUserToClub(club, "MEMBER");
  const ctx = {
    board: await contextFor(board.user.id, club.id),
    member: await contextFor(member.user.id, club.id),
  };
  await setupLedger(ctx.board, {
    ledgerStartDate: `${lastYear()}-01-01`,
    bankName: "Girokonto",
    bankInstitute: "Sparkasse Musterstadt",
    bankOpening: "1.000,00",
    withCash: false,
  });
  await createFeeType(ctx.board, {
    kind: "BASE",
    name: "Erwachsene",
    statuses: [],
    amount: "12,00",
    interval: "MONTHLY",
    validFrom: `${lastYear() - 1}-01-01`,
  });
  // Die Mitglieder der Benutzerkonten zahlen nicht mit (übersichtliche Zahlen): beitragsfrei.
  for (const user of [board, member]) {
    await prisma.memberFeeAssignment.create({
      data: {
        clubId: club.id,
        memberId: user.member.id,
        kind: "EXEMPT",
        validFrom: new Date(Date.UTC(2000, 0, 1)),
        reason: "Testkonto",
      },
    });
  }
  const person = (first: string, data: { joinedAt?: Date } = {}) =>
    prisma.member.create({
      data: {
        clubId: club.id,
        firstName: first,
        lastName: "Test",
        joinedAt: new Date(Date.UTC(2010, 0, 1)),
        birthDate: new Date(Date.UTC(1980, 4, 5)),
        status: "ACTIVE",
        ...data,
      },
    });
  return { club, ctx, person };
}

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const result = toActionError(error);
    return [result.message, ...Object.values(result.fieldErrors ?? {}).flat()].join(" | ");
  }
  throw new Error("Es wurde ein Fehler erwartet.");
}

async function run(ctx: Awaited<ReturnType<typeof setup>>["ctx"]["board"], period = Q4) {
  const analysis = await analyzeFeeRun(ctx, { period });
  const result = await executeFeeRun(ctx, {
    periodStart: iso(period.start),
    dueDate: iso(analysis.dueDate),
    inputHash: analysis.inputHash,
  });
  return { analysis, ...result };
}

describe("Beitragslauf", () => {
  it("erstellt genau die Vorschau: Nummern am Stück, Zeilen = Betrag, abgedeckte Tage; doppelt = einmal", async () => {
    const { ctx, person } = await setup();
    await person("Anna");
    await person("Bert");
    const { analysis, id, existed } = await run(ctx.board);
    expect(existed).toBe(false);
    expect(analysis.preview.charges).toHaveLength(2);
    const detail = (await getFeeRun(ctx.board, id))!;
    expect(detail.chargeCount).toBe(2);
    expect(detail.totalCents).toBe(7_200);
    expect(detail.charges.map((c) => c.number)).toEqual([
      `B-${lastYear()}-0001`,
      `B-${lastYear()}-0002`,
    ]);
    expect(detail.blockers).toEqual([]);
    const lines = await prisma.chargeLine.findMany({ where: { charge: { feeRunId: id } } });
    expect(lines.reduce((sum, l) => sum + l.amountCents, 0)).toBe(7_200);
    expect(
      await prisma.chargeCoverage.count({ where: { line: { charge: { feeRunId: id } } } }),
    ).toBe(2);
    // Gleicher Klick noch einmal (gleicher Prüfwert): derselbe Lauf, nichts doppelt.
    const again = await executeFeeRun(ctx.board, {
      periodStart: iso(Q4.start),
      dueDate: iso(analysis.dueDate),
      inputHash: analysis.inputHash,
    });
    expect(again).toEqual({ id, existed: true });
    // Neue Vorschau: nichts mehr zu tun.
    const next = await analyzeFeeRun(ctx.board, { period: Q4 });
    expect(next.preview.charges).toEqual([]);
    expect(next.runs.map((r) => r.id)).toEqual([id]);
  });

  it("Vorschau geändert (neues Mitglied) → nichts erstellt, Hinweis zum neu Prüfen", async () => {
    const { ctx, person } = await setup();
    await person("Anna");
    const analysis = await analyzeFeeRun(ctx.board, { period: Q4 });
    await person("Bert");
    expect(
      await failure(
        executeFeeRun(ctx.board, {
          periodStart: iso(Q4.start),
          dueDate: iso(analysis.dueDate),
          inputHash: analysis.inputHash,
        }),
      ),
    ).toMatch(/Vorschau hat sich inzwischen geändert/);
    expect(await prisma.charge.count({ where: { clubId: ctx.board.clubId } })).toBe(0);
  });

  it("Monatslauf Oktober, danach Quartalslauf: Oktober nur einmal", async () => {
    const { ctx, person } = await setup();
    await person("Anna");
    await updateFeeSettings(ctx.board, {
      feeInterval: "MONTHLY",
      dueDay: "15",
      proRataEntry: "DAY",
      proRataExit: "DAY",
      ageRule: "EXACT_DAY",
      missingBirthDateAsAdult: true,
    });
    const october = periodFor("MONTHLY", Q4.start);
    await run(ctx.board, october);
    await updateFeeSettings(ctx.board, {
      feeInterval: "QUARTERLY",
      dueDay: "15",
      proRataEntry: "DAY",
      proRataExit: "DAY",
      ageRule: "EXACT_DAY",
      missingBirthDateAsAdult: true,
    });
    const { analysis } = await run(ctx.board, Q4);
    expect(analysis.preview.charges.map((c) => c.amountCents)).toEqual([2_400]);
    expect(analysis.preview.charges[0]!.explanation).toMatch(/^schon berechnet bis 31\.10\./);
  });

  it("Nachlauf: ein später erfasstes Mitglied bekommt genau einen Beitrag", async () => {
    const { ctx, person } = await setup();
    await person("Anna");
    await run(ctx.board);
    await person("Carla");
    const { analysis } = await run(ctx.board);
    expect(analysis.runs).toHaveLength(1);
    expect(analysis.preview.charges.map((c) => c.memberName)).toEqual(["Carla Test"]);
    const third = await analyzeFeeRun(ctx.board, { period: Q4 });
    expect(third.preview.charges).toEqual([]);
  });

  it("gleichzeitige Läufe für denselben Zeitraum: eine Menge Beiträge, der zweite erstellt nichts", async () => {
    const { ctx, person } = await setup();
    await person("Anna");
    await person("Bert");
    const analysis = await analyzeFeeRun(ctx.board, { period: Q4 });
    const input = {
      periodStart: iso(Q4.start),
      dueDate: iso(analysis.dueDate),
      inputHash: analysis.inputHash,
    };
    const results = await Promise.allSettled([
      executeFeeRun(ctx.board, input),
      executeFeeRun(ctx.board, input),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const ids = results.map((r) => (r as PromiseFulfilledResult<{ id: string }>).value.id);
    expect(new Set(ids).size).toBe(1);
    expect(await prisma.charge.count({ where: { clubId: ctx.board.clubId } })).toBe(2);
  });

  it("rückgängig: streicht alle Beiträge, die Tage sind frei, ein neuer Lauf geht; Nummern bleiben", async () => {
    const { ctx, person } = await setup();
    await person("Anna");
    const first = await run(ctx.board);
    await revertFeeRun(ctx.board, { id: first.id, reason: "Falscher Betrag" });
    const reverted = (await getFeeRun(ctx.board, first.id))!;
    expect(reverted.status).toBe("REVERTED");
    expect(reverted.charges.map((c) => c.status)).toEqual(["VOID"]);
    expect(
      await prisma.chargeCoverage.count({ where: { clubId: ctx.board.clubId, active: true } }),
    ).toBe(0);
    expect(await failure(revertFeeRun(ctx.board, { id: first.id, reason: "noch mal" }))).toMatch(
      /schon rückgängig/,
    );
    const second = await run(ctx.board);
    const detail = (await getFeeRun(ctx.board, second.id))!;
    expect(detail.charges.map((c) => c.number)).toEqual([`B-${lastYear()}-0002`]);
    const all = await listCharges(ctx.board, { filter: "alle" });
    expect(all.counts).toMatchObject({ offen: 1, gestrichen: 1, alle: 2 });
  });

  it("rückgängig geht nicht mehr nach einer Erinnerung; einzelner Beitrag lässt sich streichen", async () => {
    const { ctx, person } = await setup();
    await person("Anna");
    await person("Bert");
    const { id } = await run(ctx.board);
    const charges = await prisma.charge.findMany({
      where: { feeRunId: id },
      orderBy: { number: "asc" },
    });
    await prisma.charge.update({ where: { id: charges[0]!.id }, data: { reminderLevel: 1 } });
    expect(await failure(revertFeeRun(ctx.board, { id, reason: "Fehler" }))).toMatch(
      /schon erinnert/,
    );
    expect((await getFeeRun(ctx.board, id))!.blockers).toHaveLength(1);
    await voidCharge(ctx.board, { id: charges[1]!.id, reason: "Doppelt erfasst" });
    // Bert ist wieder frei – ein Nachlauf würde ihn neu berechnen.
    const next = await analyzeFeeRun(ctx.board, { period: Q4 });
    expect(next.preview.charges.map((c) => c.memberName)).toEqual(["Bert Test"]);
    expect(await failure(voidCharge(ctx.board, { id: charges[1]!.id, reason: "x2" }))).toMatch(
      /schon gestrichen/,
    );
  });

  it("die Datenbank schützt Beiträge, Zeilen und abgedeckte Tage", async () => {
    const { club, ctx, person } = await setup();
    const anna = await person("Anna");
    const { id } = await run(ctx.board);
    const charge = await prisma.charge.findFirstOrThrow({ where: { feeRunId: id } });
    await expect(
      prisma.charge.update({ where: { id: charge.id }, data: { amountCents: 1 } }),
    ).rejects.toThrow(/CHARGE_LOCKED/);
    await expect(
      prisma.charge.update({ where: { id: charge.id }, data: { paidCents: 100 } }),
    ).rejects.toThrow(/CHARGE_LOCKED/);
    await expect(
      prisma.charge.update({
        where: { id: charge.id },
        data: { status: "PAID", paidCents: charge.amountCents },
      }),
    ).rejects.toThrow(/CHARGE_LOCKED/);
    await expect(prisma.charge.delete({ where: { id: charge.id } })).rejects.toThrow(
      /CHARGE_LOCKED/,
    );
    const line = await prisma.chargeLine.findFirstOrThrow({ where: { chargeId: charge.id } });
    await expect(
      prisma.chargeLine.update({ where: { id: line.id }, data: { amountCents: 1 } }),
    ).rejects.toThrow(/CHARGE_LOCKED/);
    // Ein zweiter Beitrag für dieselben Tage: von der Ausschlussbedingung abgelehnt.
    await expect(
      prisma.chargeCoverage.create({
        data: {
          clubId: club.id,
          chargeLineId: line.id,
          memberId: anna.id,
          feeGroup: "BASE",
          coversFrom: Q4.start,
          coversTo: Q4.start,
        },
      }),
    ).rejects.toThrow(/ChargeCoverage_no_overlap/);
    // Beitrag ohne passende Zeilen: am Ende der Transaktion abgelehnt.
    await expect(
      prisma.charge.create({
        data: {
          clubId: club.id,
          year: 2099,
          number: 1,
          title: "Test",
          memberId: anna.id,
          payerMemberId: anna.id,
          dueDate: Q4.end,
          amountCents: 500,
          paymentMethod: "TRANSFER",
          calculation: {},
          explanation: "Test",
          debtorName: "Anna Test",
          payerName: "Anna Test",
        },
      }),
    ).rejects.toThrow(/CHARGE_INVALID/);
    await expect(prisma.feeRun.delete({ where: { id } })).rejects.toThrow(/FEE_RUN_LOCKED/);
  });

  it("ohne Kassenbuch: Hinweis statt Lauf", async () => {
    const club = await createClub("Ohne Kassenbuch");
    const board = await addUserToClub(club, "BOARD");
    const ctx = await contextFor(board.user.id, club.id);
    expect(
      await failure(
        executeFeeRun(ctx, {
          periodStart: iso(Q4.start),
          dueDate: iso(Q4.end),
          inputHash: "a".repeat(64),
        }),
      ),
    ).toMatch(/Kassenbuch/);
  });

  it("Rechte und Mandanten: Mitglieder dürfen nichts, andere Vereine sehen nichts", async () => {
    const { ctx, person } = await setup();
    await person("Anna");
    const { id, analysis } = await run(ctx.board);
    expect(await failure(analyzeFeeRun(ctx.member, { period: Q4 }))).toMatch(
      /Berechtigung|Zugriff|darf/i,
    );
    expect(
      await failure(
        executeFeeRun(ctx.member, {
          periodStart: iso(Q4.start),
          dueDate: iso(analysis.dueDate),
          inputHash: analysis.inputHash,
        }),
      ),
    ).toMatch(/Berechtigung|Zugriff|darf/i);
    const other = await setup("Anderer Laufverein");
    expect(await getFeeRun(other.ctx.board, id)).toBeNull();
    expect((await listCharges(other.ctx.board, { filter: "alle" })).total).toBe(0);
    expect(await failure(revertFeeRun(other.ctx.board, { id, reason: "fremd" }))).toMatch(
      /nicht gefunden|Beitragslauf/,
    );
  });

  it("einzeln gestrichen, dann neu erstellt: ein neuer Beitrag (nicht „schon erstellt“)", async () => {
    const { ctx, person } = await setup();
    await person("Anna");
    const first = await run(ctx.board);
    const charge = await prisma.charge.findFirstOrThrow({ where: { feeRunId: first.id } });
    await voidCharge(ctx.board, { id: charge.id, reason: "Name falsch" });
    const second = await run(ctx.board);
    expect(second.existed).toBe(false);
    expect(second.id).not.toBe(first.id);
    expect((await listCharges(ctx.board, { filter: "offen" })).total).toBe(1);
  });

  it("schon abgerechnete Beträge und Regeln bleiben; nach „rückgängig“ lassen sie sich zurücknehmen", async () => {
    const { ctx, person } = await setup();
    const anna = await person("Anna");
    const adults = await prisma.feeType.findFirstOrThrow({
      where: { clubId: ctx.board.clubId, name: "Erwachsene" },
    });
    // Ein Betrag ab dem 4. Quartal, heute eingegeben (also eigentlich zurücknehmbar).
    await addFeeRate(ctx.board, {
      feeTypeId: adults.id,
      amount: "13,00",
      interval: "MONTHLY",
      validFrom: iso(Q4.start),
    });
    const rate = await prisma.feeRate.findFirstOrThrow({
      where: { feeTypeId: adults.id, validFrom: Q4.start },
    });
    await addAssignment(ctx.board, {
      memberId: anna.id,
      kind: "DISCOUNT_PERCENT",
      percent: "10",
      validFrom: iso(Q4.start),
      reason: "Test",
    });
    const rule = await prisma.memberFeeAssignment.findFirstOrThrow({
      where: { memberId: anna.id },
    });
    const { id } = await run(ctx.board);
    expect(await failure(deleteFeeRate(ctx.board, { id: rate.id }))).toMatch(
      /schon Beiträge erstellt/,
    );
    await revertFeeRun(ctx.board, { id, reason: "Tippfehler" });
    await deleteFeeRate(ctx.board, { id: rate.id });
    expect(await prisma.feeRate.count({ where: { id: rate.id } })).toBe(0);
    // Die Regel wurde nach „rückgängig“ nicht mehr abgerechnet – beenden geht wieder.
    await endAssignment(ctx.board, { id: rule.id, validTo: iso(Q4.end) });
  });

  it("Familie: ein später hinzugekommenes Kind zahlt im Nachlauf nicht noch einmal", async () => {
    const { ctx, person } = await setup();
    const familyType = await createFeeType(ctx.board, {
      kind: "FAMILY",
      name: "Familienbeitrag",
      statuses: [],
      familyMinMembers: "2",
      amount: "15,00",
      interval: "MONTHLY",
      validFrom: `${lastYear() - 1}-01-01`,
    });
    const sophie = await person("Sophie");
    const lena = await person("Lena");
    const family = await createFamily(ctx.board, {
      name: "Familie Test",
      feeTypeId: familyType.id,
      payerMemberId: sophie.id,
      memberIds: [sophie.id, lena.id],
      validFrom: `${lastYear()}-01-01`,
    });
    const first = await run(ctx.board);
    expect(first.analysis.preview.charges.map((c) => c.amountCents)).toEqual([4_500]);
    const mia = await person("Mia", { joinedAt: new Date(Date.UTC(lastYear(), 10, 1)) });
    await prisma.feeFamilyMember.create({
      data: {
        clubId: ctx.board.clubId,
        familyId: family.id,
        memberId: mia.id,
        validFrom: new Date(Date.UTC(lastYear(), 10, 1)),
      },
    });
    const next = await analyzeFeeRun(ctx.board, { period: Q4 });
    expect(next.preview.charges).toEqual([]);
    expect(next.preview.covered.map((c) => c.memberId)).toEqual([mia.id]);
  });

  it("„Beitragslauf ist bereit“: nach einem Monatslauf für Oktober ist das Quartal noch offen", async () => {
    const { ctx, person } = await setup();
    await person("Anna");
    const settings = {
      dueDay: "15",
      proRataEntry: "DAY" as const,
      proRataExit: "DAY" as const,
      ageRule: "EXACT_DAY" as const,
      missingBirthDateAsAdult: true,
    };
    await updateFeeSettings(ctx.board, { ...settings, feeInterval: "MONTHLY" });
    const current = periodFor("MONTHLY", today());
    await run(ctx.board, current);
    await updateFeeSettings(ctx.board, { ...settings, feeInterval: "QUARTERLY" });
    const due = await feeRunDue(ctx.board);
    expect(due?.period.start.getTime()).toBe(periodFor("QUARTERLY", today()).start.getTime());
  });

  it("Suche nach der Nummer wie angezeigt; sehr lange Ziffernfolgen gehen nicht kaputt", async () => {
    const { ctx, person } = await setup();
    await person("Anna");
    await run(ctx.board);
    const number = `B-${lastYear()}-0001`;
    expect((await listCharges(ctx.board, { q: number })).items.map((c) => c.number)).toEqual([
      number,
    ]);
    expect((await listCharges(ctx.board, { q: `${lastYear()}-0001` })).total).toBe(1);
    expect((await listCharges(ctx.board, { q: "12345678901234" })).total).toBe(0);
    const filtered = await listCharges(ctx.board, { q: "Niemand" });
    expect(filtered.openCents).toBe(0);
  });

  it("1.000 Mitglieder: Vorschau und Erstellen in wenigen Sekunden", async () => {
    const { club, ctx } = await setup("Großverein");
    await prisma.member.createMany({
      data: Array.from({ length: 1_000 }, (_, i) => ({
        clubId: club.id,
        firstName: `Mitglied${i}`,
        lastName: "Groß",
        joinedAt: new Date(Date.UTC(2010, 0, 1)),
        birthDate: new Date(Date.UTC(1980, 4, 5)),
        status: "ACTIVE" as const,
      })),
    });
    const started = Date.now();
    const { analysis, id } = await run(ctx.board);
    const elapsed = Date.now() - started;
    expect(analysis.preview.charges).toHaveLength(1_000);
    expect((await getFeeRun(ctx.board, id))!.chargeCount).toBe(1_000);
    expect(elapsed).toBeLessThan(15_000);
  }, 60_000);
});
