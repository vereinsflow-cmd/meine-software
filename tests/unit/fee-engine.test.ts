import { describe, expect, it } from "vitest";
import { calculateFees } from "@/modules/fees/engine";
import type {
  EngineAssignment,
  EngineFeeRate,
  EngineFeeType,
  EngineInput,
  EngineMember,
  EnginePreview,
  EngineSettings,
  FeeIntervalValue,
  MemberStatusValue,
  WarningCode,
} from "@/modules/fees/engine-types";

// ---------------------------------------------------------------------------
// Bausteine: Kalendertage, Beitragsarten und Mitglieder wie im Brief (4. Quartal 2026)
// ---------------------------------------------------------------------------

/** Kalendertag (UTC-Mitternacht), Monat ab 1. */
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const iso = (date: Date) => date.toISOString().slice(0, 10);
/** `formatEuroFromCents` trennt Betrag und € mit einem geschützten Leerzeichen. */
const plain = (text: string) => text.replace(/ /g, " ");

const SETTINGS: EngineSettings = {
  proRataEntry: "DAY",
  proRataExit: "DAY",
  ageRule: "EXACT_DAY",
  missingBirthDateAsAdult: true,
  minDebitCents: 500,
};

const rate = (
  id: string,
  amountCents: number,
  interval: FeeIntervalValue = "MONTHLY",
  validFrom = day(2020, 1, 1),
): EngineFeeRate => ({ id, amountCents, interval, validFrom });

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

const ADULT = feeType({
  id: "ft-adult",
  name: "Erwachsene",
  priority: 30,
  rates: [rate("r-adult", 1200)],
});
const YOUTH = feeType({
  id: "ft-youth",
  name: "Jugend bis 17 Jahre",
  priority: 10,
  maxAge: 17,
  rates: [rate("r-youth", 600)],
});
const PASSIVE = feeType({
  id: "ft-passive",
  name: "Passiv",
  priority: 20,
  statuses: ["PASSIVE"],
  rates: [rate("r-passive", 400)],
});
const FEE_TYPES = [ADULT, YOUTH, PASSIVE];

let assignmentCounter = 0;
function assignment(
  over: Partial<EngineAssignment> & Pick<EngineAssignment, "kind">,
): EngineAssignment {
  assignmentCounter += 1;
  return {
    id: `as-${assignmentCounter}`,
    feeTypeId: null,
    percentBp: null,
    amountCents: null,
    validFrom: day(2020, 1, 1),
    validTo: null,
    reason: null,
    ...over,
  };
}

const history = (...rows: [MemberStatusValue, Date, Date?][]) =>
  rows.map(([status, validFrom, createdAt]) => ({
    status,
    validFrom,
    createdAt: createdAt ?? validFrom,
  }));

function member(over: Partial<EngineMember> & Pick<EngineMember, "id" | "name">): EngineMember {
  const status = over.status ?? "ACTIVE";
  const joinedAt = over.joinedAt === undefined ? day(2010, 1, 1) : over.joinedAt;
  return {
    birthDate: day(1980, 5, 5),
    joinedAt,
    leftAt: null,
    status,
    inactive: false,
    // Standard: Status seit dem Eintritt unverändert (vollständiger Verlauf).
    statusHistory: history([status === "LEFT" ? "ACTIVE" : status, joinedAt ?? day(2000, 1, 1)]),
    departments: [],
    assignments: [],
    payerMemberId: null,
    paymentMethod: "DIRECT_DEBIT",
    ...over,
  };
}

function run(
  members: EngineMember[],
  options: {
    feeTypes?: EngineFeeType[];
    settings?: Partial<EngineSettings>;
    periodStart?: Date;
    periodEnd?: Date;
    payerNames?: Record<string, string>;
  } = {},
): EnginePreview {
  const input: EngineInput = {
    periodStart: options.periodStart ?? day(2026, 10, 1),
    periodEnd: options.periodEnd ?? day(2026, 12, 31),
    feeTypes: options.feeTypes ?? FEE_TYPES,
    settings: { ...SETTINGS, ...options.settings },
    members,
    payerNames: options.payerNames,
  };
  return calculateFees(input);
}

/** Betrag eines einzelnen Mitglieds (0 = keine Forderung). */
const amountOf = (m: EngineMember, options?: Parameters<typeof run>[1]) =>
  run([m], options).charges[0]?.amountCents ?? 0;

const codes = (preview: EnginePreview) => preview.warnings.map((w) => w.code);
const chargeOf = (preview: EnginePreview, id: string) => {
  const charge = preview.charges.find((c) => c.memberId === id);
  if (!charge) throw new Error(`keine Forderung für ${id}`);
  return charge;
};
const linesOf = (preview: EnginePreview, id: string) =>
  chargeOf(preview, id).lines.map((l) => [l.text, l.amountCents]);

// ---------------------------------------------------------------------------

