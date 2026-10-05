import { ageOn, formatCalendarDate, formatEuroFromCents } from "@/lib/dates";
import {
  add,
  apportion,
  divInt,
  formatRational,
  fromInt,
  mulInt,
  neg,
  rational,
  roundHalfAwayFromZero,
  sum,
  ZERO,
  type Rational,
} from "@/lib/finance/rational";
import type {
  ChargeLinePreview,
  ChargePreview,
  CoveredPreview,
  EngineAssignment,
  EngineFamily,
  EngineFeeType,
  EngineInput,
  EngineMember,
  EnginePreview,
  EngineSettings,
  EngineWarning,
  ExemptPreview,
  FeeIntervalValue,
  MemberStatusValue,
  WarningCode,
} from "./engine-types";
import { monthsOfInterval } from "./periods";

/**
 * Rechenkern für Mitgliedsbeiträge: Aus Mitgliedern, Beitragsarten und Einstellungen wird für einen Zeitraum (Monat,
 * Quartal, Halbjahr, Jahr) berechnet, wer wie viel zahlt – Tag für Tag, genau als Bruch, und erst am Ende auf Cent
 * gerundet. Jedes Ergebnis bekommt einen Satz in Alltagssprache („Jugend bis 17 Jahre bis 11.11., danach Erwachsene →
 * 27,80 €“). Reine Funktion ohne Datenbank: Der Dienst lädt alles und gibt es hinein; gleiche Eingabe, gleiches Ergebnis.
 *
 * Ablauf je Mitglied:
 *  1. Beitragstage: Eintritt und Austritt nach den Regeln des Vereins (ab dem Tag, ab Monatsanfang …), auf den Zeitraum
 *     begrenzt. Archivierte Mitglieder und Mitglieder außerhalb des Zeitraums werden übersprungen.
 *  2. Für jeden Tag: Status (aus dem Status-Verlauf), Alter (nach der Altersregel), Abteilungen und Zuordnungen
 *     (beitragsfrei, feste Beitragsart, Ermäßigung, fester Betrag). Daraus folgt der Grundbeitrag des Tages – die erste
 *     passende Beitragsart nach Rang – und die Zusatzbeiträge der Abteilungen.
 *  3. Gleiche Tage hintereinander bilden einen Abschnitt (gleiche Beitragsart, gleicher Beitragssatz, gleiche
 *     Ermäßigung).
 *  4. Wert je Abschnitt: Monatsbeitrag für jeden vollen Monat, anteilig nach Tagen für angebrochene Monate. Eine
 *     Ermäßigung steht als eigene (negative) Zeile darunter.
 *  5. Die Summe wird kaufmännisch gerundet und centgenau auf die Zeilen verteilt.
 *
 * Für Tage vor dem Eintritt bzw. nach dem Austritt, die nach der Regel des Vereins trotzdem zählen (z. B. „ab
 * Monatsanfang“), gelten Status, Abteilungen und Zuordnungen vom Eintritts- bzw. Austrittstag – das Mitglied wird so
 * berechnet, wie es beim Eintritt bzw. zuletzt war.
 *
 * Austritt: Das Austrittsdatum ist der letzte Tag der Mitgliedschaft („Kündigung zum 31.12.“) und zählt deshalb noch
 * mit. Die Datenbank schreibt beim Austritt einen Eintrag „ausgetreten“ in den Status-Verlauf, meist ab dem
 * Austrittstag (Trigger „member_status_history“), manchmal auch ab dem Tag, an dem der Status umgestellt wurde. Dieser
 * Eintrag beschreibt nur den Austritt selbst; wann er wirkt, sagen Austrittsdatum und Austrittsregel. Bei Mitgliedern,
 * die gerade ausgetreten sind und ein Austrittsdatum haben, bleiben die „ausgetreten“-Einträge am Ende des Verlaufs
 * deshalb außer Betracht – sonst hinge der Betrag davon ab, wie der Verlauf gespeichert ist, und „bis Monatsende“ oder
 * „bis Ende des Zeitraums“ würden nie greifen. „Ausgetreten“ mitten im Verlauf (Austritt und späterer Wiedereintritt)
 * bleibt beitragsfrei.
 */

const DAY_MS = 86_400_000;
/** Ohne Geburtsdatum „als Erwachsener“: passt nur zu Beitragsarten ohne Höchstalter und mit Mindestalter bis 18. */
const ADULT_AGE = 18;
const DEFAULT_STATUSES: MemberStatusValue[] = ["ACTIVE", "PASSIVE", "BLOCKED"];
const STATUS_LABELS: Record<MemberStatusValue, string> = {
  ACTIVE: "aktiv",
  PASSIVE: "passiv",
  HONORARY: "Ehrenmitglied",
  BLOCKED: "gesperrt",
  LEFT: "ausgetreten",
};

const collator = new Intl.Collator("de");

// ---------------------------------------------------------------------------
// Kalendertage als fortlaufende Nummern (Tage seit 01.01.1970) – schnell zu zählen und zu vergleichen
// ---------------------------------------------------------------------------

type DayNo = number;

const dayNo = (date: Date): DayNo => Math.floor(date.getTime() / DAY_MS);
const dayDate = (day: DayNo): Date => new Date(day * DAY_MS);
const utcDay = (year: number, month: number, day: number): DayNo =>
  dayNo(new Date(Date.UTC(year, month, day)));

const pad2 = (n: number) => String(n).padStart(2, "0");
/** „15.11.“ */
function dayMonth(day: DayNo): string {
  const date = dayDate(day);
  return `${pad2(date.getUTCDate())}.${pad2(date.getUTCMonth() + 1)}.`;
}
/** „15.11.2026“ */
const fullDate = (day: DayNo) => formatCalendarDate(dayDate(day));
const MONTH_LONG = new Intl.DateTimeFormat("de-DE", { month: "long", timeZone: "UTC" });
/** „November“ – für Grenzen, die aus dem Geburtstag folgen (das genaue Datum verrät das Geburtsdatum). */
const monthName = (day: DayNo) => MONTH_LONG.format(dayDate(day));
const paren = (text: string | null) => (text ? ` (${text})` : "");
const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** Basispunkte als Prozent: 5000 → „50“, 2550 → „25,5“. */
function percentText(bp: number): string {
  const whole = Math.trunc(bp / 100);
  const rest = Math.abs(bp % 100);
  return rest === 0 ? `${whole}` : `${whole},${pad2(rest).replace(/0$/, "")}`;
}

/** „am 01.10.2026“ bzw. „an 12 Tagen ab dem 01.10.2026“. */
const daysText = (count: number, first: DayNo) =>
  count === 1 ? `am ${fullDate(first)}` : `an ${count} Tagen ab dem ${fullDate(first)}`;

/**
 * Genauer Wert eines Abschnitts: für jeden Monat, den er berührt, der Monatsbeitrag – ganz für volle Monate, sonst
 * anteilig nach Tagen (Monatsbeitrag × Tage im Abschnitt / Tage des Monats).
 */
