import { z } from "zod";
import { MemberStatus } from "@/generated/prisma/enums";
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

export type MemberFormInput = z.input<typeof memberFormSchema>;
export type MemberInput = z.output<typeof memberFormSchema>;

export const consentSchema = z.object({
  memberId: z.string().min(1).max(64),
  type: z.enum(["PRIVACY_POLICY", "DATA_PROCESSING", "NEWSLETTER", "PHOTO_PUBLICATION"]),
  granted: z.boolean(),
  source: z.enum(["app", "paper"]).default("paper"),
});

export const idSchema = z.object({ id: z.string().min(1).max(64) });