describe("Beitragsrechnung: Fälle aus dem Brief (4. Quartal 2026)", () => {
  const hans = member({ id: "hans", name: "Hans Müller" });
  const lukas = member({ id: "lukas", name: "Lukas Berger", birthDate: day(2008, 11, 12) });
  const claudia = member({
    id: "claudia",
    name: "Claudia Wagner",
    assignments: [
      assignment({ kind: "DISCOUNT_PERCENT", percentBp: 5000, reason: "Übungsleiterin" }),
    ],
  });
  const laura = member({ id: "laura", name: "Laura Schmidt", status: "PASSIVE" });
  const otto = member({ id: "otto", name: "Otto Weber", birthDate: null });
  const erika = member({ id: "erika", name: "Erika Ehrlich", status: "HONORARY" });
  const neu = member({ id: "neu", name: "Nina Neu", joinedAt: day(2026, 11, 15) });
  const preview = run([hans, lukas, claudia, laura, otto, erika, neu]);

  it("Hans (Erwachsener, ganzes Quartal aktiv): 36,00 €", () => {
    const charge = chargeOf(preview, "hans");
    expect(charge.amountCents).toBe(3600);
    expect(plain(charge.explanation)).toBe("Erwachsene → 36,00 €");
    expect(charge.mainFeeTypeName).toBe("Erwachsene");
    expect(charge.lines).toEqual([
      {
        feeTypeId: "ft-adult",
        feeRateId: "r-adult",
        assignmentId: null,
        fromDate: day(2026, 10, 1),
        toDate: day(2026, 12, 31),
        amountCents: 3600,
        text: "Erwachsene",
        exact: "3600/1",
      },
    ]);
    expect(charge.payerMemberId).toBe("hans");
    expect(charge.payerName).toBe("Hans Müller");
    expect(charge.paymentMethod).toBe("DIRECT_DEBIT");
  });

  it("Lukas wird am 12.11. 18: Jugend bis 11.11., danach Erwachsene = 27,80 €", () => {
    const charge = chargeOf(preview, "lukas");
    // Okt 600 + 01.–11.11. 600·11/30 = 220 + 12.–30.11. 1200·19/30 = 760 + Dez 1200
    expect(charge.amountCents).toBe(2780);
    expect(linesOf(preview, "lukas")).toEqual([
      ["Jugend bis 17 Jahre, ab 01.10. bis Geburtstag im November", 820],
      ["Erwachsene, ab Geburtstag im November bis 31.12.", 1960],
    ]);
    expect(charge.lines.map((l) => l.exact)).toEqual(["820/1", "1960/1"]);
    expect(plain(charge.explanation)).toBe(
      "Jugend bis 17 Jahre bis Geburtstag im November, danach Erwachsene → 27,80 €",
    );
    expect(charge.mainFeeTypeName).toBe("Erwachsene");
    const warning = preview.warnings.find((w) => w.memberId === "lukas");
    expect(warning?.code).toBe("AGE_LIMIT_IN_PERIOD");
    expect(warning?.text).toBe(
      "Bei Lukas Berger wechselt im Zeitraum das Alter – ab November gilt „Erwachsene“ statt „Jugend bis 17 Jahre“.",
    );
  });

  it("Claudia (50 % ermäßigt als Übungsleiterin): eigene Zeile −18,00 €", () => {
    const charge = chargeOf(preview, "claudia");
    expect(charge.amountCents).toBe(1800);
    expect(linesOf(preview, "claudia")).toEqual([
      ["Erwachsene", 3600],
      ["50 % ermäßigt (Übungsleiterin)", -1800],
    ]);
    expect(charge.lines[1]!.assignmentId).toBe(claudia.assignments[0]!.id);
    expect(charge.lines[1]!.feeTypeId).toBe("ft-adult");
    expect(charge.lines[1]!.exact).toBe("-1800/1");
    expect(plain(charge.explanation)).toBe("Erwachsene, 50 % ermäßigt (Übungsleiterin) → 18,00 €");
  });

  it("Laura (passiv): 12,00 €", () => {
    expect(chargeOf(preview, "laura").amountCents).toBe(1200);
    expect(plain(chargeOf(preview, "laura").explanation)).toBe("Passiv → 12,00 €");
  });

  it("Otto ohne Geburtsdatum: als Erwachsener 36,00 € mit Hinweis", () => {
    expect(chargeOf(preview, "otto").amountCents).toBe(3600);
    expect(preview.warnings).toContainEqual({
      code: "NO_BIRTH_DATE",
      memberId: "otto",
      text: "Otto Weber hat kein Geburtsdatum – als Erwachsener berechnet.",
    });
  });

  it("Ehrenmitglied: beitragsfrei", () => {
    expect(preview.exempt).toEqual([
      { memberId: "erika", memberName: "Erika Ehrlich", reason: "Ehrenmitglied – beitragsfrei" },
    ]);
  });

  it("Eintritt am 15.11. (ab dem Tag): Nov 1200·16/30 = 640 + Dez 1200 = 18,40 €", () => {
    const charge = chargeOf(preview, "neu");
    expect(charge.amountCents).toBe(1840);
    expect(linesOf(preview, "neu")).toEqual([["Erwachsene, 15.11.–31.12.", 1840]]);
    expect(plain(charge.explanation)).toBe("Erwachsene ab 15.11. (Eintritt) → 18,40 €");
  });

  it("Summe, Sortierung nach Namen, keine überflüssigen Hinweise", () => {
    expect(preview.totalCents).toBe(3600 + 2780 + 1800 + 1200 + 3600 + 1840);
    expect(preview.charges.map((c) => c.memberName)).toEqual([
      "Claudia Wagner",
      "Hans Müller",
      "Laura Schmidt",
      "Lukas Berger",
      "Nina Neu",
      "Otto Weber",
    ]);
    expect(preview.skipped).toEqual([]);
    expect(codes(preview).sort()).toEqual(["AGE_LIMIT_IN_PERIOD", "NO_BIRTH_DATE"]);
  });

  it("Jahresbeitrag 100 € auf ein Quartal: genau 25,00 €", () => {
    const yearly = feeType({
      id: "ft-year",
      name: "Jahresbeitrag",
      rates: [rate("r-year", 10000, "YEARLY")],
    });
    const p = run([hans], { feeTypes: [yearly] });
    expect(p.charges[0]!.amountCents).toBe(2500);
    expect(p.charges[0]!.lines[0]!.exact).toBe("2500/1");
    // Halbjährlich 60 € und vierteljährlich 30 € ergeben ebenfalls ganze Monatsbeiträge.
    const half = feeType({ id: "h", name: "Halbjahr", rates: [rate("r-h", 6000, "HALF_YEARLY")] });
    const quarter = feeType({ id: "q", name: "Quartal", rates: [rate("r-q", 3000, "QUARTERLY")] });
    expect(amountOf(hans, { feeTypes: [half] })).toBe(3000);
    expect(amountOf(hans, { feeTypes: [quarter] })).toBe(3000);
  });

  it("neuer Beitragssatz ab 01.12. (12 € → 15 €): zwei Abschnitte, 39,00 €", () => {
    const changing = feeType({
      ...ADULT,
      rates: [rate("r-new", 1500, "MONTHLY", day(2026, 12, 1)), rate("r-old", 1200)],
    });
    const p = run([hans], { feeTypes: [changing] });
    const charge = p.charges[0]!;
    expect(charge.amountCents).toBe(3900);
    expect(charge.lines.map((l) => [l.text, l.feeRateId, l.amountCents])).toEqual([
      ["Erwachsene, 01.10.–30.11.", "r-old", 2400],
      ["Erwachsene, 01.12.–31.12.", "r-new", 1500],
    ]);
    expect(plain(charge.explanation)).toBe("Erwachsene (neuer Beitragssatz ab 01.12.) → 39,00 €");
  });
});

