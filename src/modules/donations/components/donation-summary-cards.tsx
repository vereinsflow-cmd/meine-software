import Link from "next/link";
import { FileCheckIcon, UsersIcon } from "lucide-react";
import { TILE_ACCENT } from "@/components/shared/accent";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DonorReceiptSummary } from "../receipt-status";
import { DONOR_GROUP_LABEL, type DonationsPageData } from "../summary";

/** Weiße Karte neben der violetten Kennzahl: Symbol (ab `sm`), Überschrift, große Zahl, Sätze und unten ein Link oder Balken. */
function SummaryCard({
  icon,
  title,
  children,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("min-w-0 gap-0 p-4 sm:p-5", className)}>
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            "hidden size-8 shrink-0 items-center justify-center rounded-[0.7rem] sm:flex [&_svg]:size-4",
            TILE_ACCENT.violet.chip,
          )}
        >
          {icon}
        </span>
        <h2 className="min-w-0 flex-1 pt-1 text-[0.9375rem] leading-snug font-semibold break-words">
          {title}
        </h2>
      </div>
      {children}
    </Card>
  );
}

const BIG = "text-[2.25rem] leading-none font-extrabold tracking-[-0.035em] tabular-nums";

/** „Spender 2026“: verschiedene Spender (ohne Spendendose), aufgeteilt nach Mitgliedern, Firmen/Stiftungen, weiteren Personen. */
export function DonorsCard({
  year,
  donors,
  className,
}: {
  year: number;
  donors: DonationsPageData["donors"];
  className?: string;
}) {
  const other = [
    donors.organizations > 0 ? DONOR_GROUP_LABEL.organizations(donors.organizations) : null,
    donors.otherPersons > 0 ? DONOR_GROUP_LABEL.otherPersons(donors.otherPersons) : null,
  ].filter((line): line is string => line !== null);
  return (
    <SummaryCard icon={<UsersIcon />} title={`Spender ${year}`} className={className}>
      <p className={cn("mt-3", BIG)}>{donors.total}</p>
      <div className="mt-2.5 grid gap-0.5 text-sm">
        {donors.total === 0 ? (
          <p className="text-muted-foreground">Noch keine Spender in {year}</p>
        ) : (
          <>
            {donors.members > 0 && (
              <p className="font-medium">{DONOR_GROUP_LABEL.members(donors.members)}</p>
            )}
            {other.length > 0 && (
              <p className={donors.members > 0 ? "text-muted-foreground" : "font-medium"}>
                {other.join(", ")}
              </p>
            )}
          </>
        )}
      </div>
      <Link
        href={`/finanzen/spenden/spender?jahr=${year}`}
        aria-label="Alle Spender ansehen"
        className="mt-auto self-start pt-4 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        <span className="sm:hidden">Alle ansehen</span>
        <span className="hidden sm:inline">Alle Spender ansehen</span>
      </Link>
    </SummaryCard>
  );
}

/**
 * „Bestätigungen“ je Spender: wie viele noch fehlen (bernstein), erstellt (grün), nicht nötig (grau) – als Zahl, Legende in
 * Worten und dreiteiliger Balken (schmückend, `aria-hidden`; alles steht als Text daneben). „unter 300 €“ nur, wenn im
 * grauen Topf ausschließlich Überweisungen bis 300 € liegen (K21).
 */
export function ReceiptsCard({
  receipts,
  className,
}: {
  receipts: DonorReceiptSummary;
  className?: string;
}) {
  const { missing, issued, notNeeded } = receipts;
  const total = missing + issued + notNeeded;
  const notNeededLabel = receipts.notNeededAllSimplified
    ? "nicht nötig, unter 300 €"
    : "nicht nötig";
  return (
    <SummaryCard icon={<FileCheckIcon />} title="Bestätigungen" className={className}>
      <p className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className={BIG}>{missing}</span>
        <span
          className={cn(
            "text-base font-semibold",
            missing > 0
              ? "text-amber-700 dark:text-amber-300"
              : "text-emerald-700 dark:text-emerald-400",
          )}
        >
          {missing === 1 ? "fehlt noch" : missing > 0 ? "fehlen noch" : "fehlen"}
        </span>
      </p>
      {total === 0 ? (
        <p className="mt-2.5 text-sm text-muted-foreground">Noch keine Spender</p>
      ) : (
        <ul className="mt-2.5 grid gap-0.5 text-sm">
          <li className="flex items-baseline gap-2">
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-[3px] bg-emerald-500" />
            <span className="font-medium">{issued} erstellt</span>
          </li>
          <li className="flex items-baseline gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 shrink-0 rounded-[3px] bg-foreground/25 dark:bg-white/30"
            />
            <span className="text-muted-foreground">
              {notNeeded} {notNeededLabel}
            </span>
          </li>
        </ul>
      )}
      {total > 0 && (
        <div aria-hidden="true" className="mt-auto pt-4">
          <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
            {missing > 0 && <span className="bg-amber-400" style={{ flex: missing }} />}
            {issued > 0 && <span className="bg-emerald-500" style={{ flex: issued }} />}
            {notNeeded > 0 && (
              <span className="bg-foreground/25 dark:bg-white/30" style={{ flex: notNeeded }} />
            )}
          </div>
        </div>
      )}
    </SummaryCard>
  );
}
