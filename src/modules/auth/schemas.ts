import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

/**
 * Eingabe-Schemas der Anmelde-Seiten. Sie werden im Browser (Sofort-Feedback) UND auf dem Server
 * (verbindliche Prüfung) verwendet. Die detaillierten Passwortregeln prüft der Server.
 */
const email = z
  .string()
  .trim()
  .min(1, "Bitte gib deine E-Mail-Adresse ein.")
  .max(254, "Die E-Mail-Adresse ist zu lang.")
  .pipe(z.email("Bitte gib eine gültige E-Mail-Adresse ein."));

const newPassword = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.`,
  )
  .max(
    PASSWORD_MAX_LENGTH,
    `Das Passwort darf höchstens ${PASSWORD_MAX_LENGTH} Zeichen lang sein.`,
  );

export const personName = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Bitte gib ${label} ein.`)
    .max(100, `${label[0]?.toUpperCase()}${label.slice(1)} ist zu lang.`);

export const loginSchema = z.object({
  email,
  password: z
    .string()
    .min(1, "Bitte gib dein Passwort ein.")
    .max(PASSWORD_MAX_LENGTH, "Das Passwort ist zu lang."),
  next: z.string().max(2000).optional(),
});
export type LoginInput = z.input<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email });
export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10).max(200),
    password: newPassword,
    passwordRepeat: z.string(),
  })
  .refine((data) => data.password === data.passwordRepeat, {
    path: ["passwordRepeat"],
    message: "Die Passwörter stimmen nicht überein.",
  });
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

export const acceptInvitationSchema = z
  .object({
    token: z.string().min(10).max(200),
    firstName: personName("deinen Vornamen"),
    lastName: personName("deinen Nachnamen"),
    password: newPassword,
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
export type AcceptInvitationInput = z.input<typeof acceptInvitationSchema>;

export const acceptExistingInvitationSchema = z.object({ token: z.string().min(10).max(200) });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Bitte gib dein aktuelles Passwort ein."),
    newPassword,
    newPasswordRepeat: z.string(),
  })
  .refine((data) => data.newPassword === data.newPasswordRepeat, {
    path: ["newPasswordRepeat"],
    message: "Die Passwörter stimmen nicht überein.",
  });
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;