describe("Alter", () => {
  it("Geburtstag am 29.02.: in Nicht-Schaltjahren zählt das neue Alter ab dem 01.03. (wie ageOn)", () => {
    const leap = member({ id: "leap", name: "Lea Schalt", birthDate: day(2008, 2, 29) });
    const p = run([leap], { periodStart: day(2026, 1, 1), periodEnd: day(2026, 3, 31) });
    // Jan 600 + Feb 600 (am 28.02. noch 17) + März 1200
    expect(linesOf(p, "leap")).toEqual([
      ["Jugend bis 17 Jahre, ab 01.01. bis Geburtstag im März", 1200],
      ["Erwachsene, ab Geburtstag im März bis 31.03.", 1200],
    ]);
    expect(p.warnings[0]!.text).toContain("ab März gilt „Erwachsene“ statt „Jugend bis 17 Jahre“");
  });

  it("am Geburtstag selbst gilt schon das neue Alter", () => {
    const lukas = member({ id: "l", name: "Lukas", birthDate: day(2008, 11, 12) });
    const november = { periodStart: day(2026, 11, 1), periodEnd: day(2026, 11, 30) };
    // 01.–11.11. Jugend 600·11/30 = 220, ab 12.11. Erwachsene 1200·19/30 = 760
    expect(linesOf(run([lukas], november), "l")).toEqual([
      ["Jugend bis 17 Jahre, ab 01.11. bis Geburtstag im November", 220],
      ["Erwachsene, ab Geburtstag im November bis 30.11.", 760],
    ]);
    const birthdayOnFirst = member({ id: "b", name: "B", birthDate: day(2008, 11, 1) });
    expect(amountOf(birthdayOnFirst, november)).toBe(1200);
    const birthdayAfter = member({ id: "c", name: "C", birthDate: day(2008, 12, 1) });
    expect(amountOf(birthdayAfter, november)).toBe(600);
  });

  it.each([
    ["EXACT_DAY", 2780, true],
    ["PERIOD_START", 1800, false], // am 01.10.2026 noch 17 → ganzes Quartal Jugend
    ["CALENDAR_YEAR", 3600, false], // Jahrgang 2008 ist 2026 schon 18
  ] as const)("Altersregel %s: %i Cent", (ageRule, expected, warns) => {
    const lukas = member({ id: "l", name: "Lukas", birthDate: day(2008, 11, 12) });
    const p = run([lukas], { settings: { ageRule } });
    expect(p.charges[0]!.amountCents).toBe(expected);
    expect(codes(p).includes("AGE_LIMIT_IN_PERIOD")).toBe(warns);
  });

  it("nach Jahrgang: Wechsel am 01.01.", () => {
    const m = member({ id: "j", name: "Jana", birthDate: day(2009, 6, 15) });
    const p = run([m], {
      settings: { ageRule: "CALENDAR_YEAR" },
      periodStart: day(2026, 12, 1),
      periodEnd: day(2027, 1, 31),
    });
    expect(linesOf(p, "j")).toEqual([
      ["Jugend bis 17 Jahre, 01.12.–31.12.", 600],
      ["Erwachsene, 01.01.–31.01.", 1200],
    ]);
    expect(p.warnings[0]!.text).toContain(
      "ab Januar gilt „Erwachsene“ statt „Jugend bis 17 Jahre“",
    );
  });

  it("Mindestalter: Senioren ab 65 (vor Erwachsene geprüft)", () => {
    const seniors = feeType({
      id: "ft-sen",
      name: "Senioren",
      priority: 5,
      minAge: 65,
      rates: [rate("r-sen", 800)],
    });
    const feeTypes = [...FEE_TYPES, seniors];
    expect(amountOf(member({ id: "s", name: "S", birthDate: day(1950, 1, 1) }), { feeTypes })).toBe(
      2400,
    );
    expect(amountOf(member({ id: "a", name: "A", birthDate: day(1980, 1, 1) }), { feeTypes })).toBe(
      3600,
    );
    // Ohne Geburtsdatum („als Erwachsener“) nie Senioren oder Jugend.
    const otto = member({ id: "o", name: "Otto", birthDate: null });
    const p = run([otto], { feeTypes });
    expect(p.charges[0]!.mainFeeTypeName).toBe("Erwachsene");
    expect(codes(p)).toEqual(["NO_BIRTH_DATE"]);
  });

  it("ohne Geburtsdatum und „nicht als Erwachsener rechnen“: übersprungen", () => {
    const otto = member({ id: "o", name: "Otto Weber", birthDate: null });
    const p = run([otto], { settings: { missingBirthDateAsAdult: false } });
    expect(p.charges).toEqual([]);
    expect(p.skipped).toEqual([
      { memberId: "o", memberName: "Otto Weber", reason: "kein Geburtsdatum" },
    ]);
    expect(codes(p)).toEqual(["NO_BIRTH_DATE_SKIPPED"]);
  });

  it("ohne Altersgrenzen im Verein spielt das Geburtsdatum keine Rolle", () => {
    const otto = member({ id: "o", name: "Otto", birthDate: null });
    const p = run([otto], { feeTypes: [ADULT], settings: { missingBirthDateAsAdult: false } });
    expect(p.charges[0]!.amountCents).toBe(3600);
    expect(p.warnings).toEqual([]);
  });
});

