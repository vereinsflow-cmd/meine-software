import { formatEuroFromCents } from "@/lib/dates";
import {
  apportion,
  divInt,
  formatRational,
  fromInt,
  mulInt,
  neg,
  roundHalfAwayFromZero,
  sum,
} from "@/lib/finance/rational";
import {
  dayDate,
  dayMonth,
  dayNo,
  dayTexts,
  fullDate,
  paren,
  percentText,
  segmentValue,
  type DayNo,
} from "./engine-calendar";
import { rateOn } from "./engine-catalog";
import {
  increment,
  mostFrequent,
  runsOf,
  type BaseDay,
  type DraftLine,
  type FreeDay,
  type MemberDays,
  type MemberResult,
  type RunContext,
  type Warn,
} from "./engine-model";
import {
  BASE_FEE_GROUP,
  COVERAGE_ALWAYS,
  type ChargeLinePreview,
  type CoveragePreview,
  type EngineFamily,
} from "./engine-types";

/**
 * Schritt 3 bis 7 des Beitrags-Rechenkerns (`engine.ts`) für ein Mitglied: Abschnitte, Rundung, Zahler und Erklärung.
 */

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
export function finishMember(days: MemberDays, ctx: RunContext, warn: Warn): MemberResult {
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
      group: BASE_FEE_GROUP,
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
        group: null,
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
        group: type.id,
      });
    }
    // Zusammenhängende Abschnitte (nur Satzwechsel) für die Erklärung zusammenfassen.
    const spans = runsOf(list, ws, () => "x");
    const whole = spans.length === 1 && spans[0]!.from === ws && spans[0]!.to === we;
    extraSummaries.push(
      whole ? type.name : `${type.name} (${spans.map((s) => spanText(s.from, s.to)).join(", ")})`,
    );
  }
  // Aufnahmegebühr: einmal, im Zeitraum des Eintritts (ein Nachlauf für diesen Zeitraum holt sie nach) – nicht, wenn das
  // Mitglied am Eintrittstag beitragsfrei ist, und nur für Eintritte ab dem ersten Betrag der Gebühr.
  const admissionDay = days.admissionDay;
  if (
    joinDay !== null &&
    admissionDay !== null &&
    admissionDay >= periodStart &&
    admissionDay <= periodEnd
  ) {
    // Beitragsfrei am ersten Beitragstag (Befreiung, Ehrenmitglied, fester Betrag 0 €): keine Aufnahmegebühr.
    const firstDay = admissionDay >= ws && admissionDay <= we ? baseDays[admissionDay - ws] : null;
    const exemptOnJoin =
      firstDay?.kind === "exempt" ||
      member.assignments.some(
        (a) =>
          a.kind === "EXEMPT" &&
          dayNo(a.validFrom) <= joinDay &&
          (a.validTo === null || dayNo(a.validTo) >= joinDay),
      );
    for (const type of catalog.admission) {
      if (exemptOnJoin || days.coveredGroups.has(type.id)) continue;
      const first = type.rates[0];
      const rate = rateOn(type, joinDay);
      if (!first || joinDay < first.from || !rate || rate.interval !== "ONCE") continue;
      if (rate.amountCents <= 0) continue;
      drafts.push({
        feeTypeId: type.id,
        feeRateId: rate.id,
        assignmentId: null,
        from: joinDay,
        to: joinDay,
        exact: fromInt(rate.amountCents),
        text: `${type.name} (Eintritt am ${fullDate(joinDay)})`,
        group: type.id,
        always: true,
      });
      extraSummaries.push(`${type.name} ${formatEuroFromCents(rate.amountCents)}`);
    }
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

  const coverage: CoveragePreview[] = drafts.flatMap((line, i) =>
    line.group === null
      ? []
      : [
          {
            memberId: member.id,
            feeGroup: line.group,
            from: line.always ? COVERAGE_ALWAYS.from : dayDate(line.from),
            to: line.always ? COVERAGE_ALWAYS.to : dayDate(line.to),
            line: i,
          },
        ],
  );

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
      coverage,
      mainFeeTypeName: catalog.byId.get(mainTypeId)?.name ?? "",
    },
  };
}
