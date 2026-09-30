import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { DescriptionList } from "@/components/shared/description-list";
import { DEFAULT_RETENTION } from "@/lib/club-settings";
import { DELETION_GRACE_DAYS } from "@/lib/privacy";
import { DOCUMENT_TRASH_DAYS } from "@/lib/uploads";
import { env } from "@/server/env";

export const metadata: Metadata = {
  title: "Konto löschen",
  description:
    "So löschst du dein VereinsFlow-Konto und deine Daten – in der App und im Browser: Bedenkzeit, was gelöscht wird und was bleibt.",
};

const linkClass = "text-primary underline underline-offset-4";

/**
 * Öffentliche Anleitung zur Kontolöschung – ohne Anmeldung erreichbar (`PUBLIC_PATHS` in proxy.ts). Google Play verlangt sie für
 * Apps mit Benutzerkonten; ihre Adresse steht in der Play Console (siehe docs/OPERATIONS.md).
 *
 * Der Text beschreibt die Löschung genau so, wie sie umgesetzt ist: `src/server/privacy/deletion.ts` und `anonymize.ts`,
 * zusammengefasst in docs/PRIVACY.md („Kontolöschung“). Ändert sich dort etwas, muss diese Seite mit. Fristen kommen aus
 * denselben Konstanten wie im Code. Die Seite enthält keine Vereins- oder Personendaten – nur die öffentliche Adresse der
 * Installation und, falls eingerichtet, die Support-Adresse des Betreibers (`SUPPORT_EMAIL`).
 */
