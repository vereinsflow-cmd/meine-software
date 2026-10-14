import { CardSkeleton } from "@/components/shared/page-skeletons";
import { FinanceLoading } from "@/modules/finance/components/finance-skeletons";

/** Ladezustand eines Beitrags: Zurück-Link, Karte mit den Angaben und „So wird gerechnet“. */
export default function BeitragLoading() {
  return (
    <FinanceLoading
      label="Beitrag wird geladen …"
      backLink={{ href: "/finanzen/beitraege/offen", label: "Offene Beiträge" }}
    >
      <div className="grid max-w-4xl gap-6">
        <CardSkeleton lines={5} />
        <CardSkeleton lines={3} />
      </div>
    </FinanceLoading>
  );
}
