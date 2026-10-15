import { PageSectionSkeleton, TableSkeleton } from "@/components/shared/page-skeletons";
import { FinanceLoading } from "@/modules/finance/components/finance-skeletons";

/** Ladezustand der Beitragsarten: je Gruppe (Grundbeiträge, Familienbeiträge …) Überschrift, Satz und Tabelle. */
export default function BeitragsartenLoading() {
  return (
    <FinanceLoading label="Beitragsarten werden geladen …" actions={["w-48"]} fees>
      <PageSectionSkeleton description>
        <TableSkeleton rows={3} columns={2} />
      </PageSectionSkeleton>
      <PageSectionSkeleton description>
        <TableSkeleton rows={2} columns={2} />
      </PageSectionSkeleton>
    </FinanceLoading>
  );
}
