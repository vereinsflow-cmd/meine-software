import { TableSkeleton, ToolbarSkeleton } from "@/components/shared/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { todayCalendarDate } from "@/lib/dates";
import { FinanceLoading } from "@/modules/finance/components/finance-skeletons";

/**
 * Ladezustand von „Alle Spenden“: Zurück-Link, Leiste der Bestätigungen, Suche und Filter, Zahl der Spenden und die Tabelle
 * (am Handy gestapelt wie `DonationsList`). Der Zurück-Link nennt das laufende Jahr – wie die Seite ohne `?jahr=`.
 */
export default function AllDonationsLoading() {
  return (
    <FinanceLoading
      label="Spenden werden geladen …"
      actions={["w-36"]}
      backLink={{
        href: "/finanzen/spenden",
        label: `Spenden ${todayCalendarDate().getUTCFullYear()}`,
      }}
    >
      <div className="grid gap-4">
        <Skeleton className="h-10 w-[36rem] max-w-full rounded-lg" />
        <ToolbarSkeleton />
      </div>
      <div className="grid gap-2">
        <Skeleton className="h-4 w-48" />
        <TableSkeleton rows={8} columns={6} stack />
      </div>
    </FinanceLoading>
  );
}
