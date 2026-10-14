import { TableSkeleton } from "@/components/shared/page-skeletons";
import {
  BottomBarSkeleton,
  FinanceLoading,
  RunCardSkeleton,
  TilesSkeleton,
} from "@/modules/finance/components/finance-skeletons";

/** Ladezustand eines erstellten Beitragslaufs: Kopfkarte, vier Summen, die Beiträge und die Leiste am Ende. */
export default function BeitragslaufDetailLoading() {
  return (
    <FinanceLoading label="Beitragslauf wird geladen …" fees>
      <RunCardSkeleton />
      <TilesSkeleton />
      <TableSkeleton rows={6} columns={5} />
      <BottomBarSkeleton />
    </FinanceLoading>
  );
}
