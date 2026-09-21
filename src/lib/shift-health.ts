/**
 * Bewertung einer Helferschicht: Besetzung und Dringlichkeit.
 *
 * Reine Funktion – die Oberfläche zeigt damit überall (Übersicht, Dashboard, Ausdruck) dieselben Warnungen.
 * Bedeutung wird in der Oberfläche immer auch als Text ausgegeben, nicht nur über Farben.
 */
export type ShiftFill = "CANCELLED" | "EMPTY" | "PARTIAL" | "FULL";

/**
 * NONE     – kein Handlungsbedarf (voll besetzt, abgesagt oder noch weit entfernt)
 * SOON     – beginnt innerhalb von 7 Tagen und ist nicht voll besetzt
 * CRITICAL – beginnt innerhalb von 48 Stunden und ist nicht voll besetzt
 * OVERDUE  – ist bereits vorbei und war nicht voll besetzt
 */
export type ShiftUrgency = "NONE" | "SOON" | "CRITICAL" | "OVERDUE";

export interface ShiftHealth {
  fill: ShiftFill;
  urgency: ShiftUrgency;
  freeSpots: number;
  /** Anteil der besetzten Plätze (0–1) für Fortschrittsbalken. */
  ratio: number;
}

const HOUR = 3_600_000;

export function shiftHealth(
  shift: {
    status: "OPEN" | "CLOSED" | "CANCELLED";
    startsAt: Date;
    endsAt: Date;
    requiredCount: number;
    filled: number;
  },
  now: Date = new Date(),
): ShiftHealth {
  const filled = Math.max(0, shift.filled);
  const freeSpots = Math.max(0, shift.requiredCount - filled);
  const ratio = shift.requiredCount > 0 ? Math.min(1, filled / shift.requiredCount) : 1;

  if (shift.status === "CANCELLED")
    return { fill: "CANCELLED", urgency: "NONE", freeSpots: 0, ratio };

  const fill: ShiftFill = freeSpots === 0 ? "FULL" : filled === 0 ? "EMPTY" : "PARTIAL";
  if (fill === "FULL") return { fill, urgency: "NONE", freeSpots, ratio };

  const untilStart = shift.startsAt.getTime() - now.getTime();
  let urgency: ShiftUrgency = "NONE";
  if (shift.endsAt.getTime() < now.getTime()) urgency = "OVERDUE";
  else if (untilStart < 48 * HOUR) urgency = "CRITICAL";
  else if (untilStart < 7 * 24 * HOUR) urgency = "SOON";
  return { fill, urgency, freeSpots, ratio };
}

export const FILL_LABEL: Record<ShiftFill, string> = {
  CANCELLED: "Abgesagt",
  EMPTY: "Unbesetzt",
  PARTIAL: "Teilweise besetzt",
  FULL: "Voll besetzt",
};

export const URGENCY_LABEL: Record<ShiftUrgency, string> = {
  NONE: "",
  SOON: "Beginnt bald",
  CRITICAL: "Dringend",
  OVERDUE: "Nicht besetzt (vorbei)",
};

/** Überschneiden sich zwei Zeiträume? (Ende = Beginn zählt NICHT als Überschneidung.) */
export function overlaps(
  a: { startsAt: Date; endsAt: Date },
  b: { startsAt: Date; endsAt: Date },
): boolean {
  return a.startsAt.getTime() < b.endsAt.getTime() && a.endsAt.getTime() > b.startsAt.getTime();
}
