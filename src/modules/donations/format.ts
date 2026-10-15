import type {
  DonationKind,
  DonationPaymentMethod,
  DonationReceiptWish,
  DonorKind,
  ExemptionKind,
  InKindOrigin,
  WaiverBasis,
} from "@/generated/prisma/enums";
import { formatCalendarDate } from "@/lib/dates";
import type { DonationReceiptState } from "./receipt-status";

/**
 * Beschriftungen rund um Spenden – reine Funktionen und Konstanten (Browser und Server).
 */

export const DONATION_KIND_LABEL: Record<DonationKind, string> = {
  MONEY: "Geldspende",
  IN_KIND: "Sachspende",
  EXPENSE_WAIVER: "Aufwandsspende",
};

/** Umschaltleiste im Fenster „Spende erfassen“. */
export const DONATION_KIND_CHOICE: Record<DonationKind, string> = {
  MONEY: "Geld",
  IN_KIND: "Sachspende",
  EXPENSE_WAIVER: "Verzicht auf Auslagen",
};

export const DONOR_KIND_LABEL: Record<DonorKind, string> = {
  PERSON: "Privatperson",
  COMPANY: "Firma",
  ORGANIZATION: "Stiftung oder Verein",
};

export const PAYMENT_METHOD_LABEL: Record<DonationPaymentMethod, string> = {
  TRANSFER: "Überweisung",
  CASH: "bar übergeben",
  OTHER: "PayPal o. ä.",
};

export const RECEIPT_WISH_LABEL: Record<DonationReceiptWish, string> = {
  AUTO: "Wie üblich",
  WANTED: "Spender möchte eine",
  NOT_WANTED: "Spender braucht keine",
};

export const IN_KIND_ORIGIN_LABEL: Record<InKindOrigin, string> = {
  BUSINESS: "Betriebsvermögen",
  PRIVATE: "Privatvermögen",
  UNKNOWN: "Keine Angabe trotz Nachfrage",
};

export const WAIVER_BASIS_LABEL: Record<WaiverBasis, string> = {
  STATUTE: "Satzung bzw. Vereinsordnung",
  BOARD_DECISION: "Vorstandsbeschluss",
  CONTRACT: "Schriftlicher Vertrag",
};

export const EXEMPTION_KIND_LABEL: Record<ExemptionKind, string> = {
  EXEMPTION_NOTICE: "Freistellungsbescheid",
  KST_ANNEX: "Anlage zum Körperschaftsteuerbescheid",
  FINDING_60A: "Feststellung nach § 60a AO",
};

/** Beschriftung der Spalte „Zweck“, wenn die Spende für alles nutzbar ist. */
export const FREE_PURPOSE = "frei";
/** Beschriftung des grauen Balkens „Wofür gespendet wurde“ (immer zuletzt). */
export const FREE_PURPOSE_LABEL = "Frei verwendbar";

export type ReceiptBadgeTone = "warning" | "danger" | "success" | "neutral" | "muted";

export interface ReceiptBadge {
  label: string;
  tone: ReceiptBadgeTone;
  /** Erklärung für `title` bzw. Screenreader. */
  explanation: string;
  /** Betrag durchstreichen (storniert). */
  strike: boolean;
}

/** Anzeige des Bestätigungsstands einer Spende (Farbe wie im Entwurf: nötig amber, Adresse fehlt rot, erstellt grün). */
export function receiptBadge(state: DonationReceiptState, issuedOn?: Date | null): ReceiptBadge {
  switch (state) {
    case "NEEDED":
      return {
        label: "nötig",
        tone: "warning",
        explanation: "Der Verein stellt eine Zuwendungsbestätigung aus.",
        strike: false,
      };
    case "ADDRESS_MISSING":
      return {
        label: "Adresse fehlt",
        tone: "danger",
        explanation: "Ohne Anschrift des Spenders lässt sich keine Bestätigung ausstellen.",
        strike: false,
      };
    case "ISSUED":
      return {
        label: issuedOn ? `erstellt am ${formatCalendarDate(issuedOn).slice(0, 6)}` : "erstellt",
        tone: "success",
        explanation: "Für diese Spende gibt es eine Zuwendungsbestätigung.",
        strike: false,
      };
    case "SIMPLIFIED":
      return {
        label: "nicht nötig",
        tone: "neutral",
        explanation: "Überweisung bis 300 € – Kontoauszug und Beleg des Vereins genügen.",
        strike: false,
      };
    case "NOT_WANTED":
      return {
        label: "nicht nötig",
        tone: "neutral",
        explanation: "Der Spender braucht keine Bestätigung.",
        strike: false,
      };
    case "ANONYMOUS":
      return {
        label: "nicht möglich",
        tone: "neutral",
        explanation: "Ohne Namen (z. B. Spendendose) gibt es keine Bestätigung.",
        strike: false,
      };
    case "RESTRICTED":
      return {
        label: "gesperrt",
        tone: "neutral",
        explanation:
          "Der Spender ist gesperrt (z. B. früheres Mitglied) – eine Bestätigung nur auf seinen ausdrücklichen Wunsch.",
        strike: false,
      };
    case "NO_DONOR":
      return {
        label: "Spender fehlt",
        tone: "neutral",
        explanation: "Im Kassenbuch als Spende gebucht, aber noch niemandem zugeordnet.",
        strike: false,
      };
    case "VOID":
      return {
        label: "storniert",
        tone: "muted",
        explanation: "Die Spende ist storniert und zählt nicht mit.",
        strike: true,
      };
  }
}

