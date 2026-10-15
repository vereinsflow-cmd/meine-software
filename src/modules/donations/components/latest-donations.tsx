import { formatCalendarDate, formatEuroFromCents } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { FREE_PURPOSE } from "../format";
import type { DonationRowDto } from "../summary";
import { ReceiptStateBadge } from "./receipt-state-badge";

/** Zweck in der Spalte „Zweck“: Text, Abteilung oder Veranstaltung – sonst „frei“. */
export const purposeText = (row: DonationRowDto) => row.purpose.label ?? FREE_PURPOSE;

/** Name und darunter die Art des Spenders („Mitglied“, „Firma“, „ohne Namen“ …). */
export function DonorCell({ row, className }: { row: DonationRowDto; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="font-medium break-words">{row.name || "Ohne Namen"}</p>
      <p className="text-xs break-words text-muted-foreground">{row.typeLabel}</p>
    </div>
  );
}

/**
 * „Letzte Spenden“ der Seite (die fünf neuesten): ab `md` eine ruhige Tabelle Datum · Spender · Zweck · Bestätigung · Betrag,
 * am Handy eine Liste (Name und Betrag oben, Datum · Zweck und Schild darunter) – wie im Entwurf.
 */
export function LatestDonations({ rows, caption }: { rows: DonationRowDto[]; caption: string }) {
  return (
    <>
      <table className="hidden w-full text-left text-sm md:table">
        <caption className="sr-only">{caption}</caption>
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th scope="col" className="py-2 pr-4 font-medium">
              Datum
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Spender
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Zweck
            </th>
            <th scope="col" className="py-2 pr-4 font-medium">
              Bestätigung
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              Betrag
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.key}>
              <td className="py-2.5 pr-4 whitespace-nowrap text-muted-foreground tabular-nums">
                {formatCalendarDate(row.receivedOn)}
              </td>
              <td className="py-2.5 pr-4">
                <DonorCell row={row} />
              </td>
              <td className="py-2.5 pr-4 break-words">{purposeText(row)}</td>
              <td className="py-2.5 pr-4">
                <ReceiptStateBadge state={row.state} issuedOn={row.issuedOn} />
              </td>
              <td className="py-2.5 text-right font-semibold whitespace-nowrap tabular-nums">
                {formatEuroFromCents(row.amountCents)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="grid md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li
            key={row.key}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-t py-3 first:border-t-0 first:pt-1"
          >
            <p className="font-medium break-words">{row.name || "Ohne Namen"}</p>
            <p className="text-right font-semibold whitespace-nowrap tabular-nums">
              {formatEuroFromCents(row.amountCents)}
            </p>
            <p className="min-w-0 break-words text-muted-foreground">
              <span className="tabular-nums">{formatCalendarDate(row.receivedOn)}</span> ·{" "}
              {purposeText(row)}
              <span className="sr-only">, {row.typeLabel}</span>
            </p>
            <ReceiptStateBadge
              state={row.state}
              issuedOn={row.issuedOn}
              className="justify-self-end"
            />
          </li>
        ))}
      </ul>
    </>
  );
}
