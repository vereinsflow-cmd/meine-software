import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/shared/auth-card";
import { LoginForm } from "@/modules/auth/components/auth-forms";
import { getCurrentSession } from "@/server/auth/session";
import { safeRedirectPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Anmelden" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = first(params.next);

  // Bereits angemeldet? Dann direkt weiter (die Prüfung der Sitzung erfolgt hier auf dem Server).
  const session = await getCurrentSession();
  if (session) redirect(safeRedirectPath(next));

  const notice = first(params.expired) ? "expired" : first(params.reset) ? "reset" : null;

  return (
    <AuthCard
      title="Anmelden"
      description="Melde dich mit deiner E-Mail-Adresse an."
      footer={
        <>
          Noch kein Konto? Der Zugang erfolgt über eine{" "}
          <a href="/registrieren" className="text-primary underline underline-offset-4">
            Einladung deines Vereins
          </a>
          .
        </>
      }
    >
      <LoginForm next={next && safeRedirectPath(next, "") ? next : undefined} notice={notice} />
    </AuthCard>
  );
}
