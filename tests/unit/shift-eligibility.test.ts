import { describe, expect, it } from "vitest";
import { parseBerlinDateTime, parseCalendarDate } from "@/lib/dates";
import { checkEligibility, type EligibilityInput } from "@/modules/shifts/eligibility";
import { normalizeShiftTimes, shiftFormSchema } from "@/modules/shifts/schemas";

const H = 3_600_000;
const now = new Date("2026-09-01T10:00:00Z");
const shiftAt = (startH: number, durH = 3) => ({
  startsAt: new Date(now.getTime() + startH * H),
  endsAt: new Date(now.getTime() + (startH + durH) * H),
});

const base = (
  overrides: Partial<EligibilityInput> = {},
  shiftOverrides: Partial<EligibilityInput["shift"]> = {},
): EligibilityInput => ({
  shift: {
    id: "s1",
    status: "OPEN",
    requiredCount: 3,
    minAge: null,
    ...shiftAt(48),
    ...shiftOverrides,
  },
  eventStatus: "PUBLISHED",
  confirmedCount: 0,
  alreadyConfirmed: false,
  birthDate: parseCalendarDate("1990-01-01"),
  ownShifts: [],
  now,
  ...overrides,
});

describe("Berechtigung zur Anmeldung (checkEligibility)", () => {
  it("erlaubt eine freie, offene, kommende Schicht", () => {
    expect(checkEligibility(base())).toEqual({ allowed: true, reason: null });
  });

  it("lehnt abgesagte, geschlossene, begonnene und volle Schichten mit klarer Begründung ab", () => {
    expect(checkEligibility(base({}, { status: "CANCELLED" })).reason).toContain("abgesagt");
    expect(checkEligibility(base({}, { status: "CLOSED" })).reason).toContain("geschlossen");
    expect(checkEligibility(base({}, shiftAt(-1))).reason).toContain("begonnen");
    expect(checkEligibility(base({ confirmedCount: 3 })).reason).toContain("voll besetzt");
    expect(checkEligibility(base({ eventStatus: "CANCELLED" })).reason).toContain(
      "nicht (mehr) veröffentlicht",
    );
    expect(checkEligibility(base({ eventStatus: "DRAFT" })).allowed).toBe(false);
    expect(checkEligibility(base({ alreadyConfirmed: true })).reason).toContain(
      "bereits eingetragen",
    );
  });

  it("Veranstalter dürfen in geschlossene und begonnene (aber nicht beendete oder volle) Schichten eintragen", () => {
    expect(checkEligibility(base({ asManager: true }, { status: "CLOSED" })).allowed).toBe(true);
    expect(checkEligibility(base({ asManager: true }, shiftAt(-1))).allowed).toBe(true);
    expect(checkEligibility(base({ asManager: true }, shiftAt(-5, 3))).reason).toContain("vorbei");
    expect(checkEligibility(base({ asManager: true, confirmedCount: 3 })).allowed).toBe(false);
    expect(checkEligibility(base({ asManager: true }, { status: "CANCELLED" })).allowed).toBe(
      false,
    );
  });

  it("Veranstalter sehen die Gründe für andere Personen in der dritten Person (nicht 'du')", () => {
    const own = { shiftId: "other", title: "Aufbau", eventTitle: "Sommerfest", ...shiftAt(47, 3) };
    const reasons = [
      checkEligibility(base({ asManager: true, alreadyConfirmed: true })).reason,
      checkEligibility(base({ asManager: true, birthDate: null }, { minAge: 16 })).reason,
      checkEligibility(
        base({ asManager: true, birthDate: parseCalendarDate("2015-01-01")! }, { minAge: 16 }),
      ).reason,
      checkEligibility(base({ asManager: true, ownShifts: [own] })).reason,
    ];
    for (const reason of reasons) {
      expect(reason).toBeTruthy();
      expect(reason).not.toMatch(/\bdu\b|\bdeine[rn]?\b/i);
    }
    expect(reasons[3]).toContain("der Schicht „Aufbau“");
  });

  describe("Mindestalter", () => {
    it("verlangt ein Geburtsdatum und prüft das Alter am Tag der Schicht", () => {
      expect(checkEligibility(base({ birthDate: null }, { minAge: 16 })).reason).toContain(
        "kein Geburtsdatum",
      );
      // 16. Geburtstag liegt zwischen heute und der Schicht → am Schichttag alt genug.
      const turns16 = parseCalendarDate("2010-09-02")!;
      expect(
        checkEligibility(base({ birthDate: turns16 }, { minAge: 16, ...shiftAt(48) })).allowed,
      ).toBe(true);
      expect(
        checkEligibility(
          base({ birthDate: parseCalendarDate("2010-09-10")! }, { minAge: 16, ...shiftAt(48) }),
        ).reason,
      ).toContain("mindestens 16");
      expect(
        checkEligibility(base({ birthDate: parseCalendarDate("2000-01-01")! }, { minAge: 18 }))
          .allowed,
      ).toBe(true);
    });

    it("prüft nichts, wenn kein Mindestalter gilt – auch ohne Geburtsdatum", () => {
      expect(checkEligibility(base({ birthDate: null }, { minAge: null })).allowed).toBe(true);
    });
  });

  describe("Überschneidung", () => {
    const own = (startH: number, durH = 3) => ({
      shiftId: "other",
      title: "Aufbau",
      eventTitle: "Sommerfest",
      ...shiftAt(startH, durH),
    });

    it("lehnt überlappende eigene Schichten ab und nennt die andere Schicht", () => {
      const result = checkEligibility(base({ ownShifts: [own(47, 3)] }));
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("Aufbau");
      expect(result.reason).toContain("Sommerfest");
      expect(result.conflict?.title).toBe("Aufbau");
    });

    it("erlaubt direkt aufeinanderfolgende Schichten", () => {
      expect(checkEligibility(base({ ownShifts: [own(45, 3)] })).allowed).toBe(true); // endet genau bei Beginn
      expect(checkEligibility(base({ ownShifts: [own(51, 3)] })).allowed).toBe(true); // beginnt genau bei Ende
    });

    it("ignoriert die eigene Schicht selbst", () => {
      expect(
        checkEligibility(
          base({ ownShifts: [{ shiftId: "s1", title: "x", eventTitle: "y", ...shiftAt(48) }] }),
        ).allowed,
      ).toBe(true);
    });
  });
});

