import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/shared/auth-card";
import { FirstRunForm } from "@/modules/setup/components/first-run-form";
import { isFirstRunOpen } from "@/server/platform/first-run";

export const metadata: Metadata = { title: "Willkommen", robots: { index: false } };

/** Ersteinrichtung der leeren Version – nur solange es noch kein einziges Konto gibt (sonst → Anmeldung). */
export default async function FirstRunPage() {
  if (!(await isFirstRunOpen())) redirect("/anmelden");
  return (
    <AuthCard
      title="Willkommen bei VereinsFlow"
      description="Lege deinen Verein und dein Konto an. Danach führt dich ein Assistent Schritt für Schritt durch die Einrichtung."
    >
      <FirstRunForm />
    </AuthCard>
  );
}
