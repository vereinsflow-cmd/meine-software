import { z } from "zod";
import { parseCalendarDate } from "@/lib/dates";
import { MAX_AMOUNT_CENTS, parseEuroToCents, parseSignedEuroToCents } from "@/lib/money";
import { amountText, checkAmount } from "./schemas";

/**
 * Eingaben rund ums Kassenbuch (Browser und Server, ohne Server-Code). Beträge kommen als Text („1.234,56“) und sind immer
 * positiv – ob Einnahme oder Ausgabe, sagt die Wahl darüber. In Cent umgerechnet wird im Dienst (`parseEuroToCents`).
 */

const id = z.string().trim().min(1).max(64);
const accountRef = z.string().trim().min(1, "Bitte wähle ein Konto.").max(64);
const optionalId = z
  .string()
  .trim()
  .max(64)
  .optional()
  .transform((value) => (value ? value : undefined));

/** Pflichtdatum „JJJJ-MM-TT“. */
export const calendarDateText = z
  .string()
  .trim()
  .refine((value) => parseCalendarDate(value) !== null, "Bitte gib ein gültiges Datum ein.");

/** Anfangsbestand: darf 0 sein und – beim Bankkonto – negativ (überzogen, „-250,00“). */
export const openingAmountText = z
  .string()
  .trim()
  .max(30)
  .optional()
  .transform((value) => (value ? value : undefined))
  .refine((value) => {
    if (value === undefined) return true;
    const cents = parseSignedEuroToCents(value);
    return cents !== null && Math.abs(cents) <= MAX_AMOUNT_CENTS;
  }, "Bitte gib einen gültigen Betrag ein (z. B. 1.250,00).");

/** „Konten einrichten“ beim ersten Besuch des Kassenbuchs. */
export const ledgerSetupSchema = z
  .object({
    ledgerStartDate: calendarDateText,
    bankName: z.string().trim().min(1, "Bitte gib dem Konto einen Namen.").max(60),
    bankInstitute: z.string().trim().max(60).optional(),
    bankOpening: openingAmountText,
    withCash: z.boolean(),
    cashName: z.string().trim().max(60).optional(),
    cashOpening: openingAmountText,
  })
  .superRefine((data, ctx) => {
    if (data.withCash && !data.cashName?.trim())
      ctx.addIssue({
        code: "custom",
        path: ["cashName"],
        message: "Bitte gib der Kasse einen Namen.",
      });
    if (data.withCash && data.cashOpening && (parseSignedEuroToCents(data.cashOpening) ?? 0) < 0)
      ctx.addIssue({
        code: "custom",
        path: ["cashOpening"],
        message: "Eine Barkasse kann nicht im Minus sein.",
      });
    if (data.withCash && data.cashName?.trim() === data.bankName.trim())
      ctx.addIssue({
        code: "custom",
        path: ["cashName"],
        message: "Bank und Kasse brauchen verschiedene Namen.",
      });
  });
export type LedgerSetupInput = z.input<typeof ledgerSetupSchema>;

export const ENTRY_KINDS = ["INCOME", "EXPENSE"] as const;
export type EntryKindValue = (typeof ENTRY_KINDS)[number];

export const ENTRY_KIND_LABEL: Record<EntryKindValue, string> = {
  INCOME: "Einnahme",
  EXPENSE: "Ausgabe",
};

const lineSchema = z.object({
  categoryId: z.string().trim().min(1, "Bitte wähle eine Kategorie.").max(64),
  amount: amountText,
  /** Abteilung oder Veranstaltung („a:<id>“ bzw. „v:<id>“) – höchstens eins. */
  target: z.string().trim().max(80).optional(),
  note: z.string().trim().max(200).optional(),
});

const entryObject = z.object({
  kind: z.enum(ENTRY_KINDS),
  accountId: accountRef,
  bookingDate: calendarDateText,
  description: z
    .string()
    .trim()
    .min(1, "Bitte beschreibe die Buchung kurz (z. B. „Hallenmiete Oktober“).")
    .max(200),
  counterparty: z.string().trim().max(140).optional(),
  counterpartyMemberId: optionalId,
  /** Bezahlte Rechnung („Ins Kassenbuch“): Zeilen verweisen auf sie, die Rechnung wird als Beleg angehängt. */
  invoiceId: optionalId,
  lines: z.array(lineSchema).min(1).max(20),
});

function checkLines(data: { lines: { amount?: string }[] }, ctx: z.RefinementCtx) {
  data.lines.forEach((line, index) => checkAmount(line.amount, ctx, ["lines", index, "amount"]));
  const total = data.lines.reduce(
    (sum, line) => sum + (parseEuroToCents(line.amount ?? "") ?? 0),
    0,
  );
  if (total > MAX_AMOUNT_CENTS)
    ctx.addIssue({
      code: "custom",
      path: ["lines", 0, "amount"],
      message: "Die Buchung ist zu hoch (höchstens 10 Mio. € zusammen).",
    });
}

/** „Neue Buchung“ (Einnahme oder Ausgabe), auch aufgeteilt auf mehrere Kategorien. */
export const entrySchema = entryObject.superRefine(checkLines);
export type EntryInput = z.input<typeof entrySchema>;
export type EntryData = z.output<typeof entrySchema>;

const reasonText = z.string().trim().min(3, "Bitte gib kurz den Grund an.").max(140);

/** Storno (mit Grund) und Korrektur (Storno + neue Buchung). */
export const reverseSchema = z.object({ id, reason: reasonText });

/** Fenster „Korrigieren“: die neue Buchung und der Grund der Korrektur. */
export const correctionFormSchema = entryObject
  .extend({ reason: reasonText })
  .superRefine(checkLines);
