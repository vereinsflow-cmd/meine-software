import type { Metadata } from "next";
import Link from "next/link";
import { PlaceholderNotice } from "@/components/shared/legal-notice";

export const metadata: Metadata = { title: "Datenschutzerklärung" };

export default function PrivacyPolicyPage() {
  return (
    <article className="space-y-6">
      <h1 className="text-2xl font-semibold">Datenschutzerklärung</h1>
      <PlaceholderNotice />

      <section className="space-y-2">
        <h2 className="text-lg font-medium">1. Verantwortlicher</h2>
        <p>
          Verantwortlich für die Verarbeitung Ihrer personenbezogenen Daten in VereinsFlow ist der
          Verein, dem Sie angehören: [Name und Anschrift des Vereins, Kontakt des
          Datenschutzbeauftragten bzw. Ansprechpartners]. Den Betrieb der Plattform übernimmt [Name
          des Plattformbetreibers] als Auftragsverarbeiter im Sinne von Art. 28 DSGVO
          [Auftragsverarbeitungsvertrag abschließen].
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">2. Welche Daten wir verarbeiten und wozu</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Mitgliederdaten</strong> (Name, Kontaktdaten, Geburtsdatum, Eintritts- und
            Austrittsdatum, Abteilungszugehörigkeit, Funktion): zur Durchführung der Mitgliedschaft
            (Art. 6 Abs. 1 lit. b DSGVO).
          </li>
          <li>
            <strong>Veranstaltungs- und Helferdaten</strong> (Zu-/Absagen, Schichteintragungen,
            Helferstunden): zur Organisation des Vereinslebens (Art. 6 Abs. 1 lit. b und f DSGVO).
          </li>
          <li>
            <strong>Meldungen an die Vereinsverwaltung</strong> (Text, Antwort, betroffene Seite,
            Gerätetyp): zur Beantwortung von Fragen und Störungen (Art. 6 Abs. 1 lit. b und f
            DSGVO); erledigte Meldungen werden nach 12 Monaten gelöscht.
          </li>
          <li>
            <strong>Zugangsdaten</strong> (E-Mail-Adresse, Passwort als kryptografischer Hash,
            Anmeldezeitpunkte): zur sicheren Anmeldung (Art. 6 Abs. 1 lit. b und f DSGVO).
          </li>
          <li>
            <strong>Protokolldaten</strong> (Änderungsprotokoll mit gekürzter IP-Adresse): zur
            Nachvollziehbarkeit und Sicherheit (Art. 6 Abs. 1 lit. f DSGVO).
          </li>
          <li>
            <strong>Einwilligungen</strong> (z. B. Newsletter, Fotoveröffentlichung): nur auf
            Grundlage Ihrer freiwilligen, jederzeit widerrufbaren Einwilligung (Art. 6 Abs. 1 lit. a
            DSGVO).
          </li>
          <li>
            <strong>Push-Geräte</strong> (Adresse und Schlüssel des Push-Abos, Gerätebezeichnung wie
            „Chrome auf Android“, Zeitpunkt der letzten erfolgreichen Zustellung): nur wenn Sie
            Push-Benachrichtigungen auf einem Gerät selbst einschalten (Art. 6 Abs. 1 lit. a DSGVO,
            § 25 Abs. 1 TDDDG); Näheres unter Punkt 3.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">
          3. Cookies, lokale Speicherung und Push-Benachrichtigungen
        </h2>
        <p>
          VereinsFlow setzt ausschließlich ein{" "}
          <strong>technisch notwendiges Sitzungs-Cookie</strong> ein (<code>__Host-vf_session</code>
          ), das Sie angemeldet hält. Es enthält nur eine zufällige Kennung, wird nicht zu Tracking-
          oder Werbezwecken genutzt und läuft nach der Inaktivität bzw. spätestens nach [14] Tagen
          ab. Zusätzlich speichert Ihr Browser die gewählte Darstellung (hell/dunkel) lokal. Es
          werden keine Analyse- oder Marketing-Dienste eingebunden und keine Inhalte von
          Drittanbietern nachgeladen. Eine Einwilligungsabfrage („Cookie-Banner“) ist daher nicht
          erforderlich (§ 25 Abs. 2 Nr. 2 TDDDG).
        </p>
        <p>
          <strong>Push-Benachrichtigungen</strong> sind freiwillig und standardmäßig aus. Wenn Sie
          sie unter „Profil → Benachrichtigungen“ auf einem Gerät einschalten und Ihr Browser dies
          erlaubt, speichern wir für dieses Gerät ein Push-Abo (eine geheime Adresse beim
          Push-Dienst des Browser-Herstellers, zwei Schlüssel und eine Gerätebezeichnung). Die
          Meldungen laufen über den Push-Dienst des Herstellers Ihres Browsers – bei Chrome und
          anderen Android-Browsern über Google, bei Safari und auf dem iPhone über Apple, bei
          Firefox über Mozilla – und sind auf dem Weg dorthin Ende-zu-Ende verschlüsselt. Sie
          enthalten bewusst keine Namen, keine Personendaten und keinen Nachrichtentext, sondern nur
          einen allgemeinen Hinweis wie „Neue Nachricht“ und den Link zur passenden Seite in
          VereinsFlow. Der Hersteller erfährt, dass und wann eine Meldung an Ihr Gerät zugestellt
          wird, nicht aber deren Inhalt. Sie können Push jederzeit im Profil auf dem jeweiligen
          Gerät ausschalten; dann wird das Push-Abo bei uns gelöscht. Es wird außerdem gelöscht,
          wenn Sie sich abmelden, Ihr Konto gelöscht wird oder das Gerät dauerhaft nicht mehr
          erreichbar ist (nach spätestens 30 Tagen erfolgloser Zustellung).
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">4. Empfänger und Speicherdauer</h2>
        <p>
          Ihre Daten sind nur für berechtigte Personen Ihres Vereins sichtbar (Rollen- und
          Abteilungsrechte). Eine Weitergabe an Dritte erfolgt nur, soweit dies gesetzlich
          vorgeschrieben ist [oder an folgende Dienstleister: Hosting, E-Mail-Versand]. Daten
          ausgetretener Mitglieder werden nach [Aufbewahrungsfrist] gelöscht bzw. anonymisiert,
          soweit keine gesetzlichen Aufbewahrungspflichten entgegenstehen.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">5. Ihre Rechte</h2>
        <p>
          Sie haben das Recht auf Auskunft (Art. 15), Berichtigung (Art. 16), Löschung (Art. 17),
          Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) und Widerspruch
          (Art. 21 DSGVO). Einen Export Ihrer Daten und die Beantragung der Löschung Ihres Kontos
          finden Sie nach der Anmeldung unter „Datenschutz“. Außerdem können Sie sich bei einer
          Datenschutz-Aufsichtsbehörde beschweren [zuständige Behörde eintragen].
        </p>
        <p>
          Wie Sie Ihr Konto Schritt für Schritt löschen, welche Daten dabei gelöscht werden und
          welche aus welchem Grund erhalten bleiben, erklärt die Seite{" "}
          <Link href="/konto-loeschen" className="text-primary underline underline-offset-4">
            Konto löschen
          </Link>
          .
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">6. Sicherheit</h2>
        <p>
          Die Übertragung erfolgt verschlüsselt (HTTPS). Passwörter werden nur als Argon2id-Hash
          gespeichert. Der Zugriff ist rollenbasiert beschränkt, Änderungen werden protokolliert,
          und die Daten verschiedener Vereine sind strikt voneinander getrennt.
        </p>
      </section>
    </article>
  );
}
