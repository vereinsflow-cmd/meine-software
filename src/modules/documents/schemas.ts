import { z } from "zod";

export const ACCESS_LEVELS = ["ALL_MEMBERS", "BOARD", "ADMIN"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const ACCESS_LABEL: Record<AccessLevel, string> = {
  ALL_MEMBERS: "Alle Mitglieder",
  BOARD: "Nur Vorstand",
  ADMIN: "Nur Verwaltung",
};

const optionalText = (max: number, label: string) =>
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

/** Angaben zum Upload (die Datei selbst kommt als Formular-Datei und wird auf dem Server geprüft). */
export const uploadMetaSchema = z.object({
  category: optionalText(60, "Die Kategorie"),
  access: z.enum(ACCESS_LEVELS),
  eventId: optionalId,
});
export type UploadMeta = z.output<typeof uploadMetaSchema>;

export const documentFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Bitte gib einen Namen ein.")
    .max(120, "Der Name ist zu lang (höchstens 120 Zeichen)."),
  category: optionalText(60, "Die Kategorie"),
  access: z.enum(ACCESS_LEVELS),
});
export type DocumentFormInput = z.input<typeof documentFormSchema>;
export type DocumentInput = z.output<typeof documentFormSchema>;

export const idSchema = z.object({ id: z.string().min(1).max(64) });
