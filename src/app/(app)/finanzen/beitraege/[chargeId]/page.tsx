import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BackLink } from "@/components/shared/back-link";
import { NoAccess } from "@/components/shared/no-access";
import { formatCalendarDate, formatEuroFromCents } from "@/lib/dates";
import { canFinance } from "@/modules/finance/access";
import { FinanceHeader } from "@/modules/finance/components/finance-header";
import { financeTabCounts } from "@/modules/finance/overview";
import { chargeStatusText } from "@/modules/fees/components/charges-table";
import { VoidChargeDialog } from "@/modules/fees/components/run-actions";
import { PAYMENT_METHOD_LABEL } from "@/modules/fees/schemas";
import { getCharge } from "@/modules/fees/run";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Beitrag" };

/** Ein Beitrag: wer, für welchen Zeitraum, wie gerechnet (Zeilen), Stand der Zahlung; streichen, solange offen. */
export default async function ChargePage({ params }: { params: Promise<{ chargeId: string }> }) {
  const { chargeId } = await params;
  const ctx = await requirePageContext();
  if (!canFinance(ctx, "finance:read")) return <NoAccess what="die Finanzen" />;
  const canManage = canFinance(ctx, "finance:manage");
  const [charge, counts] = await Promise.all([getCharge(ctx, chargeId), financeTabCounts(ctx)]);
  if (!charge) notFound();
  const facts: [string, React.ReactNode][] = [
    [
      charge.familyId ? "Familie" : "Mitglied",
      charge.familyId ? (
        <Link
          href={`/finanzen/beitraege/familien#familie-${charge.familyId}`}
          className="underline-offset-4 hover:underline"
        >
          {charge.debtorName}
        </Link>
      ) : (
        <Link
          href={`/mitglieder/${charge.memberId}`}
          className="underline-offset-4 hover:underline"
        >
          {charge.debtorName}
        </Link>
      ),
    ],
    [
      "Zahler",
      <Link
        key="payer"
        href={`/mitglieder/${charge.payerMemberId}`}
        className="underline-offset-4 hover:underline"
      >
        {charge.payerName}
      </Link>,
    ],
    [
      "Zeitraum",
      charge.periodStart && charge.periodEnd
        ? `${charge.periodLabel ?? ""} (${formatCalendarDate(charge.periodStart)} bis ${formatCalendarDate(charge.periodEnd)})`
        : "–",
    ],
    ["Fällig am", formatCalendarDate(charge.dueDate)],
    ["Zahlweg", PAYMENT_METHOD_LABEL[charge.paymentMethod]],
    ["Status", chargeStatusText(charge)],
    ["Offen", charge.status === "OPEN" ? formatEuroFromCents(charge.openCents) : "–"],
  ];

  return (
    <>
      <FinanceHeader description={`Beitrag ${charge.number}`} counts={counts} />
      <BackLink href="/finanzen/beitraege/offen">Offene Beiträge</BackLink>
      <div className="mt-4 grid max-w-4xl gap-6">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1">
              <CardTitle role="heading" aria-level={2}>
                {charge.title}
              </CardTitle>
              <p className="text-sm text-muted-foreground tabular-nums">{charge.number}</p>
            </div>
            <p className="text-2xl font-bold tabular-nums">
              {formatEuroFromCents(charge.amountCents)}
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            <p className="text-muted-foreground">{charge.explanation}</p>
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {facts.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 sm:block">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right sm:text-left">{value}</dd>
                </div>
              ))}
            </dl>
            {charge.status === "VOID" && (
              <p>
                Gestrichen am {formatCalendarDate(charge.voidedAt!)}: {charge.voidReason}
              </p>
            )}
            {charge.feeRun && (
              <p>
                Aus dem{" "}
                <Link
                  href={`/finanzen/beitraege/laeufe/${charge.feeRun.id}`}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Beitragslauf {charge.feeRun.label}
                </Link>
                , erstellt am {formatCalendarDate(charge.createdAt)}.
              </p>
            )}
            {canManage && charge.status === "OPEN" && charge.paidCents === 0 && (
              <div>
                <VoidChargeDialog id={charge.id} number={charge.number} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={2}>
              So wird gerechnet
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <caption className="sr-only">Zeilen des Beitrags {charge.number}</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Zeile</TableHead>
                  <TableHead className="hidden sm:table-cell">Kategorie</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {charge.lines.map((line) => (
                  <TableRow key={line.id}>
                    <TableCell className="whitespace-normal">
                      {line.text}
                      <span className="block text-sm text-muted-foreground sm:hidden">
                        {line.category}
                      </span>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{line.category}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatEuroFromCents(line.amountCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
