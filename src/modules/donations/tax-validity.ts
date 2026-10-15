import type { ExemptionKind } from "@/generated/prisma/enums";

/**
 * Gültigkeit des Bescheids für Zuwendungsbestätigungen (§ 63 Abs. 5 AO) – reine Funktionen, einzeln getestet
 * (`tests/unit/tax-validity.test.ts`). Freistellungsbescheid und Anlage zum Körperschaftsteuerbescheid gelten 5 Jahre, die
 * Feststellung nach § 60a AO 3 Jahre – taggenau: Der Jahrestag selbst gilt noch (14.03.2024 → bis einschließlich
 * 14.03.2029). Geprüft wird immer am Tag der Ausstellung, nie am Tag der Spende.
 */

/** Finanzamt-Angaben aus `FinanceSettings` (Kalendertage als UTC-Mitternacht). */
export interface TaxSettings {
  taxOffice: string | null;
  taxNumber: string | null;
  exemptionKind: ExemptionKind | null;
  exemptionDate: Date | null;
  exemptionLastYear: number | null;
  taxPurposes: string | null;
  taxPurposesStatute: string | null;
  membershipFeesDeductible: boolean;
}

export type TaxMissing =
  "Finanzamt" | "Steuernummer" | "Bescheid" | "Zwecke" | "Veranlagungszeitraum";

export type TaxValidity =
  | { state: "MISSING"; missing: TaxMissing[] }
  | {
      state: "VALID" | "EXPIRING" | "EXPIRED";
      kind: ExemptionKind;
      date: Date;
      /** Letzter Tag, an dem Bestätigungen noch ausgestellt werden dürfen. */
      validUntil: Date;
      /** Tage bis `validUntil` (0 = heute letzter Tag, negativ = abgelaufen). */
      daysLeft: number;
    };

/** Ab so vielen Tagen vor Ablauf warnt die App („läuft in 45 Tagen ab“). */
export const TAX_WARNING_DAYS = 90;

const DAY_MS = 86_400_000;

/** Kalendertag + Jahre; der 29.02. wird in einem Nicht-Schaltjahr zum 28.02. */
export function addYearsClamped(date: Date, years: number): Date {
  const year = date.getUTCFullYear() + years;
  const month = date.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
}

/** Gültigkeitsdauer in Jahren je Art des Bescheids. */
export const validityYears = (kind: ExemptionKind): number => (kind === "FINDING_60A" ? 3 : 5);

/** Welche Angaben fehlen, damit der Verein Bestätigungen (und den Beleg bis 300 €) ausstellen kann. */
export function missingTaxData(settings: TaxSettings | null, on: Date): TaxMissing[] {
  const missing: TaxMissing[] = [];
  const filled = (value: string | null | undefined) => (value ?? "").trim() !== "";
  if (!filled(settings?.taxOffice)) missing.push("Finanzamt");
  if (!filled(settings?.taxNumber)) missing.push("Steuernummer");
  // Ein Datum in der Zukunft ist ein Tippfehler – als fehlend behandeln.
  if (
    !settings?.exemptionKind ||
    !settings.exemptionDate ||
    settings.exemptionDate.getTime() > on.getTime()
  )
    missing.push("Bescheid");
  if (
    !filled(settings?.taxPurposes) ||
    (settings?.exemptionKind === "FINDING_60A" && !filled(settings.taxPurposesStatute))
  )
    missing.push("Zwecke");
  if (
    settings?.exemptionKind &&
    settings.exemptionKind !== "FINDING_60A" &&
    settings.exemptionLastYear == null
  )
    missing.push("Veranlagungszeitraum");
  return missing;
}

/** Stand des Bescheids am Tag `on` (Kalendertag, UTC-Mitternacht – in der App immer „heute“ in Berlin). */
export function taxValidity(settings: TaxSettings | null, on: Date): TaxValidity {
  const missing = missingTaxData(settings, on);
  if (missing.length > 0 || !settings?.exemptionKind || !settings.exemptionDate)
    return { state: "MISSING", missing };
  const kind = settings.exemptionKind;
  const date = settings.exemptionDate;
  const validUntil = addYearsClamped(date, validityYears(kind));
  const daysLeft = Math.round((validUntil.getTime() - on.getTime()) / DAY_MS);
  const state = daysLeft < 0 ? "EXPIRED" : daysLeft <= TAX_WARNING_DAYS ? "EXPIRING" : "VALID";
  return { state, kind, date, validUntil, daysLeft };
}

/** Bestätigungen dürfen am Tag `on` ausgestellt werden (Angaben vollständig, Bescheid nicht abgelaufen). */
export const canIssueReceipts = (validity: TaxValidity): boolean =>
  validity.state === "VALID" || validity.state === "EXPIRING";

/** Hinweise ohne Sperre (nur Text) – z. B. abziehbare Mitgliedsbeiträge bei einem Sportverein. */
export function taxWarnings(settings: TaxSettings | null): string[] {
  const warnings: string[] = [];
  if (settings?.membershipFeesDeductible && /sport/i.test(settings.taxPurposes ?? ""))
    warnings.push(
      "Bei Sportvereinen sind Mitgliedsbeiträge nicht abziehbar – im Zweifel Steuerberater fragen.",
    );
  return warnings;
}
