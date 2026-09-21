import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/shared/auth-card";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/modules/auth/actions";
import { getCurrentSession } from "@/server/auth/session";
import { getTenantContext } from "@/server/tenancy/context";

export const metadata: Metadata = { title: "Kein Verein" };

export default async function NoClubPage() {
  const session = await getCurrentSession();
  if (!session) redirect("/anmelden");
  // Hat der Benutzer inzwischen einen aktiven Verein, geht es direkt weiter.
  if (await getTenantContext()) redirect("/dashboard");
  if (session.user.isPlatformAdmin) redirect("/system");

  return (
    <AuthCard
      title="Kein aktiver Verein"
      description="Dein Konto ist im Moment keinem aktiven Verein zugeordnet. Möglicherweise wurde deine Mitgliedschaft gesperrt oder der Verein deaktiviert. Bitte wende dich an deinen Verein."
    >
      <form action={logoutAction}>
        <Button type="submit" variant="outline" className="w-full">
          Abmelden
        </Button>
      </form>
    </AuthCard>
  );
}
