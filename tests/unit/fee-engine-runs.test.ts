import { describe, expect, it } from "vitest";
import { calculateFees } from "@/modules/fees/engine";
import {
  COVERAGE_ALWAYS,
  type EngineFamily,
  type EngineFeeType,
  type EngineMember,
  type EnginePreview,
} from "@/modules/fees/engine-types";

/**
 * Rechenkern für den Beitragslauf (Etappe 7): schon abgerechnete Tage fallen weg (kein Tag zweimal), die Aufnahmegebühr
 * kommt einmal im Zeitraum des Eintritts, und jede Zeile sagt, welche Tage sie für wen abdeckt. Zeitraum: 4. Quartal 2026.
 */

const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const plain = (text: string) => text.replace(/ /g, " ");

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
const monthly = (id: string, amountCents: number, validFrom = day(2020, 1, 1)) => ({
  id,
  amountCents,
  interval: "MONTHLY" as const,
  validFrom,
});

const ADULT = feeType({ id: "ft-adult", name: "Erwachsene", rates: [monthly("r-a", 1200)] });
const TENNIS = feeType({
  id: "ft-tennis",
  name: "Tennis",
  kind: "ADDITIONAL",
  departmentId: "tennis",
  rates: [monthly("r-t", 300)],
});
const ADMISSION = feeType({
  id: "ft-adm",
  name: "Aufnahmegebühr",
  kind: "ADMISSION",
  rates: [{ id: "r-adm", amountCents: 2000, interval: "ONCE", validFrom: day(2026, 1, 1) }],
});
const FAMILY = feeType({
  id: "ft-family",
  name: "Familienbeitrag",
  kind: "FAMILY",
  familyMinMembers: 2,
  rates: [monthly("r-f", 1500)],
});

function member(over: Partial<EngineMember> & Pick<EngineMember, "id" | "name">): EngineMember {
  const joinedAt = over.joinedAt === undefined ? day(2010, 1, 1) : over.joinedAt;
  return {
    birthDate: day(1980, 5, 5),
    joinedAt,
    leftAt: null,
    status: "ACTIVE",
    inactive: false,
    statusHistory: [
      { status: "ACTIVE", validFrom: joinedAt ?? day(2010, 1, 1), createdAt: day(2010, 1, 1) },
    ],
    departments: [],
    assignments: [],
    payerMemberId: null,
    paymentMethod: "TRANSFER",
    ...over,
  };
}

function run(
  members: EngineMember[],
  options: {
    feeTypes?: EngineFeeType[];
    families?: EngineFamily[];
    proRataEntry?: "DAY" | "MONTH_START" | "NEXT_MONTH" | "NONE";
    period?: [Date, Date];
  } = {},
): EnginePreview {
  return calculateFees({
    periodStart: options.period?.[0] ?? day(2026, 10, 1),
    periodEnd: options.period?.[1] ?? day(2026, 12, 31),
    feeTypes: options.feeTypes ?? [ADULT, TENNIS, ADMISSION, FAMILY],
    settings: {
      proRataEntry: options.proRataEntry ?? "DAY",
      proRataExit: "DAY",
      ageRule: "EXACT_DAY",
      missingBirthDateAsAdult: true,
      minDebitCents: 500,
    },
    members,
    families: options.families,
  });
}

const chargeOf = (preview: EnginePreview, id: string) =>
  preview.charges.find((c) => c.family === null && c.memberId === id);

