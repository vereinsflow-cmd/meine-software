import { describe, expect, it } from "vitest";
import { formatCalendarDate, toDateInputValue, todayCalendarDate } from "@/lib/dates";
import { prisma } from "@/server/db/client";
import { toActionError } from "@/server/action";
import { anonymizeMemberData } from "@/server/privacy/anonymize";
import {
  addFamilyMember,
  createFamily,
  deleteFamilyMember,
  dissolveFamily,
  endFamilyMember,
  listFamilies,
  updateFamily,
} from "@/modules/fees/families";
import { createFeeType, getMemberFee, updateMemberFinance, whoPays } from "@/modules/fees/service";
import { addUserToClub, contextFor, createClub } from "../helpers/factories";

/**
 * Familien (Etappe 6) gegen die echte Datenbank: Familienbeitrag statt der Grundbeiträge, Zahler der Familie, keine
 * Überschneidungen und keine Zahler-Ketten, Verlauf bleibt (austragen statt löschen), Rechte und Mandanten.
 */

const today = () => todayCalendarDate();
const iso = (date: Date) => toDateInputValue(date);
const daysAgo = (n: number) => new Date(today().getTime() - n * 86_400_000);
const daysAhead = (n: number) => new Date(today().getTime() + n * 86_400_000);

async function setup(name = "Familienverein") {
  const club = await createClub(name);
  const board = await addUserToClub(club, "BOARD");
  const member = await addUserToClub(club, "MEMBER");
  const ctx = {
    board: await contextFor(board.user.id, club.id),
    member: await contextFor(member.user.id, club.id),
  };
  const yearStart = `${today().getUTCFullYear() - 1}-01-01`;
  await createFeeType(ctx.board, {
    kind: "BASE",
    name: "Erwachsene",
    statuses: [],
    amount: "12,00",
    interval: "MONTHLY",
    validFrom: yearStart,
  });
  await createFeeType(ctx.board, {
    kind: "BASE",
    name: "Jugend",
    statuses: [],
    maxAge: "17",
    amount: "6,00",
    interval: "MONTHLY",
    validFrom: yearStart,
  });
  const familyType = await createFeeType(ctx.board, {
    kind: "FAMILY",
    name: "Familienbeitrag",
    statuses: [],
    familyMinMembers: "3",
    amount: "25,00",
    interval: "MONTHLY",
    validFrom: yearStart,
  });
  const person = (first: string, data: { birthDate?: Date } = {}) =>
    prisma.member.create({
      data: {
        clubId: club.id,
        firstName: first,
        lastName: "Krüger",
        joinedAt: new Date(Date.UTC(2010, 0, 1)),
        birthDate: new Date(Date.UTC(1980, 4, 5)),
        status: "ACTIVE",
        ...data,
      },
    });
  const kid = (first: string) =>
    person(first, { birthDate: new Date(Date.UTC(today().getUTCFullYear() - 10, 2, 3)) });
  const sophie = await person("Sophie");
  const lena = await kid("Lena");
  const mia = await kid("Mia");
  return { club, ctx, familyType, person, kid, sophie, lena, mia };
}

/** Meldung des Fehlers – bei Eingabefehlern mit den Meldungen der Felder. */
async function failure(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    const result = toActionError(error);
    return [result.message, ...Object.values(result.fieldErrors ?? {}).flat()].join(" | ");
  }
  throw new Error("Es wurde ein Fehler erwartet.");
}

