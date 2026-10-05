import { describe, expect, it } from "vitest";
import { calculateFees } from "@/modules/fees/engine";
import type {
  EngineFamily,
  EngineFeeType,
  EngineInput,
  EngineMember,
  EnginePreview,
} from "@/modules/fees/engine-types";

/**
 * Familienbeitrag im Rechenkern (Etappe 6): Familie Krüger (Sophie, Lena, Mia) zahlt 25,00 € im Monat ab drei
 * zahlenden Mitgliedern – statt 12 + 6 + 6 = 24 € einzeln. Zeitraum: 4. Quartal 2026.
 */

const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const plain = (text: string) => text.replace(/\u00a0/g, " ");

function feeType(over: Partial<EngineFeeType> & Pick<EngineFeeType, "id" | "name">): EngineFeeType {
  return {
    kind: "BASE",
    departmentId: null,
    statuses: [],
    minAge: null,
    maxAge: null,
    priority: 50,
    archived: false,
    rates: [],
    ...over,
  };
}
const rate = (id: string, amountCents: number, validFrom = day(2020, 1, 1)) => ({
  id,
  amountCents,
  interval: "MONTHLY" as const,
  validFrom,
});

const ADULT = feeType({
  id: "ft-adult",
  name: "Erwachsene",
  priority: 30,
  rates: [rate("r-a", 1200)],
});
const YOUTH = feeType({
  id: "ft-youth",
  name: "Jugend",
  priority: 10,
  maxAge: 17,
  rates: [rate("r-y", 600)],
});
const FAMILY = feeType({
  id: "ft-family",
  name: "Familienbeitrag",
  kind: "FAMILY",
  familyMinMembers: 3,
  rates: [rate("r-f", 2500)],
});
const TENNIS = feeType({
  id: "ft-tennis",
  name: "Tennis",
  kind: "ADDITIONAL",
  departmentId: "tennis",
  rates: [rate("r-t", 300)],
});

function member(over: Partial<EngineMember> & Pick<EngineMember, "id" | "name">): EngineMember {
  return {
    shortName: over.name.split(" ")[0],
    birthDate: day(1980, 5, 5),
    joinedAt: day(2010, 1, 1),
    leftAt: null,
    status: "ACTIVE",
    inactive: false,
    statusHistory: [{ status: "ACTIVE", validFrom: day(2010, 1, 1), createdAt: day(2010, 1, 1) }],
    departments: [],
    assignments: [],
    payerMemberId: null,
    paymentMethod: "TRANSFER",
    ...over,
  };
}

const sophie = member({ id: "sophie", name: "Sophie Krüger", paymentMethod: "DIRECT_DEBIT" });
const lena = member({ id: "lena", name: "Lena Krüger", birthDate: day(2012, 3, 3) });
const mia = member({ id: "mia", name: "Mia Krüger", birthDate: day(2015, 7, 7) });

function family(over: Partial<EngineFamily> = {}): EngineFamily {
  return {
    id: "fam",
    name: "Familie Krüger",
    feeTypeId: FAMILY.id,
    payerMemberId: "sophie",
    members: ["sophie", "lena", "mia"].map((memberId) => ({
      memberId,
      validFrom: day(2026, 1, 1),
      validTo: null,
    })),
    ...over,
  };
}

function run(
  members: EngineMember[],
  families: EngineFamily[],
  feeTypes: EngineFeeType[] = [ADULT, YOUTH, FAMILY, TENNIS],
): EnginePreview {
  const input: EngineInput = {
    periodStart: day(2026, 10, 1),
    periodEnd: day(2026, 12, 31),
    feeTypes,
    settings: {
      proRataEntry: "DAY",
      proRataExit: "DAY",
      ageRule: "EXACT_DAY",
      missingBirthDateAsAdult: true,
      minDebitCents: 500,
    },
    members,
    families,
  };
  return calculateFees(input);
}

