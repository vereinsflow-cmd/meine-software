import { formatEuroFromCents } from "@/lib/dates";
import {
  apportion,
  formatRational,
  rational,
  roundHalfAwayFromZero,
  sum,
  type Rational,
} from "@/lib/finance/rational";
import {
  collator,
  compareIds,
  dayDate,
  dayMonth,
  dayNo,
  dayTexts,
  isBirthday,
  listText,
  maskedDaysText,
  segmentValue,
  shortNameOf,
  type DayNo,
} from "./engine-calendar";
import { rateOn } from "./engine-catalog";
import {
  runsOf,
  type DraftLine,
  type FreeDay,
  type MemberDays,
  type RunContext,
  type Warn,
} from "./engine-model";
import {
  BASE_FEE_GROUP,
  type ChargePreview,
  type CoveragePreview,
  type EngineFamily,
  type ExemptPreview,
} from "./engine-types";
import { monthsOfInterval } from "./periods";

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
export function calculateFamily(
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
  /** Je Tag: wessen Grundbeitrag der Familienbeitrag abdeckt. */
  const coveredBy: string[][] = Array.from({ length }, () => []);
  const covered = new Set<string>();
  let daysWithMembers = 0;
  /** Zahlt an irgendeinem Tag überhaupt ein Familienmitglied einen Grundbeitrag? (Sonst ist die Familie hier leer.) */
  let anyPaying = false;
  let belowDays = 0;
  let notApplied = 0;
  let noRate: { count: number; first: DayNo; last: DayNo } | null = null;
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
    /** Den Familienbeitrag für diesen Tag hat schon ein früherer Lauf berechnet. */
    let familyBilled = false;
    /** Mitglieder, deren Grundbeitrag an diesem Tag schon einzeln berechnet ist. */
    let billedAlone = 0;
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
      if (base.kind === "none" && base.reason === "schon berechnet") {
        if (base.billedFamilyId === family.id) familyBilled = true;
        else billedAlone += 1;
        continue;
      }
      // Wer an dem Tag nichts zahlen würde (auch 100 % ermäßigt), zählt nicht mit.
      if (base.kind === "fee" && !(base.discount && base.discount.percentBp! >= 10_000))
        paying.push(days);
    }
    if (inRange === 0) continue;
    // Schon über den Familienbeitrag berechnet (Nachlauf): Wer jetzt dazukommt, zahlt an dem Tag ebenfalls über die
    // Familie – kein eigener Grundbeitrag und kein zweiter Familienbeitrag.
    if (familyBilled) {
      for (const days of paying) days.baseDays[day - days.ws] = freeDay;
      continue;
    }
    // Alle schon einzeln berechnet: nichts mehr zu tun (das ist kein „zu wenige Mitglieder“).
    if (paying.length === 0 && billedAlone > 0) continue;
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
      if (noRate) {
        noRate.count += 1;
        noRate.last = day;
      } else noRate = { count: 1, first: day, last: day };
      continue;
    }
    familyDays[i] = {
      rateId: rate.id,
      monthly: rational(rate.amountCents, monthsOfInterval(rate.interval)),
    };
    for (const days of paying) {
      days.baseDays[day - days.ws] = freeDay;
      covered.add(days.member.id);
      coveredBy[i]!.push(days.member.id);
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
  // Der Familienbeitrag kann am Geburtstag eines Familienmitglieds beginnen oder enden – dann nur den Monat zeigen.
  const familyMasked = ctx.maskedDays.get(`f:${family.id}`) ?? new Set<DayNo>();
  const familyBirthday = (day: DayNo) =>
    familyMasked.has(day) ||
    (settings.ageRule === "EXACT_DAY" &&
      family.members.some((m) =>
        isBirthday(daysById.get(m.memberId)?.member.birthDate ?? null, day),
      ));
  const familyGapText = (gap: { count: number; first: DayNo; last: DayNo }) =>
    maskedDaysText(gap.count, gap.first, gap.last, periodEnd, familyBirthday);
  if (noRate && type)
    warn(
      "FAMILY_NOT_APPLIED",
      `Für „${type.name}“ ist ${familyGapText(noRate)} kein Beitragssatz gültig – ${label} zahlt dort einzeln.`,
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
    group: BASE_FEE_GROUP,
  }));
  // Abdeckung: je Zeile und Mitglied die zusammenhängenden Tage, die der Familienbeitrag für es abdeckt.
  const coverage: CoveragePreview[] = [];
  runs.forEach((run, line) => {
    for (const memberId of covered) {
      let start: DayNo | null = null;
      for (let day = run.from; day <= run.to + 1; day++) {
        const isCovered = day <= run.to && coveredBy[day - periodStart]!.includes(memberId);
        if (isCovered && start === null) start = day;
        if (!isCovered && start !== null) {
          coverage.push({
            memberId,
            feeGroup: BASE_FEE_GROUP,
            from: dayDate(start),
            to: dayDate(day - 1),
            line,
          });
          start = null;
        }
      }
    }
  });
  coverage.sort(
    (a, b) =>
      a.line - b.line || compareIds(a.memberId, b.memberId) || a.from.getTime() - b.from.getTime(),
  );
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
      coverage,
      mainFeeTypeName: type!.name,
    },
  };
}
