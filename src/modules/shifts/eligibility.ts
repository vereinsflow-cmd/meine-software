import { ageOn, formatTimeRange, todayCalendarDate } from "@/lib/dates";
import { overlaps } from "@/lib/shift-health";

/**
 * Darf sich ein Mitglied für eine Schicht eintragen? Reine Funktion – liefert bei "Nein" eine verständliche
 * Begründung. Die Datenbank erzwingt Überbuchung und Doppelbelegung zusätzlich (Trigger), diese Prüfung liefert
 * die freundliche Erklärung VOR dem Versuch.
 *
 * Reihenfolge = Reihenfolge der angezeigten Gründe.
 */
export interface EligibilityInput {
  shift: {
    id: string;
    status: "OPEN" | "CLOSED" | "CANCELLED";
    startsAt: Date;
    endsAt: Date;
    requiredCount: number;
    minAge: number | null;
  };
  eventStatus: string;
  confirmedCount: number;
  alreadyConfirmed: boolean;
  birthDate: Date | null;
  /** Bestätigte Schichten des Mitglieds (nur laufende und kommende genügen). */
  ownShifts: { shiftId: string; title: string; eventTitle: string; startsAt: Date; endsAt: Date }[];
  /** Veranstalter dürfen auch in geschlossene und bereits begonnene Schichten eintragen. */
  asManager?: boolean;
  now?: Date;
}

export interface Eligibility {
  allowed: boolean;
  reason: string | null;
  /** Überschneidende eigene Schicht (zur Anzeige des Konflikts). */
  conflict?: { title: string; eventTitle: string; startsAt: Date; endsAt: Date };
}

const no = (reason: string, conflict?: Eligibility["conflict"]): Eligibility => ({
  allowed: false,
  reason,
  conflict,
});

export function checkEligibility(input: EligibilityInput): Eligibility {
  const { shift } = input;
  const now = input.now ?? new Date();
  // Veranstalter sehen die Gründe für ANDERE Personen (Zuweisungsliste) – daher dritte Person statt "du".
  const other = input.asManager === true;

  if (shift.status === "CANCELLED") return no("Die Schicht wurde abgesagt.");
  if (input.eventStatus !== "PUBLISHED")
    return no("Die Veranstaltung ist nicht (mehr) veröffentlicht.");
  if (input.alreadyConfirmed)
    return no(other ? "Bereits eingetragen." : "Du bist bereits eingetragen.");
  if (input.asManager) {
    if (shift.endsAt.getTime() < now.getTime()) return no("Die Schicht ist bereits vorbei.");
  } else {
    if (shift.status === "CLOSED") return no("Die Anmeldung für diese Schicht ist geschlossen.");
    if (shift.startsAt.getTime() <= now.getTime()) return no("Die Schicht hat bereits begonnen.");
  }
  if (input.confirmedCount >= shift.requiredCount) return no("Die Schicht ist voll besetzt.");

  if (shift.minAge !== null) {
    if (!input.birthDate) {
      return no(
        other
          ? `Mindestalter ${shift.minAge} Jahre – es ist kein Geburtsdatum hinterlegt.`
          : `Für diese Schicht gilt ein Mindestalter von ${shift.minAge} Jahren. Es ist kein Geburtsdatum hinterlegt – bitte wende dich an den Vorstand.`,
      );
    }
    // Maßgeblich ist das Alter am Tag der Schicht.
    const shiftDay = new Date(
      Date.UTC(
        shift.startsAt.getUTCFullYear(),
        shift.startsAt.getUTCMonth(),
        shift.startsAt.getUTCDate(),
      ),
    );
    const age = ageOn(
      input.birthDate,
      shiftDay > todayCalendarDate(now) ? shiftDay : todayCalendarDate(now),
    );
    if (age < shift.minAge)
      return no(
        other
          ? `Mindestalter ${shift.minAge} Jahre nicht erreicht.`
          : `Für diese Schicht musst du mindestens ${shift.minAge} Jahre alt sein.`,
      );
  }

  const clash = input.ownShifts.find((own) => own.shiftId !== shift.id && overlaps(own, shift));
  if (clash) {
    const when = `${clash.eventTitle}, ${formatTimeRange(clash.startsAt, clash.endsAt)}`;
    return no(
      other
        ? `Überschneidet sich mit der Schicht „${clash.title}“ (${when}).`
        : `Überschneidet sich mit deiner Schicht „${clash.title}“ (${when}).`,
      clash,
    );
  }
  return { allowed: true, reason: null };
}
