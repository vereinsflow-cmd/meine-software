import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SECOND_FACTOR_COOKIE_NAME } from "@/lib/session-cookie";
import { StageCard } from "@/modules/auth/components/login-stage";
import { SecondFactorForm } from "@/modules/auth/components/auth-forms";
import { readLoginChallenge } from "@/server/auth/login-challenge";
import { getCurrentSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Anmeldung bestätigen" };

/**
 * Zweiter Schritt der Anmeldung mit Zwei-Faktor. Erreichbar nur mit dem Zwischenstands-Cookie aus dem ersten Schritt
 * (Passwort richtig, höchstens 5 Minuten alt) – sonst zurück zur Anmeldung.
 */
export default async function SecondFactorPage() {
  if (await getCurrentSession()) redirect("/dashboard");

  const challenge = await readLoginChallenge();
  if (!challenge) {
    const hadCookie = (await cookies()).has(SECOND_FACTOR_COOKIE_NAME);
    redirect(hadCookie ? "/anmelden?abgelaufen=1" : "/anmelden");
  }

  return (
    <StageCard
      eyebrow="Schritt 2 von 2"
      title="Anmeldung bestätigen"
      description="Für dein Konto ist die Zwei-Faktor-Anmeldung eingeschaltet. Öffne deine Authenticator-App und gib den Code für VereinsFlow ein."
    >
      <SecondFactorForm />
    </StageCard>
  );
}
