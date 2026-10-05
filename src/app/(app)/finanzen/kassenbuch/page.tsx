import type { Metadata } from "next";
import Link from "next/link";
import { AREA_ICON } from "@/components/shared/area-icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/shared/empty-state";
import {
  FILTER_FORM,
  FILTER_SEARCH,
  FILTER_SELECT,
  FilterFields,
  FilterToggle,
} from "@/components/shared/filter-toggle";
import { NoAccess } from "@/components/shared/no-access";
import { Pagination } from "@/components/shared/pagination";
import { TableCard } from "@/components/shared/table-card";
import { formatCalendarDate, formatEuroFromCents, todayCalendarDate } from "@/lib/dates";
import { centsToInput } from "@/lib/money";
import { param, pageRequest, type RawSearchParams } from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { canFinance } from "@/modules/finance/access";
import { EntryActions, LEDGER_FOCUS_ID } from "@/modules/finance/components/entry-actions";
import { EntryDialog } from "@/modules/finance/components/entry-dialog";
import { FinanceHeader } from "@/modules/finance/components/finance-header";
import { LedgerMoreMenu } from "@/modules/finance/components/ledger-more-menu";
import { LedgerSetupForm } from "@/modules/finance/components/ledger-setup-form";
import { OpeningDialog } from "@/modules/finance/components/opening-dialog";
import { TransferDialog } from "@/modules/finance/components/transfer-dialog";
import {
  entryFormOptions,
  getLedgerSetup,
  listAccounts,
  listCategories,
  listEntries,
  openingBalances,
  type FinanceAccountDto,
  type LedgerEntryDto,
} from "@/modules/finance/ledger";
import {
  ACCOUNT_KIND_LABEL,
  formatSignedEuro,
  monthLabel,
  SPHERE_LABEL,
} from "@/modules/finance/ledger-format";
import type { EntryInput } from "@/modules/finance/ledger-schemas";
import { financeTabCounts } from "@/modules/finance/overview";
import { env } from "@/server/env";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Kassenbuch" };

/** Monate vom Beginn des Kassenbuchs bis heute, neueste zuerst („2026-09“). */
function monthsSince(start: Date): string[] {
  const today = todayCalendarDate();
  const months: string[] = [];
  let year = today.getUTCFullYear();
  let month = today.getUTCMonth();
  while (
    year > start.getUTCFullYear() ||
    (year === start.getUTCFullYear() && month >= start.getUTCMonth())
  ) {
    months.push(`${year}-${String(month + 1).padStart(2, "0")}`);
    month -= 1;
    if (month < 0) {
      month = 11;
      year -= 1;
    }
  }
  return months;
}

/**
 * Datum, das ein Storno bzw. eine Korrektur bekommt: das der Buchung, solange ihr Zeitraum offen ist (so stimmen die
 * Monatszahlen), sonst der erste offene Tag danach – wie `reversalDate` im Dienst.
 */
function correctionDate(entry: LedgerEntryDto, closedThrough: Date | null): Date {
  if (!closedThrough || entry.bookingDate.getTime() > closedThrough.getTime())
    return entry.bookingDate;
  const firstOpen = new Date(closedThrough.getTime() + 86_400_000);
  const today = todayCalendarDate();
  return firstOpen.getTime() > today.getTime() ? today : firstOpen;
}

/** Werte für „Korrigieren“: die Buchung, wie man sie neu eingeben würde. */
function correctionDefaults(entry: LedgerEntryDto, date: Date): Partial<EntryInput> {
  return {
    kind: entry.amountCents > 0 ? "INCOME" : "EXPENSE",
    accountId: entry.account.id,
    bookingDate: date.toISOString().slice(0, 10),
    description: entry.description,
    counterparty: entry.counterpartyName ?? "",
    invoiceId: entry.lines.find((line) => line.invoiceId)?.invoiceId ?? undefined,
    lines: entry.lines.map((line) => ({
      categoryId: line.categoryId,
      amount: centsToInput(Math.abs(line.amountCents)),
      target: line.department ? `a:${line.department.id}` : line.event ? `v:${line.event.id}` : "",
      note: line.note ?? "",
    })),
  };
}

/** Was eine Buchung ist – für Screenreader beim Betrag (die Farbe zeigt nur echte Einnahmen grün). */
function entryKindText(entry: LedgerEntryDto): string {
  if (entry.kind === "REVERSAL") return "Storno";
  if (entry.kind === "TRANSFER") return "Umbuchung";
  if (entry.kind === "OPENING") return "Anfangsbestand";
  return entry.amountCents > 0 ? "Einnahme" : "Ausgabe";
}

