import { describe, expect, it } from "vitest";
import { apportion, rational, roundHalfAwayFromZero, sum } from "@/lib/finance/rational";
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
  ProRataEntryValue,
  ProRataExitValue,
} from "@/modules/fees/engine-types";
import {
  daysInMonth,
  dueDate,
  monthsOfInterval,
  nextPeriod,
  periodFor,
  previousPeriod,
} from "@/modules/fees/periods";

/**
 * Gegenproben zum Beitrags-Rechenkern: knifflige Fälle an Monats- und Jahresgrenzen, Februar und Schaltjahr, Ein- und
 * Austritt am ersten bzw. letzten Tag, Status-Verlauf mit Gleichstand, Ermäßigung und fester Betrag, Rundung mit
 * negativen Zeilen, gemeinsame Zahler, Reihenfolge. Erwartet wird, was die Vorgabe verlangt; Fälle, in denen die
 * Umsetzung bewusst (dokumentiert) abweicht, stehen mit „Abweichung“ im Namen.
 */

// ---------------------------------------------------------------------------
// Bausteine
// ---------------------------------------------------------------------------

/** Kalendertag (UTC-Mitternacht), Monat ab 1. */
const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const at = (y: number, m: number, d: number, h: number) => new Date(Date.UTC(y, m - 1, d, h));
const iso = (date: Date) => date.toISOString().slice(0, 10);
/** `formatEuroFromCents` trennt Betrag und € mit einem geschützten Leerzeichen. */
const plain = (text: string) => text.replace(/[  ]/g, " ");

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

/** Erwachsene mit anderen Sätzen (gleiche id, damit Zuordnungen weiter passen). */
const adultWith = (...rates: EngineFeeRate[]) => ({ ...ADULT, rates });

let assignmentCounter = 0;
function assignment(
  over: Partial<EngineAssignment> & Pick<EngineAssignment, "kind">,
): EngineAssignment {
  assignmentCounter += 1;
  return {
    id: `adv-as-${String(assignmentCounter).padStart(3, "0")}`,
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
    statusHistory: history([status === "LEFT" ? "ACTIVE" : status, joinedAt ?? day(2000, 1, 1)]),
    departments: [],
    assignments: [],
    payerMemberId: null,
    paymentMethod: "DIRECT_DEBIT",
    ...over,
  };
}

interface RunOptions {
  feeTypes?: EngineFeeType[];
  settings?: Partial<EngineSettings>;
  periodStart?: Date;
  periodEnd?: Date;
  payerNames?: Record<string, string>;
}

function input(members: EngineMember[], options: RunOptions = {}): EngineInput {
  return {
    periodStart: options.periodStart ?? day(2026, 10, 1),
    periodEnd: options.periodEnd ?? day(2026, 12, 31),
    feeTypes: options.feeTypes ?? FEE_TYPES,
    settings: { ...SETTINGS, ...options.settings },
    members,
    payerNames: options.payerNames,
  };
}

const run = (members: EngineMember[], options: RunOptions = {}): EnginePreview =>
  calculateFees(input(members, options));

function chargeOf(preview: EnginePreview, id: string) {
  const charge = preview.charges.find((c) => c.memberId === id);
  if (!charge)
    throw new Error(
      `Keine Forderung für ${id}: ${JSON.stringify({ exempt: preview.exempt, skipped: preview.skipped, warnings: preview.warnings })}`,
    );
  return charge;
}
const amountOf = (preview: EnginePreview, id: string) =>
  preview.charges.find((c) => c.memberId === id)?.amountCents ?? null;
const codesOf = (preview: EnginePreview, id: string) =>
  preview.warnings.filter((w) => w.memberId === id).map((w) => w.code);
const lineAmounts = (preview: EnginePreview, id: string) =>
  chargeOf(preview, id).lines.map((l) => l.amountCents);

/** Ergebnis eines Laufs mit genau einem Mitglied: Betrag in Cent oder „skipped“/„exempt“. */
function outcome(preview: EnginePreview, id: string): number | "skipped" | "exempt" {
  const amount = amountOf(preview, id);
  if (amount !== null) return amount;
  if (preview.exempt.some((e) => e.memberId === id)) return "exempt";
  if (preview.skipped.some((s) => s.memberId === id)) return "skipped";
  throw new Error(`Mitglied ${id} fehlt im Ergebnis`);
}

// ---------------------------------------------------------------------------
// Rationale Zahlen
// ---------------------------------------------------------------------------

describe("Gegenprobe: kaufmännisches Runden", () => {
  it.each([
    [1, 2, 1],
    [-1, 2, -1],
    [3, 2, 2],
    [-3, 2, -2],
    [5, 2, 3],
    [-5, 2, -3],
    [1, 3, 0],
    [-1, 3, 0],
    [2, 3, 1],
    [-2, 3, -1],
    [49, 100, 0],
    [-49, 100, 0],
    [51, 100, 1],
    [-51, 100, -1],
    [0, 7, 0],
    [7, 1, 7],
    [-7, 1, -7],
  ])("%i/%i → %i (symmetrisch zu negativen Werten)", (n, d, expected) => {
    expect(roundHalfAwayFromZero(rational(n, d))).toBe(expected);
    expect(Object.is(roundHalfAwayFromZero(rational(n, d)), -0)).toBe(false);
  });
});

describe("Gegenprobe: apportion mit negativen Teilen", () => {
  it.each<[string, number, [number, number][], number[]]>([
    [
      "halbe Cent: Gleichstand → vorderer Teil",
      1,
      [
        [1, 2],
        [1, 2],
      ],
      [1, 0],
    ],
    [
      "±½ heben sich auf",
      0,
      [
        [1, 2],
        [-1, 2],
      ],
      [1, -1],
    ],
    [
      "drei Drittel, zwei Cent",
      2,
      [
        [2, 3],
        [2, 3],
        [2, 3],
      ],
      [1, 1, 0],
    ],
    [
      "Ermäßigung mit größerem Rest bekommt den Cent",
      2294,
      [
        [94800, 31],
        [-23700, 31],
      ],
      [3058, -764],
    ],
    // ⌊−½⌋ = −1: Reste ½, ½, 0 → der fehlende Cent geht an den vorderen Teil.
    [
      "nur negative Teile",
      -3,
      [
        [-1, 2],
        [-1, 2],
        [-2, 1],
      ],
      [0, -1, -2],
    ],
    [
      "Summe kleiner als abgerundete Teile",
      -3,
      [
        [1, 3],
        [1, 3],
        [1, 3],
      ],
      [-1, -1, -1],
    ],
  ])("%s", (_label, total, parts, expected) => {
    const result = apportion(
      total,
      parts.map(([n, d]) => rational(n, d)),
    );
    expect(result).toEqual(expected);
    expect(result.reduce((a, b) => a + b, 0)).toBe(total);
  });

  it("verteilt bei zufälligen Teilen mit beiden Vorzeichen immer genau die gerundete Summe (je Zeile < 1 Cent daneben)", () => {
    let seed = 12345;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed;
    };
    for (let round = 0; round < 300; round++) {
      const count = 1 + (next() % 6);
      const parts = Array.from({ length: count }, () =>
        rational((next() % 200001) - 100000, 1 + (next() % 97)),
      );
      const total = roundHalfAwayFromZero(sum(parts));
      const result = apportion(total, parts);
      expect(result.reduce((a, b) => a + b, 0)).toBe(total);
      result.forEach((cents, i) => {
        const exact = Number(parts[i]!.n) / Number(parts[i]!.d);
        expect(Math.abs(cents - exact)).toBeLessThan(1);
      });
    }
  });
});

// ---------------------------------------------------------------------------
// Zeiträume
// ---------------------------------------------------------------------------

describe("Gegenprobe: Zeiträume an Jahres- und Schaltjahresgrenzen", () => {
  it.each<[Parameters<typeof periodFor>[0], Date, string, string, string]>([
    ["MONTHLY", day(2028, 2, 15), "2028-02-01", "2028-02-29", "Februar 2028"],
    ["MONTHLY", day(2027, 2, 28), "2027-02-01", "2027-02-28", "Februar 2027"],
    ["MONTHLY", day(2100, 2, 1), "2100-02-01", "2100-02-28", "Februar 2100"],
    ["MONTHLY", day(2026, 12, 31), "2026-12-01", "2026-12-31", "Dezember 2026"],
    ["QUARTERLY", day(2028, 3, 31), "2028-01-01", "2028-03-31", "1. Quartal 2028"],
    ["QUARTERLY", day(2026, 10, 1), "2026-10-01", "2026-12-31", "4. Quartal 2026"],
    ["HALF_YEARLY", day(2026, 6, 30), "2026-01-01", "2026-06-30", "1. Halbjahr 2026"],
    ["HALF_YEARLY", day(2026, 7, 1), "2026-07-01", "2026-12-31", "2. Halbjahr 2026"],
    ["YEARLY", day(2028, 2, 29), "2028-01-01", "2028-12-31", "2028"],
  ])("%s für %s", (interval, d, start, end, label) => {
    const period = periodFor(interval, d);
    expect([iso(period.start), iso(period.end), period.label]).toEqual([start, end, label]);
  });

  it("nextPeriod/previousPeriod über Jahres- und Februargrenzen", () => {
    expect(nextPeriod("MONTHLY", day(2028, 1, 31)).label).toBe("Februar 2028");
    expect(iso(nextPeriod("MONTHLY", day(2028, 1, 31)).end)).toBe("2028-02-29");
    expect(nextPeriod("QUARTERLY", day(2026, 11, 15)).label).toBe("1. Quartal 2027");
    expect(nextPeriod("YEARLY", day(2026, 12, 31)).label).toBe("2027");
    expect(previousPeriod("HALF_YEARLY", day(2027, 1, 1)).label).toBe("2. Halbjahr 2026");
    expect(iso(previousPeriod("MONTHLY", day(2028, 3, 1)).end)).toBe("2028-02-29");
    expect(iso(previousPeriod("MONTHLY", day(2027, 3, 1)).end)).toBe("2027-02-28");
  });

  it("daysInMonth, monthsOfInterval und dueDate", () => {
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(day(2026, 10, 31))).toBe(31);
    expect(daysInMonth(day(2026, 11, 1))).toBe(30);
    expect(
      (["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"] as const).map(monthsOfInterval),
    ).toEqual([1, 3, 6, 12]);
    expect(iso(dueDate(day(2027, 2, 1), 28))).toBe("2027-02-28");
    expect(iso(dueDate(day(2026, 10, 1), 1))).toBe("2026-10-01");
    expect(iso(dueDate(day(2026, 12, 1), 15))).toBe("2026-12-15");
  });
});

