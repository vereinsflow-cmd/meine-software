import { formatCalendarDate } from "@/lib/dates";
import { EXEMPTION_KIND_LABEL } from "./format";
import { taxValidity, type TaxSettings, type TaxValidity } from "./tax-validity";

/**
 * „Beleg für den vereinfachten Zuwendungsnachweis“ (bis 300 €, § 50 Abs. 4 Satz 1 Nr. 2 Buchst. b EStDV) – rein, ohne
 * Speicherung. Bei Überweisungen bis 300 € genügt dem Spender sein Kontoauszug, aber nur zusammen mit einem vom Verein
 * hergestellten Beleg mit dem begünstigten Zweck, den Angaben zur Freistellung und der Angabe „Spende oder
 * Mitgliedsbeitrag“. Dafür gibt es kein amtliches Muster – der Text ist ein Vorschlag von VereinsFlow und als solcher
 * gekennzeichnet. Die Freistellungssätze folgen dem Wortlaut der amtlichen Muster (BMF 07.11.2013).
 */

export interface SimplifiedProofInput {
  club: { name: string; street: string | null; postalCode: string | null; city: string | null };
  settings: TaxSettings | null;
  /** Kalendertag (heute in Berlin). */
  today: Date;
}

export interface SimplifiedProof {
  /** Druckbar: Finanzamt-Angaben vollständig und der Bescheid gilt heute. */
  ready: boolean;
  /** Warum (noch) nicht – als Sätze. */
  blockers: string[];
  /** Hinweise ohne Sperre. */
  hints: string[];
  tax: TaxValidity;
  title: string;
  issuer: { name: string; addressLines: string[] };
  /** Die gedruckten Absätze in dieser Reihenfolge. */
  paragraphs: string[];
  /** Kennzeichnung als eigener Vorschlag (klein unter dem Beleg). */
  footnote: string;
}

export const SIMPLIFIED_PROOF_TITLE =
  "Beleg für den vereinfachten Zuwendungsnachweis (§ 50 Abs. 4 EStDV)";

export function simplifiedProof(input: SimplifiedProofInput): SimplifiedProof {
  const { club, settings, today } = input;
  const tax = taxValidity(settings, today);
  const blockers: string[] = [];
  const hints: string[] = [];
  if (tax.state === "MISSING")
    blockers.push("Trage zuerst die Finanzamt-Angaben ein (Finanzen → Einstellungen → Finanzamt).");
  if (tax.state === "EXPIRED")
    blockers.push(
      `Der ${EXEMPTION_KIND_LABEL[tax.kind]} vom ${formatCalendarDate(tax.date)} ist abgelaufen – der Beleg gilt erst wieder mit einem neuen Bescheid.`,
    );
  const addressLines = [
    club.street?.trim() ?? "",
    [club.postalCode?.trim(), club.city?.trim()].filter(Boolean).join(" "),
  ].filter((line) => line !== "");
  if (addressLines.length < 2)
    hints.push(
      "Trage die Anschrift des Vereins ein (Einstellungen → Verein) – sie gehört auf den Beleg.",
    );

  const paragraphs: string[] = [];
  if (settings && tax.state !== "MISSING") {
    const date = formatCalendarDate(tax.date);
    paragraphs.push(
      tax.kind === "FINDING_60A"
        ? `Die Einhaltung der satzungsmäßigen Voraussetzungen nach den §§ 51, 59, 60 und 61 AO wurde vom Finanzamt ${settings.taxOffice}, StNr. ${settings.taxNumber} mit Bescheid vom ${date} nach § 60a AO gesondert festgestellt. Wir fördern nach unserer Satzung ${settings.taxPurposesStatute}.`
        : `Wir sind wegen Förderung ${settings.taxPurposes} nach dem Freistellungsbescheid bzw. nach der Anlage zum Körperschaftsteuerbescheid des Finanzamtes ${settings.taxOffice} StNr. ${settings.taxNumber}, vom ${date} für den letzten Veranlagungszeitraum ${settings.exemptionLastYear} nach § 5 Abs. 1 Nr. 9 des Körperschaftsteuergesetzes von der Körperschaftsteuer und nach § 3 Nr. 6 des Gewerbesteuergesetzes von der Gewerbesteuer befreit.`,
      `Die Zuwendung wird nur zur Förderung ${settings.taxPurposes} verwendet.`,
      "Es handelt sich um eine Spende, nicht um einen Mitgliedsbeitrag.",
      "Dieser Beleg gilt nur zusammen mit dem Kontoauszug bzw. der Buchungsbestätigung der Bank und nur für Spenden bis 300 €. Daraus müssen Name und Konto von Spender und Verein, der Betrag und der Buchungstag hervorgehen. Beides bitte zusammen aufbewahren.",
    );
  }
  return {
    ready: blockers.length === 0,
    blockers,
    hints,
    tax,
    title: SIMPLIFIED_PROOF_TITLE,
    issuer: { name: club.name, addressLines },
    paragraphs,
    footnote: "Kein amtliches Muster – Textvorschlag von VereinsFlow.",
  };
}