/**
 * Kassenbuch: Kontostände, Filter und die Buchungen (neueste zuerst). Buchungen werden nie geändert, sondern storniert
 * („⋯“ → Stornieren/Korrigieren); Storno und Original verweisen aufeinander. Beim ersten Besuch: „Kassenbuch einrichten“.
 */
export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!canFinance(ctx, "finance:read")) return <NoAccess what="die Finanzen" />;
  const canManage = canFinance(ctx, "finance:manage");
  const [setup, counts] = await Promise.all([getLedgerSetup(ctx), financeTabCounts(ctx)]);
  const today = todayCalendarDate();

  if (!setup) {
    return (
      <>
        <FinanceHeader
          description="Einnahmen und Ausgaben von Girokonto und Barkasse"
          counts={counts}
        />
        <Card className="max-w-3xl">
          <CardContent className="grid gap-4">
            <div>
              <h2 className="text-lg font-semibold">Kassenbuch einrichten</h2>
              <p className="text-sm text-muted-foreground">
                Einmal die Konten mit ihrem Anfangsbestand anlegen – danach buchst du Einnahmen und
                Ausgaben, und die Übersicht zeigt Kontostände und Zahlen.
              </p>
            </div>
            {canManage ? (
              <LedgerSetupForm defaultStart={`${today.getUTCFullYear()}-01-01`} />
            ) : (
              <p className="text-sm">
                Das Einrichten übernimmt der Kassenwart (Recht „Finanzen bearbeiten“).
              </p>
            )}
          </CardContent>
        </Card>
      </>
    );
  }

  const accountId = param(params, "konto");
  const month = param(params, "monat");
  const categoryId = param(params, "kategorie");
  const receipt = param(params, "beleg") === "fehlt" ? ("missing" as const) : undefined;
  const q = param(params, "q");
  const { page, pageSize } = pageRequest(params, 25);
  const [accounts, categories, result, options, openings] = await Promise.all([
    listAccounts(ctx),
    listCategories(ctx),
    listEntries(ctx, { accountId, month, categoryId, receipt, q, page, pageSize }),
    canManage ? entryFormOptions(ctx) : Promise.resolve(null),
    openingBalances(ctx),
  ]);
  const filtered = Boolean(accountId || month || categoryId || receipt || q);
  // Belege entfernen geht nur, solange der Zeitraum der Buchung offen ist (das prüft auch die Datenbank).
  const periodOpen = (date: Date) =>
    !setup.closedThrough || date.getTime() > setup.closedThrough.getTime();
  // Den Anfangsbestand ändern geht, solange der Beginn des Kassenbuchs nicht abgeschlossen ist.
  const openingEditable =
    canManage &&
    (!setup.closedThrough || setup.closedThrough.getTime() < setup.ledgerStartDate.getTime());
  const openingDialog = (account: FinanceAccountDto, trigger: "text" | "icon") => (
    <OpeningDialog
      account={account}
      currentInput={openings.has(account.id) ? centsToInput(openings.get(account.id)!) : ""}
      ledgerStartDate={setup.ledgerStartDate}
      trigger={trigger}
    />
  );

  return (
    <>
      <FinanceHeader
        description="Einnahmen und Ausgaben von Girokonto und Barkasse"
        counts={counts}
        actions={
          options ? (
            <>
              <EntryDialog options={options} />
              <TransferDialog options={options} />
              <LedgerMoreMenu
                cashAccounts={accounts
                  .filter((account) => account.kind === "CASH")
                  .map((account) => ({
                    id: account.id,
                    name: account.name,
                    bookCents: account.balanceCents,
                  }))}
                openCashCount={param(params, "kassensturz") ?? null}
              />
            </>
          ) : undefined
        }
      />

      <section aria-label="Kontostände" className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {accounts.map((account) => (
          <div
            key={account.id}
            className={cn(
              "relative rounded-xl border bg-card p-4 shadow-xs transition-colors [@media(hover:hover)]:has-[a:hover]:border-primary/40",
              accountId === account.id && "border-primary ring-1 ring-primary",
            )}
          >
            <Link
              href={`/finanzen/kassenbuch?konto=${account.id}`}
              aria-current={accountId === account.id ? "true" : undefined}
              className="block rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="block text-sm text-muted-foreground">
                {account.name}
                <span className="sr-only">, {ACCOUNT_KIND_LABEL[account.kind]}</span>
              </span>
              <span
                className={cn(
                  "mt-1 block text-2xl font-bold tabular-nums",
                  account.balanceCents < 0 && "text-red-700 dark:text-red-400",
                )}
              >
                {formatEuroFromCents(account.balanceCents)}
              </span>
              {account.bankName && (
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {account.bankName}
                </span>
              )}
            </Link>
            {openingEditable && !openings.has(account.id) && openingDialog(account, "text")}
          </div>
        ))}
      </section>

      <form
        method="get"
        action="/finanzen/kassenbuch"
        role="search"
        className={cn("mb-4", FILTER_FORM)}
      >
        <Input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Text, Gegenüber oder Nummer (2026-0042) …"
          aria-label="Kassenbuch durchsuchen"
          className={FILTER_SEARCH}
        />
        <FilterToggle
          id="kassenbuch-filter"
          active={[accountId, month, categoryId, receipt].filter(Boolean).length}
        />
        <FilterFields id="kassenbuch-filter">
          <NativeSelect
            className={FILTER_SELECT}
            name="konto"
            defaultValue={accountId ?? ""}
            aria-label="Nach Konto filtern"
          >
            <option value="">Alle Konten</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            className={FILTER_SELECT}
            name="monat"
            defaultValue={month ?? ""}
            aria-label="Nach Monat filtern"
          >
            <option value="">Alle Monate</option>
            {monthsSince(setup.ledgerStartDate).map((value) => (
              <option key={value} value={value}>
                {monthLabel(value)}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            className={FILTER_SELECT}
            name="kategorie"
            defaultValue={categoryId ?? ""}
            aria-label="Nach Kategorie filtern"
          >
            <option value="">Alle Kategorien</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            className={FILTER_SELECT}
            name="beleg"
            defaultValue={receipt ? "fehlt" : ""}
            aria-label="Nach Beleg filtern"
          >
            <option value="">Mit und ohne Beleg</option>
            <option value="fehlt">Ohne Beleg</option>
          </NativeSelect>
          <div className="flex gap-2">
            <Button type="submit" variant="outline">
              Filtern
            </Button>
            {filtered && (
              <Button asChild variant="ghost">
                <Link href="/finanzen/kassenbuch">Zurücksetzen</Link>
              </Button>
            )}
          </div>
        </FilterFields>
      </form>

      {result.entries.length === 0 ? (
        <EmptyState
          icon={<AREA_ICON.finanzen />}
          title={
            receipt && !accountId && !month && !categoryId && !q
              ? "Alle Buchungen haben einen Beleg"
              : filtered
                ? "Keine passenden Buchungen"
                : "Noch keine Buchungen"
          }
          description={
            receipt && !accountId && !month && !categoryId && !q
              ? "Nichts nachzureichen."
              : filtered
                ? "Passe die Suche oder den Filter an."
                : canManage
                  ? "Erfasse die erste Einnahme oder Ausgabe mit „Neue Buchung“."
                  : "Sobald der Kassenwart bucht, stehen die Buchungen hier."
          }
        />
      ) : (
        <>
          {/* tabIndex -1: Nach einem Storno landet der Fokus hier (das „⋯“ der Buchung gibt es dann nicht mehr). */}
          <p
            id={LEDGER_FOCUS_ID}
            tabIndex={-1}
            className="mb-2 text-sm text-muted-foreground tabular-nums outline-none"
          >
            {result.total === 1 ? "1 Buchung" : `${result.total} Buchungen`}
            {filtered && <> · zusammen {formatSignedEuro(result.sumCents)}</>}
          </p>
          <TableCard>
            <Table>
              <caption className="sr-only">Kassenbuch, neueste Buchungen zuerst</caption>
              <TableHeader>
                <TableRow>
                  <TableHead className="hidden w-28 sm:table-cell">Nr. und Datum</TableHead>
                  <TableHead>Beschreibung</TableHead>
                  <TableHead className="hidden lg:table-cell">Kategorie</TableHead>
                  <TableHead className="hidden xl:table-cell">Konto</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                  {canManage && (
                    <TableHead className="w-12">
                      <span className="sr-only">Aktionen</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.entries.map((entry) => {
                  const date = correctionDate(entry, setup.closedThrough);
                  const account = accounts.find((a) => a.id === entry.account.id);
                  return (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      canManage={canManage}
                      actions={
                        entry.kind === "OPENING" ? (
                          openingEditable && !entry.reversedBy && account ? (
                            openingDialog(account, "icon")
                          ) : null
                        ) : entry.canReverse ? (
                          <EntryActions
                            entry={{
                              id: entry.id,
                              label: entry.label,
                              description: entry.description,
                              reversalDate: date,
                              transfer: entry.kind === "TRANSFER",
                              defaults: correctionDefaults(entry, date),
                              attachments: entry.attachments,
                              receiptsRemovable: periodOpen(entry.bookingDate),
                            }}
                            options={entry.kind === "TRANSFER" ? null : options}
                            maxUploadMb={env.MAX_UPLOAD_MB}
                          />
                        ) : null
                      }
                    />
                  );
                })}
              </TableBody>
            </Table>
          </TableCard>
          <Pagination basePath="/finanzen/kassenbuch" searchParams={params} {...result} />
        </>
      )}
      <p className="mt-6 max-w-3xl text-sm text-muted-foreground">
        Buchungen werden nicht geändert, sondern storniert – so bleibt alles nachvollziehbar. Ein
        Storno bekommt eine eigene Nummer, das Datum der ursprünglichen Buchung und verweist auf
        sie.
      </p>
    </>
  );
}

function EntryRow({
  entry,
  canManage,
  actions,
}: {
  entry: LedgerEntryDto;
  canManage: boolean;
  actions: React.ReactNode;
}) {
  const income = entry.amountCents > 0;
  const struck = entry.reversedBy !== null;
  const categories = [...new Set(entry.lines.map((line) => line.categoryName))];
  const targets = entry.lines
    .map((line) => line.department?.name ?? line.event?.title)
    .filter((value): value is string => Boolean(value));
  // Der steuerliche Bereich nur bei echten Einnahmen und Ausgaben (Umbuchung und Anfangsbestand sind neutral).
  const spheres = [
    ...new Set(
      entry.lines
        .filter((line) => line.sphere !== "NEUTRAL")
        .map((line) => SPHERE_LABEL[line.sphere]),
    ),
  ];
  return (
    <TableRow className={cn(struck && "text-muted-foreground")}>
      <TableCell className="hidden align-top tabular-nums sm:table-cell">
        <span className="block font-medium text-foreground">{entry.label}</span>
        <span className="text-sm text-muted-foreground">
          {formatCalendarDate(entry.bookingDate)}
        </span>
      </TableCell>
      <TableCell className="align-top whitespace-normal">
        {/* Am Handy stehen Nummer und Datum hier, ebenso Kategorie und Konto (auf Tablets). */}
        <span className="block text-sm text-muted-foreground tabular-nums sm:hidden">
          {entry.label} · {formatCalendarDate(entry.bookingDate)}
        </span>
        <span className={cn("block font-medium", !struck && "text-foreground")}>
          {entry.description}
        </span>
        {(entry.counterpartyName || entry.counterpartyMember) && (
          <span className="block text-sm text-muted-foreground">
            {entry.counterpartyMember?.name ?? entry.counterpartyName}
          </span>
        )}
        <span className="block text-sm text-muted-foreground lg:hidden">
          {categories.join(", ")}
          {targets.length > 0 && ` · ${targets.join(", ")}`}
        </span>
        <span className="block text-sm text-muted-foreground xl:hidden">{entry.account.name}</span>
        {entry.reversedBy && (
          <span className="block text-sm">storniert durch Nr. {entry.reversedBy.label}</span>
        )}
        {/* „Storno zu Nr. …“ steht schon in der Beschreibung des Stornos. */}
        {entry.attachments.map((attachment) =>
          attachment.documentId ? (
            <a
              key={attachment.id}
              href={`/api/finanzen/belege/${attachment.id}`}
              className="block text-sm break-words text-primary underline-offset-4 hover:underline"
            >
              <span className="sr-only">Beleg herunterladen: </span>
              {attachment.name}
            </a>
          ) : (
            <span key={attachment.id} className="block text-sm text-muted-foreground">
              Eigenbeleg: {attachment.note}
            </span>
          ),
        )}
        {entry.needsReceipt && (
          <span className="block text-sm font-medium text-amber-700 dark:text-amber-400">
            Beleg fehlt
          </span>
        )}
      </TableCell>
      <TableCell className="hidden align-top whitespace-normal lg:table-cell">
        <span className="block">{categories.join(", ")}</span>
        {spheres.length > 0 && (
          <span className="block text-xs text-muted-foreground">{spheres.join(", ")}</span>
        )}
        {targets.length > 0 && (
          <span className="block text-sm text-muted-foreground">{targets.join(", ")}</span>
        )}
      </TableCell>
      <TableCell className="hidden align-top xl:table-cell">{entry.account.name}</TableCell>
      <TableCell className="text-right align-top font-semibold whitespace-nowrap tabular-nums">
        <span
          className={cn(
            entry.kind === "STANDARD" &&
              income &&
              !struck &&
              "text-emerald-700 dark:text-emerald-400",
          )}
        >
          {formatSignedEuro(entry.amountCents)}
        </span>
        <span className="sr-only"> {entryKindText(entry)}</span>
      </TableCell>
      {canManage && <TableCell className="text-right align-top">{actions}</TableCell>}
    </TableRow>
  );
}