describe("Beitragslauf: schon abgerechnete Tage", () => {
  it("Oktober schon berechnet (Monatslauf): das Quartal rechnet nur November und Dezember", () => {
    const hans = member({
      id: "hans",
      name: "Hans Müller",
      coverage: [{ feeGroup: "BASE", from: day(2026, 10, 1), to: day(2026, 10, 31) }],
    });
    const charge = chargeOf(run([hans]), "hans")!;
    expect(charge.amountCents).toBe(2_400);
    expect(plain(charge.explanation)).toBe(
      "schon berechnet bis 31.10., danach Erwachsene → 24,00 €",
    );
    expect(charge.coverage).toEqual([
      {
        memberId: "hans",
        feeGroup: "BASE",
        from: day(2026, 11, 1),
        to: day(2026, 12, 31),
        line: 0,
      },
    ]);
  });

  it("ganz berechnet: keine Zeile, Grund „schon berechnet“", () => {
    const hans = member({
      id: "hans",
      name: "Hans Müller",
      coverage: [{ feeGroup: "BASE", from: day(2026, 7, 1), to: day(2026, 12, 31) }],
    });
    const preview = run([hans]);
    expect(preview.charges).toEqual([]);
    expect(preview.skipped).toEqual([
      { memberId: "hans", memberName: "Hans Müller", reason: "schon berechnet" },
    ]);
  });

  it("Grundbeitrag berechnet, Zusatzbeitrag noch nicht: nur der Zusatzbeitrag", () => {
    const eva = member({
      id: "eva",
      name: "Eva Tennis",
      departments: [{ departmentId: "tennis", since: null }],
      coverage: [{ feeGroup: "BASE", from: day(2026, 10, 1), to: day(2026, 12, 31) }],
    });
    const charge = chargeOf(run([eva]), "eva")!;
    expect(charge.amountCents).toBe(900);
    expect(charge.lines.map((l) => l.text)).toEqual(["Tennis"]);
    expect(charge.coverage.map((c) => c.feeGroup)).toEqual(["ft-tennis"]);
  });

  it("Ermäßigung deckt nichts eigenes ab – nur ihr Grundbeitrag", () => {
    const claudia = member({
      id: "claudia",
      name: "Claudia",
      assignments: [
        {
          id: "d1",
          kind: "DISCOUNT_PERCENT",
          feeTypeId: null,
          percentBp: 5_000,
          amountCents: null,
          validFrom: day(2020, 1, 1),
          validTo: null,
          reason: "Übungsleiterin",
        },
      ],
    });
    const charge = chargeOf(run([claudia]), "claudia")!;
    expect(charge.lines).toHaveLength(2);
    expect(charge.coverage).toEqual([
      {
        memberId: "claudia",
        feeGroup: "BASE",
        from: day(2026, 10, 1),
        to: day(2026, 12, 31),
        line: 0,
      },
    ]);
  });
});

describe("Beitragslauf: Aufnahmegebühr", () => {
  it("Eintritt am 20.11.: Aufnahmegebühr einmal, mit Abdeckung „immer“", () => {
    const neu = member({ id: "neu", name: "Nina Neu", joinedAt: day(2026, 11, 20) });
    const charge = chargeOf(run([neu]), "neu")!;
    const admission = charge.lines.find((l) => l.feeTypeId === "ft-adm")!;
    expect(admission.text).toBe("Aufnahmegebühr (Eintritt am 20.11.2026)");
    expect(admission.amountCents).toBe(2_000);
    expect(plain(charge.explanation)).toMatch(/dazu Aufnahmegebühr 20,00 €/);
    expect(charge.coverage.find((c) => c.feeGroup === "ft-adm")).toMatchObject({
      from: COVERAGE_ALWAYS.from,
      to: COVERAGE_ALWAYS.to,
    });
  });

  it("schon berechnet, Eintritt vor dem Zeitraum, vor dem ersten Betrag oder beitragsfrei: keine", () => {
    const always = { feeGroup: "ft-adm", from: COVERAGE_ALWAYS.from, to: COVERAGE_ALWAYS.to };
    const billed = member({ id: "a", name: "A", joinedAt: day(2026, 11, 20), coverage: [always] });
    const earlier = member({ id: "b", name: "B", joinedAt: day(2026, 9, 1) });
    const exempt = member({
      id: "c",
      name: "C",
      joinedAt: day(2026, 11, 20),
      assignments: [
        {
          id: "e1",
          kind: "EXEMPT",
          feeTypeId: null,
          percentBp: null,
          amountCents: null,
          validFrom: day(2026, 11, 20),
          validTo: null,
          reason: "Härtefall",
        },
      ],
    });
    const preview = run([billed, earlier, exempt]);
    const admissions = preview.charges
      .flatMap((c) => c.lines)
      .filter((l) => l.feeTypeId === "ft-adm");
    expect(admissions).toEqual([]);
    const lateType = {
      ...ADMISSION,
      rates: [
        { id: "r-adm", amountCents: 2000, interval: "ONCE" as const, validFrom: day(2026, 12, 1) },
      ],
    };
    const neu = member({ id: "neu", name: "Nina Neu", joinedAt: day(2026, 11, 20) });
    expect(
      chargeOf(run([neu], { feeTypes: [ADULT, lateType] }), "neu")!.lines.some(
        (l) => l.feeTypeId === "ft-adm",
      ),
    ).toBe(false);
  });
});

