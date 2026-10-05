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
import { SEGMENT_BAR, segmentItem } from "@/components/ui/segment-styles";
import { AREA_ICON } from "@/components/shared/area-icons";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { TableCard } from "@/components/shared/table-card";
import {
  formatCalendarDate,
  formatEuroFromCents,
  parseCalendarDate,
  toDateInputValue,
} from "@/lib/dates";
import { param, type RawSearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { canFinance } from "@/modules/finance/access";
import { FinanceHeader } from "@/modules/finance/components/finance-header";
import { financeTabCounts } from "@/modules/finance/overview";
import type { EngineWarning, WarningCode } from "@/modules/fees/engine-types";
import { FeesNav } from "@/modules/fees/components/fees-nav";
import { CreateRunButton } from "@/modules/fees/components/run-actions";
import { RunSteps, Tile, calculationText } from "@/modules/fees/components/run-parts";
import { PAYMENT_METHOD_LABEL } from "@/modules/fees/schemas";
import { analyzeFeeRun } from "@/modules/fees/run";
import { billingPeriod, getFeeSettings, nextPeriod, previousPeriod } from "@/modules/fees/service";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Beitragslauf" };

/** Überschriften der Hinweise in Schritt 1 (in dieser Reihenfolge). */
const WARNING_GROUPS: { codes: WarningCode[]; title: string }[] = [
  { codes: ["NO_BIRTH_DATE", "NO_BIRTH_DATE_SKIPPED"], title: "Ohne Geburtsdatum" },
  { codes: ["NO_FEE_TYPE"], title: "Keine passende Beitragsart" },
  { codes: ["LEFT_WITHOUT_DATE", "NO_JOIN_DATE"], title: "Eintritt oder Austritt fehlt" },
  { codes: ["PAYER_NOT_MEMBER"], title: "Zahler prüfen" },
  { codes: ["FAMILY_NOT_APPLIED", "FAMILY_TOO_SMALL"], title: "Familien" },
  { codes: ["AGE_LIMIT_IN_PERIOD"], title: "Altersgrenze im Zeitraum" },
  { codes: ["BELOW_MIN_DEBIT"], title: "Kleiner Betrag per Lastschrift" },
  { codes: ["STATUS_HISTORY_INCOMPLETE"], title: "Status-Verlauf" },
];

type Filter = "alle" | "lastschrift" | "ueberweisung" | "hinweis";
const PAGE = 50;

/**
 * Beitragslauf (Etappe 7, Kernbildschirm 2): Schritt 1 „Prüfen“ zeigt die Hinweise ruhig als Text, Schritt 2 „Vorschau“
 * die Summen und jede Zeile mit ihrer Rechnung, Schritt 3 „Erstellen“ erstellt genau diese Vorschau (Rückfrage). Ein
 * weiterer Lauf für denselben Zeitraum ist ein Nachlauf: Er erstellt nur, was noch fehlt.
 */
export default async function FeeRunPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!canFinance(ctx, "finance:read")) return <NoAccess what="die Finanzen" />;
  const canManage = canFinance(ctx, "finance:manage");
  const settings = await getFeeSettings(ctx);
  const period = billingPeriod(
    settings.feeInterval,
    parseCalendarDate(param(params, "zeitraum") ?? "") ?? undefined,
  );
  const due = parseCalendarDate(param(params, "faellig") ?? "") ?? undefined;
  const [analysis, counts] = await Promise.all([
    analyzeFeeRun(ctx, { period, dueDate: due }),
    financeTabCounts(ctx),
  ]);
  const step = param(params, "schritt") === "2" ? 2 : 1;
  const filter =
    (["lastschrift", "ueberweisung", "hinweis"] as const).find(
      (f) => f === param(params, "filter"),
    ) ?? ("alle" as Filter);
  const q = param(params, "q")?.trim().toLowerCase();
  const showAll = param(params, "alle") === "1";

  const href = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const values: Record<string, string | undefined> = {
      zeitraum: toDateInputValue(period.start),
      faellig: due ? toDateInputValue(due) : undefined,
      schritt: String(step),
      filter: filter === "alle" ? undefined : filter,
      q: param(params, "q"),
      ...changes,
    };
    for (const [key, value] of Object.entries(values)) if (value) next.set(key, value);
    return `/finanzen/beitraege/lauf?${next}`;
  };

  const { preview } = analysis;
  const previous = previousPeriod(settings.feeInterval, period);
  const next = nextPeriod(settings.feeInterval, period);
  const earlier = analysis.runs.filter((r) => r.status === "CREATED");
  // „Nachlauf“ nur, wenn es für genau diesen Zeitraum schon einen Lauf gibt (nicht für einen anderen Rhythmus).
  const sameLabel = earlier.some((r) => r.label === period.label);
  const title = `${sameLabel ? "Nachlauf" : "Beitragslauf"} ${period.label}`;
  // „bitte prüfen“ nur bei Hinweisen, die etwas zu tun bedeuten (ein Geburtstag im Zeitraum ist bloß ein Hinweis).
  const warnedMembers = new Set(
    preview.warnings
      .filter((w) => w.code !== "AGE_LIMIT_IN_PERIOD")
      .map((w) => w.familyId ?? w.memberId),
  );
  const hasWarning = (charge: (typeof preview.charges)[number]) =>
    warnedMembers.has(charge.memberId) ||
    (charge.family !== null &&
      (warnedMembers.has(charge.family.id) ||
        charge.family.members.some((m) => warnedMembers.has(m.id))));
  const sum = (method: "DIRECT_DEBIT" | "TRANSFER" | "CASH") => {
    const list = preview.charges.filter((c) => c.paymentMethod === method);
    return { count: list.length, cents: list.reduce((s, c) => s + c.amountCents, 0) };
  };
  const debit = sum("DIRECT_DEBIT");
  const transfer = sum("TRANSFER");
  const cash = sum("CASH");
  const notInRun = [
    ...preview.exempt,
    ...preview.skipped.filter((s) => s.reason === "schon berechnet"),
  ].length;
  const alreadyBilled = preview.skipped.filter((s) => s.reason === "schon berechnet").length;

  // Zeilen der Vorschau: Filter, Suche, die ersten 50 (oder alle).
  const filtered = preview.charges.filter((charge) => {
    if (filter === "lastschrift" && charge.paymentMethod !== "DIRECT_DEBIT") return false;
    if (filter === "ueberweisung" && charge.paymentMethod === "DIRECT_DEBIT") return false;
    if (filter === "hinweis" && !hasWarning(charge)) return false;
    if (!q) return true;
    return (
      charge.memberName.toLowerCase().includes(q) ||
      charge.payerName.toLowerCase().includes(q) ||
      (charge.family?.members ?? []).some((m) => m.name.toLowerCase().includes(q))
    );
  });
  const rows = showAll ? filtered : filtered.slice(0, PAGE);
  const withWarning = preview.charges.filter(hasWarning).length;

  const groups = WARNING_GROUPS.map((group) => ({
    ...group,
    items: preview.warnings.filter((w) => group.codes.includes(w.code)),
  })).filter((group) => group.items.length > 0);
  const warningLink = (warning: EngineWarning) =>
    warning.familyId
      ? `/finanzen/beitraege/familien#familie-${warning.familyId}`
      : `/mitglieder/${warning.memberId}`;

  const header = (
    <Card className="mb-6">
      <CardContent className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <nav aria-label="Zeitraum" className="flex items-center gap-2">
            <Button asChild variant="outline" size="icon-sm">
              <Link
                href={href({
                  zeitraum: toDateInputValue(previous.start),
                  faellig: undefined,
                  schritt: "1",
                })}
                aria-label={`Vorheriger Zeitraum: ${previous.label}`}
              >
                <ChevronLeftIcon />
              </Link>
            </Button>
            <h2 className="text-xl font-bold">{title}</h2>
            <Button asChild variant="outline" size="icon-sm">
              <Link
                href={href({
                  zeitraum: toDateInputValue(next.start),
                  faellig: undefined,
                  schritt: "1",
                })}
                aria-label={`Nächster Zeitraum: ${next.label}`}
              >
                <ChevronRightIcon />
              </Link>
            </Button>
          </nav>
          <form
            method="get"
            action="/finanzen/beitraege/lauf"
            className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
          >
            <input type="hidden" name="zeitraum" value={toDateInputValue(period.start)} />
            <input type="hidden" name="schritt" value={String(step)} />
            <span>
              Zeitraum {formatCalendarDate(period.start)} bis {formatCalendarDate(period.end)} ·
              fällig am
            </span>
            <Input
              type="date"
              name="faellig"
              defaultValue={toDateInputValue(analysis.dueDate)}
              aria-label="Fällig am"
              className="h-8 w-40"
            />
            <Button type="submit" variant="outline" size="sm">
              Übernehmen
            </Button>
          </form>
        </div>
        <RunSteps
          steps={[
            { label: "Prüfen", state: step === 1 ? "current" : "done" },
            { label: "Vorschau", state: step === 2 ? "current" : "todo" },
            { label: "Erstellen", state: "todo" },
          ]}
        />
      </CardContent>
    </Card>
  );

  const blocked = !settings.stored || analysis.feeTypeCount === 0;
  return (
    <>
      <FinanceHeader description={`Beiträge · ${title}`} counts={counts} />
      <FeesNav />

      {!settings.stored ? (
        <EmptyState
          icon={<AREA_ICON.finanzen />}
          title="Erst das Kassenbuch einrichten"
          description="Beiträge entstehen mit Nummer und Kategorie im Kassenbuch – dort kommen später auch die Zahlungen an."
          action={
            <Button asChild>
              <Link href="/finanzen/kassenbuch">Zum Kassenbuch</Link>
            </Button>
          }
        />
      ) : analysis.feeTypeCount === 0 ? (
        <EmptyState
          icon={<AREA_ICON.finanzen />}
          title="Noch keine Beitragsarten"
          description="Lege zuerst die Beitragsarten an – danach lässt sich der Beitragslauf erstellen."
          action={
            <Button asChild>
              <Link href="/finanzen/beitraege/arten">Beitragsarten anlegen</Link>
            </Button>
          }
        />
      ) : null}

      {!blocked && (
        <>
          {header}

          {earlier.length > 0 && (
            <Card className="mb-6">
              <CardContent className="text-sm">
                Für {period.label}{" "}
                {earlier.length === 1
                  ? "gibt es schon einen Beitragslauf"
                  : `gibt es schon ${earlier.length} Läufe`}
                {": "}
                {earlier.map((run, index) => (
                  <span key={run.id}>
                    {index > 0 && ", "}
                    <Link
                      href={`/finanzen/beitraege/laeufe/${run.id}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {run.label}: {run.chargeCount}{" "}
                      {run.chargeCount === 1 ? "Beitrag" : "Beiträge"} vom{" "}
                      {formatCalendarDate(run.createdAt)}
                    </Link>
                  </span>
                ))}
                . Ein weiterer Lauf erstellt nur, was noch fehlt – etwa für neu erfasste Mitglieder.
              </CardContent>
            </Card>
          )}

          {step === 1 ? (
            <>
              <Card className="mb-6">
                <CardContent className="grid gap-4">
                  <div>
                    <h2 className="text-lg font-semibold">Schritt 1: Prüfen</h2>
                    <p className="text-sm text-muted-foreground">
                      {groups.length === 0
                        ? "Keine Hinweise – alles stimmig."
                        : "Diese Hinweise betreffen die Beiträge, die jetzt entstehen, und sind in der Vorschau schon berücksichtigt. Was sich beheben lässt, lieber vorher – dann stimmt die Vorschau."}
                    </p>
                  </div>
                  {groups.map((group) => (
                    <section key={group.title} aria-label={group.title}>
                      <h3 className="mb-1 font-semibold">
                        {group.title} ({group.items.length})
                      </h3>
                      <ul className="grid gap-1.5 text-sm">
                        {group.items.map((warning, index) => (
                          <li
                            key={`${warning.familyId ?? warning.memberId}-${warning.code}-${index}`}
                          >
                            {warning.text}{" "}
                            <Link
                              href={warningLink(warning)}
                              className="font-medium text-primary underline-offset-4 hover:underline"
                            >
                              {warning.familyId ? "Familie öffnen" : "Mitglied öffnen"}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </CardContent>
              </Card>
              <BottomBar
                note={
                  preview.charges.length === 0
                    ? `Für ${period.label} ist nichts (mehr) zu erstellen.`
                    : `${preview.charges.length} ${preview.charges.length === 1 ? "Beitrag" : "Beiträge"} über ${formatEuroFromCents(preview.totalCents)} warten auf die Vorschau.`
                }
              >
                {preview.charges.length > 0 && (
                  <Button asChild>
                    <Link href={href({ schritt: "2" })}>Weiter zur Vorschau</Link>
                  </Button>
                )}
              </BottomBar>
            </>
          ) : (
            <>
              <section
                aria-label="Summen"
                className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
              >
                <Tile
                  label="Beiträge gesamt"
                  value={formatEuroFromCents(preview.totalCents)}
                  detail={`${preview.charges.length} ${preview.charges.length === 1 ? "Beitrag" : "Beiträge"}`}
                />
                <Tile
                  label="Per Lastschrift"
                  value={formatEuroFromCents(debit.cents)}
                  detail={`${debit.count} ${debit.count === 1 ? "Beitrag" : "Beiträge"} · Einzug ab ${formatCalendarDate(analysis.dueDate)}`}
                />
                <Tile
                  label="Per Überweisung"
                  value={formatEuroFromCents(transfer.cents + cash.cents)}
                  detail={`${transfer.count + cash.count} ${transfer.count + cash.count === 1 ? "Beitrag" : "Beiträge"} · zahlen selbst bis ${formatCalendarDate(analysis.dueDate)}${cash.count ? ` (${cash.count} bar)` : ""}`}
                />
                <Tile
                  label="Nicht im Lauf"
                  value={String(notInRun)}
                  unit={notInRun === 1 ? "Mitglied" : "Mitglieder"}
                  detail={
                    alreadyBilled > 0
                      ? `${preview.exempt.length} beitragsfrei, ${alreadyBilled} schon berechnet`
                      : "beitragsfrei, z. B. Ehrenmitglieder"
                  }
                />
              </section>

              {groups.length > 0 && (
                <Card className="mb-6">
                  <CardContent className="flex flex-wrap items-start justify-between gap-3 text-sm">
                    <p>
                      <span className="font-semibold">Hinweise aus Schritt 1: </span>
                      {groups.map((g) => `${g.title} (${g.items.length})`).join(" · ")}
                    </p>
                    <Link
                      href={href({ schritt: "1" })}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Anzeigen
                    </Link>
                  </CardContent>
                </Card>
              )}

              <TableCard>
                <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div>
                    <h2 className="text-lg font-semibold">
                      Vorschau: {preview.charges.length}{" "}
                      {preview.charges.length === 1 ? "Beitrag" : "Beiträge"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      Jede Zeile zeigt, wie der Betrag zustande kommt.
                    </p>
                  </div>
                  <p className="text-lg font-bold tabular-nums">
                    {formatEuroFromCents(preview.totalCents)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3 px-4 pb-4">
                  <form
                    method="get"
                    action="/finanzen/beitraege/lauf"
                    role="search"
                    className="flex gap-2"
                  >
                    <input type="hidden" name="zeitraum" value={toDateInputValue(period.start)} />
                    {due && <input type="hidden" name="faellig" value={toDateInputValue(due)} />}
                    <input type="hidden" name="schritt" value="2" />
                    {filter !== "alle" && <input type="hidden" name="filter" value={filter} />}
                    <Input
                      type="search"
                      name="q"
                      defaultValue={param(params, "q")}
                      placeholder="Mitglied suchen …"
                      aria-label="Vorschau durchsuchen"
                      className="w-56"
                    />
                    <Button type="submit" variant="outline">
                      Suchen
                    </Button>
                  </form>
                  <nav aria-label="Filter" className={SEGMENT_BAR}>
                    {(
                      [
                        ["alle", "Alle", preview.charges.length],
                        ["lastschrift", "Lastschrift", debit.count],
                        ["ueberweisung", "Überweisung", transfer.count + cash.count],
                        ["hinweis", "Mit Hinweis", withWarning],
                      ] as const
                    ).map(([key, label, count]) => (
                      <Link
                        key={key}
                        href={href({ filter: key === "alle" ? undefined : key })}
                        aria-current={filter === key ? "page" : undefined}
                        className={segmentItem(filter === key)}
                      >
                        {label} <span className="tabular-nums">{count}</span>
                      </Link>
                    ))}
                  </nav>
                </div>
                {rows.length === 0 ? (
                  <p className="px-4 pb-4 text-sm text-muted-foreground">
                    Keine passenden Beiträge.
                  </p>
                ) : (
                  <Table>
                    <caption className="sr-only">Vorschau {title}</caption>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mitglied</TableHead>
                        <TableHead className="hidden lg:table-cell">Beitragsart</TableHead>
                        <TableHead className="hidden md:table-cell">So wird gerechnet</TableHead>
                        <TableHead className="hidden sm:table-cell">Zahlweg</TableHead>
                        <TableHead className="text-right">Betrag</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((charge) => (
                        <TableRow key={charge.key}>
                          <TableCell className="align-top whitespace-normal">
                            <Link
                              href={
                                charge.family
                                  ? `/finanzen/beitraege/familien#familie-${charge.family.id}`
                                  : `/mitglieder/${charge.memberId}`
                              }
                              className="font-medium underline-offset-4 hover:underline"
                            >
                              {charge.memberName}
                            </Link>
                            {charge.family && (
                              <span className="block text-sm text-muted-foreground">
                                {charge.family.members.map((m) => m.name.split(" ")[0]).join(", ")}
                              </span>
                            )}
                            <span className="block text-sm text-muted-foreground md:hidden">
                              {calculationText(charge, period)}
                            </span>
                            <span className="block text-sm text-muted-foreground sm:hidden">
                              {PAYMENT_METHOD_LABEL[charge.paymentMethod]}
                            </span>
                            {hasWarning(charge) && (
                              <span className="block text-sm font-medium text-amber-700 dark:text-amber-400">
                                bitte prüfen
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="hidden align-top whitespace-normal lg:table-cell">
                            {charge.mainFeeTypeName}
                          </TableCell>
                          <TableCell className="hidden align-top whitespace-normal md:table-cell">
                            {calculationText(charge, period)}
                            {(charge.family || charge.payerMemberId !== charge.memberId) && (
                              <span className="block text-sm text-muted-foreground">
                                Zahler: {charge.payerName}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="hidden align-top sm:table-cell">
                            {PAYMENT_METHOD_LABEL[charge.paymentMethod]}
                          </TableCell>
                          <TableCell className="text-right align-top font-semibold tabular-nums">
                            {formatEuroFromCents(charge.amountCents)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                {filtered.length > rows.length && (
                  <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm">
                    <span className="text-muted-foreground">
                      {rows.length} von {filtered.length} Beiträgen
                    </span>
                    <Link
                      href={href({ alle: "1" })}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Alle anzeigen
                    </Link>
                  </div>
                )}
              </TableCard>

              <BottomBar note="Du kannst das Erstellen rückgängig machen, solange noch nichts bezahlt ist.">
                <Button asChild variant="outline">
                  <Link href={href({ schritt: "1" })}>Zurück zu Schritt 1</Link>
                </Button>
                {canManage && preview.charges.length > 0 && (
                  <CreateRunButton
                    periodStart={toDateInputValue(period.start)}
                    dueDate={toDateInputValue(analysis.dueDate)}
                    inputHash={analysis.inputHash}
                    count={preview.charges.length}
                    totalText={formatEuroFromCents(preview.totalCents)}
                    periodLabel={period.label}
                  />
                )}
              </BottomBar>
            </>
          )}
        </>
      )}
    </>
  );
}

function BottomBar({ note, children }: { note: string; children?: React.ReactNode }) {
  return (
    <div
      className={cn(
        "mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs",
      )}
    >
      <p className="min-w-0 flex-1 basis-64 text-sm text-muted-foreground">{note}</p>
      <div className="flex shrink-0 flex-wrap gap-2">{children}</div>
    </div>
  );
}
