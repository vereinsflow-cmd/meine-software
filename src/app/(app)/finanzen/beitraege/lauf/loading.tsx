import { CardSkeleton } from "@/components/shared/page-skeletons";
import {
  BottomBarSkeleton,
  FinanceLoading,
  RunCardSkeleton,
} from "@/modules/finance/components/finance-skeletons";

/** Ladezustand des Beitragslaufs: Kopfkarte mit Zeitraum und Schritten, Schritt 1 und die Leiste am Ende. */
export default function BeitragslaufLoading() {
  return (
    <FinanceLoading label="Beitragslauf wird geladen …" fees>
      <RunCardSkeleton />
      <CardSkeleton lines={4} />
      <BottomBarSkeleton />
    </FinanceLoading>
  );
}