describe("Status und Status-Verlauf", () => {
  it("Wechsel aktiv → passiv am 16.11.", () => {
    const m = member({
      id: "m",
      name: "Mia",
      status: "PASSIVE",
      statusHistory: history(["ACTIVE", day(2010, 1, 1)], ["PASSIVE", day(2026, 11, 16)]),
    });
    const p = run([m]);
    // Okt 1200 + 01.–15.11. 600 + 16.–30.11. 400·15/30 = 200 + Dez 400
    expect(linesOf(p, "m")).toEqual([
      ["Erwachsene, 01.10.–15.11.", 1800],
      ["Passiv, 16.11.–31.12.", 600],
    ]);
    expect(plain(p.charges[0]!.explanation)).toBe("Erwachsene bis 15.11., danach Passiv → 24,00 €");
    expect(p.warnings).toEqual([]);
  });

  it("gleicher Beginn: der zuletzt erfasste Eintrag gilt", () => {
    const m = member({
      id: "m",
      name: "Mia",
      statusHistory: history(
        ["ACTIVE", day(2010, 1, 1)],
        ["ACTIVE", day(2026, 10, 1), new Date("2026-10-01T09:00:00Z")],
        ["PASSIVE", day(2026, 10, 1), new Date("2026-10-01T10:00:00Z")],
      ),
    });
    expect(amountOf(m)).toBe(1200);
    const reversed = { ...m, statusHistory: [...m.statusHistory].reverse() };
    expect(amountOf(reversed)).toBe(1200);
  });

  it("Verlauf beginnt erst im Zeitraum: davor aktueller Status, ein Hinweis", () => {
    const m = member({
      id: "m",
      name: "Mia Lücke",
      status: "PASSIVE",
      statusHistory: history(["PASSIVE", day(2026, 11, 1)]),
    });
    const p = run([m]);
    expect(p.charges[0]!.amountCents).toBe(1200);
    expect(p.warnings).toEqual([
      {
        code: "STATUS_HISTORY_INCOMPLETE",
        memberId: "m",
        text: "Der Status-Verlauf von Mia Lücke beginnt erst am 01.11.2026 – davor mit dem Status „passiv“ berechnet.",
      },
    ]);
    const empty = run([{ ...m, statusHistory: [] }]);
    expect(empty.warnings[0]!.text).toBe(
      "Für Mia Lücke ist kein Status-Verlauf erfasst – mit dem Status „passiv“ berechnet.",
    );
  });

  it("Tage vor dem Eintritt (Regel „ab Monatsanfang“) brauchen keinen Verlauf", () => {
    const m = member({ id: "m", name: "Mia", joinedAt: day(2026, 11, 15) });
    const p = run([m], { settings: { proRataEntry: "MONTH_START" } });
    expect(p.charges[0]!.amountCents).toBe(2400);
    expect(p.warnings).toEqual([]);
  });

  it("aktuell ausgetreten ohne Verlauf: bis zum Austritt als aktiv berechnet", () => {
    const m = member({
      id: "m",
      name: "Max",
      status: "LEFT",
      leftAt: day(2026, 11, 15),
      statusHistory: [],
    });
    const p = run([m]);
    expect(p.charges[0]!.amountCents).toBe(1800); // Okt 1200 + 01.–15.11. 600
    expect(p.warnings[0]!.code).toBe("STATUS_HISTORY_INCOMPLETE");
    expect(p.warnings[0]!.text).toContain("„aktiv“");
  });

  it("ausgetreten laut Verlauf: an diesen Tagen kein Beitrag (Wiedereintritt)", () => {
    const m = member({
      id: "m",
      name: "Max",
      statusHistory: history(
        ["ACTIVE", day(2010, 1, 1)],
        ["LEFT", day(2026, 11, 1)],
        ["ACTIVE", day(2026, 12, 1)],
      ),
    });
    const p = run([m]);
    expect(linesOf(p, "m")).toEqual([
      ["Erwachsene, 01.10.–31.10.", 1200],
      ["Erwachsene, 01.12.–31.12.", 1200],
    ]);
    expect(plain(p.charges[0]!.explanation)).toBe(
      "Erwachsene bis 31.10., dann ausgetreten bis 30.11., danach Erwachsene → 24,00 €",
    );
  });

  it("gesperrt zahlt (Standard-Status), Ehrenmitglied nur bei ausdrücklicher Beitragsart", () => {
    expect(amountOf(member({ id: "b", name: "B", status: "BLOCKED" }))).toBe(3600);
    const honoraryFee = feeType({
      id: "ft-hon",
      name: "Ehrenmitglied mit Beitrag",
      priority: 40,
      statuses: ["HONORARY"],
      rates: [rate("r-hon", 100)],
    });
    const p = run([member({ id: "e", name: "E", status: "HONORARY" })], {
      feeTypes: [...FEE_TYPES, honoraryFee],
    });
    expect(p.charges[0]!.amountCents).toBe(300);
  });

  it("keine passende Beitragsart: Hinweis und nicht berechnet", () => {
    const activeOnly = feeType({ ...ADULT, statuses: ["ACTIVE"] });
    const p = run([member({ id: "p", name: "Paula", status: "PASSIVE" })], {
      feeTypes: [activeOnly],
    });
    expect(p.charges).toEqual([]);
    expect(p.skipped).toEqual([
      { memberId: "p", memberName: "Paula", reason: "keine passende Beitragsart" },
    ]);
    expect(p.warnings).toEqual([
      {
        code: "NO_FEE_TYPE",
        memberId: "p",
        text: "Für Paula passt keine Beitragsart (Status „passiv“, 46 Jahre) – an 92 Tagen ab dem 01.10.2026 kein Grundbeitrag.",
      },
    ]);
  });
});

