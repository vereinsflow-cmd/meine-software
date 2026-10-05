import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NoAccess } from "@/components/shared/no-access";
import { formatCalendarDate, formatEuroFromCents, toDateInputValue } from "@/lib/dates";
import { canFinance } from "@/modules/finance/access";
import { FinanceHeader } from "@/modules/finance/components/finance-header";
import { financeTabCounts } from "@/modules/finance/overview";
import { ChargesTable } from "@/modules/fees/components/charges-table";
import { FeesNav } from "@/modules/fees/components/fees-nav";
import { RevertRunDialog } from "@/modules/fees/components/run-actions";
import { RunSteps, Tile } from "@/modules/fees/components/run-parts";
import { getFeeRun } from "@/modules/fees/run";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Beitragslauf" };

/**
 * Ein Beitragslauf nach dem Erstellen: Schritte erledigt, Summen, Nummern und alle Beiträge. „Rückgängig“, solange
 * nichts bezahlt oder erinnert ist – sonst steht da, was es verhindert.
 */
export default async function FeeRunDetailPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const ctx = await requirePageContext();
  if (!canFinance(ctx, "finance:read")) return <NoAccess what="die Finanzen" />;
  const canManage = canFinance(ctx, "finance:manage");
  const [run, counts] = await Promise.all([getFeeRun(ctx, runId), financeTabCounts(ctx)]);
  if (!run) notFound();
  const reverted = run.status === "REVERTED";
  const open = run.charges.filter((c) => c.status === "OPEN");
  const openCents = open.reduce((sum, c) => sum + c.openCents, 0);
  const debit = run.charges.filter(
    (c) => c.paymentMethod === "DIRECT_DEBIT" && c.status !== "VOID",
  );
  const title = `Beitragslauf ${run.label}`;

  return (
    <>
      <FinanceHeader description={`Beiträge · ${title}`} counts={counts} />
      <FeesNav />

      <Card className="mb-6">
        <CardContent className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <h2 className="text-xl font-bold">{title}</h2>
            <p className="text-sm text-muted-foreground">
              Zeitraum {formatCalendarDate(run.periodStart)} bis {formatCalendarDate(run.periodEnd)}{" "}
              · fällig am {formatCalendarDate(run.dueDate)} · erstellt am{" "}
              {formatCalendarDate(run.createdAt)}
            </p>
          </div>
          {reverted ? (
            <p className="text-sm font-medium">
              Rückgängig gemacht am {formatCalendarDate(run.revertedAt!)}: {run.revertReason}
            </p>
          ) : (
            <RunSteps
              steps={[
                { label: "Prüfen", state: "done" },
                { label: "Vorschau", state: "done" },
                { label: "Erstellen", state: "done" },
              ]}
            />
          )}
        </CardContent>
      </Card>

      <section aria-label="Summen" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          label="Beiträge"
          value={formatEuroFromCents(run.totalCents)}
          detail={`${run.chargeCount} ${run.chargeCount === 1 ? "Beitrag" : "Beiträge"}${reverted ? ", alle gestrichen" : ""}`}
        />
        <Tile
          label="Noch offen"
          value={formatEuroFromCents(openCents)}
          detail={`${open.length} ${open.length === 1 ? "Beitrag" : "Beiträge"}`}
        />
        <Tile
          label="Per Lastschrift"
          value={String(debit.length)}
          unit={debit.length === 1 ? "Beitrag" : "Beiträge"}
          detail={`Einzug ab ${formatCalendarDate(run.dueDate)}`}
        />
        <Tile
          label="Nummern"
          compact
          value={run.numberFrom ?? "–"}
          detail={
            run.numberTo && run.numberTo !== run.numberFrom ? `bis ${run.numberTo}` : undefined
          }
        />
      </section>

      {run.warnings.length > 0 && (
        <details className="mb-6 rounded-xl border bg-card p-4 text-sm shadow-xs">
          <summary className="cursor-pointer font-semibold">
            Hinweise beim Erstellen ({run.warnings.length})
          </summary>
          <ul className="mt-2 grid gap-1">
            {run.warnings.map((text, index) => (
              <li key={index}>{text}</li>
            ))}
          </ul>
        </details>
      )}

      <ChargesTable
        charges={run.charges}
        caption={`Beiträge ${title}`}
        canManage={canManage && !reverted}
      />

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-xs">
        <p className="max-w-xl text-sm text-muted-foreground">
          {reverted
            ? "Alle Beiträge dieses Laufs sind gestrichen. Der Zeitraum lässt sich neu erstellen."
            : run.blockers.length > 0
              ? `Rückgängig geht nicht mehr: ${run.blockers.join(", ")}. Einzelne offene Beiträge lassen sich stattdessen streichen.`
              : "Solange nichts bezahlt oder erinnert ist, lässt sich der ganze Lauf rückgängig machen."}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href={`/finanzen/beitraege/lauf?zeitraum=${toDateInputValue(run.periodStart)}`}>
              {reverted ? "Neu erstellen" : "Nachlauf prüfen"}
            </Link>
          </Button>
          {canManage && !reverted && run.blockers.length === 0 && (
            <RevertRunDialog id={run.id} label={title} />
          )}
        </div>
      </div>
    </>
  );
}
