import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/shared/auth-card";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/dates";
import {
  AcceptExistingInvitationButton,
  AcceptInvitationForm,
} from "@/modules/auth/components/auth-forms";
import { logoutAction } from "@/modules/auth/actions";
import { getInvitationPreview } from "@/server/auth/invitations";
import { getCurrentSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Einladung", robots: { index: false } };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await getInvitationPreview(token);

  if (!preview) {
    return (
      <AuthCard
        title="Einladung nicht mehr gültig"
        description="Diese Einladung ist abgelaufen, wurde bereits angenommen oder wurde zurückgezogen. Bitte wende dich an deinen Verein, um eine neue Einladung zu erhalten."
        footer={
          <Link href="/anmelden" className="text-primary underline underline-offset-4">
            Zur Anmeldung
          </Link>
        }
      />
    );
  }

  const intro = (
    <>
      Du wurdest zu <strong>{preview.clubName}</strong> eingeladen (Rolle: {preview.roleName}). Die
      Einladung gilt für <strong>{preview.email}</strong> bis {formatDateTime(preview.expiresAt)}{" "}
      Uhr.
    </>
  );

  if (!preview.hasAccount) {
    return (
      <AuthCard title="Konto anlegen und beitreten" description={intro}>
        <AcceptInvitationForm token={token} />
      </AuthCard>
    );
  }

  // Für diese Adresse gibt es bereits ein Konto: Der Beitritt erfordert die Anmeldung mit genau diesem Konto.
  const session = await getCurrentSession();
  if (session && session.user.email.toLowerCase() === preview.email) {
    return (
      <AuthCard title="Einladung annehmen" description={intro}>
        <AcceptExistingInvitationButton token={token} />
      </AuthCard>
    );
  }

  if (session) {
    return (
      <AuthCard
        title="Falsches Konto angemeldet"
        description={
          <>
            Diese Einladung gilt für <strong>{preview.email}</strong>. Du bist aber als{" "}
            <strong>{session.user.email}</strong> angemeldet. Bitte melde dich ab und mit dem
            passenden Konto wieder an.
          </>
        }
      >
        <form action={logoutAction}>
          <Button type="submit" variant="outline" className="w-full">
            Abmelden
          </Button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Bitte anmelden"
      description={
        <>{intro} Für diese Adresse existiert bereits ein Konto – melde dich an, um beizutreten.</>
      }
    >
      <Button asChild className="w-full">
        <Link href={`/anmelden?next=${encodeURIComponent(`/einladung/${token}`)}`}>
          Zur Anmeldung
        </Link>
      </Button>
    </AuthCard>
  );
}
