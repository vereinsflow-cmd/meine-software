import { ToneBadge } from "@/components/shared/status-badge";
import { formatDate, formatEuroFromCents } from "@/lib/dates";
import type { DocumentInvoice } from "@/modules/documents/service";
import { dueText } from "../invoice-format";

/**
 * Zahlungsstand einer Rechnung als Abzeichen: „Offen · 149,90 €“ (überfällig rot, sonst Bernstein) bzw. „Bezahlt“.
 * Die Bedeutung steht immer im Text, die Farbe hilft nur beim Erkennen.
 */
/** Lange Hinweise („… seit 3 Tagen überfällig“) dürfen umbrechen, statt in die Nachbarspalte zu ragen. */
const WRAP = "h-auto justify-start rounded-xl py-0.5 text-left tabular-nums whitespace-normal";

export function InvoiceBadge({ invoice }: { invoice: DocumentInvoice }) {
  if (invoice.status === "PAID")
    return (
      <ToneBadge tone="success" className={WRAP}>
        Rechnung · bezahlt
        {/* paidAt ist ein Zeitpunkt (kein Kalendertag) – daher in Berliner Zeit. */}
        {invoice.paidAt ? ` am ${formatDate(invoice.paidAt)}` : ""}
      </ToneBadge>
    );
  const due = dueText(invoice.dueInDays);
  return (
    <ToneBadge tone={invoice.overdue ? "danger" : "warning"} className={WRAP}>
      Rechnung · offen
      {invoice.amountCents !== null ? ` · ${formatEuroFromCents(invoice.amountCents)}` : ""}
      {due ? ` · ${due}` : ""}
    </ToneBadge>
  );
}
