import { TableSkeleton } from "@/components/shared/page-skeletons";
import { FilterRowSkeleton, FinanceLoading } from "@/modules/finance/components/finance-skeletons";

/** Ladezustand der Rechnungen: „Offen | Bezahlt | Alle“ mit Suche, darunter die Tabelle (am Handy gestapelt). */
export default function RechnungenLoading() {
  return (
    <FinanceLoading label="Rechnungen werden geladen …" actions={["w-44"]}>
      <FilterRowSkeleton />
      <TableSkeleton rows={5} columns={5} stack />
    </FinanceLoading>
  );
}
