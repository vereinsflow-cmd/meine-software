import { describe, expect, it } from "vitest";
import { toDateInputValue, todayCalendarDate } from "@/lib/dates";
import { prisma } from "@/server/db/client";
import { toActionError } from "@/server/action";
import { anonymizeMemberData } from "@/server/privacy/anonymize";
import {
  addAssignment,
  addFeeRate,
  createFeeType,
  deleteAssignment,
  deleteFeeRate,
  endAssignment,
  getMemberFee,
  listFeeTypes,
  moveFeeType,
  updateMemberFinance,
  whoPays,
} from "@/modules/fees/service";
import { addUserToClub, contextFor, createClub, createDepartment } from "../helpers/factories";

const today = () => todayCalendarDate();
const iso = (date: Date) => toDateInputValue(date);
/** Erster Tag des laufenden Quartals. */
function quarterStart(): Date {
  const t = today();
  return new Date(Date.UTC(t.getUTCFullYear(), Math.floor(t.getUTCMonth() / 3) * 3, 1));
}

async function setup() {
  const club = await createClub("Beitragsverein");
  const board = await addUserToClub(club, "BOARD");
  const member = await addUserToClub(club, "MEMBER");
  const ctx = {
    board: await contextFor(board.user.id, club.id),
    member: await contextFor(member.user.id, club.id),
  };
  const yearStart = `${today().getUTCFullYear() - 1}-01-01`;
  const adults = await createFeeType(ctx.board, {
    kind: "BASE",
    name: "Erwachsene",
    statuses: [],
    amount: "12,00",
    interval: "MONTHLY",
    validFrom: yearStart,
  });
  const youth = await createFeeType(ctx.board, {
    kind: "BASE",
    name: "Jugend bis 17 Jahre",
    statuses: [],
    maxAge: "17",
    amount: "6,00",
    interval: "MONTHLY",
    validFrom: yearStart,
  });
  const person = (
    first: string,
    data: {
      birthDate?: Date | null;
      joinedAt?: Date | null;
      leftAt?: Date | null;
      status?: "ACTIVE" | "PASSIVE" | "LEFT" | "HONORARY" | "BLOCKED";
    } = {},
  ) =>
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
  return { club, ctx, adults, youth, person, people: { board, member } };
}

async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return toActionError(error).message;
  }
  throw new Error("Es wurde ein Fehler erwartet.");
}

describe("Beitragsarten", () => {
  it("Reihenfolge: neue Grundbeiträge hinten, die erste passende gilt; Tauschen hält sie eindeutig", async () => {
    const { ctx, youth, person } = await setup();
    let types = await listFeeTypes(ctx.board);
    expect(types.filter((t) => t.kind === "BASE").map((t) => t.name)).toEqual([
      "Erwachsene",
      "Jugend bis 17 Jahre",
    ]);
    // „Erwachsene“ (ohne Altersgrenze) steht vorn – auch ein Kind zahlt dann den Erwachsenenbeitrag.
    const kid = await person("Kind", {
      birthDate: new Date(Date.UTC(today().getUTCFullYear() - 10, 0, 1)),
    });
    let result = await whoPays(ctx.board, { memberId: kid.id });
    expect(result.charges[0]!.mainFeeTypeName).toBe("Erwachsene");
    await moveFeeType(ctx.board, { id: youth.id, direction: "up" });
    types = await listFeeTypes(ctx.board);
    expect(types.filter((t) => t.kind === "BASE").map((t) => t.name)).toEqual([
      "Jugend bis 17 Jahre",
      "Erwachsene",
    ]);
    result = await whoPays(ctx.board, { memberId: kid.id });
    expect(result.charges[0]!.mainFeeTypeName).toBe("Jugend bis 17 Jahre");
  });

  it("Sätze: nicht änderbar; künftige lassen sich zurücknehmen, geltende (nicht von heute) nicht", async () => {
    const { club, ctx, adults } = await setup();
    // Ein Satz, der seit gestern erfasst ist und schon gilt.
    const old = await prisma.feeRate.create({
      data: {
        clubId: club.id,
        feeTypeId: adults.id,
        validFrom: new Date(Date.UTC(2020, 5, 1)),
        amountCents: 1_000,
        interval: "MONTHLY",
        createdAt: new Date(Date.now() - 2 * 86_400_000),
      },
    });
    const next = new Date(Date.UTC(today().getUTCFullYear() + 1, 0, 1));
    await addFeeRate(ctx.board, {
      feeTypeId: adults.id,
      amount: "15,00",
      interval: "MONTHLY",
      validFrom: iso(next),
    });
    await expect(
      prisma.feeRate.update({ where: { id: old.id }, data: { amountCents: 1 } }),
    ).rejects.toThrow(/FEE_RATE_LOCKED/);
    expect(await failure(deleteFeeRate(ctx.board, { id: old.id }))).toMatch(/schon gilt/);
    await expect(prisma.feeRate.delete({ where: { id: old.id } })).rejects.toThrow(
      /FEE_RATE_LOCKED/,
    );
    const future = await prisma.feeRate.findFirstOrThrow({
      where: { feeTypeId: adults.id, validFrom: next },
    });
    await deleteFeeRate(ctx.board, { id: future.id });
    expect(await prisma.feeRate.count({ where: { feeTypeId: adults.id } })).toBe(2);
  });

  it("zwei aktive Grundbeiträge mit gleicher Reihenfolge lehnt die Datenbank ab", async () => {
    const { club, adults } = await setup();
    const row = await prisma.feeType.findUniqueOrThrow({ where: { id: adults.id } });
    await expect(
      prisma.feeType.create({
        data: { clubId: club.id, name: "Doppelt", kind: "BASE", priority: row.priority },
      }),
    ).rejects.toThrow();
  });

  it("nur mit Finanzrecht; anderer Verein sieht nichts", async () => {
    const { ctx } = await setup();
    const other = await setup();
    expect(await failure(listFeeTypes(ctx.member))).toMatch(/Berechtigung/);
    expect(
      await failure(
        createFeeType(ctx.member, {
          kind: "BASE",
          name: "X",
          statuses: [],
          amount: "1,00",
          interval: "MONTHLY",
          validFrom: "2026-01-01",
        }),
      ),
    ).toMatch(/Berechtigung/);
    expect((await listFeeTypes(other.ctx.board)).map((t) => t.name)).toEqual([
      "Erwachsene",
      "Jugend bis 17 Jahre",
    ]);
  });
});