// ---------------------------------------------------------------------------
// Rechenkern
// ---------------------------------------------------------------------------

describe("Gegenprobe: Fälle aus der Vorgabe (Texte genau)", () => {
  it("Hans, Lukas, Claudia: Beträge, Zeilen, Erklärungen", () => {
    const preview = run([
      member({ id: "hans", name: "Hans Huber" }),
      member({ id: "lukas", name: "Lukas Lang", birthDate: day(2008, 11, 12) }),
      member({
        id: "claudia",
        name: "Claudia Christ",
        assignments: [
          assignment({ kind: "DISCOUNT_PERCENT", percentBp: 5000, reason: "Übungsleiterin" }),
        ],
      }),
    ]);
    const hans = chargeOf(preview, "hans");
    expect(hans.amountCents).toBe(3600);
    expect(hans.lines.map((l) => [l.text, l.exact])).toEqual([["Erwachsene", "3600/1"]]);
    expect(plain(hans.explanation)).toBe("Erwachsene → 36,00 €");

    const lukas = chargeOf(preview, "lukas");
    expect(lukas.amountCents).toBe(2780);
    expect(lukas.lines.map((l) => [l.text, l.amountCents, iso(l.fromDate), iso(l.toDate)])).toEqual(
      [
        [
          "Jugend bis 17 Jahre, ab 01.10. bis Geburtstag im November",
          820,
          "2026-10-01",
          "2026-11-11",
        ],
        ["Erwachsene, ab Geburtstag im November bis 31.12.", 1960, "2026-11-12", "2026-12-31"],
      ],
    );
    expect(plain(lukas.explanation)).toBe(
      "Jugend bis 17 Jahre bis Geburtstag im November, danach Erwachsene → 27,80 €",
    );
    expect(lukas.mainFeeTypeName).toBe("Erwachsene");
    expect(codesOf(preview, "lukas")).toContain("AGE_LIMIT_IN_PERIOD");
    expect(codesOf(preview, "hans")).not.toContain("AGE_LIMIT_IN_PERIOD");

    const claudia = chargeOf(preview, "claudia");
    expect(claudia.amountCents).toBe(1800);
    expect(claudia.lines.map((l) => [l.text, l.amountCents, l.exact])).toEqual([
      ["Erwachsene", 3600, "3600/1"],
      ["50 % ermäßigt (Übungsleiterin)", -1800, "-1800/1"],
    ]);
    expect(plain(claudia.explanation)).toBe("Erwachsene, 50 % ermäßigt (Übungsleiterin) → 18,00 €");
    expect(preview.totalCents).toBe(3600 + 2780 + 1800);
  });

  it("Eintritt 15.11.: Zeile „Erwachsene, 15.11.–31.12.“ und Erklärung mit Eintritt", () => {
    const preview = run([
      member({
        id: "neu",
        name: "Nina Neu",
        joinedAt: day(2026, 11, 15),
      }),
    ]);
    const charge = chargeOf(preview, "neu");
    expect(charge.amountCents).toBe(1840);
    expect(charge.lines.map((l) => [l.text, l.exact])).toEqual([
      ["Erwachsene, 15.11.–31.12.", "1840/1"],
    ]);
    expect(plain(charge.explanation)).toBe("Erwachsene ab 15.11. (Eintritt) → 18,40 €");
  });
});

describe("Gegenprobe: Eintritt unter jeder Regel (Erwachsene 12 €/Monat, 4. Quartal 2026)", () => {
  type Expected = number | "skipped";
  const cases: [string, Date, Record<ProRataEntryValue, Expected>][] = [
    [
      "am Beginn des Zeitraums",
      day(2026, 10, 1),
      { DAY: 3600, MONTH_START: 3600, NEXT_MONTH: 2400, NONE: 3600 },
    ],
    // 1200·17/31 + 2400 = 94800/31 = 3058,06
    [
      "mitten im 31-Tage-Monat",
      day(2026, 10, 15),
      { DAY: 3058, MONTH_START: 3600, NEXT_MONTH: 2400, NONE: 3600 },
    ],
    // 1200·1/31 + 2400 = 2438,71
    [
      "am 31. Oktober",
      day(2026, 10, 31),
      { DAY: 2439, MONTH_START: 3600, NEXT_MONTH: 2400, NONE: 3600 },
    ],
    [
      "am 1. November",
      day(2026, 11, 1),
      { DAY: 2400, MONTH_START: 2400, NEXT_MONTH: 1200, NONE: 3600 },
    ],
    [
      "am 15. November",
      day(2026, 11, 15),
      { DAY: 1840, MONTH_START: 2400, NEXT_MONTH: 1200, NONE: 3600 },
    ],
    // 1200·1/30 + 1200 = 1240
    [
      "am 30. November",
      day(2026, 11, 30),
      { DAY: 1240, MONTH_START: 2400, NEXT_MONTH: 1200, NONE: 3600 },
    ],
    [
      "am 1. Dezember",
      day(2026, 12, 1),
      { DAY: 1200, MONTH_START: 1200, NEXT_MONTH: "skipped", NONE: 3600 },
    ],
    // 1200/31 = 38,71
    [
      "am letzten Tag des Zeitraums",
      day(2026, 12, 31),
      { DAY: 39, MONTH_START: 1200, NEXT_MONTH: "skipped", NONE: 3600 },
    ],
    [
      "nach dem Zeitraum (Abweichung 6: auch NONE überspringt)",
      day(2027, 1, 1),
      { DAY: "skipped", MONTH_START: "skipped", NEXT_MONTH: "skipped", NONE: "skipped" },
    ],
    [
      "am letzten Tag davor",
      day(2026, 9, 30),
      { DAY: 3600, MONTH_START: 3600, NEXT_MONTH: 3600, NONE: 3600 },
    ],
  ];
  for (const [label, joinedAt, expected] of cases) {
    it.each(Object.entries(expected) as [ProRataEntryValue, Expected][])(
      `Eintritt ${label} (${iso(joinedAt)}) mit %s → %s`,
      (rule, cents) => {
        const preview = run([member({ id: "m", name: "Mia", joinedAt })], {
          settings: { proRataEntry: rule },
        });
        expect(outcome(preview, "m")).toBe(cents);
        if (cents === "skipped")
          expect(preview.skipped[0]!.reason).toContain("Eintritt nach dem Zeitraum");
      },
    );
  }
});

describe("Gegenprobe: Austritt unter jeder Regel – Verlauf ohne LEFT-Eintrag", () => {
  type Expected = number | "skipped";
  const cases: [Date, Record<ProRataExitValue, Expected>][] = [
    [day(2026, 9, 30), { DAY: "skipped", MONTH_END: "skipped", PERIOD_END: "skipped" }],
    [day(2026, 10, 1), { DAY: 39, MONTH_END: 1200, PERIOD_END: 3600 }],
    // 1200·15/31 = 580,65
    [day(2026, 10, 15), { DAY: 581, MONTH_END: 1200, PERIOD_END: 3600 }],
    [day(2026, 10, 31), { DAY: 1200, MONTH_END: 1200, PERIOD_END: 3600 }],
    [day(2026, 11, 1), { DAY: 1240, MONTH_END: 2400, PERIOD_END: 3600 }],
    [day(2026, 11, 15), { DAY: 1800, MONTH_END: 2400, PERIOD_END: 3600 }],
    [day(2026, 12, 31), { DAY: 3600, MONTH_END: 3600, PERIOD_END: 3600 }],
    [day(2027, 1, 15), { DAY: 3600, MONTH_END: 3600, PERIOD_END: 3600 }],
  ];
  for (const [leftAt, expected] of cases) {
    it.each(Object.entries(expected) as [ProRataExitValue, Expected][])(
      `Austritt ${iso(leftAt)} mit %s → %s`,
      (rule, cents) => {
        const preview = run(
          [
            member({
              id: "m",
              name: "Max",
              status: "LEFT",
              leftAt,
              statusHistory: history(["ACTIVE", day(2010, 1, 1)]),
            }),
          ],
          { settings: { proRataExit: rule } },
        );
        expect(outcome(preview, "m")).toBe(cents);
        if (cents === "skipped")
          expect(preview.skipped[0]!.reason).toContain("ausgetreten vor dem Zeitraum");
      },
    );
  }
});