describe("Beitragslauf: Familien", () => {
  const sophie = member({ id: "sophie", name: "Sophie Krüger", shortName: "Sophie" });
  const lena = member({ id: "lena", name: "Lena Krüger", shortName: "Lena" });
  const family: EngineFamily = {
    id: "fam",
    name: "Familie Krüger",
    feeTypeId: FAMILY.id,
    payerMemberId: "sophie",
    members: ["sophie", "lena"].map((memberId) => ({
      memberId,
      validFrom: day(2026, 1, 1),
      validTo: null,
    })),
  };

  it("Familienbeitrag deckt die Grundbeiträge beider ab", () => {
    const preview = run([sophie, lena], { families: [family] });
    const charge = preview.charges.find((c) => c.family)!;
    expect(charge.coverage).toEqual([
      {
        memberId: "lena",
        feeGroup: "BASE",
        from: day(2026, 10, 1),
        to: day(2026, 12, 31),
        line: 0,
      },
      {
        memberId: "sophie",
        feeGroup: "BASE",
        from: day(2026, 10, 1),
        to: day(2026, 12, 31),
        line: 0,
      },
    ]);
  });

  it("schon einzeln berechnete Tage zählen nicht für die Familie (kein Tag doppelt)", () => {
    const billed = {
      ...sophie,
      coverage: [{ feeGroup: "BASE", from: day(2026, 10, 1), to: day(2026, 10, 31) }],
    };
    const preview = run([billed, lena], { families: [family] });
    const charge = preview.charges.find((c) => c.family)!;
    // Oktober: nur Lena zahlt → zu wenige; November und Dezember: Familie.
    expect(charge.amountCents).toBe(3_000);
    expect(chargeOf(preview, "lena")!.amountCents).toBe(1_200);
    expect(chargeOf(preview, "sophie")).toBeUndefined();
  });
});