describe("Familien", () => {
  it("Familienbeitrag statt der Grundbeiträge: eine Zeile, Zahler Sophie; Karte zeigt die Familie", async () => {
    const { ctx, familyType, sophie, lena, mia } = await setup();
    const { id } = await createFamily(ctx.board, {
      name: "Familie Krüger",
      feeTypeId: familyType.id,
      payerMemberId: sophie.id,
      memberIds: [sophie.id, lena.id, mia.id],
      validFrom: `${today().getUTCFullYear() - 1}-01-01`,
    });
    const result = await whoPays(ctx.board);
    const months = { MONTHLY: 1, QUARTERLY: 3, HALF_YEARLY: 6, YEARLY: 12 }[
      result.settings.feeInterval
    ];
    const family = result.charges.find((c) => c.family?.id === id)!;
    expect(family.amountCents).toBe(2_500 * months);
    expect(family.payerName).toBe("Sophie Krüger");
    expect(family.explanation).toMatch(/^Familienbeitrag für Sophie, Lena und Mia → /);
    // Keine eigenen Zeilen der drei (die übrigen Zeilen sind die Mitglieder der Benutzerkonten).
    const krueger = [sophie.id, lena.id, mia.id];
    expect(result.charges.filter((c) => !c.family && krueger.includes(c.memberId))).toEqual([]);
    expect(result.covered.map((c) => c.memberId).sort()).toEqual(
      [sophie.id, lena.id, mia.id].sort(),
    );
    // Karte „Beitrag“ von Lena: über die Familie, Zahler Sophie.
    const card = (await getMemberFee(ctx.board, lena.id))!;
    expect(card.charge).toBeNull();
    expect(card.familyCharges.map((c) => c.family?.id)).toEqual([id]);
    expect(card.family?.name).toBe("Familie Krüger");
    expect(card.family?.payer.id).toBe(sophie.id);
    const payerCard = (await getMemberFee(ctx.board, sophie.id))!;
    expect(payerCard.paysForFamilies).toEqual([{ id, name: "Familie Krüger" }]);
  });

  it("ein Mitglied ist an einem Tag in höchstens einer Familie (FAMILY_OVERLAP); nacheinander geht", async () => {
    const { ctx, familyType, sophie, lena, mia, person } = await setup();
    const tom = await person("Tom");
    const first = await createFamily(ctx.board, {
      name: "Familie Krüger",
      feeTypeId: familyType.id,
      payerMemberId: sophie.id,
      memberIds: [sophie.id, lena.id, mia.id],
      validFrom: iso(daysAgo(30)),
    });
    expect(
      await failure(
        createFamily(ctx.board, {
          name: "Familie Weber",
          feeTypeId: familyType.id,
          payerMemberId: tom.id,
          memberIds: [tom.id, mia.id],
          validFrom: iso(today()),
        }),
      ),
    ).toMatch(/Mia Krüger ist schon in „Familie Krüger“ – bitte dort zuerst austragen/);
    // Die Datenbank sichert es auch ohne Vorabprüfung.
    const second = await prisma.feeFamily.create({
      data: {
        clubId: sophie.clubId,
        name: "Familie Weber",
        feeTypeId: familyType.id,
        payerMemberId: tom.id,
      },
    });
    await expect(
      prisma.feeFamilyMember.create({
        data: {
          clubId: sophie.clubId,
          familyId: second.id,
          memberId: mia.id,
          validFrom: today(),
        },
      }),
    ).rejects.toThrow(/FeeFamilyMember_no_overlap/);
    // Nacheinander: Mia bis gestern bei Krüger, ab heute bei Weber.
    const families = await listFamilies(ctx.board);
    const miaRow = families
      .find((f) => f.id === first.id)!
      .members.find((m) => m.memberId === mia.id)!;
    await endFamilyMember(ctx.board, { id: miaRow.id, validTo: iso(daysAgo(1)) });
    await addFamilyMember(ctx.board, {
      familyId: second.id,
      memberId: mia.id,
      validFrom: iso(today()),
    });
    expect(await prisma.feeFamilyMember.count({ where: { memberId: mia.id } })).toBe(2);
  });

  it("keine Zahler-Ketten: Familienzahler ohne eigenen Zahler, und er bekommt keinen", async () => {
    const { ctx, familyType, sophie, lena, mia, person } = await setup();
    const opa = await person("Opa");
    await updateMemberFinance(ctx.board, {
      memberId: sophie.id,
      payerMemberId: opa.id,
      paymentMethod: "TRANSFER",
    });
    expect(
      await failure(
        createFamily(ctx.board, {
          name: "Familie Krüger",
          feeTypeId: familyType.id,
          payerMemberId: sophie.id,
          memberIds: [sophie.id, lena.id, mia.id],
          validFrom: iso(today()),
        }),
      ),
    ).toMatch(/zahlt schon jemand anderes/);
    // Datenbank: Familie mit diesem Zahler wird abgelehnt.
    await expect(
      prisma.feeFamily.create({
        data: {
          clubId: sophie.clubId,
          name: "Familie Krüger",
          feeTypeId: familyType.id,
          payerMemberId: sophie.id,
        },
      }),
    ).rejects.toThrow(/PAYER_CHAIN/);
    // Umgekehrt: Wer für eine Familie zahlt, bekommt keinen eigenen Zahler.
    await createFamily(ctx.board, {
      name: "Familie Krüger",
      feeTypeId: familyType.id,
      payerMemberId: lena.id,
      memberIds: [lena.id, mia.id],
      validFrom: iso(today()),
    });
    expect(
      await failure(
        updateMemberFinance(ctx.board, {
          memberId: lena.id,
          payerMemberId: opa.id,
          paymentMethod: "TRANSFER",
        }),
      ),
    ).toMatch(/PAYER_CHAIN|braucht selbst keinen Zahler/);
  });

  it("nur eine Beitragsart der Art „Familienbeitrag“", async () => {
    const { ctx, sophie, lena } = await setup();
    const adults = await prisma.feeType.findFirstOrThrow({ where: { name: "Erwachsene" } });
    expect(
      await failure(
        createFamily(ctx.board, {
          name: "Familie Krüger",
          feeTypeId: adults.id,
          payerMemberId: sophie.id,
          memberIds: [sophie.id, lena.id],
          validFrom: iso(today()),
        }),
      ),
    ).toMatch(/Familienbeitrag/);
    await expect(
      prisma.feeFamily.create({
        data: {
          clubId: sophie.clubId,
          name: "Familie Krüger",
          feeTypeId: adults.id,
          payerMemberId: sophie.id,
        },
      }),
    ).rejects.toThrow(/FAMILY_TYPE/);
  });

  it("Verlauf bleibt: austragen statt löschen; heute eingetragen lässt sich entfernen; auflösen", async () => {
    const { club, ctx, familyType, sophie, lena, mia, kid } = await setup();
    const { id } = await createFamily(ctx.board, {
      name: "Familie Krüger",
      feeTypeId: familyType.id,
      payerMemberId: sophie.id,
      memberIds: [sophie.id, lena.id],
      validFrom: iso(daysAgo(60)),
    });
    // Ein Eintrag, der seit Wochen gilt und nicht heute erfasst wurde.
    const old = await prisma.feeFamilyMember.create({
      data: {
        clubId: club.id,
        familyId: id,
        memberId: mia.id,
        validFrom: daysAgo(60),
        createdAt: daysAgo(60),
      },
    });
    expect(await failure(deleteFamilyMember(ctx.board, { id: old.id }))).toMatch(
      /bleibt im Verlauf/,
    );
    await expect(prisma.feeFamilyMember.delete({ where: { id: old.id } })).rejects.toThrow(
      /FEE_HISTORY_LOCKED/,
    );
    await expect(
      prisma.feeFamilyMember.update({ where: { id: old.id }, data: { validFrom: daysAgo(10) } }),
    ).rejects.toThrow(/FEE_HISTORY_LOCKED/);
    await endFamilyMember(ctx.board, { id: old.id, validTo: iso(daysAgo(1)) });
    expect(
      await failure(endFamilyMember(ctx.board, { id: old.id, validTo: iso(today()) })),
    ).toMatch(/nur früher/);
    // Heute hinzugefügt (vertippt): entfernen geht.
    const paul = await kid("Paul");
    await addFamilyMember(ctx.board, {
      familyId: id,
      memberId: paul.id,
      validFrom: iso(daysAgo(5)),
    });
    const paulRow = await prisma.feeFamilyMember.findFirstOrThrow({ where: { memberId: paul.id } });
    await deleteFamilyMember(ctx.board, { id: paulRow.id });
    // Auflösen: offene Einträge enden, künftige entfallen.
    const max = await kid("Max");
    await addFamilyMember(ctx.board, {
      familyId: id,
      memberId: max.id,
      validFrom: iso(daysAhead(10)),
    });
    await dissolveFamily(ctx.board, { id, validTo: iso(daysAgo(1)) });
    const rows = await prisma.feeFamilyMember.findMany({ where: { familyId: id } });
    expect(rows.every((r) => r.validTo !== null)).toBe(true);
    expect(rows.some((r) => r.memberId === max.id)).toBe(false);
    const families = await listFamilies(ctx.board);
    expect(families.find((f) => f.id === id)!.dissolved).toBe(true);
    // Aufgelöst, aber noch bearbeitbar (z. B. ein gelöschter Zahler für frühere Zeiträume).
    await updateFamily(ctx.board, {
      id,
      name: "Familie Krüger (alt)",
      feeTypeId: familyType.id,
      payerMemberId: sophie.id,
    });
  });

  it("Anonymisierung trägt aus der Familie aus (frühere Zeiträume bleiben)", async () => {
    const { club, ctx, familyType, sophie, lena, mia } = await setup();
    const { id } = await createFamily(ctx.board, {
      name: "Familie Krüger",
      feeTypeId: familyType.id,
      payerMemberId: sophie.id,
      memberIds: [sophie.id, lena.id, mia.id],
      validFrom: iso(daysAgo(30)),
    });
    await prisma.$transaction((tx) => anonymizeMemberData(tx, club.id, mia.id, new Date()));
    const row = await prisma.feeFamilyMember.findFirstOrThrow({
      where: { familyId: id, memberId: mia.id },
    });
    expect(row.validTo?.getTime()).toBe(today().getTime());
  });

  it("Auflösen zu einem künftigen Tag: läuft bis dahin weiter, der Zahler bleibt ohne eigenen Zahler", async () => {
    const { ctx, familyType, sophie, lena, mia, person } = await setup();
    const { id } = await createFamily(ctx.board, {
      name: "Familie Krüger",
      feeTypeId: familyType.id,
      payerMemberId: sophie.id,
      memberIds: [sophie.id, lena.id, mia.id],
      validFrom: iso(daysAgo(30)),
    });
    await dissolveFamily(ctx.board, { id, validTo: iso(daysAhead(40)) });
    const family = (await listFamilies(ctx.board)).find((f) => f.id === id)!;
    expect(family.dissolved).toBe(false);
    expect(family.endsOn?.getTime()).toBe(daysAhead(40).getTime());
    // Weiter bearbeitbar, und Sophie bekommt keinen eigenen Zahler, solange die Familie läuft.
    await addFamilyMember(ctx.board, {
      familyId: id,
      memberId: (await person("Max")).id,
      validFrom: iso(today()),
    });
    const opa = await person("Opa");
    expect(
      await failure(
        updateMemberFinance(ctx.board, {
          memberId: sophie.id,
          payerMemberId: opa.id,
          paymentMethod: "TRANSFER",
        }),
      ),
    ).toMatch(/braucht selbst keinen Zahler/);
    expect((await getMemberFee(ctx.board, sophie.id))!.paysForFamilies.map((f) => f.id)).toEqual([
      id,
    ]);
  });

  it("Wechsel in eine andere Familie: Meldung nennt den ersten freien Tag", async () => {
    const { ctx, familyType, sophie, lena, mia, person } = await setup();
    const first = await createFamily(ctx.board, {
      name: "Familie Krüger",
      feeTypeId: familyType.id,
      payerMemberId: sophie.id,
      memberIds: [sophie.id, lena.id, mia.id],
      validFrom: iso(daysAgo(30)),
    });
    const tom = await person("Tom");
    const eva = await person("Eva");
    const second = await createFamily(ctx.board, {
      name: "Familie Weber",
      feeTypeId: familyType.id,
      payerMemberId: tom.id,
      memberIds: [tom.id, eva.id],
      validFrom: iso(daysAgo(30)),
    });
    const miaRow = (await listFamilies(ctx.board))
      .find((f) => f.id === first.id)!
      .members.find((m) => m.memberId === mia.id)!;
    await endFamilyMember(ctx.board, { id: miaRow.id, validTo: iso(today()) });
    expect(
      await failure(
        addFamilyMember(ctx.board, {
          familyId: second.id,
          memberId: mia.id,
          validFrom: iso(today()),
        }),
      ),
    ).toMatch(/bis einschließlich .* in „Familie Krüger“ – bitte frühestens den .* wählen/);
    await addFamilyMember(ctx.board, {
      familyId: second.id,
      memberId: mia.id,
      validFrom: iso(daysAhead(1)),
    });
  });

  it("Anlegen prüft die Auswahl der Reihe nach – dieselben Meldungen wie bei der Prüfung je Mitglied", async () => {
    const { club, ctx, familyType, sophie, lena, mia, person } = await setup();
    const tom = await person("Tom");
    const eva = await person("Eva");
    const ben = await person("Ben");
    const weber = await createFamily(ctx.board, {
      name: "Familie Weber",
      feeTypeId: familyType.id,
      payerMemberId: tom.id,
      memberIds: [tom.id, eva.id],
      validFrom: iso(daysAgo(30)),
    });
    const tomRow = await prisma.feeFamilyMember.findFirstOrThrow({
      where: { familyId: weber.id, memberId: tom.id },
    });
    await endFamilyMember(ctx.board, { id: tomRow.id, validTo: iso(today()) });
    // Tom ist außerdem ab in 5 Tagen bei Schmidt geplant – maßgeblich ist der früheste Eintrag (Weber, bis heute).
    // Mia ist bei Schmidt ab in 10 Tagen geplant (liegt in der Zukunft, lässt sich also noch entfernen).
    const schmidt = await prisma.feeFamily.create({
      data: {
        clubId: club.id,
        name: "Familie Schmidt",
        feeTypeId: familyType.id,
        payerMemberId: ben.id,
      },
    });
    await prisma.feeFamilyMember.createMany({
      data: [
        { clubId: club.id, familyId: schmidt.id, memberId: tom.id, validFrom: daysAhead(5) },
        { clubId: club.id, familyId: schmidt.id, memberId: mia.id, validFrom: daysAhead(10) },
      ],
    });
    const alt = await person("Alt");
    await prisma.member.update({ where: { id: alt.id }, data: { archivedAt: new Date() } });
    const other = await setup("Anderer Verein");

    const attempt = (memberIds: string[]) =>
      failure(
        createFamily(ctx.board, {
          name: "Familie Krüger",
          feeTypeId: familyType.id,
          payerMemberId: sophie.id,
          memberIds,
          validFrom: iso(today()),
        }),
      );
    // Wer in der Auswahl zuerst kommt, bestimmt die Meldung.
    expect(await attempt([sophie.id, alt.id, tom.id])).toMatch(
      /Alt Krüger ist nicht mehr aktiv – bitte aus der Liste nehmen\./,
    );
    expect(await attempt([sophie.id, tom.id, alt.id])).toMatch(
      new RegExp(
        `Tom Krüger ist bis einschließlich ${formatCalendarDate(today())} in „Familie Weber“ – bitte frühestens den ${formatCalendarDate(daysAhead(1))} wählen\\.`,
      ),
    );
    expect(await attempt([lena.id, mia.id, tom.id])).toMatch(
      new RegExp(
        `Mia Krüger ist ab ${formatCalendarDate(daysAhead(10))} für „Familie Schmidt“ eingetragen – bitte den Eintrag dort zuerst entfernen\\.`,
      ),
    );
    // Unbekannt oder aus einem anderen Verein: „gibt es nicht mehr“.
    for (const missing of ["gibt-es-nicht", other.lena.id])
      expect(await attempt([sophie.id, missing, tom.id])).toMatch(
        /Ein ausgewähltes Mitglied gibt es nicht mehr – bitte die Liste prüfen\./,
      );
    // Ab dem Tag nach Weber: Tom ist ab in 5 Tagen bei Schmidt (liegt in der Zukunft, lässt sich also noch entfernen) –
    // „dort zuerst entfernen“.
    expect(
      await failure(
        createFamily(ctx.board, {
          name: "Familie Krüger",
          feeTypeId: familyType.id,
          payerMemberId: sophie.id,
          memberIds: [sophie.id, tom.id],
          validFrom: iso(daysAhead(1)),
        }),
      ),
    ).toMatch(/Tom Krüger ist ab .* für „Familie Schmidt“ eingetragen – bitte den Eintrag dort/);
    // Ida gehört seit zehn Tagen zu Schmidt (nicht heute erfasst, lässt sich also nicht mehr entfernen) – wer davor
    // beginnen will, muss sie dort austragen.
    const ida = await person("Ida");
    await prisma.feeFamilyMember.create({
      data: {
        clubId: club.id,
        familyId: schmidt.id,
        memberId: ida.id,
        validFrom: daysAgo(10),
        createdAt: daysAgo(10),
      },
    });
    expect(
      await failure(
        createFamily(ctx.board, {
          name: "Familie Krüger",
          feeTypeId: familyType.id,
          payerMemberId: sophie.id,
          memberIds: [sophie.id, ida.id],
          validFrom: iso(daysAgo(30)),
        }),
      ),
    ).toBe(
      `Ida Krüger ist ab ${formatCalendarDate(daysAgo(10))} in „Familie Schmidt“ – bitte dort zuerst austragen.`,
    );
    expect(
      await prisma.feeFamily.count({ where: { clubId: club.id, name: "Familie Krüger" } }),
    ).toBe(0);

    // Gelingt: alle ab dem Tag, Protokoll mit den Namen in der Reihenfolge der Auswahl.
    const { id } = await createFamily(ctx.board, {
      name: "Familie Krüger",
      feeTypeId: familyType.id,
      payerMemberId: sophie.id,
      memberIds: [lena.id, sophie.id],
      validFrom: iso(today()),
    });
    const rows = await prisma.feeFamilyMember.findMany({ where: { familyId: id } });
    expect(rows.map((r) => r.memberId).sort()).toEqual([lena.id, sophie.id].sort());
    expect(
      rows.every((r) => r.validFrom.getTime() === today().getTime() && r.validTo === null),
    ).toBe(true);
    expect(rows.every((r) => r.createdById === ctx.board.userId)).toBe(true);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "finance.family_created", entityId: id },
    });
    expect(audit.summary).toBe(
      `Familie „Familie Krüger“ angelegt (Lena Krüger, Sophie Krüger ab ${formatCalendarDate(today())})`,
    );
  });

  it("Auflösen: offene Einträge enden zum Tag, künftige entfallen, beendete bleiben – ein Fehler ändert nichts", async () => {
    const { club, ctx, familyType, sophie, lena, mia, kid } = await setup();
    const { id } = await createFamily(ctx.board, {
      name: "Familie Krüger",
      feeTypeId: familyType.id,
      payerMemberId: sophie.id,
      memberIds: [sophie.id, lena.id, mia.id],
      validFrom: iso(daysAgo(60)),
    });
    const lenaRow = await prisma.feeFamilyMember.findFirstOrThrow({
      where: { familyId: id, memberId: lena.id },
    });
    await endFamilyMember(ctx.board, { id: lenaRow.id, validTo: iso(daysAgo(20)) });
    const max = await kid("Max");
    await addFamilyMember(ctx.board, {
      familyId: id,
      memberId: max.id,
      validFrom: iso(daysAhead(10)),
    });
    // Paul gehört seit drei Tagen dazu (nicht heute erfasst) – vor seinem Beginn lässt sich nicht auflösen.
    const paul = await kid("Paul");
    await prisma.feeFamilyMember.create({
      data: {
        clubId: club.id,
        familyId: id,
        memberId: paul.id,
        validFrom: daysAgo(3),
        createdAt: daysAgo(3),
      },
    });
    const snapshot = () =>
      prisma.feeFamilyMember.findMany({ where: { familyId: id }, orderBy: { id: "asc" } });
    const before = await snapshot();

    expect(await failure(dissolveFamily(ctx.board, { id, validTo: iso(daysAgo(5)) }))).toMatch(
      new RegExp(
        `Paul Krüger ist erst ab ${formatCalendarDate(daysAgo(3))} in der Familie – bitte einen späteren Tag wählen\\.`,
      ),
    );
    expect(await snapshot()).toEqual(before);
    expect((await prisma.feeFamily.findUniqueOrThrow({ where: { id } })).archivedAt).toBeNull();

    await dissolveFamily(ctx.board, { id, validTo: iso(daysAgo(2)) });
    const after = new Map((await snapshot()).map((row) => [row.memberId, row]));
    expect([...after.keys()].sort()).toEqual([sophie.id, lena.id, mia.id, paul.id].sort()); // Max entfällt
    for (const memberId of [sophie.id, mia.id, paul.id])
      expect(after.get(memberId)).toMatchObject({
        validTo: daysAgo(2),
        endedById: ctx.board.userId,
      });
    // Lena war schon früher ausgetragen: unverändert.
    expect(after.get(lena.id)).toEqual(before.find((row) => row.memberId === lena.id));
    expect((await prisma.feeFamily.findUniqueOrThrow({ where: { id } })).archivedAt).not.toBeNull();
  });

  it("Anonymisierung des letzten: Familie heißt neutral, ist aufgelöst, Protokoll ohne Namen", async () => {
    const { club, ctx, familyType, sophie, lena } = await setup();
    const { id } = await createFamily(ctx.board, {
      name: "Familie Krüger",
      feeTypeId: familyType.id,
      payerMemberId: sophie.id,
      memberIds: [sophie.id, lena.id],
      validFrom: iso(daysAgo(30)),
    });
    await prisma.$transaction((tx) => anonymizeMemberData(tx, club.id, lena.id, new Date()));
    expect((await prisma.feeFamily.findUniqueOrThrow({ where: { id } })).name).toBe(
      "Familie Krüger",
    );
    await prisma.$transaction((tx) => anonymizeMemberData(tx, club.id, sophie.id, new Date()));
    const family = await prisma.feeFamily.findUniqueOrThrow({ where: { id } });
    expect(family.name).toBe("Familie (anonymisiert)");
    expect(family.archivedAt).not.toBeNull();
    const audit = await prisma.auditLog.findMany({
      where: { entityType: "FeeFamily", entityId: id },
    });
    expect(audit.some((a) => (a.summary ?? "").includes("Krüger"))).toBe(false);
  });

  it("Karte: Hinweis der eigenen Familie; nach dem Austragen zahlt das Mitglied selbst", async () => {
    const { ctx, familyType, sophie, lena } = await setup();
    // Zu klein: Oma ist Ehrenmitglied, nur zwei zahlen, der Familienbeitrag verlangt drei.
    const oma = await prisma.member.create({
      data: {
        clubId: sophie.clubId,
        firstName: "Oma",
        lastName: "Krüger",
        joinedAt: new Date(Date.UTC(2010, 0, 1)),
        status: "HONORARY",
      },
    });
    const { id } = await createFamily(ctx.board, {
      name: "Familie Krüger",
      feeTypeId: familyType.id,
      payerMemberId: sophie.id,
      memberIds: [sophie.id, lena.id, oma.id],
      validFrom: `${today().getUTCFullYear() - 1}-01-01`,
    });
    const card = (await getMemberFee(ctx.board, lena.id))!;
    expect(card.familyCharges).toEqual([]);
    expect(card.warnings.join(" ")).toMatch(/weniger als 3 Mitglieder/);
    // Lena verlässt die Familie: Ihr eigener Beitrag geht danach nicht mehr an Sophie.
    const lenaRow = (await listFamilies(ctx.board))
      .find((f) => f.id === id)!
      .members.find((m) => m.memberId === lena.id)!;
    await prisma.feeFamilyMember.update({
      where: { id: lenaRow.id },
      data: { validTo: daysAgo(400) },
    });
    const after = (await getMemberFee(ctx.board, lena.id))!;
    expect(after.charge?.payerMemberId).toBe(lena.id);
  });

  it("Rechte und Mandanten: Mitglieder dürfen nichts, andere Vereine sehen nichts", async () => {
    const { ctx, familyType, sophie, lena, mia } = await setup();
    const { id } = await createFamily(ctx.board, {
      name: "Familie Krüger",
      feeTypeId: familyType.id,
      payerMemberId: sophie.id,
      memberIds: [sophie.id, lena.id, mia.id],
      validFrom: iso(today()),
    });
    expect(await failure(listFamilies(ctx.member))).toMatch(/Berechtigung|Zugriff|darf/i);
    expect(
      await failure(
        addFamilyMember(ctx.member, { familyId: id, memberId: sophie.id, validFrom: iso(today()) }),
      ),
    ).toMatch(/Berechtigung|Zugriff|darf/i);
    const other = await setup("Anderer Verein");
    expect(await listFamilies(other.ctx.board)).toEqual([]);
    expect(
      await failure(
        addFamilyMember(other.ctx.board, {
          familyId: id,
          memberId: other.sophie.id,
          validFrom: iso(today()),
        }),
      ),
    ).toMatch(/nicht gefunden|Familie/);
    // Fremdes Mitglied in die eigene Familie: gibt es hier nicht.
    expect(
      await failure(
        addFamilyMember(ctx.board, {
          familyId: id,
          memberId: other.mia.id,
          validFrom: iso(today()),
        }),
      ),
    ).toMatch(/Mitglied/);
  });
});
