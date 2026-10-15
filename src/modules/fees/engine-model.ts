import type { Rational } from "@/lib/finance/rational";
import type { DayNo } from "./engine-calendar";
import type { Catalog, PreparedType } from "./engine-catalog";
import type {
  ChargePreview,
  CoveredPreview,
  EngineAssignment,
  EngineFamily,
  EngineMember,
  EngineSettings,
  ExemptPreview,
  WarningCode,
} from "./engine-types";

/**
 * Zwischenstände des Beitrags-Rechenkerns (`engine.ts`): Beitragstage eines Mitglieds, Entwurfszeilen, Abschnitte und der
 * gemeinsame Rahmen eines Laufs.
 */

// ---------------------------------------------------------------------------
// Ein Mitglied
// ---------------------------------------------------------------------------

export interface FeeDay {
  kind: "fee";
  type: PreparedType;
  rateId: string | null;
  /** Monatsbeitrag in Cent (genau). */
  monthly: Rational;
  fixed: EngineAssignment | null;
  discount: EngineAssignment | null;
  phase: string;
  segment: string;
  label: string;
}

export interface FreeDay {
  /** „family“: Der Familienbeitrag deckt den Grundbeitrag des Tages ab. */
  kind: "exempt" | "none" | "family";
  /** Für „beitragsfrei“ bzw. „nicht berechnet“ (bei „family“ der Name der Familie). */
  reason: string;
  /** Nur bei „family“. */
  familyId?: string;
  /** „schon berechnet“ über den Familienbeitrag dieser Familie (in einem früheren Lauf). */
  billedFamilyId?: string;
  /** Für den Erklärungssatz. */
  label: string;
  phase: string;
}

export type BaseDay = FeeDay | FreeDay;

export interface ExtraDay {
  rateId: string;
  monthly: Rational;
}

export interface DraftLine {
  feeTypeId: string;
  feeRateId: string | null;
  assignmentId: string | null;
  from: DayNo;
  to: DayNo;
  exact: Rational;
  text: string;
  /** Gruppe der Abdeckung (`null` bei Ermäßigungen: die decken die Tage ihres Grundbeitrags nicht noch einmal ab). */
  group: string | null;
  /** Aufnahmegebühr: deckt „immer“ ab (einmal je Mitglied). */
  always?: boolean;
}

export type MemberResult =
  | { kind: "charge"; charge: ChargePreview }
  | { kind: "exempt"; exempt: ExemptPreview }
  | { kind: "covered"; covered: CoveredPreview }
  | { kind: "skipped"; reason: string };

/** Ergebnis von Schritt 1 und 2: die Beitragstage eines Mitglieds, bevor Familien und Abschnitte dazukommen. */
export interface MemberDays {
  member: EngineMember;
  /** Erster und letzter Beitragstag im Zeitraum. */
  ws: DayNo;
  we: DayNo;
  joinDay: DayNo | null;
  leftDay: DayNo | null;
  /** Grundbeitrag je Tag ab `ws` (der Familienschritt ersetzt Tage durch „family“). */
  baseDays: BaseDay[];
  extraDays: Map<string, (ExtraDay | null)[]>;
  exemptCounts: Map<string, number>;
  noneCounts: Map<string, number>;
  /** Tag, an dem die Altersgrenze wechselt (nur „genau ab dem Geburtstag“) – dort steht im Text nur der Monat. */
  ageDay: DayNo | null;
  /** Gruppen, für die schon abgerechnet wurde (Aufnahmegebühr: einmal je Mitglied). */
  coveredGroups: ReadonlySet<string>;
  /** Erster Beitragstag nach der Eintrittsregel – in seinem Zeitraum kommt die Aufnahmegebühr (`null` ohne Eintritt). */
  admissionDay: DayNo | null;
}

export interface Run<T> {
  from: DayNo;
  to: DayNo;
  value: T;
}

/** Fasst gleiche Tage hintereinander zusammen (`null` = Tag ohne Wert unterbricht). */
export function runsOf<T>(values: (T | null)[], start: DayNo, key: (value: T) => string): Run<T>[] {
  const out: Run<T>[] = [];
  let current: Run<T> | null = null;
  let currentKey = "";
  values.forEach((value, i) => {
    const k = value === null ? null : key(value);
    if (current && k === currentKey) {
      current.to = start + i;
      return;
    }
    current = null;
    if (value !== null && k !== null) {
      current = { from: start + i, to: start + i, value };
      currentKey = k;
      out.push(current);
    }
  });
  return out;
}

/** Der häufigste Grund (bei Gleichstand der zuerst aufgetretene). */
export function mostFrequent(counts: Map<string, number>): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const [reason, count] of counts) {
    if (count > bestCount) {
      best = reason;
      bestCount = count;
    }
  }
  return best;
}

export const increment = (counts: Map<string, number>, key: string) =>
  counts.set(key, (counts.get(key) ?? 0) + 1);

export interface RunContext {
  periodStart: DayNo;
  periodEnd: DayNo;
  periodStartDate: Date;
  settings: EngineSettings;
  catalog: Catalog;
  /** Gibt es überhaupt Beitragsarten mit Altersgrenze? Sonst spielt das Geburtsdatum keine Rolle. */
  ageMatters: boolean;
  membersById: Map<string, EngineMember>;
  payerNames: Record<string, string>;
  /** Familien nach Mitglied (für den Zahler der übrigen Beiträge). */
  familiesByMember: Map<string, { family: EngineFamily; from: DayNo; to: DayNo }[]>;
  /** Je Mitglied bzw. Familie die Tage, die nur als Monat erscheinen (Geburtstage, siehe `dayTexts`). */
  maskedDays: Map<string, Set<DayNo>>;
}

export type Warn = (code: WarningCode, text: string, familyId?: string) => void;