/**
 * So schreibt die Datenbank den Verlauf wirklich (Trigger „Member_status_history“ und die Übernahme in der Migration
 * 20261005130000_finance_fees): Beim Austritt mit Datum entsteht ein LEFT-Eintrag mit `validFrom = leftAt`. Die
 * Austrittsregel („bis zum Tag“, „bis Monatsende“, „bis Ende des Zeitraums“) muss trotzdem dieselben Beträge liefern wie
 * ohne diesen Eintrag – sonst zahlt jedes ausgetretene Mitglied anders, als die Regel des Vereins sagt.
 */
describe("Gegenprobe: Austritt mit LEFT-Eintrag ab dem Austrittstag (wie der Datenbank-Trigger)", () => {
  type Expected = number | "skipped";
  const cases: [Date, Record<ProRataExitValue, Expected>][] = [
    [day(2026, 10, 1), { DAY: 39, MONTH_END: 1200, PERIOD_END: 3600 }],
    [day(2026, 11, 15), { DAY: 1800, MONTH_END: 2400, PERIOD_END: 3600 }],
    // Kündigung zum Jahresende: Austrittsdatum 31.12. – ganzes Quartal.
    [day(2026, 12, 31), { DAY: 3600, MONTH_END: 3600, PERIOD_END: 3600 }],
  ];
  for (const [leftAt, expected] of cases) {
    it.each(Object.entries(expected) as [ProRataExitValue, Expected][])(
      `Austritt ${iso(leftAt)} mit %s → %s`,
      (rule, cents) => {
        const preview = run(
          [
            member({
              id: "m",
              name: "Max",
              status: "LEFT",
              leftAt,
              statusHistory: history(["ACTIVE", day(2010, 1, 1)], ["LEFT", leftAt]),
            }),
          ],
          { settings: { proRataExit: rule } },
        );
        expect(outcome(preview, "m")).toBe(cents);
      },
    );
  }

  it("Gegenprobe zur Ursache: LEFT-Eintrag erst am Tag NACH dem Austritt → Regeln wirken", () => {
    const leftAt = day(2026, 11, 15);
    const results = (["DAY", "MONTH_END", "PERIOD_END"] as const).map((rule) =>
      amountOf(
        run(
          [
            member({
              id: "m",
              name: "Max",
              status: "LEFT",
              leftAt,
              statusHistory: history(["ACTIVE", day(2010, 1, 1)], ["LEFT", day(2026, 11, 16)]),
            }),
          ],
          { settings: { proRataExit: rule } },
        ),
        "m",
      ),
    );
    expect(results).toEqual([1800, 2400, 3600]);
  });

  it("LEFT-Eintrag nach dem Zeitraum stört nicht", () => {
    const leftAt = day(2027, 1, 15);
    const preview = run([
      member({
        id: "m",
        name: "Max",
        status: "LEFT",
        leftAt,
        statusHistory: history(["ACTIVE", day(2010, 1, 1)], ["LEFT", leftAt]),
      }),
    ]);
    expect(amountOf(preview, "m")).toBe(3600);
  });
});

describe("Gegenprobe: Februar, Schaltjahr und 31-Tage-Monate", () => {
  it.each<[string, Date, Date, Date, Partial<EngineSettings>, number | "skipped"]>([
    // 1200·14/28 + 1200
    ["Q1 2027, Eintritt 15.02.", day(2027, 1, 1), day(2027, 3, 31), day(2027, 2, 15), {}, 1800],
    // 1200·15/29 + 1200 = 52800/29 = 1820,69
    ["Q1 2028, Eintritt 15.02.", day(2028, 1, 1), day(2028, 3, 31), day(2028, 2, 15), {}, 1821],
    // 1200/28 + 1200 = 1242,86
    ["Q1 2027, Eintritt 28.02.", day(2027, 1, 1), day(2027, 3, 31), day(2027, 2, 28), {}, 1243],
    // 1200/29 + 1200 = 1241,38
    ["Q1 2028, Eintritt 29.02.", day(2028, 1, 1), day(2028, 3, 31), day(2028, 2, 29), {}, 1241],
    [
      "Februar 2028, Eintritt 29.02. ab Folgemonat",
      day(2028, 2, 1),
      day(2028, 2, 29),
      day(2028, 2, 29),
      { proRataEntry: "NEXT_MONTH" },
      "skipped",
    ],
    [
      "Februar 2028, Eintritt 29.02. ab Monatsanfang",
      day(2028, 2, 1),
      day(2028, 2, 29),
      day(2028, 2, 29),
      { proRataEntry: "MONTH_START" },
      1200,
    ],
    // 1200/29 + 10·1200 = 12041,38
    ["Jahr 2028, Eintritt 29.02.", day(2028, 1, 1), day(2028, 12, 31), day(2028, 2, 29), {}, 12041],
  ])("%s", (_label, periodStart, periodEnd, joinedAt, settings, expected) => {
    const preview = run([member({ id: "m", name: "Mia", joinedAt })], {
      periodStart,
      periodEnd,
      settings,
    });
    expect(outcome(preview, "m")).toBe(expected);
  });

  it("Austritt 28.02.2027 bis Monatsende → ganzer Februar", () => {
    const preview = run(
      [
        member({
          id: "m",
          name: "Max",
          status: "LEFT",
          leftAt: day(2027, 2, 28),
          statusHistory: history(["ACTIVE", day(2010, 1, 1)]),
        }),
      ],
      {
        periodStart: day(2027, 1, 1),
        periodEnd: day(2027, 3, 31),
        settings: { proRataExit: "MONTH_END" },
      },
    );
    expect(amountOf(preview, "m")).toBe(2400);
  });

  it("Eintritt 15.10. (31 Tage): genauer Wert 94800/31", () => {
    const preview = run([member({ id: "m", name: "Mia", joinedAt: day(2026, 10, 15) })]);
    const charge = chargeOf(preview, "m");
    expect(charge.amountCents).toBe(3058);
    expect(charge.lines.map((l) => l.exact)).toEqual(["94800/31"]);
  });
});

describe("Gegenprobe: Status-Verlauf", () => {
  it("ACTIVE → PASSIVE am 16.11.: zwei Zeilen, Erklärung", () => {
    const preview = run([
      member({
        id: "m",
        name: "Paula",
        statusHistory: history(["ACTIVE", day(2010, 1, 1)], ["PASSIVE", day(2026, 11, 16)]),
        status: "PASSIVE",
      }),
    ]);
    const charge = chargeOf(preview, "m");
    expect(charge.amountCents).toBe(2400);
    expect(charge.lines.map((l) => [l.text, l.amountCents])).toEqual([
      ["Erwachsene, 01.10.–15.11.", 1800],
      ["Passiv, 16.11.–31.12.", 600],
    ]);
    expect(plain(charge.explanation)).toBe("Erwachsene bis 15.11., danach Passiv → 24,00 €");
  });

  it("ACTIVE → PASSIVE am 31.10.: 36400/31 + 800, Cent an die Zeile mit größerem Rest", () => {
    const preview = run([
      member({
        id: "m",
        name: "Paula",
        statusHistory: history(["ACTIVE", day(2010, 1, 1)], ["PASSIVE", day(2026, 10, 31)]),
      }),
    ]);
    expect(amountOf(preview, "m")).toBe(1974);
    expect(lineAmounts(preview, "m")).toEqual([1161, 813]);
  });

  it("Gleichstand bei validFrom: der zuletzt erfasste gilt – unabhängig von der Reihenfolge der Eingabe", () => {
    const later = (status: MemberStatusValue, earlier: MemberStatusValue) =>
      history(
        ["ACTIVE", day(2010, 1, 1)],
        [status, day(2026, 11, 16), at(2026, 11, 1, 11)],
        [earlier, day(2026, 11, 16), at(2026, 11, 1, 10)],
      );
    const activeWins = run([
      member({ id: "m", name: "Paula", statusHistory: later("ACTIVE", "PASSIVE") }),
    ]);
    expect(amountOf(activeWins, "m")).toBe(3600);
    const passiveWins = run([
      member({ id: "m", name: "Paula", statusHistory: later("PASSIVE", "ACTIVE") }),
    ]);
    expect(amountOf(passiveWins, "m")).toBe(2400);
    const reversed = run([
      member({ id: "m", name: "Paula", statusHistory: later("PASSIVE", "ACTIVE").reverse() }),
    ]);
    expect(amountOf(reversed, "m")).toBe(2400);
  });

  it("späteres createdAt schlägt kein späteres validFrom", () => {
    const preview = run([
      member({
        id: "m",
        name: "Paula",
        statusHistory: history(
          ["ACTIVE", day(2010, 1, 1), at(2026, 12, 1, 9)],
          ["PASSIVE", day(2026, 11, 1), at(2026, 10, 1, 9)],
        ),
      }),
    ]);
    expect(amountOf(preview, "m")).toBe(1200 + 800);
  });

  it("LEFT mitten im Verlauf und wieder ACTIVE (Wiedereintritt ohne Austrittsdatum)", () => {
    const preview = run([
      member({
        id: "m",
        name: "Rolf",
        statusHistory: history(
          ["ACTIVE", day(2010, 1, 1)],
          ["LEFT", day(2026, 11, 1)],
          ["ACTIVE", day(2026, 12, 1)],
        ),
      }),
    ]);
    expect(amountOf(preview, "m")).toBe(2400);
  });

  it("LEFT-Tage bleiben beitragsfrei, auch wenn eine Beitragsart LEFT ausdrücklich nennt", () => {
    const leftType = feeType({
      id: "ft-left",
      name: "Ausgetretene",
      priority: 1,
      statuses: ["LEFT"],
      rates: [rate("r-left", 999)],
    });
    const preview = run(
      [
        member({
          id: "m",
          name: "Rolf",
          statusHistory: history(
            ["ACTIVE", day(2010, 1, 1)],
            ["LEFT", day(2026, 11, 1)],
            ["ACTIVE", day(2026, 12, 1)],
          ),
        }),
      ],
      { feeTypes: [...FEE_TYPES, leftType] },
    );
    expect(amountOf(preview, "m")).toBe(2400);
  });

  it("Verlauf erst ab 01.11.: Oktober mit dem aktuellen Status, Hinweis genau einmal", () => {
    const preview = run([
      member({
        id: "m",
        name: "Paula",
        status: "PASSIVE",
        statusHistory: history(["PASSIVE", day(2026, 11, 1)]),
      }),
    ]);
    expect(amountOf(preview, "m")).toBe(1200);
    expect(codesOf(preview, "m").filter((c) => c === "STATUS_HISTORY_INCOMPLETE")).toHaveLength(1);
  });

  it("kein Verlauf: aktueller Status, Hinweis genau einmal", () => {
    const preview = run([member({ id: "m", name: "Paula", status: "PASSIVE", statusHistory: [] })]);
    expect(amountOf(preview, "m")).toBe(1200);
    expect(codesOf(preview, "m").filter((c) => c === "STATUS_HISTORY_INCOMPLETE")).toHaveLength(1);
  });

  it("nur ein LEFT-Eintrag ab dem Austrittstag (Abweichung 2: davor als aktiv) – Austrittstag zählt mit", () => {
    const preview = run([
      member({
        id: "m",
        name: "Max",
        status: "LEFT",
        leftAt: day(2026, 11, 15),
        statusHistory: history(["LEFT", day(2026, 11, 15)]),
      }),
    ]);
    expect(codesOf(preview, "m")).toContain("STATUS_HISTORY_INCOMPLETE");
    // Wie „Austritt 15.11. bis zum Tag“: 1200 + 1200·15/30.
    expect(amountOf(preview, "m")).toBe(1800);
  });

  it("BLOCKED zählt zu den Standard-Status", () => {
    const preview = run([member({ id: "m", name: "Bert", status: "BLOCKED" })]);
    expect(amountOf(preview, "m")).toBe(3600);
  });

  it("passives Kind: Jugend (Rang 10, leere Status = auch PASSIVE) vor Passiv (Rang 20)", () => {
    const preview = run([
      member({ id: "m", name: "Kira", status: "PASSIVE", birthDate: day(2016, 3, 3) }),
    ]);
    expect(amountOf(preview, "m")).toBe(1800);
  });
});

