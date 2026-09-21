import { z } from "zod";

const optionalId = z
  .string()
  .max(64)
  .optional()
  .transform((value) => (value ? value : undefined));

export const AUDIENCES = [
  "ALL_MEMBERS",
  "DEPARTMENT",
  "EVENT_PARTICIPANTS",
  "EVENT_HELPERS",
] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_LABEL: Record<Audience, string> = {
  ALL_MEMBERS: "Alle Mitglieder",
  DEPARTMENT: "Eine Abteilung",
  EVENT_PARTICIPANTS: "Zugesagte Teilnehmer einer Veranstaltung",
  EVENT_HELPERS: "Eingetragene Helfer einer Veranstaltung",
};

const audienceFields = {
  audience: z.enum(AUDIENCES),
  departmentId: optionalId,
  eventId: optionalId,
};

/** Nur die Zielgruppe (für die Empfänger-Vorschau). Getrennt vom Formular, weil Zod Schemas mit Prüfregeln nicht "pick"-en kann. */
export const audienceSchema = z.object(audienceFields);

/** Nachrichten sind reiner Text (nie HTML) – der Inhalt wird bei der Anzeige nicht interpretiert. */
export const messageFormSchema = z
  .object({
    subject: z
      .string()
      .trim()
      .min(2, "Bitte gib einen Betreff ein.")
      .max(150, "Der Betreff ist zu lang (höchstens 150 Zeichen)."),
    body: z
      .string()
      .trim()
      .min(1, "Bitte schreibe eine Nachricht.")
      .max(5000, "Die Nachricht ist zu lang (höchstens 5000 Zeichen)."),
    ...audienceFields,
    isAnnouncement: z.boolean(),
    sendEmail: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.audience === "DEPARTMENT" && !data.departmentId)
      ctx.addIssue({
        code: "custom",
        path: ["departmentId"],
        message: "Bitte wähle eine Abteilung.",
      });
    if (
      (data.audience === "EVENT_PARTICIPANTS" || data.audience === "EVENT_HELPERS") &&
      !data.eventId
    )
      ctx.addIssue({
        code: "custom",
        path: ["eventId"],
        message: "Bitte wähle eine Veranstaltung.",
      });
  });
export type MessageFormInput = z.input<typeof messageFormSchema>;
export type MessageInput = z.output<typeof messageFormSchema>;

export const idSchema = z.object({ id: z.string().min(1).max(64) });
export const sendSchema = z.object({ id: z.string().min(1).max(64) });

export const emptyMessage = (over: Partial<MessageFormInput> = {}): MessageFormInput => ({
  subject: "",
  body: "",
  audience: "ALL_MEMBERS",
  departmentId: "",
  eventId: "",
  isAnnouncement: false,
  sendEmail: false,
  ...over,
});
