import { z } from "zod";
import { parseEuroToCents } from "@/lib/money";
import { amountText, checkAmount, dueDateText, invoiceEditSchema } from "@/modules/finance/schemas";

export const ACCESS_LEVELS = ["ALL_MEMBERS", "BOARD", "ADMIN", "FINANCE"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const ACCESS_LABEL: Record<AccessLevel, string> = {
  ALL_MEMBERS: "Alle Mitglieder",
  BOARD: "Nur Vorstand",
  ADMIN: "Nur Verwaltung",
  // Belege im Kassenbuch: sieht, wer die Finanzen ansehen darf (Kassenwart, Vorstand, Verwaltung).
  FINANCE: "Nur Finanzen",
};

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} ist zu lang (höchstens ${max} Zeichen).`)
    .optional()
    .transform((value) => (value ? value : undefined));

const optionalId = z
  .string()
  .max(64)
  .optional()
  .transform((value) => (value ? value : undefined));

/** Kästchen aus einem Formular (multipart): angehakt kommt „on“ (bzw. „true“/„1“), sonst fehlt es ganz. */
const formCheckbox = z
  .string()
  .optional()
  .transform((value) => value === "on" || value === "true" || value === "1");

/**
 * Angaben zum Upload (die Datei selbst kommt als Formular-Datei und wird auf dem Server geprüft).
 * Rechnung: `isInvoice`; „muss noch bezahlt werden“ (`paymentDue`) verlangt einen Betrag, die Fälligkeit ist freiwillig.
 * Ergebnis `invoice` ist `null` für normale Dokumente.
 */
export const uploadMetaSchema = z
  .object({
    category: optionalText(60, "Die Kategorie"),
    access: z.enum(ACCESS_LEVELS),
    eventId: optionalId,
    isInvoice: formCheckbox,
    paymentDue: formCheckbox,
    amount: amountText,
    dueDate: dueDateText,
  })
  .superRefine((data, ctx) => {
    if (data.isInvoice && data.paymentDue) checkAmount(data.amount, ctx, ["amount"]);
  })
  .transform(({ isInvoice, paymentDue, amount, dueDate, ...meta }) => ({
    ...meta,
    invoice: isInvoice
      ? paymentDue
        ? { status: "OPEN" as const, amountCents: parseEuroToCents(amount!), dueDate }
        : { status: "PAID" as const, amountCents: null, dueDate: undefined }
      : null,
  }));
export type UploadMeta = z.output<typeof uploadMetaSchema>;

export const documentFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Bitte gib einen Namen ein.")
    .max(120, "Der Name ist zu lang (höchstens 120 Zeichen)."),
  category: optionalText(60, "Die Kategorie"),
  access: z.enum(ACCESS_LEVELS),
  /** Nur bei Rechnungen und nur für Berechtigte (`finance:manage`) – sonst fehlt der Teil. */
  invoice: invoiceEditSchema.optional(),
});
export type DocumentFormInput = z.input<typeof documentFormSchema>;
export type DocumentInput = z.output<typeof documentFormSchema>;

export const idSchema = z.object({ id: z.string().min(1).max(64) });