describe("Schichtzeiten", () => {
  const parse = (over: object = {}) =>
    shiftFormSchema.parse({
      title: "Aufbau",
      date: "2026-09-05",
      startTime: "09:00",
      endTime: "11:00",
      requiredCount: 5,
      status: "OPEN",
      ...over,
    });

  it("normalisiert Ortszeit in UTC", () => {
    const t = normalizeShiftTimes(parse())!;
    expect(t.startsAt.toISOString()).toBe("2026-09-05T07:00:00.000Z"); // Sommerzeit
    expect(t.endsAt.toISOString()).toBe("2026-09-05T09:00:00.000Z");
    expect(t.endsNextDay).toBe(false);
  });

  it("endet die Schicht nach Mitternacht (Endzeit vor Beginn), gilt der Folgetag", () => {
    const t = normalizeShiftTimes(parse({ startTime: "22:00", endTime: "02:00" }))!;
    expect(t.endsNextDay).toBe(true);
    expect(t.endsAt.getTime() - t.startsAt.getTime()).toBe(4 * H);
    expect(
      normalizeShiftTimes(parse({ startTime: "10:00", endTime: "10:00" }))!.endsAt.getTime() -
        parseBerlinDateTime("2026-09-05", "10:00")!.getTime(),
    ).toBe(24 * H);
  });

  it("validiert Eingaben", () => {
    const fails = (over: object) =>
      shiftFormSchema.safeParse({
        title: "Aufbau",
        date: "2026-09-05",
        startTime: "09:00",
        endTime: "11:00",
        requiredCount: 5,
        status: "OPEN",
        ...over,
      }).success === false;
    expect(fails({ title: "" })).toBe(true);
    expect(fails({ requiredCount: 0 })).toBe(true);
    expect(fails({ requiredCount: 501 })).toBe(true);
    expect(fails({ requiredCount: 1.5 })).toBe(true);
    expect(fails({ date: "31.02.2026" })).toBe(true);
    expect(fails({ startTime: "9:00" })).toBe(true);
    expect(fails({ minAge: -1 })).toBe(true);
    expect(fails({ status: "CANCELLED" })).toBe(true);
    expect(fails({})).toBe(false);
  });
});
