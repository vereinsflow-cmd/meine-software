# App-Inhalte – Antwortentwürfe für die Play Console

Entwurf der Antworten für die Seite **Richtlinie und Programme → App-Inhalte** der Play Console (Stand: 30.09.2026). Jede Erklärung muss dort einmal abgeschlossen sein, sonst lässt Google die App nicht in die Produktion (der Reiter „Erfordert Aktion“ zeigt, was fehlt). Die Antworten stützen sich auf den Code und die Dokumentation ([README](../../README.md), [PRIVACY.md](../PRIVACY.md), [SECURITY.md](../SECURITY.md)); was nicht sicher ist, steht als **[unsicher]** dabei. Die Namen der Erklärungen folgen Googles deutscher Hilfe – sie ändern sich gelegentlich.

## Überblick

| Erklärung in der Konsole                                      | Antwort                                                                                           | Abschnitt                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Datenschutzerklärung                                          | Adresse eintragen – **Text noch nicht fertig**                                                    | [eintrag.md](eintrag.md#datenschutzerklärung--offener-punkt) |
| Anzeigen                                                      | **Keine Werbung**                                                                                 | [2](#2-anzeigen-werbung)                                     |
| App-Zugriff                                                   | Zugriff eingeschränkt: Demo-Zugänge, Text auf Englisch                                            | [1](#1-app-zugriff-app-access--text-auf-englisch)            |
| Zielgruppe und Inhalte                                        | 16–17 und 18+ (**Entscheidung des Inhabers**), kein Kinderangebot                                 | [3](#3-zielgruppe-und-inhalte)                               |
| Altersfreigaben                                               | Kategorie „Dienstprogramme, Produktivität, Kommunikation oder Sonstiges“; Nutzer interagieren: Ja | [4](#4-altersfreigabe-inhaltseinstufung)                     |
| Datensicherheit                                               | siehe eigenes Dokument                                                                            | [datensicherheit.md](datensicherheit.md)                     |
| Nachrichten-Apps (News)                                       | **Nein**                                                                                          | [6](#6-nachrichten-apps-news)                                |
| Behörden-Apps                                                 | **Nein**                                                                                          | [7](#7-behörden-apps)                                        |
| Finanzfunktionen                                              | **Keine Finanzfunktionen**                                                                        | [8](#8-finanzfunktionen)                                     |
| Gesundheit                                                    | **Keine Gesundheitsfunktionen**                                                                   | [9](#9-gesundheit)                                           |
| Kontaktverfolgung und COVID-19-Status                         | **Nein**                                                                                          | [10](#10-weitere-erklärungen)                                |
| Werbe-ID                                                      | **Nein**                                                                                          | [10](#10-weitere-erklärungen)                                |
| Formular zur Erklärung von Berechtigungen                     | nicht erforderlich                                                                                | [10](#10-weitere-erklärungen)                                |
| Nutzergenerierte Inhalte (Richtlinie, keine eigene Erklärung) | **Risiko – vor dem Produktionsantrag klären**                                                     | [5](#5-nutzergenerierte-inhalte-und-kinderschutz-richtlinie) |

## 1. App-Zugriff (App access) – Text auf Englisch

**Antwort:** sinngemäß „Alle oder einige Funktionen meiner App sind eingeschränkt“ → Anweisungen hinzufügen.

Google prüft die App mit den Zugängen, die du hier hinterlegst. Die Anweisungen müssen **auf Englisch** sein, **jederzeit gültig und wiederverwendbar** und **ohne Zwei-Faktor-Hürden** (E-Mail-/SMS-Codes, Einmalpasswörter) – läuft das Passwort ab oder gelingt die Anmeldung nicht, lehnt Google die App ab. Für VereinsFlow ist das leicht zu erfüllen: Es gibt keine Zwei-Faktor-Anmeldung, das Passwort läuft nie ab, Registrierung gibt es nicht (Konten entstehen nur durch Einladung eines Vereins).

Die Zugänge gehören zu einem **Demo-Verein**, den du auf dem Produktionsserver anlegst, sobald er online ist (Anleitung unten). Die Platzhalter in eckigen Klammern (`[…]`) ersetzt du dann durch die echten Werte.

### Zugang 1: Vorstandsmitglied (Hauptzugang)

Warum ein Vorstandsmitglied und nicht der Vereinsadministrator: Es sieht fast alles (Mitglieder, Veranstaltungen, Helferschichten, Aufgaben, Nachrichten, Dokumente), kann aber – anders als der letzte Administrator – sein Konto löschen (für den Löschweg wichtig), und es zeigt nicht die Platzhalterseite „Finanzen – in Vorbereitung“, die nur Administratoren im Menü haben.

| Feld in der Konsole        | Eintrag                                 |
| -------------------------- | --------------------------------------- |
| Name der Anweisung         | `Demo club – board member (main login)` |
| Nutzername / Telefonnummer | `[DEMO_BOARD_EMAIL]`                    |
| Passwort                   | `[DEMO_BOARD_PASSWORD]`                 |
| Weitere Angaben            | siehe Kasten                            |

```text
VereinsFlow is a closed club-management app: accounts only exist by invitation of a club, there is no public sign-up. The app opens https://app.vereins-flow.com (German user interface). On the login screen ("Anmelden") enter the e-mail address and password above and tap "Anmelden". No two-factor authentication, no e-mail/SMS code, no CAPTCHA; the login does not expire. Menu (top left): Dashboard and grouped sections such as Verein, Organisation, Kommunikation and Persönlich.
```

### Zugang 2: Mitglied (eingeschränkte Rolle)

| Feld in der Konsole        | Eintrag                                    |
| -------------------------- | ------------------------------------------ |
| Name der Anweisung         | `Demo club – member (reduced permissions)` |
| Nutzername / Telefonnummer | `[DEMO_MEMBER_EMAIL]`                      |
| Passwort                   | `[DEMO_MEMBER_PASSWORD]`                   |
| Weitere Angaben            | siehe Kasten                               |

```text
Same login screen. Regular member with reduced permissions (no member administration). Account deletion: menu > Persönlich > Datenschutz > "Konto und Daten löschen" > "Konto löschen ..."; the deletion is scheduled after a 14-day grace period and can be withdrawn. Web page for account deletion without the app: https://app.vereins-flow.com/konto-loeschen
```

Beide Kästen sind knapp gehalten (rund 400 Zeichen), weil die Konsole für „Weitere Angaben“ nur begrenzt Platz lässt – die Grenze dafür steht in Googles Hilfe nicht; kürze im Zweifel von hinten. Wenn Google nachfragt oder mehr Raum anbietet, passt diese ausführliche Fassung:

```text
VereinsFlow is a closed club-management platform (members, events, calendar, helper shifts, tasks, messages, documents). Accounts are created only by invitation of a club, so there is no public registration. For this review we prepared a demo club with fictional data and two demo accounts (board member, member).

How to sign in: open the app, enter the e-mail address and password from the fields above on the login screen ("Anmelden") and tap "Anmelden". There is no two-factor authentication, e-mail/SMS code or CAPTCHA, and the credentials do not expire. The service is reachable from any country.

Where to look (the interface is in German): open the menu with the three-line icon at the top left. "Verein" contains Mitglieder (members), Kalender (calendar), Veranstaltungen (events), Helferplanung (helper shifts: tap "Eintragen" to sign up for an open shift) and Abteilungen (departments). "Kommunikation" contains Nachrichten (group chats). "Persönlich" contains Mein Profil (push notifications can be switched on per device), Datenschutz (privacy: export your data, delete your account) and Hilfe & Support.

The app does not sell anything and shows no prices, no ads and no external content. Push notifications are optional and contain no names or message text. Contact: kontakt@vereins-flow.com
```

### Demo-Zugänge vorbereiten (nach dem Start des Servers)

Der Demo-Verein liegt auf dem **Produktionsserver** (`app.vereins-flow.com`), nicht in einer eigenen Umgebung – Google meldet sich dort an. `npm run db:seed` gibt es in der Produktion bewusst nicht; der Verein wird von Hand angelegt:

1. **Zwei Postfächer bzw. Weiterleitungen** bei IONOS anlegen, an denen du die Einladungen empfängst, z. B. `play-vorstand@vereins-flow.com` und `play-mitglied@vereins-flow.com` (Weiterleitung an `kontakt@vereins-flow.com` genügt). Die Einladung kommt **nur per E-Mail** (mit Link); ein Anzeigen oder Kopieren des Links in der Oberfläche gibt es nicht.
2. Als Plattform-Administrator (`admin:create`, siehe [OPERATIONS.md](../OPERATIONS.md#ersten-plattform-administrator-anlegen)) anmelden → „Systemadministration“ → Verein „Demo-Verein (Google Play Prüfung)“ anlegen (Vereinsname, Kürzel, E-Mail-Adresse des ersten Administrators) und dabei eine **eigene, dir gehörende Adresse** als ersten Vereinsadministrator einladen. Das ist dein Verwaltungszugang zum Demo-Verein; er kommt nicht in die Anweisungen für Google.
3. Als Vereinsadministrator: die beiden Demo-Zugänge einladen – Rolle **Vorstandsmitglied** bzw. **Mitglied** – und die Einladungen annehmen; Passwörter mit mindestens 10 Zeichen wählen (kein Namensbestandteil, nichts Häufiges).
4. **Ausschließlich erfundene Daten** anlegen – das ist das, was Google-Prüfer **und** die Tester im geschlossenen Test sehen: ein paar Mitglieder (die Vorlage `public/vorlagen/mitglieder-import-vorlage.csv` zeigt das Importformat), zwei bis drei Veranstaltungen mit Helferschichten, ein paar Aufgaben, eine Ankündigung im Chat „Alle Mitglieder“. Keine echten Personen, keine echten Vereine.
5. Beide Zugänge **selbst** auf einem Android-Handy in der App ausprobieren (Anmeldung, Helferplanung, Nachrichten, „Konto löschen …“ nur ansehen, nicht bestätigen).
6. Zugangsdaten im Passwortmanager sichern und **nie ändern oder löschen**, solange die App veröffentlicht ist: Google prüft bei späteren Versionen erneut mit denselben Zugängen. Der Demo-Verein darf nicht deaktiviert werden.
7. Keine Ländersperre, keine Firewall-Regel, die Verbindungen aus den USA oder Indien blockiert (dort sitzen Prüfer). Die Rate-Limits (8 Fehlversuche je Konto in 15 Minuten) sind für Prüfer kein Hindernis.
8. `SUPPORT_EMAIL` in der Produktion setzen (siehe [OPERATIONS.md](../OPERATIONS.md#app-ansicht-android-app-und-iphone)) – sonst fehlt auf der Seite „Konto löschen“ der Weg für Nutzer ohne Zugang.

Dieselben Zugänge kannst du den Testern im geschlossenen Test geben (siehe [README](README.md), Schritt 10) – ein gemeinsamer Mitglieds-Zugang erspart 15 bis 20 Einladungen.

## 2. Anzeigen (Werbung)

**Antwort:** „Nein, meine App enthält keine Werbung.“

Begründung: Es gibt weder Werbe-SDKs noch eingebettete Inhalte Dritter; die Content-Security-Policy erlaubt nur die eigene Adresse (`default-src 'self'`), und [PRIVACY.md](../PRIVACY.md#cookie-konzept) hält fest: „keine Analyse, keine Werbung, keine eingebetteten Inhalte“.

## 3. Zielgruppe und Inhalte

Google fragt, für welche Altersgruppen die App **gedacht** ist (nicht, wer sie tatsächlich benutzen könnte). Zur Auswahl stehen: **bis 5 Jahre, 6–8, 9–12, 13–15, 16–17, ab 18 Jahren**. Die Wahl entscheidet über zusätzliche Pflichten:

| Auswahl                                   | Folge                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **nur ab 18**                             | Einfachster Weg, passt zur Vereinsverwaltung. Aber: VereinsFlow kennt ein Mindestalter von 16 Jahren für Schichten („ab 16 Jahren“); Helfer von 16 und 17 Jahren sind vorgesehen, die Angabe „nur ab 18“ wäre ungenau.                                                                                                   |
| **16–17 und ab 18** (Empfehlung)          | Trifft die Wirklichkeit: Vorstand und Verwaltung sind Erwachsene, Helfer ab 16 sind möglich. Deckt sich mit dem Alter für die Einwilligung nach Art. 8 DSGVO (in Deutschland 16 Jahre). Die App ist **kein Kinderangebot** – die Familienrichtlinie von Google Play gilt nicht.                                          |
| **Unter 13 dabei** (bis 5, 6–8 oder 9–12) | Googles **Familienrichtlinie** gilt: u. a. Prüfung der Datenerhebung, nur zertifizierte Werbe-SDKs, bei gemischtem Publikum ein neutraler Altersabfrage-Bildschirm. Das passt nicht zu einer Vereinsverwaltung mit Konten und Nachrichten und ist mit dem heutigen Stand der App nicht zu erfüllen. **Nicht empfohlen.** |
| **13–15 dabei**                           | Bei 13–15 Jahren gilt die Familienrichtlinie nach dem bekannten Stand der Richtlinie nicht **[unsicher]**; Jugendliche unter 16 sind aber nach Art. 8 DSGVO ein Sonderfall (Einwilligung der Erziehungsberechtigten). Deshalb dieselbe Empfehlung: nicht auswählen.                                                      |

**Empfehlung: 16–17 und ab 18.** Das ist eine **Entscheidung des Inhabers** – rechtlich und für die Kundschaft (Jugendabteilungen): Kinder und Jugendliche unter 16 sind Vereinsmitglieder, brauchen für VereinsFlow aber kein eigenes Konto; ihre Daten pflegt der Verein, die Einwilligung der Erziehungsberechtigten holt der Verein ein ([PRIVACY.md](../PRIVACY.md#welche-daten-wozu)). Konten für unter 16-Jährige verhindert die App nicht technisch; das ist Sache des Vereins und gehört in die Datenschutzerklärung und die Vertragsunterlagen.

Weitere Fragen im Ablauf:

- **„Spricht die App Kinder an?“** – **Nein.** Keine kindliche Gestaltung, keine Figuren, keine Spiele: nüchterne Verwaltungsoberfläche.
- **Store-Eintrag:** Der Eintrag (Symbol, Grafiken, Text) darf ebenfalls nichts zeigen, was Kinder anspricht – die vorhandenen Grafiken tun das nicht.
- Bei Auswahl unter 13 fragt die Konsole zusätzlich nach der Familienrichtlinie und Werbe-SDKs – dieser Zweig entfällt mit der Empfehlung.

## 4. Altersfreigabe (Inhaltseinstufung)

Google lässt die App von der **IARC** (in Deutschland USK) einstufen; du beantwortest einen Fragebogen. Er verlangt eine E-Mail-Adresse (`kontakt@vereins-flow.com`) und die Wahl einer **Kategorie**:

**Kategorie: „Dienstprogramme, Produktivität, Kommunikation oder Sonstiges“** (englisch „Utility, Productivity, Communication, or Other“). Google nennt dort ausdrücklich Kommunikations-Apps wie E-Mail und Messenger als Beispiel; VereinsFlow ist Vereinsverwaltung mit Gruppenchat. Nicht „Soziale Netzwerke“ (Social Networking): VereinsFlow bringt keine Fremden zusammen.

| Themenbereich                                                    | Antwort                   | Begründung                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gewalt, Blut, Angst                                              | **Nein**                  | Nichts davon in der App.                                                                                                                                                                                                                                                                                                                                               |
| Sexuelle Inhalte, Nacktheit                                      | **Nein**                  | –                                                                                                                                                                                                                                                                                                                                                                      |
| Vulgäre oder anstößige Sprache                                   | **Nein**                  | Die App selbst enthält keine; Inhalte schreiben die Mitglieder (siehe nächste Zeile).                                                                                                                                                                                                                                                                                  |
| Drogen, Alkohol, Tabak (Darstellung, Werbung)                    | **Nein**                  | Die App zeigt und bewirbt nichts davon. (Ein Verein kann in einer Aufgabe „Getränke bestellen“ schreiben – das ist Vereinsalltag, keine Darstellung.)                                                                                                                                                                                                                  |
| Glücksspiel, Wetten                                              | **Nein**                  | –                                                                                                                                                                                                                                                                                                                                                                      |
| **Nutzer können miteinander interagieren / Inhalte austauschen** | **Ja**                    | Textnachrichten in Gruppenchats **innerhalb des eigenen Vereins**, Ankündigungen, Aufgaben- und Veranstaltungstexte, Dokumente-Upload mit Zugriffsstufen. **Nicht** öffentlich, keine Kontakte zu Fremden, kein Austausch von Bildern oder Videos im Chat; Moderation durch den Verein (Vorstand kann jede Nachricht zurückrufen, Verwaltung kann Mitglieder sperren). |
| Teilen des Standorts mit anderen                                 | **Nein**                  | Kein Standortzugriff.                                                                                                                                                                                                                                                                                                                                                  |
| Teilen persönlicher Angaben mit anderen Nutzern                  | **Ja** (falls so gefragt) | Mitglieder desselben Vereins sehen Namen im Chat; berechtigte Rollen sehen Kontaktdaten von Mitgliedern (Rechte mit Reichweite Verein/Abteilung/nur eigene Daten). Außerhalb des Vereins wird nichts an Dritte weitergegeben ([datensicherheit.md](datensicherheit.md)).                                                                                               |
| Weitergabe persönlicher Daten an Dritte                          | **Nein**                  | Keine Analyse- oder Werbedienste; Hosting und E-Mail sind Auftragsverarbeiter.                                                                                                                                                                                                                                                                                         |
| Kauf digitaler Güter / Käufe in der App                          | **Nein**                  | Keine Preise, keine Kauflinks, kein Play Billing.                                                                                                                                                                                                                                                                                                                      |
| Uneingeschränkter Zugang zum Internet (Browser, Suche)           | **Nein**                  | Die App öffnet nur die eigene Adresse; Nachrichten sind reiner Text ohne automatische Links.                                                                                                                                                                                                                                                                           |

**Zu erwarten:** Freigabe für alle Altersgruppen (USK 0 bzw. PEGI 3) mit dem Hinweis „Nutzer interagieren“ – die endgültige Einstufung legt die IARC fest, das Ergebnis siehst du sofort und kannst es kontrollieren. Ändert sich etwas am Inhalt (etwa Bilder im Chat), muss der Fragebogen neu beantwortet werden.

## 5. Nutzergenerierte Inhalte und Kinderschutz-Richtlinie

**Kein Formular, aber ein Prüfpunkt, an dem eine Einreichung hängen bleiben kann.** Nachrichten, Aufgabentexte, Notizen und Dokumente, die Mitglieder schreiben und andere sehen, sind für Google „nutzergenerierte Inhalte“ (UGC). Die Richtlinie dazu verlangt, dass eine App

1. Nutzer **Nutzungsbedingungen oder Nutzungsregeln** akzeptieren lässt, bevor sie Inhalte erstellen,
2. **unzulässige Inhalte und Verhaltensweisen** darin definiert,
3. Inhalte **angemessen moderiert**, und
4. eine **Meldefunktion** in der App bietet – bei geschlossenen Gruppen (Google nennt Schule oder Unternehmen) genügt das Melden, ein Blockieren ist dort nicht verlangt.

**Was VereinsFlow bietet:** geschlossene Gruppen je Verein; Moderation durch den Verein (der Vorstand kann jede Nachricht zurückrufen, die Verwaltung Mitglieder sperren); „Hilfe & Support → Problem melden“ (Meldung an die Vereinsverwaltung, mit Antwort und Status) und ein Ansprechpartner je Verein.

**Was fehlt (Stand des Codes):**

- **Keine Nutzungsbedingungen / Nutzungsregeln.** Bei der Annahme einer Einladung bestätigt man nur, die Datenschutzerklärung zur Kenntnis genommen zu haben (`acceptTerms`, `TERMS_VERSION`). Unzulässige Inhalte sind nirgends definiert.
- **Keine Schaltfläche „Nachricht melden“** an der einzelnen Nachricht; „Problem melden“ ist eine allgemeine Meldung an den Verein, nicht an den Betreiber.

**Einschätzung:** Ob Google das für einen Vereins-Chat verlangt, ist **nicht sicher [unsicher]** – die App richtet sich an geschlossene Gruppen mit bekannten Personen, was die Richtlinie erleichtert. Ein Ablehnungsgrund kann es trotzdem werden, gerade mit einem Nachrichten-Modul und Jugendlichen ab 16 in der Zielgruppe.

**Empfehlung vor dem Produktionsantrag (Entscheidung und Umsetzung beim Inhaber; hier wurde am Code nichts geändert):**

1. Kurze **Nutzungsregeln** verfassen (Verbot von Beleidigung, Belästigung, rechtswidrigen und jugendgefährdenden Inhalten sowie von sexueller Ausbeutung oder Missbrauch von Kindern, Hinweis auf Moderation durch den Verein), öffentlich unter einer festen Adresse ablegen und bei der Einladung mit einem Häkchen bestätigen lassen (heute nur „Datenschutzerklärung zur Kenntnis genommen“).
2. Den Weg zum Melden klar machen: entweder „Nachricht melden“ an der Nachricht oder zumindest ein deutlicher Hinweis im Chat und in „Hilfe & Support“, an wen sich Betroffene wenden; dazu eine Kontaktadresse des Betreibers (`SUPPORT_EMAIL`) für Meldungen, die der Verein nicht klärt.
3. Kategorie im Store „Geschäftlich“ lassen: Für Apps in den Kategorien **Soziale Netzwerke** oder **Dating** (und für anonyme Zufalls-Chats) verlangt Google die **Kinderschutzstandards** (veröffentlichte Regeln gegen sexuelle Ausbeutung von Kindern, Meldefunktion, ein benannter Ansprechpartner) und eine Selbstbescheinigung in der Konsole. Für VereinsFlow gilt das nicht; die Nutzungsregeln oben decken den Inhalt trotzdem ab.

## 6. Nachrichten-Apps (News)

**Antwort: Nein.** Verwechslungsgefahr: Die Erklärung „Nachrichten-Apps“ meint **News-Apps** (Nachrichtenmedien). Das Modul „Nachrichten“ in VereinsFlow ist der vereinsinterne Chat, keine Berichterstattung. Ohne Kontext nicht „Ja“ ankreuzen – daran hängen zusätzliche Anforderungen an Redaktion und Impressum.

## 7. Behörden-Apps

**Antwort: Nein.** VereinsFlow wird nicht von einer Behörde oder in ihrem Auftrag entwickelt; Vereine sind Körperschaften des privaten Rechts (auch Vereine, die eng mit Kommunen zusammenarbeiten, sind keine Behörde).

## 8. Finanzfunktionen

**Antwort: „Meine App bietet keine Finanzfunktionen.“**

Googles Liste umfasst Bank- und Kreditprodukte, mobiles Bezahlen und digitale Geldbörsen, Geldtransfers, Ratenkauf, Kryptowährungen, Aktienhandel und Vermögensverwaltung, Crowdfunding, Bonitätsprüfung, Finanzberatung und Versicherungen. **Nichts davon gibt es in VereinsFlow.** Geprüft im Code:

- **Keine Zahlungsabwicklung.** Kein Zahlungsdienstleister, kein Bankzugang, kein Karten- oder SEPA-Code – in `package.json` gibt es weder Stripe noch PayPal, Mollie, Adyen oder Ähnliches.
- **Rechnungen** (`src/modules/finance`, `docs/DESIGN.md`, „Rechnungen und offene Zahlungen“) sind **Belege des Vereins**, die man als Dokument hochlädt: Datei, Betrag, Fälligkeit und ein von Hand gesetzter Vermerk „bezahlt“ (grüner Knopf) – sichtbar nur mit den Rechten `finance:read`/`finance:manage`. Das ist eine Ablage mit Erinnerungsfunktion, kein Zahlungsvorgang: Bezahlt wird außerhalb der App.
- **Die Seite „Finanzen“** (nur für den Vereinsadministrator im Menü) ist ein **Platzhalter** mit dem Vermerk „In Vorbereitung“ und ohne Funktion (`src/app/(app)/finanzen/page.tsx`).
- **Keine Käufe in der App.** Weder Play Billing noch Preise oder Kauflinks – VereinsFlow verkauft als Vertrag mit dem Verein außerhalb der App (siehe [OPERATIONS.md](../OPERATIONS.md#app-ansicht-android-app-und-iphone), „Keine Preise und Kauflinks in der App“).

**Wann neu bewerten:** sobald Beiträge, Zahlungseingang oder eine SEPA-Lastschriftdatei gebaut werden ([ROADMAP.md](../ROADMAP.md#finanzen--entwurf)). Wer nur Beiträge verwaltet, ohne Geld zu bewegen, ist voraussichtlich weiterhin keine „Finanzfunktion“ – das ist mit der dann aktuellen Liste zu prüfen. Für bestimmte Finanzprodukte (Bank, Kredit, Aktienhandel, Fonds, Krypto-Wallets und -Börsen) verlangt Google ein **Organisationskonto** – ein Personenkonto genügt dafür nicht; Vereinsbeiträge fallen nach heutigem Stand nicht darunter, aber das ist dann neu zu bewerten.

## 9. Gesundheit

**Antwort: „Meine App hat keine Gesundheitsfunktionen.“** Keine Gesundheits- oder Fitnessdaten, keine Health-Connect-Anbindung, keine medizinischen Angaben; Trainingstermine einer Sportabteilung sind Veranstaltungen, keine Gesundheitsfunktion. (Für Medizin- und Studien-Apps verlangt Google ein Organisationskonto – hier nicht relevant.)

## 10. Weitere Erklärungen

| Erklärung                                      | Antwort                                                            | Begründung                                                                                                                                                                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apps zur Kontaktaufzeichnung / COVID-19-Status | **Nein**                                                           | Keine solche Funktion.                                                                                                                                                                                                                                              |
| Werbe-ID (Advertising ID)                      | **Nein**, die App verwendet sie nicht                              | Pflichtangabe bei Ziel-Android 13 und höher (hier Ziel-API 36). Im zusammengeführten Manifest des Release-Builds steht keine `AD_ID`-Berechtigung, es gibt keine Werbe- oder Analyse-SDKs (geprüft in `android/app/build/intermediates/merged_manifests/release/`). |
| Formular zur Erklärung von Berechtigungen      | nicht erforderlich                                                 | Einzige Berechtigung ist `POST_NOTIFICATIONS` (Benachrichtigungen ab Android 13; die Abfrage erscheint erst, wenn jemand Push im Profil einschaltet). Keine sensiblen Berechtigungen (SMS, Anrufliste, Hintergrund-Standort, Foto-Mediathek, alle Dateien).         |
| Datensicherheit                                | siehe [datensicherheit.md](datensicherheit.md)                     | –                                                                                                                                                                                                                                                                   |
| Datenschutzerklärung                           | siehe [eintrag.md](eintrag.md#datenschutzerklärung--offener-punkt) | **Noch offen.**                                                                                                                                                                                                                                                     |
| US-Exportgesetze (beim Anlegen / Einreichen)   | bestätigen                                                         | Die App nutzt nur Standard-Verschlüsselung über HTTPS (TLS des Browsers).                                                                                                                                                                                           |
| Preis                                          | **Kostenlos**                                                      | Beim Anlegen festlegen: Eine kostenlose App lässt sich später **nicht** in eine kostenpflichtige umwandeln – für VereinsFlow gewollt (Vertrag außerhalb der App).                                                                                                   |

## Wann die Erklärungen neu geprüft werden müssen

Google verlangt aktuelle Angaben; **nach jeder Funktion, die eine Antwort ändert**, alles noch einmal durchgehen. Für VereinsFlow bedeutet das vor allem: Bilder oder Dateien im Chat (Altersfreigabe, Datensicherheit), Zwei-Faktor-Anmeldung (App-Zugriff: Prüfer brauchen dann einen Zugang ohne zweiten Faktor), Zahlungen oder Beiträge (Finanzfunktionen, Datensicherheit, evtl. Play Billing), Werbe-, Analyse- oder Absturz-SDKs, eine öffentliche Veranstaltungsseite und jede native Oberfläche.