describe("Abteilungen", () => {
  const TENNIS_BASE = feeType({
    id: "ft-tennis",
    name: "Tennis Erwachsene",
    priority: 25,
    departmentId: "dep-tennis",
    rates: [rate("r-tennis", 1500)],
  });
  const TENNIS_EXTRA = feeType({
    id: "ft-tennis-extra",
    name: "Abteilung Tennis",
    kind: "ADDITIONAL",
    departmentId: "dep-tennis",
    rates: [rate("r-tennis-extra", 1800, "QUARTERLY")],
  });

  it("Grundbeitrag nur für Mitglieder der Abteilung (ab ihrem Beitritt)", () => {
    const feeTypes = [...FEE_TYPES, TENNIS_BASE];
    const always = member({
      id: "a",
      name: "A",
      departments: [{ departmentId: "dep-tennis", since: null }],
    });
    const none = member({
      id: "b",
      name: "B",
      departments: [{ departmentId: "dep-golf", since: null }],
    });
    const fromDecember = member({
      id: "c",
      name: "C",
      departments: [{ departmentId: "dep-tennis", since: day(2026, 12, 1) }],
    });
    expect(amountOf(always, { feeTypes })).toBe(4500);
    expect(amountOf(none, { feeTypes })).toBe(3600);
    const p = run([fromDecember], { feeTypes });
    expect(linesOf(p, "c")).toEqual([
      ["Erwachsene, 01.10.–30.11.", 2400],
      ["Tennis Erwachsene, 01.12.–31.12.", 1500],
    ]);
  });

  it("Zusatzbeitrag der Abteilung kommt zum Grundbeitrag dazu", () => {
    const feeTypes = [...FEE_TYPES, TENNIS_EXTRA];
    const m = member({
      id: "t",
      name: "Tim",
      departments: [{ departmentId: "dep-tennis", since: day(2015, 1, 1) }],
    });
    const p = run([m], { feeTypes });
    expect(linesOf(p, "t")).toEqual([
      ["Erwachsene", 3600],
      ["Abteilung Tennis", 1800],
    ]);
    expect(plain(p.charges[0]!.explanation)).toBe("Erwachsene, dazu Abteilung Tennis → 54,00 €");

    const late = { ...m, departments: [{ departmentId: "dep-tennis", since: day(2026, 11, 16) }] };
    const q = run([late], { feeTypes });
    // 600 € je Monat: 16.–30.11. 600·15/30 = 300 + Dez 600
    expect(linesOf(q, "t")).toEqual([
      ["Erwachsene", 3600],
      ["Abteilung Tennis, 16.11.–31.12.", 900],
    ]);
    expect(plain(q.charges[0]!.explanation)).toBe(
      "Erwachsene, dazu Abteilung Tennis (16.11.–31.12.) → 45,00 €",
    );
  });

  it("Zusatzbeitrag: Status und Alter wie beim Grundbeitrag; größter Anteil benennt die Zeile", () => {
    const youthExtra = feeType({
      ...TENNIS_EXTRA,
      maxAge: 17,
      rates: [rate("x", 9000, "QUARTERLY")],
    });
    const kid = member({
      id: "k",
      name: "Kai",
      birthDate: day(2015, 1, 1),
      departments: [{ departmentId: "dep-tennis", since: null }],
    });
    const adult = { ...kid, id: "a", name: "Anna", birthDate: day(1990, 1, 1) };
    const honorary = member({
      id: "h",
      name: "Hedi",
      status: "HONORARY",
      birthDate: day(2014, 1, 1),
      departments: [{ departmentId: "dep-tennis", since: null }],
    });
    const p = run([kid, adult, honorary], { feeTypes: [...FEE_TYPES, youthExtra] });
    expect(chargeOf(p, "k").amountCents).toBe(1800 + 9000);
    expect(chargeOf(p, "k").mainFeeTypeName).toBe("Abteilung Tennis");
    expect(chargeOf(p, "a").amountCents).toBe(3600);
    expect(p.exempt.map((e) => e.memberId)).toEqual(["h"]);
  });

  it("größter Anteil ohne Ermäßigung: ermäßigte Erwachsene mit Zusatzbeitrag bleibt „Erwachsene“", () => {
    const extra = feeType({ ...TENNIS_EXTRA, rates: [rate("x", 2100, "QUARTERLY")] });
    const m = member({
      id: "c",
      name: "Claudia",
      departments: [{ departmentId: "dep-tennis", since: null }],
      assignments: [assignment({ kind: "DISCOUNT_PERCENT", percentBp: 5000 })],
    });
    const charge = chargeOf(run([m], { feeTypes: [...FEE_TYPES, extra] }), "c");
    // Erwachsene 3600 − 1800 = 1800 netto < Tennis 2100, aber 3600 vor der Ermäßigung > 2100.
    expect(charge.amountCents).toBe(1800 + 2100);
    expect(charge.mainFeeTypeName).toBe("Erwachsene");
  });

  it("ignoriert archivierte Arten, Zusatzbeiträge ohne Abteilung, Aufnahme- und Familienbeiträge", () => {
    const feeTypes = [
      ADULT,
      feeType({ id: "old", name: "Alt", priority: 1, archived: true, rates: [rate("o", 9999)] }),
      feeType({ id: "x1", name: "Ohne Abteilung", kind: "ADDITIONAL", rates: [rate("x1", 500)] }),
      feeType({ id: "x2", name: "Aufnahme", kind: "ADMISSION", rates: [rate("x2", 2000, "ONCE")] }),
      feeType({ id: "x3", name: "Familie", kind: "FAMILY", rates: [rate("x3", 3000)] }),
    ];
    const p = run([member({ id: "m", name: "M" })], { feeTypes });
    expect(linesOf(p, "m")).toEqual([["Erwachsene", 3600]]);
  });
});

