import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  acceptExistingInvitationSchema,
  acceptInvitationSchema,
  changePasswordSchema,
  emailSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from "@/modules/auth/schemas";
import {
  emailNotificationsSchema,
  profileNameSchema,
  revokeSessionSchema,
} from "@/modules/profile/schemas";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/password-policy";

/**
 * Eingabe-Schemas der Anmelde- und Profilseiten. Sie laufen im Browser UND auf dem Server; die Meldungen sieht der
 * Benutzer direkt am Feld.
 */
function errorsOf(schema: z.ZodType, input: unknown): Record<string, string[]> {
  const result = schema.safeParse(input);
  if (result.success) return {};
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    (errors[issue.path.join(".") || "_form"] ??= []).push(issue.message);
  }
  return errors;
}

const GOOD_PASSWORD = "Zebra-Lampe-Wolke-Tisch-9";

describe("E-Mail-Adresse", () => {
  it("entfernt Leerzeichen am Rand und akzeptiert gültige Adressen", () => {
    expect(emailSchema.parse("  paula@example.test ")).toBe("paula@example.test");
  });

  it("meldet leere, ungültige und überlange Adressen verständlich", () => {
    expect(errorsOf(emailSchema, "   ")._form).toEqual(["Bitte gib deine E-Mail-Adresse ein."]);
    expect(errorsOf(emailSchema, "kein-at-zeichen")._form).toEqual([
      "Bitte gib eine gültige E-Mail-Adresse ein.",
    ]);
    expect(errorsOf(emailSchema, `${"a".repeat(250)}@x.de`)._form).toEqual([
      "Die E-Mail-Adresse ist zu lang.",
    ]);
  });
});

describe("Anmeldung und Passwort vergessen", () => {
  it("verlangt E-Mail und Passwort; das Weiterleitungsziel ist optional", () => {
    expect(loginSchema.parse({ email: " a@b.de ", password: "x" })).toEqual({
      email: "a@b.de",
      password: "x",
    });
    expect(errorsOf(loginSchema, { email: "a@b.de", password: "" })).toEqual({
      password: ["Bitte gib dein Passwort ein."],
    });
    expect(
      errorsOf(loginSchema, { email: "a@b.de", password: "x".repeat(PASSWORD_MAX_LENGTH + 1) }),
    ).toEqual({ password: ["Das Passwort ist zu lang."] });
    expect(
      errorsOf(loginSchema, { email: "a@b.de", password: "x", next: "/".repeat(2001) }),
    ).toHaveProperty("next");
  });

  it("die Anmeldung prüft keine Passwortregeln (auch alte, kurze Passwörter bleiben nutzbar)", () => {
    expect(loginSchema.safeParse({ email: "a@b.de", password: "kurz" }).success).toBe(true);
  });

  it("Passwort vergessen braucht nur eine gültige E-Mail-Adresse", () => {
    expect(forgotPasswordSchema.parse({ email: "a@b.de", extra: 1 })).toEqual({ email: "a@b.de" });
    expect(errorsOf(forgotPasswordSchema, { email: "" })).toHaveProperty("email");
  });
});

describe("Neues Passwort", () => {
  const reset = (over: Record<string, unknown> = {}) => ({
    token: "t".repeat(32),
    password: GOOD_PASSWORD,
    passwordRepeat: GOOD_PASSWORD,
    ...over,
  });

  it("verlangt Mindest- und Höchstlänge", () => {
    expect(resetPasswordSchema.safeParse(reset()).success).toBe(true);
    const short = "x".repeat(PASSWORD_MIN_LENGTH - 1);
    expect(
      errorsOf(resetPasswordSchema, reset({ password: short, passwordRepeat: short })),
    ).toEqual({
      password: [`Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.`],
    });
    const long = "x".repeat(PASSWORD_MAX_LENGTH + 1);
    expect(errorsOf(resetPasswordSchema, reset({ password: long, passwordRepeat: long }))).toEqual({
      password: [`Das Passwort darf höchstens ${PASSWORD_MAX_LENGTH} Zeichen lang sein.`],
    });
  });

  it("meldet abweichende Wiederholung am Wiederholungsfeld", () => {
    expect(errorsOf(resetPasswordSchema, reset({ passwordRepeat: `${GOOD_PASSWORD}!` }))).toEqual({
      passwordRepeat: ["Die Passwörter stimmen nicht überein."],
    });
  });

  it("lehnt zu kurze oder zu lange Tokens ab", () => {
    expect(errorsOf(resetPasswordSchema, reset({ token: "kurz" }))).toHaveProperty("token");
    expect(errorsOf(resetPasswordSchema, reset({ token: "t".repeat(201) }))).toHaveProperty(
      "token",
    );
  });

  it("Passwort ändern: aktuelles Passwort ist Pflicht, Wiederholung muss passen", () => {
    const base = {
      currentPassword: "alt",
      newPassword: GOOD_PASSWORD,
      newPasswordRepeat: GOOD_PASSWORD,
    };
    expect(changePasswordSchema.safeParse(base).success).toBe(true);
    expect(errorsOf(changePasswordSchema, { ...base, currentPassword: "" })).toEqual({
      currentPassword: ["Bitte gib dein aktuelles Passwort ein."],
    });
    expect(errorsOf(changePasswordSchema, { ...base, newPasswordRepeat: "anders" })).toEqual({
      newPasswordRepeat: ["Die Passwörter stimmen nicht überein."],
    });
  });
});

