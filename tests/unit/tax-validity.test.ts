import { describe, expect, it } from "vitest";
import {
  addYearsClamped,
  canIssueReceipts,
  TAX_WARNING_DAYS,
  taxValidity,
  taxWarnings,
  type TaxSettings,
} from "@/modules/donations/tax-validity";

const day = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

const settings = (over: Partial<TaxSettings> = {}): TaxSettings => ({
  taxOffice: "Musterstadt",
  taxNumber: "12/345/67890",
  exemptionKind: "EXEMPTION_NOTICE",
  exemptionDate: day(2024, 3, 14),
  exemptionLastYear: 2022,
  taxPurposes: "des Sports",
  taxPurposesStatute: null,
  membershipFeesDeductible: false,
  ...over,
});

describe("Gültigkeit des Bescheids (§ 63 Abs. 5 AO, taggenau)", () => {
  it("Freistellungsbescheid vom 14.03.2024: gültig bis einschließlich 14.03.2029, nicht am 15.03.2029", () => {
    expect(taxValidity(settings(), day(2029, 3, 14))).toMatchObject({
      state: "EXPIRING",
      validUntil: day(2029, 3, 14),
      daysLeft: 0,
    });
    expect(taxValidity(settings(), day(2029, 3, 15))).toMatchObject({
      state: "EXPIRED",
      daysLeft: -1,
    });
    expect(canIssueReceipts(taxValidity(settings(), day(2029, 3, 14)))).toBe(true);
    expect(canIssueReceipts(taxValidity(settings(), day(2029, 3, 15)))).toBe(false);
    // Stand 07.10.2026 (Entwurf): gültig – das echte Datum ist der 14.03.2029, nicht der 31.12.2028.
    expect(taxValidity(settings(), day(2026, 10, 7))).toMatchObject({
      state: "VALID",
      validUntil: day(2029, 3, 14),
    });
  });

  it("29.02. + 5 Jahre → 28.02.; Anlage zum KSt-Bescheid ebenfalls 5 Jahre", () => {
    expect(addYearsClamped(day(2024, 2, 29), 5)).toEqual(day(2029, 2, 28));
    expect(addYearsClamped(day(2024, 2, 29), 4)).toEqual(day(2028, 2, 29));
    expect(
      taxValidity(
        settings({ exemptionKind: "KST_ANNEX", exemptionDate: day(2024, 2, 29) }),
        day(2026, 1, 1),
      ),
    ).toMatchObject({ validUntil: day(2029, 2, 28) });
  });

  it("Feststellung nach § 60a AO: 3 Jahre", () => {
    const sixtyA = settings({
      exemptionKind: "FINDING_60A",
      exemptionLastYear: null,
      taxPurposesStatute: "den Sport",
    });
    expect(taxValidity(sixtyA, day(2027, 3, 14))).toMatchObject({ validUntil: day(2027, 3, 14) });
    expect(taxValidity(sixtyA, day(2027, 3, 15)).state).toBe("EXPIRED");
    // § 60a braucht die Zwecke laut Satzung (Akkusativ, K5).
    expect(taxValidity({ ...sixtyA, taxPurposesStatute: null }, day(2025, 1, 1))).toEqual({
      state: "MISSING",
      missing: ["Zwecke"],
    });
  });

  it("Warnung genau ab 90 Tagen vor dem Ablauf", () => {
    expect(TAX_WARNING_DAYS).toBe(90);
    // 14.03.2029 − 90 Tage = 14.12.2028
    expect(taxValidity(settings(), day(2028, 12, 14))).toMatchObject({
      state: "EXPIRING",
      daysLeft: 90,
    });
    expect(taxValidity(settings(), day(2028, 12, 13))).toMatchObject({
      state: "VALID",
      daysLeft: 91,
    });
  });

  it("fehlende Angaben werden einzeln genannt; ein Datum in der Zukunft gilt als fehlend", () => {
    expect(taxValidity(null, day(2026, 10, 7))).toEqual({
      state: "MISSING",
      missing: ["Finanzamt", "Steuernummer", "Bescheid", "Zwecke"],
    });
    expect(
      taxValidity(settings({ taxOffice: " ", exemptionLastYear: null }), day(2026, 10, 7)),
    ).toEqual({ state: "MISSING", missing: ["Finanzamt", "Veranlagungszeitraum"] });
    expect(taxValidity(settings({ exemptionDate: day(2026, 10, 8) }), day(2026, 10, 7))).toEqual({
      state: "MISSING",
      missing: ["Bescheid"],
    });
  });

  it("Hinweis: Sportverein mit abziehbaren Mitgliedsbeiträgen", () => {
    expect(taxWarnings(settings())).toEqual([]);
    expect(taxWarnings(settings({ membershipFeesDeductible: true }))).toEqual([
      "Bei Sportvereinen sind Mitgliedsbeiträge nicht abziehbar – im Zweifel Steuerberater fragen.",
    ]);
    expect(
      taxWarnings(
        settings({ membershipFeesDeductible: true, taxPurposes: "der Kunst und Kultur" }),
      ),
    ).toEqual([]);
  });
});