describe("Beitragslauf: Nachlauf mit Familien", () => {
  const member2 = (id: string, name: string, extra: Partial<EngineMember> = {}) =>
    member({ id, name, shortName: name.split(" ")[0], ...extra });
  const billedByFamily = (from = day(2026, 10, 1), to = day(2026, 12, 31)) => [
    { feeGroup: "BASE", from, to, familyId: "fam" },
  ];
  const famWith = (ids: string[], from: Record<string, Date> = {}): EngineFamily => ({
    id: "fam",
    name: "Familie Krüger",
    feeTypeId: FAMILY.id,
    payerMemberId: "sophie",
    members: ids.map((memberId) => ({
      memberId,
      validFrom: from[memberId] ?? day(2026, 1, 1),
      validTo: null,
    })),
  });

  it("ein Kind kommt nach dem Lauf in die Familie: zahlt über die Familie, kein zweiter Familienbeitrag", () => {
    const sophie = member2("sophie", "Sophie Krüger", { coverage: billedByFamily() });
    const lena = member2("lena", "Lena Krüger", { coverage: billedByFamily() });
    const mia = member2("mia", "Mia Krüger", { joinedAt: day(2026, 11, 1) });
    const max = member2("max", "Max Krüger", { joinedAt: day(2026, 11, 1) });
    const families = [
      famWith(["sophie", "lena", "mia", "max"], { mia: day(2026, 11, 1), max: day(2026, 11, 1) }),
    ];
    const preview = run([sophie, lena, mia, max], { families, feeTypes: [ADULT, FAMILY] });
    expect(preview.charges).toEqual([]);
    expect(preview.covered.map((c) => c.memberId).sort()).toEqual(["max", "mia"]);
    expect(preview.warnings).toEqual([]);
  });

  it("Oktober schon über die Familie berechnet, dann Quartal: kein „zu wenige Mitglieder“", () => {
    const october = billedByFamily(day(2026, 10, 1), day(2026, 10, 31));
    const sophie = member2("sophie", "Sophie Krüger", { coverage: october });
    const lena = member2("lena", "Lena Krüger", { coverage: october });
    const preview = run([sophie, lena], { families: [famWith(["sophie", "lena"])] });
    const charge = preview.charges.find((c) => c.family)!;
    expect(charge.amountCents).toBe(3_000);
    expect(plain(charge.explanation)).not.toMatch(/zu wenige/);
  });
});

describe("Beitragslauf: Aufnahmegebühr und Hinweise", () => {
  it("Eintritt „ab dem Folgemonat“: Aufnahmegebühr im Zeitraum des ersten Beitragstags", () => {
    const neu = member({ id: "neu", name: "Nina Neu", joinedAt: day(2026, 10, 15) });
    const october = run([neu], {
      proRataEntry: "NEXT_MONTH",
      period: [day(2026, 10, 1), day(2026, 10, 31)],
    });
    expect(october.charges).toEqual([]);
    const november = run([neu], {
      proRataEntry: "NEXT_MONTH",
      period: [day(2026, 11, 1), day(2026, 11, 30)],
    });
    expect(chargeOf(november, "neu")!.lines.map((l) => l.feeTypeId)).toContain("ft-adm");
  });

  it("Ehrenmitglied beim Eintritt: keine Aufnahmegebühr", () => {
    const honorary = member({
      id: "ehre",
      name: "Ehren Mitglied",
      joinedAt: day(2026, 11, 20),
      status: "HONORARY",
      statusHistory: [
        { status: "HONORARY", validFrom: day(2026, 11, 20), createdAt: day(2026, 11, 20) },
      ],
    });
    const preview = run([honorary]);
    expect(preview.charges).toEqual([]);
    expect(preview.exempt.map((e) => e.memberId)).toEqual(["ehre"]);
  });

  it("ganz schon berechnet: keine Hinweise mehr (kein Eintrittsdatum, Altersgrenze)", () => {
    const covered = [{ feeGroup: "BASE", from: day(2026, 10, 1), to: day(2026, 12, 31) }];
    const otto = member({ id: "otto", name: "Otto Ohne", joinedAt: null, coverage: covered });
    const YOUTH = feeType({
      id: "ft-youth",
      name: "Jugend",
      priority: 10,
      maxAge: 17,
      rates: [monthly("r-y", 600)],
    });
    const tim = member({
      id: "tim",
      name: "Tim Teen",
      birthDate: day(2008, 11, 12),
      coverage: [{ feeGroup: "BASE", from: day(2026, 10, 1), to: day(2026, 11, 11) }],
    });
    const preview = run([otto, tim], { feeTypes: [YOUTH, ADULT] });
    expect(preview.warnings.filter((w) => w.memberId === "otto")).toEqual([]);
    expect(preview.warnings.map((w) => w.text).join(" ")).not.toMatch(/schon berechnet/);
  });
});
