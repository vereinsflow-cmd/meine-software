import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/modules/auth/components/auth-forms";
import { StageCard } from "@/modules/auth/components/login-stage";
import { isPasswordResetTokenValid } from "@/server/auth/service";

export const metadata: Metadata = { title: "Neues Passwort festlegen" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const valid = token ? await isPasswordResetTokenValid(token) : false;

  if (!token || !valid) {
    return (
      <StageCard
        eyebrow="Zugang wiederherstellen"
        title="Link ungültig oder abgelaufen"
        description="Dieser Link zum Zurücksetzen des Passworts kann nicht mehr verwendet werden. Er ist entweder abgelaufen oder wurde bereits benutzt."
        footer={<Link href="/passwort-vergessen">Neuen Link anfordern</Link>}
      />
    );
  }

  return (
    <StageCard
      eyebrow="Zugang wiederherstellen"
      title="Neues Passwort festlegen"
      description="Wähle ein neues Passwort für dein Konto. Danach wirst du auf allen Geräten abgemeldet."
    >
      <ResetPasswordForm token={token} />
    </StageCard>
  );
}
