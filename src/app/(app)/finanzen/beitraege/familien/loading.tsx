import { CardSkeleton } from "@/components/shared/page-skeletons";
import { FinanceLoading } from "@/modules/finance/components/finance-skeletons";

/** Ladezustand der Familien: Karten je Familie, ab `lg` zwei nebeneinander. */
export default function FamilienLoading() {
  return (
    <FinanceLoading label="Familien werden geladen …" actions={["w-40"]} fees>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <CardSkeleton key={index} lines={4} />
        ))}
      </div>
    </FinanceLoading>
  );
}
