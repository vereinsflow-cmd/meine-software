import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRightIcon, WalletIcon } from "lucide-react";
import { CARD_TITLE, Card, CardContent } from "@/components/ui/card";
import { AREA_ICON } from "@/components/shared/area-icons";
import { CompactEmpty } from "@/components/shared/compact-empty";
import { NoAccess } from "@/components/shared/no-access";
import { PageStack } from "@/components/shared/page-section";
import { formatCalendarDate, formatEuroFromCents, todayCalendarDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { can } from "@/server/permissions/policy";
import { accountCards } from "@/modules/finance/account-cards";
import { canFinance } from "@/modules/finance/access";
import { ACCOUNTS_COLUMN, AccountCardStack } from "@/modules/finance/components/account-card-stack";
import { DepartmentPots } from "@/modules/finance/components/department-pots";
import { DueList } from "@/modules/finance/components/due-list";
import { FinanceHeader } from "@/modules/finance/components/finance-header";
import { FinanceHero } from "@/modules/finance/components/finance-hero";
import { FinanceYearCard } from "@/modules/finance/components/finance-year-card";
import { QuickActions } from "@/modules/finance/components/quick-actions";
import { RecentEntries } from "@/modules/finance/components/recent-entries";
import { entryFormOptions } from "@/modules/finance/ledger";
import { financeTabCounts, getFinanceOverview } from "@/modules/finance/overview";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Finanzen" };

/** Zwei Spalten ab 1280 px: links der breite Teil (Kopf, Buchungen), rechts Konten und „Das steht an“. */
const COLUMNS = "grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]";

/**
 * Finanzen – Übersicht („Wie eine Banking-App“, Entwurf 1, umgesetzt am 21.10.2026; vorher „Cockpit“ mit vier Kennzahlkarten):
 * oben auf der Nacht der Kontostand aller Konten mit Veränderung seit Monatsbeginn, Monat rein/raus, offenen Rechnungen,
 * runden Schnellaktionen und dem Kontoverlauf je Tag; rechts die Konten als Bankkarten. Darunter „Zuletzt gebucht“ und „Das
 * steht an“, dann Einnahmen und Ausgaben des Jahres mit Überschuss und Spenden (Balken, „Als Tabelle“) und die Abteilungen
 * als Foto-Töpfe. Ohne Kassenbuch ein ehrlicher Leerzustand mit dem Weg zum Einrichten (keine 0,00 €, kein leeres Diagramm).
 * Rechte wie bisher: ansehen mit `finance:read`, Schnellaktionen und Verwalten nur mit `finance:manage` (Rechnung zusätzlich
 * mit „Dokumente hochladen“).
 */
export default async function FinancePage() {
  const ctx = await requirePageContext();
  if (!canFinance(ctx, "finance:read")) return <NoAccess what="die Finanzen" />;

  const canManage = canFinance(ctx, "finance:manage");
  const [overview, options, counts] = await Promise.all([
    getFinanceOverview(ctx),
    canManage ? entryFormOptions(ctx) : Promise.resolve(null),
    financeTabCounts(ctx),
  ]);
  const today = todayCalendarDate();
  const year = today.getUTCFullYear();
  const { setup, payments } = overview;
  // Der Überschuss zählt ab Jahresbeginn – oder ab dem Start des Kassenbuchs, wenn es erst im Jahr begann.
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const surplusSince =
    setup && setup.ledgerStartDate.getTime() > yearStart.getTime()
      ? setup.ledgerStartDate
      : yearStart;
  // Motive der Kontokarten: Fotos der Abteilungen mit Buchungen (aus den Finanzdaten – kein Abteilungsrecht nötig).
  const cards = accountCards(
    overview.accounts,
    overview.departments.map((department) => department.name),
  );

  const hero = (
    <FinanceHero
      ledgerReady={setup !== null}
      totalCents={overview.totalBalanceCents}
      curve={overview.balanceCurve}
      month={overview.year?.months[today.getUTCMonth()] ?? null}
      today={today}
      payments={payments}
      canManage={canManage}
      actions={
        <QuickActions
          entryOptions={options}
          canManage={canManage}
          canUploadInvoice={canManage && can(ctx, "documents:upload")}
          ledgerReady={setup !== null}
          className="w-full justify-between sm:w-auto sm:justify-start sm:pt-1"
        />
      }
    />
  );

  const due = (
    <Card className="self-start">
      <CardContent className="grid gap-1">
        <h2 className={CARD_TITLE}>Das steht an</h2>
        <DueList items={overview.due} canManage={canManage} />
      </CardContent>
    </Card>
  );

  const accountsHead = (
    <div className="flex items-baseline justify-between gap-4 px-1">
      <h2 id="finanzen-konten" className={CARD_TITLE}>
        Konten
      </h2>
      <Link
        href="/finanzen/kassenbuch"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Kassenbuch <ArrowRightIcon aria-hidden="true" className="size-3.5" />
      </Link>
    </div>
  );

  // Ohne Kassenbuch: Kopf mit Leerzustand, daneben „Konten“ (noch keine) und „Das steht an“ – Jahreszahlen, Buchungen und
  // Abteilungen gibt es noch nicht und fehlen deshalb ganz.
  if (!setup) {
    return (
      <PageStack>
        <FinanceHeader
          description={`Geschäftsjahr ${year} · Stand ${formatCalendarDate(today)}`}
          counts={counts}
        />
        <div className={COLUMNS}>
          {hero}
          <div className="grid grid-cols-1 content-start gap-6">
            <section aria-labelledby="finanzen-konten" className="grid grid-cols-1 gap-4">
              {accountsHead}
              <CompactEmpty card icon={<WalletIcon />} accent="blue" title="Noch keine Konten">
                Beim Einrichten legst du Girokonto und Barkasse an – hier stehen sie dann als Karten
                mit ihrem Stand.
              </CompactEmpty>
            </section>
            {due}
          </div>
        </div>
      </PageStack>
    );
  }

  const recent = overview.recent;
  return (
    <PageStack>
      <FinanceHeader
        description={`Geschäftsjahr ${year} · Stand ${formatCalendarDate(today)}`}
        counts={counts}
      />

      <div className={COLUMNS}>
        {hero}
        <section
          aria-labelledby="finanzen-konten"
          className={cn("grid grid-cols-1 content-start gap-4", ACCOUNTS_COLUMN)}
        >
          {accountsHead}
          {cards.length > 0 ? (
            <>
              <AccountCardStack cards={cards} clubName={ctx.club.name} />
              <p className="flex items-baseline justify-between gap-4 rounded-2xl bg-card px-4 py-3 text-sm ring-1 ring-foreground/10 dark:ring-foreground/15">
                <span>
                  Zusammen{" "}
                  <span className="text-muted-foreground">
                    · {cards.length === 1 ? "1 Konto" : `${cards.length} Konten`}
                  </span>
                </span>
                <span className="font-semibold tabular-nums">
                  {formatEuroFromCents(overview.totalBalanceCents)}
                </span>
              </p>
            </>
          ) : (
            <CompactEmpty card icon={<WalletIcon />} accent="blue" title="Keine aktiven Konten">
              Alle Konten sind archiviert – unter „Konten und Kategorien“ lässt sich eines wieder
              aktivieren.
            </CompactEmpty>
          )}
          {canManage && (
            <Link
              href="/finanzen/einstellungen"
              className="justify-self-center text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Konten und Kategorien verwalten
            </Link>
          )}
        </section>
      </div>

      <div className={COLUMNS}>
        <Card>
          <CardContent className="grid grid-cols-1 gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <div>
                <h2 className={CARD_TITLE}>Zuletzt gebucht</h2>
                <p className="text-sm text-muted-foreground">
                  {!recent || recent.total === 0
                    ? "Noch keine Buchungen"
                    : recent.total <= recent.entries.length
                      ? recent.total === 1
                        ? "Die einzige Buchung"
                        : `Alle ${recent.total} Buchungen`
                      : `Die letzten ${recent.entries.length} von ${recent.total} Buchungen`}
                </p>
              </div>
              <Link
                href="/finanzen/kassenbuch"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Alle Buchungen
              </Link>
            </div>
            {recent && recent.entries.length > 0 ? (
              <div className="-mx-2">
                <RecentEntries entries={recent.entries} today={today} />
              </div>
            ) : (
              <CompactEmpty icon={<WalletIcon />} accent="slate" title="Noch nichts gebucht">
                Jede Einnahme und Ausgabe erscheint hier sofort – mit Symbol und Betrag.
              </CompactEmpty>
            )}
          </CardContent>
        </Card>
        {due}
      </div>

      {overview.year && (
        <FinanceYearCard
          year={year}
          summary={overview.year}
          surplusSince={surplusSince}
          donations={overview.donations}
        />
      )}

      <section aria-labelledby="finanzen-abteilungen" className="grid grid-cols-1 gap-4">
        <div className="px-1">
          <h2 id="finanzen-abteilungen" className={CARD_TITLE}>
            Ausgaben der Abteilungen {year}
          </h2>
          <p className="text-sm text-muted-foreground">
            Was die Abteilungen ausgegeben und eingenommen haben – aus den Buchungen mit Abteilung
          </p>
        </div>
        {overview.departments.length > 0 ? (
          <DepartmentPots departments={overview.departments} />
        ) : (
          <CompactEmpty
            card
            icon={<AREA_ICON.abteilungen />}
            accent="slate"
            title="Noch keine Buchungen mit Abteilung"
          >
            Beim Buchen kannst du jede Einnahme oder Ausgabe einer Abteilung zuordnen.
          </CompactEmpty>
        )}
      </section>
    </PageStack>
  );
}