describe("Zuordnungen", () => {
  const SPECIAL = feeType({
    id: "ft-special",
    name: "Sonderbeitrag",
    priority: 99,
    statuses: ["ACTIVE"],
    minAge: 60,
    rates: [rate("r-special", 500)],
  });
  const feeTypes = [...FEE_TYPES, SPECIAL];

  it("feste Beitragsart statt der Regeln (auch ohne passenden Status oder Alter)", () => {
    const m = member({
      id: "m",
      name: "M",
      status: "HONORARY",
      assignments: [assignment({ kind: "ASSIGN", feeTypeId: "ft-special" })],
    });
    const p = run([m], { feeTypes });
    expect(linesOf(p, "m")).toEqual([["Sonderbeitrag", 1500]]);
  });

  it("feste Beitragsart nur für einen Teil des Zeitraums", () => {
    const m = member({
      id: "m",
      name: "M",
      assignments: [
        assignment({ kind: "ASSIGN", feeTypeId: "ft-special", validFrom: day(2026, 12, 1) }),
      ],
    });
    const p = run([m], { feeTypes });
    expect(linesOf(p, "m")).toEqual([
      ["Erwachsene, 01.10.–30.11.", 2400],
      ["Sonderbeitrag, 01.12.–31.12.", 500],
    ]);
    expect(plain(p.charges[0]!.explanation)).toBe(
      "Erwachsene bis 30.11., danach Sonderbeitrag → 29,00 €",
    );
  });

  it("zugeordnete Beitragsart fehlt: Hinweis, nicht berechnet", () => {
    const m = member({
      id: "m",
      name: "M",
      assignments: [assignment({ kind: "ASSIGN", feeTypeId: "gibt-es-nicht" })],
    });
    const p = run([m]);
    expect(p.skipped[0]!.reason).toBe("keine passende Beitragsart");
    expect(codes(p)).toEqual(["NO_FEE_TYPE"]);
  });

  it("beitragsfrei: ganz oder für einen Teil (ohne Zusatzbeiträge)", () => {
    const extra = feeType({
      id: "ft-x",
      name: "Abteilung Judo",
      kind: "ADDITIONAL",
      departmentId: "dep-judo",
      rates: [rate("r-x", 300)],
    });
    const m = member({
      id: "m",
      name: "Hilde",
      departments: [{ departmentId: "dep-judo", since: null }],
      assignments: [assignment({ kind: "EXEMPT", reason: "Härtefall" })],
    });
    const p = run([m], { feeTypes: [...FEE_TYPES, extra] });
    expect(p.charges).toEqual([]);
    expect(p.exempt).toEqual([
      { memberId: "m", memberName: "Hilde", reason: "beitragsfrei: Härtefall" },
    ]);

    const partly = {
      ...m,
      assignments: [
        assignment({ kind: "EXEMPT", reason: "Härtefall", validTo: day(2026, 10, 31) }),
      ],
    };
    const q = run([partly], { feeTypes: [...FEE_TYPES, extra] });
    expect(linesOf(q, "m")).toEqual([
      ["Erwachsene, 01.11.–31.12.", 2400],
      ["Abteilung Judo, 01.11.–31.12.", 600],
    ]);
    expect(plain(q.charges[0]!.explanation)).toBe(
      "beitragsfrei (Härtefall) bis 31.10., danach Erwachsene, dazu Abteilung Judo (01.11.–31.12.) → 30,00 €",
    );
  });

  it("fester Betrag je Monat ersetzt den Satz", () => {
    const fixed = assignment({ kind: "FIXED_AMOUNT", amountCents: 1000, reason: "Vorstand" });
    const p = run([member({ id: "m", name: "M", assignments: [fixed] })]);
    const charge = p.charges[0]!;
    expect(charge.amountCents).toBe(3000);
    expect(charge.lines.map((l) => [l.text, l.assignmentId, l.feeRateId])).toEqual([
      [
        "Erwachsene, fester Betrag 10,00 € im Monat (Vorstand)".replace(" €", " €"),
        fixed.id,
        null, // ein fester Betrag hängt nicht am Satz der Beitragsart
      ],
    ]);
    const zero = assignment({ kind: "FIXED_AMOUNT", amountCents: 0, reason: "Vorstand" });
    const q = run([member({ id: "m", name: "M", assignments: [zero] })]);
    expect(q.exempt[0]!.reason).toBe("fester Beitrag 0,00 € (Vorstand)");
  });

  it("Beitragssatz 0 €: beitragsfrei mit Grund", () => {
    const kids = feeType({
      id: "ft-kids",
      name: "Kinder",
      priority: 1,
      maxAge: 5,
      rates: [rate("k", 0)],
    });
    const p = run([member({ id: "k", name: "Kim", birthDate: day(2023, 1, 1) })], {
      feeTypes: [...FEE_TYPES, kids],
    });
    expect(p.exempt).toEqual([
      { memberId: "k", memberName: "Kim", reason: "Beitrag 0,00 € (Kinder)" },
    ]);
  });

  it("Ermäßigung über zwei Abschnitte und nur für einen Teil des Zeitraums", () => {
    const lukas = member({
      id: "l",
      name: "Lukas",
      birthDate: day(2008, 11, 12),
      assignments: [
        assignment({ kind: "DISCOUNT_PERCENT", percentBp: 5000, reason: "Geschwister" }),
      ],
    });
    const p = run([lukas]);
    expect(linesOf(p, "l")).toEqual([
      ["Jugend bis 17 Jahre, ab 01.10. bis Geburtstag im November", 820],
      ["50 % ermäßigt (Geschwister), ab 01.10. bis Geburtstag im November", -410],
      ["Erwachsene, ab Geburtstag im November bis 31.12.", 1960],
      ["50 % ermäßigt (Geschwister), ab Geburtstag im November bis 31.12.", -980],
    ]);
    expect(p.charges[0]!.amountCents).toBe(1390);

    const fromDecember = member({
      id: "d",
      name: "D",
      assignments: [
        assignment({ kind: "DISCOUNT_PERCENT", percentBp: 2550, validFrom: day(2026, 12, 1) }),
      ],
    });
    const q = run([fromDecember]);
    // Dez 1200 · 25,5 % = 306 Ermäßigung
    expect(linesOf(q, "d")).toEqual([
      ["Erwachsene, 01.10.–30.11.", 2400],
      ["Erwachsene, 01.12.–31.12.", 1200],
      ["25,5 % ermäßigt, 01.12.–31.12.", -306],
    ]);
    expect(plain(q.charges[0]!.explanation)).toBe(
      "Erwachsene bis 30.11., danach Erwachsene, 25,5 % ermäßigt → 32,94 €",
    );
  });

  it("100 % ermäßigt: beitragsfrei", () => {
    const m = member({
      id: "m",
      name: "M",
      assignments: [assignment({ kind: "DISCOUNT_PERCENT", percentBp: 10000, reason: "Trainer" })],
    });
    const p = run([m]);
    expect(p.exempt[0]!.reason).toBe("100 % ermäßigt (Trainer) – Beitrag 0,00 €");
  });
});

