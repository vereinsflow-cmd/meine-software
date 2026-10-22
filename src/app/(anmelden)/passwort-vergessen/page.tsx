import type { Metadata } from "next";
import Link from "next/link";
import { ForgotPasswordForm } from "@/modules/auth/components/auth-forms";
import { StageCard } from "@/modules/auth/components/login-stage";

export const metadata: Metadata = { title: "Passwort vergessen" };

export default function ForgotPasswordPage() {
  return (
    <StageCard
      eyebrow="Zugang wiederherstellen"
      title="Passwort vergessen"
      description="Gib deine E-Mail-Adresse ein. Wir senden dir einen Link, mit dem du ein neues Passwort festlegen kannst."
      footer={<Link href="/anmelden">Zurück zur Anmeldung</Link>}
    >
      <ForgotPasswordForm />
    </StageCard>
  );
}
