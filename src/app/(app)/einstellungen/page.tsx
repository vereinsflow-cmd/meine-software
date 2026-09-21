import type { Metadata } from "next";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { ClubSettingsForm } from "@/modules/clubs/components/settings-form";
import { getClubSettings } from "@/modules/clubs/service";
import { can } from "@/server/permissions/policy";
import { requirePageContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Vereinseinstellungen" };

export default async function SettingsPage() {
  const ctx = await requirePageContext();
  if (!can(ctx, "club:update")) return <NoAccess what="die Vereinseinstellungen" />;
  const settings = await getClubSettings(ctx);

  return (
    <>
      <PageHeader title="Vereinseinstellungen" description={`Kürzel: ${settings.slug}`} />
      <ClubSettingsForm
        defaults={{
          name: settings.name,
          contactEmail: settings.contactEmail ?? "",
          phone: settings.phone ?? "",
          street: settings.street ?? "",
          postalCode: settings.postalCode ?? "",
          city: settings.city ?? "",
          website: settings.website ?? "",
          privacyContact: settings.privacyContact ?? "",
          leftMembersMonths: settings.retention.leftMembersMonths,
          trashDays: settings.retention.trashDays,
          auditMonths: settings.retention.auditMonths,
        }}
      />
    </>
  );
}
