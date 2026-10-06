import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { NoAccess } from "@/components/shared/no-access";
import { TableCard } from "@/components/shared/table-card";
import { formatCalendarDate, formatDate, formatEuroFromCents } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { canFinance } from "@/modules/finance/access";
import { listCashCounts } from "@/modules/finance/cash-count";
import {
  closePreview,
  listPeriodCloses,
  verifyPeriodCloses,
  type CloseCheck,
} from "@/modules/finance/closing";
import {
  CLOSE_FOCUS_ID,
  ClosePeriodButton,
} from "@/modules/finance/components/close-period-button";
import { FinanceHeader } from "@/modules/finance/components/finance-header";
import { formatSignedEuro } from "@/modules/finance/ledger-format";
import { financeTabCounts } from "@/modules/finance/overview";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Monatsabschluss" };

/**
 * Monatsabschluss: der nächste offene Monat mit Checkliste (Belege, Kassensturz, bezahlte Rechnungen) und seinen Zahlen,
 * darunter die bisherigen Abschlüsse mit Prüfsumme und die letzten Kassenstürze. Abschließen darf, wer die Finanzen
 * bearbeitet; ansehen alle mit Finanzrecht (z. B. Kassenprüfer).
 */
export default async function ClosingPage() {
  const ctx = await requirePageContext();
  if (!canFinance(ctx, "finance:read")) return <NoAccess what="die Finanzen" />;
  const canManage = canFinance(ctx, "finance:manage");
  const [preview, closes, verification, cashCounts, counts] = await Promise.all([
    closePreview(ctx),
    listPeriodCloses(ctx),
    verifyPeriodCloses(ctx),
    listCashCounts(ctx, 5),
    financeTabCounts(ctx),
  ]);

  if (!preview) {
    return (
      <>
        <FinanceHeader description="Monat für Monat festschreiben" counts={counts} />
        <Card className="max-w-3xl">
          <CardContent>
            <p className="text-sm">
              Zuerst das Kassenbuch einrichten – danach schließt du hier die Monate ab.
            </p>
            <Button asChild className="mt-3">
              <Link href="/finanzen/kassenbuch">Zum Kassenbuch</Link>
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  const warnings = preview.checks.filter((check) => check.tone === "warning").length;
  const lastClose = closes[0];

  return (
    <>
      <FinanceHeader
        description={
          lastClose
            ? `Abgeschlossen bis ${formatCalendarDate(lastClose.closedThrough)}`
            : "Noch kein Monat abgeschlossen"
        }
        counts={counts}
      />

      <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <Card>
          <CardContent className="grid gap-4">
            <div>
              <h2 className="text-lg font-semibold">{preview.label}</h2>
              <p className="text-sm text-muted-foreground">
                {preview.ended
                  ? "Als Nächstes abzuschließen. Danach ist der Monat festgeschrieben – Korrekturen landen im Folgemonat."
                  : `Läuft noch – abschließen geht ab dem ${formatCalendarDate(
                      new Date(preview.through.getTime() + 86_400_000),
                    )}.`}
              </p>
            </div>
            <ul className="grid">
              {preview.checks.map((check) => (
                <CheckRow key={check.key} check={check} withLink={preview.canManage} />
              ))}
            </ul>
            {canManage && preview.ended && (
              <div className="justify-self-start">
                <ClosePeriodButton
                  month={preview.month}
                  label={preview.label}
                  through={preview.through}
                  warnings={warnings}
                  firstClose={preview.firstClose}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-3">
            <h2 className="text-lg font-semibold">Zahlen im {preview.label}</h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Einnahmen</dt>
              <dd className="text-right font-semibold tabular-nums">
                {formatEuroFromCents(preview.incomeCents)}
              </dd>
              <dt className="text-muted-foreground">Ausgaben</dt>
              <dd className="text-right font-semibold tabular-nums">
                {formatEuroFromCents(preview.expenseCents)}
              </dd>
              <dt className="text-muted-foreground">Buchungen</dt>
              <dd className="text-right font-semibold tabular-nums">{preview.entryCount}</dd>
            </dl>
            <h3 className="mt-2 text-sm font-semibold">
              Kontostände am {formatCalendarDate(preview.through)}
            </h3>
            <ul className="grid gap-1 text-sm">
              {preview.balances.map((balance) => (
                <li key={balance.accountId} className="flex justify-between gap-4">
                  <span className="min-w-0 break-words">{balance.name}</span>
                  <span
                    className={cn(
                      "shrink-0 font-semibold whitespace-nowrap tabular-nums",
                      balance.balanceCents < 0 && "text-red-700 dark:text-red-400",
                    )}
                  >
                    {formatEuroFromCents(balance.balanceCents)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby={CLOSE_FOCUS_ID} className="mb-6">
        {/* tabIndex -1: Nach dem Abschluss landet der Fokus hier. */}
        <h2 id={CLOSE_FOCUS_ID} tabIndex={-1} className="mb-1 text-lg font-semibold outline-none">
          Bisherige Abschlüsse
        </h2>
        {closes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Noch keine.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted-foreground">
              {verification.ok
                ? "Prüfsummen nachgerechnet: Alle Abschlüsse stimmen mit den Buchungen überein."
                : "Achtung: Eine Prüfsumme stimmt nicht mehr – bitte den Support informieren."}
            </p>
            <TableCard>
              <Table>
                <caption className="sr-only">Bisherige Monatsabschlüsse, neueste zuerst</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Monat</TableHead>
                    <TableHead className="hidden md:table-cell">Abgeschlossen</TableHead>
                    <TableHead className="text-right">Buchungen</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Bestand</TableHead>
                    <TableHead className="hidden lg:table-cell">Prüfsumme</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closes.map((close) => (
                    <TableRow key={close.id}>
                      <TableCell className="align-top whitespace-normal">
                        <span className="block font-medium">
                          {close.label}
                          {close.kind === "YEAR" && " · Jahresabschluss"}
                        </span>
                        <span className="block text-sm text-muted-foreground md:hidden">
                          {formatDate(close.closedAt)}
                          {close.closedBy && ` · ${close.closedBy}`}
                        </span>
                        {close.note && (
                          <span className="block text-sm text-muted-foreground">{close.note}</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden align-top text-sm md:table-cell">
                        {formatDate(close.closedAt)}
                        {close.closedBy && (
                          <span className="block text-muted-foreground">{close.closedBy}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right align-top tabular-nums">
                        {close.entryCount}
                        {close.lastNumber && (
                          <span className="block text-sm text-muted-foreground">
                            höchste Nr. {close.lastNumber}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-right align-top font-semibold tabular-nums sm:table-cell">
                        {formatEuroFromCents(close.totalCents)}
                      </TableCell>
                      <TableCell className="hidden align-top font-mono text-xs text-muted-foreground lg:table-cell">
                        <span title={close.contentHash}>{close.contentHash.slice(0, 16)} …</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          </>
        )}
      </section>

      <section aria-labelledby="kassenstuerze-titel">
        <h2 id="kassenstuerze-titel" className="mb-1 text-lg font-semibold">
          Letzte Kassenstürze
        </h2>
        {cashCounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canManage
              ? "Noch keiner. Im Kassenbuch unter „Weitere Aktionen“ → „Kassensturz“."
              : "Noch keiner."}
          </p>
        ) : (
          <ul className="grid max-w-3xl">
            {cashCounts.map((count) => (
              <li
                key={count.id}
                className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t py-2.5 text-sm first:border-t-0"
              >
                <span>
                  {formatCalendarDate(count.countedOn)} · {count.accountName}:{" "}
                  <span className="font-semibold tabular-nums">
                    {formatEuroFromCents(count.countedCents)}
                  </span>
                </span>
                <span
                  className={cn(
                    count.differenceCents === 0
                      ? "text-muted-foreground"
                      : "text-amber-700 dark:text-amber-400",
                  )}
                >
                  {count.differenceCents === 0
                    ? "stimmt"
                    : `Differenz ${formatSignedEuro(count.differenceCents)} (Nr. ${count.entryLabel})`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function CheckRow({ check, withLink }: { check: CloseCheck; withLink: boolean }) {
  return (
    <li
      className={cn(
        "grid gap-0.5 border-l-2 py-2 pl-3",
        check.tone === "ok" ? "border-emerald-600/60" : "border-amber-500",
      )}
    >
      <p className="font-medium">
        {check.title}
        <span className="sr-only">{check.tone === "ok" ? " (erledigt)" : " (offen)"}</span>
      </p>
      <p className="text-sm text-muted-foreground">{check.detail}</p>
      {withLink && check.href && (
        <Link
          href={check.href}
          className="justify-self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {check.linkLabel}
        </Link>
      )}
    </li>
  );
}