describe("Einladung annehmen", () => {
  const accept = (over: Record<string, unknown> = {}) => ({
    token: "t".repeat(32),
    firstName: " Vera ",
    lastName: " Vorstand ",
    password: GOOD_PASSWORD,
    passwordRepeat: GOOD_PASSWORD,
    acceptTerms: true,
    ...over,
  });

  it("übernimmt getrimmte Namen", () => {
    expect(acceptInvitationSchema.parse(accept())).toMatchObject({
      firstName: "Vera",
      lastName: "Vorstand",
    });
  });

  it("ohne bestätigte Datenschutzerklärung geht es nicht weiter", () => {
    expect(errorsOf(acceptInvitationSchema, accept({ acceptTerms: false }))).toEqual({
      acceptTerms: ["Bitte bestätige die Kenntnisnahme der Datenschutzerklärung."],
    });
    expect(errorsOf(acceptInvitationSchema, accept({ acceptTerms: "true" }))).toHaveProperty(
      "acceptTerms",
    );
  });

  it("meldet fehlende Namen mit dem jeweiligen Feld", () => {
    expect(errorsOf(acceptInvitationSchema, accept({ firstName: " ", lastName: "" }))).toEqual({
      firstName: ["Bitte gib deinen Vornamen ein."],
      lastName: ["Bitte gib deinen Nachnamen ein."],
    });
  });

  it("bestehende Konten brauchen nur das Token", () => {
    expect(acceptExistingInvitationSchema.parse({ token: "t".repeat(10) })).toEqual({
      token: "t".repeat(10),
    });
    expect(acceptExistingInvitationSchema.safeParse({ token: "t".repeat(9) }).success).toBe(false);
  });
});

describe("Profil", () => {
  it("Name: getrimmt, Pflicht, höchstens 100 Zeichen", () => {
    expect(profileNameSchema.parse({ firstName: "  Paula ", lastName: " Person" })).toEqual({
      firstName: "Paula",
      lastName: "Person",
    });
    expect(profileNameSchema.safeParse({ firstName: "P".repeat(100), lastName: "X" }).success).toBe(
      true,
    );
    const tooLong = errorsOf(profileNameSchema, { firstName: "P".repeat(101), lastName: "X" });
    expect(Object.keys(tooLong)).toEqual(["firstName"]);
    expect(tooLong.firstName![0]).toMatch(/zu lang/);
  });

  it("übernimmt keine zusätzlichen Felder (z. B. eine fremde Benutzer-ID)", () => {
    expect(
      profileNameSchema.parse({ firstName: "Paula", lastName: "Person", userId: "fremd" }),
    ).toEqual({ firstName: "Paula", lastName: "Person" });
    expect(emailNotificationsSchema.parse({ enabled: false, userId: "fremd" })).toEqual({
      enabled: false,
    });
  });

  it("E-Mail-Benachrichtigungen: nur echte Wahrheitswerte", () => {
    expect(emailNotificationsSchema.safeParse({ enabled: "false" }).success).toBe(false);
    expect(emailNotificationsSchema.safeParse({}).success).toBe(false);
  });

  it("Sitzungs-ID: Länge begrenzt", () => {
    expect(revokeSessionSchema.safeParse({ sessionId: "s".repeat(9) }).success).toBe(false);
    expect(revokeSessionSchema.safeParse({ sessionId: "s".repeat(64) }).success).toBe(true);
    expect(revokeSessionSchema.safeParse({ sessionId: "s".repeat(201) }).success).toBe(false);
  });
});
