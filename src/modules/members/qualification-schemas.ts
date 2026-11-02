import { z } from "zod";
import type { QualificationKind } from "@/generated/prisma/enums";
import { inDaysLabel, parseCalendarDate } from "@/lib/dates";

/**
 * Qualifikationen und Lizenzen von Mitgliedern – Katalog, Eingaben und die Regel „läuft ab“. Ohne Server-Code: Der Dialog
 * im Browser und der Dienst (`qualifications.ts`) nutzen dieselben Regeln. Die Grenzen stehen zusätzlich als CHECK in der
 * Migration `20261102150000_member_qualifications`.
 */
export const QUALIFICATION_KINDS = [
  "INSTRUCTOR_LICENSE",
  "TRAINER_LICENSE",
  "YOUTH_LEADER_CARD",
  "FIRST_AID",
  "LIFEGUARD",
  "REFEREE",
  "OTHER",
] as const satisfies readonly QualificationKind[];

export const QUALIFICATION_KIND_LABEL: Record<QualificationKind, string> = {
  INSTRUCTOR_LICENSE: "Übungsleiterlizenz",
  TRAINER_LICENSE: "Trainerlizenz",
  YOUTH_LEADER_CARD: "Jugendleiter-Card (Juleica)",
  FIRST_AID: "Erste Hilfe",
  LIFEGUARD: "Rettungsschwimmer",
  REFEREE: "Schiedsrichter",
  OTHER: "Sonstige",
};

/** Ab so vielen Tagen vor dem Ablauf weist die Liste darauf hin („läuft in 30 Tagen ab“). */
export const QUALIFICATION_EXPIRY_WARNING_DAYS = 90;

/** Leere Eingabefelder ("") gelten als „nicht angegeben“ – wie bei den Stammdaten (`schemas.ts`). */
const text = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} ist zu lang (höchstens ${max} Zeichen).`)
    .optional()
    .transform((value) => (value ? value : undefined));

const dateField = (label: string) =>
  z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => !value || parseCalendarDate(value) !== null,
      `${label}: Bitte gib ein gültiges Datum ein.`,
    );

export const qualificationSchema = z
  .object({
    kind: z.enum(QUALIFICATION_KINDS, "Bitte wähle die Art."),
    title: text(120, "Die Bezeichnung"),
    number: text(60, "Die Nummer"),
    issuedOn: dateField("Ausgestellt am"),
    validUntil: dateField("Gültig bis"),
    issuer: text(120, "Der Aussteller"),
    note: text(1000, "Die Notiz"),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "OTHER" && !data.title) {
      ctx.addIssue({
        code: "custom",
        path: ["title"],
        message: "Bitte gib bei „Sonstige“ an, um welche Qualifikation es geht.",
      });
    }
    const issued = data.issuedOn ? parseCalendarDate(data.issuedOn) : null;
    const until = data.validUntil ? parseCalendarDate(data.validUntil) : null;
    if (issued && until && until < issued) {
      ctx.addIssue({
        code: "custom",
        path: ["validUntil"],
        message: "„Gültig bis“ darf nicht vor „Ausgestellt am“ liegen.",
      });
    }
  });

export type QualificationFormInput = z.input<typeof qualificationSchema>;
export type QualificationInput = z.output<typeof qualificationSchema>;

/** Name in Liste und Protokoll: die Art, bei „Sonstige“ nur die Bezeichnung, sonst mit ihr („Trainerlizenz – C-Lizenz“). */
export function qualificationName(q: { kind: QualificationKind; title?: string | null }): string {
  if (q.kind === "OTHER") return q.title || QUALIFICATION_KIND_LABEL.OTHER;
  return q.title
    ? `${QUALIFICATION_KIND_LABEL[q.kind]} – ${q.title}`
    : QUALIFICATION_KIND_LABEL[q.kind];
}

export type QualificationValidity =
  /** Ohne Ablaufdatum (z. B. Schiedsrichterschein ohne Frist). */
  | { state: "open" }
  | { state: "valid"; days: number }
  /** Läuft innerhalb von {@link QUALIFICATION_EXPIRY_WARNING_DAYS} Tagen ab (0 = heute ist der letzte Tag). */
  | { state: "expiring"; days: number }
  | { state: "expired" };

/**
 * Wie lange gilt die Qualifikation noch? „Gültig bis“ ist der letzte gültige Tag; abgelaufen ist sie ab dem Tag danach.
 * Beide Werte sind Kalendertage (UTC-Mitternacht, `@db.Date`), `today` ist der Berliner Tag (`todayCalendarDate`).
 */
export function qualificationValidity(validUntil: Date | null, today: Date): QualificationValidity {
  if (!validUntil) return { state: "open" };
  const days = Math.round((validUntil.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { state: "expired" };
  return days <= QUALIFICATION_EXPIRY_WARNING_DAYS
    ? { state: "expiring", days }
    : { state: "valid", days };
}

/** Hinweis neben „gültig bis“: „läuft in 30 Tagen ab“, „läuft heute ab“, „abgelaufen“ – sonst keiner. */
export function qualificationValidityText(validity: QualificationValidity): string | null {
  if (validity.state === "expired") return "abgelaufen";
  if (validity.state === "expiring") return `läuft ${inDaysLabel(validity.days)} ab`;
  return null;
}