const familyCharge = (preview: EnginePreview) => preview.charges.find((c) => c.family !== null);
const ownCharge = (preview: EnginePreview, id: string) =>
  preview.charges.find((c) => c.family === null && c.memberId === id);
const codes = (preview: EnginePreview) => preview.warnings.map((w) => w.code);

describe("Familienbeitrag", () => {
  it("ganzer Zeitraum: eine Zeile 75,00 €, Zahler Sophie, die drei ohne eigene Zeile", () => {
    const preview = run([sophie, lena, mia], [family()]);
    const charge = familyCharge(preview)!;
    expect(charge.amountCents).toBe(7_500);
    expect(charge.key).toBe("f:fam");
    expect(charge.memberName).toBe("Familie Krüger");
    expect(charge.payerMemberId).toBe("sophie");
    expect(charge.payerName).toBe("Sophie Krüger");
    expect(charge.paymentMethod).toBe("DIRECT_DEBIT");
    expect(charge.family?.members.map((m) => m.id)).toEqual(["sophie", "lena", "mia"]);
    expect(plain(charge.explanation)).toBe("Familienbeitrag für Sophie, Lena und Mia → 75,00 €");
    expect(preview.charges).toHaveLength(1);
    expect(preview.covered.map((c) => c.memberId)).toEqual(["lena", "mia", "sophie"]);
    expect(preview.covered[0]!.familyName).toBe("Familie Krüger");
    expect(preview.totalCents).toBe(7_500);
    expect(preview.warnings).toEqual([]);
  });

  it("ein Mitglied kommt später dazu: Familienbeitrag erst ab dann, davor jedes einzeln", () => {
    const later = family({
      members: [
        { memberId: "sophie", validFrom: day(2026, 1, 1), validTo: null },
        { memberId: "lena", validFrom: day(2026, 1, 1), validTo: null },
        { memberId: "mia", validFrom: day(2026, 11, 1), validTo: null },
      ],
    });
    const preview = run([sophie, lena, mia], [later]);
    expect(familyCharge(preview)!.amountCents).toBe(5_000);
    expect(plain(familyCharge(preview)!.explanation)).toBe(
      "Familienbeitrag für Sophie, Lena und Mia (01.11.–31.12.), sonst zu wenige Mitglieder – dann zahlt jedes einzeln → 50,00 €",
    );
    expect(ownCharge(preview, "sophie")!.amountCents).toBe(1_200);
    expect(ownCharge(preview, "lena")!.amountCents).toBe(600);
    expect(plain(ownCharge(preview, "lena")!.explanation)).toBe(
      "Jugend bis 31.10., danach über den Familienbeitrag (Familie Krüger) → 6,00 €",
    );
    // Die Kinder zahlt der Zahler der Familie.
    expect(ownCharge(preview, "lena")!.payerMemberId).toBe("sophie");
    expect(ownCharge(preview, "lena")!.paymentMethod).toBe("DIRECT_DEBIT");
    expect(ownCharge(preview, "mia")!.amountCents).toBe(600);
    expect(preview.totalCents).toBe(5_000 + 1_200 + 600 + 600);
  });

  it("die Familie fällt mitten im Zeitraum unter die Mindestzahl: ab dann zahlt jedes einzeln", () => {
    const leaving = { ...mia, leftAt: day(2026, 11, 15) };
    const preview = run([sophie, lena, leaving], [family()]);
    // 25 € im Oktober + 25 × 15/30 im November.
    expect(familyCharge(preview)!.amountCents).toBe(3_750);
    expect(familyCharge(preview)!.lines.map((l) => [l.text, l.amountCents])).toEqual([
      ["Familienbeitrag, 01.10.–15.11.", 3_750],
    ]);
    // Sophie: 12 × 15/30 + 12; Lena: 6 × 15/30 + 6.
    expect(ownCharge(preview, "sophie")!.amountCents).toBe(1_800);
    expect(ownCharge(preview, "lena")!.amountCents).toBe(900);
    expect(ownCharge(preview, "mia")).toBeUndefined();
    expect(preview.covered.map((c) => c.memberId)).toEqual(["mia"]);
    expect(codes(preview)).toEqual([]);
  });

  it("alle ausgetreten: kein Familienbeitrag, kein Hinweis", () => {
    const gone = (m: EngineMember) => ({
      ...m,
      status: "LEFT" as const,
      leftAt: day(2025, 12, 31),
    });
    const preview = run([gone(sophie), gone(lena), gone(mia)], [family()]);
    expect(preview.charges).toEqual([]);
    expect(preview.warnings).toEqual([]);
  });

  it("Zahler archiviert: Familienbeitrag bleibt, Hinweis an der Familie, Zahlweg Überweisung", () => {
    const preview = run(
      [{ ...sophie, inactive: true }, lena, mia, member({ id: "x", name: "Xaver" })],
      [
        family({
          members: ["lena", "mia", "x"].map((memberId) => ({
            memberId,
            validFrom: day(2026, 1, 1),
            validTo: null,
          })),
        }),
      ],
    );
    const charge = familyCharge(preview)!;
    expect(charge.amountCents).toBe(7_500);
    expect(charge.paymentMethod).toBe("TRANSFER");
    const warning = preview.warnings.find((w) => w.code === "PAYER_NOT_MEMBER")!;
    expect(warning.familyId).toBe("fam");
    expect(warning.text).toContain("archiviert oder gelöscht");
  });

  it("unbekannter Zahler: Hinweis, „unbekannter Zahler“", () => {
    const preview = run(
      [lena, mia, member({ id: "x", name: "Xaver" })],
      [
        family({
          payerMemberId: "niemand",
          members: ["lena", "mia", "x"].map((memberId) => ({
            memberId,
            validFrom: day(2026, 1, 1),
            validTo: null,
          })),
        }),
      ],
    );
    expect(familyCharge(preview)!.payerName).toBe("unbekannter Zahler");
    expect(codes(preview)).toContain("PAYER_NOT_MEMBER");
  });

  it("Ehrenmitglied zählt nicht mit: zu klein, jedes zahlt einzeln, Hinweis", () => {
    const honorary = {
      ...mia,
      status: "HONORARY" as const,
      statusHistory: [
        { status: "HONORARY" as const, validFrom: day(2010, 1, 1), createdAt: day(2010, 1, 1) },
      ],
    };
    const preview = run([sophie, lena, honorary], [family()]);
    expect(familyCharge(preview)).toBeUndefined();
    expect(ownCharge(preview, "sophie")!.amountCents).toBe(3_600);
    expect(preview.warnings.map((w) => [w.code, w.familyId])).toEqual([
      ["FAMILY_TOO_SMALL", "fam"],
    ]);
  });

  it("Familienbeitrag archiviert: Hinweis, die Mitglieder zahlen einzeln", () => {
    const preview = run(
      [sophie, lena, mia],
      [family()],
      [ADULT, YOUTH, { ...FAMILY, archived: true }],
    );
    expect(familyCharge(preview)).toBeUndefined();
    expect(preview.totalCents).toBe(3_600 + 1_800 + 1_800);
    expect(codes(preview)).toEqual(["FAMILY_NOT_APPLIED"]);
  });

  it("Familienbeitrag erst ab 01.11.: davor einzeln, Hinweis", () => {
    const fromNovember = { ...FAMILY, rates: [rate("r-f", 2500, day(2026, 11, 1))] };
    const preview = run([sophie, lena, mia], [family()], [ADULT, YOUTH, fromNovember]);
    expect(familyCharge(preview)!.amountCents).toBe(5_000);
    expect(ownCharge(preview, "sophie")!.amountCents).toBe(1_200);
    expect(codes(preview)).toEqual(["FAMILY_NOT_APPLIED"]);
  });

  it("Ermäßigung entfällt, solange der Familienbeitrag gilt; Zusatzbeitrag bleibt beim Mitglied", () => {
    const discounted = {
      ...lena,
      departments: [{ departmentId: "tennis", since: null }],
      assignments: [
        {
          id: "d1",
          kind: "DISCOUNT_PERCENT" as const,
          feeTypeId: null,
          percentBp: 5_000,
          amountCents: null,
          validFrom: day(2020, 1, 1),
          validTo: null,
          reason: "Geschwister",
        },
      ],
    };
    const preview = run([sophie, discounted, mia], [family()]);
    expect(familyCharge(preview)!.amountCents).toBe(7_500);
    const own = ownCharge(preview, "lena")!;
    expect(own.amountCents).toBe(900);
    expect(own.lines.map((l) => l.text)).toEqual(["Tennis"]);
    expect(plain(own.explanation)).toBe(
      "über den Familienbeitrag (Familie Krüger), dazu Tennis → 9,00 €",
    );
    expect(own.payerMemberId).toBe("sophie");
  });

  it("ausdrücklicher Zahler geht vor dem Zahler der Familie", () => {
    const withPayer = {
      ...lena,
      payerMemberId: "opa",
      departments: [{ departmentId: "tennis", since: null }],
    };
    const opa = member({ id: "opa", name: "Opa Krüger" });
    const preview = run([sophie, withPayer, mia, opa], [family()]);
    expect(ownCharge(preview, "lena")!.payerMemberId).toBe("opa");
  });

  it("zwei Familien nacheinander: Mitglied wechselt am 01.12.", () => {
    const first = family({
      members: [
        { memberId: "sophie", validFrom: day(2026, 1, 1), validTo: null },
        { memberId: "lena", validFrom: day(2026, 1, 1), validTo: null },
        { memberId: "mia", validFrom: day(2026, 1, 1), validTo: day(2026, 11, 30) },
      ],
    });
    const second = family({
      id: "fam2",
      name: "Familie Weber",
      payerMemberId: "tom",
      members: ["tom", "eva", "mia"].map((memberId) => ({
        memberId,
        validFrom: memberId === "mia" ? day(2026, 12, 1) : day(2026, 1, 1),
        validTo: null,
      })),
    });
    const tom = member({ id: "tom", name: "Tom Weber" });
    const eva = member({ id: "eva", name: "Eva Weber" });
    const preview = run([sophie, lena, mia, tom, eva], [first, second]);
    expect(preview.charges.find((c) => c.key === "f:fam")!.amountCents).toBe(5_000);
    expect(preview.charges.find((c) => c.key === "f:fam2")!.amountCents).toBe(2_500);
    // Mia: über die Familie Krüger bis 30.11., über die Familie Weber ab 01.12. – keine eigene Zeile.
    expect(ownCharge(preview, "mia")).toBeUndefined();
    expect(preview.covered.find((c) => c.memberId === "mia")!.familyId).toBe("fam");
  });

  it("Familienbeitrag 0,00 €: unter „Beitragsfrei“, Mitglieder ohne eigene Zeile", () => {
    const free = { ...FAMILY, rates: [rate("r-f", 0)] };
    const preview = run([sophie, lena, mia], [family()], [ADULT, YOUTH, free]);
    expect(preview.charges).toEqual([]);
    expect(preview.exempt).toEqual([
      {
        memberId: "sophie",
        memberName: "Familie Krüger",
        familyId: "fam",
        reason: "Familienbeitrag 0,00 € (Familienbeitrag)",
      },
    ]);
  });

  it("Familienbeitrag beginnt am Geburtstag eines Kindes: nirgends das genaue Datum, nur der Monat", () => {
    const KIDS = feeType({
      id: "ft-kids",
      name: "Kinder",
      priority: 5,
      maxAge: 5,
      rates: [rate("r-k", 0)],
    });
    const tom = member({ id: "tom", name: "Tom Krüger", birthDate: day(2020, 11, 15) });
    const two = family({
      feeTypeId: "ft-f2",
      members: ["sophie", "tom"].map((memberId) => ({
        memberId,
        validFrom: day(2026, 1, 1),
        validTo: null,
      })),
    });
    const FAMILY2 = { ...FAMILY, id: "ft-f2", familyMinMembers: 2 };
    const preview = run([sophie, tom], [two], [KIDS, ADULT, YOUTH, FAMILY2]);
    const texts = [
      ...preview.charges.flatMap((c) => [c.explanation, ...c.lines.map((l) => l.text)]),
      ...preview.warnings.map((w) => w.text),
    ].join(" | ");
    expect(texts).not.toMatch(/15\.11\.|14\.11\./);
    expect(plain(familyCharge(preview)!.explanation)).toContain("ab Geburtstag im November");
    expect(plain(ownCharge(preview, "sophie")!.explanation)).toContain(
      "bis Geburtstag im November",
    );
  });

  it("100 % ermäßigt zählt nicht mit: bleibt beitragsfrei, die Familie greift nicht", () => {
    const hardship = {
      ...lena,
      assignments: [
        {
          id: "h1",
          kind: "DISCOUNT_PERCENT" as const,
          feeTypeId: null,
          percentBp: 10_000,
          amountCents: null,
          validFrom: day(2020, 1, 1),
          validTo: null,
          reason: "Härtefall",
        },
      ],
    };
    const two = family({
      members: ["sophie", "lena"].map((memberId) => ({
        memberId,
        validFrom: day(2026, 1, 1),
        validTo: null,
      })),
    });
    const preview = run(
      [sophie, hardship],
      [two],
      [ADULT, YOUTH, { ...FAMILY, familyMinMembers: 2 }],
    );
    expect(familyCharge(preview)).toBeUndefined();
    expect(ownCharge(preview, "sophie")!.amountCents).toBe(3_600);
    expect(preview.exempt.map((e) => e.memberId)).toEqual(["lena"]);
  });

  it("Eintritt „ab Monatsanfang“: Tage vor dem Eintritt zählen schon zur Familie", () => {
    const joining = { ...mia, joinedAt: day(2026, 11, 20) };
    const later = family({
      members: [
        { memberId: "sophie", validFrom: day(2026, 1, 1), validTo: null },
        { memberId: "lena", validFrom: day(2026, 1, 1), validTo: null },
        { memberId: "mia", validFrom: day(2026, 11, 20), validTo: null },
      ],
    });
    const input = {
      periodStart: day(2026, 10, 1),
      periodEnd: day(2026, 12, 31),
      feeTypes: [ADULT, YOUTH, FAMILY],
      settings: {
        proRataEntry: "MONTH_START" as const,
        proRataExit: "DAY" as const,
        ageRule: "EXACT_DAY" as const,
        missingBirthDateAsAdult: true,
        minDebitCents: 500,
      },
      members: [sophie, lena, joining],
      families: [later],
    };
    const preview = calculateFees(input);
    // November und Dezember ganz über die Familie, Mia ohne eigene Zeile.
    expect(familyCharge(preview)!.amountCents).toBe(5_000);
    expect(ownCharge(preview, "mia")).toBeUndefined();
  });

  it("wer die Familie verlassen hat, zahlt seine übrigen Beiträge danach selbst", () => {
    const left = family({
      members: [
        { memberId: "sophie", validFrom: day(2026, 1, 1), validTo: null },
        { memberId: "lena", validFrom: day(2026, 1, 1), validTo: day(2026, 10, 31) },
        { memberId: "mia", validFrom: day(2026, 1, 1), validTo: null },
      ],
    });
    const preview = run(
      [sophie, lena, mia],
      [left],
      [ADULT, YOUTH, { ...FAMILY, familyMinMembers: 2 }],
    );
    expect(ownCharge(preview, "lena")!.payerMemberId).toBe("lena");
    expect(ownCharge(preview, "lena")!.amountCents).toBe(1_200);
  });

  it("gleiche Eingabe, gleiches Ergebnis (auch bei umgekehrter Reihenfolge)", () => {
    const a = run([sophie, lena, mia], [family()]);
    const b = run([mia, lena, sophie], [family()]);
    expect(b).toEqual(a);
  });
});