describe("Eintritt und Austritt im Zeitraum", () => {
  const joined = member({ id: "j", name: "Jule", joinedAt: day(2026, 11, 15) });
  it.each([
    ["DAY", 1840, "Erwachsene ab 15.11. (Eintritt) → 18,40 €"],
    ["MONTH_START", 2400, "Erwachsene ab 01.11. (Eintritt am 15.11.) → 24,00 €"],
    ["NEXT_MONTH", 1200, "Erwachsene ab 01.12. (Eintritt am 15.11.) → 12,00 €"],
    ["NONE", 3600, "Erwachsene → 36,00 €"],
  ] as const)("Eintritt am 15.11., Regel %s: %i Cent", (proRataEntry, expected, explanation) => {
    const p = run([joined], { settings: { proRataEntry } });
    expect(p.charges[0]!.amountCents).toBe(expected);
    expect(plain(p.charges[0]!.explanation)).toBe(explanation);
  });

  const left = member({ id: "l", name: "Leo", leftAt: day(2026, 11, 15) });
  it.each([
    ["DAY", 1800, "Erwachsene bis 15.11. (Austritt) → 18,00 €"],
    ["MONTH_END", 2400, "Erwachsene bis 30.11. (Austritt am 15.11.) → 24,00 €"],
    ["PERIOD_END", 3600, "Erwachsene → 36,00 €"],
  ] as const)("Austritt am 15.11., Regel %s: %i Cent", (proRataExit, expected, explanation) => {
    const p = run([left], { settings: { proRataExit } });
    expect(p.charges[0]!.amountCents).toBe(expected);
    expect(plain(p.charges[0]!.explanation)).toBe(explanation);
  });

  it("Austritt mit Verlauf „ausgetreten“ ab dem Folgetag: Regel „bis Monatsende“ zählt trotzdem", () => {
    const m = member({
      id: "l",
      name: "Leo",
      status: "LEFT",
      leftAt: day(2026, 11, 15),
      statusHistory: history(["ACTIVE", day(2010, 1, 1)], ["LEFT", day(2026, 11, 16)]),
    });
    expect(amountOf(m, { settings: { proRataExit: "MONTH_END" } })).toBe(2400);
    expect(amountOf(m)).toBe(1800);
  });

  // So schreibt die Datenbank den Verlauf: „ausgetreten“ ab dem Austrittstag. Der Austrittstag zählt noch mit, und die
  // Austrittsregel greift wie ohne diesen Eintrag.
  it.each([
    ["DAY", "2026-11-15", 1800],
    ["MONTH_END", "2026-11-15", 2400],
    ["PERIOD_END", "2026-11-15", 3600],
    ["DAY", "2026-12-31", 3600],
    ["DAY", "2026-10-01", 39],
    ["MONTH_END", "2026-10-01", 1200],
  ] as const)(
    "Verlauf „ausgetreten“ ab dem Austrittstag, Regel %s, Austritt %s: %i Cent",
    (proRataExit, leftIso, expected) => {
      const leftAt = new Date(`${leftIso}T00:00:00Z`);
      const m = member({
        id: "l",
        name: "Leo",
        status: "LEFT",
        leftAt,
        statusHistory: history(["ACTIVE", day(2010, 1, 1)], ["LEFT", leftAt]),
      });
      const p = run([m], { settings: { proRataExit } });
      expect(p.charges[0]!.amountCents).toBe(expected);
      expect(codes(p).filter((code) => code !== "BELOW_MIN_DEBIT")).toEqual([]);
    },
  );

  it("Status früher auf „ausgetreten“ gestellt, Austrittsdatum später nachgetragen: das Datum zählt", () => {
    // Am 01.11. umgestellt (Eintrag ab 01.11.), Kündigung zum 31.12. erst danach eingetragen.
    const m = member({
      id: "l",
      name: "Leo",
      status: "LEFT",
      leftAt: day(2026, 12, 31),
      statusHistory: history(["ACTIVE", day(2010, 1, 1)], ["LEFT", day(2026, 11, 1)]),
    });
    expect(amountOf(m)).toBe(3600);
  });

  it("nur der Austritt im Verlauf: bis zum Austritt mit Ersatzstatus, Hinweis nennt den Austritt", () => {
    const m = member({
      id: "l",
      name: "Leo",
      status: "LEFT",
      leftAt: day(2026, 11, 15),
      statusHistory: history(["LEFT", day(2026, 11, 15)]),
    });
    const p = run([m]);
    expect(p.charges[0]!.amountCents).toBe(1800);
    expect(p.warnings.map((w) => [w.code, w.text])).toEqual([
      [
        "STATUS_HISTORY_INCOMPLETE",
        "Für Leo ist vor dem Austritt kein Status-Verlauf erfasst – mit dem Status „aktiv“ berechnet.",
      ],
    ]);
  });

  it("früherer Austritt mit Wiedereintritt bleibt beitragsfrei, nur der letzte Austritt folgt der Regel", () => {
    const m = member({
      id: "l",
      name: "Leo",
      status: "LEFT",
      leftAt: day(2026, 12, 15),
      statusHistory: history(
        ["ACTIVE", day(2010, 1, 1)],
        ["LEFT", day(2026, 11, 1)],
        ["ACTIVE", day(2026, 12, 1)],
        ["LEFT", day(2026, 12, 15)],
      ),
    });
    // Okt 1200 + Nov 0 + 01.–31.12. (bis Monatsende) 1200
    expect(amountOf(m, { settings: { proRataExit: "MONTH_END" } })).toBe(2400);
  });

  it("Eintritt und Austritt im selben Zeitraum, krumme Beträge", () => {
    const m = member({
      id: "m",
      name: "Mo",
      joinedAt: day(2026, 10, 10),
      leftAt: day(2026, 11, 20),
    });
    const p = run([m]);
    // Okt 1200·22/31 = 851,61… + Nov 1200·20/30 = 800 → 1651,61… → 1652
    const charge = p.charges[0]!;
    expect(charge.amountCents).toBe(1652);
    expect(charge.lines[0]!.exact).toBe("51200/31");
    expect(plain(charge.explanation)).toBe(
      "Erwachsene ab 10.10. (Eintritt) bis 20.11. (Austritt) → 16,52 €",
    );
  });

  it("kein Eintrittsdatum: ab Beginn des Zeitraums mit Hinweis", () => {
    const p = run([member({ id: "n", name: "Nils", joinedAt: null })]);
    expect(p.charges[0]!.amountCents).toBe(3600);
    expect(p.warnings).toEqual([
      {
        code: "NO_JOIN_DATE",
        memberId: "n",
        text: "Nils hat kein Eintrittsdatum – ab Beginn des Zeitraums (01.10.2026) berechnet.",
      },
    ]);
  });
});

