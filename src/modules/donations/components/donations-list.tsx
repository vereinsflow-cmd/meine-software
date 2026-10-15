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
import { rowActionData } from "../row-action-data";
import { DonationRowActions } from "./donation-row-actions";
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
 * Liste „Alle Spenden“ im ruhigen Stil des Kassenbuchs: Spender · Datum und Nummer · Art und Zweck · Bestätigung · Betrag ·
 * „⋯“. Am Handy gestapelt (`<Table stack>`): jede Spende eine kleine Karte, der Spender als Titel, darunter die übrigen
 * Angaben als Zeilen. Stornierte stehen grau mit durchgestrichenem Betrag.
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
    <TableCard>
      <Table stack>
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Spender</TableHead>
            <TableHead scope="col" className="w-28">
              Datum
            </TableHead>
            <TableHead scope="col" className="md:max-lg:hidden">
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
            <TableRow key={row.key} className={cn(row.state === "VOID" && "text-muted-foreground")}>
              <TableCell className="align-top whitespace-normal">
                <DonorCell row={row} />
                {/* Zwischen 768 und 1024 px fehlt die Spalte „Art und Zweck“ – dann steht sie hier. */}
                <span className="mt-0.5 hidden text-sm break-words text-muted-foreground md:max-lg:block">
                  {kindAndPurpose(row)}
                </span>
              </TableCell>
              <TableCell label="Datum" className="align-top tabular-nums">
                <span className="block">{formatCalendarDate(row.receivedOn)}</span>
                {row.entry && (
                  <span className="block text-xs text-muted-foreground">Nr. {row.entry.label}</span>
                )}
              </TableCell>
              <TableCell
                label="Art und Zweck"
                className="align-top whitespace-normal md:max-lg:hidden"
              >
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
              <TableCell label="Bestätigung" className="align-top whitespace-normal">
                <ReceiptStateBadge state={row.state} issuedOn={row.issuedOn} />
                <StateNote row={row} />
              </TableCell>
              <TableCell
                label="Betrag"
                className="text-right align-top font-semibold whitespace-nowrap tabular-nums"
              >
                <Amount row={row} />
              </TableCell>
              {canManage && (
                <TableCell className="text-right align-top max-md:mt-1">
                  <DonationRowActions row={rowActionData(row)} />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableCard>
  );
}
