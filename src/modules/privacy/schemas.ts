import { z } from "zod";
import { PASSWORD_MAX_LENGTH } from "@/lib/password-policy";
import { SELF_SERVICE_CONSENTS } from "@/lib/privacy"; // nicht aus ./consents: Formular-Schemas laufen im Browser

export const consentSchema = z.object({
  type: z.enum(SELF_SERVICE_CONSENTS),
  granted: z.boolean(),
});

export const deletionRequestSchema = z.object({
  password: z
    .string()
    .min(1, "Bitte gib zur Bestätigung dein Passwort ein.")
    .max(PASSWORD_MAX_LENGTH, "Das Passwort ist zu lang."),
  reason: z.string().trim().max(500, "Bitte fasse dich kürzer (höchstens 500 Zeichen).").optional(),
  confirm: z
    .boolean()
    .refine((value) => value === true, "Bitte bestätige, dass du die Folgen verstanden hast."),
});
export type DeletionRequestInput = z.input<typeof deletionRequestSchema>;
