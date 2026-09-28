import type { Metadata } from "next";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { BackLink } from "@/components/shared/back-link";
import { ImportWizard } from "@/modules/members/components/import-wizard";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Mitglieder importieren" };

export default async function ImportMembersPage() {
  const ctx = await requirePageContext();
  if (!can(ctx, "members:import")) return <NoAccess what="den Mitglieder-Import" />;

  return (
    <>
      <BackLink href="/mitglieder">Alle Mitglieder</BackLink>
      <PageHeader
        title="Mitglieder importieren"
        description="Lade eine CSV-Datei hoch. Du siehst zuerst eine Vorschau – erst danach wird etwas gespeichert."
      />
      <ImportWizard />
    </>
  );
}