describe("Gegenprobe: Beitragssätze", () => {
  it.each<[string, EngineFeeRate[], number, number[]]>([
    [
      "Wechsel am 01.12. (Monatsanfang)",
      [rate("a", 1200), rate("b", 1500, "MONTHLY", day(2026, 12, 1))],
      3900,
      [2400, 1500],
    ],
    [
      "Wechsel am 16.11. (Monatsmitte)",
      [rate("a", 1200), rate("b", 1500, "MONTHLY", day(2026, 11, 16))],
      4050,
      [1800, 2250],
    ],
    // 19200/31 | 22500/31 + 3000
    [
      "Wechsel am 17.10. (31-Tage-Monat)",
      [rate("a", 1200), rate("b", 1500, "MONTHLY", day(2026, 10, 17))],
      4345,
      [619, 3726],
    ],
    // 2400 + 36000/31 | 1500/31
    [
      "Wechsel am letzten Tag des Zeitraums",
      [rate("a", 1200), rate("b", 1500, "MONTHLY", day(2026, 12, 31))],
      3610,
      [3561, 49],
    ],
    [
      "Wechsel genau am Beginn des Zeitraums",
      [rate("a", 1200), rate("b", 1500, "MONTHLY", day(2026, 10, 1))],
      4500,
      [4500],
    ],
    [
      "ungeordnete Sätze",
      [
        rate("c", 1500, "MONTHLY", day(2026, 12, 1)),
        rate("a", 1000),
        rate("b", 1200, "MONTHLY", day(2025, 1, 1)),
      ],
      3900,
      [2400, 1500],
    ],
    [
      "gleicher Betrag, neuer Satz: trotzdem zwei Abschnitte",
      [rate("a", 1200), rate("b", 1200, "MONTHLY", day(2026, 12, 1))],
      3600,
      [2400, 1200],
    ],
    [
      "Wechsel auf jährlich am 16.11.",
      [rate("a", 1200), rate("b", 12000, "YEARLY", day(2026, 11, 16))],
      3300,
      [1800, 1500],
    ],
    ["jährlich 100 € im Quartal", [rate("a", 10000, "YEARLY")], 2500, [2500]],
    ["halbjährlich 60 € im Quartal", [rate("a", 6000, "HALF_YEARLY")], 3000, [3000]],
    ["vierteljährlich 36 € im Quartal", [rate("a", 3600, "QUARTERLY")], 3600, [3600]],
  ])("%s", (_label, rates, total, lines) => {
    const preview = run([member({ id: "m", name: "Hans" })], {
      feeTypes: [adultWith(...rates), YOUTH, PASSIVE],
    });
    expect(amountOf(preview, "m")).toBe(total);
    expect(lineAmounts(preview, "m")).toEqual(lines);
  });

  it("Wechsel am 16.11.: Zeilentexte mit Zeitraum und genaue Werte", () => {
    const preview = run([member({ id: "m", name: "Hans" })], {
      feeTypes: [adultWith(rate("a", 1200), rate("b", 1500, "MONTHLY", day(2026, 11, 16)))],
    });
    expect(chargeOf(preview, "m").lines.map((l) => [l.text, l.feeRateId, l.exact])).toEqual([
      ["Erwachsene, 01.10.–15.11.", "a", "1800/1"],
      ["Erwachsene, 16.11.–31.12.", "b", "2250/1"],
    ]);
  });

  it("jährlicher Satz auf einen Monat (Oktober) und auf ein Jahr", () => {
    const types = [adultWith(rate("a", 10000, "YEARLY"))];
    const october = run([member({ id: "m", name: "Hans" })], {
      feeTypes: types,
      periodStart: day(2026, 10, 1),
      periodEnd: day(2026, 10, 31),
    });
    expect(amountOf(october, "m")).toBe(833);
    const year = run([member({ id: "m", name: "Hans" })], {
      feeTypes: types,
      periodStart: day(2026, 1, 1),
      periodEnd: day(2026, 12, 31),
    });
    expect(amountOf(year, "m")).toBe(10000);
  });

  it("jährlicher Satz, Eintritt 15.10.: 10000·17/372 + 2·10000/12 = 2123,66", () => {
    const preview = run([member({ id: "m", name: "Mia", joinedAt: day(2026, 10, 15) })], {
      feeTypes: [adultWith(rate("a", 10000, "YEARLY"))],
    });
    expect(amountOf(preview, "m")).toBe(2124);
  });

  it("Satz erst nach dem Zeitraum gültig: keine Forderung, Hinweis „kein Beitragssatz gültig“", () => {
    const preview = run([member({ id: "m", name: "Hans" })], {
      feeTypes: [adultWith(rate("a", 1200, "MONTHLY", day(2027, 1, 1))), YOUTH, PASSIVE],
    });
    expect(amountOf(preview, "m")).toBeNull();
    const warning = preview.warnings.find((w) => w.memberId === "m" && w.code === "NO_FEE_TYPE");
    expect(warning?.text).toContain("kein Beitragssatz gültig");
  });

  it("erster Satz ab 01.11.: Oktober ohne Beitrag (Hinweis), danach 2400", () => {
    const preview = run([member({ id: "m", name: "Hans" })], {
      feeTypes: [adultWith(rate("a", 1200, "MONTHLY", day(2026, 11, 1))), YOUTH, PASSIVE],
    });
    expect(amountOf(preview, "m")).toBe(2400);
    expect(codesOf(preview, "m")).toContain("NO_FEE_TYPE");
  });

  // Eine Beitragsart gilt erst mit ihrem ersten Betrag – bis dahin greift die nächste passende (Review: sonst zahlten
  // z. B. alle Senioren nichts, sobald „Senioren ab 65“ für das nächste Jahr angelegt und nach oben gestellt ist).
  it("Jugend-Satz erst ab 2027: bis dahin gilt für Lukas „Erwachsene“ – 3600, ohne Hinweis", () => {
    const youth = { ...YOUTH, rates: [rate("r-youth", 600, "MONTHLY", day(2027, 1, 1))] };
    const preview = run([member({ id: "m", name: "Lukas", birthDate: day(2008, 11, 12) })], {
      feeTypes: [ADULT, youth, PASSIVE],
    });
    expect(amountOf(preview, "m")).toBe(3600);
    expect(codesOf(preview, "m")).not.toContain("NO_FEE_TYPE");
  });

  it("nur ein einmaliger Satz (ONCE): kein laufender Beitrag", () => {
    const preview = run([member({ id: "m", name: "Hans" })], {
      feeTypes: [adultWith(rate("a", 5000, "ONCE"))],
    });
    expect(amountOf(preview, "m")).toBeNull();
  });
});

