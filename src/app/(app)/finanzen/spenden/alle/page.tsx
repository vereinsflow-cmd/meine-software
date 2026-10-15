import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HandHeartIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SEGMENT_BAR, segmentItem } from "@/components/ui/segment-styles";
import { BackLink } from "@/components/shared/back-link";
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
import { formatEuroFromCents, todayCalendarDate } from "@/lib/dates";
import {
  buildQuery,
  enumParam,
  pageRequest,
  param,
  type RawSearchParams,
} from "@/lib/search-params";
import { cn } from "@/lib/utils";
import { DonationDialog } from "@/modules/donations/components/donation-dialog";
import { DonationsList } from "@/modules/donations/components/donations-list";
import { donationYears, YearSwitch } from "@/modules/donations/components/year-switch";
import { FREE_PURPOSE, FREE_PURPOSE_LABEL } from "@/modules/donations/format";
import {
  DONATION_STATUS_FILTER_LABEL,
  DONATION_STATUS_FILTERS,
  parseDonationStatusFilter,
  type DonationStatusFilter,
} from "@/modules/donations/schemas";
import { donationFormOptions, listDonations } from "@/modules/donations/service";
import { compareRows, matchesStatusFilter } from "@/modules/donations/summary";
import { canFinance } from "@/modules/finance/access";
import { FinanceHeader } from "@/modules/finance/components/finance-header";
import { getLedgerSetup } from "@/modules/finance/ledger";
import { financeTabCounts } from "@/modules/finance/overview";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Alle Spenden" };

const PAGE_SIZE = 25;
const BASE = "/finanzen/spenden/alle";

/** Filter „Art“ (`?art=`). */
const KINDS = [
  { value: "geld", kind: "MONEY", label: "Geldspenden" },
  { value: "sach", kind: "IN_KIND", label: "Sachspenden" },
  { value: "aufwand", kind: "EXPENSE_WAIVER", label: "Aufwandsspenden" },
] as const;

/**
 * Alle Spenden eines Jahres – ruhige Tabelle im Stil des Kassenbuchs (am Handy eine Liste). Filter: Stand der Bestätigung
 * (`?bestaetigung=`, Ziel der Punkte unter „Das steht an“), Art, Zweck, Suche nach Name, Zweck oder Buchungsnummer; Jahr über
 * `?jahr=`. Stornierte zählen nur unter „Storniert“. Ansehen mit `finance:read`, Aktionen („⋯“) nur mit `finance:manage`.
 */
