import { TableSkeleton } from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { todayCalendarDate } from "@/lib/dates";
import { FinanceLoading } from "@/modules/finance/components/finance-skeletons";

/**
 * Ladezustand der Spender: Zurück-Link, Umschalter „Mit Spenden in … | Alle Spender“, Zahl der Spender und die Tabelle (am
 * Handy gestapelt wie die fertige Seite).
 */
export default function DonorsLoading() {
  return (
    <FinanceLoading
      label="Spender werden geladen …"
      backLink={{
        href: "/finanzen/spenden",
        label: `Spenden ${todayCalendarDate().getUTCFullYear()}`,
      }}
    >
      <Skeleton className="h-10 w-72 max-w-full rounded-lg" />
      <div className="grid gap-2">
        <Skeleton className="h-4 w-56 max-w-full" />
        <TableSkeleton rows={6} columns={5} stack />
      </div>
    </FinanceLoading>
  );
}