describe("Gegenprobe: Zuordnungen", () => {
  it("fester Betrag bis 15.11., danach 50 % Ermäßigung: 750 + 1800 − 900", () => {
    const fixed = assignment({
      kind: "FIXED_AMOUNT",
      amountCents: 500,
      validTo: day(2026, 11, 15),
      reason: "Vorstand",
    });
    const discount = assignment({
      kind: "DISCOUNT_PERCENT",
      percentBp: 5000,
      validFrom: day(2026, 11, 16),
      reason: "Übungsleiterin",
    });
    const preview = run([member({ id: "m", name: "Vera", assignments: [fixed, discount] })]);
    const charge = chargeOf(preview, "m");
    expect(charge.amountCents).toBe(1650);
    expect(charge.lines.map((l) => [l.amountCents, l.assignmentId]).sort()).toEqual(
      [
        [-900, discount.id],
        [1800, null],
        [750, fixed.id],
      ].sort(),
    );
  });

  it("feste Beitragsart + Ermäßigung: Passiv 400 → 1200 − 600", () => {
    const preview = run([
      member({
        id: "m",
        name: "Vera",
        assignments: [
          assignment({ kind: "ASSIGN", feeTypeId: "ft-passive" }),
          assignment({ kind: "DISCOUNT_PERCENT", percentBp: 5000, reason: "Härtefall" }),
        ],
      }),
    ]);
    expect(amountOf(preview, "m")).toBe(600);
    expect(lineAmounts(preview, "m")).toEqual([1200, -600]);
  });

  it("feste Beitragsart Jugend für Erwachsene (Altersregel übergangen) + fester Betrag 10 €", () => {
    const preview = run([
      member({
        id: "m",
        name: "Vera",
        assignments: [
          assignment({ kind: "ASSIGN", feeTypeId: "ft-youth" }),
          assignment({ kind: "FIXED_AMOUNT", amountCents: 1000 }),
        ],
      }),
    ]);
    const charge = chargeOf(preview, "m");
    expect(charge.amountCents).toBe(3000);
    expect(charge.lines.map((l) => l.feeTypeId)).toEqual(["ft-youth"]);
  });

  it("fester Betrag ist je Monat – auch bei jährlichem Satz", () => {
    const preview = run(
      [
        member({
          id: "m",
          name: "Vera",
          assignments: [assignment({ kind: "FIXED_AMOUNT", amountCents: 300 })],
        }),
      ],
      { feeTypes: [adultWith(rate("a", 10000, "YEARLY"))] },
    );
    expect(amountOf(preview, "m")).toBe(900);
  });

  it("fester Betrag ab 16.11.: 1200 + 600 + 400 + 800", () => {
    const preview = run([
      member({
        id: "m",
        name: "Vera",
        assignments: [
          assignment({ kind: "FIXED_AMOUNT", amountCents: 800, validFrom: day(2026, 11, 16) }),
        ],
      }),
    ]);
    expect(amountOf(preview, "m")).toBe(3000);
  });

  it("fester Betrag 0 → beitragsfrei", () => {
    const preview = run([
      member({
        id: "m",
        name: "Vera",
        assignments: [assignment({ kind: "FIXED_AMOUNT", amountCents: 0 })],
      }),
    ]);
    expect(outcome(preview, "m")).toBe("exempt");
  });

  it("beitragsfrei bis einschließlich 31.10. → genau 2400", () => {
    const preview = run([
      member({
        id: "m",
        name: "Erik",
        assignments: [
          assignment({
            kind: "EXEMPT",
            validFrom: day(2026, 10, 1),
            validTo: day(2026, 10, 31),
            reason: "Härtefall",
          }),
        ],
      }),
    ]);
    expect(amountOf(preview, "m")).toBe(2400);
  });

  it("beitragsfrei ab 31.12. → 2400 + 1200·30/31", () => {
    const preview = run([
      member({
        id: "m",
        name: "Erik",
        assignments: [
          assignment({ kind: "EXEMPT", validFrom: day(2026, 12, 31), reason: "Härtefall" }),
        ],
      }),
    ]);
    expect(amountOf(preview, "m")).toBe(3561);
  });

  it("beitragsfrei schlägt feste Beitragsart am selben Tag", () => {
    const preview = run([
      member({
        id: "m",
        name: "Erik",
        assignments: [
          assignment({ kind: "ASSIGN", feeTypeId: "ft-adult" }),
          assignment({ kind: "EXEMPT", reason: "Härtefall" }),
        ],
      }),
    ]);
    expect(preview.exempt).toEqual([
      { memberId: "m", memberName: "Erik", reason: "beitragsfrei: Härtefall" },
    ]);
  });

  it("Ermäßigung bis 15.11.: Abschnitt endet mit der Ermäßigung", () => {
    const discount = assignment({
      kind: "DISCOUNT_PERCENT",
      percentBp: 5000,
      validTo: day(2026, 11, 15),
      reason: "Übungsleiterin",
    });
    const preview = run([member({ id: "m", name: "Vera", assignments: [discount] })]);
    const charge = chargeOf(preview, "m");
    expect(charge.amountCents).toBe(2700);
    expect(charge.lines.map((l) => [l.amountCents, iso(l.fromDate), iso(l.toDate)])).toEqual([
      [1800, "2026-10-01", "2026-11-15"],
      [-900, "2026-10-01", "2026-11-15"],
      [1800, "2026-11-16", "2026-12-31"],
    ]);
  });

  it("25 % Ermäßigung bei Eintritt 15.10.: negative Zeile bekommt den fehlenden Cent", () => {
    const preview = run([
      member({
        id: "m",
        name: "Vera",
        joinedAt: day(2026, 10, 15),
        assignments: [assignment({ kind: "DISCOUNT_PERCENT", percentBp: 2500, reason: "Schüler" })],
      }),
    ]);
    const charge = chargeOf(preview, "m");
    expect(charge.amountCents).toBe(2294);
    expect(charge.lines.map((l) => [l.amountCents, l.exact])).toEqual([
      [3058, "94800/31"],
      [-764, "-23700/31"],
    ]);
  });

  it("33,33 % Ermäßigung: −1199,88 → Zeile −1200, Summe 2400", () => {
    const preview = run([
      member({
        id: "m",
        name: "Vera",
        assignments: [assignment({ kind: "DISCOUNT_PERCENT", percentBp: 3333 })],
      }),
    ]);
    expect(amountOf(preview, "m")).toBe(2400);
    expect(lineAmounts(preview, "m")).toEqual([3600, -1200]);
    expect(chargeOf(preview, "m").lines[1]!.text).toContain("33,33 % ermäßigt");
  });

  it("Lukas mit 33,33 %: vier Zeilen, Cent an die Ermäßigung mit größtem Rest", () => {
    const preview = run([
      member({
        id: "m",
        name: "Lukas",
        birthDate: day(2008, 11, 12),
        assignments: [assignment({ kind: "DISCOUNT_PERCENT", percentBp: 3333 })],
      }),
    ]);
    expect(amountOf(preview, "m")).toBe(1853);
    expect(lineAmounts(preview, "m")).toEqual([820, -274, 1960, -653]);
  });

  it("100 % Ermäßigung → beitragsfrei", () => {
    const preview = run([
      member({
        id: "m",
        name: "Vera",
        assignments: [
          assignment({ kind: "DISCOUNT_PERCENT", percentBp: 10000, reason: "Trainer" }),
        ],
      }),
    ]);
    expect(outcome(preview, "m")).toBe("exempt");
  });
});

