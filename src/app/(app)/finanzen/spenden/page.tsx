import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NoAccess } from "@/components/shared/no-access";
import {
  formatCalendarDate,
  formatEuroFromCents,
  MONTH_NAMES,
  todayCalendarDate,
} from "@/lib/dates";
import { param, type RawSearchParams } from "@/lib/search-params";
import { DonationDialog } from "@/modules/donations/components/donation-dialog";
import { DonationMonthChart } from "@/modules/donations/components/donation-month-chart";
import { DonorsCard, ReceiptsCard } from "@/modules/donations/components/donation-summary-cards";
import { DonationsKpiCard } from "@/modules/donations/components/donations-kpi-card";
import { LatestDonations } from "@/modules/donations/components/latest-donations";
import { PurposeBars } from "@/modules/donations/components/purpose-bars";
import { donationYears, YearSwitch } from "@/modules/donations/components/year-switch";
import { donationFormOptions, getDonationsPage } from "@/modules/donations/service";
import { canFinance } from "@/modules/finance/access";
import { DueList } from "@/modules/finance/components/due-list";
import { FinanceHeader } from "@/modules/finance/components/finance-header";
import { getLedgerSetup, listCategories } from "@/modules/finance/ledger";
import { financeTabCounts, type DueItem } from "@/modules/finance/overview";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Spenden" };

const plural = (count: number, one: string, many: string) =>
  count === 1 ? `1 ${one}` : `${count} ${many}`;

/** Zeilen im Kasten „Nach Art“. */
const KIND_LINES = [
  { kind: "MONEY", label: "Geldspenden" },
  { kind: "IN_KIND", label: "Sachspenden" },
  { kind: "EXPENSE_WAIVER", label: "Aufwandsspenden" },
] as const;

/**
 * Spenden – „Spenden-Cockpit“ (Entwurf 3, gewählt am 07.10.2026): große violette Karte mit Summe, Arten und Verlauf, daneben
 * „Spender“ und „Bestätigungen“; darunter „Das steht an“, „Spenden je Monat“, „Letzte Spenden“ und „Wofür gespendet wurde“.
 * Alle Zahlen kommen aus `getDonationsPage` (dieselbe Quelle wie die violette Karte der Übersicht). Ansehen mit
 * `finance:read`, „Spende erfassen“ nur mit `finance:manage`. `?jahr=` wählt ein Jahr ab Beginn des Kassenbuchs.
 *
 * Reihenfolge im Quelltext = Reihenfolge am Handy (Das steht an → Monate → Letzte Spenden → Wofür). Ab `xl` zwei Spalten
 * (1,85 : 1) wie die Übersicht: links Monate und Letzte Spenden untereinander, rechts „Das steht an“ und darunter „Wofür“ –
 * beide Spalten laufen unabhängig, ohne Lücken.
 */
