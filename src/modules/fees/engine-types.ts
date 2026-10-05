/**
 * Ein- und Ausgabe des Beitrags-Rechenkerns (`engine.ts`). Reine Daten ohne Datenbank: Der Dienst lädt alles und gibt es
 * hinein; der Rechenkern rechnet genau und erklärt jedes Ergebnis in Alltagssprache. Kalendertage sind `Date`-Werte um
 * UTC-Mitternacht (wie `@db.Date`), Beträge ganze Cent.
 */

export type MemberStatusValue = "ACTIVE" | "PASSIVE" | "LEFT" | "HONORARY" | "BLOCKED";
export type FeeTypeKindValue = "BASE" | "ADDITIONAL" | "ADMISSION" | "FAMILY";
export type FeeIntervalValue = "MONTHLY" | "QUARTERLY" | "HALF_YEARLY" | "YEARLY" | "ONCE";
export type PaymentMethodValue = "TRANSFER" | "DIRECT_DEBIT" | "CASH";
/** Eintritt: ab dem Tag, ab Monatsanfang, ab dem Folgemonat oder ganzer Zeitraum. */
export type ProRataEntryValue = "DAY" | "MONTH_START" | "NEXT_MONTH" | "NONE";
/** Austritt: bis zum Tag, bis Monatsende oder bis Ende des Zeitraums. */
export type ProRataExitValue = "DAY" | "MONTH_END" | "PERIOD_END";
/** Alter: genau am Tag, zu Beginn des Zeitraums oder nach Jahrgang (Kalenderjahr). */
export type AgeRuleValue = "EXACT_DAY" | "PERIOD_START" | "CALENDAR_YEAR";
export type AssignmentKindValue = "ASSIGN" | "EXEMPT" | "DISCOUNT_PERCENT" | "FIXED_AMOUNT";

export interface EngineFeeRate {
  id: string;
  validFrom: Date;
  amountCents: number;
  interval: FeeIntervalValue;
}

export interface EngineFeeType {
  id: string;
  name: string;
  kind: FeeTypeKindValue;
  /** Abteilung (bei BASE: nur deren Mitglieder; bei ADDITIONAL: Zusatzbeitrag der Abteilung). */
  departmentId: string | null;
  /** Leer = ACTIVE, PASSIVE und BLOCKED. */
  statuses: MemberStatusValue[];
  minAge: number | null;
  maxAge: number | null;
  /** Kleiner = zuerst geprüft (bei BASE eindeutig je Verein). */
  priority: number;
  archived: boolean;
  /** Beitragssätze, beliebige Reihenfolge; maßgeblich ist der jüngste mit `validFrom <= Tag`. */
  rates: EngineFeeRate[];
}

export interface EngineStatusChange {
  status: MemberStatusValue;
  validFrom: Date;
  /** Bei gleichem `validFrom` gilt der zuletzt erfasste. */
  createdAt: Date;
}

export interface EngineAssignment {
  id: string;
  kind: AssignmentKindValue;
  /** Nur bei ASSIGN: feste Beitragsart statt der Regeln. */
  feeTypeId: string | null;
  /** Nur bei DISCOUNT_PERCENT: Basispunkte (5000 = 50 %). */
  percentBp: number | null;
  /** Nur bei FIXED_AMOUNT: Betrag je Monat in Cent (ersetzt den Satz der Beitragsart). */
  amountCents: number | null;
  validFrom: Date;
  /** Einschließlich; `null` = offen. */
  validTo: Date | null;
  reason: string | null;
}

export interface EngineMember {
  id: string;
  name: string;
  birthDate: Date | null;
  joinedAt: Date | null;
  leftAt: Date | null;
  /** Aktueller Status (Ersatz, wo der Verlauf nicht hinreicht). */
  status: MemberStatusValue;
  /** Archiviert, gelöscht oder anonymisiert: nicht berechnen. */
  inactive: boolean;
  statusHistory: EngineStatusChange[];
  /** Abteilungen mit Beginn (`since` null = schon immer). */
  departments: { departmentId: string; since: Date | null }[];
  /** Höchstens eine ASSIGN und höchstens eine andere je Tag (sichert die Datenbank). */
  assignments: EngineAssignment[];
  /** Zahler (z. B. ein Elternteil), sonst das Mitglied selbst. */
  payerMemberId: string | null;
  paymentMethod: PaymentMethodValue;
}

export interface EngineSettings {
  proRataEntry: ProRataEntryValue;
  proRataExit: ProRataExitValue;
  ageRule: AgeRuleValue;
  missingBirthDateAsAdult: boolean;
  /** Unter diesem Betrag Hinweis bei Lastschrift. */
  minDebitCents: number;
}

export interface EngineInput {
  /** Zeitraum aus ganzen Monaten: erster Tag und letzter Tag (einschließlich). */
  periodStart: Date;
  periodEnd: Date;
  feeTypes: EngineFeeType[];
  settings: EngineSettings;
  members: EngineMember[];
  /** Namen der Zahler, die keine Mitglieder des Laufs sind (für die Anzeige); sonst aus `members`. */
  payerNames?: Record<string, string>;
}

export type WarningCode =
  | "NO_BIRTH_DATE"
  | "NO_BIRTH_DATE_SKIPPED"
  | "NO_FEE_TYPE"
  | "NO_JOIN_DATE"
  | "LEFT_WITHOUT_DATE"
  | "STATUS_HISTORY_INCOMPLETE"
  | "AGE_LIMIT_IN_PERIOD"
  | "BELOW_MIN_DEBIT"
  | "PAYER_NOT_MEMBER";

export interface EngineWarning {
  code: WarningCode;
  memberId: string;
  /** Ganzer Satz für die Anzeige („Otto Weber hat kein Geburtsdatum – als Erwachsener berechnet.“). */
  text: string;
}

export interface ChargeLinePreview {
  feeTypeId: string;
  feeRateId: string | null;
  /** Ermäßigung bzw. fester Betrag, auf dem die Zeile beruht. */
  assignmentId: string | null;
  fromDate: Date;
  toDate: Date;
  /** Negativ bei Ermäßigung. */
  amountCents: number;
  /** Zeilentext, z. B. „Jugend bis 17 Jahre, 01.10.–11.11.“ oder „50 % ermäßigt (Übungsleiterin)“. */
  text: string;
  /** Genauer Wert vor dem Runden als „Zähler/Nenner“ in Cent (Nachvollziehbarkeit). */
  exact: string;
}

export interface ChargePreview {
  memberId: string;
  memberName: string;
  payerMemberId: string;
  payerName: string;
  paymentMethod: PaymentMethodValue;
  /** Summe der Zeilen, > 0. */
  amountCents: number;
  lines: ChargeLinePreview[];
  /** Ein Satz, der den Betrag erklärt („Erwachsene, 50 % ermäßigt (Übungsleiterin) → 18,00 €“). */
  explanation: string;
  /** Beitragsart, nach der die Zeile in der Übersicht heißt (bei mehreren die des größten Anteils). */
  mainFeeTypeName: string;
}

export interface ExemptPreview {
  memberId: string;
  memberName: string;
  /** „Ehrenmitglied – beitragsfrei“, „beitragsfrei: Härtefall“, „Beitrag 0,00 €“. */
  reason: string;
}

export interface EnginePreview {
  charges: ChargePreview[];
  exempt: ExemptPreview[];
  /** Nicht berechnet: archiviert, ausgetreten vor dem Zeitraum, Eintritt danach. */
  skipped: { memberId: string; memberName: string; reason: string }[];
  warnings: EngineWarning[];
  totalCents: number;
}