describe("Gegenprobe: Ehrenmitglieder", () => {
  const honoraryType = feeType({
    id: "ft-honor",
    name: "Ehrenmitglieder",
    priority: 40,
    statuses: ["HONORARY"],
    rates: [rate("r-honor", 100)],
  });

  it("ohne ausdrücklich genannte Beitragsart → beitragsfrei", () => {
    const preview = run([member({ id: "m", name: "Emil", status: "HONORARY" })]);
    expect(preview.exempt).toEqual([
      { memberId: "m", memberName: "Emil", reason: "Ehrenmitglied – beitragsfrei" },
    ]);
    expect(codesOf(preview, "m")).not.toContain("NO_FEE_TYPE");
  });

  it("mit ausdrücklich genannter Beitragsart → berechnet (und unter Mindestbetrag)", () => {
    const preview = run([member({ id: "m", name: "Emil", status: "HONORARY" })], {
      feeTypes: [...FEE_TYPES, honoraryType],
    });
    expect(amountOf(preview, "m")).toBe(300);
    expect(chargeOf(preview, "m").mainFeeTypeName).toBe("Ehrenmitglieder");
    expect(codesOf(preview, "m")).toContain("BELOW_MIN_DEBIT");
  });

  it("Beitragsart für ACTIVE und HONORARY mit Rang 25 gilt für beide", () => {
    const both = feeType({
      id: "ft-both",
      name: "Alle",
      priority: 25,
      statuses: ["ACTIVE", "HONORARY"],
      rates: [rate("r-both", 500)],
    });
    const preview = run(
      [member({ id: "e", name: "Emil", status: "HONORARY" }), member({ id: "h", name: "Hans" })],
      { feeTypes: [...FEE_TYPES, both] },
    );
    expect(amountOf(preview, "e")).toBe(1500);
    expect(amountOf(preview, "h")).toBe(1500);
  });

  it("ausdrücklich genannte Beitragsart mit 0 € → beitragsfrei „Beitrag 0,00 €“", () => {
    const free = { ...honoraryType, rates: [rate("r-honor", 0)] };
    const preview = run([member({ id: "m", name: "Emil", status: "HONORARY" })], {
      feeTypes: [...FEE_TYPES, free],
    });
    expect(outcome(preview, "m")).toBe("exempt");
    expect(plain(preview.exempt[0]!.reason)).toContain("Beitrag 0,00 €");
  });

  it("ab 16.11. Ehrenmitglied: 1800, Erklärung nennt die Beitragsfreiheit", () => {
    const preview = run([
      member({
        id: "m",
        name: "Emil",
        status: "HONORARY",
        statusHistory: history(["ACTIVE", day(2010, 1, 1)], ["HONORARY", day(2026, 11, 16)]),
      }),
    ]);
    expect(amountOf(preview, "m")).toBe(1800);
    expect(chargeOf(preview, "m").explanation).toContain("Ehrenmitglied");
  });

  it("Zusatzbeitrag mit Standard-Status gilt nicht für Ehrenmitglieder, mit HONORARY schon", () => {
    const extra = feeType({
      id: "ft-tennis",
      name: "Tennis-Zusatz",
      kind: "ADDITIONAL",
      departmentId: "d-tennis",
      rates: [rate("r-tennis", 300)],
    });
    const tennis = [{ departmentId: "d-tennis", since: null }];
    const plainExtra = run(
      [member({ id: "m", name: "Emil", status: "HONORARY", departments: tennis })],
      {
        feeTypes: [...FEE_TYPES, extra],
      },
    );
    expect(outcome(plainExtra, "m")).toBe("exempt");
    const honoraryExtra = run(
      [member({ id: "m", name: "Emil", status: "HONORARY", departments: tennis })],
      { feeTypes: [...FEE_TYPES, { ...extra, statuses: ["HONORARY"] }] },
    );
    expect(amountOf(honoraryExtra, "m")).toBe(900);
  });

  it("feste Beitragsart schlägt Ehrenmitglied-Befreiung", () => {
    const preview = run([
      member({
        id: "m",
        name: "Emil",
        status: "HONORARY",
        assignments: [assignment({ kind: "ASSIGN", feeTypeId: "ft-adult" })],
      }),
    ]);
    expect(amountOf(preview, "m")).toBe(3600);
  });
});

describe("Gegenprobe: archivierte Beitragsarten und andere Arten", () => {
  it("archivierte Grundbeitragsart mit Rang 1 wird übergangen", () => {
    const old = feeType({
      id: "ft-old",
      name: "Alt",
      priority: 1,
      archived: true,
      rates: [rate("r-old", 9999)],
    });
    const preview = run([member({ id: "m", name: "Hans" })], { feeTypes: [...FEE_TYPES, old] });
    expect(amountOf(preview, "m")).toBe(3600);
  });

  it("archivierter Zusatzbeitrag der eigenen Abteilung wird nicht berechnet", () => {
    const extra = feeType({
      id: "ft-tennis",
      name: "Tennis-Zusatz",
      kind: "ADDITIONAL",
      departmentId: "d-tennis",
      archived: true,
      rates: [rate("r-tennis", 300)],
    });
    const preview = run(
      [member({ id: "m", name: "Hans", departments: [{ departmentId: "d-tennis", since: null }] })],
      { feeTypes: [...FEE_TYPES, extra] },
    );
    expect(amountOf(preview, "m")).toBe(3600);
  });

  it("FAMILY und ADMISSION werden in diesem Schritt nicht berechnet", () => {
    const family = feeType({
      id: "ft-fam",
      name: "Familie",
      kind: "FAMILY",
      priority: 1,
      rates: [rate("r-fam", 50000)],
    });
    const admission = feeType({
      id: "ft-adm",
      name: "Aufnahme",
      kind: "ADMISSION",
      priority: 2,
      rates: [rate("r-adm", 2000, "ONCE")],
    });
    const preview = run([member({ id: "m", name: "Hans" })], {
      feeTypes: [...FEE_TYPES, family, admission],
    });
    expect(lineAmounts(preview, "m")).toEqual([3600]);
  });

  it("alle Grundbeitragsarten archiviert → keine Forderung, Hinweis NO_FEE_TYPE", () => {
    const preview = run([member({ id: "m", name: "Hans" })], {
      feeTypes: FEE_TYPES.map((t) => ({ ...t, archived: true })),
    });
    expect(amountOf(preview, "m")).toBeNull();
    expect(codesOf(preview, "m")).toContain("NO_FEE_TYPE");
  });
});

describe("Gegenprobe: Alter und Geburtstage", () => {
  it.each<[string, Date, EngineSettings["ageRule"], number]>([
    ["18 genau am 01.11.", day(2008, 11, 1), "EXACT_DAY", 3000],
    // 19200/31 + 2400
    ["18 genau am 31.10.", day(2008, 10, 31), "EXACT_DAY", 3019],
    // 36600/31 + 2400
    ["18 am 02.10.", day(2008, 10, 2), "EXACT_DAY", 3581],
    ["18 am Beginn des Zeitraums, PERIOD_START", day(2008, 10, 1), "PERIOD_START", 3600],
    ["18 einen Tag nach Beginn, PERIOD_START", day(2008, 10, 2), "PERIOD_START", 1800],
    ["Lukas, PERIOD_START", day(2008, 11, 12), "PERIOD_START", 1800],
    ["Lukas, CALENDAR_YEAR", day(2008, 11, 12), "CALENDAR_YEAR", 3600],
    ["Jahrgang 2008 (31.12.), CALENDAR_YEAR", day(2008, 12, 31), "CALENDAR_YEAR", 3600],
    ["Jahrgang 2009 (01.01.), CALENDAR_YEAR", day(2009, 1, 1), "CALENDAR_YEAR", 1800],
  ])("%s", (_label, birthDate, ageRule, expected) => {
    const preview = run([member({ id: "m", name: "Kai", birthDate })], { settings: { ageRule } });
    expect(amountOf(preview, "m")).toBe(expected);
  });

  it("CALENDAR_YEAR über den Jahreswechsel (01.12.2026–31.01.2027): 600 + 1200", () => {
    const preview = run([member({ id: "m", name: "Kai", birthDate: day(2009, 6, 15) })], {
      settings: { ageRule: "CALENDAR_YEAR" },
      periodStart: day(2026, 12, 1),
      periodEnd: day(2027, 1, 31),
    });
    expect(amountOf(preview, "m")).toBe(1800);
    expect(codesOf(preview, "m")).toContain("AGE_LIMIT_IN_PERIOD");
  });

  it("Geburtstag 29.02., Nicht-Schaltjahr: 18 erst am 01.03. (ageOn)", () => {
    const preview = run([member({ id: "m", name: "Kai", birthDate: day(2008, 2, 29) })], {
      periodStart: day(2026, 1, 1),
      periodEnd: day(2026, 3, 31),
    });
    const charge = chargeOf(preview, "m");
    expect(charge.amountCents).toBe(2400);
    expect(charge.lines.map((l) => [l.feeTypeId, iso(l.fromDate), iso(l.toDate)])).toEqual([
      ["ft-youth", "2026-01-01", "2026-02-28"],
      ["ft-adult", "2026-03-01", "2026-03-31"],
    ]);
  });

  it("Geburtstag 29.02., Schaltjahr 2028: 16 genau am 29.02. → 900 + 9000/29", () => {
    const kids = feeType({
      id: "ft-kids",
      name: "Kinder bis 15",
      priority: 5,
      maxAge: 15,
      rates: [rate("r-kids", 300)],
    });
    const preview = run([member({ id: "m", name: "Kai", birthDate: day(2012, 2, 29) })], {
      feeTypes: [...FEE_TYPES, kids],
      periodStart: day(2028, 1, 1),
      periodEnd: day(2028, 3, 31),
    });
    // 300 + 300·28/29 + 600·1/29 + 600 = 1210,34
    expect(amountOf(preview, "m")).toBe(1210);
    expect(chargeOf(preview, "m").lines.map((l) => [l.feeTypeId, iso(l.toDate)])).toEqual([
      ["ft-kids", "2028-02-28"],
      ["ft-youth", "2028-03-31"],
    ]);
  });

  it("Mindestalter: Senioren ab 65 ab dem Geburtstag 15.11.", () => {
    const seniors = feeType({
      id: "ft-senior",
      name: "Senioren ab 65",
      priority: 15,
      minAge: 65,
      rates: [rate("r-senior", 800)],
    });
    const preview = run([member({ id: "m", name: "Siggi", birthDate: day(1961, 11, 15) })], {
      feeTypes: [...FEE_TYPES, seniors],
    });
    // 1200 + 1200·14/30 + 800·16/30 + 800 = 2986,67
    expect(amountOf(preview, "m")).toBe(2987);
  });

  it("ohne Geburtsdatum und „als Erwachsener“ aus: übersprungen mit NO_BIRTH_DATE_SKIPPED", () => {
    const preview = run([member({ id: "m", name: "Otto", birthDate: null })], {
      settings: { missingBirthDateAsAdult: false },
    });
    expect(outcome(preview, "m")).toBe("skipped");
    expect(codesOf(preview, "m")).toContain("NO_BIRTH_DATE_SKIPPED");
  });

  it("ohne Geburtsdatum (Abweichung 3): Erwachsene statt „Senioren ab 65“", () => {
    const seniors = feeType({
      id: "ft-senior",
      name: "Senioren ab 65",
      priority: 15,
      minAge: 65,
      rates: [rate("r-senior", 800)],
    });
    const preview = run([member({ id: "m", name: "Otto", birthDate: null })], {
      feeTypes: [...FEE_TYPES, seniors],
    });
    expect(amountOf(preview, "m")).toBe(3600);
    expect(codesOf(preview, "m")).toContain("NO_BIRTH_DATE");
  });
});

