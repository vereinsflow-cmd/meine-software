import { z } from "zod";
import { EventType, EventVisibility } from "@/generated/prisma/enums";
import { parseBerlinDateTime, parseCalendarDate } from "@/lib/dates";
import { MAX_SERIES_OCCURRENCES } from "@/lib/recurrence";

/**
 * Eingabe-Schemas für Veranstaltungen. Datum und Uhrzeit werden als Ortszeit (Europe/Berlin) eingegeben und erst
 * in `normalizeEventInput` in UTC-Zeitpunkte umgewandelt.
 */
const text = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} ist zu lang (höchstens ${max} Zeichen).`)
    .optional()
    .transform((value) => (value ? value : undefined));

const dateField = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Bitte gib ${label} ein.`)
    .refine(
      (value) => parseCalendarDate(value) !== null,
      `${label[0]?.toUpperCase()}${label.slice(1)}: ungültiges Datum.`,
    );

const timeField = z
  .string()
  .trim()
  .refine(
    (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
    "Bitte gib eine Uhrzeit ein (HH:MM).",
  );

const optionalDate = z
  .string()
  .trim()
  .optional()
  .refine((value) => !value || parseCalendarDate(value) !== null, "Ungültiges Datum.");

export const EVENT_TYPE_VALUES = Object.values(EventType) as [EventType, ...EventType[]];
export const EVENT_VISIBILITY_VALUES = Object.values(EventVisibility) as [
  EventVisibility,
  ...EventVisibility[],
];
export const REPEAT_VALUES = ["none", "weekly", "biweekly", "monthly"] as const;

export const eventFormSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, "Bitte gib einen Titel ein.")
      .max(150, "Der Titel ist zu lang (höchstens 150 Zeichen)."),
    description: text(5000, "Die Beschreibung"),
    type: z.enum(EVENT_TYPE_VALUES, "Bitte wähle die Art der Veranstaltung."),
    visibility: z.enum(EVENT_VISIBILITY_VALUES),
    startDate: dateField("das Startdatum"),
    startTime: timeField,
    endDate: dateField("das Enddatum"),
    endTime: timeField,
    allDay: z.boolean(),
    locationName: text(150, "Der Ort"),
    address: text(250, "Die Adresse"),
    contactMemberId: z
      .string()
      .max(64)
      .optional()
      .transform((value) => (value ? value : undefined)),
    contactName: text(100, "Der Name"),
    contactEmail: z
      .string()
      .trim()
      .max(254)
      .optional()
      .refine(
        (value) => !value || z.email().safeParse(value).success,
        "Bitte gib eine gültige E-Mail-Adresse ein.",
      )
      .transform((value) => (value ? value.toLowerCase() : undefined)),
    contactPhone: text(40, "Die Telefonnummer"),
    targetAudience: text(150, "Die Zielgruppe"),
    departmentId: z
      .string()
      .max(64)
      .optional()
      .transform((value) => (value ? value : undefined)),
    maxParticipants: z
      .number({ error: "Bitte gib eine Zahl ein." })
      .int("Bitte gib eine ganze Zahl ein.")
      .min(0)
      .max(100_000)
      .optional(),
    registrationRequired: z.boolean(),
    registrationDeadlineDate: optionalDate,
    registrationDeadlineTime: z.string().trim().optional(),
    waitlistEnabled: z.boolean(),
    internalNotes: text(5000, "Die interne Notiz"),
    repeat: z.enum(REPEAT_VALUES),
    repeatCount: z
      .number({ error: "Bitte gib eine Zahl ein." })
      .int()
      .min(2, "Mindestens 2 Termine.")
      .max(MAX_SERIES_OCCURRENCES, `Höchstens ${MAX_SERIES_OCCURRENCES} Termine.`)
      .optional(),
  })
  .superRefine((data, ctx) => {
    const start = normalizeTime(data.startDate, data.startTime, data.allDay, "start");
    const end = normalizeTime(data.endDate, data.endTime, data.allDay, "end");
    if (start && end && end.getTime() < start.getTime()) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Das Ende darf nicht vor dem Beginn liegen.",
      });
    } else if (start && end && !data.allDay && end.getTime() === start.getTime()) {
      ctx.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "Das Ende muss nach dem Beginn liegen.",
      });
    }
    if (data.registrationDeadlineDate) {
      const time =
        data.registrationDeadlineTime &&
        /^([01]\d|2[0-3]):[0-5]\d$/.test(data.registrationDeadlineTime)
          ? data.registrationDeadlineTime
          : "23:59";
      const deadline = parseBerlinDateTime(data.registrationDeadlineDate, time);
      if (deadline && start && deadline.getTime() > start.getTime()) {
        ctx.addIssue({
          code: "custom",
          path: ["registrationDeadlineDate"],
          message: "Die Anmeldefrist muss vor dem Beginn enden.",
        });
      }
    }
    if (data.repeat !== "none" && !data.repeatCount) {
      ctx.addIssue({
        code: "custom",
        path: ["repeatCount"],
        message: "Bitte gib an, wie viele Termine es geben soll.",
      });
    }
  });

export type EventFormInput = z.input<typeof eventFormSchema>;
export type EventInput = z.output<typeof eventFormSchema>;

function normalizeTime(
  date: string,
  time: string,
  allDay: boolean,
  edge: "start" | "end",
): Date | null {
  if (allDay) return parseBerlinDateTime(date, edge === "start" ? "00:00" : "23:59");
  return parseBerlinDateTime(date, time);
}

export interface NormalizedEventTimes {
  startsAt: Date;
  endsAt: Date;
  registrationDeadline: Date | null;
}

/** Wandelt die Formularwerte (Ortszeit) in UTC-Zeitpunkte um. Gibt `null` bei ungültigen Angaben zurück. */
export function normalizeEventTimes(input: EventInput): NormalizedEventTimes | null {
  const startsAt = normalizeTime(input.startDate, input.startTime, input.allDay, "start");
  const endsAt = normalizeTime(input.endDate, input.endTime, input.allDay, "end");
  if (!startsAt || !endsAt) return null;
  let registrationDeadline: Date | null = null;
  if (input.registrationDeadlineDate) {
    const time =
      input.registrationDeadlineTime &&
      /^([01]\d|2[0-3]):[0-5]\d$/.test(input.registrationDeadlineTime)
        ? input.registrationDeadlineTime
        : "23:59";
    registrationDeadline = parseBerlinDateTime(input.registrationDeadlineDate, time);
  }
  return { startsAt, endsAt, registrationDeadline };
}

export const idSchema = z.object({ id: z.string().min(1).max(64) });
export const cancelEventSchema = z.object({
  id: z.string().min(1).max(64),
  reason: z
    .string()
    .trim()
    .min(3, "Bitte nenne kurz den Grund der Absage.")
    .max(500, "Der Grund ist zu lang (höchstens 500 Zeichen)."),
});
export const respondSchema = z.object({
  eventId: z.string().min(1).max(64),
  response: z.enum(["ACCEPTED", "DECLINED"]),
  note: z.string().trim().max(300).optional(),
});
export const participantSchema = z.object({
  eventId: z.string().min(1).max(64),
  memberId: z.string().min(1).max(64),
  status: z.enum(["ACCEPTED", "DECLINED", "WAITLISTED"]),
});
export const duplicateSchema = z.object({
  id: z.string().min(1).max(64),
  startDate: dateField("das neue Datum"),
});