/** Name eines Spenders: eigener Name (externe Spender, Momentaufnahme eines gesperrten Mitglieds), sonst das Mitglied. */
export function donorDisplayName(donor: {
  name: string | null;
  member: { firstName: string; lastName: string } | null;
}): string {
  if (donor.name?.trim()) return donor.name.trim();
  if (donor.member) return `${donor.member.firstName} ${donor.member.lastName}`.trim();
  return "";
}

/** Sortierschlüssel „Nachname bzw. Name“ (Mitglieder nach Nachname, Firmen nach ihrem Namen). */
export function donorSortKey(donor: {
  name: string | null;
  member: { firstName: string; lastName: string } | null;
}): string {
  if (!donor.name?.trim() && donor.member)
    return `${donor.member.lastName} ${donor.member.firstName}`.toLocaleLowerCase("de");
  return donorDisplayName(donor).toLocaleLowerCase("de");
}

/** Art des Spenders unter dem Namen („Mitglied“, „Firma“ …). */
export function donorTypeLabel(donor: {
  kind: DonorKind;
  restricted: boolean;
  member: { anonymizedAt: Date | null } | null;
}): string {
  if (donor.member) {
    if (donor.member.anonymizedAt) return "Früheres Mitglied (gesperrt)";
    return donor.restricted ? "Mitglied (gesperrt)" : "Mitglied";
  }
  return donor.restricted
    ? `${DONOR_KIND_LABEL[donor.kind]} (gesperrt)`
    : DONOR_KIND_LABEL[donor.kind];
}

/** Zweck einer Zeile: Text, sonst Abteilung, sonst Veranstaltung – `null` = frei verwendbar. */
export function purposeLabel(purpose: {
  purposeText: string | null;
  department: { name: string } | null;
  event: { title: string } | null;
}): string | null {
  return purpose.purposeText?.trim() || purpose.department?.name || purpose.event?.title || null;
}

/**
 * Gruppe für „Wofür gespendet wurde“: Abteilung (`d:<id>`), Veranstaltung (`e:<id>`), anderer fester Zweck
 * (`t:<text klein>`), sonst `frei`. Eine Abteilung mit zusätzlichem Text zählt zur Abteilung.
 */
export function purposeGroup(purpose: {
  departmentId: string | null;
  eventId: string | null;
  purposeText: string | null;
  department: { name: string } | null;
  event: { title: string } | null;
}): { key: string; label: string; bound: boolean } {
  if (purpose.departmentId)
    return {
      key: `d:${purpose.departmentId}`,
      label: purpose.department?.name ?? "Abteilung",
      bound: true,
    };
  if (purpose.eventId)
    return {
      key: `e:${purpose.eventId}`,
      label: purpose.event?.title ?? "Veranstaltung",
      bound: true,
    };
  const text = purpose.purposeText?.trim();
  if (text) return { key: `t:${text.toLocaleLowerCase("de")}`, label: text, bound: true };
  return { key: "frei", label: FREE_PURPOSE_LABEL, bound: false };
}

/** Namen als Satzteil: „A“, „A und B“, „A, B und C“, ab fünf „A, B, C und 2 weitere“. */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length >= 5) return `${names.slice(0, 3).join(", ")} und ${names.length - 3} weitere`;
  return `${names.slice(0, -1).join(", ")} und ${names.at(-1)}`;
}
