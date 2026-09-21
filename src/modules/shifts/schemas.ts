import { z } from "zod";
import { parseBerlinDateTime, parseCalendarDate } from "@/lib/dates";

const text = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} ist zu lang (höchstens ${max} Zeichen).`)
    .optional()
    .transform((value) => (value ? value : undefined));

const timeField = z
  .string()
  .trim()
  .refine(
    (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
    "Bitte gib eine Uhrzeit ein (HH:MM).",
  );

export const shiftFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Bitte gib eine Bezeichnung ein.")
    .max(100, "Die Bezeichnung ist zu lang (höchstens 100 Zeichen)."),
  taskName: text(150, "Die Aufgabe"),
  description: text(1000, "Die Beschreibung"),
  date: z
    .string()
    .trim()
    .min(1, "Bitte gib das Datum ein.")
    .refine((value) => parseCalendarDate(value) !== null, "Bitte gib ein gültiges Datum ein."),
  startTime: timeField,
  endTime: timeField,
  meetingPoint: text(150, "Der Treffpunkt"),
  requiredCount: z
    .number({ error: "Bitte gib die Anzahl der benötigten Helfer ein." })
    .int("Bitte gib eine ganze Zahl ein.")
    .min(1, "Mindestens 1 Helfer.")
    .max(500, "Höchstens 500 Helfer."),
  minAge: z
    .number({ error: "Bitte gib eine Zahl ein." })
    .int("Bitte gib eine ganze Zahl ein.")
    .min(0)
    .max(120)
    .optional(),
  requirements: text(500, "Die Anforderung"),
  internalNotes: text(1000, "Der Hinweis"),
  responsibleMemberId: z
    .string()
    .max(64)
    .optional()
    .transform((value) => (value ? value : undefined)),
  status: z.enum(["OPEN", "CLOSED"]),
});
export type ShiftFormInput = z.input<typeof shiftFormSchema>;
export type ShiftInput = z.output<typeof shiftFormSchema>;

/**
 * Beginn und Ende als UTC-Zeitpunkte (Eingabe in Ortszeit Europe/Berlin). Liegt die Endzeit vor oder auf der
 * Startzeit, endet die Schicht am Folgetag (z. B. 22:00–02:00 Uhr).
 */
export function normalizeShiftTimes(
  input: Pick<ShiftInput, "date" | "startTime" | "endTime">,
): { startsAt: Date; endsAt: Date; endsNextDay: boolean } | null {
  const startsAt = parseBerlinDateTime(input.date, input.startTime);
  if (!startsAt) return null;
  const sameDay = parseBerlinDateTime(input.date, input.endTime);
  if (!sameDay) return null;
  if (sameDay.getTime() > startsAt.getTime())
    return { startsAt, endsAt: sameDay, endsNextDay: false };
  const next = new Date(`${input.date}T12:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const endsAt = parseBerlinDateTime(next.toISOString().slice(0, 10), input.endTime);
  return endsAt ? { startsAt, endsAt, endsNextDay: true } : null;
}

export const idSchema = z.object({ id: z.string().min(1).max(64) });
export const assignSchema = z.object({
  shiftId: z.string().min(1).max(64),
  memberId: z.string().min(1).max(64),
});
export const shiftRefSchema = z.object({ shiftId: z.string().min(1).max(64) });
export const hoursSchema = z.object({
  assignmentId: z.string().min(1).max(64),
  minutes: z
    .number({ error: "Bitte gib die Dauer ein." })
    .int()
    .min(0, "Die Dauer darf nicht negativ sein.")
    .max(1440, "Höchstens 24 Stunden."),
});
