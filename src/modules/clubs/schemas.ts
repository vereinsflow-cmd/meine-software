import { z } from "zod";

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} ist zu lang (höchstens ${max} Zeichen).`)
    .optional()
    .transform((value) => (value ? value : undefined));

const wholeNumber = (label: string, min: number, max: number) =>
  z.coerce
    .number({ error: `${label}: Bitte gib eine Zahl ein.` })
    .int(`${label}: Bitte gib eine ganze Zahl ein.`)
    .min(min, `${label}: mindestens ${min}.`)
    .max(max, `${label}: höchstens ${max}.`);

export const clubSettingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Bitte gib den Vereinsnamen ein.")
    .max(120, "Der Name ist zu lang."),
  contactEmail: z
    .string()
    .trim()
    .max(254)
    .optional()
    .refine(
      (value) => !value || z.email().safeParse(value).success,
      "Bitte gib eine gültige E-Mail-Adresse ein.",
    )
    .transform((value) => (value ? value.toLowerCase() : undefined)),
  phone: optionalText(40, "Die Telefonnummer"),
  street: optionalText(120, "Die Straße"),
  postalCode: optionalText(10, "Die Postleitzahl"),
  city: optionalText(100, "Der Ort"),
  website: z
    .string()
    .trim()
    .max(200)
    .optional()
    .refine(
      (value) => !value || z.url({ protocol: /^https?$/ }).safeParse(value).success,
      "Bitte gib eine vollständige Adresse mit https:// ein.",
    )
    .transform((value) => (value ? value : undefined)),
  privacyContact: optionalText(500, "Der Datenschutz-Ansprechpartner"),
  leftMembersMonths: wholeNumber("Ausgetretene Mitglieder", 0, 120),
  trashDays: wholeNumber("Papierkorb", 7, 365),
  auditMonths: wholeNumber("Änderungsprotokoll", 6, 120),
});
export type ClubSettingsInput = z.output<typeof clubSettingsSchema>;

/**
 * Assistent „Verein einrichten“: dieselben Vereinsdaten, aber Kontakt-E-Mail und Anschrift sind Pflicht – sie stehen in
 * der Datenschutzerklärung, im Aushang zum Beitritt und in E-Mails an die Mitglieder (siehe `lib/club-setup.ts`).
 */
export const clubSetupSchema = clubSettingsSchema.superRefine((data, ctx) => {
  const required = [
    ["contactEmail", "Bitte gib eine Kontakt-E-Mail-Adresse ein."],
    ["street", "Bitte gib Straße und Hausnummer ein."],
    ["postalCode", "Bitte gib die Postleitzahl ein."],
    ["city", "Bitte gib den Ort ein."],
  ] as const;
  for (const [field, message] of required) {
    if (!data[field]) ctx.addIssue({ code: "custom", path: [field], message });
  }
});
export type ClubSettingsFormInput = z.input<typeof clubSettingsSchema>;
