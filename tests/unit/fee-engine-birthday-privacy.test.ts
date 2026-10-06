import { describe, expect, it } from "vitest";
import { calculateFees } from "@/modules/fees/engine";
import type {
  EngineFeeRate,
  EngineFeeType,
  EngineMember,
  EnginePreview,
} from "@/modules/fees/engine-types";

// Auf den Beitragsseiten darf ein Geburtstag nur als „Geburtstag im <Monat>“ erscheinen – nie als Datum.

const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const rate = (id: string, amountCents: number, validFrom = day(2020, 1, 1)): EngineFeeRate => ({
  id,
  amountCents,
  interval: "MONTHLY",
  validFrom,
});
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
const YOUTH = feeType({
  id: "ft-youth",
  name: "Jugend",
  priority: 10,
  maxAge: 17,
  rates: [rate("r-y", 600)],
});

/** Lukas wird am 12.11.2026 18. */
const lukas: EngineMember = {
  id: "lukas",
  name: "Lukas Berger",
  birthDate: day(2008, 11, 12),
  joinedAt: day(2010, 1, 1),
  leftAt: null,
  status: "ACTIVE",
  inactive: false,
  statusHistory: [{ status: "ACTIVE", validFrom: day(2010, 1, 1), createdAt: day(2010, 1, 1) }],
  departments: [],
  assignments: [],
  payerMemberId: null,
  paymentMethod: "DIRECT_DEBIT",
};

function run(feeTypes: EngineFeeType[]): EnginePreview {
  return calculateFees({
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
    members: [lukas],
  });
}

function expectNoBirthday(preview: EnginePreview) {
  for (const w of preview.warnings) {
    expect(w.text).not.toMatch(/12\.11\.|11\.11\.|1[12]\.11\.2026/);
    // Kein Tagesdatum im November (dem Geburtsmonat).
    expect(w.text).not.toMatch(/\d{2}\.11\.\d{4}/);
  }
}

describe("Geburtstag in Beitragshinweisen", () => {
  it("keine Beitragsart ab dem Geburtstag: nur der Monat, kein Datum", () => {
    const p = run([YOUTH]);
    const texts = p.warnings.filter((w) => w.code === "NO_FEE_TYPE").map((w) => w.text);
    expect(texts).toEqual([
      "Für Lukas Berger passt keine Beitragsart (Status „aktiv“, 18 Jahre) – ab Geburtstag im November kein Grundbeitrag.",
    ]);
    expectNoBirthday(p);
  });

  it("keine Beitragsart bis zum Geburtstag: keine Tageszahl, aus der sich das Datum ergäbe", () => {
    const adultOnly = feeType({
      id: "ft-a",
      name: "Erwachsene",
      minAge: 18,
      rates: [rate("r-a", 1200)],
    });
    const p = run([adultOnly]);
    const texts = p.warnings.filter((w) => w.code === "NO_FEE_TYPE").map((w) => w.text);
    expect(texts).toEqual([
      "Für Lukas Berger passt keine Beitragsart (Status „aktiv“, 17 Jahre) – ab dem 01.10.2026 bis Geburtstag im November kein Grundbeitrag.",
    ]);
    expect(texts[0]).not.toMatch(/Tagen/);
    expectNoBirthday(p);
  });

  it("kein gültiger Beitragssatz ab dem Geburtstag: nur der Monat", () => {
    const adultLater = feeType({
      id: "ft-a",
      name: "Erwachsene",
      priority: 30,
      minAge: 18,
      rates: [rate("r-a", 1200, day(2027, 1, 1))],
    });
    const p = run([YOUTH, adultLater]);
    const texts = p.warnings.filter((w) => w.code === "NO_FEE_TYPE").map((w) => w.text);
    expect(texts).toEqual([
      "Für „Erwachsene“ ist ab Geburtstag im November kein Beitragssatz gültig – bei Lukas Berger nicht berechnet.",
    ]);
    expectNoBirthday(p);
  });
});
