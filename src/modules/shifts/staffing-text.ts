import type { ShiftHealth } from "@/lib/shift-health";
import type { ShiftStatus } from "@/generated/prisma/enums";

/**
 * Besetzung einer Schicht in Worten für die Helferplanung: „3 von 4“ und dahinter das Wichtigste – „voll“, „dringend“,
 * „beginnt bald“, „läuft“, „vorbei“, „Anmeldung geschlossen“ oder die freien Plätze. Farbe nur, wo sie etwas bedeutet (grün voll,
 * rot dringend, bernstein bald oder noch niemand). Übersicht und Helferplan nutzen denselben Text.
 */
export type StaffingTone = "none" | "green" | "amber" | "red";

export function staffingText(shift: {
  filled: number;
  requiredCount: number;
  status: ShiftStatus;
  started: boolean;
  health: Pick<ShiftHealth, "fill" | "urgency" | "freeSpots">;
}): { count: string; note: string; tone: StaffingTone } {
  const count = `${shift.filled} von ${shift.requiredCount}`;
  const free = shift.health.freeSpots;
  if (shift.status === "CANCELLED") return { count, note: "abgesagt", tone: "none" };
  if (shift.health.fill === "FULL") return { count, note: "voll", tone: "green" };
  // Vorbei, ohne voll gewesen zu sein (nur im Helferplan einer Veranstaltung – die Übersicht zeigt Beendetes nicht).
  if (shift.health.urgency === "OVERDUE") return { count, note: "vorbei", tone: "none" };
  if (shift.started) return { count, note: "läuft", tone: "none" };
  if (shift.health.urgency === "CRITICAL") return { count, note: "dringend", tone: "red" };
  if (shift.health.urgency === "SOON") return { count, note: "beginnt bald", tone: "amber" };
  if (shift.status === "CLOSED") return { count, note: "Anmeldung geschlossen", tone: "none" };
  return { count, note: `${free} frei`, tone: shift.filled === 0 ? "amber" : "none" };
}

/** Textfarben zu den Tönen – kräftig genug für 4,5 : 1 auf Weiß und auf der dunklen Karte. */
export const STAFFING_TONE_CLASS: Record<StaffingTone, string> = {
  none: "",
  green: "text-emerald-700 dark:text-emerald-400",
  amber: "text-amber-700 dark:text-amber-400",
  red: "text-red-700 dark:text-red-400",
};

/**
 * Summen für den Kopf des Helferplans: „9 von 21 Plätzen besetzt“ über alle nicht abgesagten Schichten, dahinter die
 * freien Plätze der Schichten, die noch nicht vorbei sind („5 frei“, „5 noch frei“, sobald welche vorbei sind). Ist alles
 * vorbei oder voll, steht dort nichts – die Besetzung sagt es schon. Die Übersicht zählt dieselben freien Plätze.
 */
export function staffingTotals(
  shifts: readonly {
    status: ShiftStatus;
    requiredCount: number;
    filled: number;
    ended: boolean;
    health: Pick<ShiftHealth, "freeSpots">;
  }[],
): { filled: number; required: number; label: string; free: string | null } {
  const active = shifts.filter((shift) => shift.status !== "CANCELLED");
  const required = active.reduce((sum, shift) => sum + shift.requiredCount, 0);
  const filled = active.reduce(
    (sum, shift) => sum + Math.min(shift.filled, shift.requiredCount),
    0,
  );
  const upcoming = active.filter((shift) => !shift.ended);
  const free = upcoming.reduce((sum, shift) => sum + shift.health.freeSpots, 0);
  const anyEnded = upcoming.length < active.length;
  return {
    filled,
    required,
    label: `${filled} von ${required} ${required === 1 ? "Platz" : "Plätzen"} besetzt`,
    free:
      free > 0
        ? `${free} ${anyEnded ? "noch " : ""}frei`
        : upcoming.length > 0 && filled < required
          ? "kein Platz mehr frei"
          : null,
  };
}

/** „Malerarbeiten“, „Malerarbeiten und Verpflegung“, „A, B und C“. */
export function joinTitles(titles: readonly string[]): string {
  if (titles.length <= 1) return titles[0] ?? "";
  return `${titles.slice(0, -1).join(", ")} und ${titles.at(-1)}`;
}
