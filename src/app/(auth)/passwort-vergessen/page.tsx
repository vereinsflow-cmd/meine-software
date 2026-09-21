import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/shared/auth-card";
import { ForgotPasswordForm } from "@/modules/auth/components/auth-forms";

export const metadata: Metadata = { title: "Passwort vergessen" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Passwort vergessen"
      description="Gib deine E-Mail-Adresse ein. Wir senden dir einen Link, mit dem du ein neues Passwort festlegen kannst."
      footer={
        <Link href="/anmelden" className="text-primary underline underline-offset-4">
          Zurück zur Anmeldung
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
