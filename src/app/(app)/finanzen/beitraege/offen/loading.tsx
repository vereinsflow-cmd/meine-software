import { TableSkeleton } from "@/components/shared/page-skeletons";
import { FilterRowSkeleton, FinanceLoading } from "@/modules/finance/components/finance-skeletons";

/** Ladezustand der offenen Beiträge: „Offen | Bezahlt | Gestrichen | Alle“ mit Suche, darunter die Tabelle. */
export default function OffeneBeitraegeLoading() {
  return (
    <FinanceLoading label="Offene Beiträge werden geladen …" fees>
      <FilterRowSkeleton wide />
      <TableSkeleton rows={8} columns={5} />
    </FinanceLoading>
  );
}
