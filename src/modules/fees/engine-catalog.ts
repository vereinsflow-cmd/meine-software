import { collator, compareIds, dayNo, type DayNo } from "./engine-calendar";
import type { EngineFeeType, FeeIntervalValue, MemberStatusValue } from "./engine-types";

/**
 * Beitragsarten für den Beitrags-Rechenkern (`engine.ts`): nach Rang sortiert, mit Beitragssätzen nach Beginn und den
 * Regeln für Status und Alter.
 */

/** Ohne Geburtsdatum „als Erwachsener“: passt nur zu Beitragsarten ohne Höchstalter und mit Mindestalter bis 18. */
const ADULT_AGE = 18;
const DEFAULT_STATUSES: MemberStatusValue[] = ["ACTIVE", "PASSIVE", "BLOCKED"];

// ---------------------------------------------------------------------------
// Vorbereitung der Beitragsarten
// ---------------------------------------------------------------------------

interface PreparedRate {
  id: string;
  from: DayNo;
  amountCents: number;
  interval: FeeIntervalValue;
}

export interface PreparedType {
  id: string;
  name: string;
  type: EngineFeeType;
  statuses: ReadonlySet<MemberStatusValue>;
  /** Nach Beginn aufsteigend. */
  rates: PreparedRate[];
}

function prepareType(type: EngineFeeType): PreparedType {
  return {
    id: type.id,
    name: type.name,
    type,
    statuses: new Set(type.statuses.length > 0 ? type.statuses : DEFAULT_STATUSES),
    rates: type.rates
      .map((rate) => ({
        id: rate.id,
        from: dayNo(rate.validFrom),
        amountCents: rate.amountCents,
        interval: rate.interval,
      }))
      .sort((a, b) => a.from - b.from || compareIds(a.id, b.id)),
  };
}

/** Der jüngste Beitragssatz, der am Tag schon gilt. */
export function rateOn(type: PreparedType, day: DayNo): PreparedRate | null {
  for (let i = type.rates.length - 1; i >= 0; i--)
    if (type.rates[i]!.from <= day) return type.rates[i]!;
  return null;
}

/** Alter am Tag; `null` = kein Geburtsdatum (als Erwachsener gerechnet). */
export type Age = number | null;

export function fitsAge(type: EngineFeeType, age: Age): boolean {
  if (age === null)
    return type.maxAge === null && (type.minAge === null || type.minAge <= ADULT_AGE);
  return (
    (type.minAge === null || age >= type.minAge) && (type.maxAge === null || age <= type.maxAge)
  );
}

const hasAgeBounds = (type: EngineFeeType) => type.minAge !== null || type.maxAge !== null;

const byRank = (a: PreparedType, b: PreparedType) =>
  a.type.priority - b.type.priority || collator.compare(a.name, b.name) || compareIds(a.id, b.id);

export interface Catalog {
  byId: Map<string, PreparedType>;
  /** Grundbeiträge nach Rang (kleinste Priorität zuerst). */
  base: PreparedType[];
  /** Zusatzbeiträge der Abteilungen nach Rang. */
  additional: PreparedType[];
  /** Beitragsarten mit Altersgrenze (für den Hinweis „Altersgrenze im Zeitraum“). */
  ageBounded: PreparedType[];
  /** Aufnahmegebühren (einmalig beim Eintritt). */
  admission: PreparedType[];
}

export function prepareCatalog(feeTypes: EngineFeeType[]): Catalog {
  const all = feeTypes.map(prepareType);
  const active = all.filter((t) => !t.type.archived);
  const base = active.filter((t) => t.type.kind === "BASE").sort(byRank);
  const additional = active
    .filter((t) => t.type.kind === "ADDITIONAL" && t.type.departmentId !== null)
    .sort(byRank);
  return {
    byId: new Map(all.map((t) => [t.id, t])),
    base,
    additional,
    ageBounded: [...base, ...additional].filter((t) => hasAgeBounds(t.type)),
    admission: active.filter((t) => t.type.kind === "ADMISSION").sort(byRank),
  };
}
