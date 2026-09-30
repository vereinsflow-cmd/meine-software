import type { Metadata } from "next";
import Link from "next/link";
import { RocketIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NoAccess } from "@/components/shared/no-access";
import { PageHeader } from "@/components/shared/page-header";
import { ClubLogoCard } from "@/modules/clubs/components/logo-card";
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
      <PageHeader
        title="Vereinseinstellungen"
        description={`Kürzel: ${settings.slug}`}
        actions={
          <Button asChild variant="outline">
            <Link href="/einrichtung">
              <RocketIcon /> Einrichtungs-Assistent
            </Link>
          </Button>
        }
      />
      {/* Höchstens 56 rem wie alle Formulare – auch die Logo-Karte, damit beide Karten gleich breit sind. */}
      <div className="grid max-w-4xl gap-6">
        {/* Eigenes Formular für das Logo (Datei-Upload), getrennt von den übrigen Vereinsdaten */}
        <ClubLogoCard clubId={ctx.clubId} clubName={settings.name} logo={settings.logo} />
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
      </div>
    </>
  );
}
