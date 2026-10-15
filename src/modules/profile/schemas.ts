import { z } from "zod";
import { personName, secondFactorCodeSchema, totpCodeSchema } from "@/modules/auth/schemas";

export const profileNameSchema = z.object({
  firstName: personName("deinen Vornamen"),
  lastName: personName("deinen Nachnamen"),
});
export type ProfileNameInput = z.input<typeof profileNameSchema>;

export const emailNotificationsSchema = z.object({ enabled: z.boolean() });

export const revokeSessionSchema = z.object({ sessionId: z.string().min(10).max(200) });

const currentPassword = z
  .string()
  .min(1, "Bitte gib dein Passwort ein.")
  .max(200, "Das Passwort ist zu lang.");

/** Zwei-Faktor einschalten: aktuelles Passwort und erster Code aus der App. */
export const confirmTwoFactorSchema = z.object({ password: currentPassword, code: totpCodeSchema });
export type ConfirmTwoFactorInput = z.input<typeof confirmTwoFactorSchema>;

/** Ausschalten und neue Wiederherstellungscodes: Passwort UND Code (aus der App oder Wiederherstellungscode). */
export const twoFactorProtectedSchema = z.object({
  password: currentPassword,
  code: secondFactorCodeSchema,
});
export type TwoFactorProtectedInput = z.input<typeof twoFactorProtectedSchema>;
