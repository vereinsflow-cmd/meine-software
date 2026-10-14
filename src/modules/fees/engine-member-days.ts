import { ageOn, formatEuroFromCents } from "@/lib/dates";
import { fromInt, rational, type Rational } from "@/lib/finance/rational";
import {
  compareIds,
  dayDate,
  dayNo,
  daysText,
  fullDate,
  isBirthday,
  maskedDaysText,
  monthName,
  paren,
  percentText,
  utcDay,
  type DayNo,
} from "./engine-calendar";
import { fitsAge, rateOn, type Age, type PreparedType } from "./engine-catalog";
import {
  increment,
  type BaseDay,
  type ExtraDay,
  type FreeDay,
  type MemberDays,
  type RunContext,
  type Warn,
} from "./engine-model";
import type { EngineMember, MemberStatusValue } from "./engine-types";
import { monthsOfInterval } from "./periods";

/**
 * Schritt 1 und 2 des Beitrags-Rechenkerns (`engine.ts`) für ein Mitglied: Beitragstage im Zeitraum und Grundbeitrag
 * je Tag, samt Hinweisen zum Prüfen.
 */

const STATUS_LABELS: Record<MemberStatusValue, string> = {
  ACTIVE: "aktiv",
  PASSIVE: "passiv",
  HONORARY: "Ehrenmitglied",
  BLOCKED: "gesperrt",
  LEFT: "ausgetreten",
};

/** Schritt 1 und 2 für ein Mitglied: Beitragstage und Grundbeitrag je Tag (oder warum es nicht berechnet wird). */
export function memberDays(
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
    last: DayNo;
    status: MemberStatusValue;
    age: Age;
    /** Ein fester Betrag war eingestellt, ging aber mangels Beitragsart nicht. */
    fixed: boolean;
  } | null = null;
  let missingAssigned: { count: number; first: DayNo } | null = null;
  let archivedAssigned: { name: string; count: number; first: DayNo } | null = null;
  const noRate = new Map<string, { count: number; first: DayNo; last: DayNo; name: string }>();
  let previousSignature: string | null = null;
  let previousLabel: string | null = null;
  let ageChange: { day: DayNo; age: number; before: string | null; after: string } | null = null;

  const noteNoRate = (type: PreparedType, day: DayNo) => {
    const entry = noRate.get(type.id);
    if (entry) {
      entry.count += 1;
      entry.last = day;
    } else noRate.set(type.id, { count: 1, first: day, last: day, name: type.name });
  };

  // Schon abgerechnete Tage (aus früheren Beitragsläufen) – je Gruppe: „BASE“ für Grund- und Familienbeitrag, sonst die
  // Beitragsart. So rechnet ein weiterer Lauf (Nachlauf) nur, was noch fehlt, und kein Tag kommt zweimal dran.
  const coverage = (member.coverage ?? []).map((c) => ({
    group: c.feeGroup,
    from: dayNo(c.from),
    to: dayNo(c.to),
    familyId: c.familyId ?? null,
  }));
  const coverOn = (group: string, day: DayNo) =>
    coverage.find((c) => c.group === group && c.from <= day && c.to >= day) ?? null;
  const coveredOn = (group: string, day: DayNo) => coverOn(group, day) !== null;
  /** „schon berechnet“ über einen Familienbeitrag: je Familie ein eigener Tag (die Familie erkennt ihre Tage daran). */
  const familyBilled = new Map<string, FreeDay>();
  const billedDay = (familyId: string | null): FreeDay => {
    if (familyId === null) return freeDay("none", "schon berechnet", "schon berechnet");
    let day = familyBilled.get(familyId);
    if (!day) {
      day = {
        kind: "none",
        reason: "schon berechnet",
        label: "schon berechnet",
        phase: "none:schon berechnet",
        billedFamilyId: familyId,
      };
      familyBilled.set(familyId, day);
    }
    return day;
  };

  for (let i = 0; i < length; i++) {
    const day = ws + i;
    // Vor dem Eintritt / nach dem Austritt (nach der Regel trotzdem Beitragstage) gilt der Stand von Ein- bzw. Austritt.
    const stateDay = Math.min(Math.max(day, joinDay ?? -Infinity), leftDay ?? Infinity);
    // Schon abgerechnete Tage geben keine Hinweise mehr (Status-Verlauf, Altersgrenze) – sie werden nicht neu gerechnet.
    const baseCover = coverage.length > 0 ? coverOn("BASE", day) : null;

    let status: MemberStatusValue | null = null;
    for (let h = history.length - 1; h >= 0; h--) {
      if (history[h]!.from <= stateDay) {
        status = history[h]!.status;
        break;
      }
    }
    if (status === null) {
      status = fallbackStatus;
      if (!baseCover) historyGap = true;
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
    if (baseCover) {
      base = billedDay(baseCover.familyId);
    } else if (other?.a.kind === "EXEMPT") {
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
            if (noType) {
              noType.count += 1;
              noType.last = day;
            } else
              noType = { count: 1, first: day, last: day, status, age, fixed: fixedRule !== null };
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
        if (coverage.length > 0 && coveredOn(type.id, day)) continue;
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

    // Altersgrenze im Zeitraum (z. B. 18. Geburtstag): welche Beitragsarten passen vom Alter her? Nicht an schon
    // abgerechneten Tagen (sonst hieße es „statt „schon berechnet““).
    if (baseCover) continue;
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
  // Grenzen auf dem Geburtstag nur mit Monat (siehe `maskedDaysText`) – nie das genaue Datum zusammen mit dem Alter.
  const birthdayBoundary = (day: DayNo) =>
    settings.ageRule === "EXACT_DAY" && isBirthday(birth, day);
  const gapText = (gap: { count: number; first: DayNo; last: DayNo }) =>
    maskedDaysText(gap.count, gap.first, gap.last, we, birthdayBoundary);
  if (noType) {
    const ageText = noType.age === null ? "ohne Geburtsdatum" : `${noType.age} Jahre`;
    warn(
      "NO_FEE_TYPE",
      noType.fixed
        ? `Für ${name} ist ein fester Betrag eingestellt, aber es passt keine Beitragsart – ${gapText(noType)} nicht berechnet. Bitte zusätzlich eine feste Beitragsart zuordnen.`
        : `Für ${name} passt keine Beitragsart (Status „${STATUS_LABELS[noType.status]}“, ${ageText}) – ${gapText(noType)} kein Grundbeitrag.`,
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
      `Für „${entry.name}“ ist ${gapText(entry)} kein Beitragssatz gültig – bei ${name} nicht berechnet.`,
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
    coveredGroups: new Set(coverage.map((c) => c.group)),
    admissionDay: joinDay === null ? null : Math.max(joinDay, start),
  };
}