function segmentValue(monthly: Rational, from: DayNo, to: DayNo): Rational {
  let total = ZERO;
  let cursor = from;
  while (cursor <= to) {
    const date = dayDate(cursor);
    const monthLast = utcDay(date.getUTCFullYear(), date.getUTCMonth() + 1, 0);
    const monthDays = dayDate(monthLast).getUTCDate();
    const last = Math.min(to, monthLast);
    const covered = last - cursor + 1;
    total = add(
      total,
      covered === monthDays ? monthly : divInt(mulInt(monthly, covered), monthDays),
    );
    cursor = last + 1;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Vorbereitung der Beitragsarten
// ---------------------------------------------------------------------------

interface PreparedRate {
  id: string;
  from: DayNo;
  amountCents: number;
  interval: FeeIntervalValue;
}

interface PreparedType {
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
function rateOn(type: PreparedType, day: DayNo): PreparedRate | null {
  for (let i = type.rates.length - 1; i >= 0; i--)
    if (type.rates[i]!.from <= day) return type.rates[i]!;
  return null;
}

/** Alter am Tag; `null` = kein Geburtsdatum (als Erwachsener gerechnet). */
type Age = number | null;

function fitsAge(type: EngineFeeType, age: Age): boolean {
  if (age === null)
    return type.maxAge === null && (type.minAge === null || type.minAge <= ADULT_AGE);
  return (
    (type.minAge === null || age >= type.minAge) && (type.maxAge === null || age <= type.maxAge)
  );
}

const hasAgeBounds = (type: EngineFeeType) => type.minAge !== null || type.maxAge !== null;

const byRank = (a: PreparedType, b: PreparedType) =>
  a.type.priority - b.type.priority || collator.compare(a.name, b.name) || compareIds(a.id, b.id);

interface Catalog {
  byId: Map<string, PreparedType>;
  /** Grundbeiträge nach Rang (kleinste Priorität zuerst). */
  base: PreparedType[];
  /** Zusatzbeiträge der Abteilungen nach Rang. */
  additional: PreparedType[];
  /** Beitragsarten mit Altersgrenze (für den Hinweis „Altersgrenze im Zeitraum“). */
  ageBounded: PreparedType[];
}

function prepareCatalog(feeTypes: EngineFeeType[]): Catalog {
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
  };
}

// ---------------------------------------------------------------------------
// Ein Mitglied
// ---------------------------------------------------------------------------

interface FeeDay {
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

interface FreeDay {
  /** „family“: Der Familienbeitrag deckt den Grundbeitrag des Tages ab. */
  kind: "exempt" | "none" | "family";
  /** Für „beitragsfrei“ bzw. „nicht berechnet“ (bei „family“ der Name der Familie). */
  reason: string;
  /** Nur bei „family“. */
  familyId?: string;
  /** Für den Erklärungssatz. */
  label: string;
  phase: string;
}

type BaseDay = FeeDay | FreeDay;

interface ExtraDay {
  rateId: string;
  monthly: Rational;
}

interface DraftLine {
  feeTypeId: string;
  feeRateId: string | null;
  assignmentId: string | null;
  from: DayNo;
  to: DayNo;
  exact: Rational;
  text: string;
}

type MemberResult =
  | { kind: "charge"; charge: ChargePreview }
  | { kind: "exempt"; exempt: ExemptPreview }
  | { kind: "covered"; covered: CoveredPreview }
  | { kind: "skipped"; reason: string };

/** Ergebnis von Schritt 1 und 2: die Beitragstage eines Mitglieds, bevor Familien und Abschnitte dazukommen. */
interface MemberDays {
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
}

interface Run<T> {
  from: DayNo;
  to: DayNo;
  value: T;
}

/** Fasst gleiche Tage hintereinander zusammen (`null` = Tag ohne Wert unterbricht). */
function runsOf<T>(values: (T | null)[], start: DayNo, key: (value: T) => string): Run<T>[] {
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
function mostFrequent(counts: Map<string, number>): string | null {
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

const increment = (counts: Map<string, number>, key: string) =>
  counts.set(key, (counts.get(key) ?? 0) + 1);

interface RunContext {
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

type Warn = (code: WarningCode, text: string, familyId?: string) => void;

/** Schritt 1 und 2 für ein Mitglied: Beitragstage und Grundbeitrag je Tag (oder warum es nicht berechnet wird). */
function memberDays(
  member: EngineMember,
  ctx: RunContext,
  warn: Warn,
): MemberDays | { kind: "skipped"; reason: string } {
  const { settings, catalog, periodStart, periodEnd } = ctx;
  const name = member.name;

  // Schritt 1: Beitragstage im Zeitraum.
  if (member.inactive) return { kind: "skipped", reason: "archiviert oder gelöscht" };
  if (member.status === "LEFT" && member.leftAt === null) {
    warn(
      "LEFT_WITHOUT_DATE",
      `${name} ist ausgetreten, hat aber kein Austrittsdatum – nicht berechnet. Bitte das Austrittsdatum eintragen.`,
    );
    return { kind: "skipped", reason: "ausgetreten, aber ohne Austrittsdatum" };
  }
  const joinDay = member.joinedAt === null ? null : dayNo(member.joinedAt);
  const leftDay = member.leftAt === null ? null : dayNo(member.leftAt);
  if (joinDay !== null && joinDay > periodEnd)
    return { kind: "skipped", reason: `Eintritt nach dem Zeitraum (${fullDate(joinDay)})` };
  if (leftDay !== null && leftDay < periodStart)
    return { kind: "skipped", reason: `ausgetreten vor dem Zeitraum (${fullDate(leftDay)})` };

  let start: DayNo;
  if (joinDay === null) {
    warn(
      "NO_JOIN_DATE",
      `${name} hat kein Eintrittsdatum – ab Beginn des Zeitraums (${fullDate(periodStart)}) berechnet.`,
    );
    start = periodStart;
  } else {
    const joined = dayDate(joinDay);
    const [y, m] = [joined.getUTCFullYear(), joined.getUTCMonth()];
    start = {
      DAY: joinDay,
      MONTH_START: utcDay(y, m, 1),
      NEXT_MONTH: utcDay(y, m + 1, 1),
      NONE: periodStart,
    }[settings.proRataEntry];
  }
  let end: DayNo = periodEnd;
  if (leftDay !== null) {
    const left = dayDate(leftDay);
    end = {
      DAY: leftDay,
      MONTH_END: utcDay(left.getUTCFullYear(), left.getUTCMonth() + 1, 0),
      PERIOD_END: periodEnd,
    }[settings.proRataExit];
  }
  const ws = Math.max(start, periodStart);
  const we = Math.min(end, periodEnd);
  if (ws > we) {
    if (start > periodEnd)
      return {
        kind: "skipped",
        reason: `Eintritt nach dem Zeitraum (Beitrag erst ab ${fullDate(start)})`,
      };
    return {
      kind: "skipped",
      reason: `kein Beitragstag im Zeitraum (Eintritt ${fullDate(joinDay!)}, Austritt ${fullDate(leftDay!)})`,
    };
  }

  const birth = member.birthDate;
  if (birth === null && ctx.ageMatters && !settings.missingBirthDateAsAdult) {
    warn(
      "NO_BIRTH_DATE_SKIPPED",
      `${name} hat kein Geburtsdatum – nicht berechnet. Bitte das Geburtsdatum eintragen.`,
    );
    return { kind: "skipped", reason: "kein Geburtsdatum" };
  }

  // Vorbereitung der Daten des Mitglieds.
  const fullHistory = member.statusHistory
    .map((row) => ({
      from: dayNo(row.validFrom),
      created: row.createdAt.getTime(),
      status: row.status,
    }))
    .sort((a, b) => a.from - b.from || a.created - b.created);
  // Der eigene Austritt (siehe oben): „ausgetreten“-Einträge am Ende des Verlaufs zählen nicht, das Ende ergibt sich
  // aus Austrittsdatum und Austrittsregel.
  let kept = fullHistory.length;
  if (member.status === "LEFT" && leftDay !== null)
    while (kept > 0 && fullHistory[kept - 1]!.status === "LEFT") kept--;
  const history = fullHistory.slice(0, kept);
  const lastActiveInHistory = [...history].reverse().find((row) => row.status !== "LEFT")?.status;
  /** Ersatz, wo der Verlauf nicht hinreicht; „ausgetreten“ ergibt dort keinen Sinn (es sind Mitgliedstage). */
  const fallbackStatus: MemberStatusValue =
    member.status !== "LEFT" ? member.status : (lastActiveInHistory ?? "ACTIVE");
  const departments = new Map<string, DayNo>();
  for (const dep of member.departments) {
    const since = dep.since === null ? -Infinity : dayNo(dep.since);
    departments.set(
      dep.departmentId,
      Math.min(since, departments.get(dep.departmentId) ?? Infinity),
    );
  }
  const assignments = member.assignments.map((a) => ({
    a,
    from: dayNo(a.validFrom),
    to: a.validTo === null ? Infinity : dayNo(a.validTo),
  }));
  const later = (x: (typeof assignments)[number], y: (typeof assignments)[number]) =>
    x.from > y.from || (x.from === y.from && compareIds(x.a.id, y.a.id) > 0);

  const inDepartment = (departmentId: string, day: DayNo) => {
    const since = departments.get(departmentId);
    return since !== undefined && since <= day;
  };
  const birthYear = birth?.getUTCFullYear() ?? 0;
  const periodStartAge = birth === null ? null : ageOn(birth, ctx.periodStartDate);
  const ageAt = (day: DayNo): Age => {
    if (birth === null) return null;
    switch (settings.ageRule) {
      case "EXACT_DAY":
        return ageOn(birth, dayDate(day));
      case "PERIOD_START":
        return periodStartAge;
      case "CALENDAR_YEAR":
        return dayDate(day).getUTCFullYear() - birthYear;
    }
  };
  const fitsExceptAge = (type: PreparedType, status: MemberStatusValue, day: DayNo) =>
    type.statuses.has(status) &&
    (type.type.departmentId === null || inDepartment(type.type.departmentId, day));
  const fitsRules = (type: PreparedType, status: MemberStatusValue, age: Age, day: DayNo) =>
    fitsExceptAge(type, status, day) && fitsAge(type.type, age);

  // Gleiche Zustände teilen sich ein Objekt (Abschnitte und Erklärung vergleichen Schlüssel).
  const freeDays = new Map<string, FreeDay>();
  const freeDay = (kind: FreeDay["kind"], reason: string, label: string): FreeDay => {
    const phase = `${kind}:${label}`;
    let day = freeDays.get(`${phase}:${reason}`);
    if (!day) {
      day = { kind, reason, label, phase };
      freeDays.set(`${phase}:${reason}`, day);
    }
    return day;
  };

  // Schritt 2: Tag für Tag.
  const length = we - ws + 1;
  const baseDays: BaseDay[] = new Array(length);
  const extraDays = new Map<string, (ExtraDay | null)[]>();
  const exemptCounts = new Map<string, number>();
  const noneCounts = new Map<string, number>();
  let historyGap = false;
  let matchedByRule = false;
  let noType: {
    count: number;
    first: DayNo;
    status: MemberStatusValue;
    age: Age;
    /** Ein fester Betrag war eingestellt, ging aber mangels Beitragsart nicht. */
    fixed: boolean;
  } | null = null;
  let missingAssigned: { count: number; first: DayNo } | null = null;
  let archivedAssigned: { name: string; count: number; first: DayNo } | null = null;
  const noRate = new Map<string, { count: number; first: DayNo; name: string }>();
  let previousSignature: string | null = null;
  let previousLabel: string | null = null;
  let ageChange: { day: DayNo; age: number; before: string | null; after: string } | null = null;

  const noteNoRate = (type: PreparedType, day: DayNo) => {
    const entry = noRate.get(type.id);
    if (entry) entry.count += 1;
    else noRate.set(type.id, { count: 1, first: day, name: type.name });
  };

  for (let i = 0; i < length; i++) {
    const day = ws + i;
    // Vor dem Eintritt / nach dem Austritt (nach der Regel trotzdem Beitragstage) gilt der Stand von Ein- bzw. Austritt.
    const stateDay = Math.min(Math.max(day, joinDay ?? -Infinity), leftDay ?? Infinity);

    let status: MemberStatusValue | null = null;
    for (let h = history.length - 1; h >= 0; h--) {
      if (history[h]!.from <= stateDay) {
        status = history[h]!.status;
        break;
      }
    }
    if (status === null) {
      status = fallbackStatus;
      historyGap = true;
    }

    if (status === "LEFT") {
      baseDays[i] = freeDay("none", "im Zeitraum ausgetreten", "ausgetreten");
      increment(noneCounts, "im Zeitraum ausgetreten");
      continue;
    }

    let assign: (typeof assignments)[number] | null = null;
    let other: (typeof assignments)[number] | null = null;
    for (const entry of assignments) {
      if (entry.from > stateDay || entry.to < stateDay) continue;
      if (entry.a.kind === "ASSIGN") {
        if (!assign || later(entry, assign)) assign = entry;
      } else if (!other || later(entry, other)) other = entry;
    }
    const age = ageAt(day);
    const fixedRule =
      other?.a.kind === "FIXED_AMOUNT" && other.a.amountCents !== null ? other.a : null;

    let base: BaseDay;
    if (other?.a.kind === "EXEMPT") {
      const why = other.a.reason;
      base = freeDay(
        "exempt",
        why ? `beitragsfrei: ${why}` : "beitragsfrei",
        `beitragsfrei${paren(why)}`,
      );
    } else {
      let type: PreparedType | null = null;
      let byRule = false;
      let noRateToday = false;
      if (assign) {
        type = (assign.a.feeTypeId && catalog.byId.get(assign.a.feeTypeId)) || null;
        // Archiviert heißt „wird nicht mehr berechnet“ – auch nicht über eine feste Zuordnung.
        if (type?.type.archived) {
          archivedAssigned ??= { name: type.type.name, count: 0, first: day };
          archivedAssigned.count += 1;
          type = null;
        } else if (!type) {
          if (missingAssigned) missingAssigned.count += 1;
          else missingAssigned = { count: 1, first: day };
        }
      } else {
        // Eine Beitragsart, deren erster Betrag erst später gilt, gilt bis dahin noch nicht – die nächste passende greift.
        type =
          catalog.base.find(
            (t) => fitsRules(t, status, age, stateDay) && rateOn(t, day) !== null,
          ) ?? null;
        byRule = true;
        if (!type) {
          const withoutRate = catalog.base.find((t) => fitsRules(t, status, age, stateDay));
          if (withoutRate && !fixedRule) {
            noteNoRate(withoutRate, day);
            noRateToday = true;
          } else if (status !== "HONORARY" || fixedRule) {
            if (noType) noType.count += 1;
            else noType = { count: 1, first: day, status, age, fixed: fixedRule !== null };
          }
          // Ein fester Betrag braucht eine Beitragsart (für Kategorie und Text) – ohne passende eine ohne Betrag nehmen.
          if (fixedRule && withoutRate) type = withoutRate;
        }
      }

      if (!type) {
        base = noRateToday
          ? freeDay("none", "kein gültiger Beitragssatz", "ohne Grundbeitrag")
          : !assign && status === "HONORARY"
            ? freeDay("exempt", "Ehrenmitglied – beitragsfrei", "Ehrenmitglied, beitragsfrei")
            : freeDay("none", "keine passende Beitragsart", "ohne Grundbeitrag");
      } else {
        const fixed =
          other?.a.kind === "FIXED_AMOUNT" && other.a.amountCents !== null ? other.a : null;
        const discount =
          other?.a.kind === "DISCOUNT_PERCENT" && other.a.percentBp !== null ? other.a : null;
        const rate = rateOn(type, day);
        let monthly: Rational | null = null;
        if (fixed) monthly = fromInt(fixed.amountCents!);
        else if (rate && rate.interval !== "ONCE")
          monthly = rational(rate.amountCents, monthsOfInterval(rate.interval));

        if (!fixed && !rate) {
          noteNoRate(type, day);
          base = freeDay("none", "kein gültiger Beitragssatz", "ohne Grundbeitrag");
        } else if (monthly === null) {
          base = freeDay("none", "nur ein einmaliger Beitragssatz", "ohne laufenden Beitrag");
        } else if (monthly.n === 0n) {
          base = fixed
            ? freeDay(
                "exempt",
                `fester Beitrag 0,00 €${paren(fixed.reason)}`,
                `fester Beitrag 0,00 €${paren(fixed.reason)}`,
              )
            : freeDay("exempt", `Beitrag 0,00 € (${type.name})`, `${type.name} (0,00 €)`);
          if (byRule) matchedByRule = true;
        } else {
          if (byRule) matchedByRule = true;
          // Ein fester Betrag hängt nicht am Satz der Beitragsart – ein neuer Satz dort teilt ihn nicht.
          const rateId = fixed ? null : (rate?.id ?? null);
          const modifiers =
            (fixed
              ? `, fester Betrag ${formatEuroFromCents(fixed.amountCents!)} im Monat${paren(fixed.reason)}`
              : "") +
            (discount
              ? `, ${percentText(discount.percentBp!)} % ermäßigt${paren(discount.reason)}`
              : "");
          const phase = `fee:${type.id}:${fixed?.id ?? ""}:${discount?.id ?? ""}`;
          base = {
            kind: "fee",
            type,
            rateId,
            monthly,
            fixed,
            discount,
            phase,
            segment: `${phase}:${rateId ?? ""}`,
            label: type.name + modifiers,
          };
        }
      }
    }
    baseDays[i] = base;
    if (base.kind === "exempt") increment(exemptCounts, base.reason);
    else if (base.kind === "none") increment(noneCounts, base.reason);

    // Zusatzbeiträge der Abteilungen – nicht an Tagen, an denen das Mitglied ausdrücklich beitragsfrei ist.
    if (other?.a.kind !== "EXEMPT") {
      for (const type of catalog.additional) {
        if (!fitsRules(type, status, age, stateDay)) continue;
        const rate = rateOn(type, day);
        if (!rate) {
          noteNoRate(type, day);
          continue;
        }
        if (rate.interval === "ONCE" || rate.amountCents === 0) continue;
        matchedByRule = true;
        let list = extraDays.get(type.id);
        if (!list) {
          list = new Array<ExtraDay | null>(length).fill(null);
          extraDays.set(type.id, list);
        }
        list[i] = {
          rateId: rate.id,
          monthly: rational(rate.amountCents, monthsOfInterval(rate.interval)),
        };
      }
    }

    // Altersgrenze im Zeitraum (z. B. 18. Geburtstag): welche Beitragsarten passen vom Alter her?
    const ageRelevant =
      assign === null && other?.a.kind !== "EXEMPT"
        ? catalog.ageBounded.filter((t) => fitsExceptAge(t, status, stateDay))
        : [];
    if (age !== null && ageRelevant.length > 0) {
      const signature = catalog.ageBounded
        .map((t) => (ageRelevant.includes(t) && fitsAge(t.type, age) ? "1" : "0"))
        .join("");
      if (previousSignature !== null && signature !== previousSignature && !ageChange)
        ageChange = { day, age, before: previousLabel, after: base.label };
      previousSignature = signature;
    }
    previousLabel = base.label;
  }

  // Hinweise aus dem Tageslauf. Ohne Eintrittsdatum beginnt der Verlauf zwangsläufig erst mit der Erfassung – das sagt
  // schon der Hinweis „kein Eintrittsdatum“.
  if (historyGap && !(joinDay === null && history.length > 0)) {
    const label = STATUS_LABELS[fallbackStatus];
    warn(
      "STATUS_HISTORY_INCOMPLETE",
      history.length > 0
        ? `Der Status-Verlauf von ${name} beginnt erst am ${fullDate(history[0]!.from)} – davor mit dem Status „${label}“ berechnet.`
        : fullHistory.length > 0
          ? `Für ${name} ist vor dem Austritt kein Status-Verlauf erfasst – mit dem Status „${label}“ berechnet.`
          : `Für ${name} ist kein Status-Verlauf erfasst – mit dem Status „${label}“ berechnet.`,
    );
  }
  if (birth === null && ctx.ageMatters && matchedByRule)
    warn("NO_BIRTH_DATE", `${name} hat kein Geburtsdatum – als Erwachsener berechnet.`);
  if (noType) {
    const ageText = noType.age === null ? "ohne Geburtsdatum" : `${noType.age} Jahre`;
    warn(
      "NO_FEE_TYPE",
      noType.fixed
        ? `Für ${name} ist ein fester Betrag eingestellt, aber es passt keine Beitragsart – ${daysText(noType.count, noType.first)} nicht berechnet. Bitte zusätzlich eine feste Beitragsart zuordnen.`
        : `Für ${name} passt keine Beitragsart (Status „${STATUS_LABELS[noType.status]}“, ${ageText}) – ${daysText(noType.count, noType.first)} kein Grundbeitrag.`,
    );
  }
  if (archivedAssigned)
    warn(
      "NO_FEE_TYPE",
      `Die fest zugeordnete Beitragsart „${archivedAssigned.name}“ von ${name} ist archiviert – ${daysText(archivedAssigned.count, archivedAssigned.first)} kein Grundbeitrag. Bitte die Zuordnung beenden oder eine andere wählen.`,
    );
  if (missingAssigned)
    warn(
      "NO_FEE_TYPE",
      `Die fest zugeordnete Beitragsart von ${name} gibt es nicht mehr – ${daysText(missingAssigned.count, missingAssigned.first)} kein Grundbeitrag.`,
    );
  for (const entry of noRate.values())
    warn(
      "NO_FEE_TYPE",
      `Für „${entry.name}“ ist ${daysText(entry.count, entry.first)} kein Beitragssatz gültig – bei ${name} nicht berechnet.`,
    );
  // Ohne Tag und Alter: Beides zusammen ergäbe das Geburtsdatum, das auf den Beitragsseiten nicht erscheinen soll.
  if (ageChange) {
    const changed =
      ageChange.before !== null && ageChange.before !== ageChange.after
        ? `ab ${monthName(ageChange.day)} gilt „${ageChange.after}“ statt „${ageChange.before}“.`
        : `im ${monthName(ageChange.day)} liegt eine Altersgrenze.`;
    warn("AGE_LIMIT_IN_PERIOD", `Bei ${name} wechselt im Zeitraum das Alter – ${changed}`);
  }
  return {
    member,
    ws,
    we,
    joinDay,
    leftDay,
    baseDays,
    extraDays,
    exemptCounts,
    noneCounts,
    // Nur beim Alter „genau ab dem Geburtstag“ fällt eine Grenze auf den Geburtstag (nach Jahrgang ist es der 01.01.).
    ageDay: ctx.settings.ageRule === "EXACT_DAY" ? (ageChange?.day ?? null) : null,
  };
}

/**
 * Tage als Text, wobei Grenzen, die auf einen Geburtstag fallen (`masked`), nur den Monat zeigen – das genaue Datum
 * verriete das Geburtsdatum. Gilt auch für Grenzen, die aus dem Geburtstag eines anderen Familienmitglieds folgen.
 */
function dayTexts(masked: ReadonlySet<DayNo>, periodStart: DayNo, periodEnd: DayNo) {
  const fromText = (day: DayNo) =>
    masked.has(day) ? `ab Geburtstag im ${monthName(day)}` : dayMonth(day);
  const toText = (day: DayNo) =>
    masked.has(day + 1) ? `bis Geburtstag im ${monthName(day + 1)}` : dayMonth(day);
  /** „01.10.–14.11.“, „bis Geburtstag im November“, „ab Geburtstag im November bis 31.12.“ */
  const spanText = (from: DayNo, to: DayNo) => {
    const start = fromText(from);
    const end = toText(to);
    if (!start.startsWith("ab ") && !end.startsWith("bis ")) return `${start}–${end}`;
    return `${start.startsWith("ab ") ? start : `ab ${start}`} ${end.startsWith("bis ") ? end : `bis ${end}`}`;
  };
  /** Wie `spanText` mit führendem Komma; leer für den ganzen Zeitraum. */
  const rangeText = (from: DayNo, to: DayNo) =>
    from === periodStart && to === periodEnd ? "" : `, ${spanText(from, to)}`;
  return { fromText, toText, spanText, rangeText };
}

/** Name in Aufzählungen: Vorname, sonst der ganze Name. */
const shortNameOf = (member: EngineMember) => member.shortName || member.name;

/** „Sophie“, „Sophie und Lena“, „Sophie, Lena und Mia“. */
function listText(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} und ${names[names.length - 1]}`;
}

/**
 * Zahler eines Familienmitglieds für die übrigen Beiträge: der Zahler der Familie, in der es am letzten Beitragstag im
 * Zeitraum ist. Wer die Familie vorher verlassen hat, zahlt danach selbst.
 */
function familyPayerOf(days: MemberDays, ctx: RunContext): EngineFamily | null {
  // Tage nach dem Austritt (nach der Regel noch Beitragstage) zählen mit dem Stand des Austrittstags.
  const last = Math.min(days.we, days.leftDay ?? Infinity);
  for (const range of ctx.familiesByMember.get(days.member.id) ?? [])
    if (range.from <= last && range.to >= last) return range.family;
  return null;
}

/** Schritt 3 bis 7 für ein Mitglied: Abschnitte, Rundung, Zahler und Erklärung. */
function finishMember(days: MemberDays, ctx: RunContext, warn: Warn): MemberResult {
  const { member, ws, we, joinDay, leftDay, baseDays, extraDays, exemptCounts, noneCounts } = days;
  const { settings, catalog, periodStart, periodEnd } = ctx;
  const name = member.name;
  // Grenzen auf einem Geburtstag (eigener oder eines Familienmitglieds) zeigen nur den Monat.
  const { toText, spanText, rangeText } = dayTexts(
    ctx.maskedDays.get(member.id) ?? new Set(),
    periodStart,
    periodEnd,
  );

  // Schritt 3 und 4: Abschnitte und ihr genauer Wert.
  const drafts: DraftLine[] = [];
  const feeDays = baseDays.map((day) => (day.kind === "fee" ? day : null));
  const baseSegments = runsOf(feeDays, ws, (day) => day.segment);
  for (const run of baseSegments) {
    const day = run.value;
    const exact = segmentValue(day.monthly, run.from, run.to);
    const range = rangeText(run.from, run.to);
    const fixedText = day.fixed
      ? `, fester Betrag ${formatEuroFromCents(day.fixed.amountCents!)} im Monat${paren(day.fixed.reason)}`
      : "";
    drafts.push({
      feeTypeId: day.type.id,
      feeRateId: day.rateId,
      assignmentId: day.fixed?.id ?? null,
      from: run.from,
      to: run.to,
      exact,
      text: `${day.type.name}${fixedText}${range}`,
    });
    if (day.discount) {
      const bp = day.discount.percentBp!;
      drafts.push({
        feeTypeId: day.type.id,
        feeRateId: day.rateId,
        assignmentId: day.discount.id,
        from: run.from,
        to: run.to,
        exact: neg(divInt(mulInt(exact, bp), 10_000)),
        text: `${percentText(bp)} % ermäßigt${paren(day.discount.reason)}${range}`,
      });
    }
  }
  const extraSummaries: string[] = [];
  for (const type of catalog.additional) {
    const list = extraDays.get(type.id);
    if (!list) continue;
    const runs = runsOf(list, ws, (day) => day.rateId);
    for (const run of runs) {
      drafts.push({
        feeTypeId: type.id,
        feeRateId: run.value.rateId,
        assignmentId: null,
        from: run.from,
        to: run.to,
        exact: segmentValue(run.value.monthly, run.from, run.to),
        text: `${type.name}${rangeText(run.from, run.to)}`,
      });
    }
    // Zusammenhängende Abschnitte (nur Satzwechsel) für die Erklärung zusammenfassen.
    const spans = runsOf(list, ws, () => "x");
    const whole = spans.length === 1 && spans[0]!.from === ws && spans[0]!.to === we;
    extraSummaries.push(
      whole ? type.name : `${type.name} (${spans.map((s) => spanText(s.from, s.to)).join(", ")})`,
    );
  }

  // Schritt 5: runden und centgenau verteilen.
  const total = roundHalfAwayFromZero(sum(drafts.map((line) => line.exact)));
  if (total <= 0) {
    // Den Grundbeitrag zahlt die Familie – das Mitglied hat keine eigene Zeile.
    const familyCounts = new Map<string, number>();
    for (const day of baseDays) if (day.kind === "family") increment(familyCounts, day.familyId!);
    const familyId = mostFrequent(familyCounts);
    if (familyId) {
      const family = baseDays.find(
        (day): day is FreeDay => day.kind === "family" && day.familyId === familyId,
      )!;
      return {
        kind: "covered",
        covered: { memberId: member.id, memberName: name, familyId, familyName: family.reason },
      };
    }
    const exemptReason = mostFrequent(exemptCounts);
    if (exemptReason)
      return {
        kind: "exempt",
        exempt: { memberId: member.id, memberName: name, reason: exemptReason },
      };
    if (drafts.length > 0) {
      const discount = baseSegments.find((run) => run.value.discount)?.value.discount;
      const reason = discount
        ? `${percentText(discount.percentBp!)} % ermäßigt${paren(discount.reason)} – Beitrag 0,00 €`
        : "Beitrag 0,00 €";
      return { kind: "exempt", exempt: { memberId: member.id, memberName: name, reason } };
    }
    return { kind: "skipped", reason: mostFrequent(noneCounts) ?? "kein Beitrag im Zeitraum" };
  }
  const cents = apportion(
    total,
    drafts.map((line) => line.exact),
  );
  const lines: ChargeLinePreview[] = drafts.map((line, i) => ({
    feeTypeId: line.feeTypeId,
    feeRateId: line.feeRateId,
    assignmentId: line.assignmentId,
    fromDate: dayDate(line.from),
    toDate: dayDate(line.to),
    amountCents: cents[i]!,
    text: line.text,
    exact: formatRational(line.exact),
  }));

  // Schritt 6: Zahler – ausdrücklich gewählt, sonst der Zahler der Familie, sonst das Mitglied selbst.
  let payerMemberId = member.payerMemberId ?? member.id;
  let payerName = member.name;
  let paymentMethod = member.paymentMethod;
  if (member.payerMemberId !== null) {
    const known =
      ctx.membersById.get(member.payerMemberId)?.name ?? ctx.payerNames[member.payerMemberId];
    if (known === undefined) {
      warn(
        "PAYER_NOT_MEMBER",
        `Der Zahler von ${name} ist nicht als Mitglied erfasst – bitte den Zahler prüfen.`,
      );
      payerName = "unbekannter Zahler";
    } else payerName = known;
  } else {
    const family = familyPayerOf(days, ctx);
    const payer = family ? ctx.membersById.get(family.payerMemberId) : undefined;
    // Ein archivierter oder gelöschter Zahler zahlt nicht – dafür gibt es beim Familienbeitrag einen Hinweis.
    if (payer && payer.id !== member.id && !payer.inactive) {
      payerMemberId = payer.id;
      payerName = payer.name;
      paymentMethod = payer.paymentMethod;
    }
  }

  if (paymentMethod === "DIRECT_DEBIT" && total < settings.minDebitCents)
    warn(
      "BELOW_MIN_DEBIT",
      `Der Beitrag von ${name} (${formatEuroFromCents(total)}) liegt unter dem Mindestbetrag für Lastschriften (${formatEuroFromCents(settings.minDebitCents)}).`,
    );

  // Schritt 7: Erklärung in einem Satz.
  const phases = runsOf<BaseDay>(baseDays, ws, (day) => day.phase).map((run) => {
    const rateChanges: DayNo[] = [];
    for (let day = run.from + 1; day <= run.to; day++) {
      const today = baseDays[day - ws]!;
      const yesterday = baseDays[day - ws - 1]!;
      if (today.kind === "fee" && yesterday.kind === "fee" && today.segment !== yesterday.segment)
        rateChanges.push(day);
    }
    return { ...run, rateChanges };
  });
  const joinNote =
    ws > periodStart && joinDay !== null
      ? ws === joinDay
        ? "Eintritt"
        : `Eintritt am ${dayMonth(joinDay)}`
      : null;
  const leftNote =
    we < periodEnd && leftDay !== null
      ? we === leftDay
        ? "Austritt"
        : `Austritt am ${dayMonth(leftDay)}`
      : null;
  const parts = phases.map((phase, i) => {
    const first = i === 0;
    const last = i === phases.length - 1;
    let text = first ? phase.value.label : `${last ? "danach" : "dann"} ${phase.value.label}`;
    if (phase.rateChanges.length > 0)
      text += ` (neuer Beitragssatz ab ${phase.rateChanges.map(dayMonth).join(" und ")})`;
    if (first && joinNote) text += ` ab ${dayMonth(ws)} (${joinNote})`;
    if (!last)
      text += ` ${toText(phase.to).startsWith("bis ") ? toText(phase.to) : `bis ${dayMonth(phase.to)}`}`;
    else if (leftNote) text += ` bis ${dayMonth(we)} (${leftNote})`;
    return text;
  });
  let sentence = parts.join(", ");
  if (extraSummaries.length > 0) sentence += `, dazu ${extraSummaries.join(" und ")}`;
  const explanation = `${sentence} → ${formatEuroFromCents(total)}`;

  // Beitragsart mit dem größten Anteil: Summe ihrer positiven Zeilen, also ohne Ermäßigung. Eine ermäßigte Erwachsene
  // mit Tennis-Zusatz bleibt „Erwachsene“ – die Ermäßigung macht den Grundbeitrag kleiner, aber nicht zur Nebensache.
  // Bei Gleichstand gewinnt die zuerst aufgeführte (der Grundbeitrag vor den Zusatzbeiträgen).
  const perType = new Map<string, number>();
  lines.forEach((line, i) => {
    if (drafts[i]!.exact.n > 0n)
      perType.set(line.feeTypeId, (perType.get(line.feeTypeId) ?? 0) + line.amountCents);
  });
  let mainTypeId = lines[0]!.feeTypeId;
  let mainSum = -Infinity;
  for (const [typeId, value] of perType) {
    if (value > mainSum) {
      mainTypeId = typeId;
      mainSum = value;
    }
  }

  return {
    kind: "charge",
    charge: {
      key: `m:${member.id}`,
      memberId: member.id,
      memberName: name,
      family: null,
      payerMemberId,
      payerName,
      paymentMethod,
      amountCents: total,
      lines,
      explanation,
      mainFeeTypeName: catalog.byId.get(mainTypeId)?.name ?? "",
    },
  };
}

// ---------------------------------------------------------------------------
// Familien
// ---------------------------------------------------------------------------

interface FamilyDay {
  rateId: string;
  monthly: Rational;
}

/**
 * Familienbeitrag einer Familie: An jedem Tag, an dem mindestens so viele Familienmitglieder einen Grundbeitrag zahlen
 * würden, wie die Beitragsart verlangt, zahlt die Familie stattdessen einmal den Familienbeitrag – die Grundbeiträge
 * dieser Mitglieder entfallen an dem Tag (ihre Tage werden zu „family“). Zusatzbeiträge der Abteilungen bleiben.
 */
function calculateFamily(
  family: EngineFamily,
  daysById: Map<string, MemberDays>,
  ctx: RunContext,
  warn: Warn,
): { kind: "charge"; charge: ChargePreview } | { kind: "exempt"; exempt: ExemptPreview } | null {
  const { periodStart, periodEnd, settings } = ctx;
  const label = `„${family.name}“`;
  const type = ctx.catalog.byId.get(family.feeTypeId) ?? null;
  const usable = type !== null && type.type.kind === "FAMILY" && !type.type.archived;
  const min = Math.max(2, type?.type.familyMinMembers ?? 2);
  const ranges = family.members.map((m) => ({
    memberId: m.memberId,
    from: dayNo(m.validFrom),
    to: m.validTo === null ? Infinity : dayNo(m.validTo),
  }));
  const length = periodEnd - periodStart + 1;
  const familyDays: (FamilyDay | null)[] = new Array<FamilyDay | null>(length).fill(null);
  const covered = new Set<string>();
  let daysWithMembers = 0;
  /** Zahlt an irgendeinem Tag überhaupt ein Familienmitglied einen Grundbeitrag? (Sonst ist die Familie hier leer.) */
  let anyPaying = false;
  let belowDays = 0;
  let notApplied = 0;
  let noRate: { count: number; first: DayNo } | null = null;
  const freeDay: FreeDay = {
    kind: "family",
    reason: family.name,
    familyId: family.id,
    label: `über den Familienbeitrag (${family.name})`,
    phase: `family:${family.id}`,
  };

  for (let i = 0; i < length; i++) {
    const day = periodStart + i;
    const paying: MemberDays[] = [];
    let inRange = 0;
    for (const range of ranges) {
      const days = daysById.get(range.memberId);
      // Tage vor dem Eintritt bzw. nach dem Austritt (nach der Regel noch Beitragstage) zählen mit dem Stand des Ein-
      // bzw. Austrittstags – auch für die Familie.
      const stateDay = days
        ? Math.min(Math.max(day, days.joinDay ?? -Infinity), days.leftDay ?? Infinity)
        : day;
      if (range.from > stateDay || range.to < stateDay) continue;
      inRange += 1;
      if (!days || day < days.ws || day > days.we) continue;
      const base = days.baseDays[day - days.ws]!;
      // Wer an dem Tag nichts zahlen würde (auch 100 % ermäßigt), zählt nicht mit.
      if (base.kind === "fee" && !(base.discount && base.discount.percentBp! >= 10_000))
        paying.push(days);
    }
    if (inRange === 0) continue;
    daysWithMembers += 1;
    if (paying.length > 0) anyPaying = true;
    if (paying.length < min) {
      belowDays += 1;
      continue;
    }
    if (!usable) {
      notApplied += 1;
      continue;
    }
    const rate = rateOn(type, day);
    if (!rate || rate.interval === "ONCE") {
      if (noRate) noRate.count += 1;
      else noRate = { count: 1, first: day };
      continue;
    }
    familyDays[i] = {
      rateId: rate.id,
      monthly: rational(rate.amountCents, monthsOfInterval(rate.interval)),
    };
    for (const days of paying) {
      days.baseDays[day - days.ws] = freeDay;
      covered.add(days.member.id);
    }
  }

  if (notApplied > 0)
    warn(
      "FAMILY_NOT_APPLIED",
      type === null || type.type.kind !== "FAMILY"
        ? `Für ${label} ist kein Familienbeitrag gewählt – die Mitglieder zahlen einzeln. Bitte einen Familienbeitrag wählen.`
        : `Der Familienbeitrag „${type.name}“ von ${label} ist archiviert – die Mitglieder zahlen einzeln. Bitte einen anderen wählen.`,
      family.id,
    );
  if (noRate && type)
    warn(
      "FAMILY_NOT_APPLIED",
      `Für „${type.name}“ ist ${daysText(noRate.count, noRate.first)} kein Beitragssatz gültig – ${label} zahlt dort einzeln.`,
      family.id,
    );
  if (covered.size === 0) {
    if (anyPaying && belowDays === daysWithMembers)
      warn(
        "FAMILY_TOO_SMALL",
        `In ${label} zahlen im Zeitraum weniger als ${min} Mitglieder einen Grundbeitrag – der Familienbeitrag gilt nicht, jedes zahlt einzeln.`,
        family.id,
      );
    return null;
  }

  // Zahler der Familie.
  const payer = ctx.membersById.get(family.payerMemberId);
  const payerName = payer?.name ?? ctx.payerNames[family.payerMemberId];
  if (payerName === undefined)
    warn(
      "PAYER_NOT_MEMBER",
      `Der Zahler von ${label} ist nicht als Mitglied erfasst – bitte den Zahler prüfen.`,
      family.id,
    );
  else if (payer?.inactive)
    warn(
      "PAYER_NOT_MEMBER",
      `Der Zahler von ${label} (${payer.name}) ist archiviert oder gelöscht – bitte einen neuen Zahler wählen.`,
      family.id,
    );

  // Abschnitte gleichen Satzes; Grenzen auf dem Geburtstag eines Familienmitglieds zeigen nur den Monat.
  const { spanText, rangeText } = dayTexts(
    ctx.maskedDays.get(`f:${family.id}`) ?? new Set(),
    periodStart,
    periodEnd,
  );
  const runs = runsOf(familyDays, periodStart, (day) => day.rateId);
  const drafts: DraftLine[] = runs.map((run) => ({
    feeTypeId: type!.id,
    feeRateId: run.value.rateId,
    assignmentId: null,
    from: run.from,
    to: run.to,
    exact: segmentValue(run.value.monthly, run.from, run.to),
    text: `${type!.name}${rangeText(run.from, run.to)}`,
  }));
  const total = roundHalfAwayFromZero(sum(drafts.map((line) => line.exact)));
  // Der Zahler zuerst („für Sophie, Lena und Mia“), dann nach Namen.
  const members = [...covered]
    .map((id) => daysById.get(id)!.member)
    .sort(
      (a, b) =>
        Number(b.id === family.payerMemberId) - Number(a.id === family.payerMemberId) ||
        collator.compare(a.name, b.name) ||
        compareIds(a.id, b.id),
    );
  if (total <= 0)
    return {
      kind: "exempt",
      exempt: {
        memberId: family.payerMemberId,
        memberName: family.name,
        familyId: family.id,
        reason: `Familienbeitrag 0,00 € (${type!.name})`,
      },
    };

  const cents = apportion(
    total,
    drafts.map((line) => line.exact),
  );
  const spans = runsOf(familyDays, periodStart, () => "x");
  const whole = spans.length === 1 && spans[0]!.from === periodStart && spans[0]!.to === periodEnd;
  const rateChanges = runs.slice(1).filter((run, i) => run.from === runs[i]!.to + 1);
  let explanation = `${type!.name} für ${listText(members.map(shortNameOf))}`;
  if (!whole) explanation += ` (${spans.map((span) => spanText(span.from, span.to)).join(", ")})`;
  if (rateChanges.length > 0)
    explanation += ` (neuer Beitragssatz ab ${rateChanges.map((run) => dayMonth(run.from)).join(" und ")})`;
  if (belowDays > 0) explanation += `, sonst zu wenige Mitglieder – dann zahlt jedes einzeln`;
  explanation += ` → ${formatEuroFromCents(total)}`;

  const paymentMethod = payer && !payer.inactive ? payer.paymentMethod : "TRANSFER";
  if (paymentMethod === "DIRECT_DEBIT" && total < settings.minDebitCents)
    warn(
      "BELOW_MIN_DEBIT",
      `Der Familienbeitrag von ${label} (${formatEuroFromCents(total)}) liegt unter dem Mindestbetrag für Lastschriften (${formatEuroFromCents(settings.minDebitCents)}).`,
      family.id,
    );

  return {
    kind: "charge",
    charge: {
      key: `f:${family.id}`,
      memberId: family.payerMemberId,
      memberName: family.name,
      family: {
        id: family.id,
        name: family.name,
        members: members.map((m) => ({ id: m.id, name: m.name })),
      },
      payerMemberId: family.payerMemberId,
      payerName: payerName ?? "unbekannter Zahler",
      paymentMethod,
      amountCents: total,
      lines: drafts.map((line, i) => ({
        feeTypeId: line.feeTypeId,
        feeRateId: line.feeRateId,
        assignmentId: null,
        fromDate: dayDate(line.from),
        toDate: dayDate(line.to),
        amountCents: cents[i]!,
        text: line.text,
        exact: formatRational(line.exact),
      })),
      explanation,
      mainFeeTypeName: type!.name,
    },
  };
}

const byMember = (
  a: { memberName: string; memberId: string },
  b: { memberName: string; memberId: string },
) => collator.compare(a.memberName, b.memberName) || compareIds(a.memberId, b.memberId);

/**
 * Berechnet die Beiträge aller Mitglieder für einen Zeitraum (Vorschau für den Beitragslauf). Ergebnis: wer zahlt was
 * (mit Zeilen und Erklärung), wer beitragsfrei ist, wer nicht berechnet wurde, und Hinweise zum Prüfen. Alles nach
 * Namen sortiert; gleiche Eingabe ergibt immer dasselbe Ergebnis.
 */
export function calculateFees(input: EngineInput): EnginePreview {
  const periodStart = dayNo(input.periodStart);
  const periodEnd = dayNo(input.periodEnd);
  if (periodEnd < periodStart) throw new RangeError("Der Zeitraum endet vor seinem Beginn.");
  const catalog = prepareCatalog(input.feeTypes);
  const families = [...(input.families ?? [])].sort(
    (a, b) => collator.compare(a.name, b.name) || compareIds(a.id, b.id),
  );
  const familiesByMember = new Map<string, { family: EngineFamily; from: DayNo; to: DayNo }[]>();
  for (const family of families)
    for (const m of family.members) {
      const list = familiesByMember.get(m.memberId) ?? [];
      list.push({
        family,
        from: dayNo(m.validFrom),
        to: m.validTo === null ? Infinity : dayNo(m.validTo),
      });
      familiesByMember.set(m.memberId, list);
    }
  const ctx: RunContext = {
    periodStart,
    periodEnd,
    periodStartDate: dayDate(periodStart),
    settings: input.settings,
    catalog,
    ageMatters: catalog.ageBounded.length > 0,
    membersById: new Map(input.members.map((m) => [m.id, m])),
    payerNames: input.payerNames ?? {},
    familiesByMember,
    maskedDays: new Map(),
  };

  const preview: EnginePreview = {
    charges: [],
    exempt: [],
    covered: [],
    skipped: [],
    warnings: [],
    totalCents: 0,
  };
  const members = [...input.members].sort((a, b) =>
    byMember({ memberName: a.name, memberId: a.id }, { memberName: b.name, memberId: b.id }),
  );
  const warnFor =
    (memberId: string): Warn =>
    (code, text, familyId) => {
      const warning: EngineWarning = { code, memberId, text };
      if (familyId) warning.familyId = familyId;
      preview.warnings.push(warning);
    };

  // Schritt 1 und 2 für alle, dann die Familien (sie brauchen die Tage aller ihrer Mitglieder), dann Schritt 3 bis 7.
  const daysById = new Map<string, MemberDays>();
  for (const member of members) {
    const days = memberDays(member, ctx, warnFor(member.id));
    if ("kind" in days)
      preview.skipped.push({ memberId: member.id, memberName: member.name, reason: days.reason });
    else daysById.set(member.id, days);
  }
  // Geburtstage, auf die eine Grenze fallen kann: der eigene und die aller Familienmitglieder (der Familienbeitrag kann am
  // Geburtstag eines Kindes beginnen – dann wechselt dort auch der Beitrag der übrigen).
  const ownAgeDay = (memberId: string) => daysById.get(memberId)?.ageDay ?? null;
  for (const days of daysById.values()) {
    const masked = new Set<DayNo>();
    if (days.ageDay !== null) masked.add(days.ageDay);
    ctx.maskedDays.set(days.member.id, masked);
  }
  for (const family of families) {
    const masked = new Set<DayNo>();
    for (const m of family.members) {
      const ageDay = ownAgeDay(m.memberId);
      if (ageDay !== null) masked.add(ageDay);
    }
    ctx.maskedDays.set(`f:${family.id}`, masked);
    for (const m of family.members)
      for (const day of masked) ctx.maskedDays.get(m.memberId)?.add(day);
  }
  for (const family of families) {
    const result = calculateFamily(family, daysById, ctx, warnFor(family.payerMemberId));
    if (result?.kind === "charge") {
      preview.charges.push(result.charge);
      preview.totalCents += result.charge.amountCents;
    } else if (result?.kind === "exempt") preview.exempt.push(result.exempt);
  }
  for (const member of members) {
    const days = daysById.get(member.id);
    if (!days) continue;
    const result = finishMember(days, ctx, warnFor(member.id));
    if (result.kind === "charge") {
      preview.charges.push(result.charge);
      preview.totalCents += result.charge.amountCents;
    } else if (result.kind === "exempt") preview.exempt.push(result.exempt);
    else if (result.kind === "covered") preview.covered.push(result.covered);
    else
      preview.skipped.push({ memberId: member.id, memberName: member.name, reason: result.reason });
  }
  preview.charges.sort(byMember);
  preview.exempt.sort(byMember);
  preview.covered.sort(byMember);
  preview.skipped.sort(byMember);
  return preview;
}
