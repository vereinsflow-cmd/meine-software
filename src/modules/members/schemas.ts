import { z } from "zod";
import { MemberStatus } from "@/generated/prisma/enums";
import { COUNTRY_CODES } from "@/lib/countries";
import { parseCalendarDate, todayCalendarDate } from "@/lib/dates";

/**
 * Eingabe-Schemas für Mitglieder. Werden im Browser (Sofort-Feedback) und im Service
 * (verbindliche Prüfung) verwendet. Leere Eingabefelder ("") gelten als "nicht angegeben".
 */
const text = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} ist zu lang (höchstens ${max} Zeichen).`)
    .optional()
    .transform((value) => (value ? value : undefined));

const requiredName = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Bitte gib ${label} ein.`)
    .max(100, `${label[0]?.toUpperCase()}${label.slice(1)} ist zu lang.`);

const dateField = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => !value || parseCalendarDate(value) !== null,
      `${label}: Bitte gib ein gültiges Datum ein.`,
    );

export const MEMBER_STATUS_VALUES = Object.values(MemberStatus) as [
  MemberStatus,
  ...MemberStatus[],
];

export const memberFormSchema = z
  .object({
    memberNumber: text(30, "Die Mitgliedsnummer"),
    firstName: requiredName("den Vornamen"),
    lastName: requiredName("den Nachnamen"),
    email: z
      .string()
      .trim()
      .max(254, "Die E-Mail-Adresse ist zu lang.")
      .optional()
      .refine(
        (value) => !value || z.email().safeParse(value).success,
        "Bitte gib eine gültige E-Mail-Adresse ein.",
      )
      .transform((value) => (value ? value.toLowerCase() : undefined)),
    phone: z
      .string()
      .trim()
      .max(40, "Die Telefonnummer ist zu lang.")
      .optional()
      .refine(
        (value) => !value || /^[0-9+()\-/.\s]+$/.test(value),
        "Bitte gib eine gültige Telefonnummer ein.",
      )
      .transform((value) => (value ? value : undefined)),
    street: text(120, "Die Straße"),
    postalCode: text(10, "Die Postleitzahl"),
    city: text(100, "Der Ort"),
    country: text(60, "Das Land"),
    birthDate: dateField("Geburtsdatum"),
    joinedAt: dateField("Eintrittsdatum"),
    leftAt: dateField("Austrittsdatum"),
    status: z.enum(MEMBER_STATUS_VALUES, "Bitte wähle einen Status."),
    clubFunction: text(100, "Die Funktion"),
    internalNotes: text(5000, "Die Notiz"),
    departmentIds: z.array(z.string().min(1).max(64)).max(50),
    leaderDepartmentIds: z.array(z.string().min(1).max(64)).max(50),
  })
  .superRefine((data, ctx) => {
    const birth = data.birthDate ? parseCalendarDate(data.birthDate) : null;
    if (birth && (birth > todayCalendarDate() || birth.getUTCFullYear() < 1900)) {
      ctx.addIssue({
        code: "custom",
        path: ["birthDate"],
        message: "Das Geburtsdatum ist nicht plausibel.",
      });
    }
    const joined = data.joinedAt ? parseCalendarDate(data.joinedAt) : null;
    const left = data.leftAt ? parseCalendarDate(data.leftAt) : null;
    if (joined && left && left < joined) {
      ctx.addIssue({
        code: "custom",
        path: ["leftAt"],
        message: "Der Austritt darf nicht vor dem Eintritt liegen.",
      });
    }
    const notMember = data.leaderDepartmentIds.filter((id) => !data.departmentIds.includes(id));
    if (notMember.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["leaderDepartmentIds"],
        message: "Ein Abteilungsleiter muss der Abteilung auch angehören.",
      });
    }
  });

const REQUIRED_ON_CREATE: Array<[keyof MemberInput, string]> = [
  ["memberNumber", "Bitte gib eine Mitgliedsnummer ein."],
  ["clubFunction", "Bitte gib die Funktion im Verein ein."],
  ["email", "Bitte gib eine E-Mail-Adresse ein."],
  ["phone", "Bitte gib eine Telefonnummer ein."],
  ["street", "Bitte gib die Straße und Hausnummer ein."],
  ["postalCode", "Bitte gib die Postleitzahl ein."],
  ["city", "Bitte gib den Ort ein."],
  ["country", "Bitte gib das Land ein."],
];

/**
 * Strengere Prüfung fürs Neuanlegen: Kontaktdaten, Mitgliedsnummer, Funktion, Eintrittsdatum und
 * mindestens eine Abteilung sind hier zusätzlich Pflicht. Bestehende Mitglieder mit Lücken in
 * diesen Feldern lassen sich trotzdem weiter bearbeiten, da `memberFormSchema` dafür unverändert
 * bleibt.
 */
export const memberCreateSchema = memberFormSchema.superRefine((data, ctx) => {
  for (const [field, message] of REQUIRED_ON_CREATE) {
    if (!data[field]) ctx.addIssue({ code: "custom", path: [field], message });
  }
  if (!data.joinedAt) {
    ctx.addIssue({
      code: "custom",
      path: ["joinedAt"],
      message: "Bitte gib ein Eintrittsdatum ein.",
    });
  }
  if (data.departmentIds.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["departmentIds"],
      message: "Bitte wähle mindestens eine Abteilung.",
    });
  }
  if (data.country && !COUNTRY_CODES.has(data.country)) {
    ctx.addIssue({
      code: "custom",
      path: ["country"],
      message: "Bitte wähle ein Land aus der Liste.",
    });
  }
});

export type MemberFormInput = z.input<typeof memberFormSchema>;
export type MemberInput = z.output<typeof memberFormSchema>;

export const consentSchema = z.object({
  memberId: z.string().min(1).max(64),
  type: z.enum(["PRIVACY_POLICY", "DATA_PROCESSING", "NEWSLETTER", "PHOTO_PUBLICATION"]),
  granted: z.boolean(),
  source: z.enum(["app", "paper"]).default("paper"),
});

export const idSchema = z.object({ id: z.string().min(1).max(64) });
