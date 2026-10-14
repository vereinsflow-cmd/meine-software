import { PageSectionSkeleton, TableSkeleton } from "@/components/shared/page-skeletons";
import { FinanceLoading } from "@/modules/finance/components/finance-skeletons";

/**
 * Ladezustand von „Konten und Kategorien“: Konten mit „Konto hinzufügen“ (am Handy gestapelt wie die echte Tabelle),
 * darunter die Kategorien (auch am Handy eine Tabelle).
 */
export default function FinanzEinstellungenLoading() {
  return (
    <FinanceLoading label="Konten und Kategorien werden geladen …">
      <PageSectionSkeleton action>
        <TableSkeleton rows={2} columns={3} stack />
      </PageSectionSkeleton>
      <PageSectionSkeleton description action>
        <TableSkeleton rows={5} columns={2} />
      </PageSectionSkeleton>
    </FinanceLoading>
  );
}
