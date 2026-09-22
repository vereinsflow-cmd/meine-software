import { z } from "zod";

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} ist zu lang (höchstens ${max} Zeichen).`)
    .optional()
    .transform((value) => (value ? value : undefined));

/** Auswahl an Abteilungsfarben (kontrastreich auf hellem und dunklem Grund). */
export const DEPARTMENT_COLORS = [
  { value: "#16a34a", label: "Grün" },
  { value: "#2563eb", label: "Blau" },
  { value: "#dc2626", label: "Rot" },
  { value: "#d97706", label: "Orange" },
  { value: "#7c3aed", label: "Violett" },
  { value: "#0891b2", label: "Türkis" },
  { value: "#db2777", label: "Pink" },
  { value: "#475569", label: "Grau" },
] as const;

export const departmentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Der Name muss mindestens 2 Zeichen lang sein.")
    .max(80, "Der Name ist zu lang (höchstens 80 Zeichen)."),
  description: optionalText(500, "Die Beschreibung"),
  color: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^#[0-9a-fA-F]{6}$/.test(value), "Ungültige Farbe.")
    .transform((value) => (value ? value.toLowerCase() : undefined)),
});
export type DepartmentInput = z.output<typeof departmentSchema>;
export type DepartmentFormInput = z.input<typeof departmentSchema>;

export const groupSchema = z.object({
  departmentId: z
    .string()
    .max(64)
    .optional()
    .transform((value) => (value ? value : undefined)),
  name: z
    .string()
    .trim()
    .min(2, "Der Name muss mindestens 2 Zeichen lang sein.")
    .max(80, "Der Name ist zu lang (höchstens 80 Zeichen)."),
  description: optionalText(500, "Die Beschreibung"),
});
export type GroupInput = z.output<typeof groupSchema>;
export type GroupFormInput = z.input<typeof groupSchema>;

export const idSchema = z.object({ id: z.string().min(1).max(64) });
export const groupMemberSchema = z.object({
  groupId: z.string().min(1).max(64),
  memberId: z.string().min(1).max(64),
});
export const leaderSchema = z.object({
  departmentId: z.string().min(1).max(64),
  memberId: z.string().min(1).max(64),
  isLeader: z.boolean(),
});
export const departmentMemberSchema = z.object({
  departmentId: z.string().min(1).max(64),
  memberId: z.string().min(1).max(64),
});
