import { z } from "zod";
import { parseCalendarDate } from "@/lib/dates";
import { MAX_AMOUNT_CENTS, parseEuroToCents } from "@/lib/money";

/**
 * Eingaben rund um Beiträge (Browser und Server, ohne Server-Code). Beträge kommen als Text („12,00“), Prozente als Text
 * („50“ bzw. „12,5“); umgerechnet wird im Dienst.
 */

const id = z.string().trim().min(1).max(64);
const optionalId = z
  .string()
  .trim()
  .max(64)
  .optional()
  .transform((value) => (value ? value : undefined));

const calendarDate = z
  .string()
  .trim()
  .refine((value) => parseCalendarDate(value) !== null, "Bitte gib ein gültiges Datum ein.");
const optionalCalendarDate = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined))
  .refine(
    (value) => value === undefined || parseCalendarDate(value) !== null,
    "Bitte gib ein gültiges Datum ein.",
  );

/** Betrag ≥ 0 (0 = beitragsfrei). */
const feeAmount = z
  .string()
  .trim()
  .min(1, "Bitte gib den Betrag ein (0,00 für beitragsfrei).")
  .max(30)
  .refine((value) => {
    const cents = parseEuroToCents(value);
    return cents !== null && cents <= MAX_AMOUNT_CENTS;
  }, "Bitte gib einen gültigen Betrag ein (z. B. 12,00).");

const optionalAge = z
  .string()
  .trim()
  .max(3)
  .optional()
  .transform((value) => (value ? value : undefined))
  .refine(
    (value) => value === undefined || (/^\d{1,3}$/.test(value) && Number(value) <= 120),
    "Bitte gib ein Alter zwischen 0 und 120 ein.",
  );

export const FEE_KINDS = ["BASE", "ADDITIONAL", "FAMILY", "ADMISSION"] as const;
export const FEE_KIND_LABEL: Record<(typeof FEE_KINDS)[number], string> = {
  BASE: "Grundbeitrag",
  ADDITIONAL: "Zusatzbeitrag einer Abteilung",
  FAMILY: "Familienbeitrag",
  ADMISSION: "Aufnahmegebühr (einmalig)",
};

/** Ohne Status, Alter und Abteilung: Aufnahmegebühr (beim Eintritt) und Familienbeitrag (für die Familie). */
export const kindWithoutRules = (kind: string) => kind === "ADMISSION" || kind === "FAMILY";

/**
 * „Ab wie vielen zahlenden Mitgliedern“ beim Familienbeitrag: 2 bis 10. Geprüft wird nur beim Familienbeitrag – bei
 * anderen Arten ist das Feld ausgeblendet und darf kein unsichtbares Hindernis sein.
 */
const familyMinMembers = z
  .string()
  .trim()
  .max(20)
  .optional()
  .transform((value) => (value ? value : undefined));

export const familyMinMembersValid = (value: string | undefined) =>
  value !== undefined && /^\d{1,2}$/.test(value) && Number(value) >= 2 && Number(value) <= 10;
export const FAMILY_MIN_MESSAGE = "Bitte eine Zahl zwischen 2 und 10 eingeben.";

export const FEE_INTERVALS = ["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"] as const;
export const FEE_INTERVAL_LABEL: Record<(typeof FEE_INTERVALS)[number] | "ONCE", string> = {
  MONTHLY: "im Monat",
  QUARTERLY: "im Quartal",
  HALF_YEARLY: "im Halbjahr",
  YEARLY: "im Jahr",
  ONCE: "einmalig",
};

export const MEMBER_STATUSES = ["ACTIVE", "PASSIVE", "HONORARY", "BLOCKED"] as const;

export const PAYMENT_METHODS = ["TRANSFER", "DIRECT_DEBIT", "CASH"] as const;
export const PAYMENT_METHOD_LABEL: Record<(typeof PAYMENT_METHODS)[number], string> = {
  TRANSFER: "Überweisung",
  DIRECT_DEBIT: "Lastschrift",
  CASH: "Bar",
};

const ruleFields = {
  name: z.string().trim().min(1, "Bitte gib der Beitragsart einen Namen.").max(60),
  departmentId: optionalId,
  statuses: z.array(z.enum(MEMBER_STATUSES)).max(4),
  minAge: optionalAge,
  maxAge: optionalAge,
  familyMinMembers,
  description: z.string().trim().max(300).optional(),
};

function checkAges(data: { minAge?: string; maxAge?: string }, ctx: z.RefinementCtx) {
  if (
    data.minAge !== undefined &&
    data.maxAge !== undefined &&
    Number(data.minAge) > Number(data.maxAge)
  )
    ctx.addIssue({
      code: "custom",
      path: ["maxAge"],
      message: "„bis“ muss mindestens so groß sein wie „von“.",
    });
}

