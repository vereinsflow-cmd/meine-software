import { collator, compareIds, dayDate, dayNo, type DayNo } from "./engine-calendar";
import { prepareCatalog } from "./engine-catalog";
import { calculateFamily } from "./engine-family";
import { finishMember } from "./engine-member-charge";
import { memberDays } from "./engine-member-days";
import type { MemberDays, RunContext, Warn } from "./engine-model";
import type { EngineFamily, EngineInput, EnginePreview, EngineWarning } from "./engine-types";

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
 *
 * Aufgeteilt nach Aufgaben (diese Datei ist der Einstieg und führt die Schritte zusammen):
 *  - `engine-calendar.ts`      Kalendertage, Texte und Wert eines Abschnitts
 *  - `engine-catalog.ts`       Beitragsarten nach Rang, Beitragssätze, Status- und Altersregeln
 *  - `engine-model.ts`         Zwischenstände (Beitragstage, Entwurfszeilen, Rahmen eines Laufs)
 *  - `engine-member-days.ts`   Schritt 1 und 2 je Mitglied
 *  - `engine-family.ts`        Familienbeitrag
 *  - `engine-member-charge.ts` Schritt 3 bis 7 je Mitglied
 */

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
  // Hinweise je Mitglied erst sammeln: Ist es am Ende ganz „schon berechnet“, betreffen sie keinen neuen Beitrag.
  const pending = new Map<string, EngineWarning[]>();
  const bufferFor =
    (memberId: string): Warn =>
    (code, text, familyId) => {
      const list = pending.get(memberId) ?? [];
      const warning: EngineWarning = { code, memberId, text };
      if (familyId) warning.familyId = familyId;
      list.push(warning);
      pending.set(memberId, list);
    };
  const flush = (memberId: string, keep: boolean) => {
    if (keep) preview.warnings.push(...(pending.get(memberId) ?? []));
    pending.delete(memberId);
  };
  for (const member of members) {
    const days = memberDays(member, ctx, bufferFor(member.id));
    if ("kind" in days) {
      preview.skipped.push({ memberId: member.id, memberName: member.name, reason: days.reason });
      flush(member.id, true);
    } else daysById.set(member.id, days);
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
    const result = finishMember(days, ctx, bufferFor(member.id));
    flush(member.id, !(result.kind === "skipped" && result.reason === "schon berechnet"));
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
