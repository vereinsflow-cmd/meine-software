import Link from "next/link";
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
import type { ChargeRow } from "../run";
import { CHARGE_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "../schemas";
import { VoidChargeDialog } from "./run-actions";

/** Status als Text („offen“, „überfällig“, „bezahlt“, „gestrichen“). */
export function chargeStatusText(charge: ChargeRow): string {
  if (charge.overdue) return "überfällig";
  if (charge.status === "OPEN" && charge.openCents < charge.amountCents) return "teilweise bezahlt";
  return CHARGE_STATUS_LABEL[charge.status];
}

/** Liste von Beiträgen: Nummer, Mitglied (mit Zahler), Zeitraum, Fälligkeit, Betrag, offen, Status. */
export function ChargesTable({
  charges,
  caption,
  canManage,
}: {
  charges: ChargeRow[];
  caption: string;
  canManage: boolean;
}) {
  return (
    <TableCard>
      <Table>
        <caption className="sr-only">{caption}</caption>
        <TableHeader>
          <TableRow>
            <TableHead>Beitrag</TableHead>
            <TableHead className="hidden md:table-cell">Zeitraum</TableHead>
            <TableHead className="hidden sm:table-cell">Fällig</TableHead>
            <TableHead className="text-right">Betrag</TableHead>
            <TableHead className="hidden text-right lg:table-cell">Offen</TableHead>
            <TableHead className="hidden sm:table-cell">Status</TableHead>
            {canManage && (
              <TableHead className="w-12">
                <span className="sr-only">Aktionen</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {charges.map((charge) => {
            const status = chargeStatusText(charge);
            return (
              <TableRow
                key={charge.id}
                className={cn(charge.status === "VOID" && "text-muted-foreground")}
              >
                <TableCell className="align-top whitespace-normal">
                  <Link
                    href={`/finanzen/beitraege/${charge.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {charge.debtorName}
                  </Link>
                  <span className="block text-sm text-muted-foreground tabular-nums">
                    {charge.number}
                    {charge.payerMemberId !== charge.memberId || charge.familyId
                      ? ` · zahlt: ${charge.payerName}`
                      : ""}
                  </span>
                  <span className="block text-sm text-muted-foreground sm:hidden">
                    fällig {formatCalendarDate(charge.dueDate)} · {status}
                  </span>
                </TableCell>
                <TableCell className="hidden align-top md:table-cell">
                  {charge.periodLabel ?? "–"}
                  <span className="block text-sm text-muted-foreground">
                    {PAYMENT_METHOD_LABEL[charge.paymentMethod]}
                  </span>
                </TableCell>
                <TableCell className="hidden align-top tabular-nums sm:table-cell">
                  {formatCalendarDate(charge.dueDate)}
                </TableCell>
                <TableCell className="text-right align-top font-semibold tabular-nums">
                  {formatEuroFromCents(charge.amountCents)}
                </TableCell>
                <TableCell className="hidden text-right align-top tabular-nums lg:table-cell">
                  {charge.status === "OPEN" ? formatEuroFromCents(charge.openCents) : "–"}
                </TableCell>
                <TableCell
                  className={cn(
                    "hidden align-top sm:table-cell",
                    charge.overdue && "font-medium text-amber-700 dark:text-amber-400",
                  )}
                >
                  {status}
                </TableCell>
                {canManage && (
                  <TableCell className="text-right align-top">
                    {charge.status === "OPEN" && charge.openCents === charge.amountCents && (
                      <VoidChargeDialog id={charge.id} number={charge.number} variant="ghost" />
                    )}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableCard>
  );
}
