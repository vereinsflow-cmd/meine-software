import { z } from "zod";
import { parseCalendarDate } from "@/lib/dates";
import { MAX_AMOUNT_CENTS, parseEuroToCents } from "@/lib/money";

/**
 * Eingaben rund um Rechnungen – gemeinsam für das Hochladen (Dokumente), das Bearbeiten und „Als bezahlt markieren“.
 * Beträge kommen als Text („1.234,56“) und werden erst hier in ganze Cent umgewandelt; der Server prüft immer erneut.
 */
export const INVOICE_STATUSES = ["OPEN", "PAID"] as const;
export type InvoiceStatusValue = (typeof INVOICE_STATUSES)[number];

export const INVOICE_STATUS_LABEL: Record<InvoiceStatusValue, string> = {
  OPEN: "Muss noch bezahlt werden",
  PAID: "Bezahlt",
};

export const AMOUNT_HINT = "z. B. 149,90";
const AMOUNT_MESSAGE = "Bitte gib einen gültigen Betrag ein (z. B. 149,90).";

/** Betrag als Text → ganze Cent. `null`, wenn leer oder ungültig (die Prüfung passiert in `checkAmount`). */
export const amountText = z.string().trim().max(30, AMOUNT_MESSAGE).optional();

/** Prüft einen Pflicht-Betrag und liefert die Cent – oder meldet den Fehler am Feld `path`. */
export function checkAmount(
  value: string | undefined,
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void {
  if (!value) {
    ctx.addIssue({ code: "custom", path, message: "Bitte gib den Betrag ein." });
    return;
  }
  const cents = parseEuroToCents(value);
  if (cents === null || cents <= 0) ctx.addIssue({ code: "custom", path, message: AMOUNT_MESSAGE });
  else if (cents > MAX_AMOUNT_CENTS)
    ctx.addIssue({
      code: "custom",
      path,
      message: "Der Betrag ist zu hoch (höchstens 10 Mio. €).",
    });
}

/** Fälligkeitsdatum als Kalendertag „JJJJ-MM-TT“ (optional). */
export const dueDateText = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : undefined))
  .refine(
    (value) => value === undefined || parseCalendarDate(value) !== null,
    "Bitte gib ein gültiges Datum ein.",
  );

/**
 * Rechnungsangaben im Formular „Dokument bearbeiten“ (nur für Berechtigte sichtbar). Der Betrag bleibt Text – Browser
 * und Server prüfen dieselben Eingaben (das Formular schickt das Ergebnis der Prüfung, der Server prüft es erneut);
 * in Cent umgerechnet wird erst im Dienst (`parseEuroToCents`).
 */
export const invoiceEditSchema = z
  .object({
    status: z.enum(INVOICE_STATUSES),
    amount: amountText,
    dueDate: dueDateText,
  })
  .superRefine((data, ctx) => {
    // Offen braucht einen Betrag; bei „bezahlt“ ist er freiwillig, muss aber gültig sein, wenn er dasteht.
    if (data.status === "OPEN" || data.amount) checkAmount(data.amount, ctx, ["amount"]);
  });
export type InvoiceEditInput = z.input<typeof invoiceEditSchema>;
export type InvoiceEdit = z.output<typeof invoiceEditSchema>;

/** „Als bezahlt markieren“ bzw. „wieder offen“. */
export const invoiceStatusSchema = z.object({
  id: z.string().min(1).max(64),
  status: z.enum(INVOICE_STATUSES),
});
