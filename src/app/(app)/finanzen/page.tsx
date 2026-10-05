import type { Metadata } from "next";
import Link from "next/link";
import { HandHeartIcon, ReceiptTextIcon, TrendingUpIcon, WalletIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NoAccess } from "@/components/shared/no-access";
import {
  formatCalendarDate,
  formatEuroFromCents,
  MONTH_NAMES,
  todayCalendarDate,
} from "@/lib/dates";
import { cn } from "@/lib/utils";
import { canFinance } from "@/modules/finance/access";
import { EntryDialog } from "@/modules/finance/components/entry-dialog";
import { FinanceHeader } from "@/modules/finance/components/finance-header";
import { FinanceKpiCard } from "@/modules/finance/components/finance-kpi-card";
import { MonthChart } from "@/modules/finance/components/month-chart";
import { entryFormOptions } from "@/modules/finance/ledger";
import { ACCOUNT_KIND_LABEL } from "@/modules/finance/ledger-format";
import { financeTabCounts, getFinanceOverview, type DueItem } from "@/modules/finance/overview";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Finanzen" };

/** „Sep 26“ → Punkte für den kleinen Kurs auf den Kennzahlen. */
function monthPoints(year: number, values: number[]) {
  return values.map((value, index) => ({
    label: MONTH_NAMES[index]!.slice(0, 3),
    fullLabel: `${MONTH_NAMES[index]} ${year}`,
    value,
  }));
}

const TONE_TEXT: Record<DueItem["tone"], string> = {
  danger: "text-red-700 dark:text-red-400",
  warning: "text-amber-700 dark:text-amber-400",
  success: "text-emerald-700 dark:text-emerald-400",
  neutral: "text-muted-foreground",
};

/**
 * Finanzen – Übersicht („Cockpit“, Entwurf 3, gewählt am 04.10.2026): vier Kennzahlen mit Farbverlauf (Kontostand, offene
 * Rechnungen, Überschuss, Spenden), Einnahmen und Ausgaben je Monat, „Das steht an“, Ausgaben je Abteilung und die Konten.
 * Farbverläufe nur auf den Kennzahlen, alles andere in ruhigen weißen Karten; ein blauer Knopf je Seite.
 */
