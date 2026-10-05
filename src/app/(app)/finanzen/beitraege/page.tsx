import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AREA_ICON } from "@/components/shared/area-icons";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { TableCard } from "@/components/shared/table-card";
import { formatEuroFromCents, parseCalendarDate, toDateInputValue } from "@/lib/dates";
import { param, type RawSearchParams } from "@/lib/search-params";
import { canFinance } from "@/modules/finance/access";
import { FinanceHeader } from "@/modules/finance/components/finance-header";
import { financeTabCounts } from "@/modules/finance/overview";
import { FeesNav } from "@/modules/fees/components/fees-nav";
import {
  AGE_RULE_LABEL,
  PAYMENT_METHOD_LABEL,
  PRO_RATA_ENTRY_LABEL,
  PRO_RATA_EXIT_LABEL,
} from "@/modules/fees/schemas";
import {
  billingPeriod,
  getFeeSettings,
  nextPeriod,
  previousPeriod,
  whoPays,
} from "@/modules/fees/service";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Beiträge" };

/**
 * „Wer zahlt was“ (Etappe 5): für den laufenden (oder gewählten) Zeitraum, was jedes Mitglied zahlen soll und warum –
 * bevor irgendetwas eingezogen wird. Hinweise (ohne Geburtsdatum, keine passende Beitragsart …) stehen ruhig als Text
 * darüber, jeder mit Link zum Mitglied. Noch keine Beiträge erstellt: Das macht später der Beitragslauf.
 */
