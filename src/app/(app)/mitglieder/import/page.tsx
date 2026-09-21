import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { ImportWizard } from "@/modules/members/components/import-wizard";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Mitglieder importieren" };

export default async function ImportMembersPage() {
  const ctx = await requirePageContext();
  if (!can(ctx, "members:import")) return <NoAccess what="den Mitglieder-Import" />;

  return (
    <>
      <p className="mb-3">
        <Link
          href="/mitglieder"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeftIcon className="size-4" aria-hidden="true" /> Alle Mitglieder
        </Link>
      </p>
      <PageHeader
        title="Mitglieder importieren"
        description="Lade eine CSV-Datei hoch. Du siehst zuerst eine Vorschau – erst danach wird etwas gespeichert."
      />
      <ImportWizard />
    </>
  );
}
