import { z } from "zod";

export const createClubSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Bitte gib den Vereinsnamen ein.")
    .max(120, "Der Name ist zu lang."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Das Kürzel muss mindestens 3 Zeichen lang sein.")
    .max(50, "Das Kürzel ist zu lang.")
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      "Erlaubt sind Kleinbuchstaben, Ziffern und einzelne Bindestriche (z. B. tsv-musterstadt).",
    ),
  adminEmail: z
    .string()
    .trim()
    .min(1, "Bitte gib die E-Mail-Adresse des ersten Administrators ein.")
    .max(254)
    .pipe(z.email("Bitte gib eine gültige E-Mail-Adresse ein.")),
});
export type CreateClubInput = z.output<typeof createClubSchema>;
export type CreateClubFormInput = z.input<typeof createClubSchema>;

export const clubStatusSchema = z.object({
  clubId: z.string().min(1).max(64),
  active: z.boolean(),
});