/** Neue Beitragsart mit erstem Betrag. */
export const feeTypeCreateSchema = z
  .object({
    ...ruleFields,
    kind: z.enum(FEE_KINDS),
    amount: feeAmount,
    interval: z.enum([...FEE_INTERVALS, "ONCE"]),
    validFrom: calendarDate,
  })
  .superRefine((data, ctx) => {
    // Aufnahmegebühr und Familienbeitrag: Status, Alter und Abteilung spielen keine Rolle (ausgeblendet, nicht geprüft).
    if (!kindWithoutRules(data.kind)) checkAges(data, ctx);
    if (data.kind === "FAMILY" && !familyMinMembersValid(data.familyMinMembers))
      ctx.addIssue({
        code: "custom",
        path: ["familyMinMembers"],
        message:
          data.familyMinMembers === undefined
            ? "Bitte angeben, ab wie vielen Mitgliedern der Familienbeitrag gilt."
            : FAMILY_MIN_MESSAGE,
      });
    if (data.kind === "ADDITIONAL" && !data.departmentId)
      ctx.addIssue({
        code: "custom",
        path: ["departmentId"],
        message: "Ein Zusatzbeitrag gehört zu einer Abteilung.",
      });
    if ((data.kind === "ADMISSION") !== (data.interval === "ONCE"))
      ctx.addIssue({
        code: "custom",
        path: ["interval"],
        message:
          data.kind === "ADMISSION"
            ? "Eine Aufnahmegebühr ist einmalig."
            : "„Einmalig“ gibt es nur bei der Aufnahmegebühr.",
      });
  });
export type FeeTypeCreateInput = z.input<typeof feeTypeCreateSchema>;

/** Regeln einer Beitragsart ändern (Art bleibt; Beträge über „Neuer Betrag ab …“). Ob die Altersgrenzen zählen, weiß erst
 * der Dienst (er kennt die Art) – ausgeblendete Felder kommen leer. */
export const feeTypeUpdateSchema = z
  .object({ id, ...ruleFields })
  .superRefine((data, ctx) => checkAges(data, ctx));
export type FeeTypeUpdateInput = z.input<typeof feeTypeUpdateSchema>;

/** „Neuer Betrag ab …“. */
export const feeRateSchema = z.object({
  feeTypeId: id,
  amount: feeAmount,
  interval: z.enum([...FEE_INTERVALS, "ONCE"]),
  validFrom: calendarDate,
});
export type FeeRateInput = z.input<typeof feeRateSchema>;

/** Reihenfolge der Grundbeiträge: eine Stelle nach oben oder unten. */
export const feeTypeMoveSchema = z.object({ id, direction: z.enum(["up", "down"]) });

export const feeTypeArchiveSchema = z.object({ id, archived: z.boolean() });
export const feeRateDeleteSchema = z.object({ id });

/** Zahler und Zahlweg eines Mitglieds. */
export const memberFinanceSchema = z.object({
  memberId: id,
  payerMemberId: optionalId,
  paymentMethod: z.enum(PAYMENT_METHODS),
  note: z.string().trim().max(500).optional(),
});
export type MemberFinanceInput = z.input<typeof memberFinanceSchema>;

export const ASSIGNMENT_KINDS = ["DISCOUNT_PERCENT", "EXEMPT", "FIXED_AMOUNT", "ASSIGN"] as const;
export const ASSIGNMENT_KIND_LABEL: Record<(typeof ASSIGNMENT_KINDS)[number], string> = {
  DISCOUNT_PERCENT: "Ermäßigung in Prozent",
  EXEMPT: "Beitragsfrei",
  FIXED_AMOUNT: "Fester Betrag je Monat",
  ASSIGN: "Feste Beitragsart",
};

/** Ermäßigung, Befreiung, fester Betrag oder feste Beitragsart – mit Zeitraum und Grund. */
export const assignmentSchema = z
  .object({
    memberId: id,
    kind: z.enum(ASSIGNMENT_KINDS),
    feeTypeId: optionalId,
    percent: z.string().trim().max(6).optional(),
    amount: z.string().trim().max(30).optional(),
    validFrom: calendarDate,
    validTo: optionalCalendarDate,
    reason: z.string().trim().max(140).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.kind === "DISCOUNT_PERCENT") {
      const percent = Number((data.percent ?? "").replace(",", "."));
      if (!data.percent || !Number.isFinite(percent) || percent <= 0 || percent > 100)
        ctx.addIssue({
          code: "custom",
          path: ["percent"],
          message: "Bitte gib die Ermäßigung in Prozent ein (z. B. 50).",
        });
    }
    if (data.kind === "FIXED_AMOUNT") {
      const cents = data.amount ? parseEuroToCents(data.amount) : null;
      if (cents === null || cents <= 0)
        ctx.addIssue({
          code: "custom",
          path: ["amount"],
          message: "Bitte gib den Betrag je Monat ein (z. B. 8,00).",
        });
    }
    if (data.kind === "ASSIGN" && !data.feeTypeId)
      ctx.addIssue({
        code: "custom",
        path: ["feeTypeId"],
        message: "Bitte wähle eine Beitragsart.",
      });
    if (data.kind !== "ASSIGN" && (data.reason ?? "").trim().length < 2)
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "Bitte gib kurz den Grund an (z. B. Übungsleiterin).",
      });
    if (data.validTo && data.validTo < data.validFrom)
      ctx.addIssue({ code: "custom", path: ["validTo"], message: "„bis“ liegt vor „ab“." });
  });
