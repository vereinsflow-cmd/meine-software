import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/shared/auth-card";

export const metadata: Metadata = { title: "Registrieren" };

/**
 * VereinsFlow ist eine geschlossene Plattform: Ein Konto entsteht ausschließlich über die Einladung eines
 * Vereins (per E-Mail). So kann sich niemand unbefugt Zugang zu Mitgliederdaten verschaffen.
 */
export default function RegisterPage() {
  return (
    <AuthCard
      title="Registrierung"
      description="Der Zugang zu VereinsFlow erfolgt über eine Einladung deines Vereins."
      footer={
        <Link href="/anmelden" className="text-primary underline underline-offset-4">
          Zur Anmeldung
        </Link>
      }
    >
      <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
        <li>Bitte den Vereinsadministrator oder den Vorstand, dich einzuladen.</li>
        <li>Du erhältst eine E-Mail mit einem persönlichen Einladungslink.</li>
        <li>Über den Link legst du dein Passwort fest und trittst dem Verein bei.</li>
      </ol>
      <p className="text-sm text-muted-foreground">
        Deinen Verein noch nicht in VereinsFlow angelegt? Neue Vereine werden vom Plattformbetreiber
        eingerichtet.
      </p>
    </AuthCard>
  );
}
