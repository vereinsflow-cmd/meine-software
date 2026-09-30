import { z } from "zod";
import { parseCalendarDate, todayCalendarDate } from "@/lib/dates";
import { APPLICATION_LIMITS } from "@/lib/membership-application";

/**
 * Eingaben rund um den Beitritt per QR-Code. Das Antragsformular ist öffentlich (ohne Anmeldung) – der Server prüft
 * deshalb alles noch einmal mit demselben Schema, die Prüfung im Browser dient nur dem Sofort-Feedback.
 */

/** Leere Felder („“) gelten als „nicht angegeben“. */
const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .optional()
    .transform((value) => (value ? value : undefined));

const name = (label: string, what: string) =>
  z
    .string()
    .trim()
    .min(1, `Bitte gib ${label} ein.`)
    .max(
      APPLICATION_LIMITS.name,
      `${what} ist zu lang (höchstens ${APPLICATION_LIMITS.name} Zeichen).`,
    );

/** Frühestes Geburtsjahr, das noch plausibel ist (wie beim Mitglied). */
const EARLIEST_BIRTH_YEAR = 1900;

export const applicationFormSchema = z
  .object({
    token: z.string().min(10).max(200),
    firstName: name("deinen Vornamen", "Der Vorname"),
    lastName: name("deinen Nachnamen", "Der Nachname"),
    email: z
      .string()
      .trim()
      .min(1, "Bitte gib deine E-Mail-Adresse ein.")
      .max(APPLICATION_LIMITS.email, "Die E-Mail-Adresse ist zu lang.")
      .pipe(z.email("Bitte gib eine gültige E-Mail-Adresse ein."))
      .transform((value) => value.toLowerCase()),
    phone: z
      .string()
      .trim()
      .max(APPLICATION_LIMITS.phone, "Die Telefonnummer ist zu lang.")
      .optional()
      .refine(
        (value) => !value || /^[0-9+()\-/.\s]+$/.test(value),
        "Bitte gib eine gültige Telefonnummer ein (nur Ziffern, Leerzeichen und + ( ) - /).",
      )
      .transform((value) => (value ? value : undefined)),
    /** JJJJ-MM-TT aus `<input type="date">`; freiwillig. */
    birthDate: z
      .string()
      .trim()
      .optional()
      .refine(
        (value) => !value || parseCalendarDate(value) !== null,
        "Bitte gib ein gültiges Datum ein.",
      )
      .transform((value) => (value ? value : undefined)),
    departmentId: optionalText(64, "Bitte wähle eine Abteilung aus der Liste."),
    message: optionalText(
      APPLICATION_LIMITS.message,
      `Die Nachricht ist zu lang (höchstens ${APPLICATION_LIMITS.message} Zeichen).`,
    ),
    consent: z.boolean().refine((value) => value === true, {
      message: "Bitte stimme zu – sonst kann der Verein deinen Antrag nicht bearbeiten.",
    }),
    /**
     * Honigtopf gegen Formular-Roboter: für Menschen unsichtbar und leer. Bewusst OHNE Fehlermeldung – ein ausgefülltes
     * Feld wird auf dem Server still verworfen (Erfolg vorgetäuscht), damit der Roboter nichts daraus lernt.
     */
    website: z.string().max(10_000).optional().default(""),
  })
  .superRefine((data, ctx) => {
    const birth = data.birthDate ? parseCalendarDate(data.birthDate) : null;
    if (!birth) return;
    if (birth >= todayCalendarDate()) {
      ctx.addIssue({
        code: "custom",
        path: ["birthDate"],
        message: "Das Geburtsdatum muss in der Vergangenheit liegen.",
      });
    } else if (birth.getUTCFullYear() < EARLIEST_BIRTH_YEAR) {
      ctx.addIssue({
        code: "custom",
        path: ["birthDate"],
        message: "Das Geburtsdatum ist nicht plausibel.",
      });
    }
  });

export type ApplicationFormInput = z.input<typeof applicationFormSchema>;
export type ApplicationInput = z.output<typeof applicationFormSchema>;

/** Hat ein Roboter den unsichtbaren Honigtopf ausgefüllt? */
export const isHoneypotFilled = (input: Pick<ApplicationInput, "website">): boolean =>
  input.website.trim() !== "";

export const idSchema = z.object({ id: z.string().min(1).max(64) });