export default async function FinancePage() {
  const ctx = await requirePageContext();
  if (!canFinance(ctx, "finance:read")) return <NoAccess what="die Finanzen" />;

  const [overview, options, counts] = await Promise.all([
    getFinanceOverview(ctx),
    canFinance(ctx, "finance:manage") ? entryFormOptions(ctx) : Promise.resolve(null),
    financeTabCounts(ctx),
  ]);
  const today = todayCalendarDate();
  const year = today.getUTCFullYear();
  // Der Überschuss zählt ab Jahresbeginn – oder ab dem Start des Kassenbuchs, wenn es erst im Jahr begann.
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const surplusSince =
    overview.setup && overview.setup.ledgerStartDate.getTime() > yearStart.getTime()
      ? overview.setup.ledgerStartDate
      : yearStart;
  const { donations } = overview;
  const { payments } = overview;
  const now = overview.due.filter((item) => !item.later);
  const later = overview.due.filter((item) => item.later);

  return (
    <>
      <FinanceHeader
        description={`Geschäftsjahr ${year} · Stand ${formatCalendarDate(today)}`}
        counts={counts}
        actions={
          overview.canManage && options ? (
            <EntryDialog
              options={options}
              trigger={<Button>Einnahme oder Ausgabe erfassen</Button>}
            />
          ) : undefined
        }
      />

      <section aria-label="Kennzahlen" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceKpiCard
          label="Kontostand gesamt"
          accent="blue"
          icon={<WalletIcon />}
          valueCents={overview.totalBalanceCents}
          href="/finanzen/kassenbuch"
          lines={
            overview.setup
              ? [overview.accounts.map((a) => a.name).join(" und ") || "Noch keine Konten"]
              : ["Kassenbuch noch nicht eingerichtet"]
          }
          points={overview.balancePoints.map((p) => ({
            label: MONTH_NAMES[Number(p.month.slice(5)) - 1]!.slice(0, 3),
            fullLabel: `${MONTH_NAMES[Number(p.month.slice(5)) - 1]} ${p.month.slice(0, 4)}`,
            value: p.balanceCents,
          }))}
        />
        <FinanceKpiCard
          label="Offene Rechnungen"
          accent="amber"
          icon={<ReceiptTextIcon />}
          valueCents={payments.totalCents}
          href="/finanzen/rechnungen?stand=offen"
          lines={[
            payments.count === 0
              ? "Nichts zu bezahlen"
              : payments.count === 1
                ? "1 Rechnung zu bezahlen"
                : `${payments.count} Rechnungen zu bezahlen`,
            payments.overdueCount > 0
              ? `davon ${payments.overdueCount} überfällig`
              : payments.count > 0
                ? "nichts überfällig"
                : "",
          ].filter(Boolean)}
        />
        <FinanceKpiCard
          label={`Überschuss ${year}`}
          accent="emerald"
          icon={<TrendingUpIcon />}
          valueCents={overview.year?.surplusCents ?? 0}
          signed
          href="/finanzen/kassenbuch"
          lines={["Einnahmen minus Ausgaben", `seit ${formatCalendarDate(surplusSince)}`]}
          points={monthPoints(year, overview.surplusPoints)}
        />
        <FinanceKpiCard
          label={`Spenden ${year}`}
          accent="violet"
          icon={<HandHeartIcon />}
          valueCents={donations.totalCents}
          lines={[
            donations.count === 0
              ? "Noch keine Spenden gebucht"
              : donations.donors > 0
                ? donations.donors === 1
                  ? "von 1 Spender"
                  : `von ${donations.donors} Spendern`
                : donations.count === 1
                  ? "1 Spende"
                  : `${donations.count} Spenden`,
          ]}
          points={monthPoints(year, donations.cumulative)}
        />
      </section>

      <div className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
        <Card>
          <CardContent className="grid gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div>
                <h2 className="text-lg font-semibold">Einnahmen und Ausgaben {year}</h2>
                <p className="text-sm text-muted-foreground">
                  Je Monat, ohne Umbuchungen und Anfangsbestände
                </p>
              </div>
              <Link
                href="/finanzen/kassenbuch"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Kassenbuch öffnen
              </Link>
            </div>
            {overview.year ? (
              <>
                <dl className="flex flex-wrap gap-x-10 gap-y-2">
                  <div>
                    <dt className="flex items-center gap-2 text-sm">
                      <span
                        className="size-2.5 rounded-[3px] bg-[var(--chart-1)]"
                        aria-hidden="true"
                      />{" "}
                      Einnahmen
                    </dt>
                    <dd className="text-2xl font-bold tabular-nums">
                      {formatEuroFromCents(overview.year.incomeCents)}
                    </dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-2 text-sm">
                      <span
                        className="size-2.5 rounded-[3px] bg-[var(--chart-2)]"
                        aria-hidden="true"
                      />{" "}
                      Ausgaben
                    </dt>
                    <dd className="text-2xl font-bold tabular-nums">
                      {formatEuroFromCents(overview.year.expenseCents)}
                    </dd>
                  </div>
                </dl>
                <MonthChart year={year} months={overview.year.months} legend={false} />
              </>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Sobald das Kassenbuch eingerichtet ist, stehen hier die Einnahmen und Ausgaben je
                Monat.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-1">
            <h2 className="text-lg font-semibold">Das steht an</h2>
            {now.length === 0 && later.length === 0 ? (
              <p className="py-6 text-sm text-muted-foreground">
                Alles erledigt – gerade ist nichts zu tun.
              </p>
            ) : (
              <>
                <p className="mb-2 text-sm text-muted-foreground">
                  {now.length === 0
                    ? "Gerade ist nichts dringend."
                    : overview.canManage
                      ? now.length === 1
                        ? "1 Punkt für dich"
                        : `${now.length} Punkte für dich`
                      : now.length === 1
                        ? "1 offener Punkt"
                        : `${now.length} offene Punkte`}
                </p>
                <ul className="grid">
                  {now.map((item, index) => (
                    <DueRow key={item.key} item={item} primary={index === 0} />
                  ))}
                </ul>
                {later.length > 0 && (
                  <>
                    <h3 className="mt-4 text-sm font-semibold text-muted-foreground">Demnächst</h3>
                    <ul className="grid">
                      {later.map((item) => (
                        <DueRow key={item.key} item={item} />
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {overview.setup && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
          <Card>
            <CardContent className="grid gap-4">
              <div>
                <h2 className="text-lg font-semibold">Ausgaben der Abteilungen {year}</h2>
                <p className="text-sm text-muted-foreground">
                  Buchungen, die einer Abteilung zugeordnet sind
                </p>
              </div>
              {overview.departments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Noch keine Buchungen mit Abteilung. Beim Buchen kannst du jede Einnahme oder
                  Ausgabe einer Abteilung zuordnen.
                </p>
              ) : (
                <DepartmentBars departments={overview.departments} />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="grid gap-3">
              <div>
                <h2 className="text-lg font-semibold">Konten</h2>
                <p className="text-sm text-muted-foreground">Stand {formatCalendarDate(today)}</p>
              </div>
              <ul className="grid">
                {overview.accounts.map((account) => (
                  <li
                    key={account.id}
                    className="flex items-baseline justify-between gap-4 border-t py-3 first:border-t-0 first:pt-0"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold">{account.name}</p>
                      {(account.bankName ??
                        (ACCOUNT_KIND_LABEL[account.kind] !== account.name
                          ? ACCOUNT_KIND_LABEL[account.kind]
                          : null)) && (
                        <p className="text-sm text-muted-foreground">
                          {account.bankName ?? ACCOUNT_KIND_LABEL[account.kind]}
                        </p>
                      )}
                    </div>
                    <p
                      className={cn(
                        "font-semibold tabular-nums",
                        account.balanceCents < 0 && "text-red-700 dark:text-red-400",
                      )}
                    >
                      {formatEuroFromCents(account.balanceCents)}
                    </p>
                  </li>
                ))}
                <li className="flex items-baseline justify-between gap-4 border-t pt-3 text-sm">
                  <span>Zusammen</span>
                  <span className="font-semibold tabular-nums">
                    {formatEuroFromCents(overview.totalBalanceCents)}
                  </span>
                </li>
              </ul>
              <Button asChild variant="outline" className="mt-1">
                <Link href="/finanzen/kassenbuch">Kassenbuch öffnen</Link>
              </Button>
              {overview.canManage && (
                <Link
                  href="/finanzen/einstellungen"
                  className="justify-self-center text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Konten und Kategorien verwalten
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

function DueRow({ item, primary = false }: { item: DueItem; primary?: boolean }) {
  return (
    <li className="grid gap-1 border-t py-3 first:border-t-0 first:pt-1">
      <p className="font-semibold">{item.title}</p>
      <p className="text-sm text-muted-foreground">
        {item.detail}
        {item.statusText && (
          <>
            {" "}
            <span className={cn("font-medium", TONE_TEXT[item.tone])}>{item.statusText}</span>
          </>
        )}
      </p>
      {primary ? (
        <Button asChild size="sm" className="mt-1 justify-self-start">
          <Link href={item.href}>{item.actionLabel}</Link>
        </Button>
      ) : (
        <Link
          href={item.href}
          className="justify-self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {item.actionLabel}
        </Link>
      )}
    </li>
  );
}

function DepartmentBars({
  departments,
}: {
  departments: { departmentId: string; name: string; expenseCents: number; incomeCents: number }[];
}) {
  const max = Math.max(...departments.map((d) => d.expenseCents), 1);
  return (
    <ul className="grid gap-3">
      {departments.map((department) => (
        <li
          key={department.departmentId}
          className="grid gap-1.5 sm:grid-cols-[9rem_minmax(0,1fr)_11rem] sm:items-center sm:gap-4"
        >
          <span className="font-medium">{department.name}</span>
          <span aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full rounded-full bg-primary"
              style={{
                width: `${Math.max(2, Math.round((department.expenseCents / max) * 100))}%`,
              }}
            />
          </span>
          <span className="text-sm tabular-nums sm:text-right">
            <span className="font-semibold">{formatEuroFromCents(department.expenseCents)}</span>{" "}
            ausgegeben
            {department.incomeCents > 0 && (
              <span className="block text-muted-foreground">
                {formatEuroFromCents(department.incomeCents)} eingenommen
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
