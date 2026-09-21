import { z } from "zod";
import { parseCalendarDate } from "@/lib/dates";

const text = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} ist zu lang (höchstens ${max} Zeichen).`)
    .optional()
    .transform((value) => (value ? value : undefined));

const optionalId = z
  .string()
  .max(64)
  .optional()
  .transform((value) => (value ? value : undefined));

const optionalDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined))
  .refine(
    (value) => value === undefined || parseCalendarDate(value) !== null,
    "Bitte gib ein gültiges Datum ein.",
  );

export const TASK_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "BLOCKED"] as const;
export const TASK_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;

export const taskFormSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Bitte gib einen Titel ein.")
    .max(150, "Der Titel ist zu lang (höchstens 150 Zeichen)."),
  description: text(2000, "Die Beschreibung"),
  assigneeMemberId: optionalId,
  eventId: optionalId,
  groupId: optionalId,
  dueDate: optionalDate,
  priority: z.enum(TASK_PRIORITIES),
  status: z.enum(TASK_STATUSES),
  notes: text(2000, "Die Notiz"),
});
export type TaskFormInput = z.input<typeof taskFormSchema>;
export type TaskInput = z.output<typeof taskFormSchema>;

/** Leeres Formular für eine neue Aufgabe (optional mit vorbelegter Veranstaltung). Bewusst hier und nicht in der Client-Datei: Server-Seiten rufen es auf. */
export const emptyTask = (eventId?: string): TaskFormInput => ({
  title: "",
  description: "",
  assigneeMemberId: "",
  eventId: eventId ?? "",
  groupId: "",
  dueDate: "",
  priority: "NORMAL",
  status: "OPEN",
  notes: "",
});

export const taskStatusSchema = z.object({
  id: z.string().min(1).max(64),
  status: z.enum(TASK_STATUSES),
});
export const idSchema = z.object({ id: z.string().min(1).max(64) });

export const checklistSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Bitte gib einen Titel ein.")
    .max(120, "Der Titel ist zu lang (höchstens 120 Zeichen)."),
  eventId: optionalId,
});
export type ChecklistInput = z.output<typeof checklistSchema>;

export const checklistItemSchema = z.object({
  checklistId: z.string().min(1).max(64),
  text: z
    .string()
    .trim()
    .min(1, "Bitte gib einen Text ein.")
    .max(200, "Der Text ist zu lang (höchstens 200 Zeichen)."),
  assigneeMemberId: optionalId,
  dueDate: optionalDate,
});
export const toggleItemSchema = z.object({ id: z.string().min(1).max(64), done: z.boolean() });