export default async function FeesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!canFinance(ctx, "finance:read")) return <NoAccess what="die Finanzen" />;
  const settings = await getFeeSettings(ctx);
  const day = parseCalendarDate(param(params, "zeitraum") ?? "");
  const period = billingPeriod(settings.feeInterval, day ?? undefined);
  const q = param(params, "q")?.trim().toLowerCase();
  const [result, counts] = await Promise.all([whoPays(ctx, { period }), financeTabCounts(ctx)]);
  const previous = previousPeriod(settings.feeInterval, period);
  const next = nextPeriod(settings.feeInterval, period);
  // „im 4. Quartal 2026“, „im Oktober 2026“, „im Jahr 2026“.
  const phrase =
    settings.feeInterval === "YEARLY" ? `im Jahr ${period.label}` : `im ${period.label}`;
  const rawQ = param(params, "q");
  const periodHref = (start: Date) =>
    `/finanzen/beitraege?${new URLSearchParams({
      zeitraum: toDateInputValue(start),
      ...(rawQ ? { q: rawQ } : {}),
    })}`;
  const rows = q
    ? result.charges.filter(
        (charge) =>
          charge.memberName.toLowerCase().includes(q) ||
          charge.payerName.toLowerCase().includes(q) ||
          charge.mainFeeTypeName.toLowerCase().includes(q),
      )
    : result.charges;
  const byMethod = (method: "TRANSFER" | "DIRECT_DEBIT" | "CASH") =>
    result.charges.filter((c) => c.paymentMethod === method).length;

  return (
    <>
      <FinanceHeader description={`Wer zahlt was ${phrase}`} counts={counts} />
      <FeesNav />

      {result.feeTypeCount === 0 ? (
        <EmptyState
          icon={<AREA_ICON.finanzen />}
          title="Noch keine Beitragsarten"
          description="Lege zuerst die Beitragsarten an – danach steht hier, wer was zahlt."
          action={
            canFinance(ctx, "finance:manage") ? (
              <Button asChild>
                <Link href="/finanzen/beitraege/arten">Beitragsarten anlegen</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Zeitraum" className="flex items-center gap-2">
              <Button asChild variant="outline" size="icon-sm">
                <Link
                  href={periodHref(previous.start)}
                  aria-label={`Vorheriger Zeitraum: ${previous.label}`}
                >
                  <ChevronLeftIcon />
                </Link>
              </Button>
              <span className="min-w-36 text-center font-semibold">{period.label}</span>
              <Button asChild variant="outline" size="icon-sm">
                <Link href={periodHref(next.start)} aria-label={`Nächster Zeitraum: ${next.label}`}>
                  <ChevronRightIcon />
                </Link>
              </Button>
            </nav>
            <form method="get" action="/finanzen/beitraege" role="search" className="flex gap-2">
              <input type="hidden" name="zeitraum" value={toDateInputValue(period.start)} />
              <Input
                type="search"
                name="q"
                defaultValue={param(params, "q")}
                placeholder="Name oder Beitragsart …"
                aria-label="Beiträge durchsuchen"
                className="w-56"
              />
              <Button type="submit" variant="outline">
                Suchen
              </Button>
            </form>
          </div>

          <section
            aria-label="Zusammenfassung"
            className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <Tile label="Beiträge zusammen" value={formatEuroFromCents(result.totalCents)} />
            <Tile
              label="Mitglieder mit Beitrag"
              value={String(result.charges.length)}
              detail={`${byMethod("DIRECT_DEBIT")} per Lastschrift, ${byMethod("TRANSFER")} per Überweisung${byMethod("CASH") ? `, ${byMethod("CASH")} bar` : ""}`}
            />
            <Tile
              label="Beitragsfrei"
              value={String(result.exempt.length)}
              detail="z. B. Ehrenmitglieder"
            />
            <Tile
              label="Hinweise"
              value={String(result.warnings.length)}
              detail={result.warnings.length ? "bitte unten prüfen" : "alles stimmig"}
            />
          </section>

          {result.warnings.length > 0 && (
            <Card className="mb-6">
              <CardContent className="grid gap-2">
                <h2 className="text-lg font-semibold">Bitte prüfen</h2>
                <ul className="grid gap-1.5 text-sm">
                  {result.warnings.map((warning, index) => (
                    <li key={`${warning.memberId}-${warning.code}-${index}`}>
                      {warning.text}{" "}
                      <Link
                        href={`/mitglieder/${warning.memberId}`}
                        className="font-medium text-primary underline-offset-4 hover:underline"
                      >
                        Mitglied öffnen
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {q ? "Keine passenden Mitglieder." : "Im Zeitraum zahlt niemand einen Beitrag."}
            </p>
          ) : (
            <TableCard>
              <Table>
                <caption className="sr-only">Wer zahlt was {phrase}</caption>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mitglied</TableHead>
                    <TableHead className="hidden lg:table-cell">Beitragsart</TableHead>
                    <TableHead className="text-right">Betrag</TableHead>
                    <TableHead className="hidden md:table-cell">Zahlweg</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((charge) => (
                    <TableRow key={charge.memberId}>
                      <TableCell className="align-top whitespace-normal">
                        <Link
                          href={`/mitglieder/${charge.memberId}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {charge.memberName}
                        </Link>
                        <span className="block text-sm text-muted-foreground">
                          {charge.explanation}
                        </span>
                        {charge.payerMemberId !== charge.memberId && (
                          <span className="block text-sm text-muted-foreground">
                            zahlt: {charge.payerName}
                          </span>
                        )}
                        <span className="block text-sm text-muted-foreground md:hidden">
                          {PAYMENT_METHOD_LABEL[charge.paymentMethod]}
                        </span>
                      </TableCell>
                      <TableCell className="hidden align-top lg:table-cell">
                        {charge.mainFeeTypeName}
                      </TableCell>
                      <TableCell className="text-right align-top font-semibold tabular-nums">
                        {formatEuroFromCents(charge.amountCents)}
                      </TableCell>
                      <TableCell className="hidden align-top md:table-cell">
                        {PAYMENT_METHOD_LABEL[charge.paymentMethod]}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          )}

          {result.exempt.length > 0 && !q && (
            <section aria-labelledby="beitragsfrei-titel" className="mt-6 max-w-3xl">
              <h2 id="beitragsfrei-titel" className="mb-2 text-lg font-semibold">
                Beitragsfrei
              </h2>
              <ul className="grid gap-1 text-sm">
                {result.exempt.map((item) => (
                  <li key={item.memberId}>
                    <Link
                      href={`/mitglieder/${item.memberId}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {item.memberName}
                    </Link>{" "}
                    <span className="text-muted-foreground">– {item.reason}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p className="mt-6 max-w-3xl text-sm text-muted-foreground">
            Das ist eine Vorschau: Erst der Beitragslauf erstellt die Beiträge. Gerechnet wird beim
            Eintritt {PRO_RATA_ENTRY_LABEL[settings.proRataEntry]}, beim Austritt{" "}
            {PRO_RATA_EXIT_LABEL[settings.proRataExit]}, Altersgrenzen{" "}
            {AGE_RULE_LABEL[settings.ageRule]}; ein Statuswechsel zählt ab dem Tag.
          </p>
        </>
      )}
    </>
  );
}

function Tile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
    </div>
  );
}
