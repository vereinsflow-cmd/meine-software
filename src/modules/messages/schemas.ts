import { z } from "zod";
import { idString, optionalIdString as optionalId } from "@/lib/id-schema";

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

export { idSchema } from "@/lib/id-schema";

/** Höchstens so viele Personen auf einmal fügt man einer Chat-Gruppe hinzu. */
export const MAX_MEMBERS_PER_ADD = 100;

/** Mitglieder einer Chat-Gruppe hinzufügen: der Chat (Schlüssel wie in der Adresse, `abteilung-…`) und die Auswahl. */
export const addChatMembersSchema = z.object({
  chat: z.string().min(1).max(80),
  memberIds: z
    .array(idString)
    .min(1, "Bitte wähle mindestens eine Person aus.")
    .max(
      MAX_MEMBERS_PER_ADD,
      `Bitte füge höchstens ${MAX_MEMBERS_PER_ADD} Personen auf einmal hinzu.`,
    ),
});

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
