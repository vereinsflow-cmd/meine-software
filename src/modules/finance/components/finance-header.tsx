import { PageHeader } from "@/components/shared/page-header";
import { FinanceTabs } from "./finance-tabs";

/**
 * Kopf jeder Finanzseite: Überschrift „Finanzen“ mit Untertitel und den Knöpfen der Seite, darunter die Leiste der Bereiche.
 * (Kein gemeinsames Layout: Jede Seite bringt ihre eigenen Knöpfe mit – der blaue Hauptknopf zuerst.)
 */
export function FinanceHeader({
  description,
  actions,
  counts,
}: {
  description?: React.ReactNode;
  actions?: React.ReactNode;
  counts?: Partial<Record<string, number>>;
}) {
  return (
    <>
      <PageHeader title="Finanzen" description={description} actions={actions} />
      <FinanceTabs counts={counts} />
    </>
  );
}
