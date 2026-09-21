import type { Metadata } from "next";
import { PlaceholderNotice } from "@/components/shared/legal-notice";

export const metadata: Metadata = { title: "Impressum" };

export default function ImprintPage() {
  return (
    <article className="space-y-4">
      <h1 className="text-2xl font-semibold">Impressum</h1>
      <PlaceholderNotice />

      <section className="space-y-1">
        <h2 className="text-lg font-medium">Angaben gemäß § 5 DDG</h2>
        <p>[Name des Betreibers / Vereins]</p>
        <p>[Straße und Hausnummer]</p>
        <p>[PLZ und Ort]</p>
      </section>

      <section className="space-y-1">
        <h2 className="text-lg font-medium">Vertretungsberechtigte Personen</h2>
        <p>[Name(n) der vertretungsberechtigten Person(en), z. B. 1. Vorsitzende/r]</p>
      </section>

      <section className="space-y-1">
        <h2 className="text-lg font-medium">Kontakt</h2>
        <p>Telefon: [Telefonnummer]</p>
        <p>E-Mail: [E-Mail-Adresse]</p>
      </section>

      <section className="space-y-1">
        <h2 className="text-lg font-medium">Registereintrag</h2>
        <p>Registergericht: [Amtsgericht]</p>
        <p>Vereinsregisternummer: [VR-Nummer]</p>
      </section>

      <section className="space-y-1">
        <h2 className="text-lg font-medium">Umsatzsteuer-Identifikationsnummer</h2>
        <p>[USt-IdNr., falls vorhanden – sonst diesen Abschnitt entfernen]</p>
      </section>

      <section className="space-y-1">
        <h2 className="text-lg font-medium">Verantwortlich für den Inhalt (§ 18 Abs. 2 MStV)</h2>
        <p>[Name und Anschrift der verantwortlichen Person]</p>
      </section>
    </article>
  );
}