describe("Status-Verlauf", () => {
  it("die Datenbank schreibt ihn bei Anlage und Statuswechsel; Einträge sind unveränderlich", async () => {
    const { person } = await setup();
    const hans = await person("Hans");
    let history = await prisma.memberStatusChange.findMany({ where: { memberId: hans.id } });
    expect(history.map((h) => [h.status, iso(h.validFrom)])).toEqual([["ACTIVE", "2010-01-01"]]);
    // Egal auf welchem Weg der Status wechselt (Formular, Import, Antrag) – die Datenbank schreibt mit.
    await prisma.member.update({ where: { id: hans.id }, data: { status: "PASSIVE" } });
    history = await prisma.memberStatusChange.findMany({
      where: { memberId: hans.id },
      orderBy: { createdAt: "asc" },
    });
    expect(history.map((h) => h.status)).toEqual(["ACTIVE", "PASSIVE"]);
    expect(iso(history[1]!.validFrom)).toBe(iso(today()));
    await expect(
      prisma.memberStatusChange.update({ where: { id: history[0]!.id }, data: { status: "LEFT" } }),
    ).rejects.toThrow(/FEE_HISTORY_LOCKED/);
  });
});

describe("Ermäßigungen, Zahler, „Wer zahlt was“", () => {
  it("50 % Übungsleiterin, Ehrenmitglied beitragsfrei, ohne Geburtsdatum mit Hinweis", async () => {
    const { ctx, person } = await setup();
    const claudia = await person("Claudia");
    const otto = await person("Otto", { birthDate: null });
    const ehren = await person("Erika", { status: "HONORARY" });
    await addAssignment(ctx.board, {
      memberId: claudia.id,
      kind: "DISCOUNT_PERCENT",
      percent: "50",
      validFrom: "2020-01-01",
      reason: "Übungsleiterin",
    });
    const result = await whoPays(ctx.board, { period: undefined });
    const byId = new Map(result.charges.map((c) => [c.memberId, c]));
    expect(byId.get(claudia.id)!.amountCents).toBe(1_800);
    expect(byId.get(claudia.id)!.explanation).toMatch(/50\s?% ermäßigt \(Übungsleiterin\)/);
    expect(byId.get(otto.id)!.amountCents).toBe(3_600);
    expect(result.warnings.some((w) => w.memberId === otto.id && w.code === "NO_BIRTH_DATE")).toBe(
      true,
    );
    expect(result.exempt.map((e) => e.memberId)).toContain(ehren.id);
    expect(result.period.start.getTime()).toBe(quarterStart().getTime());
  });

  it("überschneidende Ermäßigungen lehnt die Datenbank ab; beenden geht", async () => {
    const { club, ctx, person } = await setup();
    const lena = await person("Lena");
    await addAssignment(ctx.board, {
      memberId: lena.id,
      kind: "EXEMPT",
      validFrom: "2020-01-01",
      reason: "Härtefall",
    });
    expect(
      await failure(
        addAssignment(ctx.board, {
          memberId: lena.id,
          kind: "DISCOUNT_PERCENT",
          percent: "20",
          validFrom: "2021-01-01",
          reason: "Schülerin",
        }),
      ),
    ).toMatch(/schon eine Ermäßigung oder Befreiung/);
    await expect(
      prisma.memberFeeAssignment.create({
        data: {
          clubId: club.id,
          memberId: lena.id,
          kind: "DISCOUNT_PERCENT",
          percentBp: 2_000,
          validFrom: new Date(Date.UTC(2021, 0, 1)),
          reason: "direkt",
        },
      }),
    ).rejects.toThrow(/MemberFeeAssignment_no_overlap|exclusion/i);
    const [rule] = await prisma.memberFeeAssignment.findMany({ where: { memberId: lena.id } });
    await endAssignment(ctx.board, { id: rule!.id, validTo: "2024-12-31" });
    await expect(
      prisma.memberFeeAssignment.update({ where: { id: rule!.id }, data: { reason: "anders" } }),
    ).rejects.toThrow(/FEE_HISTORY_LOCKED/);
    const result = await whoPays(ctx.board, { memberId: lena.id });
    expect(result.charges[0]!.amountCents).toBe(3_600);
  });

  it("Zahler: Elternteil zahlt (dessen Zahlweg gilt), keine Ketten", async () => {
    const { ctx, person } = await setup();
    const mama = await person("Mama");
    const kind = await person("Kind", {
      birthDate: new Date(Date.UTC(today().getUTCFullYear() - 9, 0, 1)),
    });
    const oma = await person("Oma");
    await updateMemberFinance(ctx.board, { memberId: mama.id, paymentMethod: "DIRECT_DEBIT" });
    await updateMemberFinance(ctx.board, {
      memberId: kind.id,
      payerMemberId: mama.id,
      paymentMethod: "TRANSFER",
    });
    const result = await whoPays(ctx.board, { memberId: kind.id });
    expect(result.charges[0]).toMatchObject({
      payerMemberId: mama.id,
      payerName: "Mama Test",
      paymentMethod: "DIRECT_DEBIT",
    });
    // Mama zahlt für andere – sie bekommt selbst keinen anderen Zahler.
    expect(
      await failure(
        updateMemberFinance(ctx.board, {
          memberId: mama.id,
          payerMemberId: oma.id,
          paymentMethod: "TRANSFER",
        }),
      ),
    ).toMatch(/Wer für andere zahlt/);
    const card = await getMemberFee(ctx.board, mama.id);
    expect(card!.paysFor.map((p) => p.name)).toEqual(["Kind Test"]);
    expect(await getMemberFee(ctx.member, mama.id)).toBeNull();
  });

  it("Zusatzbeitrag einer Abteilung kommt zum Grundbeitrag dazu", async () => {
    const { club, ctx, person } = await setup();
    const tennis = await createDepartment(club.id, "Tennis");
    await createFeeType(ctx.board, {
      kind: "ADDITIONAL",
      name: "Tennis-Zusatz",
      statuses: [],
      departmentId: tennis.id,
      amount: "30,00",
      interval: "QUARTERLY",
      validFrom: "2020-01-01",
    });
    const tom = await person("Tom");
    await prisma.memberDepartment.create({
      data: { clubId: club.id, memberId: tom.id, departmentId: tennis.id, since: quarterStart() },
    });
    const result = await whoPays(ctx.board, { memberId: tom.id });
    expect(result.charges[0]!.amountCents).toBe(3_600 + 3_000);
  });

  it("Abteilung ohne „seit“ zählt ab dem Tag der Zuordnung (nicht rückwirkend)", async () => {
    const { club, ctx, person } = await setup();
    const judo = await createDepartment(club.id, "Judo");
    await createFeeType(ctx.board, {
      kind: "ADDITIONAL",
      name: "Judo-Zusatz",
      statuses: [],
      departmentId: judo.id,
      amount: "30,00",
      interval: "QUARTERLY",
      validFrom: "2020-01-01",
    });
    const uwe = await person("Uwe");
    await prisma.memberDepartment.create({
      data: { clubId: club.id, memberId: uwe.id, departmentId: judo.id },
    });
    const result = await whoPays(ctx.board, { memberId: uwe.id });
    const judoLine = result.charges[0]!.lines.find((l) => l.text.startsWith("Judo"));
    expect(iso(judoLine!.fromDate)).toBe(iso(today()));
  });
});