export default async function AccountDeletionPage() {
  // Adresse und Support-Kontakt stammen aus der Konfiguration des Servers: zur Laufzeit lesen, nicht beim Build.
  await connection();
  const appHost = new URL(env.APP_URL).host;
  const supportEmail = env.SUPPORT_EMAIL ?? null;

  return (
    <article className="space-y-6">
      <h1 className="text-2xl font-semibold">Konto löschen</h1>
      <p>
        Du kannst dein Konto bei VereinsFlow jederzeit selbst löschen – in der App und im Browser.
        Hier steht Schritt für Schritt, wie das geht, wann die Löschung wirksam wird, was dabei
        gelöscht wird und was aus welchem Grund erhalten bleibt.
      </p>
      <DescriptionList
        className="rounded-lg border p-4"
        items={[
          {
            label: "App",
            value: `VereinsFlow – Android-App, Web-App auf dem iPhone und im Browser (${appHost})`,
          },
          { label: "Entwickler", value: "VereinsFlow" },
        ]}
      />

      <section className="space-y-2">
        <h2 className="text-lg font-medium">1. Konto in der App löschen (Android und iPhone)</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Öffne die App VereinsFlow und melde dich an.</li>
          <li>
            Tippe oben links auf das Menü (drei Striche) und wähle unter „Persönlich“ den Punkt
            „Datenschutz“ – oder tippe oben rechts auf deine Initialen und wähle „Datenschutz“.
          </li>
          <li>Tippe im Abschnitt „Konto und Daten löschen“ auf „Konto löschen …“.</li>
          <li>
            Gib zur Bestätigung dein Passwort ein, setze das Häkchen bei „Ich habe verstanden …“ und
            tippe auf „Löschung beantragen“. Einen Grund anzugeben ist freiwillig.
          </li>
          <li>Du bekommst eine E-Mail mit dem Zeitpunkt, zu dem die Löschung ausgeführt wird.</li>
        </ol>
        <p>
          Die App ist VereinsFlow selbst: Löschst du dein Konto dort, ist es überall gelöscht – auch
          im Browser. Die App nur vom Gerät zu entfernen, löscht dein Konto dagegen{" "}
          <strong>nicht</strong>.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">2. Konto im Browser löschen</h2>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Öffne VereinsFlow im Browser ({appHost}) und{" "}
            <Link href="/anmelden" className={linkClass}>
              melde dich an
            </Link>
            .
          </li>
          <li>
            Wähle in der Seitenleiste links unter „Persönlich“ den Punkt „Datenschutz“ – oder oben
            rechts im Benutzermenü (dein Name) „Datenschutz“. Auf kleinen Bildschirmen öffnen die
            drei Striche oben links das Menü.
          </li>
          <li>
            Klicke im Abschnitt „Konto und Daten löschen“ auf „Konto löschen …“, gib dein Passwort
            ein, setze das Häkchen und klicke auf „Löschung beantragen“.
          </li>
        </ol>
        <p>
          Direkt dorthin geht es über{" "}
          <Link href="/datenschutz" className={linkClass}>
            Datenschutz
          </Link>{" "}
          (ohne Anmeldung zuerst zur Anmeldung). Tipp: Dort kannst du vorher mit „Daten
          herunterladen (JSON)“ alle Daten, die zu dir gespeichert sind, als Datei sichern.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">
          3. Bedenkzeit von {DELETION_GRACE_DAYS} Tagen und Antrag zurückziehen
        </h2>
        <p>
          Gelöscht wird nicht sofort, sondern nach einer Bedenkzeit von {DELETION_GRACE_DAYS} Tagen
          automatisch – dein Verein muss dafür nichts tun. Bis dahin kannst du VereinsFlow wie
          gewohnt nutzen und den Antrag jederzeit zurückziehen:
        </p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>
            Melde dich an und öffne „Datenschutz“ (die E-Mail zu deinem Antrag enthält einen Link
            dorthin).
          </li>
          <li>
            Der Hinweis „Löschung beantragt“ nennt den Zeitpunkt der Löschung. Tippe bzw. klicke
            dort auf „Antrag zurückziehen“.
          </li>
        </ol>
        <p>
          Die Verantwortlichen für den Datenschutz in deinen Vereinen sehen, dass du die Löschung
          beantragt hast. Nach Ablauf der Bedenkzeit wird sie ausgeführt und lässt sich nicht mehr
          rückgängig machen; zum Schluss bekommst du eine letzte E-Mail als Bestätigung.
        </p>
        <p>
          <strong>Wann das Löschen nicht geht:</strong> Bist du der letzte Vereinsadministrator
          eines Vereins, bestimme zuerst einen weiteren – sonst stünde der Verein ohne Verwaltung
          da. Bist du es bei Ablauf der Bedenkzeit (etwa weil der andere Administrator inzwischen
          ausgeschieden ist), wird der Antrag nicht ausgeführt: Dein Konto bleibt unverändert, und
          du bekommst eine E-Mail mit dem Grund. Dasselbe gilt für den letzten Administrator der
          Plattform.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">4. Was gelöscht wird</h2>
        <p>
          Die Löschung gilt für dein ganzes Konto – in allen Vereinen, denen du in VereinsFlow
          angehörst:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Dein Konto:</strong> Name, E-Mail-Adresse, Passwort (gespeichert nur als
            Prüfwert), Anmeldungen auf deinen Geräten, eingeschaltete Push-Benachrichtigungen und
            Links zum Zurücksetzen des Passworts.
          </li>
          <li>
            <strong>Deine Zugänge zu den Vereinen</strong> samt Benachrichtigungen und
            Kalender-Abo-Links sowie offene Einladungen an deine E-Mail-Adresse.
          </li>
          <li>
            <strong>Deine Mitgliedsdaten</strong> (der Mitgliedsdatensatz, den dein Verein mit
            deinem Konto verknüpft hat): Name, Mitgliedsnummer, E-Mail-Adresse, Telefon, Anschrift,
            Geburtsdatum, Funktion im Verein, interne Notizen, Abteilungen und Gruppen,
            Einwilligungen (z. B. Newsletter, Fotos) und deine Anmerkungen zu Zu- und Absagen und
            Helferschichten.
          </li>
          <li>
            <strong>Dokumente zu deiner Mitgliedschaft</strong> (z. B. ein Aufnahmeantrag): Sie
            kommen in den Papierkorb und werden nach {DOCUMENT_TRASH_DAYS} Tagen endgültig gelöscht.
          </li>
          <li>
            <strong>Deine Meldungen an die Vereinsverwaltung</strong> („Hilfe & Support“) samt
            Antworten.
          </li>
          <li>
            <strong>Deine Entwürfe</strong> für Nachrichten.
          </li>
          <li>
            <strong>Dein Name im Änderungsprotokoll</strong> – an seiner Stelle steht dann
            „Gelöschtes Mitglied“.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">5. Was erhalten bleibt – und warum</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Ein anonymer Eintrag „Gelöschtes Mitglied“</strong> an Stelle deines
            Mitgliedsdatensatzes – ohne Namen, Kontaktdaten, Anschrift und Geburtsdatum, aber mit
            Ein- und Austrittsdatum, Zu- und Absagen, Helferschichten samt Stunden und
            Zuständigkeiten (z. B. für Aufgaben). So bleiben die Auswertungen des Vereins richtig,
            etwa Helferstunden und Teilnehmerzahlen vergangener Veranstaltungen.
          </li>
          <li>
            <strong>Gesendete Nachrichten</strong> bleiben für die Empfänger lesbar, aber ohne
            Absender („Früheres Mitglied“) – wie in einem Gruppenchat. Möchtest du das nicht, rufe
            deine Nachrichten vor Ablauf der Bedenkzeit zurück: Dann sieht sie niemand mehr,
            gespeichert bleiben sie aber (ebenfalls ohne Absender). Was zusätzlich per E-Mail
            verschickt wurde, liegt schon in den Postfächern der Empfänger.
          </li>
          <li>
            <strong>Inhalte, die du für deinen Verein angelegt hast</strong> – etwa Veranstaltungen,
            Aufgaben oder hochgeladene Dokumente – gehören dem Verein und bleiben bestehen.
          </li>
          <li>
            <strong>Rechnungen</strong> des Vereins bleiben wegen gesetzlicher
            Aufbewahrungspflichten erhalten; entfernt wird nur der Vermerk, dass du sie erfasst oder
            als bezahlt markiert hast.
          </li>
          <li>
            <strong>Einträge im Änderungsprotokoll</strong> (was wann geändert wurde, mit gekürzter
            IP-Adresse) bleiben zur Nachvollziehbarkeit und Sicherheit erhalten – mit geschwärztem
            Namen – und werden nach der Frist deines Vereins gelöscht (Voreinstellung:{" "}
            {DEFAULT_RETENTION.auditMonths} Monate).
          </li>
          <li>
            <strong>Der Löschantrag selbst</strong> bleibt als Nachweis, dass und wann gelöscht
            wurde – ohne Namen und E-Mail-Adresse; einen freiwillig angegebenen Grund enthält er
            weiterhin.
          </li>
          <li>
            <strong>Datensicherungen:</strong> Kopien in den Sicherungen des Betreibers verschwinden
            erst, wenn die jeweilige Sicherung abläuft.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">6. Kein Zugang mehr zum Konto?</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Passwort vergessen:</strong> Über{" "}
            <Link href="/passwort-vergessen" className={linkClass}>
              Passwort vergessen
            </Link>{" "}
            bekommst du einen Link an deine E-Mail-Adresse, mit dem du ein neues Passwort festlegst.
            Danach löschst du dein Konto wie oben beschrieben.
          </li>
          <li>
            <strong>Anmeldung nicht möglich</strong> – etwa weil du keinen Zugriff mehr auf deine
            E-Mail-Adresse hast oder nach der Anmeldung „Kein aktiver Verein“ erscheint: Wende dich
            an den Vereinsadministrator oder den Ansprechpartner für Datenschutz deines Vereins.
            Dein Verein ist für deine Mitgliedsdaten verantwortlich; er kann dir den Zugang zum
            Verein entziehen und deine Mitgliedsdaten löschen (sie werden nach der Papierkorb-Frist
            des Vereins anonymisiert).
          </li>
          {supportEmail && (
            <li>
              <strong>Konto löschen lassen:</strong> Kann dein Verein nicht helfen, oder soll das
              Konto selbst gelöscht werden, schreibe an den technischen Support des Betreibers:{" "}
              <a href={`mailto:${supportEmail}`} className={`${linkClass} break-words`}>
                {supportEmail}
              </a>
              . Nenne dabei die E-Mail-Adresse deines Kontos und deinen Verein.
            </li>
          )}
        </ul>
      </section>
    </article>
  );
}