export type AssignmentInput = z.input<typeof assignmentSchema>;

/** Regel beenden (letzter Tag). */
export const assignmentEndSchema = z.object({ id, validTo: calendarDate });

/** Regel entfernen (nur noch nicht gültig oder heute angelegt). */
export const assignmentDeleteSchema = z.object({ id });

// ---------------------------------------------------------------------------------------------
// Familien
// ---------------------------------------------------------------------------------------------

const familyName = z.string().trim().min(1, "Bitte gib der Familie einen Namen.").max(80);
const familyFeeType = z.string().trim().min(1, "Bitte wähle den Familienbeitrag.").max(64);
const familyPayer = z.string().trim().min(1, "Bitte wähle, wer für die Familie zahlt.").max(64);

/** „Familie anlegen“: Name, Familienbeitrag, Zahler, Mitglieder ab einem Tag. */
export const familyCreateSchema = z
  .object({
    name: familyName,
    feeTypeId: familyFeeType,
    payerMemberId: familyPayer,
    memberIds: z
      .array(id)
      .min(2, "Eine Familie hat mindestens zwei Mitglieder.")
      .max(20, "Höchstens 20 Mitglieder je Familie."),
    validFrom: calendarDate,
  })
  .superRefine((data, ctx) => {
    if (new Set(data.memberIds).size !== data.memberIds.length)
      ctx.addIssue({
        code: "custom",
        path: ["memberIds"],
        message: "Jedes Mitglied nur einmal.",
      });
  });
export type FamilyCreateInput = z.input<typeof familyCreateSchema>;

/** Name, Familienbeitrag und Zahler ändern (Mitglieder einzeln hinzufügen bzw. austragen). */
export const familyUpdateSchema = z.object({
  id,
  name: familyName,
  feeTypeId: familyFeeType,
  payerMemberId: familyPayer,
});
export type FamilyUpdateInput = z.input<typeof familyUpdateSchema>;

/** Mitglied ab einem Tag zur Familie hinzufügen. */
export const familyMemberAddSchema = z.object({
  familyId: id,
  memberId: z.string().trim().min(1, "Bitte wähle ein Mitglied.").max(64),
  validFrom: calendarDate,
});
export type FamilyMemberAddInput = z.input<typeof familyMemberAddSchema>;

/** Mitglied austragen: letzter Tag in der Familie. */
export const familyMemberEndSchema = z.object({ id, validTo: calendarDate });

/** Versehentlich hinzugefügt (noch nicht gültig oder heute): ganz entfernen. */
export const familyMemberDeleteSchema = z.object({ id });

/** Familie auflösen: letzter Tag für alle Mitglieder. */
export const familyDissolveSchema = z.object({ id, validTo: calendarDate });

export const PRO_RATA_ENTRY_LABEL = {
  DAY: "ab dem Eintrittstag (tagesgenau)",
  MONTH_START: "ab dem Monat des Eintritts (ganzer Monat)",
  NEXT_MONTH: "ab dem Folgemonat",
  NONE: "für den ganzen Zeitraum",
} as const;
export const PRO_RATA_EXIT_LABEL = {
  DAY: "bis zum Austrittstag (tagesgenau)",
  MONTH_END: "bis zum Ende des Austrittsmonats",
  PERIOD_END: "bis zum Ende des Zeitraums",
} as const;
export const AGE_RULE_LABEL = {
  EXACT_DAY: "genau ab dem Geburtstag",
  PERIOD_START: "Alter zu Beginn des Zeitraums",
  CALENDAR_YEAR: "nach Jahrgang (Alter im Kalenderjahr)",
} as const;

/** Einstellungen für Beiträge (Seite „Konten und Kategorien“). */
export const feeSettingsSchema = z.object({
  feeInterval: z.enum(FEE_INTERVALS),
  dueDay: z
    .string()
    .trim()
    .refine(
      (value) => /^\d{1,2}$/.test(value) && Number(value) >= 1 && Number(value) <= 28,
      "Bitte einen Tag zwischen 1 und 28 wählen.",
    ),
  proRataEntry: z.enum(["DAY", "MONTH_START", "NEXT_MONTH", "NONE"]),
  proRataExit: z.enum(["DAY", "MONTH_END", "PERIOD_END"]),
  ageRule: z.enum(["EXACT_DAY", "PERIOD_START", "CALENDAR_YEAR"]),
  missingBirthDateAsAdult: z.boolean(),
});
export type FeeSettingsInput = z.input<typeof feeSettingsSchema>;
