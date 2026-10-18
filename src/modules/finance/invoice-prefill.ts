import { z } from "zod";
import { calendarDateToInputValue, parseCalendarDate } from "@/lib/dates";
import { centsToInput, MAX_AMOUNT_CENTS } from "@/lib/money";

/**
 * Rechnung auslesen – die reinen Teile (ohne KI-Aufruf), einzeln getestet: was die KI liefern soll und wie daraus die
 * Vorschläge für das Hochlade-Fenster werden. Die Vorschläge sind nur vorausgefüllte Felder – gespeichert wird erst,
 * wenn der Mensch sie geprüft und „Hochladen“ geklickt hat.
 */

/** Antwort der KI (strukturiert, das Schema geht als JSON-Schema an die Schnittstelle). */
export const extractedInvoiceSchema = z.object({
  isInvoice: z.boolean().describe("true, wenn das Dokument eine Rechnung oder Quittung ist."),
  vendor: z
    .string()
    .nullable()
    .describe("Wer die Rechnung gestellt hat, kurz (z. B. „Telekom“, „Getränke Müller“)."),
  description: z
    .string()
    .nullable()
    .describe(
      "Was berechnet wird, in wenigen deutschen Wörtern (z. B. „Internet Oktober 2026“, „Getränke Sommerfest“).",
    ),
  totalCents: z
    .number()
    .int()
    .nullable()
    .describe("Zu zahlender Gesamtbetrag (brutto) in ganzen Cent, z. B. 149,90 € → 14990."),
  currency: z.string().nullable().describe("Währung als ISO-Code, z. B. „EUR“."),
  invoiceDate: z.string().nullable().describe("Rechnungsdatum als JJJJ-MM-TT."),
  dueDate: z
    .string()
    .nullable()
    .describe(
      "Zahlungsziel als JJJJ-MM-TT. Steht nur eine Frist da („zahlbar innerhalb 14 Tagen“), vom Rechnungsdatum aus rechnen.",
    ),
  alreadyPaid: z
    .boolean()
    .describe(
      "true nur, wenn die Rechnung ausdrücklich sagt, dass schon bezahlt ist (z. B. „Betrag dankend erhalten“, „wird abgebucht“, „bezahlt per PayPal“).",
    ),
});
export type ExtractedInvoice = z.infer<typeof extractedInvoiceSchema>;

/** Vorschläge für das Hochlade-Fenster. Leere Felder bleiben leer – dann trägt man selbst ein. */
export interface InvoicePrefill {
  /** „Telekom – Internet Oktober 2026“ (wird der Name der Rechnung) – oder leer. */
  title: string;
  /** Betrag als Eingabetext („149,90“) – oder leer. */
  amount: string;
  /** Fälligkeit für `<input type="date">` („2026-10-31“) – oder leer. */
  dueDate: string;
  /** Steht auf der Rechnung, dass sie schon bezahlt ist? */
  paid: boolean;
  /** Hinweis, wenn etwas auffällt (keine Rechnung, fremde Währung) – sonst `null`. */
  note: string | null;
}

const TITLE_MAX = 100;

function clean(text: string | null): string {
  // Keine Zeilenumbrüche, Steuerzeichen oder Schrägstriche (der Titel wird ein Dateiname).
  return (text ?? "")
    .replace(/[\u0000-\u001f\u007f/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toInvoicePrefill(extracted: ExtractedInvoice): InvoicePrefill {
  const vendor = clean(extracted.vendor);
  const description = clean(extracted.description);
  // Steht die Firma (ihr erstes Wort, z. B. „Telekom“) schon in der Beschreibung, reicht die Beschreibung.
  const vendorWord = vendor.split(" ")[0]!.toLowerCase();
  let title =
    vendor && description && !description.toLowerCase().includes(vendorWord)
      ? `${vendor} – ${description}`
      : description || vendor;
  if (title.length > TITLE_MAX) title = `${title.slice(0, TITLE_MAX - 1).trimEnd()}…`;

  const currency = clean(extracted.currency).toUpperCase();
  const foreign = currency !== "" && currency !== "EUR" && currency !== "€";
  const cents = extracted.totalCents;
  const amount =
    !foreign && cents !== null && cents > 0 && cents <= MAX_AMOUNT_CENTS ? centsToInput(cents) : "";

  const due = extracted.dueDate ? parseCalendarDate(extracted.dueDate.trim()) : null;

  return {
    title,
    amount,
    dueDate: due ? calendarDateToInputValue(due) : "",
    paid: extracted.alreadyPaid,
    note: !extracted.isInvoice
      ? "Das sieht nicht nach einer Rechnung aus – bitte prüfe die Angaben."
      : foreign
        ? `Die Rechnung ist in ${currency} – bitte trag den Betrag in Euro selbst ein.`
        : null,
  };
}