describe("Gegenprobe: Abteilungen", () => {
  const tennisBase = feeType({
    id: "ft-tennis-base",
    name: "Tennis-Grundbeitrag",
    priority: 5,
    departmentId: "d-tennis",
    rates: [rate("r-tb", 2000)],
  });
  const tennisExtra = feeType({
    id: "ft-tennis",
    name: "Tennis-Zusatz",
    kind: "ADDITIONAL",
    departmentId: "d-tennis",
    rates: [rate("r-tennis", 900, "QUARTERLY")],
  });

  it.each<[string, Date | null | undefined, number]>([
    ["schon immer in der Abteilung", null, 6000],
    ["nicht in der Abteilung", undefined, 3600],
    ["seit 16.11.", day(2026, 11, 16), 4800],
    ["seit 01.01.2027", day(2027, 1, 1), 3600],
  ])("Grundbeitrag nur für die Abteilung: %s", (_label, since, expected) => {
    const departments = since === undefined ? [] : [{ departmentId: "d-tennis", since }];
    const preview = run([member({ id: "m", name: "Tina", departments })], {
      feeTypes: [...FEE_TYPES, tennisBase],
    });
    expect(amountOf(preview, "m")).toBe(expected);
  });

  it("Zusatzbeitrag (vierteljährlich 9 €) für den ganzen Zeitraum: zwei Zeilen, Erklärung", () => {
    const preview = run(
      [member({ id: "m", name: "Tina", departments: [{ departmentId: "d-tennis", since: null }] })],
      { feeTypes: [...FEE_TYPES, tennisExtra] },
    );
    const charge = chargeOf(preview, "m");
    expect(charge.amountCents).toBe(4500);
    expect(charge.lines.map((l) => [l.text, l.amountCents])).toEqual([
      ["Erwachsene", 3600],
      ["Tennis-Zusatz", 900],
    ]);
    expect(plain(charge.explanation)).toBe("Erwachsene, dazu Tennis-Zusatz → 45,00 €");
  });

  it("Zusatzbeitrag seit 16.11.: 150 + 300", () => {
    const preview = run(
      [
        member({
          id: "m",
          name: "Tina",
          departments: [{ departmentId: "d-tennis", since: day(2026, 11, 16) }],
        }),
      ],
      { feeTypes: [...FEE_TYPES, tennisExtra] },
    );
    expect(amountOf(preview, "m")).toBe(4050);
  });

  it("Zusatzbeitrag ohne Abteilung wird nicht berechnet", () => {
    const preview = run([member({ id: "m", name: "Tina" })], {
      feeTypes: [...FEE_TYPES, { ...tennisExtra, departmentId: null }],
    });
    expect(amountOf(preview, "m")).toBe(3600);
  });

  it("Zusatzbeitrag mit Höchstalter 17: Lukas nur bis 11.11. (300 + 110)", () => {
    const preview = run(
      [
        member({
          id: "m",
          name: "Lukas",
          birthDate: day(2008, 11, 12),
          departments: [{ departmentId: "d-tennis", since: null }],
        }),
      ],
      { feeTypes: [...FEE_TYPES, { ...tennisExtra, maxAge: 17 }] },
    );
    expect(amountOf(preview, "m")).toBe(2780 + 410);
  });

  it("Zusatzbeitrag auch ohne passenden Grundbeitrag", () => {
    const preview = run(
      [
        member({
          id: "m",
          name: "Tina",
          departments: [{ departmentId: "d-tennis", since: null }],
        }),
      ],
      { feeTypes: [tennisExtra] },
    );
    expect(amountOf(preview, "m")).toBe(900);
    expect(codesOf(preview, "m")).toContain("NO_FEE_TYPE");
  });

  it("Abweichung 4: beitragsfrei gilt auch für den Zusatzbeitrag", () => {
    const preview = run(
      [
        member({
          id: "m",
          name: "Tina",
          departments: [{ departmentId: "d-tennis", since: null }],
          assignments: [assignment({ kind: "EXEMPT", reason: "Härtefall" })],
        }),
      ],
      { feeTypes: [...FEE_TYPES, tennisExtra] },
    );
    expect(outcome(preview, "m")).toBe("exempt");
  });

  it("Hauptbeitragsart: Summe der positiven Zeilen (Erwachsene 36 € ermäßigt vor Tennis 21 €)", () => {
    const extra = { ...tennisExtra, rates: [rate("r-tennis", 700)] };
    const preview = run(
      [
        member({
          id: "m",
          name: "Tina",
          departments: [{ departmentId: "d-tennis", since: null }],
          assignments: [assignment({ kind: "DISCOUNT_PERCENT", percentBp: 5000 })],
        }),
      ],
      { feeTypes: [...FEE_TYPES, extra] },
    );
    const charge = chargeOf(preview, "m");
    expect(charge.amountCents).toBe(1800 + 2100);
    expect(charge.mainFeeTypeName).toBe("Erwachsene");
  });

  it("Hauptbeitragsart ohne Ermäßigung: der größere Zusatzbeitrag", () => {
    const extra = { ...tennisExtra, rates: [rate("r-tennis", 1500)] };
    const preview = run(
      [member({ id: "m", name: "Tina", departments: [{ departmentId: "d-tennis", since: null }] })],
      { feeTypes: [...FEE_TYPES, extra] },
    );
    expect(chargeOf(preview, "m").mainFeeTypeName).toBe("Tennis-Zusatz");
  });
});

describe("Gegenprobe: Zahler", () => {
  it("zwei Kinder und die Mutter: ein Zahler, Namen aus der Mitgliederliste", () => {
    const preview = run([
      member({
        id: "kid-1",
        name: "Kai Vater",
        birthDate: day(2012, 1, 1),
        payerMemberId: "parent",
      }),
      member({
        id: "kid-2",
        name: "Kim Vater",
        birthDate: day(2014, 1, 1),
        payerMemberId: "parent",
      }),
      member({ id: "parent", name: "Petra Vater" }),
    ]);
    expect(
      preview.charges.map((c) => [c.memberName, c.payerMemberId, c.payerName, c.amountCents]),
    ).toEqual([
      ["Kai Vater", "parent", "Petra Vater", 1800],
      ["Kim Vater", "parent", "Petra Vater", 1800],
      ["Petra Vater", "parent", "Petra Vater", 3600],
    ]);
    expect(preview.totalCents).toBe(7200);
    expect(preview.warnings.filter((w) => w.code === "PAYER_NOT_MEMBER")).toEqual([]);
  });

  it("Zahler außerhalb des Laufs (payerNames), archivierter Zahler, Zahler = Mitglied selbst, unbekannter Zahler", () => {
    const preview = run(
      [
        member({ id: "a", name: "Anton", payerMemberId: "ext" }),
        member({ id: "b", name: "Berta", payerMemberId: "archived" }),
        member({ id: "archived", name: "Arne Archiv", inactive: true }),
        member({ id: "c", name: "Carl", payerMemberId: "c" }),
        member({ id: "d", name: "Dora", payerMemberId: "ghost" }),
      ],
      { payerNames: { ext: "Externe Zahlerin", archived: "Anderer Name" } },
    );
    expect(chargeOf(preview, "a").payerName).toBe("Externe Zahlerin");
    expect(chargeOf(preview, "b").payerName).toBe("Arne Archiv");
    expect(chargeOf(preview, "c").payerName).toBe("Carl");
    expect(chargeOf(preview, "d").payerName).toBe("unbekannter Zahler");
    expect(chargeOf(preview, "d").payerMemberId).toBe("ghost");
    expect(
      preview.warnings.filter((w) => w.code === "PAYER_NOT_MEMBER").map((w) => w.memberId),
    ).toEqual(["d"]);
  });

  it("Zahlweg kommt vom Mitglied (der Dienst löst den des Zahlers auf)", () => {
    const preview = run([
      member({ id: "k", name: "Kai", payerMemberId: "p", paymentMethod: "TRANSFER" }),
      member({ id: "p", name: "Petra", paymentMethod: "DIRECT_DEBIT" }),
    ]);
    expect(chargeOf(preview, "k").paymentMethod).toBe("TRANSFER");
  });
});

describe("Gegenprobe: Mindestbetrag Lastschrift", () => {
  const october = { periodStart: day(2026, 10, 1), periodEnd: day(2026, 10, 31) };
  it.each<[number, EngineMember["paymentMethod"], boolean]>([
    [500, "DIRECT_DEBIT", false],
    [499, "DIRECT_DEBIT", true],
    [499, "TRANSFER", false],
    [1, "CASH", false],
  ])("%i Cent per %s → Hinweis %s", (cents, paymentMethod, warned) => {
    const preview = run([member({ id: "m", name: "Hans", paymentMethod })], {
      ...october,
      feeTypes: [adultWith(rate("a", cents))],
    });
    expect(amountOf(preview, "m")).toBe(cents);
    expect(codesOf(preview, "m").includes("BELOW_MIN_DEBIT")).toBe(warned);
  });
});