export default async function AllDonationsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!canFinance(ctx, "finance:read")) return <NoAccess what="die Finanzen" />;
  const canManage = canFinance(ctx, "finance:manage");
  const today = todayCalendarDate();
  const setup = await getLedgerSetup(ctx);
  const { years, year } = donationYears(
    setup?.ledgerStartDate ?? null,
    today,
    param(params, "jahr"),
  );
  const status = parseDonationStatusFilter(param(params, "bestaetigung"));
  const kind = enumParam(
    params,
    "art",
    KINDS.map((k) => k.value),
  );
  const purpose = param(params, "zweck");
  const q = param(params, "q");
  const { page, pageSize } = pageRequest(params, PAGE_SIZE);

  // Zwei Abfragen (alles Geltende und das Stornierte) ergeben das ganze Jahr – Art, Zweck und Stand filtern danach rein,
  // so stimmen auch die Zahlen an den Filtern mit Art und Zweck.
  const [live, voided, options, counts] = await Promise.all([
    listDonations(ctx, { year, status: "alle", q }),
    listDonations(ctx, { year, status: "storniert", q }),
    canManage && setup ? donationFormOptions(ctx) : Promise.resolve(null),
    financeTabCounts(ctx),
  ]);
  const all = [...live.rows, ...voided.rows].sort(compareRows);
  const kindFilter = KINDS.find((k) => k.value === kind)?.kind;
  const narrowed = all.filter(
    (row) =>
      (!kindFilter || row.kind === kindFilter) && (!purpose || row.purpose.groupKey === purpose),
  );
  const statusCounts = Object.fromEntries(
    DONATION_STATUS_FILTERS.map((f) => [
      f,
      narrowed.filter((row) => matchesStatusFilter(row.state, f)).length,
    ]),
  ) as Record<DonationStatusFilter, number>;
  const rows = narrowed.filter((row) => matchesStatusFilter(row.state, status));
  const total = rows.length;
  const totalCents = rows.reduce((sum, row) => sum + row.amountCents, 0);
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (page > pageCount && total > 0) redirect(`${BASE}${buildQuery(params, { page: pageCount })}`);
  const shown = rows.slice((page - 1) * pageSize, page * pageSize);

  // Zwecke zur Auswahl: alle, die im Jahr vorkommen („Frei verwendbar“ zuletzt).
  const purposes = [
    ...new Map(all.map((row) => [row.purpose.groupKey, row.purpose.groupLabel])).entries(),
  ].sort(
    ([a, labelA], [b, labelB]) =>
      Number(a === FREE_PURPOSE) - Number(b === FREE_PURPOSE) || labelA.localeCompare(labelB, "de"),
  );
  if (purpose && !purposes.some(([key]) => key === purpose))
    purposes.push([purpose, purpose === FREE_PURPOSE ? FREE_PURPOSE_LABEL : "Gewählter Zweck"]);

  const filtered = Boolean(kind || purpose || q);
  const statusHref = (next: DonationStatusFilter) =>
    `${BASE}${buildQuery(params, { bestaetigung: next === "alle" ? undefined : next, page: undefined })}`;
  const visibleFilters = DONATION_STATUS_FILTERS.filter(
    (f) => f === "alle" || f === status || statusCounts[f] > 0,
  );
  const yearHref = (target: number) =>
    `${BASE}${buildQuery(params, { jahr: target === today.getUTCFullYear() ? undefined : target, page: undefined })}`;

  return (
    <>
      <FinanceHeader
        description={`Alle Spenden ${year}`}
        counts={counts}
        actions={
          options || years.length > 1 ? (
            <>
              {options && <DonationDialog options={options} />}
              <YearSwitch years={years} current={year} href={yearHref} />
            </>
          ) : undefined
        }
      />
      <BackLink
        href={
          year === today.getUTCFullYear() ? "/finanzen/spenden" : `/finanzen/spenden?jahr=${year}`
        }
      >
        Spenden {year}
      </BackLink>

      {all.length === 0 && !q ? (
        <EmptyState
          icon={<HandHeartIcon />}
          title={`Noch keine Spenden in ${year}`}
          description={
            canManage
              ? "Mit „Spende erfassen“ trägst du die erste ein – Geld, eine Sachspende oder einen Verzicht auf Auslagen."
              : "Sobald der Kassenwart Spenden erfasst, stehen sie hier."
          }
        />
      ) : (
        <>
          <nav
            aria-label="Nach Bestätigung filtern"
            className={cn(SEGMENT_BAR, "mb-4 max-w-full flex-nowrap overflow-x-auto")}
          >
            {visibleFilters.map((f) => (
              <Link
                key={f}
                href={statusHref(f)}
                aria-current={status === f ? "page" : undefined}
                className={segmentItem(status === f)}
              >
                {DONATION_STATUS_FILTER_LABEL[f]}
                <span className="text-xs tabular-nums opacity-80">{statusCounts[f]}</span>
              </Link>
            ))}
          </nav>

          <form method="get" action={BASE} role="search" className={cn("mb-4", FILTER_FORM)}>
            {year !== today.getUTCFullYear() && <input type="hidden" name="jahr" value={year} />}
            {status !== "alle" && <input type="hidden" name="bestaetigung" value={status} />}
            <Input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Name, Zweck oder Buchungsnummer …"
              aria-label="Spenden durchsuchen"
              className={FILTER_SEARCH}
            />
            <FilterToggle id="spenden-filter" active={[kind, purpose].filter(Boolean).length} />
            <FilterFields id="spenden-filter">
              <NativeSelect
                className={FILTER_SELECT}
                name="art"
                defaultValue={kind ?? ""}
                aria-label="Nach Art filtern"
              >
                <option value="">Alle Arten</option>
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect
                className={FILTER_SELECT}
                name="zweck"
                defaultValue={purpose ?? ""}
                aria-label="Nach Zweck filtern"
              >
                <option value="">Alle Zwecke</option>
                {purposes.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
              <div className="flex gap-2">
                <Button type="submit" variant="outline">
                  Filtern
                </Button>
                {filtered && (
                  <Button asChild variant="ghost">
                    <Link
                      href={`${BASE}${buildQuery(params, { art: undefined, zweck: undefined, q: undefined, page: undefined })}`}
                    >
                      Zurücksetzen
                    </Link>
                  </Button>
                )}
              </div>
            </FilterFields>
          </form>

          {total === 0 ? (
            <EmptyState
              icon={<HandHeartIcon />}
              title={filtered ? "Keine passenden Spenden" : "Hier steht gerade nichts"}
              description={
                filtered
                  ? "Passe die Suche oder den Filter an."
                  : status === "noetig"
                    ? "Für keine Spende fehlt eine Zuwendungsbestätigung."
                    : "In diesem Stand gibt es keine Spenden."
              }
            />
          ) : (
            <>
              <p className="mb-2 text-sm text-muted-foreground tabular-nums">
                {total === 1 ? "1 Spende" : `${total} Spenden`} · zusammen{" "}
                {formatEuroFromCents(totalCents)}
                {status === "storniert" && " (zählen nicht mit)"}
              </p>
              <DonationsList
                rows={shown}
                canManage={canManage}
                caption={`Spenden ${year}, neueste zuerst`}
              />
              <Pagination
                basePath={BASE}
                searchParams={params}
                page={page}
                pageCount={pageCount}
                total={total}
                pageSize={pageSize}
              />
            </>
          )}
        </>
      )}

      <p className="mt-6 max-w-3xl text-sm text-muted-foreground">
        „Nicht nötig“ heißt: Überweisung bis 300 € – dem Spender genügen sein Kontoauszug und der{" "}
        <Link
          href="/finanzen/spenden/beleg"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Beleg des Vereins
        </Link>
        . Eine Geldspende stornierst du über ihre Buchung im Kassenbuch.
      </p>
    </>
  );
}