export type CorrectionFormInput = z.input<typeof correctionFormSchema>;

/** Umbuchung zwischen zwei Konten (z. B. Bargeld zur Bank gebracht). */
export const transferSchema = z
  .object({
    fromAccountId: accountRef,
    toAccountId: accountRef,
    bookingDate: calendarDateText,
    amount: amountText,
    description: z.string().trim().max(200).optional(),
  })
  .superRefine((data, ctx) => {
    checkAmount(data.amount, ctx, ["amount"]);
    if (data.fromAccountId === data.toAccountId)
      ctx.addIssue({
        code: "custom",
        path: ["toAccountId"],
        message: "Bitte wähle ein anderes Konto.",
      });
  });
export type TransferInput = z.input<typeof transferSchema>;

/** Ziel einer Zeile („a:<id>“ Abteilung, „v:<id>“ Veranstaltung) zerlegen. */
export function parseTarget(target: string | undefined): {
  departmentId: string | null;
  eventId: string | null;
} {
  if (target?.startsWith("a:")) return { departmentId: target.slice(2), eventId: null };
  if (target?.startsWith("v:")) return { departmentId: null, eventId: target.slice(2) };
  return { departmentId: null, eventId: null };
}

/** Eigenbeleg: Es gibt keinen Beleg – kurz festhalten, was bezahlt wurde und warum. */
export const receiptNoteSchema = z.object({
  entryId: id,
  note: z
    .string()
    .trim()
    .min(3, "Bitte beschreibe kurz, was bezahlt wurde und warum es keinen Beleg gibt.")
    .max(500, "Bitte fasse dich kürzer (höchstens 500 Zeichen)."),
});

/** Einen angehängten Beleg entfernen. */
export const attachmentIdSchema = z.object({ id });

/** „Anfangsbestand korrigieren“ (nur solange der Beginn des Kassenbuchs nicht abgeschlossen ist). */
export const openingSchema = z
  .object({ accountId: accountRef, amount: openingAmountText })
  .superRefine((data, ctx) => {
    if (data.amount === undefined)
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "Bitte gib den Anfangsbestand ein (0 ist erlaubt).",
      });
  });
export type OpeningInput = z.input<typeof openingSchema>;

/** Monatsabschluss: welcher Monat („2026-09“) – zur Sicherheit gegen doppeltes Klicken – und eine freiwillige Notiz. */
export const closePeriodSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Bitte wähle einen Monat."),
  note: z.string().trim().max(500).optional(),
});

/** Kassensturz: gezählter Betrag, optional die Zählhilfe (Anzahl je Schein/Münze), Grund bei einer Differenz. */
export const cashCountSchema = z.object({
  accountId: accountRef,
  counted: z
    .string()
    .trim()
    .min(1, "Bitte gib den gezählten Betrag ein.")
    .max(30)
    .refine((value) => {
      const cents = parseEuroToCents(value);
      return cents !== null && cents >= 0 && cents <= 100_000_000;
    }, "Bitte gib einen gültigen Betrag ein (z. B. 239,80)."),
  denominations: z
    .record(z.string().regex(/^\d{1,5}$/), z.number().int().min(0).max(100_000))
    .optional(),
  note: z.string().trim().max(500).optional(),
});
export type CashCountInput = z.input<typeof cashCountSchema>;

const SPHERES = ["NON_PROFIT", "ASSET_MANAGEMENT", "PURPOSE_OPERATION", "COMMERCIAL"] as const;
const ACCOUNT_KINDS = ["BANK", "CASH", "OTHER"] as const;
const accountName = z.string().trim().min(1, "Bitte gib dem Konto einen Namen.").max(60);
const categoryName = z.string().trim().min(1, "Bitte gib der Kategorie einen Namen.").max(60);

/** „Konto hinzufügen“ – mit Anfangsbestand, solange der Beginn des Kassenbuchs offen ist. */
export const accountCreateSchema = z
  .object({
    name: accountName,
    kind: z.enum(ACCOUNT_KINDS),
    bankName: z.string().trim().max(60).optional(),
    opening: openingAmountText,
  })
  .superRefine((data, ctx) => {
    if (data.kind === "CASH" && data.opening && (parseSignedEuroToCents(data.opening) ?? 0) < 0)
      ctx.addIssue({
        code: "custom",
        path: ["opening"],
        message: "Eine Barkasse kann nicht im Minus sein.",
      });
  });
export type AccountCreateInput = z.input<typeof accountCreateSchema>;

/** Konto umbenennen bzw. Bank ändern. */
export const accountUpdateSchema = z.object({
  id,
  name: accountName,
  bankName: z.string().trim().max(60).optional(),
});
export type AccountUpdateInput = z.input<typeof accountUpdateSchema>;

/** Kategorie anlegen (Art steht danach fest). */
export const categoryCreateSchema = z.object({
  name: categoryName,
  direction: z.enum(["INCOME", "EXPENSE"]),
  sphere: z.enum(SPHERES),
  hint: z.string().trim().max(60).optional(),
});
export type CategoryCreateInput = z.input<typeof categoryCreateSchema>;

/** Kategorie umbenennen, Bereich ändern (gilt für neue Buchungen), Hinweis. */
export const categoryUpdateSchema = z.object({
  id,
  name: categoryName,
  sphere: z.enum(SPHERES),
  hint: z.string().trim().max(60).optional(),
});
export type CategoryUpdateInput = z.input<typeof categoryUpdateSchema>;

/** Archivieren bzw. wieder aktivieren. */
export const archiveSchema = z.object({ id, archived: z.boolean() });
