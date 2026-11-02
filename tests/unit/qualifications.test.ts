import { describe, expect, it } from "vitest";
import { parseCalendarDate } from "@/lib/dates";
import {
  QUALIFICATION_EXPIRY_WARNING_DAYS,
  qualificationName,
  qualificationValidity,
  qualificationValidityText,
} from "@/modules/members/qualification-schemas";

const day = (value: string) => parseCalendarDate(value)!;
const TODAY = day("2026-11-02");

describe("Gültigkeit einer Qualifikation", () => {
  it("„gültig bis“ ist der letzte gültige Tag – abgelaufen erst am Tag danach", () => {
    expect(qualificationValidity(day("2026-11-02"), TODAY)).toEqual({ state: "expiring", days: 0 });
    expect(qualificationValidity(day("2026-11-01"), TODAY)).toEqual({ state: "expired" });
    expect(qualificationValidity(day("2020-01-01"), TODAY)).toEqual({ state: "expired" });
  });

  it(`weist ${QUALIFICATION_EXPIRY_WARNING_DAYS} Tage vorher auf den Ablauf hin, davor nicht`, () => {
    expect(qualificationValidity(day("2027-01-31"), TODAY)).toEqual({
      state: "expiring",
      days: 90,
    });
    expect(qualificationValidity(day("2027-02-01"), TODAY)).toEqual({ state: "valid", days: 91 });
  });

  it("zählt Kalendertage auch über die Zeitumstellung hinweg ganz (keine halben Tage)", () => {
    expect(qualificationValidity(day("2027-03-29"), day("2027-03-27"))).toEqual({
      state: "expiring",
      days: 2,
    });
  });

  it("ohne Ablaufdatum ist sie unbefristet", () => {
    expect(qualificationValidity(null, TODAY)).toEqual({ state: "open" });
  });

  it("Hinweistext: abgelaufen, heute, morgen, in N Tagen – sonst keiner", () => {
    expect(qualificationValidityText({ state: "expired" })).toBe("abgelaufen");
    expect(qualificationValidityText({ state: "expiring", days: 0 })).toBe("läuft heute ab");
    expect(qualificationValidityText({ state: "expiring", days: 1 })).toBe("läuft morgen ab");
    expect(qualificationValidityText({ state: "expiring", days: 30 })).toBe("läuft in 30 Tagen ab");
    expect(qualificationValidityText({ state: "valid", days: 400 })).toBeNull();
    expect(qualificationValidityText({ state: "open" })).toBeNull();
  });
});

describe("Name einer Qualifikation", () => {
  it("Art, mit Bezeichnung dahinter; bei „Sonstige“ nur die Bezeichnung", () => {
    expect(qualificationName({ kind: "FIRST_AID" })).toBe("Erste Hilfe");
    expect(qualificationName({ kind: "TRAINER_LICENSE", title: "C-Lizenz" })).toBe(
      "Trainerlizenz – C-Lizenz",
    );
    expect(qualificationName({ kind: "OTHER", title: "Kampfrichter" })).toBe("Kampfrichter");
    expect(qualificationName({ kind: "OTHER", title: null })).toBe("Sonstige");
  });
});