describe("Übersprungen", () => {
  it.each<[string, Partial<EngineMember>, Partial<EngineSettings>, string, WarningCode[]]>([
    ["archiviert", { inactive: true }, {}, "archiviert oder gelöscht", []],
    [
      "ausgetreten ohne Datum",
      { status: "LEFT", leftAt: null },
      {},
      "ausgetreten, aber ohne Austrittsdatum",
      ["LEFT_WITHOUT_DATE"],
    ],
    [
      "Eintritt danach",
      { joinedAt: day(2027, 1, 5) },
      {},
      "Eintritt nach dem Zeitraum (05.01.2027)",
      [],
    ],
    [
      "ausgetreten davor",
      { leftAt: day(2026, 9, 30), status: "LEFT" },
      {},
      "ausgetreten vor dem Zeitraum (30.09.2026)",
      [],
    ],
    [
      "Folgemonat liegt nach dem Zeitraum",
      { joinedAt: day(2026, 12, 15) },
      { proRataEntry: "NEXT_MONTH" },
      "Eintritt nach dem Zeitraum (Beitrag erst ab 01.01.2027)",
      [],
    ],
    [
      "Folgemonat liegt nach dem Austritt",
      { joinedAt: day(2026, 11, 5), leftAt: day(2026, 11, 20) },
      { proRataEntry: "NEXT_MONTH" },
      "kein Beitragstag im Zeitraum (Eintritt 05.11.2026, Austritt 20.11.2026)",
      [],
    ],
  ])("%s", (_, over, settings, reason, warnings) => {
    const p = run([member({ id: "x", name: "Xaver", ...over })], { settings });
    expect(p.charges).toEqual([]);
    expect(p.skipped).toEqual([{ memberId: "x", memberName: "Xaver", reason }]);
    expect(codes(p)).toEqual(warnings);
  });

  it("kein gültiger Beitragssatz an manchen Tagen", () => {
    const late = feeType({ ...ADULT, rates: [rate("r", 1200, "MONTHLY", day(2026, 11, 1))] });
    const p = run([member({ id: "m", name: "Mara" })], { feeTypes: [late] });
    expect(p.charges[0]!.amountCents).toBe(2400);
    expect(p.warnings).toEqual([
      {
        code: "NO_FEE_TYPE",
        memberId: "m",
        text: "Für „Erwachsene“ ist an 31 Tagen ab dem 01.10.2026 kein Beitragssatz gültig – bei Mara nicht berechnet.",
      },
    ]);
    const never = run([member({ id: "m", name: "Mara" })], {
      feeTypes: [feeType({ ...ADULT, rates: [] })],
    });
    expect(never.skipped[0]!.reason).toBe("kein gültiger Beitragssatz");
  });

  it("nur einmaliger Satz beim Grundbeitrag: kein laufender Beitrag", () => {
    const once = feeType({ ...ADULT, rates: [rate("r", 5000, "ONCE")] });
    const p = run([member({ id: "m", name: "M" })], { feeTypes: [once] });
    expect(p.skipped[0]!.reason).toBe("nur ein einmaliger Beitragssatz");
  });
});

describe("Zahler und Lastschrift", () => {
  const parent = member({ id: "p", name: "Petra Berg" });
  const child = member({
    id: "c",
    name: "Carla Berg",
    birthDate: day(2015, 3, 3),
    payerMemberId: "p",
    paymentMethod: "TRANSFER",
  });

  it("Zahler ist ein anderes Mitglied", () => {
    const p = run([child, parent]);
    const charge = chargeOf(p, "c");
    expect(charge.payerMemberId).toBe("p");
    expect(charge.payerName).toBe("Petra Berg");
    expect(charge.paymentMethod).toBe("TRANSFER");
    expect(p.warnings).toEqual([]);
  });

  it("Zahler außerhalb des Laufs: Name aus der Liste der Zahler", () => {
    const p = run([child], { payerNames: { p: "Petra Berg" } });
    expect(chargeOf(p, "c").payerName).toBe("Petra Berg");
    expect(p.warnings).toEqual([]);
  });

  it("Zahler unbekannt: Hinweis", () => {
    const p = run([child]);
    expect(chargeOf(p, "c").payerName).toBe("unbekannter Zahler");
    expect(chargeOf(p, "c").payerMemberId).toBe("p");
    expect(codes(p)).toEqual(["PAYER_NOT_MEMBER"]);
  });

  it("Lastschrift unter dem Mindestbetrag: Hinweis (nur bei Lastschrift)", () => {
    const october = { periodStart: day(2026, 10, 1), periodEnd: day(2026, 10, 31) };
    const passive = member({ id: "p", name: "Paul", status: "PASSIVE" });
    const p = run([passive], october);
    expect(p.charges[0]!.amountCents).toBe(400);
    expect(p.warnings).toEqual([
      {
        code: "BELOW_MIN_DEBIT",
        memberId: "p",
        text: "Der Beitrag von Paul (4,00 €) liegt unter dem Mindestbetrag für Lastschriften (5,00 €).".replace(
          / €/g,
          " €",
        ),
      },
    ]);
    expect(run([{ ...passive, paymentMethod: "TRANSFER" }], october).warnings).toEqual([]);
    expect(run([passive], { ...october, settings: { minDebitCents: 400 } }).warnings).toEqual([]);
  });
});

describe("Gesamtergebnis", () => {
  const members = [
    member({ id: "z", name: "Zoe" }),
    member({ id: "ae", name: "Ärmel" }),
    member({ id: "an", name: "Anton", joinedAt: day(2026, 10, 10), leftAt: day(2026, 11, 20) }),
    member({ id: "h2", name: "Heinz", status: "HONORARY" }),
    member({ id: "h1", name: "Berta", status: "HONORARY" }),
    member({ id: "l", name: "Lukas", birthDate: day(2008, 11, 12), joinedAt: day(2026, 10, 17) }),
  ];

  it("sortiert nach Namen (deutsch) und summiert die Forderungen", () => {
    const p = run(members);
    expect(p.charges.map((c) => c.memberName)).toEqual(["Anton", "Ärmel", "Lukas", "Zoe"]);
    expect(p.exempt.map((e) => e.memberName)).toEqual(["Berta", "Heinz"]);
    expect(p.totalCents).toBe(p.charges.reduce((acc, c) => acc + c.amountCents, 0));
  });

  it("Zeilen ergeben immer genau den Betrag", () => {
    const p = run(members);
    for (const charge of p.charges) {
      expect(charge.lines.reduce((acc, l) => acc + l.amountCents, 0)).toBe(charge.amountCents);
      expect(charge.amountCents).toBeGreaterThan(0);
    }
  });

  it("gleiche Eingabe – gleiches Ergebnis, unabhängig von der Reihenfolge", () => {
    const a = run(members);
    const b = run([...members].reverse());
    expect(b).toEqual(a);
  });

  it("Zeitraum endet vor dem Beginn: Fehler", () => {
    expect(() => run([], { periodStart: day(2026, 12, 1), periodEnd: day(2026, 11, 30) })).toThrow(
      RangeError,
    );
  });

  it("liefert Kalendertage um UTC-Mitternacht", () => {
    const line = run(members).charges[0]!.lines[0]!;
    expect(iso(line.fromDate)).toBe("2026-10-10");
    expect(line.fromDate.getUTCHours()).toBe(0);
  });
});
