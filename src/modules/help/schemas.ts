import { z } from "zod";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_LIMITS,
  SUPPORT_STATUSES,
  internalPathOrNull,
} from "@/lib/support";

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} ist zu lang (höchstens ${max} Zeichen).`)
    .optional()
    .transform((value) => (value ? value : undefined));

/** Meldung an die Vereinsverwaltung. Reiner Text – wird nirgends als HTML gerendert. */
export const ticketFormSchema = z.object({
  category: z.enum(SUPPORT_CATEGORIES),
  subject: z
    .string()
    .trim()
    .min(3, "Bitte fasse dein Anliegen in einer kurzen Überschrift zusammen.")
    .max(
      SUPPORT_LIMITS.subject,
      `Die Überschrift ist zu lang (höchstens ${SUPPORT_LIMITS.subject} Zeichen).`,
    ),
  description: z
    .string()
    .trim()
    .min(10, "Bitte beschreibe genauer, was passiert ist oder was du wissen möchtest.")
    .max(
      SUPPORT_LIMITS.description,
      `Die Beschreibung ist zu lang (höchstens ${SUPPORT_LIMITS.description} Zeichen).`,
    ),
  /** Seite, auf der es passierte – nur interne Pfade; alles andere wird verworfen statt abgelehnt. */
  pagePath: z
    .string()
    .max(500)
    .optional()
    .transform((value) => internalPathOrNull(value) ?? undefined),
});
export type TicketFormInput = z.input<typeof ticketFormSchema>;
export type TicketInput = z.output<typeof ticketFormSchema>;

export const idSchema = z.object({ id: z.string().min(1).max(64) });

/** Bearbeitung durch die Verwaltung: Status und (optional) eine Antwort für die meldende Person. */
export const ticketUpdateSchema = z.object({
  status: z.enum(SUPPORT_STATUSES),
  response: optionalText(SUPPORT_LIMITS.response, "Die Antwort"),
});
export type TicketUpdateFormInput = z.input<typeof ticketUpdateSchema>;
export type TicketUpdateInput = z.output<typeof ticketUpdateSchema>;

const contactSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Bitte gib einen Namen ein.")
      .max(100, "Der Name ist zu lang (höchstens 100 Zeichen)."),
    role: optionalText(100, "Die Zuständigkeit"),
    email: z
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
  })
  .superRefine((contact, ctx) => {
    if (!contact.email && !contact.phone) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Bitte gib eine E-Mail-Adresse oder eine Telefonnummer an.",
      });
    }
  });

export const contactsFormSchema = z.object({
  contacts: z
    .array(contactSchema)
    .max(SUPPORT_LIMITS.contacts, `Höchstens ${SUPPORT_LIMITS.contacts} Ansprechpartner.`),
});
export type ContactsFormInput = z.input<typeof contactsFormSchema>;
export type ContactsInput = z.output<typeof contactsFormSchema>;
