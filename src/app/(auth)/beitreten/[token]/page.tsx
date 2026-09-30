import type { Metadata } from "next";
import { AuthCard } from "@/components/shared/auth-card";
import { INVALID_JOIN_LINK_TEXT } from "@/lib/membership-application";
import { JoinApplicationCard } from "@/modules/membership-applications/components/join-form";
import { getJoinPage } from "@/modules/membership-applications/service";

/**
 * Öffentliche Seite „Mitglied werden“ (ohne Anmeldung, im Proxy freigegeben) – erreichbar über den QR-Code des Vereins.
 * Nicht in Suchmaschinen und ohne Verweis-Adresse an andere Seiten: Der Link gehört auf den Aushang, nicht ins Netz.
 */
export const metadata: Metadata = {
  title: "Mitglied werden",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = await getJoinPage(token);

  // Ungültig, erneuert oder geschlossen: bewusst ohne Vereinsangaben – ein alter Aushang verrät nichts mehr.
  if (!page) return <AuthCard title="Link nicht gültig" description={INVALID_JOIN_LINK_TEXT} />;

  return (
    <JoinApplicationCard
      token={token}
      clubName={page.clubName}
      logoUrl={page.logoUrl}
      departments={page.departments}
    />
  );
}