export default async function DonationsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!canFinance(ctx, "finance:read")) return <NoAccess what="die Finanzen" />;
  const canManage = canFinance(ctx, "finance:manage");
  const today = todayCalendarDate();
  const thisYear = today.getUTCFullYear();
  // Das gewünschte Jahr gleich mitladen – nur ein Jahr vor Beginn des Kassenbuchs lädt danach das aktuelle.
  const asked = Number(param(params, "jahr"));
  const first = Number.isInteger(asked) && asked >= 2000 && asked <= thisYear ? asked : thisYear;
  const [setup, counts, categories, options, firstPage] = await Promise.all([
    getLedgerSetup(ctx),
    financeTabCounts(ctx),
    listCategories(ctx),
    canManage ? donationFormOptions(ctx) : Promise.resolve(null),
    getDonationsPage(ctx, first),
  ]);

  if (!setup) {
    return (
      <>
        <FinanceHeader description="Spenden, Spender und Zuwendungsbestätigungen" counts={counts} />
        <Card className="max-w-3xl">
          <CardContent>
            <p className="text-sm">
              Richte zuerst das Kassenbuch ein. Danach erfasst du hier Spenden – Geld, Sachspenden
              und Verzicht auf Auslagen.
            </p>
            <Button asChild className="mt-3">
              <Link href="/finanzen/kassenbuch">Zum Kassenbuch</Link>
            </Button>
          </CardContent>
        </Card>
      </>
    );
  }

  const { years, year } = donationYears(setup.ledgerStartDate, today, String(first));
  const page = year === first ? firstPage : await getDonationsPage(ctx, year);
  const current = year === thisYear;
  const { kpi } = page;
  const empty = kpi.count === 0;
  const yearQuery = current ? "" : `jahr=${year}`;
  const withYear = (href: string) =>
    yearQuery && href.startsWith("/finanzen/spenden/")
      ? `${href}${href.includes("?") ? "&" : "?"}${yearQuery}`
      : href;
  // Punkte, die zu Listen dieser Seite führen, behalten das gewählte Jahr.
  const due: DueItem[] = page.due.map((item) => ({ ...item, href: withYear(item.href) }));
  const donationsCategory = categories.find((category) => category.systemKey === "DONATIONS");
  const lastMonth = page.months.at(-1)?.month ?? 11;

  return (
    <>
      <FinanceHeader
        description={
          current
            ? `Geschäftsjahr ${year} · Stand ${formatCalendarDate(today)}`
            : `Geschäftsjahr ${year}`
        }
        counts={counts}
        actions={
          options || years.length > 1 ? (
            <>
              {options && <DonationDialog options={options} />}
              <YearSwitch
                years={years}
                current={year}
                href={(target) =>
                  target === thisYear ? "/finanzen/spenden" : `/finanzen/spenden?jahr=${target}`
                }
              />
            </>
          ) : undefined
        }
      />

      <section aria-label="Kennzahlen" className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <DonationsKpiCard
          className="col-span-2"
          label={`Spenden ${year}`}
          totalCents={kpi.totalCents}
          lines={
            empty
              ? [`Noch keine Spenden in ${year}`]
              : [
                  kpi.donorCount > 0
                    ? `${plural(kpi.count, "Spende", "Spenden")} von ${plural(kpi.donorCount, "Spender", "Spendern")}`
                    : plural(kpi.count, "Spende", "Spenden"),
                  kpi.boundCents > 0
                    ? `${formatEuroFromCents(kpi.boundCents)} mit festem Zweck`
                    : "Alles frei verwendbar",
                ]
          }
          byKind={
            empty ? [] : KIND_LINES.map(({ kind, label }) => ({ label, cents: kpi.byKind[kind] }))
          }
          points={kpi.cumulative.map((value, index) => ({
            label: MONTH_NAMES[index]!.slice(0, 3),
            fullLabel: `${MONTH_NAMES[index]} ${year}`,
            value,
          }))}
        />
        <DonorsCard year={year} donors={page.donors} />
        <ReceiptsCard receipts={page.receipts} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] xl:grid-rows-[auto_1fr] xl:items-start">
        <Card className="xl:col-start-2 xl:row-start-1">
          <CardContent className="grid gap-1">
            <h2 className="text-lg font-semibold">Das steht an</h2>
            <DueList items={due} canManage={canManage} empty="Gerade ist hier nichts zu tun." />
          </CardContent>
        </Card>

        <div className="grid content-start gap-6 xl:col-start-1 xl:row-span-2 xl:row-start-1">
          <Card>
            <CardContent className="grid gap-4">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div>
                  <h2 className="text-lg font-semibold">Spenden je Monat</h2>
                  <p className="text-sm text-muted-foreground">
                    {current
                      ? `Januar bis ${formatCalendarDate(today)}`
                      : `Januar bis ${MONTH_NAMES[lastMonth]} ${year}`}
                    , nach Tag der Zuwendung
                  </p>
                </div>
                <Link
                  href={
                    donationsCategory
                      ? `/finanzen/kassenbuch?kategorie=${donationsCategory.id}`
                      : "/finanzen/kassenbuch"
                  }
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Im Kassenbuch ansehen
                </Link>
              </div>
              {empty ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Noch keine Spenden in {year}.
                </p>
              ) : (
                <DonationMonthChart year={year} months={page.months} current={current} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div>
                  <h2 className="text-lg font-semibold">Letzte Spenden</h2>
                  {!empty && (
                    <p className="text-sm text-muted-foreground">
                      {kpi.count > page.latest.length
                        ? `Die fünf neuesten von ${kpi.count}`
                        : kpi.count === 1
                          ? "Bisher eine Spende"
                          : `Alle ${kpi.count} Spenden, die neueste zuerst`}
                    </p>
                  )}
                </div>
                {!empty && (
                  <Link
                    href={withYear("/finanzen/spenden/alle")}
                    className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Alle anzeigen
                  </Link>
                )}
              </div>
              {empty ? (
                <p className="py-6 text-sm text-muted-foreground">
                  Noch keine Spenden.
                  {canManage && " Mit „Spende erfassen“ trägst du die erste ein."}
                </p>
              ) : (
                <LatestDonations rows={page.latest} caption={`Die neuesten Spenden ${year}`} />
              )}
            </CardContent>
          </Card>
        </div>

        {!empty && (
          <Card className="xl:col-start-2 xl:row-start-2">
            <CardContent className="grid gap-4">
              <div>
                <h2 className="text-lg font-semibold">Wofür gespendet wurde</h2>
                <p className="text-sm text-muted-foreground">
                  {kpi.boundCents > 0
                    ? `${formatEuroFromCents(kpi.boundCents)} ${kpi.boundCents === 100 ? "hat" : "haben"} einen festen Zweck`
                    : "Alles ist frei verwendbar"}
                </p>
              </div>
              <PurposeBars purposes={page.purposes} year={year} />
              <p className="border-t pt-3 text-sm text-muted-foreground">
                Geld mit festem Zweck darf der Verein nur dafür ausgeben.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