describe("Nach dem Review", () => {
  it("zurückgenommene Kündigung: danach wird wieder berechnet", async () => {
    const { ctx, person } = await setup();
    const kim = await person("Kim");
    const nextYearStart = new Date(Date.UTC(today().getUTCFullYear() + 1, 0, 1));
    const cancelOn = new Date(nextYearStart.getTime() - 86_400_000); // 31.12.
    await prisma.member.update({
      where: { id: kim.id },
      data: { status: "LEFT", leftAt: cancelOn },
    });
    await prisma.member.update({ where: { id: kim.id }, data: { status: "ACTIVE", leftAt: null } });
    const result = await whoPays(ctx.board, {
      memberId: kim.id,
      period: {
        start: nextYearStart,
        end: new Date(Date.UTC(nextYearStart.getUTCFullYear(), 3, 0)),
        label: "1. Quartal",
      },
    });
    expect(result.charges[0]?.amountCents).toBe(3_600);
  });

  it("archivierter Zahler: das Mitglied zahlt selbst, mit Hinweis", async () => {
    const { ctx, person } = await setup();
    const papa = await person("Papa");
    const kind = await person("Kind");
    await updateMemberFinance(ctx.board, {
      memberId: kind.id,
      payerMemberId: papa.id,
      paymentMethod: "TRANSFER",
    });
    await prisma.member.update({ where: { id: papa.id }, data: { archivedAt: new Date() } });
    const result = await whoPays(ctx.board, { memberId: kind.id });
    expect(result.charges[0]!.payerMemberId).toBe(kind.id);
    expect(result.warnings.map((w) => w.code)).toContain("PAYER_NOT_MEMBER");
  });

  it("am Tag der Eingabe lassen sich Regel und Betrag zurücknehmen", async () => {
    const { ctx, adults, person } = await setup();
    const lea = await person("Lea");
    await addAssignment(ctx.board, {
      memberId: lea.id,
      kind: "EXEMPT",
      validFrom: "2020-01-01",
      reason: "versehentlich",
    });
    const [rule] = await prisma.memberFeeAssignment.findMany({ where: { memberId: lea.id } });
    await deleteAssignment(ctx.board, { id: rule!.id });
    expect(await prisma.memberFeeAssignment.count({ where: { memberId: lea.id } })).toBe(0);
    await addFeeRate(ctx.board, {
      feeTypeId: adults.id,
      amount: "13,00",
      interval: "MONTHLY",
      validFrom: iso(today()),
    });
    const typo = await prisma.feeRate.findFirstOrThrow({
      where: { feeTypeId: adults.id, validFrom: today() },
    });
    await deleteFeeRate(ctx.board, { id: typo.id });
    expect(await prisma.feeRate.count({ where: { feeTypeId: adults.id } })).toBe(1);
  });

  it("feste Zuordnung zu einer archivierten Beitragsart: kein Beitrag, Hinweis", async () => {
    const { ctx, person } = await setup();
    const special = await createFeeType(ctx.board, {
      kind: "BASE",
      name: "Sonder",
      statuses: [],
      amount: "50,00",
      interval: "MONTHLY",
      validFrom: "2020-01-01",
    });
    const anna = await person("Anna");
    await addAssignment(ctx.board, {
      memberId: anna.id,
      kind: "ASSIGN",
      feeTypeId: special.id,
      validFrom: "2020-01-01",
    });
    await prisma.feeType.update({ where: { id: special.id }, data: { archivedAt: new Date() } });
    const result = await whoPays(ctx.board, { memberId: anna.id });
    expect(result.charges).toHaveLength(0);
    expect(result.warnings.some((w) => /archiviert/.test(w.text))).toBe(true);
  });

  it("Anonymisierung entfernt Notiz, Zahler-Verknüpfungen und Gründe", async () => {
    const { club, ctx, person } = await setup();
    const oma = await person("Oma");
    const enkel = await person("Enkel");
    await updateMemberFinance(ctx.board, {
      memberId: oma.id,
      paymentMethod: "CASH",
      note: "zahlt bar beim Training",
    });
    await updateMemberFinance(ctx.board, {
      memberId: enkel.id,
      payerMemberId: oma.id,
      paymentMethod: "TRANSFER",
    });
    await addAssignment(ctx.board, {
      memberId: oma.id,
      kind: "EXEMPT",
      validFrom: "2020-01-01",
      reason: "Härtefall – krank",
    });
    await prisma.$transaction((tx) => anonymizeMemberData(tx, club.id, oma.id, new Date()));
    const finance = await prisma.memberFinance.findUniqueOrThrow({
      where: { clubId_memberId: { clubId: club.id, memberId: oma.id } },
    });
    expect(finance.note).toBeNull();
    expect(
      (
        await prisma.memberFinance.findUniqueOrThrow({
          where: { clubId_memberId: { clubId: club.id, memberId: enkel.id } },
        })
      ).payerMemberId,
    ).toBeNull();
    const rule = await prisma.memberFeeAssignment.findFirstOrThrow({ where: { memberId: oma.id } });
    expect(rule.reason).toBe("anonymisiert");
  });
});
