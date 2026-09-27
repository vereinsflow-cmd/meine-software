import { formatCalendarDate } from "@/lib/dates";

/**
 * Rechnungen – reine Funktionen für Namen und Anzeige, im Browser und auf dem Server nutzbar, einzeln getestet.
 */

/** Grundname einer Rechnung nach dem Tag des Hochladens, z. B. „Rechnung vom 27.09.2026“. */
export function invoiceBaseName(invoiceDate: Date): string {
  return `Rechnung vom ${formatCalendarDate(invoiceDate)}`;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Freier Name für eine weitere Rechnung am selben Tag: „Rechnung vom 27.09.2026.pdf“, dann „… (2).pdf“, „… (3).jpg“ …
 * Gezählt wird unabhängig von der Dateiendung – eine PDF- und eine Bild-Rechnung desselben Tages heißen nie gleich.
 * `taken` sind die schon vorhandenen Namen (es genügen die, die mit dem Grundnamen beginnen).
 */
export function nextInvoiceName(base: string, ext: string, taken: readonly string[]): string {
  const pattern = new RegExp(`^${escapeRegExp(base)}(?: \\((\\d+)\\))?(?:\\.[A-Za-z0-9]{1,8})?$`);
  let highest = 0;
  for (const name of taken) {
    const match = pattern.exec(name);
    if (match) highest = Math.max(highest, match[1] ? Number(match[1]) : 1);
  }
  return highest === 0 ? `${base}.${ext}` : `${base} (${highest + 1}).${ext}`;
}

/**
 * Hinweis zur Fälligkeit (Kalendertage, 0 = heute): „heute fällig“, „morgen fällig“, „fällig in 5 Tagen“,
 * „seit 3 Tagen überfällig“. Ohne Fälligkeit `null`.
 */
export function dueText(dueInDays: number | null): string | null {
  if (dueInDays === null) return null;
  if (dueInDays === 0) return "heute fällig";
  if (dueInDays === 1) return "morgen fällig";
  if (dueInDays > 1) return `fällig in ${dueInDays} Tagen`;
  return dueInDays === -1 ? "seit gestern überfällig" : `seit ${-dueInDays} Tagen überfällig`;
}
