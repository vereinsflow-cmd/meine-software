import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableCard } from "@/components/shared/table-card";
import { formatCalendarDate, formatEuroFromCents } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { DONATION_KIND_LABEL } from "../format";
import type { DonationRowDto } from "../summary";
import { DonationRowActions, rowActionData } from "./donation-row-actions";
import { DonorCell, purposeText } from "./latest-donations";
import { ReceiptStateBadge } from "./receipt-state-badge";

/** „Geldspende · frei“, „Sachspende · Jugendabteilung“. */
const kindAndPurpose = (row: DonationRowDto) =>
  `${DONATION_KIND_LABEL[row.kind]} · ${purposeText(row)}`;

/** Betrag; storniert durchgestrichen (und für Screenreader gesagt). */
function Amount({ row }: { row: DonationRowDto }) {
  const voided = row.state === "VOID";
  return (
    <>
      <span className={cn(voided && "text-muted-foreground line-through")}>
        {formatEuroFromCents(row.amountCents)}
      </span>
      {voided && <span className="sr-only"> (storniert)</span>}
    </>
  );
}

/** Was unter dem Schild steht: Grund des Stornos bzw. die Buchung im Kassenbuch. */
function StateNote({ row }: { row: DonationRowDto }) {
  if (row.state === "VOID" && row.voidReason)
    return (
      <span className="block text-xs break-words text-muted-foreground">{row.voidReason}</span>
    );
  return null;
}

/**
 * Liste „Alle Spenden“ im ruhigen Stil des Kassenbuchs: ab `md` eine Tabelle (Datum und Nummer · Spender · Art und Zweck ·
 * Bestätigung · Betrag · „⋯“), am Handy eine Liste wie „Letzte Spenden“. Stornierte stehen grau mit durchgestrichenem Betrag.
 */
export function DonationsList({
  rows,
  canManage,
  caption,
}: {
  rows: DonationRowDto[];
  canManage: boolean;
  caption: string;
}) {
  return (
    <>
      <TableCard className="hidden md:block">
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="w-28">
                Datum
              </TableHead>
              <TableHead scope="col">Spender</TableHead>
              <TableHead scope="col" className="hidden lg:table-cell">
                Art und Zweck
              </TableHead>
              <TableHead scope="col">Bestätigung</TableHead>
              <TableHead scope="col" className="text-right">
                Betrag
              </TableHead>
              {canManage && (
                <TableHead scope="col" className="w-12">
                  <span className="sr-only">Aktionen</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.key}
                className={cn(row.state === "VOID" && "text-muted-foreground")}
              >
                <TableCell className="align-top tabular-nums">
                  <span className="block">{formatCalendarDate(row.receivedOn)}</span>
                  {row.entry && (
                    <span className="block text-xs text-muted-foreground">
                      Nr. {row.entry.label}
                    </span>
                  )}
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  <DonorCell row={row} />
                  <span className="mt-0.5 block text-sm break-words text-muted-foreground lg:hidden">
                    {kindAndPurpose(row)}
                  </span>
                </TableCell>
                <TableCell className="hidden align-top whitespace-normal lg:table-cell">
                  <span className="block">{DONATION_KIND_LABEL[row.kind]}</span>
                  <span className="block text-sm break-words text-muted-foreground">
                    {purposeText(row)}
                  </span>
                  {row.itemDescription && (
                    <span
                      title={row.itemDescription}
                      className="line-clamp-2 text-xs break-words text-muted-foreground"
                    >
                      {row.itemDescription}
                    </span>
                  )}
                </TableCell>
                <TableCell className="align-top whitespace-normal">
                  <ReceiptStateBadge state={row.state} issuedOn={row.issuedOn} />
                  <StateNote row={row} />
                </TableCell>
                <TableCell className="text-right align-top font-semibold whitespace-nowrap tabular-nums">
                  <Amount row={row} />
                </TableCell>
                {canManage && (
                  <TableCell className="text-right align-top">
                    <DonationRowActions row={rowActionData(row)} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableCard>

      <ul
        aria-label={caption}
        className="grid rounded-xl bg-card px-4 shadow-sm ring-1 ring-foreground/10 md:hidden dark:ring-foreground/15"
      >
        {rows.map((row) => (
          <li key={row.key} className="flex items-start gap-1 border-t py-3 first:border-t-0">
            <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
              <p className="font-medium break-words">{row.name || "Ohne Namen"}</p>
              <p className="text-right font-semibold whitespace-nowrap tabular-nums">
                <Amount row={row} />
              </p>
              <p className="min-w-0 break-words text-muted-foreground">
                <span className="tabular-nums">{formatCalendarDate(row.receivedOn)}</span> ·{" "}
                {row.kind === "MONEY" ? purposeText(row) : kindAndPurpose(row)}
                <span className="sr-only">, {row.typeLabel}</span>
              </p>
              <span className="justify-self-end">
                <ReceiptStateBadge state={row.state} issuedOn={row.issuedOn} />
              </span>
              {row.state === "VOID" && row.voidReason && (
                <p className="col-span-2 text-xs break-words text-muted-foreground">
                  {row.voidReason}
                </p>
              )}
            </div>
            {canManage && (
              <div className="-mr-2 shrink-0">
                <DonationRowActions row={rowActionData(row)} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