describe("Gegenprobe: Rundung über mehrere Zeilen", () => {
  it("zwei halbe Cent-Abschnitte (101·15/30 je Zeile) → Summe 101, Zeilen 51 und 50", () => {
    const a = feeType({
      id: "ft-a",
      name: "A",
      priority: 10,
      statuses: ["ACTIVE"],
      rates: [rate("ra", 101)],
    });
    const p = feeType({
      id: "ft-p",
      name: "P",
      priority: 20,
      statuses: ["PASSIVE"],
      rates: [rate("rp", 101)],
    });
    const preview = run(
      [
        member({
          id: "m",
          name: "Paula",
          statusHistory: history(["ACTIVE", day(2010, 1, 1)], ["PASSIVE", day(2026, 11, 16)]),
        }),
      ],
      { feeTypes: [a, p], periodStart: day(2026, 11, 1), periodEnd: day(2026, 11, 30) },
    );
    const charge = chargeOf(preview, "m");
    expect(charge.amountCents).toBe(101);
    expect(charge.lines.map((l) => [l.amountCents, l.exact])).toEqual([
      [51, "101/2"],
      [50, "101/2"],
    ]);
  });
});

describe("Gegenprobe: Überspringen und Hinweise", () => {
  it("Gründe fürs Überspringen", () => {
    const preview = run([
      member({ id: "inactive", name: "Ina", inactive: true }),
      member({ id: "nodate", name: "Leo", status: "LEFT", leftAt: null }),
      member({ id: "late", name: "Lars", joinedAt: day(2027, 1, 1) }),
      member({ id: "gone", name: "Gina", status: "LEFT", leftAt: day(2026, 9, 30) }),
      member({ id: "inactive-left", name: "Ilse", inactive: true, status: "LEFT", leftAt: null }),
    ]);
    expect(preview.charges).toEqual([]);
    const reasons = Object.fromEntries(preview.skipped.map((s) => [s.memberId, s.reason]));
    expect(Object.keys(reasons).sort()).toEqual([
      "gone",
      "inactive",
      "inactive-left",
      "late",
      "nodate",
    ]);
    expect(reasons.late).toContain("Eintritt nach dem Zeitraum");
    expect(reasons.gone).toContain("ausgetreten vor dem Zeitraum");
    expect(codesOf(preview, "nodate")).toEqual(["LEFT_WITHOUT_DATE"]);
    expect(codesOf(preview, "inactive-left")).toEqual([]);
  });

  it("ohne Eintrittsdatum, Verlauf erst ab Anlage 15.11.: ein Hinweis (gleiche Ursache), ganzer Zeitraum", () => {
    const preview = run([
      member({
        id: "m",
        name: "Hans",
        joinedAt: null,
        statusHistory: history(["ACTIVE", day(2026, 11, 15)]),
      }),
    ]);
    expect(amountOf(preview, "m")).toBe(3600);
    expect(codesOf(preview, "m")).toEqual(["NO_JOIN_DATE"]);
  });

  it("ohne Eintrittsdatum: ab Beginn des Zeitraums, Hinweis NO_JOIN_DATE", () => {
    const preview = run([
      member({
        id: "m",
        name: "Hans",
        joinedAt: null,
        statusHistory: history(["ACTIVE", day(2000, 1, 1)]),
      }),
    ]);
    expect(amountOf(preview, "m")).toBe(3600);
    expect(codesOf(preview, "m")).toContain("NO_JOIN_DATE");
  });

  it("Eintritt 15.11. und Austritt 20.11.: 6 Tage, Erklärung mit beidem, unter Mindestbetrag", () => {
    const preview = run([
      member({
        id: "m",
        name: "Kurt",
        joinedAt: day(2026, 11, 15),
        leftAt: day(2026, 11, 20),
        status: "LEFT",
        statusHistory: history(["ACTIVE", day(2026, 11, 15)]),
      }),
    ]);
    const charge = chargeOf(preview, "m");
    expect(charge.amountCents).toBe(240);
    expect(plain(charge.explanation)).toBe(
      "Erwachsene ab 15.11. (Eintritt) bis 20.11. (Austritt) → 2,40 €",
    );
    expect(codesOf(preview, "m")).toContain("BELOW_MIN_DEBIT");
  });
});

describe("Gegenprobe: Reihenfolge, Determinismus, leere Eingabe", () => {
  it("leere Eingabe", () => {
    expect(run([])).toEqual({
      charges: [],
      exempt: [],
      covered: [],
      skipped: [],
      warnings: [],
      totalCents: 0,
    });
    expect(run([], { feeTypes: [] })).toEqual({
      charges: [],
      exempt: [],
      covered: [],
      skipped: [],
      warnings: [],
      totalCents: 0,
    });
  });

  it("keine Beitragsarten: Mitglied nicht berechnet, Hinweis", () => {
    const preview = run([member({ id: "m", name: "Hans" })], { feeTypes: [] });
    expect(preview.charges).toEqual([]);
    expect(preview.totalCents).toBe(0);
    expect(codesOf(preview, "m")).toContain("NO_FEE_TYPE");
  });

  it("deutsche Sortierung nach Namen (Umlaute), gleiche Namen nach id", () => {
    const names = ["Zoe", "Otto", "Österreich", "Ärzte", "Anna"];
    const preview = run([
      ...names.map((name, i) => member({ id: `m-${i}`, name })),
      member({ id: "x-2", name: "Berta Gleich" }),
      member({ id: "x-1", name: "Berta Gleich" }),
      member({ id: "e-2", name: "Zeno", status: "HONORARY" }),
      member({ id: "e-1", name: "Adam", status: "HONORARY" }),
    ]);
    expect(preview.charges.map((c) => c.memberName)).toEqual([
      "Anna",
      "Ärzte",
      "Berta Gleich",
      "Berta Gleich",
      "Österreich",
      "Otto",
      "Zoe",
    ]);
    expect(
      preview.charges.filter((c) => c.memberName === "Berta Gleich").map((c) => c.memberId),
    ).toEqual(["x-1", "x-2"]);
    expect(preview.exempt.map((e) => e.memberName)).toEqual(["Adam", "Zeno"]);
  });

  it("gleiche Eingabe in anderer Reihenfolge → genau dasselbe Ergebnis; Summe = Summe der Forderungen", () => {
    const tennisExtra = feeType({
      id: "ft-tennis",
      name: "Tennis-Zusatz",
      kind: "ADDITIONAL",
      departmentId: "d-tennis",
      rates: [rate("r-t1", 300), rate("r-t2", 450, "MONTHLY", day(2026, 12, 1))],
    });
    const feeTypes = [
      adultWith(
        rate("r-a1", 1000),
        rate("r-a2", 1200, "MONTHLY", day(2025, 1, 1)),
        rate("r-a3", 1500, "MONTHLY", day(2026, 11, 16)),
      ),
      YOUTH,
      PASSIVE,
      tennisExtra,
    ];
    const members = [
      member({
        id: "lukas",
        name: "Lukas",
        birthDate: day(2008, 11, 12),
        departments: [{ departmentId: "d-tennis", since: day(2026, 10, 20) }],
      }),
      member({
        id: "claudia",
        name: "Claudia",
        assignments: [
          assignment({ kind: "DISCOUNT_PERCENT", percentBp: 3333, validFrom: day(2026, 10, 10) }),
          assignment({ kind: "ASSIGN", feeTypeId: "ft-passive", validTo: day(2026, 11, 30) }),
        ],
      }),
      member({
        id: "laura",
        name: "Laura",
        status: "PASSIVE",
        statusHistory: history(["ACTIVE", day(2010, 1, 1)], ["PASSIVE", day(2026, 10, 17)]),
      }),
      member({ id: "neu", name: "Nina", joinedAt: day(2026, 10, 15), payerMemberId: "laura" }),
      member({ id: "otto", name: "Otto", birthDate: null, payerMemberId: "ghost" }),
      member({ id: "emil", name: "Emil", status: "HONORARY" }),
      member({
        id: "max",
        name: "Max",
        status: "LEFT",
        leftAt: day(2026, 11, 3),
        statusHistory: history(["ACTIVE", day(2010, 1, 1)]),
      }),
      member({ id: "ina", name: "Ina", inactive: true }),
    ];
    const forward = calculateFees(input(members, { feeTypes }));
    const reversed = calculateFees(
      input(
        [...members].reverse().map((m) => ({
          ...m,
          statusHistory: [...m.statusHistory].reverse(),
          departments: [...m.departments].reverse(),
          assignments: [...m.assignments].reverse(),
        })),
        {
          feeTypes: [...feeTypes].reverse().map((t) => ({
            ...t,
            rates: [...t.rates].reverse(),
            statuses: [...t.statuses].reverse(),
          })),
        },
      ),
    );
    expect(reversed).toEqual(forward);
    expect(calculateFees(input(members, { feeTypes }))).toEqual(forward);
    expect(forward.totalCents).toBe(forward.charges.reduce((acc, c) => acc + c.amountCents, 0));
    for (const charge of forward.charges) {
      expect(charge.lines.reduce((acc, l) => acc + l.amountCents, 0)).toBe(charge.amountCents);
      expect(charge.amountCents).toBeGreaterThan(0);
      for (const line of charge.lines) {
        const [n, d] = line.exact.split("/").map(Number);
        expect(Math.abs(line.amountCents - n! / d!)).toBeLessThan(1);
      }
    }
  });
});
