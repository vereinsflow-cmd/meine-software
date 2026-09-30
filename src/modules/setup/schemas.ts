import { z } from "zod";
import { emailSchema, newPasswordSchema, personName } from "@/modules/auth/schemas";

/** Ersteinrichtung der leeren Version: Verein und erstes Administrator-Konto in einem Formular. */
export const firstRunSchema = z
  .object({
    clubName: z
      .string()
      .trim()
      .min(2, "Bitte gib den Namen deines Vereins ein.")
      .max(120, "Der Name ist zu lang."),
    firstName: personName("deinen Vornamen"),
    lastName: personName("deinen Nachnamen"),
    email: emailSchema,
    password: newPasswordSchema,
    passwordRepeat: z.string(),
    acceptTerms: z
      .boolean()
      .refine(
        (value) => value === true,
        "Bitte bestätige die Kenntnisnahme der Datenschutzerklärung.",
      ),
  })
  .refine((data) => data.password === data.passwordRepeat, {
    path: ["passwordRepeat"],
    message: "Die Passwörter stimmen nicht überein.",
  });
export type FirstRunInput = z.input<typeof firstRunSchema>;
