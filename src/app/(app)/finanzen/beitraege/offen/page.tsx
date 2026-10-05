import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SEGMENT_BAR, segmentItem } from "@/components/ui/segment-styles";
import { AREA_ICON } from "@/components/shared/area-icons";
import { EmptyState } from "@/components/shared/empty-state";
import { NoAccess } from "@/components/shared/no-access";
import { formatEuroFromCents } from "@/lib/dates";
import { param, type RawSearchParams } from "@/lib/search-params";
import { canFinance } from "@/modules/finance/access";
import { FinanceHeader } from "@/modules/finance/components/finance-header";
import { financeTabCounts } from "@/modules/finance/overview";
import { ChargesTable } from "@/modules/fees/components/charges-table";
import { FeesNav } from "@/modules/fees/components/fees-nav";
import { listCharges, type ChargeFilter } from "@/modules/fees/run";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Offene Beiträge" };

const FILTERS: { key: ChargeFilter; label: string }[] = [
  { key: "offen", label: "Offen" },
  { key: "bezahlt", label: "Bezahlt" },
  { key: "gestrichen", label: "Gestrichen" },
  { key: "alle", label: "Alle" },
];
const PAGE_SIZE = 50;

/**
 * Offene Beiträge (Etappe 7): die Forderungen an Mitglieder aus den Beitragsläufen – nach Fälligkeit. Gestrichene
 * stehen nicht im Standardfilter, bleiben aber mit Nummer erhalten. (Nicht zu verwechseln mit „Offene Zahlungen“: das sind
 * Rechnungen, die der Verein bezahlen muss.)
 */
export default async function OpenChargesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const ctx = await requirePageContext();
  if (!canFinance(ctx, "finance:read")) return <NoAccess what="die Finanzen" />;
  const canManage = canFinance(ctx, "finance:manage");
  const filter = FILTERS.find((f) => f.key === param(params, "status"))?.key ?? "offen";
  const page = Math.max(1, Number(param(params, "seite") ?? "1") || 1);
  const q = param(params, "q");
  const [result, counts] = await Promise.all([
    listCharges(ctx, { filter, q, page, pageSize: PAGE_SIZE }),
    financeTabCounts(ctx),
  ]);
  const href = (changes: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const values = { status: filter === "offen" ? undefined : filter, q, ...changes };
    for (const [key, value] of Object.entries(values)) if (value) next.set(key, value);
    const query = next.toString();
    return `/finanzen/beitraege/offen${query ? `?${query}` : ""}`;
  };
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  // Seite hinter dem Ende (z. B. nach dem Streichen des letzten Beitrags dort): zur letzten Seite.
  if (result.items.length === 0 && page > 1 && result.total > 0)
    redirect(href({ seite: pages > 1 ? String(pages) : undefined }));

  return (
    <>
      <FinanceHeader
        description={
          result.counts.offen > 0
            ? `Offen: ${formatEuroFromCents(result.openCents)} in ${result.counts.offen} ${result.counts.offen === 1 ? "Beitrag" : "Beiträgen"}${result.overdueCount > 0 ? `, davon ${result.overdueCount} überfällig` : ""}`
            : "Beiträge · keine offenen Beiträge"
        }
        counts={counts}
      />
      <FeesNav />

      {result.counts.alle === 0 && !q ? (
        <EmptyState
          icon={<AREA_ICON.finanzen />}
          title="Noch keine Beiträge"
          description="Beiträge entstehen mit dem Beitragslauf – erst prüfen, dann die Vorschau ansehen, dann erstellen."
          action={
            <Button asChild>
              <Link href="/finanzen/beitraege/lauf">Zum Beitragslauf</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <nav aria-label="Status" className={SEGMENT_BAR}>
              {FILTERS.map((f) => (
                <Link
                  key={f.key}
                  href={href({ status: f.key === "offen" ? undefined : f.key, seite: undefined })}
                  aria-current={filter === f.key ? "page" : undefined}
                  className={segmentItem(filter === f.key)}
                >
                  {f.label} <span className="tabular-nums">{result.counts[f.key]}</span>
                </Link>
              ))}
            </nav>
            <form
              method="get"
              action="/finanzen/beitraege/offen"
              role="search"
              className="flex gap-2"
            >
              {filter !== "offen" && <input type="hidden" name="status" value={filter} />}
              <Input
                type="search"
                name="q"
                defaultValue={q}
                placeholder="Name oder Nummer …"
                aria-label="Beiträge durchsuchen"
                className="w-56"
              />
              <Button type="submit" variant="outline">
                Suchen
              </Button>
            </form>
          </div>

          {result.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {q ? "Keine passenden Beiträge." : "Hier steht gerade nichts."}
            </p>
          ) : (
            <ChargesTable charges={result.items} caption="Beiträge" canManage={canManage} />
          )}

          {pages > 1 && (
            <nav aria-label="Seiten" className="mt-4 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Seite {page} von {pages}
              </span>
              <span className="flex gap-2">
                {page > 1 && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={href({ seite: String(page - 1) })}>Zurück</Link>
                  </Button>
                )}
                {page < pages && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={href({ seite: String(page + 1) })}>Weiter</Link>
                  </Button>
                )}
              </span>
            </nav>
          )}
        </>
      )}
    </>
  );
}
