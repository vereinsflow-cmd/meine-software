import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/shared/auth-card";
import { ResetPasswordForm } from "@/modules/auth/components/auth-forms";
import { isPasswordResetTokenValid } from "@/server/auth/service";

export const metadata: Metadata = { title: "Neues Passwort festlegen" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ResetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const valid = token ? await isPasswordResetTokenValid(token) : false;

  if (!token || !valid) {
    return (
      <AuthCard
        title="Link ungültig oder abgelaufen"
        description="Dieser Link zum Zurücksetzen des Passworts kann nicht mehr verwendet werden. Er ist entweder abgelaufen oder wurde bereits benutzt."
        footer={
          <Link href="/passwort-vergessen" className="text-primary underline underline-offset-4">
            Neuen Link anfordern
          </Link>
        }
      />
    );
  }

  return (
    <AuthCard
      title="Neues Passwort festlegen"
      description="Wähle ein neues Passwort für dein Konto. Danach wirst du auf allen Geräten abgemeldet."
    >
      <ResetPasswordForm token={token} />
    </AuthCard>
  );
}
